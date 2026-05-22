"""AI Gateway 可观测性 — 每次 LLM 调用的轻量审计 (内存 ring buffer)。

不入库 (高频, demo 用): 保留最近 N 次调用 + 实时聚合。
client.py 每次调用后 record(); GET /gateway/observability 取 snapshot()。
"""
from __future__ import annotations

import threading
import time
from collections import deque

_MAX = 200
_calls: deque[dict] = deque(maxlen=_MAX)
_lock = threading.Lock()

# 估算成本 (USD / 1M tokens, input, output) — 近似值, 仅演示量级, 非账单
_PRICING: dict[str, tuple[float, float]] = {
    "deepseek-chat": (0.27, 1.10),
    "deepseek-reasoner": (0.55, 2.19),
    "qwen3-coder-plus": (0.30, 1.20),
}
_DEFAULT_PRICE = (0.50, 1.50)


def _cost_usd(model: str, prompt_tokens: int, completion_tokens: int) -> float:
    cin, cout = _PRICING.get(model, _DEFAULT_PRICE)
    return round(prompt_tokens / 1e6 * cin + completion_tokens / 1e6 * cout, 6)


def record(
    *,
    provider: str,
    backend: str,
    model: str,
    prompt_tokens: int,
    completion_tokens: int,
    latency_ms: int,
    ok: bool = True,
    guardrail: str | None = None,
) -> None:
    entry = {
        "ts": time.time(),
        "provider": provider,
        "backend": backend,
        "model": model,
        "prompt_tokens": prompt_tokens,
        "completion_tokens": completion_tokens,
        "latency_ms": latency_ms,
        "cost_usd": _cost_usd(model, prompt_tokens, completion_tokens),
        "ok": ok,
        "guardrail": guardrail,
    }
    with _lock:
        _calls.append(entry)


def _pct(values: list[int], p: float) -> int:
    if not values:
        return 0
    s = sorted(values)
    k = int(round((len(s) - 1) * p))
    return s[k]


def snapshot(current_provider: str) -> dict:
    with _lock:
        calls = list(_calls)
    if not calls:
        return {"empty": True, "current_provider": current_provider, "hint": "发起几次 AI 助手对话后这里就有数据"}

    lat = [c["latency_ms"] for c in calls]
    by_model: dict[str, dict] = {}
    by_backend: dict[str, dict] = {}
    by_provider: dict[str, int] = {}
    tot_pt = tot_ct = 0
    tot_cost = 0.0
    for c in calls:
        tot_pt += c["prompt_tokens"]
        tot_ct += c["completion_tokens"]
        tot_cost += c["cost_usd"]
        m = by_model.setdefault(c["model"], {"calls": 0, "tokens": 0, "cost_usd": 0.0})
        m["calls"] += 1
        m["tokens"] += c["prompt_tokens"] + c["completion_tokens"]
        m["cost_usd"] = round(m["cost_usd"] + c["cost_usd"], 6)
        b = by_backend.setdefault(c["backend"], {"calls": 0})
        b["calls"] += 1
        by_provider[c["provider"]] = by_provider.get(c["provider"], 0) + 1

    recent = [
        {**c, "ts": c["ts"]} for c in list(reversed(calls))[:20]
    ]
    return {
        "empty": False,
        "current_provider": current_provider,
        "total_calls": len(calls),
        "total_prompt_tokens": tot_pt,
        "total_completion_tokens": tot_ct,
        "total_cost_usd": round(tot_cost, 6),
        "latency_p50_ms": _pct(lat, 0.5),
        "latency_p95_ms": _pct(lat, 0.95),
        "by_model": by_model,
        "by_backend": by_backend,
        "by_provider": by_provider,
        "recent": recent,
        "window": _MAX,
    }
