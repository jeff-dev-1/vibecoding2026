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
from uuid import uuid4

import httpx
from pydantic import BaseModel, ValidationError

from .. import observability
from ..config import settings
from ..telemetry import get_tracer


LLMBackend = Literal["deepseek", "qwen"]

# Portkey 侧给本应用流量打的标签; 分析接口按它过滤。
_APP_TAG = "alad"
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


def _build_request(backend: LLMBackend, provider: str) -> tuple[str, dict[str, str]]:
    """按 provider 选 base URL + header 风格。业务代码不变, 只换这一层。

    两条路径的差别不只是 URL, 值得写清楚 —— 演示要讲的正是这个:

      envoy    自建数据面。厂商 key 由网关在 upstream 注入, backend 不持有;
               护栏是 Envoy 里的 Lua filter, 命中直接 400 + x-guardrail 头,
               请求根本到不了厂商。
      portkey  托管控制面。护栏 (可接 Prisma AIRS) 挂在 pc-/pg- 配置上,
               命中回 446 (DENY), 标记但放行回 246。

    一处值得说清楚的差异: 这个配置下 **Portkey 路径的 backend 是持有厂商 key 的**
    (随 Authorization 透传)。要做到和 Envoy 一样"backend 不碰 key", 需要在 Portkey
    侧配 virtual key, 把凭证存到厂商那边 —— 配了 PORTKEY_VIRTUAL_KEY 就走那条路。
    别把两条路径说成一样安全, 它们在"谁持有 key"这一点上确实不同。
    """
    if provider == "portkey":
        route = _PORTKEY_ROUTES.get(backend, _PORTKEY_ROUTES["deepseek"])
        headers = {
            "Content-Type": "application/json",
            "x-portkey-api-key": settings.portkey_api_key,
            # provider 必须给 —— 只给 config 时 Portkey 会回 400:
            # "Either x-portkey-provider needs to be passed. Or the x-portkey-config
            #  header should have a valid config with provider details in it."
            # 也就是说 config 只带路由/护栏, 不带 provider 身份。
            "x-portkey-provider": route["provider"] or "openai",
            # trace id 让这次调用能在 Portkey 控制台里被找到 —— 界面上的 trace 和
            # 厂商后台的记录得能对上, 否则"可观测"只是本地自说自话。
            "x-portkey-trace-id": f"alad-{uuid4().hex[:16]}",
            # metadata 用来把这个应用的流量从账号里择出来。同一个 Portkey 账号下还有
            # 别的应用在跑, 不打标签的话看板统计的是整个账号 —— 那个数字对不上任何人。
            "x-portkey-metadata": '{"app":"' + _APP_TAG + '","_user":"' + _APP_TAG + '"}',
        }
        if route["custom_host"]:
            headers["x-portkey-custom-host"] = route["custom_host"]
        # 护栏挂在 config 上; 不带 config 就是"不带护栏"那条对照路径。
        if settings.portkey_config:
            headers["x-portkey-config"] = settings.portkey_config
        # 凭证二选一: virtual key (存在 Portkey 侧, backend 不碰 key) 优先;
        # 没配就把厂商 key 透传过去。
        if settings.portkey_virtual_key:
            headers["x-portkey-virtual-key"] = settings.portkey_virtual_key
        else:
            key = settings.deepseek_api_key if backend == "deepseek" else settings.qwen_api_key
            headers["Authorization"] = f"Bearer {key}"
        return f"{settings.portkey_url}/chat/completions", headers

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
    # 这次调用实际走的 provider (envoy | portkey) —— 单请求可覆盖启动默认值。
    provider: str = "envoy"


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
    provider: str | None = None,
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

    active = provider or settings.gateway_provider
    url, headers = _build_request(backend, active)

    tracer = get_tracer()
    t0 = time.monotonic()
    with tracer.start_as_current_span("llm.chat"):
        async with httpx.AsyncClient(timeout=120.0) as client:
            resp = await client.post(url, json=payload, headers=headers)
    latency_ms = int((time.monotonic() - t0) * 1000)

    # 两个网关表达"护栏拦下了"的方式不同, 在这里归一化成一个 guardrail 标记:
    #   Envoy    400 + x-guardrail: prompt-injection-blocked   (Lua filter 直接短路)
    #   Portkey  446                                            (托管护栏 DENY)
    #            246 是"标记了但放行", 属于 2xx, 不在这个分支。
    guardrail = resp.headers.get("x-guardrail")
    if active == "portkey" and resp.status_code == 446:
        guardrail = "portkey-guardrail-denied"

    if resp.status_code != 200:
        observability.record(
            provider=active, backend=backend, model=model,
            prompt_tokens=0, completion_tokens=0, latency_ms=latency_ms,
            ok=False, guardrail=guardrail,
        )
        raise GatewayError(status=resp.status_code, body=resp.text, guardrail=guardrail)

    data = resp.json()
    choice = data["choices"][0]
    text = choice["message"]["content"]
    usage = data.get("usage", {})
    observability.record(
        provider=active, backend=backend,
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
        routing_header=headers.get("X-LLM-Backend", "") or headers.get("x-portkey-config", ""),
        provider=active,
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
