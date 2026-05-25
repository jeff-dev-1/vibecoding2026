from __future__ import annotations

from contextlib import asynccontextmanager
from typing import AsyncIterator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from .config import settings

engine = create_async_engine(settings.database_url, pool_pre_ping=True, future=True)
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
    )
    try:
        async with engine.begin() as conn:
            for stmt in ddl:
                await conn.execute(text(stmt))
    except Exception:
        pass  # 启动不因建表失败而崩 (健康检查里 db_ping 仍反映真实状态)
