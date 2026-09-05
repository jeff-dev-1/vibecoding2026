from __future__ import annotations

import json
from typing import Any, Literal
from uuid import UUID, uuid4

from fastapi import APIRouter, BackgroundTasks, File, Form, HTTPException, UploadFile
from sqlalchemy import text

from ..agents.analyzer import index_and_analyze
from ..config import settings
from ..db import SessionLocal
from ..schemas import (
    EvidenceItem,
    JobResponse,
    JobStatus,
    LogAnalysis,
    ParsedLogEntry,
    UploadResponse,
)
from ..services.log_parser import dominant_family, parse_entries
from ..services.traffic import distinct_processes

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

    # 只做轻量解析 (逐行 -> 表格用 entries), 秒级
    entries = parse_entries(text_body, source=source, limit=1000)
    entries_json = [e.model_dump(mode="json") for e in entries]

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
                "INSERT INTO analysis_jobs (id, log_id, status, sample_entries) "
                "VALUES (:id, :log, 'pending', CAST(:se AS jsonb))"
            ),
            {"id": str(job_id), "log": str(log_id), "se": json.dumps(entries_json)},
        )
        await s.commit()

    # 重活 (chunk + embedding + 入库 + LLM 分析) 全进后台 — upload 秒返回
    bg.add_task(index_and_analyze, log_id, job_id, text_body)

    return UploadResponse(log_id=log_id, job_id=job_id, bytes=len(raw))


def _row_to_job(r: Any) -> JobResponse:
    ev_raw = json.loads(r.ev_text) if r.ev_text else None
    # ev_raw 可能是旧版 (list of evidence) 或新版 ({evidence:[], analysis:{}})
    evidence_items: list[EvidenceItem] | None = None
    analysis_obj: LogAnalysis | None = None
    if isinstance(ev_raw, list):
        evidence_items = [EvidenceItem(**i) for i in ev_raw]
    elif isinstance(ev_raw, dict):
        if ev_raw.get("evidence"):
            evidence_items = [EvidenceItem(**i) for i in ev_raw["evidence"]]
        if ev_raw.get("analysis"):
            analysis_obj = LogAnalysis.model_validate(ev_raw["analysis"])

    se_raw = json.loads(r.se_text) if r.se_text else None
    sample_entries = (
        [ParsedLogEntry.model_validate(e) for e in se_raw] if se_raw else None
    )

    return JobResponse(
        id=UUID(str(r.id)),
        log_id=UUID(str(r.log_id)),
        status=r.status,
        summary=r.summary,
        evidence=evidence_items,
        analysis=analysis_obj,
        sample_entries=sample_entries,
        log_family=dominant_family(sample_entries or []),
        distinct_processes=distinct_processes(sample_entries or []),
        error=r.error,
        created_at=r.created_at,
        finished_at=r.finished_at,
    )


_BASE_SELECT = (
    "SELECT id, log_id, status, summary, "
    "       evidence::text AS ev_text, sample_entries::text AS se_text, "
    "       error, created_at, finished_at "
)


@router.get("/jobs/{job_id}", response_model=JobResponse)
async def get_job(job_id: UUID) -> JobResponse:
    async with SessionLocal() as s:
        row = (
            await s.execute(
                text(_BASE_SELECT + "FROM analysis_jobs WHERE id = :id"),
                {"id": str(job_id)},
            )
        ).one_or_none()
    if not row:
        raise HTTPException(404, "job not found")
    return _row_to_job(row)


@router.get("", response_model=list[JobResponse])
async def list_recent(limit: int = 10, status: JobStatus | None = None) -> list[JobResponse]:
    """最近的分析任务。

    status 过滤是为首屏加的。首页只要"最近一次完成的分析"这一个 job, 但原来的做法是
    拉 10 个完整 job 再在内存里挑一个 —— 每个 job 带着 1000 条 sample_entries,
    一次 2.6 MB, 其中 9 个直接扔掉。加上这个过滤后 `?limit=1&status=done`
    只传该传的那一份。
    """
    limit = max(1, min(50, limit))
    where = "WHERE status = :st " if status else ""
    params: dict[str, object] = {"lim": limit}
    if status:
        params["st"] = status
    async with SessionLocal() as s:
        rows = (
            await s.execute(
                text(
                    _BASE_SELECT
                    + f"FROM analysis_jobs {where}ORDER BY created_at DESC LIMIT :lim"
                ),
                params,
            )
        ).all()
    return [_row_to_job(r) for r in rows]
