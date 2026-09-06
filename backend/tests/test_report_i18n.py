"""报告散文的按需翻译。

守两件事: 事实字段不许被改写 (它们是证据), 结构对不上时整份放弃 (错位比不翻译危险)。
"""
import pytest

from app.services.report_i18n import _extract, _merge

ANALYSIS = {
    "summary": "日志显示大量 SSH 认证失败",
    "highest_severity": "high",
    "requires_immediate_attention": True,
    "key_observations": ["来自 218.188.2.4 的暴力破解", "logrotate 异常退出"],
    "events": [
        {
            "event_type": "Brute Force",
            "severity": "high",
            "title": "SSH 暴力破解",
            "description": "492 次认证失败",
            "source_ips": ["218.188.2.4"],
            "affected_paths": ["/var/log/auth.log"],
            "confidence": 0.9,
        }
    ],
    "traffic": {"total_requests": 1000, "error_5xx": 492},
}


def test_extract_takes_only_prose():
    got = _extract(ANALYSIS)
    assert set(got) == {"summary", "key_observations", "events"}
    # 事件里只带散文 —— IP、路径、严重度、置信度都不进翻译请求
    assert set(got["events"][0]) == {"title", "description"}


def test_merge_replaces_prose_and_keeps_evidence():
    tr = {
        "summary": "The log shows many SSH authentication failures",
        "key_observations": ["Brute force from 218.188.2.4", "logrotate exited abnormally"],
        "events": [{"title": "SSH brute force", "description": "492 auth failures"}],
    }
    out = _merge(ANALYSIS, tr)
    assert out["summary"] == tr["summary"]
    assert out["events"][0]["title"] == "SSH brute force"
    # 证据与结构化字段原样保留
    assert out["events"][0]["source_ips"] == ["218.188.2.4"]
    assert out["events"][0]["severity"] == "high"
    assert out["events"][0]["confidence"] == 0.9
    assert out["highest_severity"] == "high"
    assert out["traffic"] == ANALYSIS["traffic"]


@pytest.mark.parametrize(
    "bad",
    [
        {"key_observations": ["只有一条"]},                    # 少了一条
        {"key_observations": ["a", "b", "c"]},                 # 多了一条
        {"events": []},                                        # 事件数对不上
        {"events": [{"title": "x"}, {"title": "y"}]},
    ],
)
def test_merge_discards_mismatched_lists(bad):
    """长度对不上就整份放弃那一部分。

    错位的后果很具体: 第 2 条发现的描述配到第 3 个事件上, 读者看到一句读得通、
    但指向错误证据的话 —— 比没翻译危险得多。
    """
    out = _merge(ANALYSIS, {"summary": "ok", **bad})
    if "key_observations" in bad:
        assert out["key_observations"] == ANALYSIS["key_observations"]
    if "events" in bad:
        assert out["events"] == ANALYSIS["events"]


def test_merge_ignores_empty_strings():
    out = _merge(ANALYSIS, {"summary": "   ", "key_observations": ["", ""]})
    assert out["summary"] == ANALYSIS["summary"]


def test_merge_survives_garbage():
    for junk in ({}, {"summary": 42}, {"events": "not a list"}):
        assert _merge(ANALYSIS, junk)["summary"] or True   # 不抛异常即可


async def test_falls_back_to_original_when_gateway_fails(db, monkeypatch):
    """翻译服务抖动不该让报告打不开 —— 显示原文是可接受的降级。"""
    from uuid import uuid4

    from app.gateway.client import GatewayError
    from app.services import report_i18n

    async def _boom(*a, **kw):
        raise GatewayError(status=502, body="unreachable")

    monkeypatch.setattr(report_i18n, "chat", _boom)
    out = await report_i18n.translated_analysis(uuid4(), ANALYSIS, "en")
    assert out == ANALYSIS


async def test_translation_is_cached_per_job_and_lang(db, monkeypatch):
    """每份日志每种语言最多翻一次 —— 否则每次轮询都是一次 LLM 调用。"""
    import json as _json
    from uuid import uuid4

    import asyncpg

    from app.gateway.client import CompletionResult
    from app.services import report_i18n
    from tests.conftest import _TEST_URL, _sync_url

    log_id, job_id = uuid4(), uuid4()

    async def _seed():
        c = await asyncpg.connect(_sync_url(_TEST_URL))
        try:
            await c.execute(
                "INSERT INTO logs (id, source, raw, byte_size) VALUES ($1,'custom','x',1)", log_id
            )
            await c.execute(
                "INSERT INTO analysis_jobs (id, log_id, status) VALUES ($1,$2,'done')",
                job_id, log_id,
            )
        finally:
            await c.close()

    await _seed()

    calls = {"n": 0}

    async def _fake(*a, **kw):
        calls["n"] += 1
        return CompletionResult(
            text=_json.dumps({
                "summary": "translated",
                "key_observations": ["a", "b"],
                "events": [{"title": "t", "description": "d"}],
            }),
            model="m", backend="deepseek", prompt_tokens=1, completion_tokens=1, raw={},
        )

    monkeypatch.setattr(report_i18n, "chat", _fake)

    first = await report_i18n.translated_analysis(job_id, ANALYSIS, "en")
    second = await report_i18n.translated_analysis(job_id, ANALYSIS, "en")
    assert first["summary"] == "translated"
    assert second == first
    assert calls["n"] == 1, "第二次不该再调 LLM —— 缓存没生效"

    # 换一种语言要重新翻
    await report_i18n.translated_analysis(job_id, ANALYSIS, "zh-Hant")
    assert calls["n"] == 2
