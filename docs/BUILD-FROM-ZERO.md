# 从 0 到当前 demo — 学员逐步实操手册

> 这是**学员真能照着走**的主交付物。跟着 15 步(Step 0-15),用 Claude Code 一步步把
> 整个 AI Log Analysis Platform 搭出来,和 PPT v6 的 3 阶段结构一一对应。
> Step 0-14 是原始 3 阶段;**Step 15 是后来加入的供应链安全增强(Koi)**。
>
> **这不是抄代码** —— 你是在"组织 AI 完成交付"。每步:把 Prompt 粘给 Claude Code →
> 让它先给计划 → 再改文件 → 你跑验收命令确认。卡住了用"兜底"。

## 怎么用这份手册

- 每个 Prompt 都可**直接复制**给 Claude Code(在项目根目录的 `claude` 会话里)。
- 每个 Prompt 都已内置一条铁律:**先给计划,我确认后再改文件,最后自己跑验收**。
- **阶段 A(Step 0-6)**:有真实检查点 `tutorial-step-0..6`,卡住可 `git checkout`。
- **阶段 B/C(Step 7-15)**:有检查点 `training-step-7..15`,卡住可 `git checkout training-step-N`
  看该步累积快照;最终参考答案 = `main`(== training-step-15)。
  > 注:`training-step-N` 是**累积参考快照**(走完第 N 步后项目该有的样子),
  > 因为后期能力是有机演进的,部分共享文件会"提前"带上后续步骤的代码(如 GatewayPanel
  > 在 step-8 就含红队 tab,但其后端端点 step-11/12 才接上)——不影响构建,点未接通的
  > tab 只是 fetch 失败。这是诚实的工程现实,不是 bug。
- 三个边界提醒(B/C 反复出现,别讲错):
  1. 我们的结构化输出是 **JSON mode + Pydantic 校验 + 重试**,**不是** token-level
     constrained decoding(那要接 Outlines/dottxt strict decoding 才能那样讲)。
  2. **mock-llm 需显式启用**(`--profile mock`),默认走真实模型。
  3. **MCP 不是当前主链路**,只是工具层可插拔扩展位,不在本手册主线实现。

## 阶段总览

| 阶段 | Step | 主题 | 检查点 |
|---|---|---|---|
| A 基础闭环 | 0-6 | 工程契约 → PRD → 骨架 → 实现 → 测试 → Debug → Review | `tutorial-step-0..6` |
| B AI Native 进阶 | 7-12 | Gateway → 结构化 → 多格式 → 双模型 → Guardrail → 红队 | `training-step-7..12` |
| C 企业落地 | 13-14 | 登录+CI/CD → 公网/内网 HTTPS | `training-step-13..14` |

## 重要:PPT "Prompt N" ↔ 本手册 Step ↔ tag 对照

PPT(Slide 25-33)用的是 **"Prompt N" 编号**,和本手册的 **Step / tag 编号不是一套**。
内容能对上,数字对不齐——按下表换算:

| 本手册 Step / tag | 内容 | PPT 对应 Prompt | PPT Slide |
|---|---|---|---|
| Step 0 / `tutorial-step-0` | 工程契约 CLAUDE/DESIGN/WORKFLOW | (Session 1 概念,无独立 prompt) | 14 / 16 |
| Step 1 / `tutorial-step-1` | 需求澄清 → PRD | **Prompt 0** | 25 |
| Step 2 / `tutorial-step-2` | 项目骨架 | **Prompt 1** | 26-27 |
| Step 3 / `tutorial-step-3` | 核心实现 backend+frontend+RAG | **Prompt 2 + 3 + 4**(三合一) | 28-30 |
| Step 4 / `tutorial-step-4` | 测试 + CI | (PPT **跳过 Prompt 5**,此步无编号) | 31 |
| Step 5 / `tutorial-step-5` | AI Debug | **Prompt 6** | 32 |
| Step 6 / `tutorial-step-6` | Review | **Prompt 7** | 33 |
| Step 7-14 / `training-step-7..14` | 阶段 B/C(Gateway/结构化/多格式/双模型/Guardrail/红队/登录/上线) | PPT Slide 35-40/44-45/54-55 | — |
| Step 15 / `training-step-15` | 供应链安全(Koi 查询台 + CI 门禁)**后加增强** | (PPT 加分页:Harness/企业落地) | — |

> 两个易混点:① PPT 的 Prompt 2/3/4 在本手册里**合并成一个 Step 3**(对应一个 tag);
> ② PPT **没有 Prompt 5**(测试步无编号),所以 PPT 的 Prompt 6/7 比 Step 号大 1。
> **建议:以本手册的 Step / tag 编号为准**(它和可 checkout 的 git tag 一一对应);
> PPT 的 "Prompt N" 当描述性标签看即可。

---

# 阶段 A · 基础闭环

## Step 0 · 工程契约

**对应 PPT**:Slide 14(Context Stack)/ 16(项目记忆)
**起点**:空目录(`mkdir vibe-coding-demo && cd $_ && git init`)
**目标**:让 AI 先生成"工程记忆三件套",约束后续所有改动。

### 粘给 Claude Code 的 Prompt
```
你是我的架构助手。我要做一个培训用 demo:AI Log Analysis Platform——
上传 Nginx/Apache/syslog 日志,AI 总结异常,自然语言查询,输出可解释证据。

先不要写任何业务代码。请先输出"计划"(要建哪些文件、每个文件写什么),
我确认后再生成,最后告诉我怎么验收。

技术栈(写进契约,后续不要换):
- Backend: Python 3.11 + FastAPI + Pydantic v2
- Frontend: Next.js 14 (App Router) + Tailwind
- Vector: Postgres 16 + pgvector
- LLM 接入: 必须经过 Envoy AI Gateway,禁止业务代码直连 OpenAI/Anthropic
- 编排: docker-compose v2

请生成:
1. CLAUDE.md —— 项目记忆:身份/技术栈/目录约定(backend 分 api/services/agents/
   security/gateway 五层)/禁止事项(禁改 .env、禁直连 LLM SDK、禁删表)/必须执行(lint+测试)
2. DESIGN.md —— 架构约束:架构图、API 契约表、数据模型
3. WORKFLOW.md —— 阶段协议:/refine /design /plan /build /review /ship 各阶段输入输出通过条件
4. README.md —— 给人看的入口
```

### 预期产出
- `CLAUDE.md` / `DESIGN.md` / `WORKFLOW.md` / `README.md`
- 无业务代码

### 验收命令
```bash
ls *.md && grep -c "禁止" CLAUDE.md
```

### 人工检查点
- CLAUDE.md 里**必须有**:目录约定(五层)、禁止事项、必须执行项
- **不能出现**:任何 .py / docker-compose(这步只写契约)

### 兜底
- `git checkout tutorial-step-0`

---

## Step 1 · Prompt 0 需求澄清

**对应 PPT**:Slide 25
**起点**:Step 0 完成
**目标**:让 AI 当产品助手,先澄清需求产出 PRD,而不是直接 build。

### 粘给 Claude Code 的 Prompt
```
基于 CLAUDE.md,你现在是产品与架构助手。请不要写代码。
先输出计划,再生成 docs/PRD.md,内容包含:
1. 目标用户与核心场景(SRE / 应用工程师 / 安全工程师)
2. MVP 功能边界(明确 in scope / out of scope)
3. 数据流与模块划分
4. 验收标准(每条必须可观察、可验证,不要"流畅"这种主观词)
5. 风险与待确认问题
生成后告诉我怎么验收。
```

### 预期产出
- `docs/PRD.md`(含 ≥6 条可验证的验收标准)

### 验收命令
```bash
sed -n '/验收标准/,/风险/p' docs/PRD.md
```

### 人工检查点
- 验收标准每条都"可观察"(如"上传 1000 行日志 30 秒内出结果"),不是主观词
- 有"待确认问题"(说明 AI 知道自己不知道什么)

### 兜底
- `git checkout tutorial-step-1`

---

## Step 2 · Prompt 1 项目骨架

**对应 PPT**:Slide 26 / 27
**起点**:Step 1 完成
**目标**:让 AI 先列目录树,再生成骨架 + docker-compose + pgvector,不乱建文件。

### 粘给 Claude Code 的 Prompt
```
基于 docs/PRD.md 和 CLAUDE.md 的目录约定,生成项目骨架。
先列完整目录树让我确认,再生成关键文件,最后给验收命令。

要求:
- docker-compose.yml:postgres(pgvector/pgvector:pg16)+ backend + frontend
  + envoy-ai-gateway + mock-llm(profile=mock,默认不启)
- backend 五层目录 + Dockerfile + pyproject.toml
- frontend Next.js 骨架 + Dockerfile
- infra/postgres/init.sql:logs / log_chunks(vector 384)/ analysis_jobs 三表 + pgvector 扩展
- Makefile:demo / down / seed / test 目标
- 不要把逻辑塞进一个大文件;严格按五层目录
```

### 预期产出
- `docker-compose.yml` / `Makefile` / `infra/postgres/init.sql`
- `backend/`(Dockerfile/pyproject + 五层空目录)/ `frontend/`(骨架)

### 验收命令
```bash
docker compose config >/dev/null && echo "compose 合法"
tree -L 2 backend infra 2>/dev/null || find backend infra -maxdepth 2
```

### 人工检查点
- backend 下有 api/services/agents/security/gateway 五个目录
- init.sql 里 log_chunks 有 `vector(384)` 列
- **不能出现**:mock-llm 默认启动(应是 profile)

### 兜底
- `git checkout tutorial-step-2`

---

## Step 3 · Prompt 2-4 核心实现(Backend + Frontend + RAG)

**对应 PPT**:Slide 28 / 29 / 30
**起点**:Step 2 完成
**目标**:让 AI 生成 API + RAG 管道 + Dashboard,LLM 调用统一走 gateway/client。

### 粘给 Claude Code 的 Prompt
```
基于骨架实现核心功能。先给实现计划(分几个 PR/几步),我确认后逐步改,每步跑测试。

Backend:
- app/schemas.py:Pydantic 模型唯一来源
- app/api/logs.py:POST /logs/upload、GET /logs/jobs/{id}、GET /logs(最近10条)
- app/api/chat.py:POST /chat/query
- app/services/:log_parser(切chunk)/ embedding(本地 sentence-transformer,带 hash 兜底)
  / vector_store(pgvector CRUD)/ rag(检索+组装prompt)
- app/agents/analyzer.py:上传后异步分析,写 summary + evidence
- app/gateway/client.py:**唯一** LLM 入口,走 Envoy Gateway;禁止其他模块 import openai
- 每个 API 配 pytest

Frontend:
- src/lib/api.ts:API client 单独封装
- Dashboard:上传区 / 任务状态 / 异常摘要 / 自然语言查询 / 最近历史
- 响应式 + Loading/Error 状态显式

约束:任何 LLM 调用必须经过 app/gateway/client.py;不改 init.sql 表结构。
```

### 预期产出
- `backend/app/{schemas,api/*,services/*,agents/*,gateway/client,security/*}.py` + `tests/`
- `frontend/src/{lib/api.ts,app/page.tsx,components/*}`

### 验收命令
```bash
cd backend && python -m pytest -q ; cd ..
# AC: 没有绕过 gateway 直连 LLM
! grep -rE "^(from|import) (openai|anthropic)" backend/app --include=*.py | grep -v gateway/
```

### 人工检查点
- 浏览器 `localhost:3000` 出 Dashboard;上传日志 → 有 job
- 所有 LLM 调用都在 `gateway/client.py`,别处不 import openai
- **不能出现**:把 LLM key 硬编码进代码

### 兜底
- `git checkout tutorial-step-3`

---

## Step 4 · 测试 + CI(PPT 此步无独立 Prompt 编号,跳过了 Prompt 5)

**对应 PPT**:Slide 31
**起点**:Step 3 完成
**目标**:让 AI 补齐测试 + golden dataset + CI 流水线。

### 粘给 Claude Code 的 Prompt
```
先给计划,再实现,最后跑一遍测试。
1. 补齐 backend 测试:input_guard / log_parser / "禁止直连 LLM SDK" 守门测试
2. evaluation/golden_dataset.jsonl:固定回归问题集
3. .github/workflows/ci.yml:装依赖 → ruff → pytest → (守门:必备文件存在 / 无直连 LLM import)
4. scripts/seed-logs.sh:生成并上传示例 Nginx 日志(含 5xx spike + /admin 扫描)
要求:测试要测"行为"不是"调一次返回非空"。
```

### 预期产出
- `backend/tests/test_*.py` / `evaluation/golden_dataset.jsonl` / `.github/workflows/ci.yml` / `scripts/seed-logs.sh`

### 验收命令
```bash
cd backend && python -m pytest -q ; cd ..
bash scripts/seed-logs.sh && echo "seed ok"
```

### 人工检查点
- pytest 全绿;CI yaml 里有 lint + test + 守门检查
- seed 后 Dashboard 有数据

### 兜底
- `git checkout tutorial-step-4`

---

## Step 5 · Prompt 6 AI Debug(最有看点)

**对应 PPT**:Slide 32
**起点**:Step 4 完成
**目标**:故意注入 bug,让 AI 按"列根因 → 最小修改 → 跑测试 → 复盘"修复。

### 操作 + 粘给 Claude Code 的 Prompt
```bash
# 先注入一个 off-by-one bug
bash scripts/inject-bug.sh   # 若没有就让 AI 先写这个脚本
cd backend && python -m pytest -q   # 看到失败
```
```
这是 pytest 失败输出(粘贴失败日志)。请:
1. 先列出 3 个可能根因(不要急着改)
2. 只选最小修改方案,说明为什么
3. 改完跑测试验证
4. 输出变更摘要 + 证据
不要一次性大改,不要顺手重构别的文件。
```

### 预期产出
- `scripts/inject-bug.sh`;AI 的最小修复 diff

### 验收命令
```bash
cd backend && python -m pytest -q   # 修复后应全绿
```

### 人工检查点
- AI **先列根因**再动手,只改必要文件
- **不能出现**:借机重构无关代码

### 兜底
- `git checkout tutorial-step-5`(已修复态)

---

## Step 6 · Prompt 7 两阶段 Review + 治理

**对应 PPT**:Slide 33 / 42 / 44
**起点**:Step 5 完成
**目标**:生成运行时护栏(Hook)+ 分工 subagent + 两阶段 Review。

### 粘给 Claude Code 的 Prompt
```
先给计划再实现。
1. .claude/hooks/pre-tool-use-block-prod.sh:PreToolUse 拦截危险命令(rm -rf、改 .env、
   生产破坏);post-tool-use-lint.sh:PostToolUse 对改动的 .py 跑 ruff
2. .claude/agents/:reviewer(两阶段:先 Spec Compliance 再 Code Quality)、
   tester、architect(决定是否引入新依赖)三个 subagent 定义
3. .claude/settings.local.json 示例:注册上面的 hooks
4. 用 reviewer 跑一次当前代码,输出报告
```

### 预期产出
- `.claude/hooks/*.sh` / `.claude/agents/*.md` / `.claude/settings.local.json`

### 验收命令
```bash
ls .claude/hooks .claude/agents
bash .claude/hooks/pre-tool-use-block-prod.sh <<<'{"tool_name":"Bash","tool_input":{"command":"rm -rf /"}}'; echo "exit=$?"  # 期望被拦, exit 1
```

### 人工检查点
- 危险命令被 hook 拦(exit 非 0)
- reviewer 报告分两阶段

### 兜底
- `git checkout tutorial-step-6`

> ✅ **阶段 A 最终态 = `tutorial-step-6`**:基础 demo(已含 DeepSeek 单模型网关、自由文本分析、旧版 UI)。
> 下面阶段 B/C **从这个状态继续增量**,检查点 `training-step-7..15`(`git checkout` 可看每步累积快照),
> 最终 = `main`(== training-step-15)。

---

# 阶段 B · AI Native 进阶(从阶段 A 最终态继续;参考答案 = `main`)

> 阶段 B 的每一步都是在阶段 A 基础上"加能力"。卡住时 `git checkout training-step-N`
> 看该步累积快照,或对照 `main` 的对应文件(下面每步"兜底"列出具体路径)。

## Step 7 · 接 Envoy AI Gateway(真实 DeepSeek)

**对应 PPT**:Slide 38 / 45
**起点**:阶段 A 最终态(LLM 还走 mock)
**目标**:把 Gateway 上游从 mock 切到真实 DeepSeek,key 由 entrypoint 注入,业务代码不变。

### 粘给 Claude Code 的 Prompt
```
先给计划再改。把 Envoy AI Gateway 接到真实 DeepSeek:
1. gateway/envoy-ai-gateway/config/envoy-deepseek.yaml.tmpl:
   - listener 8080,路由 /v1/chat/completions → deepseek 上游(api.deepseek.com:443, TLS, SNI)
   - 剥离客户端 demo bearer,注入 Authorization: Bearer __DEEPSEEK_API_KEY__
   - JSON 格式 stdout access log(打 model/path/response_code/duration)
2. config/entrypoint.sh:用 sed 把 __DEEPSEEK_API_KEY__ 替换成环境变量真值,再 exec envoy
3. docker-compose:envoy 用 entrypoint,传 DEEPSEEK_API_KEY 环境变量
4. .env.example:加 DEEPSEEK_API_KEY
边界:key 只进 .env(gitignored),不进代码;mock-llm 保留为 profile=mock 兜底。
```

### 预期产出
- `gateway/envoy-ai-gateway/config/envoy-deepseek.yaml.tmpl` + `entrypoint.sh`;`.env.example` 加 key

### 验收命令
```bash
# .env 填好 DEEPSEEK_API_KEY 后
docker compose up -d --build envoy-ai-gateway backend
curl -s localhost:8090/health
curl -s -X POST localhost:8090/v1/chat/completions -H "Authorization: Bearer demo-key-not-secret" \
  -H "Content-Type: application/json" -d '{"model":"deepseek-chat","messages":[{"role":"user","content":"OK"}],"max_tokens":5}'
```

### 人工检查点
- gateway /health 返回 ok;真实调用返回 DeepSeek 响应(model 字段是 deepseek-*)
- **不能出现**:DEEPSEEK_API_KEY 出现在任何被 git 追踪的文件里

### 兜底(`git checkout training-step-N`,N = 本步号;或对照 main 的下列文件)
- `gateway/envoy-ai-gateway/config/envoy-deepseek.yaml.tmpl`、`entrypoint.sh`、`docker-compose.yml`(envoy 段)

---

## Step 8 · Structured Generation(schema-validated 输出)

**对应 PPT**:Slide 36
**起点**:Step 7 完成
**目标**:让分析输出从自由文本变成 schema 校验过的 JSON(STRESSED 5 段结构)。

### 粘给 Claude Code 的 Prompt
```
先给计划再改。把分析输出改成结构化(JSON mode + Pydantic 校验 + 重试):
1. schemas.py:LogAnalysis(summary / highest_severity / requires_immediate_attention /
   key_observations / events / traffic / traffic_patterns)、
   SecurityEvent(event_type / severity / category / confidence / source_ips /
   url_pattern / possible_attacks / evidence_chunks / related_log_entries)
2. gateway/client.py:加 chat_structured() —— 用 response_format={"type":"json_object"},
   解析失败重试,最终 Pydantic 校验
3. analyzer.py:LLM 只负责判断部分;traffic/traffic_patterns 由后端从解析的 entries
   确定性聚合(不让 LLM 数数)
明确边界(写进注释):这是 JSON mode + 校验 + 重试,不是 token-level constrained
decoding;要 token 级约束需接 Outlines/dottxt strict schema decoding。
```

### 预期产出
- `schemas.py`(LogAnalysis/SecurityEvent)、`gateway/client.py`(chat_structured)、`services/traffic.py`(确定性聚合)、`agents/analyzer.py` 改造

### 验收命令
```bash
docker compose up -d --build backend
bash scripts/seed-logs.sh
# 取最近 job,确认 analysis 是结构化字段
curl -s "localhost:8000/logs?limit=1" | python3 -c "import sys,json;j=json.load(sys.stdin)[0];a=j.get('analysis') or {};print('events:',len(a.get('events',[])),'traffic_patterns:',len(a.get('traffic_patterns',[])))"
```

### 人工检查点
- 分析结果是结构化字段(events 有 severity/confidence;traffic_patterns 是表)
- 代码注释里写明"非 constrained decoding"的边界
- **不能出现**:把 traffic 数字交给 LLM 编(应后端聚合)

### 兜底(`git checkout training-step-N`,N = 本步号;或对照 main 的下列文件)
- `backend/app/schemas.py`、`gateway/client.py`、`services/traffic.py`、`agents/analyzer.py`

---

## Step 9 · 多格式日志解析(nginx / apache / syslog)

**对应 PPT**:Slide 37
**起点**:Step 8 完成
**目标**:逐行自动识别三种格式,前端表格自适应。

### 粘给 Claude Code 的 Prompt
```
先给计划再改。log_parser 支持三种格式自动识别:
1. nginx/apache access(combined):IP - - [time] "METHOD path" status bytes "ref" "ua"
2. apache error_log:[time] [level] [client IP] message  (注意是 error 日志,不是 access)
3. linux syslog:Mon DD HH:MM:SS host proc[pid]: message;从 rhost= 抽 client_ip,
   按关键词(fail/invalid→error)推 level
ParsedLogEntry 加 kind(access/error)/ level / message;parse_entries 逐行 try 三种;
dominant_kind() 判整体类型;traffic.py 按 kind 自适应聚合。
前端 LogTable / AnalysisReport 表头按 kind 自适应(error 类显示 级别/客户端IP/消息)。
```

### 预期产出
- `services/log_parser.py`(三解析器+自动识别)、`schemas.py`(ParsedLogEntry 加字段)、`services/traffic.py`(error 聚合)、前端表格自适应

### 验收命令
```bash
docker compose up -d --build backend frontend
# 传 apache error / syslog 各一份(用 testdata/)
for f in apache-10k linux-2k; do
  curl -s -X POST localhost:8000/logs/upload -F source=nginx -F "file=@testdata/$f.log" \
    | python3 -c "import sys,json;print('$f job:',json.load(sys.stdin)['job_id'])"
done
```

### 人工检查点
- 传 apache/syslog 后,sample_entries 非空、kind=error、client_ip 抽出来了
- 前端表格切到 时间/级别/客户端IP/消息 列
- **不能出现**:apache 当成 access 解析(它是 error_log)

### 兜底(`git checkout training-step-N`,N = 本步号;或对照 main 的下列文件)
- `backend/app/services/log_parser.py`、`schemas.py`、前端 `LogTable.tsx` / `AnalysisReport.tsx`

---

## Step 10 · 双模型路由(加 Qwen)

**对应 PPT**:Slide 38
**起点**:Step 9 完成
**目标**:Gateway 按 header 在 DeepSeek/Qwen 间路由,业务代码不变。

### 粘给 Claude Code 的 Prompt
```
先给计划再改。给 Envoy AI Gateway 加第二上游 Qwen(DashScope),按 header 路由:
1. envoy-deepseek.yaml.tmpl:加 qwen_cluster(dashscope.aliyuncs.com:443, TLS),
   路由匹配 header X-LLM-Backend: qwen → qwen 上游 + 注入 __QWEN_API_KEY__;默认走 deepseek
2. entrypoint.sh:支持 DEEPSEEK_API_KEY + QWEN_API_KEY 双 key 注入
3. gateway/client.py:chat 支持 backend 参数(deepseek/qwen),发 X-LLM-Backend 头
4. chat.py / ChatRequest 加 backend 字段;前端 AI 助手加 DeepSeek/Qwen 切换下拉
5. .env.example 加 QWEN_API_KEY
```

### 预期产出
- envoy tmpl(qwen_cluster + 路由)、entrypoint(双 key)、client.py、chat.py、前端切换器

### 验收命令
```bash
# .env 填 QWEN_API_KEY 后重建 gateway+backend
docker compose up -d --build envoy-ai-gateway backend
curl -s -X POST localhost:8090/v1/chat/completions -H "Authorization: Bearer demo-key-not-secret" \
  -H "X-LLM-Backend: qwen" -H "Content-Type: application/json" \
  -d '{"model":"qwen3-coder-plus","messages":[{"role":"user","content":"OK"}],"max_tokens":5}' \
  | python3 -c "import sys,json;print('model:',json.load(sys.stdin)['model'])"
```

### 人工检查点
- 带 `X-LLM-Backend: qwen` 返回 qwen 模型;不带头默认 deepseek
- 前端能切换,同问题两模型对比
- **不能出现**:业务代码里 if/else 选模型(应由 Gateway 路由)

### 兜底(`git checkout training-step-N`,N = 本步号;或对照 main 的下列文件)
- `envoy-deepseek.yaml.tmpl`、`entrypoint.sh`、`gateway/client.py`、`api/chat.py`、前端 `AiAssistantDrawer.tsx`

---

## Step 11 · Guardrail 三态 + 现场测试

**对应 PPT**:Slide 39(+ Slide 19/44)
**起点**:Step 10 完成
**目标**:注入拦截 + PII 脱敏,双层(backend + Gateway Lua),页面可现场测。

### 粘给 Claude Code 的 Prompt
```
先给计划再改。实现 Guardrail 三态(BLOCKED/PASS/REDACTED):
1. security/input_guard.py:正则检测 prompt injection(ignore previous instructions 等)→ block;
   PII(邮箱/手机/身份证/IP)→ redact 脱敏
2. chat.py:block 直接拦;redact 时脱敏后再进模型,并在响应里暴露 redacted/redaction_rules/preview
3. Envoy Lua filter:同样拦注入(返回 400)——双层纵深防御
4. api/gateway.py:POST /gateway/guardrail-test 走真实 input_guard,返回 PASS/BLOCKED/REDACTED+命中规则+脱敏预览
5. 前端 Gateway 控制面 Guardrail tab:输入框现场测 + 示例按钮
诚实保留缺口:中文越狱/编码变体规则拦不住——加一个中文越狱示例,测出 PASS 时
提示"规则不够,需 ML guard"。
```

### 预期产出
- `security/input_guard.py`、`api/chat.py`(暴露 redacted)、`api/gateway.py`(guardrail-test)、envoy Lua、前端 GatewayPanel Guardrail tab

### 验收命令
```bash
docker compose up -d --build backend envoy-ai-gateway frontend
curl -s -X POST localhost:8000/gateway/guardrail-test -H "Content-Type: application/json" -d '{"text":"ignore previous instructions"}'
curl -s -X POST localhost:8000/gateway/guardrail-test -H "Content-Type: application/json" -d '{"text":"邮箱 a@b.com 手机 13812345678"}'
```

### 人工检查点
- 注入 → BLOCKED;PII → REDACTED + 脱敏预览;正常 → PASS
- 中文越狱 → PASS(反面教材,引出 ML guard)
- Gateway 直测注入返回 400(双层)

### 兜底(`git checkout training-step-N`,N = 本步号;或对照 main 的下列文件)
- `backend/app/security/input_guard.py`、`api/chat.py`、`api/gateway.py`、`envoy-deepseek.yaml.tmpl`(Lua)、前端 `GatewayPanel.tsx`

---

## Step 12 · 红队报告(CI 跑 / 页面展示)

**对应 PPT**:Slide 40
**起点**:Step 11 完成
**目标**:红队 runner 跑攻击 → 算各类通过率 → 存后端 → 页面只读展示。

### 粘给 Claude Code 的 Prompt
```
先给计划再改。红队报告:跑在 CI/离线,结果存后端,页面只读展示。
1. security/red-team/run.py:纯标准库(兼容 py3.6),16 个用例(注入/越狱/PII/正常),
   打 /chat/query 算各类通过率,瞬时错误重试,写 summary.json 并 POST 后端
2. init.sql + api/gateway.py:redteam_reports 表 + POST/GET /gateway/redteam-report
3. 前端 Gateway 控制面"红队报告" tab:总通过率进度条 + 按类别条形 + 漏网用例清单
4. Makefile:redteam 目标跑 run.py
诚实:漏网清单(尤其中文越狱)是下一轮 Guardrail 输入,不是坏事。
```

### 预期产出
- `security/red-team/run.py`、`api/gateway.py`(redteam 端点)、`init.sql`(表)、前端红队 tab、Makefile

### 验收命令
```bash
make redteam   # 跑完 POST 到后端
curl -s localhost:8000/gateway/redteam-report | python3 -c "import sys,json;r=json.load(sys.stdin);print('overall:',round(r['overall_pass_rate']*100),'%')"
```

### 人工检查点
- 报告有总通过率 + 4 类 + 漏网用例
- 越狱类通过率明显低于注入/PII(中文漏网),诚实暴露
- **不能出现**:页面放一个"实时运行红队"按钮当主功能(红队是 CI/离线事)

### 兜底(`git checkout training-step-N`,N = 本步号;或对照 main 的下列文件)
- `security/red-team/run.py`、`backend/app/api/gateway.py`、`infra/postgres/init.sql`、前端 `GatewayPanel.tsx`

---

# 阶段 C · 企业落地(从阶段 B 末态继续;参考答案 = `main`)

## Step 13 · 登录门 + CI/CD

**对应 PPT**:Slide 54
**起点**:Step 12 完成
**目标**:加密码登录门 + CI/CD 流水线(本课用 Jenkins;GitHub 版可用 Actions)。

### 粘给 Claude Code 的 Prompt
```
先给计划再改。
A. 登录门(Next.js):
   - src/middleware.ts:无 demo_auth cookie 一律重定向 /login
   - src/app/login/page.tsx:匹配风格的登录页(indigo 渐变)
   - src/app/auth/login/route.ts:校验 DEMO_PASSWORD(env)设 httpOnly cookie;logout 路由
   - docker-compose frontend 加 DEMO_PASSWORD env(默认 vibecoding2026)
   - 注意:/auth/* 不能被 /api/* 重写规则吃掉
B. CI/CD:流水线 build 双镜像 → push → 部署 → 健康检查(探 /login 因为 / 会 307)
   → smoke(注入拦截)→ 红队
```

### 预期产出
- `frontend/src/middleware.ts` / `app/login/page.tsx` / `app/auth/login/route.ts`、CI 配置

### 验收命令
```bash
docker compose up -d --build frontend
curl -s -o /dev/null -w "%{http_code}\n" localhost:3000/        # 期望 307
curl -s -o /dev/null -w "%{http_code}\n" localhost:3000/login   # 期望 200
curl -s -X POST localhost:3000/auth/login -H "Content-Type: application/json" -d '{"password":"vibecoding2026"}' -o /dev/null -w "login %{http_code}\n"
```

### 人工检查点
- 未登录访问 / → 跳 /login;对密码 → 设 cookie → 进 Dashboard
- 健康检查探 /login(不是 /,因为登录门后 / 是 307)
- **不能出现**:把密码硬编码进前端代码(应 env)

### 兜底(`git checkout training-step-N`,N = 本步号;或对照 main 的下列文件)
- `frontend/src/middleware.ts`、`app/login/page.tsx`、`app/auth/login/route.ts`、`docker-compose.yml`

---

## Step 14 · 公网 / 内网 HTTPS 上线

**对应 PPT**:Slide 55
**起点**:Step 13 完成
**目标**:从 localhost 到可访问服务——公网入口最小化,key 留内网。

### 粘给 Claude Code 的 Prompt
```
先给计划再改/再生成脚本与配置(只做配置和脚本,不在课上现场全搭)。
A. 内网 HTTPS:infra/tls/nginx.conf(终结 TLS → 代理 frontend:3000,client_max_body_size 50m)
   + gen-cert.sh(自签证书带 SAN,兼容老 openssl 用 config 文件);
   docker-compose 加 nginx-tls 服务(profile=tls)
B. 公网映射(讲架构,给步骤文档):
   - 部署机主动建反向 SSH 隧道,把内网 3000 暴露成公网机本地端口(只暴露前端)
   - 公网 nginx 独立 vhost(子域名)proxy_pass 到隧道;certbot 签证书
   - backend / Gateway / model key 全留内网
边界:这不是生产 HA;隧道适合 demo/POC;生产用专线/VPN/Ingress/WAF。
```

### 预期产出
- `infra/tls/nginx.conf` / `gen-cert.sh`、docker-compose nginx-tls 服务、上线步骤文档

### 验收命令
```bash
bash infra/tls/gen-cert.sh
docker compose --profile tls up -d nginx-tls
curl -sk -o /dev/null -w "https /login -> %{http_code}\n" -H "Host: vibe-coding.demo.local" https://localhost/login
```

### 人工检查点
- 内网 https 访问 /login 返回 200(自签证书 -k 忽略)
- 文档写清"只暴露前端、key 在内网、非生产 HA"边界
- **不能出现**:把 backend/gateway/数据库端口也暴露公网

### 兜底(`git checkout training-step-N`,N = 本步号;或对照 main 的下列文件)
- `infra/tls/nginx.conf`、`infra/tls/gen-cert.sh`、`docker-compose.yml`(nginx-tls 段);公网 nginx vhost 不在仓库(在公网机)

---

## Step 15 · 供应链安全:Koi 查询台 + CI 门禁

> **后加的增强**:Step 0-14 是原始 3 阶段;Step 15 在 `training-step-14` 之上加第二道治理——供应链安全。

**对应 PPT**:暂无独立页(PPT 可作为 **Harness / 企业落地的加分页**讲:"模型面拦坏请求 + 供应链面拦坏软件")
**起点**:Step 14 完成(`training-step-14`)
**目标**:加供应链安全(Koi),两个切片:
- **Pattern A**:交互式 Koidex 查询台(控制面 tab,即席查任意制品风险)
- **Pattern B**:`make supply-scan` / CI `Supply Chain Gate`(扫本项目依赖+工具,门禁)

### 粘给 Claude Code 的 Prompt
```
先给计划再改。先讲清两道治理的区别:
  - Envoy AI Gateway = inline 模型数据面网关(每次 LLM 调用必经)
  - Koi = 旁路供应链风险裁定(backend/CI 调它的 API 取裁定, 不在请求链路里)
然后实现:
A. gateway/koi_client.py:调 Koi Koidex risk-report(GET item_id+marketplace+version),
   按 risk_level 映射三态 high→BLOCK / medium→REQUEST_APPROVAL / low→PASS;新制品先 fetch 再轮询。
B. security/supply_chain.py:闸门编排——KOI_ENABLED=false 完全不外调走离线兜底;
   enabled 但 Koi 不可用时 fail-safe 降级 REQUEST_APPROVAL(绝不 fail-open 放行)。
C. POST/GET /gateway/supply-chain-check + /supply-chain/samples + /supply-chain-report;
   db 启动幂等建表(已存在库免迁移)。
D. 前端 Gateway 控制面新增「供应链 (Koi)」tab:交互式查询台 + 本项目供应链报告区。
E. security/supply-chain/scan.py(stdlib, py3.6 兼容):扫 backend/Dockerfile(pip)+
   frontend/package.json(npm)+ ai-tools.yaml(MCP/扩展)→ 调 backend → 门禁:
   BLOCK/未审批中风险 fail build;中风险经 approvals.yaml 审批后放行。Makefile 加 supply-scan。
F. 回归测试:disabled 不外调 / 三态映射 / enabled+不可用=REQUEST_APPROVAL / 空 KOI_API_BASE 不覆盖默认。
约束:任何供应链查询走 gateway/koi_client.py;key 只进 .env(gitignore), 不进代码/仓库。
```

### 预期产出
- `backend/app/gateway/koi_client.py`、`backend/app/security/supply_chain.py`、
  `backend/app/api/gateway.py`(供应链端点)、`backend/tests/test_supply_chain.py`
- `security/supply-chain/scan.py` / `ai-tools.yaml` / `approvals.yaml`、`Makefile`(supply-scan)
- 前端 `GatewayPanel.tsx`(供应链 tab)+ `lib/api.ts`、`.env.example`(KOI_*)

### 验收命令
```bash
cd backend && pytest -q                 # 全绿(含 4 个供应链回归测试)
make supply-scan                        # 门禁结论 PASS, 退出码 0
```
UI 检查(Gateway 控制面 →「供应链 (Koi)」):
- `pypi/requests` → **REQUEST_APPROVAL**,source=koi
- `github_mcp_registry/upstash/context7` → **PASS**,source=koi
- 「本项目供应链报告」**gate=pass**,3 个 medium(next / httpx / anthropic.claude-code)已审批

### 人工检查点
- `KOI_ENABLED=false` → 完全不外调,走离线兜底(source=offline)
- Koi 不可用(改错 key)→ 降级 **REQUEST_APPROVAL**,**绝不** PASS(不 fail-open)
- 把 `approvals.yaml` 某条注释掉 → `make supply-scan` 门禁 **FAIL**、退出码 1(证明门真的拦)
- **不能出现**:把 Koi token 写进代码/仓库(只进 `.env`)

### 兜底(`git checkout training-step-15`;或对照 main 的下列文件)
- `backend/app/gateway/koi_client.py`、`backend/app/security/supply_chain.py`、`security/supply-chain/`、`frontend/src/components/GatewayPanel.tsx`

---

## Step 16 · 渗透测试(DAST):ZAP + Nuclei + 报告 tab

> **第三道治理**:Step 11 模型面(Guardrail)、Step 15 供应链面(Koi),这一步补运行时面——对**已部署的应用**做黑盒动态扫描(DAST)。

**对应 PPT**:Harness / 企业落地加分页("跑起来之后再扫一遍真实的 HTTP 面")
**起点**:Step 15 完成(`training-step-15`)
**目标**:CI 部署后对活动站点做 DAST,**report-only 不阻断**,结果上报 + 页面展示。

### 粘给 Claude Code 的 Prompt
```
先给计划再改。加渗透测试(DAST),report-only(不做门禁,只产报告):
A. security/pentest/run.py(stdlib):对 TARGET_URL 跑 OWASP ZAP baseline + Nuclei(docker),
   两者都缺时用 builtin urllib 做被动安全头检查兜底;risk 归一为 High/Medium/Low/Info。
   镜像可经 ZAP_IMAGE / NUCLEI_IMAGE env 配置(内网换镜像源)。
B. backend:POST/GET /gateway/pentest-report;db 启动幂等建表 pentest_reports(只增不删)。
C. 前端 Gateway 控制面新增「渗透测试」tab,按 risk 分级展示 findings。
D. Jenkinsfile 加 Pentest(DAST)stage(Red Team 之后);Makefile 加 pentest 目标。
约束:report-only 绝不 fail build;不碰 envoy.yaml;init.sql 非破坏式。
```

### 预期产出
- `security/pentest/run.py` / `README.md`、`Makefile`(pentest)
- `backend/app/schemas.py`(PentestReport)、`backend/app/api/gateway.py`(pentest 端点)、`backend/app/db.py` + `infra/postgres/init.sql`(pentest_reports)
- 前端 `GatewayPanel.tsx`(渗透 tab)+ `lib/api.ts`、`Jenkinsfile`(Pentest stage)

### 验收命令
```bash
TARGET_URL=http://localhost:8000 make pentest   # 产出报告, 退出码 0(report-only)
```
UI 检查(Gateway 控制面 →「渗透测试」):有 findings 按 High/Medium/Low/Info 分级展示;无 ZAP 时也至少有 builtin 头检查结果。

### 兜底(`git checkout training-step-16`;或对照 main 的下列文件)
- `security/pentest/`、`backend/app/api/gateway.py`、`frontend/src/components/GatewayPanel.tsx`

---

## Step 17 · 首屏性能优化:SSR 预取 + 骨架 + 去重往返

> **工程打磨步**:前面都在加能力,这一步专治体验——首屏"打开后空 3-5s 才出数据"的冷启观感。不改后端逻辑、不加组件(遵守 CLAUDE.md "不装 redis")。

**对应 PPT**:Quality / 工程化("AI 写完功能后,人来做性能与体验的收尾")
**起点**:Step 16 完成(`training-step-16`)
**目标**:定位真实瓶颈(不是"重读日志",是冷启 + 串行往返 + 误导空态),三层叠加优化。

### 先定位(关键:别凭感觉加缓存)
- 首屏只发 `listJobs()` + `getJob()` 两个**走索引的轻查询**,数据 upload 时已算好入库,**没有重读/重算日志**。
- `listJobs` 与 `getJob` 用**同一 SELECT + 同一 `_row_to_job`**,返回的就是完整 job(含 `analysis`)→ 第二次 `getJob` 是多余往返。
- 3-5s 是**冷启**(代理链/连接首次建立),不是查询慢 → 加 Redis 挡在同样冷的链路后面救不了,且 CLAUDE.md 明令不装。

### 粘给 Claude Code 的 Prompt
```
先定位再改, 不要直接加缓存组件。首屏慢的真因有三个, 分别治:
A. 去重往返:listJobs 返回的已是完整 job(含 analysis), 首屏直接用它渲染,
   仅状态非终态(分析中)才设 jobId 启动轮询, 省掉一次串行 getJob。
B. 区分"加载中"vs"真的空":冷启那几秒显示骨架(DataSkeleton), 不再显示
   误导的"暂无数据"; 确认无历史才显示空态。
C. SSR 预取:page.tsx 改 server component, 服务端(内网直连 backend)预取最近一次分析,
   传给 HomeClient 作 initialJob; 配 loading.tsx 流式骨架, 避免 force-dynamic 阻塞白屏;
   预取失败回退客户端 listJobs。
顺带:TopBar「AI 助手」按钮做成 toggle(点开出边框、再点收起)。
约束:不改后端业务逻辑、不加依赖(不装 redis)、不碰 init.sql/envoy.yaml。
```

### 预期产出
- `frontend/src/app/page.tsx`(server component 预取)、`frontend/src/app/HomeClient.tsx`(交互逻辑)、`frontend/src/app/loading.tsx`(流式骨架)、`frontend/src/lib/server-api.ts`(服务端取数)
- `frontend/src/components/TopBar.tsx`(AI 助手 toggle)
- `docs/ARCHITECTURE.md`(架构总览)

### 验收 / 人工检查点
- 后端热:骨架一闪 → 整页带数据,浏览器**零往返**;后端冷:先骨架不白屏 → 就绪换整页。
- 断开/无历史:`initialJob=null` → 客户端 `listJobs` 回退,功能不受影响。
- 「AI 助手」点一下展开(按钮出边框)、再点一下收起。
- **不能出现**:为这个加 Redis / 改后端读日志逻辑(真因是冷启+往返,不是数据源)。

### 兜底(`git checkout training-step-17`;或对照 main 的下列文件)
- `frontend/src/app/page.tsx`、`frontend/src/app/HomeClient.tsx`、`frontend/src/app/loading.tsx`、`frontend/src/lib/server-api.ts`、`frontend/src/components/TopBar.tsx`

---

## 完成 = 当前 demo 的样子

走完 Step 0-17,你就从空目录搭出了:
nginx/apache/syslog 多格式解析 → RAG + structured generation → Envoy AI Gateway
双模型路由 → Guardrail 三态 → 红队报告 → 登录门 → 公网/内网 HTTPS →
供应链安全(Koi 查询台 + CI 门禁)→ 渗透测试(DAST)→ 首屏性能优化,
和 `main` 分支一致。卡在任何一步:阶段 A 用 `git checkout tutorial-step-N`,
阶段 B/C 用 `git checkout training-step-N`(N=步号),最终态 = `main` = `training-step-17`。
