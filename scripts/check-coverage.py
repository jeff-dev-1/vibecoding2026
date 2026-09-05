#!/usr/bin/env python3
"""按 CLAUDE.md 的门槛逐层核对覆盖率。

CLAUDE.md 写着"核心 services 80%，API 60%，低于门槛 = 任务未完成"。写着不等于挡得住:
这条规则此前一直是一句话, 实测总体只有 29%, 三个 API 文件全是 0% —— 没人发现,
因为没有任何东西会因此变红。

pytest-cov 只支持一个全局的 --cov-fail-under, 而这里的门槛是**分层**的:
总体达标完全可能掩盖某一层是 0。所以在这里逐文件核。

用法 (在 backend/ 下):
    python -m pytest -q --cov=app --cov-report=json:.coverage.json
    python ../scripts/check-coverage.py backend/.coverage.json
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

# 每条规则: (人类可读的层名, 路径前缀, 门槛%)。
# 只管 CLAUDE.md 点名的两层 —— 其余文件不设线, 免得为了凑数写没意义的测试。
RULES = [
    ("核心 services", "app/services/", 80),
    ("API", "app/api/", 60),
]

# 明确豁免的文件, 附理由。豁免必须写清楚为什么, 否则这份名单会慢慢变成"全都不用测"。
EXEMPT: dict[str, str] = {}


def main(path: str) -> int:
    data = json.loads(Path(path).read_text())
    files = data["files"]

    failures: list[str] = []
    print(f"{'文件':<40} {'覆盖率':>8}  门槛")
    print("-" * 62)

    for layer, prefix, threshold in RULES:
        members = sorted(f for f in files if f.startswith(prefix) and not f.endswith("__init__.py"))
        if not members:
            failures.append(f"{layer}: 一个文件都没匹配到 (前缀 {prefix} 写错了?)")
            continue
        for f in members:
            pct = files[f]["summary"]["percent_covered"]
            if f in EXEMPT:
                print(f"{f:<40} {pct:7.0f}%  豁免 ({EXEMPT[f]})")
                continue
            ok = pct >= threshold
            mark = "✓" if ok else "✗"
            print(f"{f:<40} {pct:7.0f}%  ≥{threshold}% {mark}")
            if not ok:
                failures.append(f"{f} 只有 {pct:.0f}%, {layer}门槛是 {threshold}%")

    total = data["totals"]["percent_covered"]
    print("-" * 62)
    print(f"{'总体':<40} {total:7.0f}%")

    if failures:
        print("\n✗ 覆盖率未达 CLAUDE.md 的门槛:")
        for f in failures:
            print(f"  - {f}")
        return 1
    print("\n✓ 分层覆盖率全部达标")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1] if len(sys.argv) > 1 else "backend/.coverage.json"))
