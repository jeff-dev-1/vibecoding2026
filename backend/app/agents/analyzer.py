"""Anomaly analyzer — structured generation 版。

LLM 必须返回 schema-locked LogAnalysis (Pydantic 校验)。失败有兜底。
默认走 DeepSeek; 也可强制走 Qwen (env LLM_BACKEND=qwen)。

对应 dottxt-ai STRESSED 的核心思想: 不解析自由文本,合同约束输出。
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
from ..schemas import LogAnalysis, TrafficStat
from ..services.embedding import embed
from ..services.vector_store import StoredChunk, search


SYSTEM_PROMPT = """You are a security log analysis engine. Return ONLY a JSON object matching:

{
  "summary": "1-3 sentence plain-language overview (Chinese ok)",
  "events": [
    {
      "severity": "critical|high|medium|low|info",
      "category": "scan|brute_force|injection_attempt|5xx_spike|4xx_anomaly|rate_anomaly|data_exfiltration|auth_failure|unknown",
      "title": "<=120 char title",
      "description": "why this event was flagged, <=600 chars",
      "evidence_chunks": [<chunk_idx int>, ...],
      "source_ips": ["x.x.x.x", ...],
      "affected_paths": ["/some/path", ...],
      "confidence": 0.0-1.0
    }
  ],
  "traffic": {
    "total_requests": <int>,
    "error_4xx": <int>,
    "error_5xx": <int>,
    "unique_client_ips": <int>,
    "top_paths": ["...", ...]
  }
}

Rules:
- Use ONLY data from the LOG CHUNKS below.
- Up to 5 events. confidence >= 0.7 for events you list.
- evidence_chunks must reference a chunk_idx provided.
- No prose outside the JSON. No code fences.
"""


async def analyze(log_id: UUID, job_id: UUID) -> None:
    await _set_status(job_id, "running")
    try:
        # diverse retrieval
        seeds = [
            "error 5xx anomaly spike",
            "suspicious scanning brute force",
            "exception traceback failure",
        ]
        candidates: dict[UUID, StoredChunk] = {}
        for seed in seeds:
            for c in await search(embed([seed])[0], top_k=4, log_id=log_id):
                candidates[c.id] = c

        chunks = list(candidates.values())[:10]
        if not chunks:
            await _finish(job_id, summary="No chunks indexed.", evidence=[], analysis=None)
            return

        body = "\n---\n".join(
            f"[chunk_idx={c.chunk_idx} lines={c.line_start}-{c.line_end}]\n{c.text}"
            for c in chunks
        )

        try:
            analysis, result = await chat_structured(
                [
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": "LOG CHUNKS:\n" + body},
                ],
                LogAnalysis,
                backend=settings.default_backend,
            )
            analysis.model = result.model
        except GatewayError as e:
            # Schema 校验失败兜底: 用 summary 兜一份空 events
            analysis = LogAnalysis(
                summary=f"[Structured parse failed, raw text not stored. {e.body[:200]}]",
                events=[],
                traffic=TrafficStat(total_requests=len(chunks) * 10),
                model="parse-failed",
            )

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
        await _finish(job_id, summary=analysis.summary, evidence=evidence, analysis=analysis)

    except GatewayError as e:
        await _fail(job_id, f"gateway error {e.status}: {e.body[:200]}")
    except Exception as e:
        await _fail(job_id, repr(e))


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
