# PPT 对齐 — 缺口、demo 增量、补 PPT 清单

> demo 已演进得比 PPT 原本的 6 步 Demo Flow 大很多。这份列清:哪些对齐了、
> demo 多出哪些能力、PPT 该补哪些页、哪些只需调整说法。

---

## 0. 最重要的一条:PPT 缺 "Harness" 命名层

PPT Slide 12 讲"从 Prompt Engineering → Context Engineering"就停了。但进阶其实是**三段**:

| 段 | 是什么 | PPT 现状 |
|---|---|---|
| **Prompt** | 把单次问答问好 | ✓ Slide 12 旧模式 |
| **Context** | 把工程上下文组织好(CLAUDE.md/检索/规则) | ✓ Slide 12/14 |
| **Harness** | 把 AI 装进**可执行可治理的运行时**:tool loop + Workflow 状态机 + Hook 护栏 + Subagent 分工 + Gateway 控制面 + structured output + 红队验证 | ✗ **没命名,零件散落在 Slide 17/38/42/44** |

**问题**:harness 的零件 PPT 都有(Workflow=17、Gateway=38、Subagent=42、Hook=44),
但从没收拢成进阶第三段。学员听完会觉得"一堆工具",抓不到"它们合起来是 AI 运行时"这个主线。

**建议**:在 Slide 12 后加 1 页 "Prompt → Context → Harness",把 harness 定义清楚:
> Harness = 让 AI 能安全进入生产的那层运行时。本课 demo 本身就是一个 harness 完整样例:
> Envoy AI Gateway(模型控制面)+ .claude/hooks(运行时护栏)+ WORKFLOW.md(阶段机)+
> subagents(分工)+ structured output(输出合同)+ guardrail/红队(验证)。

这一改让后面所有零件有了归属,也让 demo 的增量能力(下面 §2)有地方挂。

---

## 1. 已对齐(不用动)

| PPT | demo 对应 |
|---|---|
| Slide 22 技术栈 (Next.js/FastAPI/pgvector/Docker) | ✓ 一致(Gateway 更具象成 Envoy) |
| Slide 23 架构 | ✓ 一致 |
| Slide 27 五层目录 (services/agents/security/evaluation/observability) | ✓ 都在 |
| Slide 28-30 Backend/Frontend/RAG | ✓ 有(且演进成 structured + 混合上下文) |
| Slide 31 测试 / 32 Debug / 33 Review | ✓ 阶段 A 步 4/5/6 |
| Slide 36 Claude Code / 38 LLM Gateway | ✓ demo 是用 CC 建的;Gateway 落地超出 PPT |

---

## 2. demo 有、PPT 没有(**该补 PPT 页 — 这是最大增量价值**)

| demo 能力 | 建议 PPT 动作 | 挂到哪 |
|---|---|---|
| **Structured Generation**(schema-locked 输出) | **新增 1 页**:"从自由文本到 schema 输出"(对标 dottxt STRESSED) | Slide 33 Spec Compliance 的实现 / Harness 段 |
| **双模型 Gateway 路由**(DeepSeek↔Qwen 一键切) | Slide 38 **加实拍**:同 prompt 切模型,业务代码不变 | Harness/Gateway |
| **Guardrail 三态**(拦截/脱敏/漏网)+ 中文越狱反面教材 | Slide 19/44 **加实拍** → 引出 ML guard | Harness/Governance |
| **红队报告页**(Promptfoo-style,CI 跑/页面展示) | Slide 48 风险矩阵**加"可执行版"实拍** | Harness/验证 |
| **多格式日志解析**(nginx/apache/syslog) | Slide 22 **补一句**支持的格式 | Demo Scenario |
| **登录门 + 公网/内网 HTTPS 上线**(隧道+Gateway+certbot) | Session 3 落地**加 1 页架构** | 企业落地 |

---

## 3. PPT 提到、demo 没做(调整说法,不强补 demo)

| PPT | 现状 | 决定 |
|---|---|---|
| **Slide 37 MCP** | demo **不接 MCP 主链路** | **PPT 改成"工具层扩展位"**:讲清可接 Postgres / 日志查询等,作为 harness 的可插拔工具层,**不强行现场演**。理由:MCP 增加讲解面和失败面,对当前 nginx AI Ops 主叙事的贡献不如 Structured Generation / Gateway 路由 / Guardrail / 红队。 |
| Slide 41 Observability (OTel) | demo 有 OTel 但默认 profile 关、未接 Grafana | 演示前 `--profile observability` 起,或 PPT 标"可选";不作为主链路 |
| Slide 35 Cursor | demo 用 Claude Code 建,Cursor 未出现 | 工具不是 app 功能,**保留即可,不算缺口** |

---

## 4. 一句话给 PPT 改版定调

> PPT 原本是"6 步把 AI Log Platform 搭出来"。现在 demo 已经是一个完整的 **AI Harness 样例**。
> 改版主线建议:**Prompt → Context → Harness** 三段,把 Structured Generation / 多模型 Gateway /
> Guardrail / 红队 / 上线映射 这些增量,全部归到 "Harness = AI 生产运行时" 这一段下讲。
> MCP 降级为工具层扩展位。
