#!/bin/sh
# Envoy entrypoint — 用 sed 把 .env 里的 DEEPSEEK_API_KEY 注入到 envoy 配置
set -eu

TMPL="${ENVOY_TEMPLATE:-/etc/envoy/envoy-deepseek.yaml.tmpl}"
OUT="${ENVOY_OUT:-/etc/envoy/envoy.yaml}"

if [ -z "${DEEPSEEK_API_KEY:-}" ]; then
  echo "[entrypoint] WARNING: DEEPSEEK_API_KEY not set; upstream calls will fail with 401"
  KEY="sk-placeholder-please-set-DEEPSEEK_API_KEY"
else
  KEY="${DEEPSEEK_API_KEY}"
fi

sed "s|__DEEPSEEK_API_KEY__|${KEY}|g" "${TMPL}" > "${OUT}"
echo "[entrypoint] rendered ${OUT} from ${TMPL}"

exec envoy -c "${OUT}" --log-level "${ENVOY_LOG_LEVEL:-info}"
