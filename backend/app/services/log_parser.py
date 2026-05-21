"""Log → chunks. 简单按行切，每 N 行一 chunk。"""
from __future__ import annotations

from dataclasses import dataclass

from ..config import settings


@dataclass
class Chunk:
    idx: int
    line_start: int   # 1-based, inclusive
    line_end: int     # 1-based, inclusive
    text: str


def split(raw: str, chunk_lines: int | None = None) -> list[Chunk]:
    """Split raw log into line-window chunks.

    >>> chunks = split("a\\nb\\nc\\nd\\ne", chunk_lines=2)
    >>> [(c.line_start, c.line_end) for c in chunks]
    [(1, 2), (3, 4), (5, 5)]
    """
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
