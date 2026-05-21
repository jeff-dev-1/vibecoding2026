"""RAG pipeline — 混合上下文版。

上下文 = STRUCTURED ANALYSIS (权威聚合) + RAW LOG EXCERPTS (RAG 检索原始行)。
聚合类问题从结构化答(准), 细节举证走 RAG。缺数据明说不编。
"""
from __future__ import annotations

import json
from collections import Counter
from dataclasses import dataclass
from typing import Literal
from uuid import UUID

from sqlalchemy import text

from ..db import SessionLocal
from ..gateway.client import chat
from ..prompts import RAG_SYSTEM_PROMPT as SYSTEM_PROMPT
from ..schemas import ParsedLogEntry
from .embedding import embed
from .vector_store import StoredChunk, search


@dataclass
class RagResult:
    answer: str
    chunks: list[StoredChunk]
    model: str


async def _load_structured(log_id: UUID | None) -> str:
    """取该 log 最近 done 的分析 + 从 entries 算 TOP IP, 拼成权威上下文文本。"""
    if not log_id:
        return ""
    async with SessionLocal() as s:
        row = (
            await s.execute(
                text(
                    "SELECT evidence::text AS ev, sample_entries::text AS se "
                    "FROM analysis_jobs "
                    "WHERE log_id=:lid AND status='done' "
                    "ORDER BY finished_at DESC NULLS LAST LIMIT 1"
                ),
                {"lid": str(log_id)},
            )
        ).one_or_none()
    if not row:
        return ""

    parts: list[str] = []

    # analysis (summary / events / traffic_patterns)
    ev = json.loads(row.ev) if row.ev else {}
    analysis = ev.get("analysis") if isinstance(ev, dict) else None
    if analysis:
        parts.append(f"Summary: {analysis.get('summary', '')}")
        parts.append(
            f"Highest severity: {analysis.get('highest_severity')} | "
            f"requires_immediate_attention: {analysis.get('requires_immediate_attention')}"
        )
        t = analysis.get("traffic") or {}
        parts.append(
            f"Traffic stat: total={t.get('total_requests')} "
            f"4xx={t.get('error_4xx')} 5xx={t.get('error_5xx')} "
            f"unique_ips={t.get('unique_client_ips')}"
        )
        tps = analysis.get("traffic_patterns") or []
        if tps:
            lines = [
                f"  {p['method']} {p['url_path']} hits={p['hits']} status={p['status_codes']}"
                for p in tps[:15]
            ]
            parts.append("Traffic patterns (path|method|hits|status):\n" + "\n".join(lines))
        evs = analysis.get("events") or []
        if evs:
            lines = [
                f"  [{e['severity']}] {e['event_type']}: {e['title']} "
                f"(ips={e.get('source_ips', [])[:5]}, attacks={e.get('possible_attacks', [])})"
                for e in evs
            ]
            parts.append("Detected events:\n" + "\n".join(lines))

    # 从 entries 算 TOP IP / TOP UA (LLM 数不准, 代码数)
    if row.se:
        entries = [ParsedLogEntry.model_validate(e) for e in json.loads(row.se)]
        ip_counter: Counter[str] = Counter()
        ip_4xx: Counter[str] = Counter()
        ua_counter: Counter[str] = Counter()
        for e in entries:
            if e.client_ip:
                ip_counter[e.client_ip] += 1
                if e.status and 400 <= e.status < 600:
                    ip_4xx[e.client_ip] += 1
            if e.user_agent:
                ua_counter[e.user_agent] += 1
        top_ips = ", ".join(f"{ip}({n})" for ip, n in ip_counter.most_common(10))
        top_err_ips = ", ".join(f"{ip}({n})" for ip, n in ip_4xx.most_common(10))
        top_uas = "; ".join(f"{ua[:60]}({n})" for ua, n in ua_counter.most_common(5))
        parts.append(f"TOP source IPs by requests: {top_ips}")
        parts.append(f"TOP IPs by 4xx/5xx (扫描/错误嫌疑): {top_err_ips}")
        parts.append(f"TOP user agents: {top_uas}")

    if not parts:
        return ""
    return "STRUCTURED ANALYSIS (authoritative aggregates):\n" + "\n".join(parts)


def _compose(question: str, structured: str, chunks: list[StoredChunk]) -> list[dict[str, str]]:
    ctx_lines = [
        f"[chunk_idx={c.chunk_idx} lines={c.line_start}-{c.line_end} score={c.score:.2f}]\n{c.text}"
        for c in chunks
    ]
    user = ""
    if structured:
        user += structured + "\n\n"
    user += "RAW LOG EXCERPTS (举证用):\n" + "\n---\n".join(ctx_lines)
    user += f"\n\nQUESTION: {question}\n"
    user += (
        "聚合类问题从 STRUCTURED ANALYSIS 取数; 具体某条记录从 RAW LOG EXCERPTS 引用 [chunk_idx=N]; "
        "若数据不含该信息直接说明, 不要编。"
    )
    return [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": user},
    ]


async def answer(
    question: str,
    *,
    top_k: int,
    log_id: UUID | None = None,
    backend: Literal["deepseek", "qwen"] = "deepseek",
) -> RagResult:
    structured = await _load_structured(log_id)
    q_vec = embed([question])[0]
    chunks = await search(q_vec, top_k=top_k, log_id=log_id)

    if not chunks and not structured:
        return RagResult(
            answer="尚未上传日志或分析未完成。请先上传 Nginx access log 并等分析完成。",
            chunks=[],
            model="none",
        )
    messages = _compose(question, structured, chunks)
    res = await chat(messages, backend=backend)
    return RagResult(answer=res.text, chunks=chunks, model=res.model)
