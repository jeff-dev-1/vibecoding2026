"""RAG 管线的上下文拼装。

_load_structured 从库里读回分析并判定日志族; _compose 决定送给模型的 system prompt
和材料。这两处出错都不会报错 —— 只会让模型收到错的上下文, 然后一本正经地答错。

真库 + 假网关: 上下文拼装是要验的东西, LLM 调用不是。
"""
import json
from uuid import uuid4

from sqlalchemy import text

from app.services.rag import _compose, _load_structured, answer

ANALYSIS = {
    "summary": "SSH 暴力破解",
    "highest_severity": "high",
    "requires_immediate_attention": True,
    "traffic": {"total_requests": 1000, "error_4xx": 0, "error_5xx": 492, "unique_client_ips": 5},
    "traffic_patterns": [
        {"url_path": "sshd(pam_unix)", "method": "error", "hits": 492, "status_codes": {}}
    ],
    "events": [
        {"severity": "high", "event_type": "Brute Force", "title": "SSH 暴力破解",
         "source_ips": ["1.1.1.1"], "possible_attacks": ["BruteForce"]}
    ],
}

SYSLOG_ENTRIES = [
    {"line_no": 1, "kind": "error", "level": "error", "client_ip": "1.1.1.1",
     "message": "sshd(pam_unix): authentication failure"},
    {"line_no": 2, "kind": "error", "level": "error", "client_ip": "1.1.1.1",
     "message": "sshd(pam_unix): authentication failure"},
    {"line_no": 3, "kind": "error", "level": "notice", "message": "logrotate: rotating"},
]

ACCESS_ENTRIES = [
    {"line_no": 1, "kind": "access", "client_ip": "9.9.9.9", "method": "GET",
     "path": "/a", "status": 200, "user_agent": "curl"},
    {"line_no": 2, "kind": "access", "client_ip": "8.8.8.8", "method": "GET",
     "path": "/b", "status": 404, "user_agent": "curl"},
]


async def _seed(SessionLocal, entries, analysis=ANALYSIS, status="done"):
    log_id, job_id = uuid4(), uuid4()
    async with SessionLocal() as s:
        await s.execute(
            text("INSERT INTO logs (id, source, raw, byte_size) VALUES (:i,'custom','x',1)"),
            {"i": str(log_id)},
        )
        await s.execute(
            text(
                "INSERT INTO analysis_jobs (id, log_id, status, evidence, sample_entries, finished_at) "
                "VALUES (:i,:l,:st, CAST(:ev AS jsonb), CAST(:se AS jsonb), now())"
            ),
            {
                "i": str(job_id), "l": str(log_id), "st": status,
                "ev": json.dumps({"analysis": analysis} if analysis else {}),
                "se": json.dumps(entries),
            },
        )
        await s.commit()
    return log_id


async def test_no_log_id_yields_empty_context_and_default_family(db):
    ctx, family = await _load_structured(None)
    assert ctx == "" and family == "access"


async def test_missing_job_yields_empty_context(db):
    ctx, family = await _load_structured(uuid4())
    assert ctx == "" and family == "access"


async def test_only_done_jobs_are_used(db):
    """还在跑的分析不该被当成权威统计喂给模型 —— 那份数据是半截的。"""
    log_id = await _seed(db, SYSLOG_ENTRIES, status="running")
    ctx, _ = await _load_structured(log_id)
    assert ctx == ""


async def test_loads_authoritative_numbers_and_detects_family(db):
    log_id = await _seed(db, SYSLOG_ENTRIES)
    ctx, family = await _load_structured(log_id)
    assert family == "system"
    assert "STRUCTURED ANALYSIS" in ctx
    assert "total=1000" in ctx and "5xx=492" in ctx
    assert "SSH 暴力破解" in ctx
    # TOP IP 由代码数, 不让模型自己数 —— 1.1.1.1 出现两次
    assert "1.1.1.1(2)" in ctx


async def test_access_log_detected_as_access_family(db):
    log_id = await _seed(db, ACCESS_ENTRIES)
    _, family = await _load_structured(log_id)
    assert family == "access"


def test_compose_picks_system_prompt_by_family():
    """族选错 = 拿 access log 的提示词去问 syslog, 模型只会回"这不是 access log"。"""
    sysm = _compose("q", "ctx", [], "zh-Hans", "system")[0]["content"]
    acc = _compose("q", "ctx", [], "zh-Hans", "access")[0]["content"]
    assert "没有 HTTP 字段" in sysm
    assert sysm != acc


def test_compose_language_travels_with_the_request():
    en = _compose("q", "", [], "en", "access")[0]["content"]
    zh = _compose("q", "", [], "zh-Hant", "access")[0]["content"]
    assert "Answer in English" in en
    assert "繁體中文" in zh


def test_compose_puts_structured_before_raw_and_keeps_question():
    user = _compose("谁最多?", "STRUCTURED ANALYSIS: x", [], "zh-Hans", "access")[1]["content"]
    assert user.index("STRUCTURED ANALYSIS") < user.index("RAW LOG EXCERPTS")
    assert "谁最多?" in user


async def test_answer_without_any_data_does_not_call_the_model(db, monkeypatch):
    """没数据时应当直说, 而不是把空上下文丢给模型让它编。"""
    called = False

    async def _boom(*a, **kw):
        nonlocal called
        called = True
        raise AssertionError("不该调用网关")

    monkeypatch.setattr("app.services.rag.chat", _boom)
    res = await answer("在吗", top_k=3, log_id=uuid4(), lang="en")
    assert not called
    assert res.model == "none"
    assert "No log has been uploaded" in res.answer
