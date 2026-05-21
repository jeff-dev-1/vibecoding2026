# Acceptance Criteria

> 从 `PRD.md` 第 4 节抽出来，每条对应一个测试。这是 Slide 19 "Validate" 的依据。

## 验证矩阵

| AC | 验证脚本 | 现场演示话术 |
|---|---|---|
| AC-1 上传 → 30s 出结果 | `pytest backend/tests/test_logs_api.py::test_upload_to_done` | "AI 不只是生成代码，是生成可计时的功能" |
| AC-2 摘要带证据 | `pytest backend/tests/test_chat_api.py::test_evidence_present` | "客户最怕 AI 黑箱。看：每条摘要都引用 chunk" |
| AC-3 chat 带引用 | `pytest backend/tests/test_chat_api.py::test_citations` | 同上 |
| AC-4 LLM 必经 Gateway | `bash scripts/check-gateway-only.sh` | 给 CISO 看的 |
| AC-5 注入被拦 | `make redteam` Promptfoo prompt-injection 通过率 ≥ 90% | 红队报告 |
| AC-6 PII 脱敏 | `make redteam` Promptfoo pii-leak 通过率 ≥ 90% | 红队报告 |
| AC-7 90 秒全 healthy | `bash scripts/check-healthy.sh` | 不写脚本就掐表 |
| AC-8 离线可跑 | `OPENAI_API_KEY= make demo` | 培训兜底 |
| AC-9 OTel span | `bash scripts/check-otel.sh` | "审计：每次调用有迹" |
| AC-10 红队通过率 ≥ 85% | `make redteam` 总分 | HTML 报告 |

## 跑全套

```bash
make ac           # = make test + make redteam + make check-gateway-only
```

## 失败处理

任何一条不过：

1. 不要 skip
2. 不要降标准
3. 回 `/build`，按 WORKFLOW.md 的回退规则做最小修复
4. 复测整套，不只是失败那一条
