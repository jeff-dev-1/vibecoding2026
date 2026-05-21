# 依赖治理 — Trivy + SBOM

对应 PPT Slide 48 风险矩阵的"依赖污染"行。

## 跑

```bash
make sbom        # = sbom-gen.sh + trivy fs
```

输出在 `security/deps/reports/`：
- `sbom-backend.spdx.json` / `sbom-frontend.spdx.json` — SPDX 格式
- `sbom-backend.cdx.json` / `sbom-frontend.cdx.json` — CycloneDX 格式（你公司 SCA 大概率要这个）
- `trivy.json` — 漏洞列表

## 为什么 AI Native 应用更要重视 SBOM

- AI 应用一上来就装 50+ 个 Python 包（pydantic、sentence-transformers、httpx、…）
- LLM Agent 可能自己装新依赖——Slide 13 "依赖污染"风险
- 客户合规需要 **每次 release 一份 SBOM**（欧盟 CRA、美国 EO 14028）

## 演示话术

> "客户问'AI 应用怎么过 CVE 扫描'——
> 不要回答'我们的应用没有 CVE'，而是回答：
> 1. 我们生成 SBOM（这个脚本）
> 2. 我们每周扫漏洞（Trivy）
> 3. 我们的 Gateway 拦下游模型回吐的 malware（PPT Slide 51 提到的'AI 应用运行与治理基础设施'就在这里）
> 三层证据，比承诺有效。"

## 与 Vibe Coding 工作流的接点

写进 `.claude/agents/architect.md` 的判定规则之一：

> 引入新依赖前，跑 Trivy 看 CVE；高/严重等级直接拒。

这把 Slide 13 "依赖污染"的治理动作绑进了 PPT Slide 17 的 Workflow。
