from __future__ import annotations

from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI

from .api import chat, logs
from .config import settings
from .db import ping as db_ping
from .schemas import HealthResponse
from .telemetry import init_telemetry


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_telemetry(app, service_name=settings.service_name, endpoint=settings.otel_endpoint)
    yield


app = FastAPI(
    title="AI Log Analysis Platform",
    version="0.1.0",
    description="Vibe Coding demo backend — see CLAUDE.md / DESIGN.md",
    lifespan=lifespan,
)

app.include_router(logs.router, prefix="/logs", tags=["logs"])
app.include_router(chat.router, prefix="/chat", tags=["chat"])


@app.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    gateway_ok = False
    try:
        async with httpx.AsyncClient(timeout=2.0) as client:
            r = await client.get(f"{settings.gateway_url}/health")
            gateway_ok = r.status_code == 200
    except Exception:
        gateway_ok = False
    db_ok = await db_ping()
    return HealthResponse(ok=gateway_ok and db_ok, gateway=gateway_ok, db=db_ok)
