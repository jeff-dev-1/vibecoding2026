"""Gateway introspection — 把 AI Gateway 的控制面能力暴露给前端。

对应 PPT Slide 38: LLM Gateway = 模型路由 + 提示词管理 + Guardrail + 审计。
这些端点让前端的 'Gateway 控制面' 面板可以渲染:
  - 有哪些模型上游, 默认走哪个, 怎么切
  - Guardrail 规则 (注入/PII) 当前状态
  - 提示词管理: system + 场景模板 (集中资产)
"""
from __future__ import annotations

from fastapi import APIRouter

from ..config import settings
from ..prompts import RAG_SYSTEM_PROMPT, SCENARIO_PROMPTS
from ..schemas import GuardrailTestRequest, GuardrailTestResponse
from ..security.input_guard import check

router = APIRouter()


@router.post("/guardrail-test", response_model=GuardrailTestResponse)
async def guardrail_test(req: GuardrailTestRequest) -> GuardrailTestResponse:
    """现场测试 guardrail — 输入 payload, 返回 PASS/BLOCKED/REDACTED + 命中规则 + 脱敏预览。

    用的是真实的 input_guard.check (跟 /chat/query 走同一逻辑), 不是模拟。
    """
    r = check(req.text)
    verdict = {"pass": "PASS", "redact": "REDACTED", "block": "BLOCKED"}[r.verdict]
    return GuardrailTestResponse(
        verdict=verdict,  # type: ignore[arg-type]
        matched_rules=r.reasons,
        redacted_preview=r.cleaned_text if r.verdict == "redact" else None,
    )


@router.get("/info")
async def gateway_info() -> dict:
    return {
        "gateway": "Envoy AI Gateway",
        "default_backend": settings.default_backend,
        "backends": [
            {
                "id": "deepseek",
                "label": "DeepSeek",
                "model": "deepseek-chat",
                "upstream": "api.deepseek.com",
                "routing": "默认 (无 X-LLM-Backend 头)",
                "default": settings.default_backend == "deepseek",
            },
            {
                "id": "qwen",
                "label": "Qwen3-Coder",
                "model": "qwen3-coder-plus",
                "upstream": "dashscope.aliyuncs.com",
                "routing": "X-LLM-Backend: qwen",
                "default": settings.default_backend == "qwen",
            },
        ],
        "guardrails": [
            {
                "id": "prompt-injection",
                "label": "Prompt Injection 拦截",
                "enabled": True,
                "where": "Envoy Lua filter + backend input_guard (双层)",
                "action": "Block (HTTP 400)",
                "patterns": [
                    "ignore previous instructions",
                    "ignore all previous",
                    "disregard the above",
                    "you are now DAN",
                ],
            },
            {
                "id": "pii-redaction",
                "label": "PII 脱敏",
                "enabled": True,
                "where": "backend input_guard 正则 + Gateway 标记头",
                "action": "Redact",
                "categories": ["EMAIL", "PHONE_CN", "ID_CARD_CN", "CARD", "IP"],
            },
            {
                "id": "rate-limit",
                "label": "限流",
                "enabled": True,
                "where": "Envoy local_ratelimit",
                "action": "120 req/min/tenant",
            },
        ],
    }


@router.get("/prompts")
async def gateway_prompts() -> dict:
    """提示词管理 — 集中暴露所有受管 prompt 资产。"""
    return {
        "system_prompts": [
            {
                "id": "rag-chat",
                "label": "RAG 问答 system",
                "content": RAG_SYSTEM_PROMPT,
            },
        ],
        "scenario_prompts": [
            {"id": sid, "title": v["title"], "content": v["prompt"]}
            for sid, v in SCENARIO_PROMPTS.items()
        ],
    }
