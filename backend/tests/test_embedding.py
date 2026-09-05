"""Embedding —— 以及"到底跑的是模型还是兜底哈希"这件事。

背景 (实测): 部署镜像里没有装 sentence-transformers, 于是 embed() 一直走
_hash_vec 兜底。哈希向量是确定性的, 但**没有语义** —— 实测 "ssh authentication
failure" 与 "ssh auth failed" 的余弦相似度只有 0.054, 和随机两句话没区别。

后果不是报错, 而是安静地降级: RAG 照常返回 top_k 条"引用", 排序却近乎随机。
在这份演示日志上不容易看出来 —— 一千行里大多数本来就是认证失败, 随便捞几条都
像是相关的。真正的问题会在日志内容多样时才显形。

所以这里不假装它是语义检索, 而是把两件事分开断言:
  - 兜底哈希必须满足的性质 (确定性、维度、可复现) —— 任何时候都成立
  - "语义检索是否可用" 单独一条, 装了模型才跑; 没装就 skip 并说明原因,
    让这份降级在测试输出里看得见, 而不是藏在一句 except 里
"""
import pytest

from app.services.embedding import _hash_vec, _model, embed

DIM = 384


def _cos(a: list[float], b: list[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b, strict=True))
    na = sum(x * x for x in a) ** 0.5
    nb = sum(y * y for y in b) ** 0.5
    return dot / (na * nb)


def test_dimension_matches_schema():
    # init.sql 里是 vector(384); 维度对不上会在入库时才炸, 而且是在后台任务里,
    # 表现为"分析一直不完成"而不是一条明确的错误。
    assert all(len(v) == DIM for v in embed(["a", "bb", "ccc"]))


def test_batch_order_is_preserved():
    # 顺序错位 = chunk 和向量对错, 检索结果指向别的行; 引用看起来仍然煞有介事。
    a, b = embed(["first text", "second text"])
    assert a == embed(["first text"])[0]
    assert b == embed(["second text"])[0]


def test_is_deterministic():
    assert embed(["same input"])[0] == embed(["same input"])[0]


def test_hash_fallback_is_deterministic_and_bounded():
    v = _hash_vec("anything")
    assert len(v) == DIM
    assert v == _hash_vec("anything")
    assert all(-1.0 <= x < 1.0 for x in v)
    assert _hash_vec("a") != _hash_vec("b")


def test_semantic_retrieval_is_available():
    """近义句应当比无关句更相近 —— 这才叫"语义检索"。

    没装 sentence-transformers 时跳过, 并在跳过原因里写清楚当前是哈希兜底:
    这条 skip 就是这套系统"RAG 降级中"的可见信号。
    """
    if _model() is None:
        pytest.skip(
            "sentence-transformers 未安装, embed() 走 _hash_vec 兜底 —— "
            "向量无语义, RAG 的 top_k 引用近乎随机排序。"
            "要恢复语义检索需在镜像里安装 sentence-transformers (会带入 torch)。"
        )
    near = _cos(embed(["ssh authentication failure"])[0], embed(["ssh auth failed"])[0])
    far = _cos(embed(["ssh authentication failure"])[0], embed(["disk usage report"])[0])
    assert near > far, f"近义句({near:.3f}) 没有比无关句({far:.3f}) 更近"
    assert near > 0.5, f"近义句相似度只有 {near:.3f}, 不像是语义向量"
