"""/logs 上传与查询。

用 TestClient 打真 HTTP + 真库。这一层的逻辑几乎都在边界上 —— 大小限制、状态过滤、
jsonb 往返、族与进程数的派生 —— 打桩之后就只剩"我调用了函数"。

上传会往 BackgroundTasks 里塞 index_and_analyze (embedding + LLM)。测试里把它换掉:
要验的是"接口收下了文件并建了 job", 不是那条要联网的后台管线。
"""
from uuid import UUID

import pytest
from fastapi.testclient import TestClient

NGINX = (
    '1.1.1.1 - - [22/Jan/2019:03:56:14 +0330] "GET /a HTTP/1.1" 200 100 "-" "curl" "-"\n'
    '2.2.2.2 - - [22/Jan/2019:03:56:15 +0330] "GET /b HTTP/1.1" 404 10 "-" "curl" "-"\n'
)
SYSLOG = (
    "Jun 14 15:16:01 combo sshd(pam_unix)[1]: authentication failure; rhost=1.1.1.1\n"
    "Jun 16 11:35:41 combo logrotate: ALERT exited abnormally with [1]\n"
)


@pytest.fixture
def client(db, monkeypatch):
    """不跑真实后台分析 —— 那条链路要 embedding 模型和 LLM 网关。"""
    from app.api import logs as logs_api
    from app.main import app

    async def _noop(*a, **kw):
        return None

    monkeypatch.setattr(logs_api, "index_and_analyze", _noop)
    with TestClient(app) as c:
        yield c


def _upload(client, body: str, name="x.log"):
    return client.post("/logs/upload", files={"file": (name, body.encode(), "text/plain")})


def _set_status(job_id: str, status: str) -> None:
    """直接改 job 状态 —— 没有对应的接口, 而"分析完成"是过滤用例的前提。

    自己开一条 asyncpg 连接, 不走 app.db 的 SessionLocal: 那个连接池里的连接绑在
    TestClient 的事件循环上, 在这里另起一个循环去用它就是 "attached to a
    different loop"。一次性连接没有这个问题。
    """
    import asyncio

    import asyncpg

    from tests.conftest import _TEST_URL, _sync_url

    async def _go():
        conn = await asyncpg.connect(_sync_url(_TEST_URL))
        try:
            await conn.execute("UPDATE analysis_jobs SET status=$1 WHERE id=$2::uuid", status, job_id)
        finally:
            await conn.close()

    asyncio.run(_go())


def test_upload_creates_job_and_returns_ids(client):
    r = _upload(client, NGINX)
    assert r.status_code == 200
    d = r.json()
    UUID(d["log_id"]), UUID(d["job_id"])          # 必须是合法 UUID
    assert d["bytes"] == len(NGINX.encode())


def test_upload_rejects_empty_file(client):
    assert _upload(client, "").status_code == 400


def test_upload_rejects_oversized_file(client, monkeypatch):
    # Settings 是 frozen dataclass, 改不了字段 —— 换掉整个 settings 对象。
    # (直接传一个 50MB 的 body 也能测, 但为一条断言搬 50MB 不值得。)
    import dataclasses

    from app.api import logs as logs_api

    monkeypatch.setattr(
        logs_api, "settings", dataclasses.replace(logs_api.settings, max_upload_bytes=10)
    )
    r = _upload(client, NGINX)
    assert r.status_code == 413
    assert "too large" in r.json()["detail"]


def test_job_roundtrip_exposes_family_and_processes(client):
    """上传的 entries 存成 jsonb 再读回来, 族和进程数是读取时派生的 ——
    这条链路断在哪一环, 界面都会安静地显示错的那组场景卡。"""
    job_id = _upload(client, SYSLOG).json()["job_id"]
    d = client.get(f"/logs/jobs/{job_id}").json()
    assert d["status"] == "pending"
    assert d["log_family"] == "system"
    assert d["distinct_processes"] == 2          # sshd(pam_unix) + logrotate
    assert len(d["sample_entries"]) == 2


def test_access_log_job_reports_access_family(client):
    job_id = _upload(client, NGINX).json()["job_id"]
    d = client.get(f"/logs/jobs/{job_id}").json()
    assert d["log_family"] == "access"
    assert d["distinct_processes"] == 0


def test_unknown_job_is_404(client):
    assert client.get("/logs/jobs/00000000-0000-0000-0000-000000000000").status_code == 404


def test_list_is_newest_first(client):
    first = _upload(client, NGINX).json()["job_id"]
    second = _upload(client, SYSLOG).json()["job_id"]
    ids = [j["id"] for j in client.get("/logs").json()]
    assert ids[0] == second and first in ids


def test_list_status_filter_is_what_the_landing_page_relies_on(client):
    """首屏只取 `limit=1&status=done` —— 过滤失效就会把 10 份完整 job (每份含
    1000 条明细) 全传给浏览器, 正是那次首屏慢的原因。"""
    pending = _upload(client, NGINX).json()["job_id"]
    done = _upload(client, SYSLOG).json()["job_id"]
    _set_status(done, "done")

    got = client.get("/logs?limit=1&status=done").json()
    assert [j["id"] for j in got] == [done]
    assert pending not in [j["id"] for j in got]


def test_list_limit_is_clamped(client):
    _upload(client, NGINX)
    assert len(client.get("/logs?limit=0").json()) <= 1
    assert client.get("/logs?limit=999").status_code == 200
