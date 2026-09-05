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
    # 网关 provider: envoy (自建, inline 数据面) | portkey (托管 SaaS 控制面)
    #
    # 这是启动时的默认值; 单次请求可以用 ChatRequest.provider 覆盖 —— 演示要能当场切,
    # 而不是改 .env 重启一次容器。
    gateway_provider: str = os.environ.get("GATEWAY_PROVIDER", "portkey")

    # --- Portkey 托管版 ---
    # 注意默认值指向 api.portkey.ai 而不是自建的 OSS 容器: 护栏 (含 Prisma AIRS) 是
    # 托管控制面的能力, OSS 镜像里没有。想跑 OSS 版把 PORTKEY_BASE_URL 指到本地容器即可。
    portkey_url: str = (
        os.environ.get("PORTKEY_BASE_URL")
        or os.environ.get("PORTKEY_URL")
        or "https://api.portkey.ai/v1"
    )
    portkey_api_key: str = os.environ.get("PORTKEY_API_KEY", "")
    # pc-… 配置 id: 路由 / fallback / 重试, 护栏也挂在它上面
    portkey_config: str = os.environ.get("PORTKEY_CONFIG", "")
    # pg-… 护栏 id: 单独附加时用 (config 已带护栏时可留空)
    portkey_guardrail: str = os.environ.get("PORTKEY_GUARDRAIL", "")
    # virtual key: 上游厂商凭证存在 Portkey 侧, backend 不持有厂商 key
    portkey_virtual_key: str = os.environ.get("PORTKEY_VIRTUAL_KEY", "")
    # 控制台组织 id —— 只用来拼一个"去 Portkey 看这次调用"的深链, 不是凭证。
    portkey_org_id: str = os.environ.get("PORTKEY_ORG_ID", "")

    # Portkey OSS 是无状态代理 → 那条路径下 backend 需自带 provider key 透传
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
