# 学员准备清单 — Vibe Coding / AI Native 实战

> 培训前请按本清单准备好环境。建议**提前一天跑通"验证步骤"**,避免现场卡在装环境。
> 有任何一项装不上,提前联系讲师。

---

## 一、必备软件

| 软件 | 版本 | 用途 | 验证命令 |
|---|---|---|---|
| **Docker** | 24+ (Docker Desktop 或 Engine) | 跑整个 demo(数据库/网关/前后端都在容器里) | `docker --version` |
| **Docker Compose** | v2(`docker compose`,不是老的 `docker-compose`) | 一键编排 | `docker compose version` |
| **Git** | 2.x | 拉代码 | `git --version` |
| **一个代码编辑器** | 最新 | 看代码、改文件 | VS Code 或 Cursor |
| **Claude Code CLI** | 最新 | **本课核心**:用 AI 组织软件交付 | `claude --version` |

> macOS / Windows(WSL2)/ Linux 都可以。Windows 强烈建议用 **WSL2 + Docker Desktop**。

---

## 二、账号 / API Key(二选一)

本 demo 的 AI 分析需要一个 LLM。**两条路任选**:

### 路线 A:用真实模型(推荐,效果好)
准备一个 **OpenAI 兼容** 的 API Key,任选其一:
- **DeepSeek**:https://platform.deepseek.com → 充值少量额度 → 拿 `sk-...`
- **阿里云 DashScope (Qwen)**:https://dashscope.console.aliyun.com → 开通 → 拿 `sk-...`
- 或 OpenAI / 其他兼容服务

> 课上演示"双模型路由"会同时用 DeepSeek + Qwen,两个都备最好;只备一个也能跑。

### 路线 B:完全离线(没 key 也能跑)
demo 自带 `mock-llm`,`docker compose --profile mock up` 即可,无需任何 key。
> 离线模式 AI 总结是固定的示例文本,适合纯看流程;想看真实分析效果走路线 A。

### 另外:用 AI 写代码本身需要
本课是"用 AI 完成软件交付",所以你还需要能用 **Claude**(Claude Code 背后的模型):
- Claude 订阅(Pro/Team)或 Anthropic API Key 之一
- 没有也能听,但动手环节要能调用 Claude

### 可选:Koi 供应链安全 Key(「供应链 (Koi)」tab + `make supply-scan`)
供应链门禁默认走**离线兜底**(本地样例库,能演示三态但非实时)。想看**真实 Koi 评分**,自己申请一个:
- 注册 **koi.ai / extensiontotal**,在控制台 **API / Settings** 里生成一个 API Key(Bearer)
- 填进 `.env`:`KOI_ENABLED=true` + `KOI_API_KEY=<你自己的 key>`
- **不填也能跑**(走离线兜底);**讲师现场演示用的是讲师自己的 key,不会下发**——你做实验请用自己的
- key 只进 `.env`(已 gitignore),**切勿提交进仓库**

---

## 三、机器要求

| 项 | 最低 | 建议 |
|---|---|---|
| 内存 | 8 GB | 16 GB |
| 空闲磁盘 | 10 GB | 20 GB(镜像 + 构建缓存) |
| CPU | 2 核 | 4 核 |
| 网络 | 能访问 Docker Hub + LLM API | 公司网络注意代理/防火墙 |

---

## 四、提前拉取(强烈建议,避免现场等下载)

课前在能联网的环境跑一次,把镜像和依赖都缓存好:

```bash
# 1. 拉代码
git clone <课程仓库地址> vibe-coding-demo
cd vibe-coding-demo

# 2. 预拉基础镜像(最耗时,提前做)
docker pull pgvector/pgvector:pg16
docker pull envoyproxy/envoy:v1.32-latest
docker pull node:20-alpine
docker pull python:3.11-slim
docker pull nginx:1.27-alpine

# 3. 配置 key(没有就跳过,用 mock)
cp .env.example .env
# 编辑 .env 填入 DEEPSEEK_API_KEY / QWEN_API_KEY
# 想看真实供应链评分再填 KOI_ENABLED=true + KOI_API_KEY(自己申请;不填走离线兜底)

# 4. 构建 + 启动(首次构建前端/后端镜像会下载依赖,几分钟)
docker compose up -d --build
```

> 国内网络拉镜像慢:给 Docker 配国内 registry mirror(如 `docker.m.daocloud.io`),
> 或让讲师提供镜像 tar 包 `docker load`。

---

## 五、验证步骤(课前自测,全绿就 OK)

```bash
# 服务起来后等约 60 秒,然后:
curl -s localhost:8000/health     # 期望 {"ok":true,...}
curl -s localhost:8090/health     # 期望 {"ok":true,"gateway":...}
open http://localhost:3000        # 浏览器打开,出现登录页

# 喂示例日志(仓库 testdata/ 里有 3 份样本)
# 上传后能看到流量图表 + AI 分析报告 = 成功
```

登录访问码见讲师下发, 或自己在 `.env` 里设 `DEMO_ACCESS_CODE`。
没有默认值 —— 不设的话前端会拒绝全部登录 (fail closed), 这是刻意的:
一个人人都知道的默认口令, 在任何对外可达的部署上就是一道敞开的门。

| 验证项 | 期望 |
|---|---|
| `docker compose ps` | 4 个服务(postgres/gateway/backend/frontend)healthy |
| `localhost:8000/health` | `{"ok":true}` |
| 浏览器 `localhost:3000` | 出现登录页 |
| 上传 `testdata/access-10k.log` | 出现图表 + 分析报告 |

---

## 六、端口占用检查

demo 会用这些端口,确保没被占:

| 端口 | 服务 |
|---|---|
| 3000 | 前端 Dashboard |
| 8000 | 后端 API |
| 8090 | Envoy AI Gateway |
| 5432 | Postgres |
| 9901 | Envoy admin |
| 11434 | mock-llm(仅 mock 模式) |

被占了就先停掉占用进程,或改 `docker-compose.yml` 里的宿主端口。

---

## 七、加分准备(可选,想深入的同学)

- **promptfoo / NVIDIA Garak**:红队进阶(demo 自带的红队 runner 只需 `python3`,这两个是进阶可选)
- **Trivy / Syft**:依赖漏洞扫描 + SBOM(`make sbom` 用)
- 读一下仓库根的 `README.md` / `CLAUDE.md` / `WORKFLOW.md`,提前理解"工程契约"概念

---

## 课前 Checklist(打勾)

- [ ] Docker + Docker Compose v2 装好,`docker compose version` 正常
- [ ] Git 装好,能 clone 课程仓库
- [ ] 编辑器(VS Code / Cursor)+ Claude Code CLI 装好
- [ ] 准备好至少一个 LLM API Key(DeepSeek 或 Qwen),或确认用 mock 离线
- [ ] (可选)想看真实供应链评分:自己申请 Koi key 填 `.env`;不填走离线兜底
- [ ] 能调用 Claude(订阅或 API Key)做动手环节
- [ ] 提前 `docker compose up -d --build` 跑通一次,验证步骤全绿
- [ ] 磁盘留 10GB+,相关端口未被占用

准备好了,课上我们直接从"工程契约"开始,一步步搭出完整的 AI Log Analysis Platform。
