# DESIGN.md — 架构约束（L2）

> 对应 PPT Slide 14 Context Stack 的第二层、Slide 23 Demo Architecture。
> 这份文档讲**为什么这么设计**，让 AI 理解架构取舍。

## 1. 架构总览

```
┌──────────────┐       ┌────────────────────────────────┐
│  Next.js     │       │      FastAPI (backend)         │
│  Dashboard   │ ────► │  ┌──────┐  ┌──────────────┐    │
│  :3000       │       │  │ api/ │─►│ services/    │    │
└──────────────┘       │  └──────┘  │ rag pipeline │    │
                       │            └──────┬───────┘    │
                       │  ┌─────────────┐  │            │
                       │  │ security/   │◄─┤            │
                       │  │ input_guard │  │            │
                       │  └─────────────┘  ▼            │
                       │            ┌──────────────┐    │
                       │            │ gateway/     │    │
                       │            │ client.py    │    │
                       │            └──────┬───────┘    │
                       └───────────────────┼────────────┘
                                           │
                                           ▼
                       ┌────────────────────────────────┐
                       │  Envoy AI Gateway :8080         │
                       │  ├─ Auth / Rate-limit / Cache   │
                       │  ├─ PII Guardrail (ext_proc)    │
                       │  └─ Prompt Injection Detector   │
                       └──────────────┬──────────────────┘
                                      │
                       ┌──────────────┴────────────────┐
                       ▼                               ▼
              ┌──────────────────┐          ┌──────────────────┐
              │ mock-llm :11434  │          │ OpenAI / Claude  │
              │ (默认上游)        │          │ (可选, .env 配)  │
              └──────────────────┘          └──────────────────┘

                       ┌─────────────────────────────┐
                       │ Postgres 16 + pgvector      │
                       │ ├─ logs (原始日志)            │
                       │ ├─ log_chunks (embeddings)   │
                       │ └─ analysis_jobs            │
                       └─────────────────────────────┘

                       ┌─────────────────────────────┐
                       │ OTel Collector → 终端 stdout │
                       │ （生产换成 Tempo/Grafana）   │
                       └─────────────────────────────┘
```

## 2. 关键设计决策

### 2.1 为什么所有 LLM 调用走 Gateway，不直连？

| 维度 | 直连 OpenAI/Anthropic | 走 Envoy AI Gateway |
|---|---|---|
| 多模型路由 | 改代码 | 改 yaml |
| 成本控制 | 各自实现 | 统一 token rate-limit |
| 安全审计 | 散落各处 | OTel 一处看全 |
| PII 脱敏 | 业务代码做 | ext_proc 一次性 |
| 切换私有化 | 改代码 | 改 backend cluster |

**结论**：Gateway 是 AI Native 应用的"反向代理 + WAF"——你不会让微服务直连数据库，凭什么让它们直连 LLM？

对应 PPT Slide 38（LLM Gateway 是企业 Vibe Coding 的控制面）。

### 2.2 为什么不用 LangChain？

**故意手写 RAG**：

- 培训目的是让听众**理解 RAG 是什么**，不是"用一个黑盒库"
- LangChain 抽象层多，调试 demo 翻车点也多（Slide 39 兜底原则）
- 自己写 < 200 行的 RAG，比 LangChain 一行代码更能讲清楚 PPT Slide 30 那张管道图

### 2.3 为什么 Vector Store 不用 Qdrant/Milvus？

- pgvector 已经够 demo 用，**一个数据库少一个翻车组件**
- 演示"AI 应用其实没那么复杂"——客户最容易过度设计
- PPT Slide 22 列了"pgvector / Qdrant"，选最简单那个

### 2.4 为什么默认走 mock-llm？

PPT Slide 39 强调"演示风险控制：网络/模型不可用替代方案"。
- 培训现场网络可能不稳
- OpenAI/Anthropic key 不一定能用
- mock-llm 返回**确定性**响应，方便讲师反复演示同样的话术

切换真模型只需要改 `gateway/envoy-ai-gateway/config/ai-service-backend.yaml` 一个文件。

### 2.5 两道网关：模型控制面 + 供应链网关

AI Native 应用有**两条**需要治理的链路，对应两道网关：

| | 模型控制面 (Envoy AI Gateway) | 供应链网关 (Koi) |
|---|---|---|
| 治理对象 | 业务**发给模型的请求/返回** | **要安装运行的软件** |
| 拦什么 | 坏请求：注入 / PII / 越权 | 坏软件：恶意扩展 / 投毒包 / 带毒模型 / 恶意 MCP server |
| 时机 | 运行时 (数据面) | 安装前 (软件面) |
| 三态 | BLOCKED / REDACTED / PASS | BLOCK / REQUEST_APPROVAL / PASS |
| 实现 | `backend/app/gateway/client.py` + Envoy Lua | `backend/app/gateway/koi_client.py` (Koidex API) |

**为什么需要第二道**：Vibe Coding 让 AI 和开发者大量安装扩展(Cursor/VSCode)、拉包(pip/npm)、
接 MCP server、下 HuggingFace 模型——这些**工具链本身就是攻击面**。运行时 LLM 网关管不到"你装了什么"。
Koi 的 Koidex API 对每个制品(`item_id` + `marketplace`)返回 `risk`/`risk_level`/findings，
后端 `koi_client.py` 映射成三态：`high→BLOCK` / `medium→REQUEST_APPROVAL` / `low→PASS`。

**边界与兜底**：Koi 是商业 SaaS(已被 Palo Alto Networks 收购)。`KOI_ENABLED=false` 或网络不可用时，
`security/supply_chain.py` 走本地样例库兜底(`source=offline`，明确不冒充实时数据)，保证断网现场也能演示三态。
对应 PPT 的 AI HARNESS 页(模型控制面)与 TOOL LAYER 页("扩展位"本身需要被治理)。

## 3. 数据模型

```sql
-- 完整版在 infra/postgres/init.sql
CREATE TABLE logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source      TEXT NOT NULL,       -- 'nginx' | 'app' | 'custom'
  raw         TEXT NOT NULL,
  uploaded_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE log_chunks (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  log_id      UUID REFERENCES logs(id) ON DELETE CASCADE,
  chunk_idx   INT NOT NULL,
  text        TEXT NOT NULL,
  embedding   vector(384),         -- BGE-small / MiniLM
  created_at  TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX ON log_chunks USING ivfflat (embedding vector_cosine_ops);

CREATE TABLE analysis_jobs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  log_id      UUID REFERENCES logs(id),
  status      TEXT NOT NULL,       -- 'pending' | 'running' | 'done' | 'failed'
  summary     TEXT,
  evidence    JSONB,               -- 引用的 chunk + 行号
  created_at  TIMESTAMPTZ DEFAULT now(),
  finished_at TIMESTAMPTZ
);
```

## 4. API 契约

| Method | Path | Body / Query | Returns |
|---|---|---|---|
| POST | `/logs/upload` | `multipart/form-data` file + `source` | `{job_id, log_id}` |
| GET  | `/logs/jobs/{id}` | — | `{status, summary?, evidence?}` |
| POST | `/chat/query` | `{question, top_k?=5}` | `{answer, citations[]}` |
| GET  | `/health` | — | `{ok: true, gateway: bool, db: bool}` |

**所有 POST 请求体经过 `app/security/input_guard.py` 校验**——这是 Slide 19 的实现位。

## 5. 非功能要求

| 维度 | 要求 | 验证方式 |
|---|---|---|
| 安全 | PII 不进模型；prompt injection 被拦截 | `make redteam` 通过率 ≥ 90% |
| 可观测 | 每次 LLM 调用打 OTel span；token/latency 可查 | OTel Collector 日志 |
| 成本 | 单次会话 token 上限 = 10k；超限 429 | Envoy rate-limit 配置 |
| 性能 | RAG 检索 P95 < 500ms（mock-llm 下） | `pytest backend/tests/test_rag.py -k bench` |
| 可演示 | 离线（无 OPENAI_API_KEY）能完成端到端流程 | mock-llm 默认上游 |

## 6. 取舍记录（写给未来想"优化"这个 demo 的人）

| 想优化的事 | 不要做，因为 |
|---|---|
| 引入 Redis 缓存 | Envoy 已经做了 response cache；这是培训 demo，少一层少一坑 |
| 上 K8s | CRD 模板已经在 gateway/envoy-ai-gateway/k8s/ 备查，但 demo 现场 docker-compose 更稳 |
| 把 mock-llm 换成 Ollama | Ollama 拉模型耗时，培训现场不可接受；mock-llm 启动 < 1 秒 |
| 加用户登录 | 这个 demo 演示 AI Native 不是演示 IAM；放进 PPT Slide 56 的"建议补充材料" |
| 把 RAG 换成 GraphRAG | 同上，会破坏"<200 行手写"的教学价值 |

## 7. 给售前的架构图话术（对应 PPT Slide 23）

> "你看到的左半边是业务应用，右半边是 AI 控制面。
> 客户今天可能只有左边——他们会问'我们也想要右边'。
> 这个 demo 把 Envoy AI Gateway 放在最中间，就是为了让客户看到：
> 1. AI 能力可以**加**到现有应用里，不用重写
> 2. 加完之后多了什么：审计、成本、安全、可观测
> 3. 这四样东西就是 Slide 4 说的'更强治理 + 更低成本 + 更稳质量'。"
