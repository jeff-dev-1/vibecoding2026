"""供应链网关闸门回归测试 — 守住三态映射和 fail-safe 行为。

重点防回归:
  - KOI_ENABLED=false 时绝不调外部 Koi
  - low/medium/high/critical 正确映射 PASS/REQUEST_APPROVAL/BLOCK
  - KOI_ENABLED=true 但 Koi 失败时 fail-safe (REQUEST_APPROVAL), 不 fail-open 放行
  - 空 KOI_API_BASE 不覆盖默认 base URL
"""
from __future__ import annotations

import dataclasses
import importlib

from app.config import settings as base_settings
from app.gateway import koi_client
from app.gateway.koi_client import KoiUnavailable
from app.security import supply_chain


def _with(**over):
    """基于真实 settings 造一个改了几个字段的副本 (frozen dataclass 安全)。"""
    return dataclasses.replace(base_settings, **over)


async def test_disabled_never_calls_koi(monkeypatch):
    monkeypatch.setattr(supply_chain, "settings", _with(koi_enabled=False, koi_api_key="leftover-key"))

    async def _spy(*a, **k):
        raise AssertionError("koi_client.risk_report 不应在 KOI_ENABLED=false 时被调用")

    monkeypatch.setattr(supply_chain.koi_client, "risk_report", _spy)

    v = await supply_chain.check("pypi", "some-unknown-pkg")
    assert v.source == "offline"
    assert v.state == "PASS"


def test_state_mapping():
    f = koi_client._state_from
    assert f("low", 1.0) == "PASS"
    assert f("medium", 5.0) == "REQUEST_APPROVAL"
    assert f("high", 8.0) == "BLOCK"
    assert f("critical", 9.5) == "BLOCK"
    # risk_level 缺失 → 按 0-10 数值兜底
    assert f(None, 2.0) == "PASS"
    assert f(None, 5.0) == "REQUEST_APPROVAL"
    assert f(None, 7.5) == "BLOCK"
    assert f(None, None) == "PASS"


async def test_enabled_but_koi_unavailable_is_fail_safe(monkeypatch):
    monkeypatch.setattr(supply_chain, "settings", _with(koi_enabled=True, koi_api_key="x"))

    async def _boom(*a, **k):
        raise KoiUnavailable("network down")

    monkeypatch.setattr(supply_chain.koi_client, "risk_report", _boom)

    v = await supply_chain.check("pypi", "anything")
    assert v.state == "REQUEST_APPROVAL"  # 不能 fail-open 放行
    assert "unavailable" in (v.note or "").lower()


def test_empty_base_url_does_not_override_default(monkeypatch):
    monkeypatch.setenv("KOI_API_BASE", "")
    import app.config as cfg

    importlib.reload(cfg)
    try:
        assert cfg.settings.koi_api_base.startswith("https://")
        assert cfg.settings.koi_api_base.endswith("/api/external/v2")
    finally:
        monkeypatch.delenv("KOI_API_BASE", raising=False)
        importlib.reload(cfg)
