# PRD — AI Log Analysis Platform

> Demo Step 1 产物。**这份文档假装是 AI 在现场刚生成的**。
> 讲师演示时直接说：「这就是 Slide 25 那段 Prompt 0 的输出」。

## 1. 目标用户与核心场景

| 角色 | 场景 | 当前痛点 |
|---|---|---|
| SRE | 凌晨 3 点收到告警，需要快速定位 Nginx 5xx 暴涨原因 | 翻 1GB 日志找规律靠 grep + 经验 |
| 应用工程师 | 上线后想知道"今天的错误和昨天有什么不同" | 没有现成对比工具，靠人脑回忆 |
| 安全工程师 | 想问"过去 24h 有没有可疑的请求模式" | 写正则或 SIEM 规则成本高 |

**共同需求**：用自然语言**问**日志，并要求**带证据**（行号、原文片段）回答。

## 2. MVP 功能边界

### In scope

| 功能 | 描述 |
|---|---|
| 日志上传 | 单文件 ≤ 50MB；支持 Nginx access log、应用 JSON log、自定义纯文本 |
| 异步分析 | 上传后异步切分 + embedding + LLM 总结，~30 秒内出结果 |
| 异常摘要 | 每个分析任务输出 3–5 条"看起来不对的事" |
| 自然语言查询 | 对已上传日志问问题，返回答案 + ≥1 条证据 |
| 历史 | 最近 10 条分析任务 |

### Out of scope（明确不做）

- ❌ 实时日志流 / Kafka / Syslog 监听
- ❌ 多租户、用户管理、RBAC
- ❌ 告警推送（钉钉/Slack/PagerDuty）
- ❌ 日志关联（trace correlation）
- ❌ 生产级保留策略 / 加密静态存储

理由：这是培训 demo，不是产品 v1。Out of scope 不代表不重要，代表"超出 3 小时课程能讲清楚的范围"。

## 3. 数据流与模块划分

```
┌──────┐        ┌──────────┐       ┌──────────┐       ┌──────────┐
│User  ├─upload►│  /logs/  ├──────►│ parser   ├──────►│ chunks   │
└──┬───┘        │ upload   │       └──────────┘       └────┬─────┘
   │            └──────────┘                                │
   │                                                        ▼
   │            ┌──────────┐       ┌──────────┐       ┌──────────┐
   ├──poll─────►│/logs/jobs│◄──────│ analyzer │◄──────│embedding │
   │            │  /{id}   │       │ (agent)  │       └────┬─────┘
   │            └──────────┘       └────┬─────┘            │
   │                                    │                  ▼
   │            ┌──────────┐            │            ┌──────────┐
   └──query────►│/chat/    │◄───────────┘            │ pgvector │
                │ query    │                         │  store   │
                └────┬─────┘                         └──────────┘
                     │
                     ▼
                ┌────────────┐
                │Envoy AI GW │──► mock-llm / OpenAI / Claude
                └────────────┘
```

对应模块（参考 CLAUDE.md "目录约定"）：

| 模块 | 职责 |
|---|---|
| `app/api/logs.py` | upload + jobs 端点 |
| `app/api/chat.py` | 自然语言查询 |
| `app/services/log_parser.py` | 切分日志，识别 Nginx / JSON / plain |
| `app/services/embedding.py` | 调本地 sentence-transformer 算向量 |
| `app/services/vector_store.py` | pgvector CRUD |
| `app/services/rag.py` | retrieve + compose prompt |
| `app/agents/analyzer.py` | 异常总结 agent |
| `app/security/input_guard.py` | 输入侧 PII/注入检测 |
| `app/gateway/client.py` | LLM 调用唯一入口 |

## 4. 验收标准

**每一条必须可观察、可验证。** 这是 Slide 19 "Validate" 的依据。

| ID | 标准 | 验证方式 |
|---|---|---|
| AC-1 | 上传一个 Nginx access log（≥ 1000 行），30 秒内拿到 job done | `pytest -k test_upload_to_done` 或现场掐表 |
| AC-2 | 异常摘要每条 ≥ 1 个引用（log_chunks.id + 行范围） | API 返回 `evidence` 字段非空 |
| AC-3 | 自然语言查询返回 answer + citations | `pytest -k test_chat_with_citation` |
| AC-4 | 所有 LLM 调用经过 Envoy AI Gateway，不直连 OpenAI | `grep -r "openai\." backend/app/` 不应在非 gateway/ 目录命中 |
| AC-5 | 输入含明显 prompt injection（如 "ignore previous instructions"）被拒绝 | Promptfoo prompt-injection.yaml 通过率 ≥ 90% |
| AC-6 | 输入含 PII（邮箱/手机/身份证）被脱敏后才进 LLM | Promptfoo pii-leak.yaml 通过率 ≥ 90% |
| AC-7 | docker-compose up 后所有 service 在 90 秒内 healthy | `docker compose ps` 全 healthy |
| AC-8 | OPENAI_API_KEY 未设置时，端到端流程仍能跑（走 mock-llm） | CI 跑无 key 路径 |
| AC-9 | 每次 LLM 调用打 OTel span，含 model/prompt_tokens/cost | OTel Collector 日志 grep |
| AC-10 | `make redteam` 整体通过率 ≥ 85% | Promptfoo HTML 报告 |

## 5. 风险与待确认问题

### 风险（已识别 + 治理）

| 风险 | 严重度 | 治理方式 | 在 demo 里的位置 |
|---|---|---|---|
| Prompt injection 让 AI 调用未授权工具 | 高 | input_guard + Gateway guardrail | `backend/app/security/` + `gateway/.../policy-guardrails.yaml` |
| 日志含 PII 被外发到 OpenAI | 高 | 上传时脱敏 + Gateway 二次脱敏 | 同上 |
| 大文件 OOM | 中 | 50MB 上限 + 流式切分 | `app/services/log_parser.py` |
| LLM 幻觉 | 中 | 强制引用 chunk + Golden Dataset 回归 | `evaluation/golden_dataset.jsonl` |
| 模型成本爆炸 | 中 | Envoy rate-limit + 缓存 | `gateway/.../policy-rate-limit.yaml` |
| 培训现场网络挂 | 高 | mock-llm 默认上游 | `gateway/.../upstream-mock/mock-llm.py` |

### 待确认问题（如果是真客户，要先答）

1. 客户日志格式是否标准？非标准格式要不要支持自定义 parser？
2. 日志保留多久？保留期影响向量库容量
3. 是否需要离线部署（不出公司网络）？影响是否能用 OpenAI/Claude
4. 是否需要审计日志（谁在什么时候问了什么）？影响 Gateway 配置和合规
5. 是否需要与现有 SIEM（Splunk/Elastic）集成？影响 API 输出格式

**注意**：以上 5 个问题是给真客户的。Demo 现场不展开。

## 6. 给售前的 PRD 用法

> "客户问'你们能不能做日志分析'——别说能。
> 翻开这份 PRD，问客户：
> - 我列的 3 个角色场景，您是哪个？
> - 我标的 5 个 In scope，您要哪几个？
> - 我列的 5 个待确认问题，您能现在答吗？
>
> 答得出来 → PoC 1 周内启动。
> 答不出来 → 帮客户先做 /refine 阶段。这就是售前的价值。"

## 7. 元信息

| 字段 | 值 |
|---|---|
| 创建时间 | Demo Step 1 by AI |
| 工作流阶段 | `/refine` 完成 |
| 下一步 | `/design` → 更新 DESIGN.md |
| Git tag | `step-1` |
