from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field


LogSource = Literal["nginx", "app", "custom"]
JobStatus = Literal["pending", "running", "done", "failed"]


class UploadResponse(BaseModel):
    log_id: UUID
    job_id: UUID
    bytes: int


class EvidenceItem(BaseModel):
    chunk_id: UUID
    chunk_idx: int
    line_start: int
    line_end: int
    excerpt: str = Field(..., max_length=400)


class JobResponse(BaseModel):
    id: UUID
    log_id: UUID
    status: JobStatus
    summary: str | None = None
    evidence: list[EvidenceItem] | None = None
    error: str | None = None
    created_at: datetime
    finished_at: datetime | None = None


class ChatRequest(BaseModel):
    question: str = Field(..., min_length=1, max_length=2000)
    log_id: UUID | None = None
    top_k: int = Field(default=5, ge=1, le=20)


class Citation(BaseModel):
    chunk_id: UUID
    chunk_idx: int
    line_start: int
    line_end: int
    excerpt: str = Field(..., max_length=400)
    score: float


class ChatResponse(BaseModel):
    answer: str
    citations: list[Citation]
    model: str
    blocked: bool = False
    block_reason: str | None = None


class HealthResponse(BaseModel):
    ok: bool
    gateway: bool
    db: bool
