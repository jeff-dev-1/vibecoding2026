"""Anomaly analyzer — structured generation, STRESSED 5 段结构。

LLM 负责判断: summary / highest_severity / requires_immediate_attention /
              key_observations / events (含 related_log_entries)
后端确定性算: traffic + traffic_patterns (services/traffic.py)

对应 dottxt-ai STRESSED: 合同约束输出, 不解析自由文本。
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from sqlalchemy import text

from ..config import settings
from ..db import SessionLocal
from ..gateway.client import GatewayError, chat_structured
from ..schemas import LogAnalysis, ParsedLogEntry, TrafficStat
from ..services.embedding import embed
from ..services.log_parser import split
from ..services.traffic import aggregate
from ..services.vector_store import StoredChunk, insert_chunks, search

from pydantic import BaseModel, Field
from typing import Literal


# LLM 只返回这部分 (traffic 由后端补) — 单独 schema 防止 LLM 瞎编流量数字
Severity = Literal["critical", "high", "medium", "low", "info"]


class _EventLLM(BaseModel):
    event_type: str
    severity: Severity
    category: str
    title: str
    description: str
    confidence: float
    source_ips: list[str] = Field(default_factory=list)
    url_pattern: str | None = None
    possible_attacks: list[str] = Field(default_factory=list)
    evidence_chunks: list[int] = Field(default_factory=list)
    related_log_entries: list[str] = Field(default_factory=list)
    affected_paths: list[str] = Field(default_factory=list)


class _AnalysisLLM(BaseModel):
    summary: str
    highest_severity: Severity = "info"
    requires_immediate_attention: bool = False
    key_observations: list[str] = Field(default_factory=list)
    events: list[_EventLLM] = Field(default_factory=list)


SYSTEM_PROMPT = """You are a server log analysis engine (STRESSED-style).
The log may be: ACCESS log (nginx/apache combined), Apache ERROR log, or Linux syslog.
Adapt:
- access log: focus on status codes, scanning, suspicious paths/UAs.
- apache error log: forbidden-dir / file-not-exist probes, module failures, [client] IPs.
- linux syslog: SSH brute force (repeated authentication failure from rhost IPs),
  invalid users, privilege escalation (su/sudo), service anomalies.
Return ONLY a JSON object:

{
  "summary": "2-4 sentence plain-language overview (Chinese ok)",
  "highest_severity": "critical|high|medium|low|info",
  "requires_immediate_attention": true|false,
  "key_observations": ["short bullet", ...],   // 3-6 条
  "events": [
    {
      "event_type": "e.g. Suspicious HTTP Method / Directory Scan / 5xx Spike",
      "severity": "critical|high|medium|low|info",
      "category": "scan|brute_force|injection_attempt|5xx_spike|4xx_anomaly|rate_anomaly|data_exfiltration|auth_failure|unknown",
      "title": "<=120 char",
      "description": "why flagged, <=600 chars",
      "confidence": 0.0-1.0,
      "source_ips": ["x.x.x.x"],
      "url_pattern": "the URL/path pattern involved or null",
      "possible_attacks": ["e.g. SQLi","XSS","Path Enumeration","SSRF","Unknown"],
      "evidence_chunks": [<chunk_idx int provided below>],
      "related_log_entries": ["<paste 1-3 actual raw log lines from the chunks>"],
      "affected_paths": ["/some/path"]
    }
  ]
}

Rules:
- Use ONLY data from the LOG CHUNKS below.
- key_observations: 3-6 short factual bullets (Chinese).
- Up to 5 events, confidence >= 0.6.
- related_log_entries MUST be verbatim lines copied from the chunks.
- Do NOT include traffic statistics (computed separately).
- No prose outside JSON. No code fences.
"""


async def index_and_analyze(log_id: UUID, job_id: UUID, raw: str) -> None:
    """后台任务: 切块 + embedding + 批量入库, 然后跑分析。

    从 upload 请求路径挪到这里 — upload 秒返回, 重活异步做。
    """
    await _set_status(job_id, "running")
    try:
        chunks = split(raw)
        vecs = embed([c.text for c in chunks])
        await insert_chunks(log_id, chunks, vecs)
    except Exception as e:
        await _fail(job_id, f"indexing failed: {e!r}")
        return
    await analyze(log_id, job_id)


async def analyze(log_id: UUID, job_id: UUID) -> None:
    await _set_status(job_id, "running")
    try:
        # 1. 取 parsed entries 算确定性流量
        entries = await _load_entries(job_id)
        stat, patterns = aggregate(entries)

        # 2. RAG 取 chunks 给 LLM 判断
        seeds = [
            "error 5xx anomaly spike",
            "suspicious scanning brute force enumeration",
            "injection attempt unusual http method",
        ]
        candidates: dict[UUID, StoredChunk] = {}
        for seed in seeds:
            for c in await search(embed([seed])[0], top_k=4, log_id=log_id):
                candidates[c.id] = c
        chunks = list(candidates.values())[:10]

        evidence = [
            {
                "chunk_id": str(c.id),
                "chunk_idx": c.chunk_idx,
                "line_start": c.line_start,
                "line_end": c.line_end,
                "excerpt": c.text[:300],
            }
            for c in chunks
        ]

        if not chunks:
            analysis = LogAnalysis(
                summary="日志已解析,但未检索到可分析的内容块。",
                traffic=stat,
                traffic_patterns=patterns,
                model="none",
            )
            await _finish(job_id, summary=analysis.summary, evidence=[], analysis=analysis)
            return

        body = "\n---\n".join(
            f"[chunk_idx={c.chunk_idx} lines={c.line_start}-{c.line_end}]\n{c.text}"
            for c in chunks
        )

        try:
            llm, result = await chat_structured(
                [
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": "LOG CHUNKS:\n" + body},
                ],
                _AnalysisLLM,
                backend=settings.default_backend,
            )
            # LLM 可能返回超长列表 (几百个 IP), 截断到 schema 上限
            events = []
            for e in llm.events:
                d = e.model_dump()
                d["source_ips"] = d.get("source_ips", [])[:20]
                d["affected_paths"] = d.get("affected_paths", [])[:20]
                d["possible_attacks"] = d.get("possible_attacks", [])[:10]
                d["related_log_entries"] = d.get("related_log_entries", [])[:10]
                d["key_observations"] = d.get("key_observations", [])
                events.append(d)
            analysis = LogAnalysis(
                summary=llm.summary,
                highest_severity=llm.highest_severity,
                requires_immediate_attention=llm.requires_immediate_attention,
                key_observations=llm.key_observations[:12],
                events=events,  # type: ignore[arg-type]
                traffic=stat,
                traffic_patterns=patterns,
                model=result.model,
            )
        except GatewayError as e:
            analysis = LogAnalysis(
                summary=f"[结构化解析失败: {e.body[:160]}]",
                traffic=stat,
                traffic_patterns=patterns,
                model="parse-failed",
            )

        await _finish(job_id, summary=analysis.summary, evidence=evidence, analysis=analysis)

    except GatewayError as e:
        await _fail(job_id, f"gateway error {e.status}: {e.body[:200]}")
    except Exception as e:
        await _fail(job_id, repr(e))


async def _load_entries(job_id: UUID) -> list[ParsedLogEntry]:
    async with SessionLocal() as s:
        row = (
            await s.execute(
                text("SELECT sample_entries::text AS se FROM analysis_jobs WHERE id=:id"),
                {"id": str(job_id)},
            )
        ).one_or_none()
    if not row or not row.se:
        return []
    raw = json.loads(row.se)
    return [ParsedLogEntry.model_validate(e) for e in raw]


async def _set_status(job_id: UUID, status: str) -> None:
    async with SessionLocal() as s:
        await s.execute(
            text("UPDATE analysis_jobs SET status=:s WHERE id=:id"),
            {"s": status, "id": str(job_id)},
        )
        await s.commit()


async def _finish(
    job_id: UUID, summary: str, evidence: list[dict], analysis: LogAnalysis | None
) -> None:
    payload: dict[str, Any] = {"evidence": evidence}
    if analysis:
        payload["analysis"] = analysis.model_dump(mode="json")
    async with SessionLocal() as s:
        await s.execute(
            text(
                "UPDATE analysis_jobs SET status='done', summary=:sm, "
                "evidence=CAST(:ev AS jsonb), finished_at=:t WHERE id=:id"
            ),
            {
                "sm": summary,
                "ev": json.dumps(payload),
                "t": datetime.now(timezone.utc),
                "id": str(job_id),
            },
        )
        await s.commit()


async def _fail(job_id: UUID, err: str) -> None:
    async with SessionLocal() as s:
        await s.execute(
            text(
                "UPDATE analysis_jobs SET status='failed', error=:e, "
                "finished_at=:t WHERE id=:id"
            ),
            {"e": err, "t": datetime.now(timezone.utc), "id": str(job_id)},
        )
        await s.commit()
