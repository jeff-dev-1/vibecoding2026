#!/usr/bin/env bash
# 公开仓的泄露闸门。
#
# 这个仓库是公开的, 而它同时是内部演示环境的部署源 —— 两件事之间只隔着"有没有人
# 记得检查"。历史上已经漏过两轮:
#   - 一个默认登录口令写在 5 处文档 + Jenkinsfile 的真赋值里 (后者会写进每台新
#     部署机的 .env, 等于每台机器一起来就带一道人人能开的门)
#   - 内网 registry 主机名和个人邮箱写死在 Jenkinsfile 里
# 两次都是人工发现的。人工发现意味着下次也可能发现不了, 所以把它变成一条会红的检查。
#
# 只扫 git 跟踪的文件 —— 未跟踪的本地文件不会被推上去, 不该在这里制造噪音。
#
# 跑: bash scripts/check-secrets.sh
set -uo pipefail
cd "$(dirname "$0")/.."

fail=0
report() { echo "✗ $1"; shift; printf '    %s\n' "$@"; fail=1; }

# ── 1. 凭证形态 ─────────────────────────────────────────────────────────
# 只列**形态明确**的东西。宽泛的 "password" 关键词会命中一堆变量名和文档,
# 噪音大到没人看 —— 那样的闸门等于没有。
CRED_RE='sk-[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9]{20,}|gho_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|xox[baprs]-[A-Za-z0-9-]{10,}|AIza[A-Za-z0-9_-]{30,}|-----BEGIN [A-Z ]*PRIVATE KEY-----'
# AKIAIOSFODNN7EXAMPLE 是 AWS 官方文档里的示例 key, 红队用它测护栏能不能识别 ——
# 是测试夹具, 不是凭证。真 key 仍会被 AKIA 规则抓到。
hits=$(git grep -nIE "$CRED_RE|AKIA[0-9A-Z]{16}" -- . 2>/dev/null \
       | grep -v 'AKIAIOSFODNN7EXAMPLE' || true)
[ -n "$hits" ] && report "发现疑似凭证:" "$hits"

# ── 2. .env / 私钥类文件入库 ────────────────────────────────────────────
files=$(git ls-files | grep -E '(^|/)\.env$|(^|/)\.env\.[a-z]+$|\.(pem|p12|pfx|jks)$|id_rsa|id_ed25519' \
        | grep -v '\.env\.example$' || true)
[ -n "$files" ] && report "不该入库的文件:" "$files"

# ── 3. .env.example 的凭证字段必须为空 ──────────────────────────────────
# 这个文件是模板, 任何一个字段带上真值都会被照抄进真实 .env, 并且是公开的。
if [ -f .env.example ]; then
  filled=$(grep -nE '^(DEMO_ACCESS_CODE|DEMO_PASSWORD|SESSION_SECRET|[A-Z_]*API_KEY)=.+' .env.example \
           | grep -vE '=(\s*|demo-key-not-secret)$' || true)
  [ -n "$filled" ] && report ".env.example 里有非空凭证:" "$filled"
fi

# ── 4. 内网拓扑 ─────────────────────────────────────────────────────────
# 不是凭证, 但公开仓不必对外公布内部 DNS 命名。demo.imilos.com 是主动发布的
# 公开站点, 不在此列。
infra=$(git grep -nIE '[a-z0-9-]+\.milos\.local|@imilos\.com' -- . 2>/dev/null || true)
[ -n "$infra" ] && report "内网主机名或内部邮箱:" "$infra"

if [ "$fail" -eq 0 ]; then
  echo "✓ 未发现凭证、内网拓扑或不该入库的文件"
fi
exit "$fail"
