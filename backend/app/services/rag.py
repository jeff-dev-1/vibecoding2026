"""RAG pipeline — 混合上下文版。

上下文 = STRUCTURED ANALYSIS (权威聚合) + RAW LOG EXCERPTS (RAG 检索原始行)。
聚合类问题从结构化答(准), 细节举证走 RAG。缺数据明说不编。
"""
from __future__ import annotations

import json
import time
from collections import Counter
from dataclasses import dataclass
from typing import Literal
from uuid import UUID

from sqlalchemy import text

from ..db import SessionLocal
from ..gateway.client import chat
from ..prompts import DEFAULT_FAMILY, answer_language_directive, system_prompt
from ..schemas import ParsedLogEntry
from .embedding import embed
from .log_parser import dominant_family
from .vector_store import StoredChunk, search

# 没数据时的兜底文案。这句不经过模型, 所以要自己按语言给 —— 否则界面切成 English 之后
# 这里会是唯一一句突然变中文的话。
_NO_DATA = {
    "zh-Hans": "尚未上传日志或分析未完成。请先上传日志文件并等分析完成。",
    "zh-Hant": "尚未上傳日誌或分析未完成。請先上傳日誌檔案並等分析完成。",
    "en": (
        "No log has been uploaded yet, or the analysis has not finished. "
        "Upload a log file and wait for the analysis to complete."
    ),
}


@dataclass
class RagResult:
    answer: str
    chunks: list[StoredChunk]
    model: str
    # 链路计时与用量 —— 给前端的"请求链路回放"用。
    # 这些是真的量出来的, 不是为了动画凑的数; 没走到的那一跳留 0/None, 前端照实显示。
    retrieval_ms: int = 0
    llm_ms: int = 0
    prompt_tokens: int = 0
    completion_tokens: int = 0
    gateway_url: str = ""
    routing_header: str = ""
    structured_used: bool = False
    provider: str = "envoy"
    trace_id: str = ""


async def _load_structured(log_id: UUID | None) -> tuple[str, str]:
    """取该 log 最近 done 的分析, 拼成权威上下文文本, 并判定日志族。

    族和上下文一起返回, 因为两者来自同一批 sample_entries —— 分成两次查库
    只会多一次往返, 还可能读到不同的 job。
    """
    if not log_id:
        return "", DEFAULT_FAMILY
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
        return "", DEFAULT_FAMILY

    parts: list[str] = []
    family: str = DEFAULT_FAMILY

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
        family = dominant_family(entries)
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
        return "", family
    return "STRUCTURED ANALYSIS (authoritative aggregates):\n" + "\n".join(parts), family


def _compose(
    question: str, structured: str, chunks: list[StoredChunk], lang: str, family: str
) -> list[dict[str, str]]:
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
    # 语言指令跟在 system prompt 后面, 而不是塞进提示词资产里 ——
    # 资产只有一份, 语言是每次请求带的。
    return [
        {
            "role": "system",
            "content": system_prompt(family) + "\n- " + answer_language_directive(lang),
        },
        {"role": "user", "content": user},
    ]


async def answer(
    question: str,
    *,
    top_k: int,
    log_id: UUID | None = None,
    backend: Literal["deepseek", "qwen"] = "deepseek",
    lang: str = "zh-Hans",
    provider: str | None = None,
) -> RagResult:
    t0 = time.monotonic()
    structured, family = await _load_structured(log_id)
    q_vec = embed([question])[0]
    chunks = await search(q_vec, top_k=top_k, log_id=log_id)
    retrieval_ms = int((time.monotonic() - t0) * 1000)

    if not chunks and not structured:
        return RagResult(
            answer=_NO_DATA.get(lang, _NO_DATA["zh-Hans"]),
            chunks=[],
            model="none",
            retrieval_ms=retrieval_ms,
        )
    messages = _compose(question, structured, chunks, lang, family)
    res = await chat(messages, backend=backend, provider=provider)
    return RagResult(
        answer=res.text,
        chunks=chunks,
        model=res.model,
        retrieval_ms=retrieval_ms,
        llm_ms=res.latency_ms,
        prompt_tokens=res.prompt_tokens,
        completion_tokens=res.completion_tokens,
        gateway_url=res.gateway_url,
        routing_header=res.routing_header,
        structured_used=bool(structured),
        provider=res.provider,
        trace_id=res.trace_id,
    )
