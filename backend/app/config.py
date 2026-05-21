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


settings = Settings()
