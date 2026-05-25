"""Gateway introspection — 把 AI Gateway 的控制面能力暴露给前端。

对应 PPT Slide 38: LLM Gateway = 模型路由 + 提示词管理 + Guardrail + 审计。
这些端点让前端的 'Gateway 控制面' 面板可以渲染:
  - 有哪些模型上游, 默认走哪个, 怎么切
  - Guardrail 规则 (注入/PII) 当前状态
  - 提示词管理: system + 场景模板 (集中资产)
"""
from __future__ import annotations

import json

from fastapi import APIRouter, HTTPException
from sqlalchemy import text

from .. import observability
from ..config import settings
from ..db import SessionLocal
from ..prompts import RAG_SYSTEM_PROMPT, SCENARIO_PROMPTS
from ..schemas import (
    GuardrailTestRequest,
    GuardrailTestResponse,
    PentestReport,
    RedteamReport,
    SupplyChainCheckRequest,
    SupplyChainReport,
    SupplyChainVerdict,
)
from ..security.input_guard import check
from ..security import supply_chain

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


@router.get("/observability")
async def gateway_observability() -> dict:
    """AI GW 可观测: 最近 LLM 调用 + 聚合 (调用数/tokens/估算成本/延迟分位)。"""
    return observability.snapshot(settings.gateway_provider)


@router.get("/info")
async def gateway_info() -> dict:
    return {
        "gateway": "Portkey (OSS)" if settings.gateway_provider == "portkey" else "Envoy AI Gateway",
        "provider": settings.gateway_provider,
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


@router.post("/redteam-report")
async def post_redteam_report(report: RedteamReport) -> dict:
    """红队 runner (CI/离线) 跑完把结果 POST 进来存储。"""
    async with SessionLocal() as s:
        await s.execute(
            text("INSERT INTO redteam_reports (summary) VALUES (CAST(:s AS jsonb))"),
            {"s": json.dumps(report.model_dump())},
        )
        await s.commit()
    return {"ok": True}


@router.get("/redteam-report")
async def get_redteam_report() -> RedteamReport | dict:
    """页面只读展示最近一次红队报告。"""
    async with SessionLocal() as s:
        row = (
            await s.execute(
                text(
                    "SELECT summary::text AS s, created_at FROM redteam_reports "
                    "ORDER BY created_at DESC LIMIT 1"
                )
            )
        ).one_or_none()
    if not row:
        return {"empty": True, "hint": "运行 make redteam 生成报告"}
    data = json.loads(row.s)
    data["created_at"] = row.created_at.isoformat() if row.created_at else None
    return RedteamReport.model_validate(data)


@router.post("/supply-chain-check", response_model=SupplyChainVerdict)
async def supply_chain_check(req: SupplyChainCheckRequest) -> SupplyChainVerdict:
    """供应链网关三态 — 装某个制品前先问 Koi 风险分。

    模型面 Guardrail 拦"坏请求", 这里拦"坏软件"(扩展/包/模型/MCP server)。
    BLOCK (高危) / REQUEST_APPROVAL (中危) / PASS (低危)。接真 Koi, 不可用走离线兜底。
    """
    return await supply_chain.check(req.marketplace, req.item_id, req.version)


@router.get("/supply-chain/samples")
async def supply_chain_samples() -> dict:
    """前端供应链 tab 用: marketplace 下拉 + 一键演示样例。"""
    return {
        "enabled": settings.koi_enabled and bool(settings.koi_api_key),
        "marketplaces": supply_chain.MARKETPLACES,
        "samples": supply_chain.SAMPLES,
    }


@router.post("/supply-chain-report")
async def post_supply_chain_report(report: SupplyChainReport) -> dict:
    """make supply-scan / CI 门禁跑完把本项目扫描结果 POST 进来存储。"""
    async with SessionLocal() as s:
        await s.execute(
            text("INSERT INTO supply_chain_reports (summary) VALUES (CAST(:s AS jsonb))"),
            {"s": json.dumps(report.model_dump())},
        )
        await s.commit()
    return {"ok": True}


@router.get("/supply-chain-report")
async def get_supply_chain_report() -> SupplyChainReport | dict:
    """页面只读展示最近一次本项目供应链扫描。"""
    async with SessionLocal() as s:
        row = (
            await s.execute(
                text(
                    "SELECT summary::text AS s, created_at FROM supply_chain_reports "
                    "ORDER BY created_at DESC LIMIT 1"
                )
            )
        ).one_or_none()
    if not row:
        return {"empty": True, "hint": "运行 make supply-scan 生成本项目供应链报告"}
    data = json.loads(row.s)
    data["created_at"] = row.created_at.isoformat() if row.created_at else None
    return SupplyChainReport.model_validate(data)


@router.post("/pentest-report")
async def post_pentest_report(report: PentestReport) -> dict:
    """渗透测试 runner (make pentest / CI) 跑完把 DAST 结果 POST 进来存储。"""
    async with SessionLocal() as s:
        await s.execute(
            text("INSERT INTO pentest_reports (summary) VALUES (CAST(:s AS jsonb))"),
            {"s": json.dumps(report.model_dump())},
        )
        await s.commit()
    return {"ok": True}


@router.get("/pentest-report")
async def get_pentest_report() -> PentestReport | dict:
    """页面只读展示最近一次渗透测试报告。"""
    async with SessionLocal() as s:
        row = (
            await s.execute(
                text(
                    "SELECT summary::text AS s, created_at FROM pentest_reports "
                    "ORDER BY created_at DESC LIMIT 1"
                )
            )
        ).one_or_none()
    if not row:
        return {"empty": True, "hint": "运行 make pentest 生成渗透测试报告"}
    data = json.loads(row.s)
    data["created_at"] = row.created_at.isoformat() if row.created_at else None
    return PentestReport.model_validate(data)


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
