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
  # 5xx spike
  for i in $(seq 1 50); do
    ts=$(date -u +"%d/%b/%Y:%H:%M:%S +0000")
    echo "10.0.0.$((RANDOM % 254 + 1)) - - [$ts] \"POST /api/v1/checkout HTTP/1.1\" 502 0 \"-\" \"Mozilla/5.0\""
  done
  # admin scan
  for i in $(seq 1 30); do
    ts=$(date -u +"%d/%b/%Y:%H:%M:%S +0000")
    echo "203.0.113.$((RANDOM % 254 + 1)) - - [$ts] \"GET /admin/$RANDOM HTTP/1.1\" 404 162 \"-\" \"curl/7.68.0\""
  done
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
