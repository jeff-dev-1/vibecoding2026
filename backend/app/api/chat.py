from __future__ import annotations

from fastapi import APIRouter, HTTPException

from ..gateway.client import GatewayError
from ..schemas import ChatRequest, ChatResponse, Citation
from ..security.input_guard import check
from ..services.rag import answer

router = APIRouter()


# 场景化 prompt 模板 — 对应右侧抽屉的 quick-action
_SCENARIO_PROMPTS: dict[str, str] = {
    "vs-overview": (
        "请作为 VS 综合分析师, 输出: 健康度评分(0-100)、关键指标快照、TOP3 风险点、TOP3 建议。"
    ),
    "health-check": (
        "请做全站健康巡检: 流量分布、错误率、慢请求热点、可用性。每项给出 PASS/WARN/FAIL。"
    ),
    "ssl-check": (
        "请检查证书相关问题: 是否有 SSL handshake 失败、cipher 不匹配、证书近期到期信号。"
    ),
    "alert-summary": (
        "请汇总告警: 按 5xx / 4xx / 速率异常 / 扫描行为 分类, 列前 5 条最严重。"
    ),
    "slow-rca": (
        "请做响应慢根因分析: 哪些 URL/IP 慢, 慢在 5 段链路哪一段(客户端 RTT / LB / 服务器 RTT / 应用 / 传输)。"
    ),
    "error-codes": (
        "请做 4xx/5xx 错误码分析: 各状态码分布、最常见 path、可能根因。"
    ),
    "security-ops": (
        "请做安全运营巡查: 注入尝试、扫描行为、可疑 UA、暴力破解、异常源 IP。给出处置建议。"
    ),
}


@router.post("/query", response_model=ChatResponse)
async def query(req: ChatRequest) -> ChatResponse:
    guard = check(req.question)
    if guard.verdict == "block":
        return ChatResponse(
            answer="",
            citations=[],
            model="guarded",
            backend=req.backend,
            blocked=True,
            block_reason="; ".join(guard.reasons),
        )

    cleaned = guard.cleaned_text or req.question

    # 场景化前缀拼接 — quick-action 一键提问
    if req.scenario and req.scenario in _SCENARIO_PROMPTS:
        cleaned = _SCENARIO_PROMPTS[req.scenario] + "\n\n用户问题: " + cleaned

    try:
        result = await answer(
            cleaned,
            top_k=req.top_k,
            log_id=req.log_id,
            backend=req.backend,
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
    return ChatResponse(
        answer=result.answer,
        citations=citations,
        model=result.model,
        backend=req.backend,
    )
