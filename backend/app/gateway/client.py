"""LLM 调用的唯一入口。

CLAUDE.md 硬规则: 其他模块禁止 `from openai import ...`/`from anthropic import ...`。
所有调用走这个 client → Envoy AI Gateway → 上游模型。
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import httpx

from ..config import settings
from ..telemetry import get_tracer


@dataclass
class CompletionResult:
    text: str
    model: str
    prompt_tokens: int
    completion_tokens: int
    raw: dict[str, Any]


class GatewayError(RuntimeError):
    def __init__(self, status: int, body: str, guardrail: str | None = None):
        super().__init__(f"gateway {status}: {body}")
        self.status = status
        self.body = body
        self.guardrail = guardrail


async def chat(messages: list[dict[str, str]], *, model: str | None = None) -> CompletionResult:
    """Send chat-completions to the Gateway.

    Always uses OpenAI-compatible shape; Gateway translates to upstream protocol.
    """
    model = model or settings.llm_model
    payload = {"model": model, "messages": messages, "temperature": 0.2}
    headers = {
        "Authorization": f"Bearer {settings.gateway_api_key}",
        "Content-Type": "application/json",
        "X-LLM-Purpose": "log-analysis",
    }

    tracer = get_tracer()
    with tracer.start_as_current_span("llm.chat"):
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(
                f"{settings.gateway_url}/v1/chat/completions",
                json=payload,
                headers=headers,
            )

    if resp.status_code != 200:
        raise GatewayError(
            status=resp.status_code,
            body=resp.text,
            guardrail=resp.headers.get("x-guardrail"),
        )

    data = resp.json()
    choice = data["choices"][0]
    text = choice["message"]["content"]
    usage = data.get("usage", {})
    return CompletionResult(
        text=text,
        model=data.get("model", model),
        prompt_tokens=usage.get("prompt_tokens", 0),
        completion_tokens=usage.get("completion_tokens", 0),
        raw=data,
    )
