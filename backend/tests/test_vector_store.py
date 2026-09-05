"""pgvector 存取。

这些用例跑真 SQL —— 这个模块的逻辑几乎全在 SQL 里 (向量距离排序、log_id 过滤、
CASCADE), 打桩之后就只剩"我调用了 execute", SQL 写错照样全绿。
"""
from uuid import uuid4

import pytest
from sqlalchemy import text

from app.services.embedding import embed
from app.services.log_parser import Chunk
from app.services.vector_store import insert_chunks, search


async def _make_log(SessionLocal) -> str:
    log_id = uuid4()
    async with SessionLocal() as s:
        await s.execute(
            text("INSERT INTO logs (id, source, raw, byte_size) VALUES (:i,'custom','x',1)"),
            {"i": str(log_id)},
        )
        await s.commit()
    return log_id


def _chunks(*texts: str) -> list[Chunk]:
    return [
        Chunk(idx=i, line_start=i * 10 + 1, line_end=i * 10 + 10, text=t)
        for i, t in enumerate(texts)
    ]


async def test_insert_then_search_returns_stored_fields(db):
    log_id = await _make_log(db)
    chunks = _chunks("ssh authentication failure from 1.2.3.4", "logrotate exited abnormally")
    await insert_chunks(log_id, chunks, embed([c.text for c in chunks]))

    # 用与某个 chunk **完全相同**的文本去查, 而不是近义句 —— 近义句能不能排到第一
    # 取决于装没装 sentence-transformers (见 test_embedding.py), 那是另一件事的断言。
    # 这里要验的是存取本身: 存进去的字段能原样取回, 且同文本必然命中自己。
    hits = await search(embed([chunks[0].text])[0], top_k=2, log_id=log_id)
    assert len(hits) == 2
    top = hits[0]
    assert top.log_id == log_id
    assert top.chunk_idx == 0
    assert top.line_start == 1 and top.line_end == 10
    assert top.text == chunks[0].text
    # 分数是 1 - cosine_distance; 同一段文本的向量和自己夹角为 0, 分数应当≈1。
    assert top.score == pytest.approx(1.0, abs=1e-3)


async def test_search_orders_by_similarity_not_insertion(db):
    log_id = await _make_log(db)
    # 目标句故意放在最后一个 —— 按插入顺序返回的话它不会排第一。
    chunks = _chunks("disk usage report", "cron job started", "sshd brute force from 218.188.2.4")
    await insert_chunks(log_id, chunks, embed([c.text for c in chunks]))

    hits = await search(embed([chunks[2].text])[0], top_k=3, log_id=log_id)
    assert hits[0].chunk_idx == 2, "最相近的那条没有排在第一 —— ORDER BY 距离没生效"
    assert [h.score for h in hits] == sorted((h.score for h in hits), reverse=True)


async def test_search_is_scoped_to_one_log(db):
    """log_id 过滤失效的话, 一份日志的问答会引用另一份日志的行 —— 而界面上那些
    引用看起来同样煞有介事。"""
    a, b = await _make_log(db), await _make_log(db)
    await insert_chunks(a, _chunks("alpha alpha alpha"), embed(["alpha alpha alpha"]))
    await insert_chunks(b, _chunks("beta beta beta"), embed(["beta beta beta"]))

    only_a = await search(embed(["alpha"])[0], top_k=10, log_id=a)
    assert {h.log_id for h in only_a} == {a}

    both = await search(embed(["alpha"])[0], top_k=10)
    assert {h.log_id for h in both} == {a, b}


async def test_top_k_limits_results(db):
    log_id = await _make_log(db)
    chunks = _chunks(*[f"line group {i}" for i in range(6)])
    await insert_chunks(log_id, chunks, embed([c.text for c in chunks]))
    assert len(await search(embed(["group"])[0], top_k=2, log_id=log_id)) == 2


async def test_insert_empty_is_noop(db):
    log_id = await _make_log(db)
    await insert_chunks(log_id, [], [])
    assert await search(embed(["anything"])[0], top_k=5, log_id=log_id) == []


async def test_length_mismatch_is_rejected(db):
    """chunk 与向量数量对不上就是上游算错了; 静默 zip 到短的那个会让部分日志
    永远检索不到, 而且没有任何迹象。"""
    log_id = await _make_log(db)
    with pytest.raises(AssertionError):
        await insert_chunks(log_id, _chunks("a", "b"), embed(["a"]))


async def test_deleting_log_removes_its_chunks(db):
    log_id = await _make_log(db)
    await insert_chunks(log_id, _chunks("orphan candidate"), embed(["orphan candidate"]))
    async with db() as s:
        await s.execute(text("DELETE FROM logs WHERE id = :i"), {"i": str(log_id)})
        await s.commit()
    assert await search(embed(["orphan"])[0], top_k=5, log_id=log_id) == []
