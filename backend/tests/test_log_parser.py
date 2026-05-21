from app.services.log_parser import split


def test_splits_lines():
    raw = "\n".join(f"line {i}" for i in range(1, 11))
    chunks = split(raw, chunk_lines=3)
    assert len(chunks) == 4
    assert chunks[0].line_start == 1 and chunks[0].line_end == 3
    assert chunks[-1].line_end == 10


def test_empty_input():
    assert split("") == []


def test_single_line():
    chunks = split("only one", chunk_lines=10)
    assert len(chunks) == 1
    assert chunks[0].text == "only one"
    assert chunks[0].line_end == 1
