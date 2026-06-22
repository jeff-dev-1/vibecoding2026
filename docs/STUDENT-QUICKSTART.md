# AI 日志分析 Demo — 学生上手指南

这是 Vibe Coding 课程的可运行 demo。你不用构建任何源码，直接拉预构建镜像跑起来，
然后基于它暴露的 **REST API** 用 vibe coding 的方式造一个 **MCP server**。

## 前置

- 安装好 Docker Desktop（含 docker compose v2）
- 一个 DeepSeek API key：去 https://platform.deepseek.com 注册获取
  - 还没拿到 key？没关系，下面有 mock 兜底方式，先把界面跑起来

## 一、起 demo（3 步）

```bash
# 1. 准备配置
cp .env.example .env

# 2. 编辑 .env，填上你自己的 key（IMAGE_REGISTRY 已默认填好，无需改）：
#    DEEPSEEK_API_KEY=<你自己的 key>

# 3. 拉起来（镜像在阿里云公开仓，免登录直接拉）
docker compose -f docker-compose.dist.yml up -d
```

等全部 healthy（约 1 分钟），打开：

| 地址 | 是什么 |
|---|---|
| http://localhost:3000 | 前端界面（登录默认 `admin` / `vibecoding2026`，可在 .env 改） |
| http://localhost:8000/docs | **后端 REST API 文档（Swagger UI）** ← 造 MCP 的关键 |
| http://localhost:8000/openapi.json | 机读版 OpenAPI schema ← 喂给 AI 用这个 |

### 没有 key 时的兜底

```bash
docker compose -f docker-compose.dist.yml --profile mock up -d
```
mock 上游会返回假的分析结果——界面和 API 结构完全一样，足够你照着造 MCP server，
只是 AI 回答不是真的。拿到 key 后填进 .env 再 `up -d` 即可切回真实模型。

### 常用命令

```bash
docker compose -f docker-compose.dist.yml ps         # 看状态
docker compose -f docker-compose.dist.yml logs -f    # 看日志
docker compose -f docker-compose.dist.yml down       # 停掉
```

## 二、基于这个 demo 造你的 MCP server

这个 demo 的后端是一组带类型的 REST 端点，主要有：

| 端点 | 作用 |
|---|---|
| `POST /logs/upload` | 上传日志文件，触发解析 |
| `GET /logs` / `GET /logs/jobs/{id}` | 查解析任务和结果 |
| `POST /chat/query` | 自然语言查询日志（走 RAG + LLM） |
| `POST /gateway/supply-chain-check` | 给一个包/扩展/MCP server 打供应链风险分 |

**造 MCP server 的关键认知：你不需要手抄这些 schema。**
`http://localhost:8000/openapi.json` 就是完整的、带类型的接口契约。

推荐做法：
1. 在 vibe coding 工具里，把 `openapi.json` 的内容作为上下文喂进去；
2. 让它生成一个 MCP server，把你关心的端点（比如 `/chat/query`、`/logs`）
   包装成 MCP 工具（tool）；
3. MCP server 在你本机跑，通过 `http://localhost:8000` 调这个 demo 的后端即可。

> 提示：MCP 协议本身就描述工具的入参/出参 schema——你定义 MCP 工具时，
> 实际就是在把 REST 端点的 OpenAPI schema「翻译」成 MCP 工具声明。
> 起点是 OpenAPI，不是凭空设计。

## 排错

- **拉镜像失败 / 很慢**：确认 `IMAGE_REGISTRY` 填对（讲师给的阿里云 ACR namespace）。
- **backend 一直 unhealthy**：多半是 `DEEPSEEK_API_KEY` 没填又没开 `--profile mock`。
- **端口被占**：3000 / 8000 / 5432 被本机其他程序占用，停掉它们或改 compose 端口映射。
