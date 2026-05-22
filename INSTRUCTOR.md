# INSTRUCTOR.md — 讲师手册

> 这份手册不是给开发者读的，是给**讲师现场操作**用的。配合 PPT Slide 24–33 + 55（Demo Checklist）。
> 目标：让任何拿到这个 repo 的人，3 小时课程里能把 Demo 跑下来不翻车。

> 📋 **现场可复制粘贴的测试用例**（Guardrail/多格式/模型路由/红队）见
> [`docs/TEST-CASES.md`](./docs/TEST-CASES.md) — 讲师照着念即可，每条标了输入和预期结果。
>
> 🧭 **从 0 到当前 demo 的 14 步教学分解**（含时间分配/每步话术/是否 live）见
> [`docs/TRAINING-BREAKDOWN.md`](./docs/TRAINING-BREAKDOWN.md)。
>
> 🛠 **学员逐步实操手册**（每步可直接复制给 Claude Code 的 Prompt + 验收 + 兜底）见
> [`docs/BUILD-FROM-ZERO.md`](./docs/BUILD-FROM-ZERO.md) —— 这是"学员真能照着走"的主交付物。
>
> 🎒 **学员课前准备清单**见 [`docs/STUDENT-PREP.md`](./docs/STUDENT-PREP.md)。
>
> 🔗 **PPT 与 demo 的对齐缺口**（该补哪些 PPT 页 / 哪些调整说法 / Harness 命名层）见
> [`docs/PPT-ALIGNMENT.md`](./docs/PPT-ALIGNMENT.md)。

---

## 演示前 30 分钟（必做）

```bash
# 1. 确保干净状态
git status                     # 应为 clean
git checkout main              # 或 tutorial-step-0
docker compose down -v         # 清掉旧容器和卷

# 2. 一次性预热（避免现场拉镜像）
docker compose pull
docker compose build

# 3. 试跑一遍
make demo
sleep 30
curl http://localhost:8090/health
curl http://localhost:8000/health
curl http://localhost:3000     # 应返回 HTML

# 4. 喂数据 + 跑红队，确认报告生成
make seed
make redteam
open security/red-team/reports/index.html  # 确认 HTML 报告打开

# 5. 关掉，等正式演示
make down
```

**翻车预案**（PPT Slide 39 + 55）：
- 网络拉不下 envoyproxy 镜像 → 提前 `docker save` 一份本地 tar
- pgvector 拉慢 → 用 `pgvector/pgvector:pg16` 提前 pull
- 现场 OpenAI key 不可用 → 默认就是走 mock-llm，**不要紧张**
- 现场断网 → 整个 demo 离线可跑

---

## 演示中 · 6+1 步逐步话术

### Step 0 — 开场（2 min）

> "我们现在从一个**空目录**开始。不是从代码开始，是从**工程契约**开始。
> 看一下这三个文件：CLAUDE.md（项目记忆）、DESIGN.md（架构约束）、WORKFLOW.md（阶段协议）。
> 这就是 PPT Slide 14 的 Context Stack。
> AI 不靠提示词，靠这三份文件。"

操作：
```bash
git checkout tutorial-step-0
ls
cat CLAUDE.md | head -30
```

---

### Step 1 — Prompt 0：需求澄清（5 min）

对应 PPT Slide 25。**这一步不让 AI 写代码**。

> "如果直接对 AI 说'帮我做个日志分析平台'，会发生 PPT Slide 13 的所有失败模式。
> 成熟的 Vibe Coding 是先做 /refine。"

打开 Claude Code，输入 `docs/PRD.md` 不存在前的提示：

```
你是我的产品与架构助手。我想做一个 AI Log Analysis Platform。
请先不要写代码，先输出：
1. 目标用户与核心场景
2. MVP 功能边界
3. 数据流与模块划分
4. 验收标准
5. 风险与待确认问题

把结果写到 docs/PRD.md。
```

**看点**：
- AI 不立即写代码
- 输出有"待确认问题"——说明它知道自己不知道什么
- 验收标准每条都"可观察"

**兜底**：如果现场 AI 偏离，直接 `git checkout tutorial-step-1`，把已有的 PRD 当作"AI 几秒前刚生成的"展示。

---

### Step 2 — Prompt 1：项目骨架（5 min）

对应 PPT Slide 26–27。

```
基于 docs/PRD.md，生成项目骨架。
约束（必须遵守 CLAUDE.md 的目录约定）：
- backend: FastAPI，分 api/services/agents/security/gateway 五层
- frontend: Next.js
- gateway: Envoy AI Gateway
- 一个 docker-compose.yml 串起来
先列目录树，再生成关键文件。
```

**看点**：
- AI 先列树再写文件（**不是直接 cat 一堆代码**）
- 五层目录与 PPT Slide 15 的"成熟 AI 应用项目结构"对齐
- 同时生成 README、docker-compose（**CLAUDE.md / DESIGN.md / WORKFLOW.md 已在 Step 0 工程契约阶段生成,这里不重复**,只让 AI 遵守其目录约定）

**兜底**：`git checkout tutorial-step-2`，对照 `tree -L 3` 给观众看完整骨架。

---

### Step 3 — Prompt 2~4：核心实现（15 min，最长）

这一步现场风险最大，**强烈建议预录**或用 `git checkout tutorial-step-3` 跳过细节。

#### Prompt 2：Backend API（对应 PPT Slide 28）

```
实现 backend API：
- POST /logs/upload
- GET /logs/jobs/{id}
- POST /chat/query
要求：
- Pydantic schema 定义在 app/schemas.py
- 清晰错误处理（4xx/5xx 区分）
- 每个 API 生成 pytest（在 backend/tests/）
- 任何 LLM 调用必须 import 自 app/gateway/client，不允许 from openai import
- 不要修改已定义的目录结构
```

**演示动作**：
1. 让 AI 写代码
2. **立刻** `pytest backend/tests/test_logs_api.py` —— 看到失败也无所谓，重点是测试和代码同时生成
3. 让 AI 修复失败

#### Prompt 3：Frontend Dashboard（对应 PPT Slide 29）

```
实现前端 Dashboard：
- 日志上传区域
- 分析任务状态
- 异常摘要卡片
- 自然语言查询窗口
- 最近 10 条分析历史
要求：
- 响应式布局，Tailwind
- API client 单独封装在 src/lib/api.ts
- Loading / Error 状态显式
```

#### Prompt 4：RAG 管道（对应 PPT Slide 30）

```
增加 RAG 管道：Raw Logs → Parser → Embedding → Vector Search → LLM Summary → Evidence
要求：
- services/ 下分 4 个模块
- LLM 调用必须经过 gateway/client
- 输出包含 evidence（引用了哪些 chunk）
```

**售前话术**：
> "PPT Slide 30 说'AI 应用不是只有 Chat UI，真正价值在检索、上下文组装、评估和可观测'。看这管道，每一段都对应客户能问到的问题：
> - Parser 出错？→ services/log_parser.py 的单测
> - 检索召回低？→ evaluation/golden_dataset.jsonl
> - LLM 幻觉？→ Evidence 字段强制引用 chunk
> - 成本失控？→ Envoy AI Gateway 的 rate-limit
> 客户不是买 AI，是买**这种可追溯**。"

---

### Step 4 — Prompt 5：测试与 CI（5 min）

对应 PPT Slide 31。

> "企业不会因为 AI 能写代码而放心，而是因为 AI 能被验证才放心。"

```bash
# 现场跑
cd backend && pytest -v
cd frontend && pnpm test
```

**看点**：让 AI 故意留一个测试失败（或用 `scripts/inject-bug.sh`），现场让它根据失败日志修复。这就接到 Step 5。

---

### Step 5 — Prompt 6：AI Debug（10 min，最有看点）

对应 PPT Slide 32。

```bash
# 注入 bug
bash scripts/inject-bug.sh
pytest -v          # 看到失败
```

现场对 AI 说：

```
请分析失败日志（粘贴 pytest 输出）。
要求：
1. 先列出 3 个可能根因
2. 选择最小修改方案
3. 修改后运行测试
4. 输出变更摘要和证据
不要一次性大改。
```

**演示重点**（这是整堂课最有说服力的 5 分钟）：
- AI 列根因 → 销售看到的是"AI 不是猜，是分析"
- 最小修改 → 研发看到的是"AI 不会乱改别的文件"
- 修改后运行测试 → 管理层看到的是"AI 自带验证"
- 输出证据 → 售前看到的是"客户问怎么证明，AI 已经写好了"

---

### Step 6 — Prompt 7：Review 交付（5 min）

对应 PPT Slide 33。

```bash
# 让 .claude/agents/reviewer 跑两阶段 review
claude /review
```

输出报告包含：
- **阶段 1 Spec Compliance**：每条验收标准对应代码位置
- **阶段 2 Code Quality**：correctness / security / readability / performance / maintainability / testability / observability

> "Review 不是看代码，是看**证据**。把这份报告打印出来就是交付物。"

---

> 💡 这一步以及 Guardrail 三态演示的**逐条测试用例**在 [`docs/TEST-CASES.md`](./docs/TEST-CASES.md)，
> 含推荐的 5 分钟 Guardrail 演示顺序（正常→注入→PII→中文越狱漏网→Gateway 层）。

### Step 7 — 加分：红队（5 min）

PPT 里没有这一步，**这是这个 demo 给培训加分的部分**。

```bash
make redteam
open security/red-team/reports/index.html
```

打开 HTML 报告，给观众看：
- ✅ 96 次 prompt injection 攻击：拦截 89 次（92.7%）
- ⚠️  PII 泄露攻击：拦截 7/10（70%，建议在 input_guard 加规则）
- ✅ 工具滥用（让 AI 调用未授权 MCP）：拦截 100%

**售前话术**：
> "客户买 AI 应用，最怕的是上线后被钓鱼、被注入、被泄露。
> 这页报告就是给 CISO 看的'我们做了什么、还差什么'。
> 这是 PPT Slide 48 风险矩阵的**可执行版**。"

再补一刀：

```bash
make scan           # Garak 跑深扫，输出更细
make sbom           # Trivy + Syft 看依赖漏洞
```

---

## 客户提问对照表（售前/销售必背）

| 客户问 | 回答 | 现场动作 |
|---|---|---|
| "AI 写的代码靠谱吗？" | 不靠相信，靠验证。给您看测试 + Review + 红队三份报告 | 跑 `make test && make redteam` |
| "数据会不会外泄？" | Gateway 这一层做 PII 脱敏。打开这个文件您看 | `code gateway/envoy-ai-gateway/config/policy-guardrails.yaml` |
| "为什么不直接用 ChatGPT/Claude？" | 团队级使用需要鉴权/限流/审计/成本控制。这就是 Gateway 的价值 | 对照 PPT Slide 38 |
| "上线后 AI 出问题怎么办？" | 每次调用有 OTel trace；可以回放、限流、切换模型 | 给看 OTel Collector 日志 |
| "本地能跑吗，怕上云" | 这个 demo 就是本地 docker-compose 跑的；上游 mock-llm 完全离线 | `make demo` 现场跑 |
| "从哪里开始试点？" | 三阶段路线（PPT Slide 52）。先从内部工具、测试生成开始 | 翻到 PPT Slide 52 |
| "你们的产品和 Cursor/Copilot 什么关系？" | Cursor 是 IDE 工作台（PPT Slide 35），我们做的是企业控制面（Slide 38），不冲突，互补 | 画 PPT Slide 34 那张图 |
| "Envoy AI Gateway 和 Portkey 选哪个？" | 看您部署方式：私有化选 Envoy（CNCF），SaaS 优先选 Portkey | 翻 `gateway/portkey/README.md` |

> **AI GW 现场口径(讲师必明确两句)**:
> - 「可观测」tab 是 **backend 内存窗口**,用于现场**实时观测**每次调用(provider/model/延迟/tokens/估算成本),**重启会清空**——不是持久化监控(生产接 OTel→Grafana/Tempo)。
> - **Portkey 是可切换对比路径**,默认演示仍走 **Envoy**;现场可 `GATEWAY_PROVIDER=portkey` + 重启 backend 演示"业务代码不变、换网关",讲完切回 Envoy。

---

## 演示后 5 分钟

```
1. 总结 AI 做了什么 ← 屏幕投影 git log --oneline
2. 总结人控制了什么 ← 翻 CLAUDE.md 的"禁止事项" + WORKFLOW.md 阶段表
3. 展示测试和 Review 证据 ← 三份报告
4. 回到客户价值和落地路径 ← 翻 PPT Slide 49 售前话术
```

---

## 90 天试点计划（对应 PPT Slide 52）

发给客户的 commitment 版本：

| 阶段 | 时间 | 交付物 | 度量 |
|---|---|---|---|
| Phase 1 | 0–30 天 | 1 个 CLAUDE.md / DESIGN.md / WORKFLOW.md 模板；2–3 个 Prompt 模板 | 模板被复用次数 ≥ 5 |
| Phase 2 | 31–60 天 | 1 个可运行内部工具 + 集成 Review/Validate | AI 生成代码占比 ≥ 30%；返工率 ≤ 20% |
| Phase 3 | 61–90 天 | 接入 LLM Gateway + 审计 + 成本看板 | 单 token 成本下降 ≥ 30%；安全审计零事故 |

---

## 不要做的事

- ❌ 不要现场跑完整 `make demo` 等容器全部 ready（要 90 秒）——提前跑好
- ❌ 不要在客户面前 debug 我这份 demo 的 bug——用 `git checkout tutorial-step-N`(阶段A)/`training-step-N`(阶段B/C) 跳过
- ❌ 不要讲"Claude Code 多强"——讲"组织 AI 完成软件交付"（Slide 8）
- ❌ 不要回避客户的安全质疑——直接打开 `security/` 目录
- ❌ 不要承诺"取代开发者"——讲"开发者角色转变"（Slide 50 FAQ）
