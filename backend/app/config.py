from __future__ import annotations

import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    database_url: str = os.environ.get(
        "DATABASE_URL",
        "postgresql+asyncpg://ailogs:ailogs_dev_only@postgres:5432/ailogs",
    )
    gateway_url: str = os.environ.get("LLM_GATEWAY_URL", "http://envoy-ai-gateway:8080")
    gateway_api_key: str = os.environ.get("LLM_GATEWAY_API_KEY", "demo-key-not-secret")
    llm_model: str = os.environ.get("LLM_MODEL", "deepseek-chat")
    # backend 默认走哪个上游 (deepseek / qwen); 单请求可以通过 ChatRequest.backend 覆盖
    default_backend: str = os.environ.get("LLM_BACKEND", "deepseek")
    embedding_model: str = os.environ.get("EMBEDDING_MODEL", "BAAI/bge-small-en-v1.5")
    otel_endpoint: str | None = os.environ.get("OTEL_EXPORTER_OTLP_ENDPOINT")
    service_name: str = os.environ.get("OTEL_SERVICE_NAME", "backend")
    max_upload_bytes: int = 50 * 1024 * 1024
    chunk_lines: int = 50
    # Koi 供应链网关 (Pattern A); 关掉时走 security/supply_chain.py 的离线兜底
    koi_enabled: bool = os.environ.get("KOI_ENABLED", "false").lower() in ("1", "true", "yes")
    # `or default` 而非 get(k, default): 空字符串环境变量也回落默认, 不会得到 ""
    koi_api_base: str = (
        os.environ.get("KOI_API_BASE") or "https://api.prod.koi.security/api/external/v2"
    )
    koi_api_key: str = os.environ.get("KOI_API_KEY", "")
    # bearer → Authorization: Bearer xxx ; header → x-api-key: xxx
    koi_auth_style: str = os.environ.get("KOI_AUTH_STYLE", "bearer")


settings = Settings()
