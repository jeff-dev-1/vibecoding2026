# 培训分解 — 从 0 到当前 demo 的 14 步

> 目标:让学员从空仓一步步搭出当前这个 demo 的样子。
> 这份是**新版课程讲解结构**,比 PPT 原本的 6 步 Demo Flow 更完整(demo 已演进出
> structured generation / 双模型 / Guardrail / 红队 / 上线映射等,超出原 6 步)。

## ⚠️ 先分清三个东西(别混)

| 名字 | 是什么 | 用途 |
|---|---|---|
| `tutorial-step-0..7` (git tag) | **基础版**的粗粒度递进历史,8 个真实 commit | `git checkout tutorial-step-N` 看基础闭环每一步的子集状态 |
| 本文 14 步 | **新版课程讲解结构**(含后来演进的能力) | 讲师备课、现场推进的脚本 |
| `training-step-00..14` (尚未建) | 若以后要让学员逐步 checkout 14 步,**再另建**的 tag/分支 | 目前不存在;需要时单独搭 |

**重点**:14 步 ≠ 现有 `tutorial-step-0..7`。现有 tag 只覆盖基础版(阶段 A),
阶段 B/C(Structured Generation、双模型、登录、公网映射)还没拆成 tag。

---

## 时间分配(3 小时课,Session 2 主体 ~60 min)

| 阶段 | 步 | 现场策略 | 时长 |
|---|---|---|---|
| A 基础闭环 | 0–6 | live 为主,耗时步用 `tutorial-step-N` checkout 兜底 | ~30 min |
| B AI Native 进阶 | 7–12 | 选 2–3 个 live(8/11/12 最有料),其余预录/截图 | ~20 min |
| C 企业落地 | 13–14 | 讲架构 + 看成品,**不现场搭** | ~10 min |

---

## 阶段 A:基础闭环(对应 PPT 现有 6 步)

### 步 0 · 工程契约
- **产出**:CLAUDE.md / DESIGN.md / WORKFLOW.md / INSTRUCTOR.md
- **对应**:PPT Slide 14(Context Stack)/ 16(项目记忆)
- **tag**:`tutorial-step-0`
- **live?**:是(2 min,打开三个文件念禁止事项+目录约定)
- **话术**:"Vibe Coding 不是上来写代码,是先写工程契约。AI 被这份契约约束,不是被 prompt 约束。"

### 步 1 · Prompt 0 需求澄清
- **产出**:docs/PRD.md(目标/MVP 边界/验收标准/风险)
- **对应**:Slide 25 | **tag**:`tutorial-step-1` | **live?**:是(5 min)
- **话术**:"先定验收标准,后面测试和 Review 才有依据。AI 先澄清,不直接 build。"

### 步 2 · Prompt 1 项目骨架
- **产出**:docker-compose + 五层目录 + pgvector init.sql + Makefile
- **对应**:Slide 26/27 | **tag**:`tutorial-step-2` | **live?**:是(5 min,先列树再生成)
- **话术**:"骨架决定可维护性。AI 先列目录树,不让它满项目乱建文件。"

### 步 3 · Prompt 2-4 核心实现
- **产出**:backend(api/services/agents/security/gateway)+ frontend Dashboard + RAG 管道
- **对应**:Slide 28-30 | **tag**:`tutorial-step-3` | **live?**:预录/checkout(15 min 最长)
- **话术**:"API + schema + 测试一起生成。RAG 不是黑盒,每段(parser/embedding/检索/总结)都对应客户能问到的问题。"

### 步 4 · Prompt 5 测试 + CI
- **产出**:backend/tests + evaluation/golden_dataset + .github/workflows/ci.yml
- **对应**:Slide 31 | **tag**:`tutorial-step-4` | **live?**:是(5 min,跑 pytest)
- **话术**:"企业不因 AI 能写代码放心,因 AI 能被验证才放心。"

### 步 5 · Prompt 6 AI Debug
- **产出**:`scripts/inject-bug.sh` 注入 bug → AI 最小修复
- **对应**:Slide 32 | **tag**:`tutorial-step-5` | **live?**:是(10 min,**最有看点**)
- **话术**:"列 3 个根因 → 最小修改 → 跑测试 → 复盘。不让 AI 一次大改。"

### 步 6 · Prompt 7 两阶段 Review
- **产出**:`.claude/agents/reviewer.md`(Spec Compliance → Code Quality)
- **对应**:Slide 33 | **tag**:`tutorial-step-6` | **live?**:是(5 min)
- **话术**:"Review 不是看代码,是看证据。先规范符合,再代码质量。"

---

## 阶段 B:AI Native 进阶(PPT 没有,**最大增量价值**)

### 步 7 · 接 Envoy AI Gateway(单模型 DeepSeek)
- **产出**:gateway/envoy-ai-gateway(本地 docker-compose 可跑 + K8s CRD 模板)
- **对应**:Slide 38(让它从概念落到能跑) | **tag**:无(待建) | **live?**:讲架构 + 看配置
- **话术**:"业务不直连 LLM,走控制面。你不会让微服务直连数据库,凭什么直连 LLM?"

### 步 8 · Structured Generation(schema-locked 输出)
- **产出**:`LogAnalysis`/`SecurityEvent` Pydantic schema + DeepSeek `response_format=json_object`
- **对应**:**PPT 缺,建议新增**(Slide 33 Spec Compliance 的实现) | **live?**:是(展示 JSON 字段)
- **话术**:"AI 输出被 schema 锁住,不是自由文本。LLM 是被合同约束的供应商,下游按字段消费。"——**售前杀手锏**

### 步 9 · 多格式日志解析(nginx/apache/syslog 自动识别)
- **产出**:log_parser 三种解析 + 前端表格自适应
- **对应**:Slide 22 补一句 | **live?**:截图/快演(传 apache + syslog 各一份)
- **话术**:"robust 处理真实日志。上传任意 web 日志,自动识别格式。"

### 步 10 · 双模型路由(加 Qwen,header 路由)
- **产出**:Envoy 加 qwen_cluster,按 `X-LLM-Backend` 头路由
- **对应**:Slide 38 加实拍 | **live?**:是(下拉切 DeepSeek↔Qwen 同问题对比)
- **话术**:"换模型零改业务代码,改的是 Gateway 一个 header 路由。这就是模型控制面。"

### 步 11 · Guardrail(注入/PII)+ 现场测试
- **产出**:input_guard + Envoy Lua 双层 + Guardrail 测试框 + 中文越狱反面教材
- **对应**:Slide 19/44/48 落地 | **live?**:是(**强烈推荐**,三态对照)
- **话术**:"拦截/脱敏/漏网三态。中文越狱漏网 → 引出'规则不够,需 ML guard'。提示词是软约束,Hook 是硬护栏。"

### 步 12 · 红队报告(CI 跑 / 页面展示)
- **产出**:security/red-team/run.py + redteam_reports 表 + Gateway 控制面"红队报告"tab
- **对应**:Slide 48 风险矩阵的可执行版(**PPT 缺,建议新增**) | **live?**:是(看报告 88% + 漏网清单)
- **话术**:"上线前可执行的风险矩阵。88% 达标,但越狱类暴露中文漏网——给 CISO 看的就是这张。"

---

## 阶段 C:企业落地(上线工程,讲架构不现场搭)

### 步 13 · 登录门 + CI/CD
- **产出**:Next.js middleware 密码门 + Jenkinsfile(build→push→deploy→smoke→红队)
- **对应**:Slide 45/46 落地 | **live?**:看 Jenkinsfile 阶段图
- **话术**:"从个人试用到流水线交付。每次提交自动 build/测/红队。"

### 步 14 · 公网/内网 HTTPS 上线
- **产出**:反向 SSH 隧道 + 公网 nginx vhost + certbot;.210 nginx-tls 自签
- **对应**:Session 3 落地(**PPT 缺,建议新增架构页**) | **live?**:打开 https://demo.example.com 看成品
- **话术**:"从 demo 到可访问的服务。只暴露前端一个端口,backend/key 全在内网,安全面最小。"

---

## 讲师兜底(对应 PPT Slide 39)
- 耗时步骤(步 3/7)用 `git checkout tutorial-step-N` 或预录
- 网络挂:demo 默认走 DeepSeek;离线可 `--profile mock` 切 mock-llm
- 现场只演阶段 A + 阶段 B 选 3 个;阶段 C 看成品即可
