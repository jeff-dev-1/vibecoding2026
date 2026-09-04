"""供应链网关 — 给"AI/开发者要装的软件"过闸门。

模型面 (input_guard) 拦坏请求; 这里拦坏软件: 扩展 / npm / pypi / HF 模型 / MCP server。
真闸门 = Koi (gateway/koi_client.py)。Koi 关掉或不可用时, 用这里的离线兜底,
保证断网现场也能演示三态 (对应 PPT DEMO RUNBOOK 页的"翻车预案")。
"""
from __future__ import annotations

from ..config import settings
from ..gateway import koi_client
from ..gateway.koi_client import KoiUnavailable
from ..schemas import SupplyChainFinding, SupplyChainVerdict

# Koi 支持的 marketplace 枚举里, demo 关心的几个 (覆盖 Vibe Coding 工具链)
MARKETPLACES: list[dict[str, str]] = [
    # 只给 id —— 显示名归前端的 i18n 字典管。
    #
    # 这里原来带 label ("PyPI (pip 包)" 之类), 于是界面切成 English 之后下拉框
    # 仍然是中文: 显示文案由后端硬编码, 前端没法翻。凡是"给人看的字"都不该从这里出。
    {"id": "pypi"},
    {"id": "npm"},
    {"id": "hugging_face"},
    {"id": "github_mcp_registry"},
    {"id": "mcp_registry"},
    {"id": "vscode"},
    {"id": "cursor"},
    {"id": "claude_desktop_extensions"},
    {"id": "chrome_web_store"},
]
_VALID = {m["id"] for m in MARKETPLACES}

# 现场一键演示用样例 (跨 marketplace, 含 MCP)
SAMPLES: list[dict[str, str]] = [
    {"marketplace": "pypi", "item_id": "requests", "label": "pypi · requests"},
    {"marketplace": "npm", "item_id": "express", "label": "npm · express"},
    {"marketplace": "github_mcp_registry", "item_id": "upstash/context7", "label": "MCP · upstash/context7"},
    {"marketplace": "hugging_face", "item_id": "models/meta-llama/Llama-3.2-3B", "label": "HF · Llama-3.2-3B"},
    {"marketplace": "vscode", "item_id": "ms-python.python", "label": "vscode · ms-python.python"},
]

# 离线兜底库: 没接 Koi 时按本地启发式给三态 (明确标 source=offline, 不冒充实时数据)
_OFFLINE_DENY = {"eslint-scope", "event-stream", "node-ipc"}  # 历史投毒包示例
_OFFLINE_REVIEW = {"requests"}  # 演示中风险态


def _offline(marketplace: str, item_id: str, version: str | None) -> SupplyChainVerdict:
    name = item_id.lower()
    if name in _OFFLINE_DENY:
        return SupplyChainVerdict(
            marketplace=marketplace, item_id=item_id, version=version,
            state="BLOCK", risk=9.0, risk_level="high",
            findings=[SupplyChainFinding(
                finding_name="Known Malicious Package", severity="high",
                description="离线样例库标记为历史投毒/恶意制品。",
                evidence=f"{item_id} 在本地 denylist 中")],
            source="offline", note="离线兜底 (未接 Koi): 基于本地样例库, 非实时结果",
        )
    if name in _OFFLINE_REVIEW:
        return SupplyChainVerdict(
            marketplace=marketplace, item_id=item_id, version=version,
            state="REQUEST_APPROVAL", risk=5.0, risk_level="medium",
            findings=[SupplyChainFinding(
                finding_name="Needs Review", severity="medium",
                description="离线样例库标记为需人工审批。", evidence="")],
            source="offline", note="离线兜底 (未接 Koi): 基于本地样例库, 非实时结果",
        )
    return SupplyChainVerdict(
        marketplace=marketplace, item_id=item_id, version=version,
        state="PASS", risk=1.0, risk_level="low", findings=[],
        source="offline", note="离线兜底 (未接 Koi): 本地无风险记录, 非实时结果",
    )


def _unavailable(marketplace: str, item_id: str, version: str | None, reason: str) -> SupplyChainVerdict:
    """Koi 已启用但调用失败 — 不能 fail-open 放行, 降级为需人工审批。"""
    return SupplyChainVerdict(
        marketplace=marketplace, item_id=item_id, version=version,
        state="REQUEST_APPROVAL", risk=None, risk_level=None, findings=[],
        source="offline",
        note=f"Koi unavailable, manual review required ({reason[:120]})",
    )


async def check(marketplace: str, item_id: str, version: str | None = None) -> SupplyChainVerdict:
    """供应链三态闸门。

    - KOI_ENABLED=false: 完全不调外部 API, 走离线兜底 (现场演示)。
    - KOI_ENABLED=true:  问真 Koi; 调用失败时 fail-safe 降级为 REQUEST_APPROVAL,
                         绝不因网络/鉴权失败把高危制品放行。
    """
    if not settings.koi_enabled:
        return _offline(marketplace, item_id, version)
    try:
        return await koi_client.risk_report(marketplace, item_id, version)
    except KoiUnavailable as e:
        return _unavailable(marketplace, item_id, version, str(e))
