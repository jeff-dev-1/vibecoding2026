#!/bin/sh
# Envoy entrypoint — 把 DEEPSEEK_API_KEY / QWEN_API_KEY 注入到 envoy 配置
set -eu

TMPL="${ENVOY_TEMPLATE:-/etc/envoy/envoy-deepseek.yaml.tmpl}"
OUT="${ENVOY_OUT:-/etc/envoy/envoy.yaml}"

if [ -z "${DEEPSEEK_API_KEY:-}" ]; then
  echo "[entrypoint] WARNING: DEEPSEEK_API_KEY not set; DeepSeek upstream calls will 401"
  DSK="sk-placeholder-please-set-DEEPSEEK_API_KEY"
else
  DSK="${DEEPSEEK_API_KEY}"
fi

if [ -z "${QWEN_API_KEY:-}" ]; then
  echo "[entrypoint] WARNING: QWEN_API_KEY not set; Qwen upstream calls will 401"
  QWK="sk-placeholder-please-set-QWEN_API_KEY"
else
  QWK="${QWEN_API_KEY}"
fi

# 用 | 做分隔符避免 key 内有 / 引发问题
sed -e "s|__DEEPSEEK_API_KEY__|${DSK}|g" \
    -e "s|__QWEN_API_KEY__|${QWK}|g" \
    "${TMPL}" > "${OUT}"
echo "[entrypoint] rendered ${OUT} from ${TMPL}; deepseek + qwen upstreams configured"

exec envoy -c "${OUT}" --log-level "${ENVOY_LOG_LEVEL:-info}"
