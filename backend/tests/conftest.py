"""测试用的独立数据库。

为什么用真库而不是 mock: vector_store / rag / logs API 里几乎所有逻辑都写在 SQL 里
—— pgvector 的 `<=>` 距离排序、jsonb 往返、status 过滤、ON DELETE CASCADE。
把 SQLAlchemy 打桩之后, 测的就只剩"我调用了 execute", SQL 写错了照样全绿。
compose 里本来就有 pgvector, 用它。

隔离靠一个独立的数据库 (ailogs_test), 不是 schema、更不是 demo 库 ——
跑测试永远不该动到演示数据。库不存在就建, 表结构直接用 infra/postgres/init.sql
那一份, 免得测试的表和真实的表悄悄长歪。

连不上库时整份跳过而不是报错: 有人在容器外裸跑 pytest 是正常的, 那种情况下
纯函数的测试仍然应该能跑。
"""
from __future__ import annotations

import os
from pathlib import Path

import pytest

# ── 必须在任何 app 模块被 import 之前改掉 ────────────────────────────────
# app.db 在 import 时就按 settings.database_url 建好了 engine, 之后再改环境变量
# 没有用 —— 那时连接串已经定死, 测试会直接写进演示库。
_ADMIN_URL = os.environ.get(
    "DATABASE_URL", "postgresql+asyncpg://ailogs:ailogs_dev_only@postgres:5432/ailogs"
)
TEST_DB = "ailogs_test"
_TEST_URL = _ADMIN_URL.rsplit("/", 1)[0] + "/" + TEST_DB
os.environ["DATABASE_URL"] = _TEST_URL
# 不要连接池 —— 见 app/db.py 里那段说明。
os.environ["DB_NULLPOOL"] = "1"

def _schema_path() -> Path:
    """建表用的 SQL —— 只认 infra/postgres/init.sql 那一份。

    不在这里内联一份 DDL: 复制出来的表结构会和真实的悄悄长歪, 到那时测试全绿而
    生产建不出表, 正是测试最该防住的一类事。

    找三个地方: 显式 env、仓库布局 (CLAUDE.md 里 `cd backend && pytest` 的路径)、
    容器里的挂载点 (compose 把它只读挂进 /app/infra)。
    """
    env = os.environ.get("SCHEMA_SQL")
    candidates = [Path(env)] if env else []
    candidates += [
        Path(__file__).resolve().parents[2] / "infra" / "postgres" / "init.sql",
        Path("/app/infra/postgres/init.sql"),
    ]
    for c in candidates:
        if c.is_file():
            return c
    raise FileNotFoundError(
        "找不到 infra/postgres/init.sql; 试过: " + ", ".join(str(c) for c in candidates)
    )

# 每个用例之间清空的表。顺序无所谓 —— TRUNCATE ... CASCADE 会带走引用行。
_TABLES = (
    "log_chunks",
    "analysis_jobs",
    "logs",
    "redteam_reports",
    "supply_chain_reports",
    "pentest_reports",
)


def _sync_url(url: str) -> str:
    """asyncpg 的 URL 换成 psycopg 风格, 建库那一步用同步连接更省事。"""
    return url.replace("postgresql+asyncpg://", "postgresql://")


async def _create_test_db() -> None:
    """建库 (若不存在) 并灌入 schema。CREATE DATABASE 不能在事务里跑。"""
    import asyncpg

    admin = _sync_url(_ADMIN_URL)
    conn = await asyncpg.connect(admin)
    try:
        exists = await conn.fetchval("SELECT 1 FROM pg_database WHERE datname = $1", TEST_DB)
        if not exists:
            await conn.execute(f'CREATE DATABASE "{TEST_DB}"')
    finally:
        await conn.close()

    conn = await asyncpg.connect(_sync_url(_TEST_URL))
    try:
        await conn.execute(_schema_path().read_text())
    finally:
        await conn.close()


@pytest.fixture(scope="session")
def db_ready() -> bool:
    """建好测试库; 连不上就让依赖它的用例跳过。"""
    import asyncio

    try:
        asyncio.run(_create_test_db())
    except FileNotFoundError:
        # schema 文件找不到是 harness 自己坏了, 不是"环境里没有数据库"。
        # 这种情况必须响 —— 静默跳过会让一整批用例消失, 而 pytest 仍然全绿,
        # 那比没有这些测试更糟。
        raise
    except Exception as e:  # 确实没有可用的 postgres —— 纯函数测试不受影响
        pytest.skip(f"测试数据库不可用: {type(e).__name__}: {e}")
    return True


@pytest.fixture
async def db(db_ready):
    """每个用例拿到一张干净的表, 且连接不跨事件循环复用。

    跨循环复用连接的问题由 DB_NULLPOOL 解决 (见 app/db.py), 这里只管清表。
    """
    from sqlalchemy import text

    from app.db import SessionLocal

    async with SessionLocal() as s:
        await s.execute(text("TRUNCATE " + ", ".join(_TABLES) + " CASCADE"))
        await s.commit()
    yield SessionLocal
