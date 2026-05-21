# Claude Code Hooks — 真实可跑的护栏

对应 PPT Slide 19 / 44。**这是把"提示词建议"变成"硬护栏"的具体落地物**。

## 已配置的 hook

| 文件 | 时机 | 作用 |
|---|---|---|
| `pre-tool-use-block-prod.sh` | PreToolUse | 拦截危险命令、生产破坏、CLAUDE.md 禁改文件 |
| `post-tool-use-lint.sh` | PostToolUse | 对 .py/.sh 立即跑 ruff/shellcheck 把问题反馈给 AI |

## 启用方式（Claude Code）

把这两个 hook 注册到 `.claude/settings.local.json`（同目录已有示例）。

## 演示价值

讲师演示时让 AI 尝试运行 `rm -rf /tmp/important-prod-data`：

```
$ claude
> Run: rm -rf /tmp/important-prod-data
🛑 BLOCKED by .claude/hooks/pre-tool-use-block-prod.sh:
   command targets production with destructive verb
```

观众立刻 get 到 PPT Slide 44 的"提示词是软约束，Hook 是硬护栏"。

## 客户提问

> "如果 AI 自己改了 hook 怎么办?"

答：
1. hook 必须放在 `.claude/hooks/` 且要执行权限——可以靠文件权限 + git 限制
2. 真正合规的做法：hook 文件放只读卷，或托管在 Claude Code Enterprise 的策略中心
3. 这个 demo 的 `pre-tool-use-block-prod.sh` 自己就在禁改名单（看 `case` 块）

## 不在这个 demo 里的（生产级补充）

- 接 SIEM：每次拦截写一条结构化 audit log
- 接审批：UserPromptSubmit hook 把高敏感操作转人工
- 接策略中心：从 OPA/Cedar 拉策略，而不是写死在脚本里
