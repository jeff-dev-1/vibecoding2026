"""AC-4: 任何 LLM 调用必须经过 app/gateway/client.py。

这条测试是 CLAUDE.md 硬规则的强制执行点。
"""
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parent.parent / "app"
FORBIDDEN = re.compile(r"^\s*(?:from|import)\s+(openai|anthropic)\b", re.M)


def test_no_direct_llm_sdk_import_outside_gateway():
    offenders = []
    for py in ROOT.rglob("*.py"):
        if "gateway" in py.parts:
            continue
        src = py.read_text(encoding="utf-8")
        if FORBIDDEN.search(src):
            offenders.append(str(py.relative_to(ROOT)))
    assert not offenders, (
        f"direct LLM SDK import found in {offenders}. "
        "All LLM calls must go through app/gateway/client.py per CLAUDE.md."
    )
