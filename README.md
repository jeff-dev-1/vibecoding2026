# AI Log Analysis Platform · Vibe Coding Demo

> 配套 PPT《Vibe Coding 与 AI Native 开发实战》Session 2 现场 Demo。
> 这不是一个产品，是一份**可演示、可复现、可治理**的培训样本，让讲师在 3 小时课程里把 PPT Slide 22–33（6 步 Demo Flow）+ Slide 44/48（治理）+ Slide 51（业务方向）全部落到能跑的代码上。

## 一句话

上传 Nginx / 应用日志 → AI 总结异常流量 → 自然语言查询日志问题 → 输出可解释证据。
**真正的看点不是 RAG，而是这一切都走 Envoy AI Gateway，并被 Promptfoo / Garak 红队过。**

## 谁该读哪一份

| 角色 | 先读 | 再看 |
|---|---|---|
| 讲师 | [`INSTRUCTOR.md`](./INSTRUCTOR.md) | `WORKFLOW.md` + 现场跑 `make demo` |
| 研发 | [`CLAUDE.md`](./CLAUDE.md) → [`DESIGN.md`](./DESIGN.md) | `backend/` + `gateway/envoy-ai-gateway/` |
| 售前 / 解决方案 | [`INSTRUCTOR.md`](./INSTRUCTOR.md) Section "客户提问对照表" | `gateway/portkey/README.md`（产品对比）+ `security/` |
| 销售 / 管理 | [`docs/PRD.md`](./docs/PRD.md) + 这页"客户价值"那段 | 跳过技术细节 |

## 客户价值（销售/管理可直接用）

| 客户问 | 这个 Demo 怎么回答 |
|---|---|
| "AI 写代码靠谱吗？" | `make test` 看 pytest；`make redteam` 看 Promptfoo HTML 报告——**不是相信 AI，是验证 AI** |
| "数据不外发怎么办？" | `gateway/envoy-ai-gateway/config/policy-guardrails.yaml` 做 PII 脱敏；模型上游可换本地 vLLM |
| "成本怎么控？" | Envoy AI Gateway 的 token rate-limit + 语义缓存（`policy-rate-limit.yaml`） |
| "上线后出问题怎么办？" | OTel Collector 把每一次 LLM 调用打到 Grafana，Slide 41 的 Observability 平面 |
| "怎么试点？" | 这个 repo 就是试点路线的 Phase 1 → Phase 2 模板（参考 PPT Slide 46 + `INSTRUCTOR.md` 90 天计划） |

## 现场 Demo 路径（6+1 步，对应 PPT Slide 24）

每一步对应一个 git tag，讲师可以 `git checkout step-N` 直接跳到对应状态：

```
step-0 : 空仓 + CLAUDE.md + WORKFLOW.md     ← 讲"工程记忆"
step-1 : + docs/PRD.md                       ← Prompt 0：需求澄清
step-2 : + 完整目录骨架 + docker-compose     ← Prompt 1：项目骨架
step-3 : + backend + frontend + gateway     ← Prompt 2~4：核心实现
step-4 : + tests + CI                        ← Prompt 5：测试
step-5 : 故意注入一个 bug 让 AI 修复          ← Prompt 6：Debug
step-6 : + Review 报告 + Spec Compliance     ← Prompt 7：Review
step-7 : + Promptfoo + Garak 红队报告 (加分)  ← 上线前红队
```

## 快速开始

```bash
# 0. 准备环境（macOS / Linux，需要 Docker 24+）
cp .env.example .env
# 编辑 .env 把 OPENAI_API_KEY 填上；不填也能跑，会走 mock-llm

# 1. 拉起整个 demo
make demo
# 等于：docker compose up -d --build

# 2. 打开
open http://localhost:3000        # Dashboard
open http://localhost:8090/health # Envoy AI Gateway 健康检查
open http://localhost:8000/docs   # FastAPI Swagger

# 3. 喂一些日志
make seed

# 4. 跑红队
make redteam      # Promptfoo
make scan         # Garak
make sbom         # Trivy + Syft

# 5. 收摊
make down
```

## 目录速览（讲师手册式）

```
demo/
├── CLAUDE.md           ← L1 项目记忆     ↘
├── DESIGN.md           ← L2 架构约束       Slide 14 Context Stack
├── WORKFLOW.md         ← L3 阶段协议     ↗
├── INSTRUCTOR.md       ← 讲师手册（6+1 步逐字稿 + 兜底）
│
├── docs/PRD.md         ← Step 1 产物：需求澄清
├── docs/acceptance-criteria.md
│
├── backend/            ← Step 3 产物：FastAPI（含 services/agents/security/gateway 五层）
├── frontend/           ← Step 3 产物：Next.js Dashboard
│
├── gateway/
│   ├── envoy-ai-gateway/   ← 可跑：本地 docker-compose；也含生产 K8s CRD 模板
│   └── portkey/            ← 对比：售前要回答的"为什么不用 SaaS"
│
├── infra/              ← Postgres+pgvector init.sql + OTel Collector
│
├── .claude/
│   ├── hooks/          ← Slide 44 PreToolUse / PostToolUse 真实可执行
│   └── agents/         ← Slide 42 Multi-Agent：reviewer / tester / architect
│
├── security/           ← Slide 48 风险矩阵的可执行版
│   ├── red-team/       ← Promptfoo（4 类攻击：注入/越狱/PII/工具滥用）
│   ├── llm-scan/       ← NVIDIA Garak
│   ├── deps/           ← Trivy + Syft SBOM
│   └── runtime/        ← 指向 .claude/hooks
│
├── evaluation/         ← Golden dataset，回归测试
└── scripts/            ← Demo 兜底（inject-bug / seed / run-redteam）
```

## 这个 demo 故意不做的

PPT Slide 39 强调"Demo 要能兜底"，所以**故意取舍**：

- ❌ 不用真模型作为默认上游（`mock-llm` 拦截所有 `/v1/messages`），讲师网络挂了照样能演
- ❌ 不上 K8s（CRD 文件存在但不部署），docker-compose 一键起
- ❌ 不做用户认证（Envoy AI Gateway 那一层做 API Key 鉴权就够课程演示用）
- ❌ 不做产品级前端（Tailwind 默认样式，重点在交互流转，不在视觉）

## 反面案例可演示项

PPT Slide 13 / 19 强调反面案例的价值。这个 repo 里**埋了三处**：

| 位置 | 反面案例 | 演示话术 |
|---|---|---|
| `backend/app/api/chat.py` | 故意不做输入脱敏，让 PII 直接进 LLM | "看 Promptfoo 怎么发现的" |
| `scripts/inject-bug.sh` | 改一行让 RAG 检索失效 | "Claude Code 怎么从失败日志最小修复" |
| `gateway/envoy-ai-gateway/config/policy-guardrails.yaml` | 给两版：宽松 vs 严格 | "客户问'为什么需要 Gateway'就 diff 这两个文件" |

## 进一步阅读

- PPT 原文：`../docs/Vibe_Coding_AI_Native培训.pptx`
- Envoy AI Gateway 官方：https://aigateway.envoyproxy.io/
- Promptfoo：https://promptfoo.dev/
- NVIDIA Garak：https://github.com/NVIDIA/garak
