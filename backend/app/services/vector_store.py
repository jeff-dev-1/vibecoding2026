"""pgvector CRUD."""
from __future__ import annotations

from dataclasses import dataclass
from uuid import UUID

from sqlalchemy import text

from ..db import SessionLocal
from .log_parser import Chunk


@dataclass
class StoredChunk:
    id: UUID
    log_id: UUID
    chunk_idx: int
    line_start: int
    line_end: int
    text: str
    score: float = 0.0


async def insert_chunks(log_id: UUID, chunks: list[Chunk], embeddings: list[list[float]]) -> None:
    assert len(chunks) == len(embeddings)
    if not chunks:
        return
    # 批量入库 (executemany) — 比逐条 await 快一个数量级, 大文件不再卡
    params = [
        {
            "log_id": str(log_id),
            "idx": c.idx,
            "ls": c.line_start,
            "le": c.line_end,
            "t": c.text,
            "emb": str(vec),
        }
        for c, vec in zip(chunks, embeddings, strict=True)
    ]
    stmt = text(
        "INSERT INTO log_chunks (log_id, chunk_idx, line_start, line_end, text, embedding) "
        "VALUES (:log_id, :idx, :ls, :le, :t, CAST(:emb AS vector))"
    )
    async with SessionLocal() as s:
        await s.execute(stmt, params)  # list of dicts -> asyncpg executemany
        await s.commit()


async def search(query_vec: list[float], top_k: int, log_id: UUID | None = None) -> list[StoredChunk]:
    sql = (
        "SELECT id, log_id, chunk_idx, line_start, line_end, text, "
        "       1 - (embedding <=> CAST(:q AS vector)) AS score "
        "FROM log_chunks "
        + ("WHERE log_id = :log_id " if log_id else "")
        + "ORDER BY embedding <=> CAST(:q AS vector) LIMIT :k"
    )
    async with SessionLocal() as s:
        # 提高 ivfflat 探针数;demo 数据量小,默认 probes=1 经常命中空 list
        await s.execute(text("SET LOCAL ivfflat.probes = 50"))
        params = {"q": str(query_vec), "k": top_k}
        if log_id:
            params["log_id"] = str(log_id)
        rows = (await s.execute(text(sql), params)).all()
    return [
        StoredChunk(
            id=UUID(str(r.id)),
            log_id=UUID(str(r.log_id)),
            chunk_idx=r.chunk_idx,
            line_start=r.line_start,
            line_end=r.line_end,
            text=r.text,
            score=float(r.score),
        )
        for r in rows
    ]
