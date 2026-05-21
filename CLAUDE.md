# CLAUDE.md — 项目记忆（L1）

> 这个文件是 AI 进入这个仓库时的"第一份简报"。对应 PPT Slide 16。
> 不要把这个文件写成 README——README 是给人看的，CLAUDE.md 是给 AI Agent 看的执行约定。

## 项目身份

- **名称**：AI Log Analysis Platform
- **用途**：Vibe Coding 培训现场 Demo，**不是生产系统**
- **业务目标**：上传 Nginx/App 日志 → AI 总结异常 → 自然语言查询 → 输出可解释证据
- **演示价值**：把 Slide 22–33 的 6 步 Demo 落到能跑的代码

## 技术栈（不要换）

| 层 | 选型 | 为什么这个 |
|---|---|---|
| Backend | Python 3.11 + FastAPI + Pydantic v2 | Slide 22 明确指定，售前不要换 |
| Frontend | Next.js 14 (App Router) + Tailwind | Slide 22 指定 |
| Vector | Postgres 16 + pgvector 0.7 | 一个数据库够用，少一个组件少一个翻车点 |
| LLM 接入 | **必须经过 Envoy AI Gateway**，不要直接调 OpenAI/Anthropic | 这是 Demo 的灵魂 |
| Gateway | Envoy 1.32 + AI Gateway ext_proc 配置 | Slide 38 的具象产品 |
| 编排 | docker-compose v2 | Slide 39 要求"能兜底" |

## 目录约定（AI 改代码必须遵守）

```
backend/app/
├── api/         ← 只放 FastAPI router，每个文件 = 一个 resource
├── services/    ← 业务管道：parser / embedding / vector_store / rag
├── agents/      ← AI 协作层：analyzer / planner（少量、有边界）
├── security/    ← 输入/输出 guardrail，所有 user content 必须经过
├── gateway/     ← LLM 调用统一入口，**禁止其他模块直接 import openai/anthropic**
└── schemas.py   ← Pydantic 模型唯一来源
```

**违反目录约定的修改一律拒绝**——这是 Slide 13 "越权修改"的具体对策。

## 禁止事项（hard rules）

```
DO NOT modify:
  - .env (production secrets)
  - infra/postgres/init.sql in a non-additive way (no DROP TABLE)
  - gateway/envoy-ai-gateway/config/envoy.yaml without updating
    gateway/envoy-ai-gateway/README.md in the same commit

DO NOT add dependencies:
  - 不要装 langchain / llamaindex / haystack（这个 demo 故意手写 RAG，演示原理）
  - 不要装 redis（pgvector 就够）
  - 不要装 celery（用 FastAPI BackgroundTasks）

DO NOT bypass:
  - 任何 LLM 调用必须走 app/gateway/client.py
  - 任何用户文本必须先过 app/security/input_guard.py
```

## 必须执行（before declaring done）

```bash
# Backend
cd backend && ruff check . && pytest -q

# Frontend
cd frontend && pnpm lint && pnpm build

# 红队（上线前）
make redteam
```

测试覆盖率门槛：**核心 services 80%，API 60%**。低于门槛 = 任务未完成。

## 与 PPT Slide 对应关系（讲师 / AI 都要懂）

| Slide | 对应文件/目录 | 用途 |
|---|---|---|
| 14 Context Stack | 这个 CLAUDE.md + DESIGN.md + WORKFLOW.md | L1/L2/L3 |
| 15 Reference Structure | `backend/app/` 五层目录 | 演示项目结构 |
| 17 Workflow Engineering | `WORKFLOW.md` | 阶段协议 |
| 18 Quality Shift Left | `backend/pyproject.toml` 里 ruff/mypy + tests/ | 质量左移 |
| 19 Guardrails | `.claude/hooks/` + `backend/app/security/` | 运行时护栏 |
| 38 LLM Gateway | `gateway/envoy-ai-gateway/` | 模型控制面 |
| 44 PreToolUse / PostToolUse | `.claude/hooks/*.sh` | 真实可跑的 hook |
| 48 Risk Matrix | `security/` 整个目录 | 风险矩阵的可执行版 |

## 风险与边界（AI 必须主动提醒人）

如果有人（包括 AI 自己）想要：
- 装 langchain → **停下来问人**，违反"演示原理"原则
- 改 init.sql 用 DROP → **拒绝**，写迁移而不是删表
- 直接调 openai SDK 绕开 gateway → **拒绝**，告诉调用方走 `app/gateway/client.py`
- 把 secret 写进代码 → **拒绝**，用 `.env` 和 `os.environ`

## 给售前/销售看 CLAUDE.md 的话术

> "客户问'AI 怎么不会乱改代码'——你打开 CLAUDE.md 给他看：禁止事项、目录约定、必须执行项。
> AI 不是被 prompt 约束，是被这份**工程契约**约束。
> 这就是 Slide 7 说的'用 Context 让 AI 理解项目，用 Workflow 管住执行阶段'的具体落地。"
