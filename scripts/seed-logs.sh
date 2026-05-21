#!/usr/bin/env bash
# 演示数据注入 — make seed 调用
# 喂两份 fixture: Nginx 5xx spike + 应用 JSON login fail

set -euo pipefail

API="${API:-http://localhost:8000}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "[seed] generating Nginx-style log fixture..."
NGINX_FIXTURE=$(mktemp)
{
  for i in $(seq 1 200); do
    ts=$(date -u +"%d/%b/%Y:%H:%M:%S +0000")
    echo "192.168.1.$((RANDOM % 254 + 1)) - - [$ts] \"GET /api/v1/items?id=$i HTTP/1.1\" 200 1234 \"-\" \"Mozilla/5.0\""
  done
  # 5xx spike — 集中在 2 个内网 IP (后端实例挂了)
  for i in $(seq 1 50); do
    ts=$(date -u +"%d/%b/%Y:%H:%M:%S +0000")
    ip=$([ $((i % 2)) -eq 0 ] && echo "10.0.0.21" || echo "10.0.0.22")
    echo "$ip - - [$ts] \"POST /api/v1/checkout HTTP/1.1\" 502 0 \"-\" \"Mozilla/5.0\""
  done
  # admin 目录枚举 — 集中在 3 个扫描源, 次数有梯度 (.10 最多, 便于 '谁扫最多' 演示)
  scan_ips=("203.0.113.10:25" "203.0.113.11:15" "203.0.113.12:8")
  for entry in "${scan_ips[@]}"; do
    ip="${entry%%:*}"; n="${entry##*:}"
    for j in $(seq 1 "$n"); do
      ts=$(date -u +"%d/%b/%Y:%H:%M:%S +0000")
      echo "$ip - - [$ts] \"GET /admin/$RANDOM HTTP/1.1\" 404 162 \"-\" \"curl/7.68.0\""
    done
  done
  # 一条 URL 注入特征 (给 url-injection 场景演示用)
  ts=$(date -u +"%d/%b/%Y:%H:%M:%S +0000")
  echo "45.137.21.9 - - [$ts] \"GET /search?q=1%27%20OR%20%271%27=%271 HTTP/1.1\" 200 512 \"-\" \"sqlmap/1.5\""
  echo "45.137.21.9 - - [$ts] \"GET /../../etc/passwd HTTP/1.1\" 404 162 \"-\" \"python-requests/2.28\""
} > "$NGINX_FIXTURE"

echo "[seed] uploading nginx fixture..."
curl -s -X POST "$API/logs/upload" \
  -F "source=nginx" \
  -F "file=@$NGINX_FIXTURE" | python3 -m json.tool

echo ""
echo "[seed] generating app-style JSON log fixture..."
APP_FIXTURE=$(mktemp)
{
  for i in $(seq 1 100); do
    echo "{\"ts\":\"$(date -u +%FT%TZ)\",\"level\":\"INFO\",\"event\":\"login\",\"user\":\"u$i\",\"result\":\"ok\"}"
  done
  # login fail burst
  for i in $(seq 1 20); do
    echo "{\"ts\":\"$(date -u +%FT%TZ)\",\"level\":\"WARN\",\"event\":\"login\",\"user\":\"u$i\",\"result\":\"fail\",\"reason\":\"bad_password\"}"
  done
  # exception trace
  echo '{"ts":"'"$(date -u +%FT%TZ)"'","level":"ERROR","event":"unhandled","err":"NullPointerException at com.example.Service.lookup(Service.java:42)"}'
} > "$APP_FIXTURE"

curl -s -X POST "$API/logs/upload" \
  -F "source=app" \
  -F "file=@$APP_FIXTURE" | python3 -m json.tool

rm -f "$NGINX_FIXTURE" "$APP_FIXTURE"

echo ""
echo "[seed] done. open http://localhost:3000 to view"
