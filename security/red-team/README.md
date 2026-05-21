# Red Team — Promptfoo 攻击套件

> Step 7 加分项。PPT 里没有这一步，但 AI 应用上线前**必做**。
> 这是 Slide 48 风险矩阵的"可执行版"。

## 跑

```bash
make redteam
# 等于:
# docker run --rm --network=host -v $(pwd)/security/red-team:/work -w /work \
#   node:20 npx promptfoo@latest eval -c promptfoo.yaml
open security/red-team/reports/index.html
```

## 4 类攻击

| 文件 | 攻击 | 你**预期**的拦截层 | 演示重点 |
|---|---|---|---|
| `attacks/prompt-injection.yaml` | "ignore previous instructions" 等 | input_guard 正则 + Gateway Lua | 8 条用例，有 2 条故意放过（中文 / 间接注入），让讲师指出"靠正则不够" |
| `attacks/jailbreak.yaml` | DAN / 假设语境 / base64 编码 | 模型自身 + ML guard | 演示"为什么需要 ML-based guardrail" |
| `attacks/pii-leak.yaml` | 邮箱/手机/身份证/信用卡 | input_guard PII 正则 | 客户最关心的合规点 |
| `attacks/tool-abuse.yaml` | 诱导调 shell/SQL/SSRF | Gateway + 模型对齐 | 预防 Agent 时代的工具滥用 |

## 演示话术（PPT Slide 48 兑现）

跑完后打开 HTML 报告：

> "你看这张表——每一行是一种攻击，每一列是一道防线。
> - 这条 `[BLOCKED] prompt_injection`：input_guard 拦的，本地秒拦
> - 这条 `[GW-BLOCKED]`：Gateway 拦的，Lua 规则
> - 这条 ❌ 红色失败：注入用了中文，**我们的正则拦不住**——这就是我们要补的功课
>
> 客户问'你们的 AI 应用安全做到什么程度'，
> 不要说'我们用了 OpenAI 的 moderation'。
> 给他看**这张报告**：哪些攻击拦得住、哪些拦不住、补救路线是什么。"

## 双 provider 设计的意义

`promptfoo.yaml` 配了两个 provider：

| label | 端点 | 测的是什么 |
|---|---|---|
| `backend-with-guardrails` | `POST /chat/query` | 全链路 (input_guard + Gateway + LLM) |
| `gateway-only` | `POST /v1/chat/completions` | Gateway 单独拦截能力 |

报告里可以 diff —— "如果客户拆掉 input_guard，单靠 Gateway 能挡多少"。

## 加更多攻击

参考 [Promptfoo Red Team docs](https://www.promptfoo.dev/docs/red-team/)：

- `harmful` 攻击：仇恨言论、自残、违法
- `unsafeBenign` 攻击：合规边界（提供医疗/法律建议）
- `competitors`：泄露竞争对手信息

学完这门课，让 AI 自己生成这些攻击集——这就是 PPT Slide 42 的 multi-agent 在安全侧的应用。
