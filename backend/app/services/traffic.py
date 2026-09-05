"""确定性流量聚合 — 不靠 LLM, 从 ParsedLogEntry 直接算。

按日志类型自适应:
  - access 日志: 按 (path, method) 聚合 -> hits + status_codes
  - error  日志: 按 (消息模式, level) 聚合 -> hits

LLM 负责判断(哪些是攻击), 代码负责计数(更准更快)。
"""
from __future__ import annotations

from collections import defaultdict

from ..schemas import ParsedLogEntry, TrafficPattern, TrafficStat
from .log_parser import dominant_kind


def _norm_path(path: str | None) -> str:
    if not path:
        return "—"
    return path.split("?", 1)[0][:120]


def _norm_msg(msg: str | None) -> str:
    """error 日志按消息前缀归一: 'File does not exist: /x/y' -> 'File does not exist'。"""
    if not msg:
        return "—"
    head = msg.split(":", 1)[0].strip()
    return (head or msg)[:100]


def aggregate(entries: list[ParsedLogEntry]) -> tuple[TrafficStat, list[TrafficPattern]]:
    if not entries:
        return TrafficStat(total_requests=0), []
    if dominant_kind(entries) == "error":
        return _aggregate_error(entries)
    return _aggregate_access(entries)


def _aggregate_access(entries: list[ParsedLogEntry]) -> tuple[TrafficStat, list[TrafficPattern]]:
    total = len(entries)
    e4 = sum(1 for e in entries if e.status and 400 <= e.status < 500)
    e5 = sum(1 for e in entries if e.status and e.status >= 500)
    ips = {e.client_ip for e in entries if e.client_ip}

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
        TrafficPattern(url_path=p, method=m, hits=b["hits"], status_codes=dict(b["status_codes"]))
        for (p, m), b in buckets.items()
    ]
    patterns.sort(key=lambda p: p.hits, reverse=True)
    patterns = patterns[:30]

    stat = TrafficStat(
        total_requests=total,
        error_4xx=e4,
        error_5xx=e5,
        unique_client_ips=len(ips),
        top_paths=[p.url_path for p in patterns[:10]],
    )
    return stat, patterns


def _aggregate_error(entries: list[ParsedLogEntry]) -> tuple[TrafficStat, list[TrafficPattern]]:
    total = len(entries)
    # error 日志没有 http status; 用 level 区分严重度
    n_error = sum(1 for e in entries if (e.level or "").lower() in ("error", "crit", "alert", "emerg"))
    n_warn = sum(1 for e in entries if (e.level or "").lower() in ("warn", "warning"))
    ips = {e.client_ip for e in entries if e.client_ip}

    # 按 (消息模式, level) 聚合
    buckets: dict[tuple[str, str], int] = defaultdict(int)
    for e in entries:
        buckets[(_norm_msg(e.message), e.level or "—")] += 1

    patterns = [
        # 复用 TrafficPattern: url_path=消息模式, method=level, hits=次数
        TrafficPattern(url_path=msg, method=lvl, hits=n, status_codes={})
        for (msg, lvl), n in buckets.items()
    ]
    patterns.sort(key=lambda p: p.hits, reverse=True)
    patterns = patterns[:30]

    stat = TrafficStat(
        total_requests=total,
        error_4xx=n_warn,   # 复用字段: warn 计数 (syslog 恒为 0, apache error_log 才有)
        error_5xx=n_error,  # 复用字段: error+ 计数
        unique_client_ips=len(ips),
        top_paths=[p.url_path for p in patterns[:10]],
    )
    return stat, patterns


def distinct_processes(entries: list[ParsedLogEntry]) -> int:
    """系统日志里出现过的服务/进程数。

    _parse_syslog 把 message 存成 "proc: 正文", _norm_msg 取冒号前那段 ——
    所以这里数的就是进程名。access 日志没有 message, 自然是 0。

    这个数存在的理由: "警告级"那张卡片对 syslog 恒为 0 (解析出的 level 只有
    error/info/notice, 没有 warn), 摆在报告顶上等于白占一格。进程数是同一份
    数据里真实存在、且一定非零的维度, 用它换掉那一格。
    """
    return len({_norm_msg(e.message) for e in entries if e.message})
