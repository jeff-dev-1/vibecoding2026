from __future__ import annotations

import time

from fastapi import APIRouter, HTTPException

from ..config import settings
from ..gateway.client import GatewayError
from ..prompts import scenario_prompt
from ..schemas import ChatRequest, ChatResponse, ChatTrace, Citation, TraceStep
from ..security.input_guard import check
from ..services.rag import answer

router = APIRouter()


@router.post("/query", response_model=ChatResponse)
async def query(req: ChatRequest) -> ChatResponse:
    # 每一跳都自己计时。这些数字会原样出现在前端的"请求链路回放"里 ——
    # 回放是给客户看"这套东西真的这么跑的"的证据, 所以不能有一个数是编的。
    t_guard = time.monotonic()
    guard = check(req.question)
    guard_ms = int((time.monotonic() - t_guard) * 1000)

    if guard.verdict == "block":
        return ChatResponse(
            answer="",
            citations=[],
            model="guarded",
            backend=req.backend,
            blocked=True,
            block_reason="; ".join(guard.reasons),
            # 被拦下的请求也有链路, 只是它只有一跳 —— 这正是要展示的那一跳。
            trace=ChatTrace(
                steps=[
                    TraceStep(
                        id="guard",
                        ok=False,
                        ms=guard_ms,
                        summary="blocked",
                        detail={"verdict": "block", "rules": guard.reasons},
                    )
                ],
                total_ms=guard_ms,
                backend=req.backend,
                model="guarded",
                provider=settings.gateway_provider,
            ),
        )

    cleaned = guard.cleaned_text or req.question
    # PII 脱敏 — 不阻断, 但记录下来让前端可见
    redacted = guard.verdict == "redact"
    redaction_rules = guard.reasons if redacted else []
    redaction_preview = guard.cleaned_text if redacted else None

    # 场景化前缀拼接 — quick-action 一键提问
    sp = scenario_prompt(req.scenario) if req.scenario else None
    if sp:
        cleaned = sp + "\n\n用户问题: " + cleaned

    try:
        result = await answer(
            cleaned,
            top_k=req.top_k,
            log_id=req.log_id,
            backend=req.backend,
            lang=req.lang,
        )
    except GatewayError as e:
        if e.guardrail == "prompt-injection-blocked":
            return ChatResponse(
                answer="",
                citations=[],
                model="gateway-guarded",
                backend=req.backend,
                blocked=True,
                block_reason="gateway: prompt-injection-blocked",
                trace=ChatTrace(
                    steps=[
                        TraceStep(
                            id="guard", ok=True, ms=guard_ms, summary=guard.verdict,
                            detail={"verdict": guard.verdict, "rules": guard.reasons},
                        ),
                        TraceStep(
                            id="gateway", ok=False, ms=0, summary="prompt-injection-blocked",
                            detail={"guardrail": e.guardrail, "status": e.status},
                        ),
                    ],
                    total_ms=guard_ms,
                    backend=req.backend,
                    model="gateway-guarded",
                    provider=settings.gateway_provider,
                ),
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

    steps = [
        TraceStep(
            id="guard",
            ok=True,
            ms=guard_ms,
            summary=guard.verdict,
            detail={"verdict": guard.verdict, "rules": guard.reasons},
        ),
        TraceStep(
            id="retrieval",
            ok=True,
            ms=result.retrieval_ms,
            summary=f"{len(result.chunks)} chunks",
            detail={
                "top_k": req.top_k,
                "chunks": len(result.chunks),
                "structured_context": result.structured_used,
                "store": "postgres + pgvector",
                # 前端要显示"凭什么选中这几段", 分数是唯一诚实的答案。
                "scores": [round(c.score, 3) for c in result.chunks],
            },
        ),
        TraceStep(
            id="gateway",
            ok=True,
            # 网关的时间含在 llm 那一跳里 (它就是同一次 HTTP 往返), 这里不重复计。
            ms=0,
            summary=result.routing_header or "default route",
            detail={
                "provider": settings.gateway_provider,
                "url": result.gateway_url,
                "X-LLM-Backend": result.routing_header or "(unset → default)",
                "X-LLM-Purpose": "log-analysis",
            },
        ),
        TraceStep(
            id="llm",
            ok=True,
            ms=result.llm_ms,
            summary=result.model,
            detail={
                "model": result.model,
                "prompt_tokens": result.prompt_tokens,
                "completion_tokens": result.completion_tokens,
                # 回答语言是请求参数, 不是模型自己挑的 —— 回放里要能看到这一点
                "answer_language": req.lang,
            },
        ),
    ]

    return ChatResponse(
        answer=result.answer,
        citations=citations,
        model=result.model,
        backend=req.backend,
        redacted=redacted,
        redaction_rules=redaction_rules,
        redaction_preview=redaction_preview,
        trace=ChatTrace(
            steps=steps,
            total_ms=guard_ms + result.retrieval_ms + result.llm_ms,
            backend=req.backend,
            model=result.model,
            provider=settings.gateway_provider,
            prompt_tokens=result.prompt_tokens,
            completion_tokens=result.completion_tokens,
        ),
    )
