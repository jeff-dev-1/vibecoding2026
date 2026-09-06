from __future__ import annotations

import json
from typing import Any, Literal
from uuid import UUID, uuid4

from fastapi import APIRouter, BackgroundTasks, File, Form, HTTPException, UploadFile
from sqlalchemy import text

from ..agents.analyzer import index_and_analyze
from ..config import settings
from ..db import SessionLocal
from ..prompts import DEFAULT_ANSWER_LANG, AnswerLang
from ..schemas import (
    EvidenceItem,
    JobResponse,
    JobStatus,
    LogAnalysis,
    ParsedLogEntry,
    UploadResponse,
)
from ..services.log_parser import dominant_family, parse_entries
from ..services.report_i18n import translated_analysis
from ..services.traffic import distinct_processes

router = APIRouter()


@router.post("/upload", response_model=UploadResponse)
async def upload(
    bg: BackgroundTasks,
    # noqa: B008 —— B008 禁止在默认值里调函数 (防的是可变默认值那个经典坑),
    # 但 File()/Form() 正是 FastAPI 声明表单字段的**唯一**写法: 这两个调用返回的是
    # 参数元信息, 框架靠它生成解析逻辑和 OpenAPI, 挪进函数体就没有上传接口了。
    # 所以这里是规则不适用, 不是代码有问题 —— 只关这一行, 不整包放行,
    # 免得以后真出现一个可变默认值时被一起放过去。
    file: UploadFile = File(...),  # noqa: B008
    source: Literal["nginx", "app", "custom"] = Form(default="custom"),  # noqa: B008
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
async def get_job(job_id: UUID, lang: AnswerLang = DEFAULT_ANSWER_LANG) -> JobResponse:
    """单个分析。

    lang 决定报告里**散文**的语言 (摘要/关键发现/事件描述)。报告本身是上传时生成
    一次的数据, 不会因为切语言而重新分析 —— 重跑可能得到不同的结论, 同一份日志
    两次说法不一致比语言不对更糟。只把散文翻过去, 证据 (IP/路径/状态码) 原样保留。
    """
    async with SessionLocal() as s:
        row = (
            await s.execute(
                text(_BASE_SELECT + "FROM analysis_jobs WHERE id = :id"),
                {"id": str(job_id)},
            )
        ).one_or_none()
    if not row:
        raise HTTPException(404, "job not found")
    return await _localize(_row_to_job(row), lang)


@router.get("", response_model=list[JobResponse])
async def list_recent(
    limit: int = 10,
    status: JobStatus | None = None,
    lang: AnswerLang = DEFAULT_ANSWER_LANG,
) -> list[JobResponse]:
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
    return [await _localize(_row_to_job(r), lang) for r in rows]


async def _localize(job: JobResponse, lang: str) -> JobResponse:
    """按界面语言翻译报告散文。默认语言直接返回 —— 报告本来就是那个语言生成的。"""
    if job.analysis is None or lang == DEFAULT_ANSWER_LANG:
        return job
    data = await translated_analysis(job.id, job.analysis.model_dump(), lang)
    return job.model_copy(update={"analysis": LogAnalysis.model_validate(data)})
