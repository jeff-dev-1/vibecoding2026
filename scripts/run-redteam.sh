#!/usr/bin/env bash
# Promptfoo 红队 — make redteam 调用

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

mkdir -p "$ROOT/security/red-team/reports"

# 确保 demo 在跑
if ! curl -s -m 2 http://localhost:8000/health >/dev/null; then
  echo "[redteam] backend not reachable; run 'make demo' first"
  exit 1
fi

echo "[redteam] running Promptfoo (in docker)..."
docker run --rm \
  --network=host \
  -v "$ROOT/security/red-team:/work" \
  -w /work \
  node:20-alpine \
  sh -c "npm install -g promptfoo@latest >/dev/null 2>&1 && promptfoo eval -c promptfoo.yaml --output reports/results.json && promptfoo view --no-open --port 0 > /dev/null 2>&1 &"

# 生成 HTML 报告
if [[ -f "$ROOT/security/red-team/reports/results.json" ]]; then
  echo "[redteam] HTML report:"
  echo "  $ROOT/security/red-team/reports/results.json"
  echo "  npx promptfoo view  ← 浏览器查看"
fi

echo ""
echo "[redteam] done. open the report:"
echo "  $ROOT/security/red-team/reports/"
