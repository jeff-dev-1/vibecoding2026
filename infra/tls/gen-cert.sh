#!/usr/bin/env bash
# 生成 vibe-coding.demo.local 自签证书 (带 SAN)
set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)/certs"
mkdir -p "$DIR"
DOMAIN="vibe-coding.demo.local"

if [[ -f "$DIR/demo.crt" ]]; then
  echo "[cert] $DIR/demo.crt 已存在, 跳过"
  exit 0
fi

# 用临时 config 写 SAN — 兼容老 openssl (1.0.2 无 -addext)
CNF="$(mktemp)"
cat > "$CNF" << EOF
[req]
distinguished_name = dn
x509_extensions = v3
prompt = no
[dn]
CN = $DOMAIN
O = Vibe Coding Demo
[v3]
subjectAltName = DNS:$DOMAIN
EOF

openssl req -x509 -nodes -newkey rsa:2048 -days 825 \
  -keyout "$DIR/demo.key" -out "$DIR/demo.crt" \
  -config "$CNF"
rm -f "$CNF"

echo "[cert] 自签证书已生成: $DIR/demo.crt (SAN=$DOMAIN, 825 天)"
echo "[cert] 浏览器会提示自签名警告, 点继续即可; 或把 demo.crt 导入信任。"
