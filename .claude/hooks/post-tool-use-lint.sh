#!/usr/bin/env bash
# PostToolUse hook — 对应 PPT Slide 44 "PostToolUse 执行工具后检查"
#
# 工具跑完后跑 ruff/lint, 给 AI 反馈让它自己修。

set -uo pipefail   # 注意：不用 -e, 跑失败也要把信息打回去

payload=$(cat)
tool=$(echo "$payload" | python3 -c "import sys,json; print(json.load(sys.stdin).get('tool_name',''))")

if [[ "$tool" != "Edit" && "$tool" != "Write" && "$tool" != "NotebookEdit" ]]; then
  exit 0
fi

path=$(echo "$payload" | python3 -c "import sys,json; print(json.load(sys.stdin).get('tool_input',{}).get('file_path',''))")
[[ -z "$path" ]] && exit 0

case "$path" in
  *.py)
    if command -v ruff >/dev/null 2>&1; then
      out=$(ruff check "$path" --no-cache 2>&1 || true)
      if [[ -n "$out" ]]; then
        echo "[post-tool-use] ruff findings on $path:" >&2
        echo "$out" >&2
      fi
    fi
    ;;
  *.ts|*.tsx)
    # demo 不强制 (前端容器化跑)
    ;;
  *.sh)
    if command -v shellcheck >/dev/null 2>&1; then
      shellcheck "$path" >&2 || true
    fi
    ;;
esac

exit 0
