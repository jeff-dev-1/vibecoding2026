# NVIDIA Garak — 深度 LLM 漏扫

## 跑

```bash
make scan
# 等于:
# docker run --rm --network=host -v $(pwd)/security/llm-scan:/work \
#   python:3.11-slim bash -c "pip install garak -q && garak --config /work/garak-config.yaml"
```

输出在 `security/llm-scan/reports/` —— Garak 会生成 HTML + JSONL 两份。

## Garak vs Promptfoo

| 维度 | Garak | Promptfoo |
|---|---|---|
| 来源 | NVIDIA, 学术驱动 | YC, 工程驱动 |
| 攻击集 | 50+ 预置 probe (DAN/PII/编码/恶意代码生成) | 自己写 yaml |
| 跑法 | 自动遍历 | 你给输入和期望 |
| 报告 | 按 attack success rate 打分 | PASS/FAIL 计数 |
| 适用场景 | "我们的 AI 安全到什么 baseline" | "我们的 AI 是否守住 AC-X" |
| 客户买点 | 跟模型厂家比 | 跟自家 AC 比 |

**结论**：两者都跑。Promptfoo 是产品 AC 工具，Garak 是 baseline 工具。

## 给售前的话术

> "客户问'你们和别人比安全做得怎么样'——给他看 Garak 报告。
> 客户问'你们承诺的功能有没有翻车'——给他看 Promptfoo 报告。
> 这就是 PPT Slide 48 的'治理方式'落地，从'写在 PPT'到'每周自动跑'。"

## CI 集成

参考 `../../.github/workflows/redteam.yml`（在 demo 里只是模板，不会真跑）。
生产中 Garak 跑全量太慢，建议：
- 每 PR：跑 Promptfoo（5 分钟）
- 每周：跑 Garak 全量（30+ 分钟），失败发 Slack
