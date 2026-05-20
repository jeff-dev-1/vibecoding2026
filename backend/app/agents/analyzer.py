"""Anomaly summarization agent.

Run async after upload. Picks top chunks (no question, just diversity), composes
a 'find anomalies' prompt, and persists summary + evidence to analysis_jobs.
"""
from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import text

from ..db import SessionLocal
from ..gateway.client import GatewayError, chat
from ..services.embedding import embed
from ..services.vector_store import StoredChunk, search


PROMPT = """Given these log chunks, identify up to 5 anomalies (errors, spikes,
suspicious patterns). For each anomaly, cite chunk_idx in square brackets like
[chunk_idx=12]. Output evidence as a list."""


async def analyze(log_id: UUID, job_id: UUID) -> None:
    await _set_status(job_id, "running")
    try:
        # diverse retrieval — query with multiple seeds
        seeds = ["error 5xx anomaly spike", "suspicious request pattern", "exception traceback"]
        candidates: dict[UUID, StoredChunk] = {}
        for seed in seeds:
            for c in await search(embed([seed])[0], top_k=4, log_id=log_id):
                candidates[c.id] = c

        chunks = list(candidates.values())[:10]
        if not chunks:
            await _finish(job_id, summary="No chunks indexed.", evidence=[])
            return

        body = "\n---\n".join(
            f"[chunk_idx={c.chunk_idx} lines={c.line_start}-{c.line_end}]\n{c.text}"
            for c in chunks
        )
        res = await chat(
            [
                {"role": "system", "content": "You are a log anomaly analyst."},
                {"role": "user", "content": PROMPT + "\n\nLOG CHUNKS:\n" + body},
            ]
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
        await _finish(job_id, summary=res.text, evidence=evidence)

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


async def _finish(job_id: UUID, summary: str, evidence: list[dict]) -> None:
    import json
    async with SessionLocal() as s:
        await s.execute(
            text(
                "UPDATE analysis_jobs SET status='done', summary=:sm, "
                "evidence=CAST(:ev AS jsonb), finished_at=:t WHERE id=:id"
            ),
            {
                "sm": summary,
                "ev": json.dumps(evidence),
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
