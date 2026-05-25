# AI Log Analysis Platform · Vibe Coding Demo

一个**教学用**的 AI Native 应用样例:上传 Nginx / Apache / Linux 日志 → AI 结构化总结异常 →
自然语言查询 → 输出带证据的分析。

**真正的看点不是 RAG,而是它是一个完整的 "AI Harness" 样例**:业务代码不直连模型,
所有 LLM 调用走 **Envoy AI Gateway**(双模型路由 + Guardrail + 限流 + 审计),
输出被 **schema 锁定**,上线前有**可执行的红队报告**。

> 这个仓库有两种用法:**① 直接跑起来看**,或 **② 从 0 跟着 14 步用 AI 自己搭出来**(见下)。

---

## 能力一览

- **多格式日志解析**:nginx access / apache error / linux syslog 自动识别
- **Structured Generation**:LLM 输出走 JSON mode + Pydantic 校验 + 重试(非自由文本)
- **Envoy AI Gateway**:DeepSeek / Qwen 双模型,按 `X-LLM-Backend` header 路由,业务代码不变
- **Guardrail 三态**:Prompt 注入 `BLOCKED` / PII `REDACTED` / 正常 `PASS`,页面可现场测
- **供应链安全(Koi)**:端点/供应链安全平台,demo 展示两个切片——① 控制面「交互式 Koidex 查询台」即席查任意制品(pip/npm/HF 模型/扩展/MCP server)风险;② **CI 供应链门禁**(`make supply-scan`)扫本项目依赖+工具,`BLOCK`/未审批中风险 fail build(模型面拦坏请求,供应链面拦坏软件;未配置走离线兜底,Koi 不可用 fail-safe 不放行)
- **红队报告**:`make redteam` 跑攻击集 → 各类通过率 + 漏网用例,Gateway 控制面展示
- **渗透测试(DAST)**:`make pentest` 用 OWASP ZAP + Nuclei 扫运行中的 HTTP 应用面(缺安全头 / 注入 / SSRF / CORS / 已知 Web 漏洞),无 docker 走 builtin 被动检查兜底;结果在 Gateway 控制面「渗透测试」tab(红队测 LLM 行为,pentest 测运行时 Web 面,互补)
- **登录门 + 控制面 UI**:密码登录、时间柱图、日志表、AI 助手抽屉、Gateway 控制面板

技术栈:FastAPI · Next.js 14 · Postgres+pgvector · Envoy AI Gateway · docker-compose。

---

## 用法 ①:直接跑

```bash
# 需要 Docker 24+ / Docker Compose v2
cp .env.example .env
# 编辑 .env:填 DEEPSEEK_API_KEY 和/或 QWEN_API_KEY(都不填可走离线 mock,见下)
#           DEMO_PASSWORD 默认 vibecoding2026

make demo            # docker compose up -d --build,约 90 秒起齐

# 打开
open http://localhost:3000        # Dashboard(先登录,密码 = DEMO_PASSWORD)
open http://localhost:8000/docs   # 后端 FastAPI Swagger
curl localhost:8090/health        # Envoy AI Gateway

make seed            # 喂示例日志(testdata/ 里有 nginx/apache/syslog 三份)
make redteam         # 跑红队,结果在 Gateway 控制面"红队报告" tab
make supply-scan     # 供应链门禁:扫本项目依赖+工具→Koi 风险,结果在"供应链 (Koi)" tab
make pentest         # 渗透测试 DAST:ZAP+Nuclei 扫运行时 Web 面,结果在"渗透测试" tab
make down            # 收摊
```

**离线模式**(无 API key):`docker compose --profile mock up -d`,LLM 走内置 mock-llm。

**内网 HTTPS**(可选):`bash infra/tls/gen-cert.sh && docker compose --profile tls up -d nginx-tls`,
本机 hosts 指 `vibe-coding.demo.local` 到该机即可 `https://` 访问。

---

## 用法 ②:从 0 用 AI 搭出来

这才是这门课的核心 —— **不是抄代码,是组织 AI 完成交付**。跟着
**[`docs/BUILD-FROM-ZERO.md`](./docs/BUILD-FROM-ZERO.md)** 的 14 步,把每步 Prompt 粘给
Claude Code,让它先给计划→改文件→你跑验收。卡住了用检查点兜底。

课前准备见 **[`docs/STUDENT-PREP.md`](./docs/STUDENT-PREP.md)**(装什么、要哪些 key)。

---

## 分支与检查点(git tag)

| 引用 | 是什么 | 用法 |
|---|---|---|
| `main` | 完整最终态 | `git clone && make demo` |
| `tutorial` 分支 | 从 0 到 14 的连续递进历史 | `git checkout tutorial && git log` |
| `tutorial-step-0..6` | **阶段 A**(工程契约→PRD→骨架→实现→测试→Debug→Review)每步快照 | `git checkout tutorial-step-3` |
| `training-step-7..14` | **阶段 B/C**(Gateway→结构化→多格式→双模型→Guardrail→红队→登录→上线)每步快照 | `git checkout training-step-11` |

`main == training-step-14`(最终态)。逐步实操时:卡住就 `git checkout <对应 step tag>` 看参考。

> PPT 的 "Prompt N" 编号和这里的 step/tag 不是一套,换算表见 BUILD-FROM-ZERO 顶部。

---

## 目录速览

```
.
├── CLAUDE.md / DESIGN.md / WORKFLOW.md   ← 工程契约(L1/L2/L3,AI 的项目记忆)
├── backend/                              ← FastAPI:api / services / agents / security / gateway 五层
├── frontend/                             ← Next.js 14:登录门 / Dashboard / AI 助手 / Gateway 控制面
├── gateway/envoy-ai-gateway/             ← Envoy 配置(本地可跑 + 生产 K8s CRD 模板)+ mock-llm 上游
├── gateway/portkey/                      ← Portkey 对比页(为什么自托管 Gateway)
├── infra/                                ← postgres init.sql · OTel(可选) · tls(内网 HTTPS)
├── security/                             ← 红队 · pentest(ZAP/Nuclei DAST)· Garak · Trivy/SBOM
├── .claude/                              ← hooks(运行时护栏)+ subagents(reviewer/tester/architect)
├── evaluation/ · scripts/ · testdata/    ← golden dataset · seed/inject-bug/redteam · 样本日志
└── docs/                                 ← 见下"文档索引"
```

---

## 文档索引

| 你是… | 看这些 |
|---|---|
| 想跑 / 想学的人 | 本 README → [`docs/STUDENT-PREP.md`](./docs/STUDENT-PREP.md) → [`docs/BUILD-FROM-ZERO.md`](./docs/BUILD-FROM-ZERO.md) |
| 研发(读代码) | [`CLAUDE.md`](./CLAUDE.md) → [`DESIGN.md`](./DESIGN.md) → `backend/` + `gateway/` |
| 讲师 | [`INSTRUCTOR.md`](./INSTRUCTOR.md) + [`docs/TRAINING-BREAKDOWN.md`](./docs/TRAINING-BREAKDOWN.md) + [`docs/TEST-CASES.md`](./docs/TEST-CASES.md) |
| 想测 Guardrail / 多格式 / 红队 | [`docs/TEST-CASES.md`](./docs/TEST-CASES.md)(可复制粘贴的用例) |

---

## 设计取舍(故意不做的)

- **默认不上 K8s**:Envoy 的生产 CRD 模板在 `gateway/.../config/`,但本地用 docker-compose 一键起。
- **结构化输出 ≠ constrained decoding**:用的是 JSON mode + Pydantic 校验 + 重试;
  token 级强约束需接 Outlines / dottxt(已在文档注明边界)。
- **MCP 不是主链路**:作为工具层可插拔扩展位,不在本 demo 现场演示。
- **公网映射是 demo/POC 级**:反向隧道 + 单入口,非生产 HA(生产需专线/VPN/Ingress/WAF)。

## 参考

- Envoy AI Gateway:https://aigateway.envoyproxy.io/
- Promptfoo(红队标准工具,本仓 `security/red-team/promptfoo.yaml` 为兼容格式参考):https://promptfoo.dev/
- NVIDIA Garak:https://github.com/NVIDIA/garak
