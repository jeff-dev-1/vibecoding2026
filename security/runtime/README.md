# Runtime Guardrails

> 运行时拦截层 — Slide 44 的 PreToolUse/PostToolUse 在这个 demo 里的实现位置。

实际 hook 文件在 `../../.claude/hooks/`，这个目录只是文档入口。

## 与 input_guard 的关系

| 层 | 拦什么 | 位置 |
|---|---|---|
| `.claude/hooks/pre-tool-use-block-prod.sh` | Claude Code 工具调用前 | 开发时（讲师演示 AI 写代码翻车点） |
| `backend/app/security/input_guard.py` | 用户请求进 backend 时 | 运行时（demo 应用本体的护栏） |
| `gateway/envoy-ai-gateway/config/envoy.yaml` Lua | 任何走 Gateway 的请求 | 运行时（最后一道防线） |

三层**纵深防御**——任何一层挂掉、被绕过、被换路径，下一层还能挡。这是 PPT Slide 44 的"硬护栏"实践。

## 演示价值

客户问"如果有人改了 input_guard 怎么办" —— 给他看：

1. CLAUDE.md "禁止修改"列表
2. `.claude/hooks/pre-tool-use-block-prod.sh` 第二段（拦 .env / 生产配置写）
3. Gateway 层 Lua 同样的拦截规则

→ 三层都被改的概率 ≈ 0。这就是治理的本质。
