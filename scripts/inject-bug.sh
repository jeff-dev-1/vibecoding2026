#!/usr/bin/env bash
# Demo Step 5 — 故意注入一个 bug，让 AI 演示 debug 流程
# 对应 PPT Slide 32
#
# 注入位置: backend/app/services/log_parser.py 的 split() — off-by-one
# 让 line_end 少 1, 导致 test_log_parser.py::test_splits_lines 失败

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TARGET="$ROOT/backend/app/services/log_parser.py"

if grep -q "line_end=start + len(window) - 1" "$TARGET"; then
  echo "[inject-bug] bug already injected. nothing to do."
  exit 0
fi

# 用 sed 改 1 个字符
sed -i.bak 's/line_end=start + len(window)/line_end=start + len(window) - 1/' "$TARGET"

echo "[inject-bug] off-by-one injected into $TARGET"
echo ""
echo "Now run:"
echo "  cd $ROOT/backend && pytest tests/test_log_parser.py -v"
echo ""
echo "It WILL fail. Then ask Claude Code:"
echo '  "请分析这个 pytest 失败。列出 3 个可能根因，做最小修改，跑测试验证。"'
echo ""
echo "To restore: git checkout $TARGET   (or run: bash scripts/inject-bug.sh --restore)"

if [[ "${1:-}" == "--restore" ]]; then
  mv "$TARGET.bak" "$TARGET"
  echo "[restore] done."
fi
