"""Log → chunks (向量化) + structured entries (前端表格)。

两条平行管道:
  split(raw) -> Chunk[]                             # 给 embedding 用 (粗粒度)
  parse_entries(raw, source) -> ParsedLogEntry[]    # 给前端 / structured analysis 用 (逐行)

Nginx combined log:
  IP - - [timestamp] "METHOD path proto" status bytes "referer" "ua"
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import datetime

from ..config import settings
from ..schemas import ParsedLogEntry


# ===== chunk 切分 (embedding 用) =====

@dataclass
class Chunk:
    idx: int
    line_start: int   # 1-based, inclusive
    line_end: int     # 1-based, inclusive
    text: str


def split(raw: str, chunk_lines: int | None = None) -> list[Chunk]:
    n = chunk_lines or settings.chunk_lines
    lines = raw.splitlines()
    chunks: list[Chunk] = []
    idx = 0
    for start in range(0, len(lines), n):
        window = lines[start : start + n]
        chunks.append(
            Chunk(
                idx=idx,
                line_start=start + 1,
                line_end=start + len(window),
                text="\n".join(window),
            )
        )
        idx += 1
    return chunks


# ===== 逐行结构化解析 (表格 / 5 段链路用) =====

_NGINX_RE = re.compile(
    r'^(?P<ip>\S+)\s+\S+\s+\S+\s+'
    r'\[(?P<ts>[^\]]+)\]\s+'
    r'"(?P<method>\S+)\s+(?P<path>\S+)\s+\S+"\s+'
    r'(?P<status>\d{3})\s+'
    r'(?P<size>\d+|-)\s+'
    r'"(?P<referer>[^"]*)"\s+'
    r'"(?P<ua>[^"]*)"'
)

_NGINX_TS_FMT = "%d/%b/%Y:%H:%M:%S %z"

# Apache error_log: [Thu Jun 09 07:11:21 2005] [error] [client 1.2.3.4] message
_APACHE_ERR_RE = re.compile(
    r'^\[(?P<ts>[^\]]+)\]\s+'
    r'\[(?P<level>[a-z]+)\]\s+'
    r'(?:\[client (?P<ip>[^\]]+)\]\s+)?'
    r'(?P<msg>.*)$'
)
_APACHE_ERR_TS_FMT = "%a %b %d %H:%M:%S %Y"

# Linux syslog: Jun 14 15:16:01 combo sshd(pam_unix)[19939]: message...
_SYSLOG_RE = re.compile(
    r'^(?P<ts>[A-Z][a-z]{2}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2})\s+'
    r'(?P<host>\S+)\s+'
    r'(?P<proc>[\w.\-]+(?:\([\w.\-]+\))?)(?:\[(?P<pid>\d+)\])?:\s+'
    r'(?P<msg>.*)$'
)
_SYSLOG_TS_FMT = "%b %d %H:%M:%S"
_RHOST_RE = re.compile(r'rhost=(\S+)')


def _parse_nginx_line(line: str, line_no: int) -> ParsedLogEntry | None:
    m = _NGINX_RE.match(line)
    if not m:
        return None
    try:
        ts = datetime.strptime(m["ts"], _NGINX_TS_FMT)
    except ValueError:
        ts = None
    try:
        size = int(m["size"]) if m["size"] != "-" else 0
    except ValueError:
        size = 0

    return ParsedLogEntry(
        line_no=line_no,
        kind="access",
        ts=ts,
        client_ip=m["ip"],
        method=m["method"],
        path=m["path"],
        status=int(m["status"]),
        bytes_sent=size,
        user_agent=m["ua"],
        referer=m["referer"] if m["referer"] != "-" else None,
    )


def _parse_apache_error(line: str, line_no: int) -> ParsedLogEntry | None:
    m = _APACHE_ERR_RE.match(line)
    if not m:
        return None
    try:
        ts = datetime.strptime(m["ts"], _APACHE_ERR_TS_FMT)
    except (ValueError, KeyError):
        ts = None
    return ParsedLogEntry(
        line_no=line_no,
        kind="error",
        ts=ts,
        client_ip=m["ip"],
        level=m["level"],
        message=(m["msg"] or "")[:300],
    )


def _parse_syslog(line: str, line_no: int) -> ParsedLogEntry | None:
    m = _SYSLOG_RE.match(line)
    if not m:
        return None
    ts_str = " ".join(m["ts"].split())  # 折叠空格补全 (Jun  9 -> Jun 9)
    try:
        dt = datetime.strptime(ts_str, _SYSLOG_TS_FMT).replace(year=datetime.now().year)
    except ValueError:
        dt = None
    msg = m["msg"] or ""
    rhost = _RHOST_RE.search(msg)
    low = msg.lower()
    if any(k in low for k in ("fail", "illegal", "invalid", "denied", "refused", "error")):
        level = "error"
    elif any(k in low for k in ("session opened", "session closed", "accepted")):
        level = "info"
    else:
        level = "notice"
    return ParsedLogEntry(
        line_no=line_no,
        kind="error",
        ts=dt,
        client_ip=rhost.group(1) if rhost else None,
        level=level,
        message=f"{m['proc']}: {msg}"[:300],
    )


def parse_entries(raw: str, source: str = "auto", limit: int = 1000) -> list[ParsedLogEntry]:
    """Auto-detect 每行格式 (nginx/apache access / apache error / linux syslog), 跳过不匹配行。

    source 参数保留兼容, 但解析始终自动识别 — 上传任意常见日志都能用。
    """
    out: list[ParsedLogEntry] = []
    for i, line in enumerate(raw.splitlines(), start=1):
        if len(out) >= limit:
            break
        if not line.strip():
            continue
        entry = (
            _parse_nginx_line(line, i)
            or _parse_apache_error(line, i)
            or _parse_syslog(line, i)
        )
        if entry:
            out.append(entry)
    return out


def dominant_kind(entries: list[ParsedLogEntry]) -> str:
    if not entries:
        return "access"
    n_err = sum(1 for e in entries if e.kind == "error")
    return "error" if n_err > len(entries) / 2 else "access"
