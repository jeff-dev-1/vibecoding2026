"""RAG pipeline: question → retrieve → compose prompt → gateway → answer + citations."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Literal
from uuid import UUID

from ..gateway.client import chat
from ..prompts import RAG_SYSTEM_PROMPT as SYSTEM_PROMPT
from .embedding import embed
from .vector_store import StoredChunk, search


@dataclass
class RagResult:
    answer: str
    chunks: list[StoredChunk]
    model: str


def _compose(question: str, chunks: list[StoredChunk]) -> list[dict[str, str]]:
    ctx_lines = []
    for c in chunks:
        ctx_lines.append(
            f"[chunk_idx={c.chunk_idx} lines={c.line_start}-{c.line_end} score={c.score:.2f}]\n{c.text}"
        )
    user = (
        "LOG CHUNKS:\n" + "\n---\n".join(ctx_lines) + f"\n\nQUESTION: {question}\n"
        + "Provide an answer with citations and brief evidence."
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
    q_vec = embed([question])[0]
    chunks = await search(q_vec, top_k=top_k, log_id=log_id)
    if not chunks:
        return RagResult(answer="尚未上传日志,无法回答。请先上传一份日志。", chunks=[], model="none")
    messages = _compose(question, chunks)
    res = await chat(messages, backend=backend)
    return RagResult(answer=res.text, chunks=chunks, model=res.model)
