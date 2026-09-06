from __future__ import annotations

import os
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from .config import settings

# DB_NULLPOOL=1 时不做连接池 —— 只给测试用。
#
# 连接池会把 asyncpg 连接连同它诞生时的事件循环一起缓存, 而 pytest 每个用例一个新
# 循环: 第二个用例拿到上一个循环里的连接, 报 "attached to a different loop"。
# 生产是单循环长驻, 池子照常用 —— 所以这个开关只在测试里打开, 不影响运行时。
_pool_kw = {"poolclass": NullPool} if os.environ.get("DB_NULLPOOL") == "1" else {}
engine = create_async_engine(
    settings.database_url, pool_pre_ping=True, future=True, **_pool_kw
)
SessionLocal = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)


@asynccontextmanager
async def get_session() -> AsyncIterator[AsyncSession]:
    async with SessionLocal() as session:
        yield session


async def ping() -> bool:
    try:
        async with engine.connect() as conn:
            await conn.execute(__import__("sqlalchemy").text("SELECT 1"))
        return True
    except Exception:
        return False


async def ensure_tables() -> None:
    """幂等建表 — 让新增表在已存在的库 (如 .210 持久卷) 上也自动创建, 免手动迁移。

    init.sql 只在全新库首启时跑; 这里在每次 backend 启动用 IF NOT EXISTS 兜底。
    """
    from sqlalchemy import text

    ddl = (
        """CREATE TABLE IF NOT EXISTS supply_chain_reports (
             id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
             summary     JSONB NOT NULL,
             created_at  TIMESTAMPTZ DEFAULT now()
           )""",
        "CREATE INDEX IF NOT EXISTS supply_chain_reports_created_idx "
        "ON supply_chain_reports(created_at DESC)",
        """CREATE TABLE IF NOT EXISTS pentest_reports (
             id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
             summary     JSONB NOT NULL,
             created_at  TIMESTAMPTZ DEFAULT now()
           )""",
        "CREATE INDEX IF NOT EXISTS pentest_reports_created_idx "
        "ON pentest_reports(created_at DESC)",
        """CREATE TABLE IF NOT EXISTS analysis_translations (
             job_id      UUID NOT NULL REFERENCES analysis_jobs(id) ON DELETE CASCADE,
             lang        TEXT NOT NULL,
             analysis    JSONB NOT NULL,
             created_at  TIMESTAMPTZ DEFAULT now(),
             PRIMARY KEY (job_id, lang)
           )""",
    )
    try:
        async with engine.begin() as conn:
            for stmt in ddl:
                await conn.execute(text(stmt))
    except Exception:
        pass  # 启动不因建表失败而崩 (健康检查里 db_ping 仍反映真实状态)
