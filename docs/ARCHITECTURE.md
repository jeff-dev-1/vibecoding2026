# 架构与技术选型总览

> 本文梳理 vibe-coding demo 当前各层用到的技术栈、组件职责与数据流，作为新人/讲师的速查入口。
> 与 `DESIGN.md`（设计决策）互补：DESIGN 讲"为什么这么设计"，本文讲"用了什么、怎么连"。

## 1. 整体数据流

```
浏览器 ──/api/*──▶ Next.js (rewrite 反代) ──▶ FastAPI backend
                                                  │
                  ┌───────────────────────────────┼───────────────────────────────┐
                  ▼                                ▼                               ▼
          AI Gateway (Envoy / Portkey)     Postgres + pgvector            本地 embedding
          ──▶ DeepSeek / Qwen 上游          (RAG 向量 + 报告表)          (bge-small, 384 维)
```

外层：`nginx-tls` 做 TLS 终止；`otel-collector` 收遥测。

浏览器只对外暴露一个域，所有 `/api/*` 由 Next.js 在服务端 rewrite 反代到 FastAPI（见 `frontend/next.config.mjs`、`frontend/src/lib/api.ts` 的 `BASE = "/api"`），因此**前端无需处理 CORS**。

## 2. 前端 — Next.js 全家桶

| 技术 | 版本 | 用途 |
|---|---|---|
| Next.js | 14.2 | 框架；`/api/*` rewrite 反代到 backend |
| React | 18.3 | UI |
| TypeScript | 5.6 | 全量类型，`lib/api.ts` 定义前后端契约 |
| Tailwind CSS | 3.4（+ postcss / autoprefixer） | 样式 |
| Recharts | 2.13 | 可观测性 / 报告图表 |
| clsx | 2.1 | className 拼接 |
| Vitest | 2.1 | 前端单测 |

首屏逻辑（`src/app/page.tsx`）：登录后自动 `listJobs()` 取最近一次完成的分析 → `getJob(id)` 轮询（2s）直到 `done/failed`，做到"登录即见结果、不空屏"。

## 3. 后端 — FastAPI + 异步 Python

| 技术 | 版本 | 用途 |
|---|---|---|
| FastAPI | 0.115 | API 框架 |
| Uvicorn[standard] | 0.32 | ASGI server |
| Pydantic | 2.9 | schema 校验（`app/schemas.py`） |
| SQLAlchemy[asyncio] | 2.0 | 异步 ORM |
| asyncpg | 0.30 | Postgres 异步驱动 |
| pgvector | 0.3（py 客户端） | 向量列类型 |
| httpx | 0.27 | 异步调 LLM 上游 |
| python-multipart | 0.0.12 | 日志文件上传 |
| sentence-transformers | — | **本地** embedding（`BAAI/bge-small-en-v1.5`，384 维）；离线时退化为 sha256 hash 向量 |
| OpenTelemetry（api/sdk/otlp + fastapi 自动埋点） | 1.28 | 遥测 |
| Ruff / pytest / pytest-asyncio | — | lint / 测试 |

**应用结构**（`backend/app/`）：

- `api/` — `chat` · `logs` · `gateway`（路由层）
- `services/` — `rag` · `embedding` · `vector_store` · `log_parser` · `traffic`
- `gateway/` — `client`（LLM 网关客户端） · `koi_client`（供应链）
- `security/` — `input_guard`（运行时输入护栏） · `supply_chain`
- `agents/analyzer` — 日志分析 agent
- `observability.py` / `telemetry.py` — 应用内可观测

**上传链路**（`api/logs.py`）：`upload` 秒返回，重活（chunk + embedding + 入库 + LLM 分析）全进后台 job；前端轮询 `GET /logs/jobs/{id}` 取结果。

## 4. 数据层 — Postgres + pgvector

- 镜像：`pgvector/pgvector:pg16`。
- 一套库同时承担 **RAG 向量检索**（`log_chunks` + ivfflat/向量索引）和**报告表族**（`analysis_jobs`、`redteam_reports`、`pentest_reports`、`supply_chain_reports`）。
- `infra/postgres/init.sql` 建表，约定**只增不删**（无 `DROP TABLE`，列用 `IF NOT EXISTS` / `ADD COLUMN` 增量演进）。
- 关键索引已就位：`analysis_jobs(created_at DESC)`、各报告表 `created_at DESC`、`log_chunks` 向量索引。

## 5. AI 网关层（可切换双实现）

| 网关 | 镜像 | 说明 |
|---|---|---|
| Envoy AI Gateway（默认） | `envoyproxy/envoy:v1.32` | inline 数据面；`config/envoy.yaml` 含 **Lua guardrail** + rate-limit + DeepSeek/Qwen 路由 |
| Portkey OSS（可切换） | `portkeyai/gateway:latest` | 无状态代理，`GATEWAY_PROVIDER=portkey` 切换 |
| mock-llm | 自建 Dockerfile | 离线 / CI 时的假上游 |

- 上游：**DeepSeek + Qwen 双路由**，单请求可经 `ChatRequest.backend` 覆盖默认（`LLM_BACKEND`）。
- 配置入口：`backend/app/config.py`（`LLM_GATEWAY_URL`、`GATEWAY_PROVIDER`、`DEEPSEEK_API_KEY`、`QWEN_API_KEY` 等）。
- ⚠️ 约定：改 `gateway/envoy-ai-gateway/config/envoy.yaml` 必须同 commit 更新其 `README.md`。

## 6. 可观测性

- **OpenTelemetry** → `otel-collector`（`otel/opentelemetry-collector-contrib:0.115`），当前 exporter 为 debug（Grafana 目录预留）。
- **应用内轻量可观测**（`observability.py`）：内存 ring buffer，保留最近 200 次 LLM 调用，实时聚合**错误率 / guardrail 拦截数 / 按 backend 的 p50·p95 延迟**，刻意不入库（高频、demo 用）。前端有独立 tab 展示。

## 7. 安全 — 四层纵深 + CI 门禁

| 子目录 | 工具 / 技术 | 防护层 |
|---|---|---|
| `security/deps` | Trivy + SBOM 生成 | 依赖扫描 |
| `security/supply-chain` | Koi/Koidex API（Pattern A）+ 自写 YAML parser（`scan.py`），三态门禁 **BLOCK / REQUEST_APPROVAL / PASS** | 供应链 |
| `security/red-team` | Promptfoo（`promptfoo.yaml` + `run.py`） | LLM 红队 |
| `security/llm-scan` | Garak（`garak-config.yaml`） | LLM 漏洞扫描 |
| `security/pentest` | OWASP ZAP baseline + Nuclei（docker），无 ZAP 时 builtin urllib 头检查兜底 | 运行时 DAST（report-only） |
| `security/runtime` + `.claude/hooks` | PreToolUse/PostToolUse hook + `input_guard.py` + Envoy Lua | 运行时三层护栏 |

运行时护栏的纵深：开发期 hook（拦 AI 工具调用） → backend `input_guard`（拦用户请求） → Envoy Lua（最后一道，任何走网关的请求）。任一层被绕过/替换，下一层仍能挡。

## 8. CI/CD 与本地编排

- **Jenkins**（`Jenkinsfile`，仅内网 Gitea）— podTemplate 临时 pod + harbor 镜像源。Stage 链：
  `Checkout → Build Description → Docker Build → Docker Push → Deploy to VM → Health Check → Smoke(DeepSeek 端到端) → Red Team → Pentest(DAST) → Supply Chain Gate → Notify`
  其中 Red Team / Pentest 为 report-only（不阻断），Supply Chain Gate 为硬门禁（中风险需 `approvals.yaml` 审批留痕才放行）。
- **GitHub Actions**（`.github/workflows/ci.yml`）— 公开仓 CI。
- **docker-compose**（`docker-compose.yml`，8 服务）：`postgres` · `mock-llm` · `envoy-ai-gateway` · `gateway-portkey` · `backend` · `frontend` · `nginx-tls` · `otel-collector`。
- **Makefile** — 本地一键任务（`make pentest` 等）。

## 9. 部署形态与双远端约定

- 内网 **Gitea**（`origin`）：保留 `Jenkinsfile` 与内部信息，**不打 tag**。
- 公开 **GitHub**（`github`）：已脱敏（`git rm` 掉 Jenkinsfile、去内部地址/凭据），**打 `training-step-*` tag 于 `tutorial` 教学线**。
- 两端历史**无共同祖先**（disconnected），靠 cherry-pick + 脱敏维护，禁止直接互推 main。

## 10. 选型主线一句话

**"React/TS 控制台（Next.js）+ Python AI 后端（FastAPI）"**，中间用 Next.js rewrite 粘合；AI 流量统一收口到**可切换的 AI 网关**（Envoy/Portkey）做护栏与双上游路由；数据/向量压在 **Postgres+pgvector** 一套里；安全做成**四层纵深 + CI 门禁**，可观测走 **OTel**。整套是当下 AI 应用 + 安全 demo 的典型落地形态。
