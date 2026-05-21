#!/usr/bin/env bash
# PreToolUse hook — 对应 PPT Slide 44 "PreToolUse 执行工具前拦截"
#
# 输入: Claude Code 通过 stdin 传 JSON, 含 tool_name + tool_input
# 输出: 退出码 0 = 允许; 非 0 = 拦截 (stderr 信息会被 AI 看到)
#
# 这是培训现场最容易让客户"啊就这一行"的演示物。

set -euo pipefail

payload=$(cat)
tool=$(echo "$payload" | python3 -c "import sys,json; print(json.load(sys.stdin).get('tool_name',''))")

if [[ "$tool" == "Bash" ]]; then
  cmd=$(echo "$payload" | python3 -c "import sys,json; print(json.load(sys.stdin).get('tool_input',{}).get('command',''))")

  # 1. 绝对禁止的危险命令
  for danger in "rm -rf /" "rm -rf ~" "dd if=" "mkfs" ":(){:|:&};:" "chmod -R 777 /"; do
    if [[ "$cmd" == *"$danger"* ]]; then
      echo "BLOCKED by .claude/hooks/pre-tool-use-block-prod.sh: dangerous pattern '$danger'" >&2
      exit 1
    fi
  done

  # 2. 生产相关字眼 — 培训 demo 演示用
  if echo "$cmd" | grep -qiE '(prod|production)'; then
    if echo "$cmd" | grep -qiE '(drop|delete|truncate|rm |kubectl|terraform apply|helm)'; then
      echo "BLOCKED: command targets production with destructive verb" >&2
      echo "If this is intentional, ask a human to run it." >&2
      exit 1
    fi
  fi

  # 3. 别动 .env
  if echo "$cmd" | grep -qE 'rm.*\.env|>\s*\.env\b'; then
    echo "BLOCKED: .env writes/deletes must go through human" >&2
    exit 1
  fi
fi

# 4. Write/Edit 工具 — 禁止改 CLAUDE.md 的禁止区块
if [[ "$tool" == "Edit" || "$tool" == "Write" ]]; then
  path=$(echo "$payload" | python3 -c "import sys,json; print(json.load(sys.stdin).get('tool_input',{}).get('file_path',''))")
  case "$path" in
    *.env|*production.yaml|*infra/postgres/init.sql)
      echo "BLOCKED: $path is in CLAUDE.md 'DO NOT modify' list" >&2
      echo "Reason: ${path##*/} is a protected resource for this demo" >&2
      exit 1
      ;;
  esac
fi

exit 0
