"""Koi 供应链网关 (Koidex API) 客户端 — Pattern A。

业务代码不直接信任"AI/开发者要装的软件"; 装之前先问 Koi:
扩展 / npm / pypi / HuggingFace 模型 / MCP server 的风险分。

唯一入口, 和 LLM 走 gateway/client.py 一个道理: 第三方风险查询集中在这里。
关掉 (KOI_ENABLED=false) 或 Koi 不可用时, 由 security/supply_chain.py 兜底。

API 形状 (api.prod.koi.security/api/external/v2):
  GET  /koidex/risk-report?item_id=&marketplace=&version=
       → {risk: float, risk_level: "low|medium|high", findings:{findings:[...]},
          ai_risk_summary, risk_status: "completed|pending", ...}
  POST /koidex/fetch  {items:[{item_id, marketplace, version, include_ai_insights}]}
       → 触发异步分析 (新制品首次查询前可能需要)
"""
from __future__ import annotations

import asyncio

import httpx

from ..config import settings
from ..schemas import SupplyChainFinding, SupplyChainVerdict


class KoiUnavailable(RuntimeError):
    """Koi 未配置 / 网络失败 / 仍在分析 — 调用方应回退到离线兜底。"""


def _auth_headers() -> dict[str, str]:
    key = settings.koi_api_key
    if settings.koi_auth_style == "header":
        return {"x-api-key": key}
    return {"Authorization": f"Bearer {key}"}


def _state_from(risk_level: str | None, risk: float | None) -> str:
    lvl = (risk_level or "").lower()
    if lvl in ("critical", "high"):
        return "BLOCK"
    if lvl == "medium":
        return "REQUEST_APPROVAL"
    if lvl == "low":
        return "PASS"
    # risk_level 缺失时按数值分兜底 (Koi: 0-10, ≥7 高危)
    if risk is None:
        return "PASS"
    if risk >= 7:
        return "BLOCK"
    if risk >= 4:
        return "REQUEST_APPROVAL"
    return "PASS"


def _to_verdict(marketplace: str, item_id: str, data: dict) -> SupplyChainVerdict:
    raw_findings = (data.get("findings") or {}).get("findings") or []
    findings = [
        SupplyChainFinding(
            finding_name=f.get("finding_name") or f.get("finding_id") or "finding",
            severity=f.get("severity") or "info",
            description=(f.get("description") or "")[:800],
            evidence=(f.get("evidence") or "")[:400],
        )
        for f in raw_findings[:20]
    ]
    risk = data.get("risk")
    risk_level = data.get("risk_level")
    return SupplyChainVerdict(
        marketplace=data.get("marketplace") or marketplace,
        item_id=data.get("item_id") or item_id,
        item_display_name=data.get("item_display_name") or data.get("package_name"),
        version=data.get("version"),
        state=_state_from(risk_level, risk),  # type: ignore[arg-type]
        risk=risk,
        risk_level=risk_level,
        ai_risk_summary=(data.get("ai_risk_summary") or None),
        findings=findings,
        source="koi",
        note=None if data.get("risk_status") == "completed" else "Koi 仍在分析, 结果可能未就绪",
    )


async def _get_risk(
    client: httpx.AsyncClient, marketplace: str, item_id: str, version: str | None
) -> dict | None:
    params: dict[str, str] = {"item_id": item_id, "marketplace": marketplace}
    if version:
        params["version"] = version
    resp = await client.get(
        f"{settings.koi_api_base}/koidex/risk-report",
        params=params,
        headers=_auth_headers(),
    )
    if resp.status_code == 404:
        return None
    if resp.status_code in (401, 403):
        raise KoiUnavailable(f"Koi auth failed: {resp.status_code}")
    resp.raise_for_status()
    return resp.json()


async def _trigger_fetch(
    client: httpx.AsyncClient, marketplace: str, item_id: str, version: str | None
) -> None:
    item: dict[str, object] = {
        "item_id": item_id,
        "marketplace": marketplace,
        "include_ai_insights": True,
    }
    if version:
        item["version"] = version
    await client.post(
        f"{settings.koi_api_base}/koidex/fetch",
        json={"items": [item]},
        headers={**_auth_headers(), "Content-Type": "application/json"},
    )


async def risk_report(
    marketplace: str, item_id: str, version: str | None = None
) -> SupplyChainVerdict:
    """查一个制品的供应链风险, 返回归一化三态裁定。

    首查命中即返回; 若 Koi 还没分析过该制品 (404 / pending), 触发 fetch 后短轮询。
    未配置 key 或网络失败 → KoiUnavailable (调用方走离线兜底)。
    """
    if not settings.koi_api_key:
        raise KoiUnavailable("KOI_API_KEY 未配置")

    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            data = await _get_risk(client, marketplace, item_id, version)
            need_fetch = data is None or data.get("risk_level") is None or (
                data.get("risk_status") not in (None, "completed")
            )
            if need_fetch:
                await _trigger_fetch(client, marketplace, item_id, version)
                for _ in range(3):  # 最多 ~6s 轮询新制品分析结果
                    await asyncio.sleep(2)
                    data = await _get_risk(client, marketplace, item_id, version)
                    if data and data.get("risk_level") is not None:
                        break
            if not data or data.get("risk_level") is None and data.get("risk") is None:
                raise KoiUnavailable("Koi 暂无该制品的风险结果")
            return _to_verdict(marketplace, item_id, data)
    except KoiUnavailable:
        raise
    except (httpx.HTTPError, ValueError, KeyError) as e:
        raise KoiUnavailable(f"Koi 调用失败: {e}") from e
