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
                provider=req.provider or settings.gateway_provider,
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
            provider=req.provider,
        )
    except GatewayError as e:
        if e.guardrail in ("prompt-injection-blocked", "portkey-guardrail-denied"):
            # 说清楚是**哪个**网关拦的, 别用一句写死的话盖住两条不同的路径:
            #   envoy    自建 Lua filter, HTTP 400
            #   portkey  托管护栏 (可接 Prisma AIRS), HTTP 446
            active_provider = req.provider or settings.gateway_provider
            return ChatResponse(
                answer="",
                citations=[],
                model="gateway-guarded",
                backend=req.backend,
                blocked=True,
                block_reason=f"{active_provider} gateway: {e.guardrail} (HTTP {e.status})",
                trace=ChatTrace(
                    steps=[
                        TraceStep(
                            id="guard", ok=True, ms=guard_ms, summary=guard.verdict,
                            detail={"verdict": guard.verdict, "rules": guard.reasons},
                        ),
                        TraceStep(
                            id="gateway", ok=False, ms=0, summary="prompt-injection-blocked",
                            detail={
                                "guardrail": e.guardrail,
                                "status": e.status,
                                "provider": req.provider or settings.gateway_provider,
                            },
                        ),
                    ],
                    total_ms=guard_ms,
                    backend=req.backend,
                    model="gateway-guarded",
                    provider=req.provider or settings.gateway_provider,
                ),
            )
        # 把上游的实际情况带出去。原来只回 "upstream error: 502", 前端照原样贴到
        # 气泡里就是一句没有信息量的话 —— 演示时看到它, 分不清是网关连不上、
        # 厂商 key 过期, 还是我们自己的代码崩了。e.body 是网关/厂商的原文, 直接给。
        raise HTTPException(502, f"upstream {e.status}: {e.body[:300]}") from e

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

    # 网关那一跳的字段名跟着 provider 走 —— Portkey 路径上没有 X-LLM-Backend 这个头,
    # 把 config id 塞进一个叫 X-LLM-Backend 的字段里, 回放就在骗人。
    gw_detail: dict[str, object] = {
        "provider": result.provider,
        "url": result.gateway_url,
    }
    if result.provider == "portkey":
        gw_detail["x-portkey-config"] = result.routing_header or "(未配置)"
        gw_detail["guardrail"] = "Portkey 托管护栏 (446 = DENY)"
        if result.trace_id:
            gw_detail["trace_id"] = result.trace_id
    else:
        gw_detail["X-LLM-Backend"] = result.routing_header or "(unset → default)"
        gw_detail["X-LLM-Purpose"] = "log-analysis"

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
            detail=gw_detail,
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
            provider=result.provider,
            trace_id=result.trace_id,
            console_url=(
                f"https://app.portkey.ai/organisation/{settings.portkey_org_id}/logs"
                if settings.portkey_org_id and result.provider == "portkey"
                else ""
            ),
            prompt_tokens=result.prompt_tokens,
            completion_tokens=result.completion_tokens,
        ),
    )
