# WORKFLOW.md — 阶段协议（L3）

> 对应 PPT Slide 17 Workflow Engineering。
> 这份文档是 AI 在这个 repo 工作时的"阶段机"——什么时候允许做什么、产出什么、失败回退到哪里。

## 状态机

```
   ┌─────────┐    ┌────────┐    ┌────────┐    ┌────────┐    ┌────────┐    ┌────────┐
   │ /refine │───►│/design │───►│ /plan  │───►│ /build │───►│/review │───►│ /ship  │
   └─────────┘    └────────┘    └────────┘    └────┬───┘    └────┬───┘    └────────┘
                                                   │             │
                                                   └─────fail────┘ 红队失败 → /redteam-fix → /build
                                                                  │
                                                                  ▼
                                                            ┌──────────┐
                                                            │/redteam  │ ← Step 7 加分
                                                            └──────────┘
```

## /refine — 澄清需求

| 字段 | 内容 |
|---|---|
| **合法输入** | 一句话/段落式想法、参考链接 |
| **强制输出** | 写入 `docs/PRD.md`：目标用户、MVP 范围、验收标准、风险、待确认问题 |
| **通过条件** | 验收标准里每条都是"可观察、可验证"，不能是"流畅"这种主观词 |
| **回退** | 输出含 ≥3 个待确认问题 → 停在这一步，等人答 |
| **证据沉淀** | git add docs/PRD.md && git tag step-1 |

**禁止**：在 `/refine` 阶段写任何代码、改任何目录结构。

## /design — 架构定稿

| 字段 | 内容 |
|---|---|
| **合法输入** | `docs/PRD.md` |
| **强制输出** | 更新 `DESIGN.md` 的"关键设计决策"、"API 契约"、"数据模型"三节 |
| **通过条件** | 任何"新选型"都附**为什么不选 X**（参考本文件第 6 节"取舍记录"的格式） |
| **回退** | 与 CLAUDE.md 的"技术栈不要换"矛盾 → 回 /refine 确认是否真的要换 |
| **证据沉淀** | git tag step-2 |

## /plan — 任务规划

| 字段 | 内容 |
|---|---|
| **合法输入** | `DESIGN.md` 当前状态 |
| **强制输出** | 用 `TaskCreate` 创建任务列表，每个任务 ≤ 1 小时人时；标注 blocks/blockedBy |
| **通过条件** | 没有"杂项"或"打磨"这种含糊任务；每个任务有可看见的 deliverable |
| **回退** | 任务总数 > 15 → 拆 phase，先做 MVP |

## /build — 实现构建

| 字段 | 内容 |
|---|---|
| **合法输入** | 当前 in_progress 的单个任务 |
| **强制输出** | 代码改动 + 对应测试 + 可运行 |
| **通过条件** | 见下方"质量门槛" |
| **回退** | 同时改了 ≥ 3 个 PPT Slide 14 所说的"层" → 停，回 /plan 拆分 |
| **证据沉淀** | 提交 message 写清"做了什么/为什么"，不写"how"（代码已经说了） |

### 质量门槛（每次 /build 完都跑）

```bash
# Backend
cd backend
ruff check . --fix          # Slide 18 第 1 层：编写中
ruff format .
mypy app/                   # Slide 18 第 2 层：提交前
pytest -q                   # 单测

# Frontend
cd frontend
pnpm lint
pnpm typecheck
pnpm test
```

**门槛量化**：
- Lint：0 error，warning 自行判断
- Type：0 error
- Test：核心 services 覆盖 ≥ 80%，API ≥ 60%
- 不允许"先 skip 测试以后再补"——参考 PPT Slide 13 "质量漂移"

## /review — 两阶段审查（PPT Slide 33）

### 阶段 1：Spec Compliance

走 `.claude/agents/reviewer.md` 里的 checklist：
- [ ] 功能是否覆盖 PRD 的每条验收标准
- [ ] 边界条件（空、超大、非法字符、并发）
- [ ] 目录约定（CLAUDE.md "目录约定"那节）
- [ ] API 契约（DESIGN.md API 表）没有偷偷扩字段

任一不通过 → 回 /build。

### 阶段 2：Code Quality

```
correctness  — 算法对不对、并发有没有问题
security     — input/output guardrail、SQL injection、SSRF
readability  — 函数命名、控制流深度
performance  — N+1 / 同步阻塞 / 不必要的 LLM 调用
testability  — 关键路径是否有 seam
observability— LLM 调用是否打 OTel span、关键 metric 是否 export
```

任一不通过 → 回 /build；多个不通过 → 回 /design。

## /redteam — Step 7 加分项

| 字段 | 内容 |
|---|---|
| **合法输入** | /review 已通过的代码 |
| **强制输出** | Promptfoo HTML 报告 + Garak 报告（在 `security/red-team/reports/`） |
| **通过条件** | Promptfoo 攻击成功率 < 10%；Garak critical = 0 |
| **回退** | 任一攻击类成功率 > 30% → 写 `security/runtime/` 拦截规则，回 /build |
| **演示价值** | 客户最爱看这一步——"上线前我们怎么测 AI 不会被钓鱼" |

## /ship — 发布交付

| 字段 | 内容 |
|---|---|
| **合法输入** | /review + /redteam 都过 |
| **强制输出** | `git tag step-N`；写一段交付备忘录（做了什么、风险、回滚步骤） |
| **通过条件** | docker-compose up 干净起动；make demo 能完整跑一遍 |
| **回退** | 起不来 → 不是 ship，是 broken；强制回 /build |

## 关于阶段切换的硬规则

1. **不允许跳阶段**。要从 /refine 直接到 /build？拒绝。这正是 PPT Slide 13 "自我确认"的来源。
2. **允许回退**，但回退要写下回退理由（commit message 或 PR 描述）
3. **不允许并行**两个阶段——同一个 PR 不能既改架构又改实现
4. **每次进入新阶段先说一句**："I'm entering /build for task X"——给人留出叫停的窗口

## 给讲师的演示节奏（对应 PPT Slide 24）

| Demo Step | Workflow Stage | 现场用时 |
|---|---|---|
| Step 1 需求澄清 | /refine | 5 min |
| Step 2 项目骨架 | /design + /plan | 5 min（预录兜底） |
| Step 3 核心实现 | /build | 15 min（最长） |
| Step 4 测试验证 | /build 的子步 | 5 min |
| Step 5 Debug 修复 | /build（修复 inject-bug.sh 注入的 bug） | 10 min（最有看点） |
| Step 6 Review 交付 | /review | 5 min |
| Step 7 红队 | /redteam | 5 min（加分，时间不够可跳） |

**讲师注意**：每切换一个阶段，明确说"我们现在进入 /XXX 阶段"，让观众建立 Workflow 的心智模型——这比讲十遍"阶段协议"都有效。
