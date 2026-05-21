"""Embedding service.

DEMO 取舍：用 sentence-transformers 本地跑，避免又一个 OpenAI 调用。
首次会下载 ~80MB 模型。CI/演示前预热: python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('BAAI/bge-small-en-v1.5')"
"""
from __future__ import annotations

import hashlib
from functools import lru_cache

from ..config import settings


@lru_cache(maxsize=1)
def _model():
    try:
        from sentence_transformers import SentenceTransformer
        return SentenceTransformer(settings.embedding_model)
    except Exception:
        return None


def embed(texts: list[str]) -> list[list[float]]:
    """Return 384-dim embeddings. Falls back to deterministic hash-based vector
    when sentence-transformers can't load (offline first-boot)."""
    m = _model()
    if m is not None:
        vecs = m.encode(texts, normalize_embeddings=True, show_progress_bar=False)
        return vecs.tolist()
    return [_hash_vec(t) for t in texts]


def _hash_vec(text: str) -> list[float]:
    """Deterministic 384-dim fallback so tests don't depend on model download."""
    h = hashlib.sha256(text.encode()).digest()
    base = (h * (384 // len(h) + 1))[:384]
    return [(b - 128) / 128.0 for b in base]
