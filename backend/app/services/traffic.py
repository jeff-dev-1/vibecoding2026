"""确定性流量聚合 — 不靠 LLM, 从 ParsedLogEntry 直接算。

对应 STRESSED 的 Traffic Patterns 表 + summary 的 traffic 统计。
LLM 负责判断(哪些是攻击), 代码负责计数(更准更快)。
"""
from __future__ import annotations

from collections import defaultdict

from ..schemas import ParsedLogEntry, TrafficPattern, TrafficStat


def _norm_path(path: str | None) -> str:
    if not path:
        return "—"
    # 去 query string, 聚合同一 endpoint
    return path.split("?", 1)[0][:120]


def aggregate(entries: list[ParsedLogEntry]) -> tuple[TrafficStat, list[TrafficPattern]]:
    total = len(entries)
    e4 = sum(1 for e in entries if e.status and 400 <= e.status < 500)
    e5 = sum(1 for e in entries if e.status and e.status >= 500)
    ips = {e.client_ip for e in entries if e.client_ip}

    # (path, method) -> {hits, status_codes}
    buckets: dict[tuple[str, str], dict] = defaultdict(
        lambda: {"hits": 0, "status_codes": defaultdict(int)}
    )
    for e in entries:
        key = (_norm_path(e.path), e.method or "—")
        b = buckets[key]
        b["hits"] += 1
        if e.status is not None:
            b["status_codes"][str(e.status)] += 1

    patterns = [
        TrafficPattern(
            url_path=path,
            method=method,
            hits=b["hits"],
            status_codes=dict(b["status_codes"]),
        )
        for (path, method), b in buckets.items()
    ]
    # 按命中量降序, 取前 30
    patterns.sort(key=lambda p: p.hits, reverse=True)
    patterns = patterns[:30]

    top_paths = [p.url_path for p in patterns[:10]]

    stat = TrafficStat(
        total_requests=total,
        error_4xx=e4,
        error_5xx=e5,
        unique_client_ips=len(ips),
        top_paths=top_paths,
    )
    return stat, patterns
