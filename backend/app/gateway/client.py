"""LLM 调用的唯一入口。

CLAUDE.md 硬规则: 其他模块禁止 `from openai import ...`/`from anthropic import ...`。
所有调用走这个 client → Envoy AI Gateway → 上游模型。

支持:
  - backend: "deepseek" 或 "qwen", Gateway 按 X-LLM-Backend header 路由
  - structured: True 时启用 response_format=json_object
"""
from __future__ import annotations

import json
import time
from dataclasses import dataclass
from typing import Any, Literal, TypeVar

import httpx
from pydantic import BaseModel, ValidationError

from .. import observability
from ..config import settings
from ..telemetry import get_tracer


LLMBackend = Literal["deepseek", "qwen"]
T = TypeVar("T", bound=BaseModel)


# 不同 backend 默认模型 (LLM_MODEL env 优先, 没设走默认)
_DEFAULT_MODELS: dict[str, str] = {
    "deepseek": "deepseek-chat",
    "qwen": "qwen3-coder-plus",
}

# Portkey OSS 路径: provider slug + 可选 custom host
# (Qwen/DashScope 走 OpenAI 兼容 + custom host; slug/host 以 Portkey 文档为准, 可在此调整)
_PORTKEY_ROUTES: dict[str, dict[str, str | None]] = {
    "deepseek": {"provider": "deepseek", "custom_host": None},
    "qwen": {
        "provider": "openai",
        "custom_host": "https://dashscope.aliyuncs.com/compatible-mode/v1",
    },
}


def _build_request(backend: LLMBackend) -> tuple[str, dict[str, str]]:
    """按 GATEWAY_PROVIDER 选 base URL + header 风格。业务代码不变, 只换这一层。"""
    if settings.gateway_provider == "portkey":
        route = _PORTKEY_ROUTES.get(backend, _PORTKEY_ROUTES["deepseek"])
        key = settings.deepseek_api_key if backend == "deepseek" else settings.qwen_api_key
        headers = {
            "Content-Type": "application/json",
            "x-portkey-provider": route["provider"] or "openai",
            "Authorization": f"Bearer {key}",
        }
        if route["custom_host"]:
            headers["x-portkey-custom-host"] = route["custom_host"]
        return f"{settings.portkey_url}/v1/chat/completions", headers
    # 默认 Envoy: key 在网关注入, backend 只带 demo bearer + 路由头
    headers = {
        "Authorization": f"Bearer {settings.gateway_api_key}",
        "Content-Type": "application/json",
        "X-LLM-Purpose": "log-analysis",
        "X-LLM-Backend": backend,
    }
    return f"{settings.gateway_url}/v1/chat/completions", headers


@dataclass
class CompletionResult:
    text: str
    model: str
    backend: LLMBackend
    prompt_tokens: int
    completion_tokens: int
    raw: dict[str, Any]
    # 网关往返耗时 (ms)。已经为 observability 算过了, 顺手带给调用方 ——
    # 前端的链路回放要拿它, 否则就只能编一个数字。
    latency_ms: int = 0
    # 实际打到的网关地址与路由头, 用于向前端说明"这一跳去了哪、凭什么路由的"。
    gateway_url: str = ""
    routing_header: str = ""


class GatewayError(RuntimeError):
    def __init__(self, status: int, body: str, guardrail: str | None = None):
        super().__init__(f"gateway {status}: {body}")
        self.status = status
        self.body = body
        self.guardrail = guardrail


async def chat(
    messages: list[dict[str, str]],
    *,
    model: str | None = None,
    backend: LLMBackend = "deepseek",
    structured: bool = False,
    temperature: float = 0.2,
) -> CompletionResult:
    """Send chat to the Gateway.

    backend: 'deepseek' or 'qwen' — gate routes via X-LLM-Backend header.
    structured: True 启用 response_format=json_object (调用方负责在 messages 写 schema 描述)
    """
    model = model or _DEFAULT_MODELS.get(backend, settings.llm_model)
    payload: dict[str, Any] = {
        "model": model,
        "messages": messages,
        "temperature": temperature,
    }
    if structured:
        payload["response_format"] = {"type": "json_object"}

    url, headers = _build_request(backend)

    tracer = get_tracer()
    t0 = time.monotonic()
    with tracer.start_as_current_span("llm.chat"):
        async with httpx.AsyncClient(timeout=120.0) as client:
            resp = await client.post(url, json=payload, headers=headers)
    latency_ms = int((time.monotonic() - t0) * 1000)

    if resp.status_code != 200:
        observability.record(
            provider=settings.gateway_provider, backend=backend, model=model,
            prompt_tokens=0, completion_tokens=0, latency_ms=latency_ms,
            ok=False, guardrail=resp.headers.get("x-guardrail"),
        )
        raise GatewayError(
            status=resp.status_code,
            body=resp.text,
            guardrail=resp.headers.get("x-guardrail"),
        )

    data = resp.json()
    choice = data["choices"][0]
    text = choice["message"]["content"]
    usage = data.get("usage", {})
    observability.record(
        provider=settings.gateway_provider, backend=backend,
        model=data.get("model", model),
        prompt_tokens=usage.get("prompt_tokens", 0),
        completion_tokens=usage.get("completion_tokens", 0),
        latency_ms=latency_ms, ok=True,
    )
    return CompletionResult(
        text=text,
        model=data.get("model", model),
        backend=backend,
        prompt_tokens=usage.get("prompt_tokens", 0),
        completion_tokens=usage.get("completion_tokens", 0),
        raw=data,
        latency_ms=latency_ms,
        gateway_url=url,
        routing_header=headers.get("X-LLM-Backend", ""),
    )


async def chat_structured(
    messages: list[dict[str, str]],
    schema_cls: type[T],
    *,
    model: str | None = None,
    backend: LLMBackend = "deepseek",
    max_retries: int = 1,
) -> tuple[T, CompletionResult]:
    """Call LLM in structured mode, parse into Pydantic schema.

    On parse failure, retries with an error feedback message appended.
    """
    last_err = ""
    for attempt in range(max_retries + 1):
        local_messages = list(messages)
        if attempt > 0 and last_err:
            local_messages.append(
                {
                    "role": "user",
                    "content": (
                        f"Your previous response failed schema validation: {last_err}\n"
                        "Re-output ONLY the JSON object matching the schema."
                    ),
                }
            )
        result = await chat(local_messages, model=model, backend=backend, structured=True)
        text = result.text.strip()
        # 容忍 markdown code fence (有的模型即使 json mode 也包 ```json)
        if text.startswith("```"):
            text = text.split("\n", 1)[1] if "\n" in text else text
            if text.endswith("```"):
                text = text.rsplit("```", 1)[0]
            text = text.strip()
        try:
            obj_raw = json.loads(text)
            obj = schema_cls.model_validate(obj_raw)
            return obj, result
        except (json.JSONDecodeError, ValidationError) as e:
            last_err = str(e)[:300]
            if attempt >= max_retries:
                raise GatewayError(
                    status=500,
                    body=f"structured parse failed after {max_retries+1} attempts: {last_err}",
                )
    raise RuntimeError("unreachable")
