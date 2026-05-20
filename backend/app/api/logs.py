from __future__ import annotations

from typing import Literal
from uuid import UUID, uuid4

from fastapi import APIRouter, BackgroundTasks, File, Form, HTTPException, UploadFile
from sqlalchemy import text

from ..agents.analyzer import analyze
from ..config import settings
from ..db import SessionLocal
from ..schemas import EvidenceItem, JobResponse, UploadResponse
from ..services.embedding import embed
from ..services.log_parser import split
from ..services.vector_store import insert_chunks

router = APIRouter()


@router.post("/upload", response_model=UploadResponse)
async def upload(
    bg: BackgroundTasks,
    file: UploadFile = File(...),
    source: Literal["nginx", "app", "custom"] = Form(default="custom"),
) -> UploadResponse:
    raw = await file.read()
    if len(raw) > settings.max_upload_bytes:
        raise HTTPException(413, f"file too large (>{settings.max_upload_bytes} bytes)")
    if not raw:
        raise HTTPException(400, "empty file")
    try:
        text_body = raw.decode("utf-8", errors="replace")
    except Exception as e:
        raise HTTPException(400, f"decode error: {e}") from e

    log_id = uuid4()
    job_id = uuid4()

    async with SessionLocal() as s:
        await s.execute(
            text(
                "INSERT INTO logs (id, source, raw, byte_size) "
                "VALUES (:id, :src, :raw, :sz)"
            ),
            {"id": str(log_id), "src": source, "raw": text_body, "sz": len(raw)},
        )
        await s.execute(
            text(
                "INSERT INTO analysis_jobs (id, log_id, status) "
                "VALUES (:id, :log, 'pending')"
            ),
            {"id": str(job_id), "log": str(log_id)},
        )
        await s.commit()

    chunks = split(text_body)
    vecs = embed([c.text for c in chunks])
    await insert_chunks(log_id, chunks, vecs)

    bg.add_task(analyze, log_id, job_id)

    return UploadResponse(log_id=log_id, job_id=job_id, bytes=len(raw))


@router.get("/jobs/{job_id}", response_model=JobResponse)
async def get_job(job_id: UUID) -> JobResponse:
    async with SessionLocal() as s:
        row = (
            await s.execute(
                text(
                    "SELECT id, log_id, status, summary, evidence::text AS ev_text, error, "
                    "       created_at, finished_at "
                    "FROM analysis_jobs WHERE id = :id"
                ),
                {"id": str(job_id)},
            )
        ).one_or_none()
    if not row:
        raise HTTPException(404, "job not found")

    import json
    ev_raw = json.loads(row.ev_text) if row.ev_text else None
    evidence = (
        [EvidenceItem(**item) for item in ev_raw] if ev_raw else None
    )

    return JobResponse(
        id=UUID(str(row.id)),
        log_id=UUID(str(row.log_id)),
        status=row.status,
        summary=row.summary,
        evidence=evidence,
        error=row.error,
        created_at=row.created_at,
        finished_at=row.finished_at,
    )


@router.get("", response_model=list[JobResponse])
async def list_recent(limit: int = 10) -> list[JobResponse]:
    limit = max(1, min(50, limit))
    async with SessionLocal() as s:
        rows = (
            await s.execute(
                text(
                    "SELECT id, log_id, status, summary, evidence::text AS ev_text, error, "
                    "       created_at, finished_at "
                    "FROM analysis_jobs ORDER BY created_at DESC LIMIT :lim"
                ),
                {"lim": limit},
            )
        ).all()

    import json
    out: list[JobResponse] = []
    for r in rows:
        ev_raw = json.loads(r.ev_text) if r.ev_text else None
        evidence = [EvidenceItem(**i) for i in ev_raw] if ev_raw else None
        out.append(
            JobResponse(
                id=UUID(str(r.id)),
                log_id=UUID(str(r.log_id)),
                status=r.status,
                summary=r.summary,
                evidence=evidence,
                error=r.error,
                created_at=r.created_at,
                finished_at=r.finished_at,
            )
        )
    return out
