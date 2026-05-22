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
    # 网关 provider: envoy (默认, inline 数据面) | portkey (可切换 OSS 网关)
    gateway_provider: str = os.environ.get("GATEWAY_PROVIDER", "envoy")
    portkey_url: str = os.environ.get("PORTKEY_URL", "http://gateway-portkey:8787")
    # Portkey OSS 是无状态代理 → backend 在 portkey 路径下需自带 provider key 透传
    # (Envoy 路径下 key 在网关注入, backend 不持有 — 这是两条路径的真实差异)
    deepseek_api_key: str = os.environ.get("DEEPSEEK_API_KEY", "")
    qwen_api_key: str = os.environ.get("QWEN_API_KEY", "")
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
