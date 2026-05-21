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
        ts=ts,
        client_ip=m["ip"],
        method=m["method"],
        path=m["path"],
        status=int(m["status"]),
        bytes_sent=size,
        user_agent=m["ua"],
        referer=m["referer"] if m["referer"] != "-" else None,
    )


def parse_entries(raw: str, source: str = "nginx", limit: int = 200) -> list[ParsedLogEntry]:
    """Return up to `limit` parsed entries; lines that don't match are skipped."""
    out: list[ParsedLogEntry] = []
    for i, line in enumerate(raw.splitlines(), start=1):
        if len(out) >= limit:
            break
        if source == "nginx":
            entry = _parse_nginx_line(line, i)
            if entry:
                out.append(entry)
        else:
            out.append(
                ParsedLogEntry(line_no=i, path=line[:200] if line else None)
            )
    return out
