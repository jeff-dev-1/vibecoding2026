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
async def gateway_info(provider: str | None = None) -> dict:
    """控制面元信息。

    `provider` 查询参数让前端能预览"切过去之后长什么样", 不传则用启动默认值。
    护栏清单**随 provider 变**, 这是刻意的: 换网关就是换数据面, 护栏也跟着换位置,
    界面照实反映, 而不是印一份和当前配置无关的静态清单。
    """
    active = provider if provider in ("envoy", "portkey") else settings.gateway_provider
    return {
        "gateway": _GATEWAY_LABEL[active],
        "provider": active,
        "providers": _PROVIDERS,
        "default_backend": settings.default_backend,
        "backends": [
            {
                "id": "deepseek",
                "label": "DeepSeek",
                "model": "deepseek-chat",
                "upstream": "api.deepseek.com",
                "routing": (
                    "x-portkey-config" if active == "portkey" else "默认 (无 X-LLM-Backend 头)"
                ),
                "default": settings.default_backend == "deepseek",
            },
            {
                "id": "qwen",
                "label": "Qwen3-Coder",
                "model": "qwen3-coder-plus",
                "upstream": "dashscope.aliyuncs.com",
                "routing": (
                    "x-portkey-config" if active == "portkey" else "X-LLM-Backend: qwen"
                ),
                "default": settings.default_backend == "qwen",
            },
        ],
        "guardrails": _guardrails(active),
    }


_GATEWAY_LABEL = {
    "envoy": "Envoy AI Gateway",
    "portkey": "Portkey (托管)",
}

_PROVIDERS = [
    {
        "id": "envoy",
        "label": "Envoy AI Gateway",
        "kind": "自建数据面",
        "note": "护栏是网关进程里的 Lua filter, 请求路径上直接短路; 配置在本仓库里, 可 diff 可回滚。",
    },
    {
        "id": "portkey",
        "label": "Portkey",
        "kind": "托管控制面",
        "note": "护栏挂在 Portkey 的 pc-/pg- 配置上 (可接 Prisma AIRS 等引擎); 配置在厂商控制台, 不在本仓库。",
    },
]


def _guardrails(active: str) -> list[dict]:
    """当前 provider 下, 数据面上真实存在的护栏。

    两边都有 backend 的 input_guard 兜底 —— 那一层和网关无关, 所以两边都列。
    差别在网关那一层: Envoy 是自己的 Lua filter, Portkey 是托管护栏配置。
    """
    backend_layer = {
        "id": "backend-input-guard",
        "label": "输入护栏 (后端兜底)",
        "enabled": True,
        "where": "backend app/security/input_guard.py",
        "action": "Block / Redact",
        "categories": ["EMAIL", "PHONE_CN", "ID_CARD_CN", "CARD", "IP"],
    }

    if active == "portkey":
        return [
            {
                "id": "portkey-guardrail",
                "label": "Portkey 托管护栏",
                "enabled": bool(settings.portkey_config or settings.portkey_guardrail),
                "where": (
                    f"Portkey 控制面 · config {settings.portkey_config or '(未配置)'}"
                    + (f" · guardrail {settings.portkey_guardrail}" if settings.portkey_guardrail else "")
                ),
                # 446 = DENY, 246 = 标记但放行。这两个码是 Portkey 的护栏约定,
                # 写出来是为了让人能拿去和厂商控制台的日志对账。
                "action": "Deny (HTTP 446) / Flag (246)",
                "patterns": ["prompt injection", "PII", "Prisma AIRS (若已在配置中启用)"],
            },
            backend_layer,
            {
                "id": "rate-limit",
                "label": "限流",
                "enabled": True,
                "where": "公网 nginx limit_req (登录 6r/m · 提问 20r/m)",
                "action": "429",
            },
        ]

    return [
        {
            "id": "prompt-injection",
            "label": "Prompt Injection 拦截",
            "enabled": True,
            "where": "Envoy Lua filter (网关数据面)",
            "action": "Block (HTTP 400)",
            "patterns": [
                "ignore previous instructions",
                "ignore all previous",
                "disregard the above",
                "you are now DAN",
            ],
        },
        backend_layer,
        {
            "id": "rate-limit",
            "label": "限流",
            "enabled": True,
            "where": "Envoy local_ratelimit",
            "action": "120 req/min/tenant",
        },
    ]


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
