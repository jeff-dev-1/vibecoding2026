from __future__ import annotations

from fastapi import APIRouter, HTTPException

from ..gateway.client import GatewayError
from ..schemas import ChatRequest, ChatResponse, Citation
from ..security.input_guard import check
from ..services.rag import answer

router = APIRouter()


@router.post("/query", response_model=ChatResponse)
async def query(req: ChatRequest) -> ChatResponse:
    guard = check(req.question)
    if guard.verdict == "block":
        return ChatResponse(
            answer="",
            citations=[],
            model="guarded",
            blocked=True,
            block_reason="; ".join(guard.reasons),
        )

    cleaned = guard.cleaned_text or req.question

    try:
        result = await answer(cleaned, top_k=req.top_k, log_id=req.log_id)
    except GatewayError as e:
        if e.guardrail == "prompt-injection-blocked":
            return ChatResponse(
                answer="",
                citations=[],
                model="gateway-guarded",
                blocked=True,
                block_reason="gateway: prompt-injection-blocked",
            )
        raise HTTPException(502, f"upstream error: {e.status}") from e

    citations = [
        Citation(
            chunk_id=c.id,
            chunk_idx=c.chunk_idx,
            line_start=c.line_start,
            line_end=c.line_end,
            excerpt=c.text[:300],
            score=c.score,
        )
        for c in result.chunks
    ]
    return ChatResponse(answer=result.answer, citations=citations, model=result.model)
