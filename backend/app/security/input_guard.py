"""Input-side guardrail.

Slide 19 / 44 / 48 在 backend 这一层的对应实现。
本地兜底——Gateway 层挂了或被绕过时还能拦一层。

DEMO 取舍：用规则。生产应当并联调用 ML 模型（protectai/deberta-v3 之类）。
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Literal

GuardVerdict = Literal["pass", "redact", "block"]


_INJECTION_PATTERNS = [
    re.compile(r"ignore\s+(all\s+)?previous\s+instructions", re.I),
    re.compile(r"disregard\s+the\s+above", re.I),
    re.compile(r"you\s+are\s+now\s+(dan|developer\s+mode)", re.I),
    re.compile(r"</?(system|admin|root)>", re.I),
    re.compile(r"<\|im_start\|>system", re.I),
    re.compile(r"###\s*system\s*:", re.I),
]

_PII_PATTERNS = [
    (re.compile(r"\b[\w.+-]+@[\w-]+\.[\w.-]+\b"), "EMAIL"),
    (re.compile(r"(?<!\d)1[3-9]\d{9}(?!\d)"), "PHONE_CN"),
    (re.compile(r"\b\d{15}|\d{18}\b"), "ID_CARD_CN"),
    (re.compile(r"\b(?:\d[ -]*?){13,16}\b"), "CARD"),
    (re.compile(r"\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b"), "IP"),
]


@dataclass
class GuardResult:
    verdict: GuardVerdict
    cleaned_text: str
    reasons: list[str]


def check(text: str) -> GuardResult:
    reasons: list[str] = []

    for pat in _INJECTION_PATTERNS:
        if pat.search(text):
            reasons.append(f"prompt_injection:{pat.pattern}")
            return GuardResult(verdict="block", cleaned_text="", reasons=reasons)

    cleaned = text
    for pat, label in _PII_PATTERNS:
        if pat.search(cleaned):
            reasons.append(f"pii:{label}")
            cleaned = pat.sub(f"[REDACTED_{label}]", cleaned)

    verdict: GuardVerdict = "redact" if reasons else "pass"
    return GuardResult(verdict=verdict, cleaned_text=cleaned, reasons=reasons)
