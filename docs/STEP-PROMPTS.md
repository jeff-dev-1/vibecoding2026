# STEP-PROMPTS.md 已退役 → 唯一源是 BUILD-FROM-ZERO.md

> 为避免"演示用一份、学员用另一份"导致提示词漂移,本文件已合并进
> **[`BUILD-FROM-ZERO.md`](./BUILD-FROM-ZERO.md)** —— 现在它是**唯一源**:
> 讲师演示和学员复刻看同一份,步骤完全一致。

BUILD-FROM-ZERO.md 每个 Step 现在含:

- **粘给 Claude Code 的 Prompt** —— 照粘(Step 0–3 已是更正版:embedding 本地 384、双 upstream、真实端点、三表钉死)
- **🎓 讲师决策卡** —— AI 抛问题时,你怎么答 + 为什么(对齐 demo)
- **🔍 完成核验** —— 逐条勾,自己抓漂移(核心:**测试全绿 ≠ 契约对**,要拿产出对 `demo/`)
- 原有的 **预期产出 / 验收命令 / 人工检查点 / 兜底(`git checkout`)** 全部保留

> Step 0–3 已含决策卡 + 核验(实战验证过);Step 4–17 保留原手册内容,走到哪步再补卡与核验。
