"use client";

import {
  AlertTriangle,
  ArrowUp,
  BarChart3,
  Bot,
  Box,
  Check,
  ChevronRight,
  Copy as CopyIcon,
  Gauge,
  Loader2,
  Search,
  ShieldAlert,
  Sparkles,
  TriangleAlert,
  Waypoints,
  X,
  type LucideIcon,
} from "lucide-react";
import { useState } from "react";
import clsx from "clsx";
import {
  chat,
  type ChatResponse,
  type ChatTrace,
  type GatewayProvider,
  type Job,
  type LLMBackend,
} from "@/lib/api";
import { AnswerTrace } from "./AnswerTrace";
import { Markdown } from "./Markdown";
import { ScenarioCharts } from "./ScenarioCharts";
import { useI18n, type Key } from "@/lib/i18n";

// 标题和说明都是字典键 —— 场景卡是产品界面, 跟着语言走。
// 发给后端的 scenario id 不翻译: 它是后端 prompts 表的查找键, 翻译了就查不到了。
type Scenario = {
  id: string;
  title: Key;
  desc: Key;
  icon: LucideIcon;
  color: string;
};

// 全部基于 Nginx access log 真实字段, 无证据来源的场景 (VS/SSL/告警) 已删
const SCENARIOS: Scenario[] = [
  {
    id: "traffic-overview",
    title: "sc.traffic",
    icon: BarChart3,
    color: "bg-primary/15 text-primary",
    desc: "sc.traffic.d",
  },
  {
    id: "error-analysis",
    title: "sc.error",
    icon: TriangleAlert,
    color: "bg-brand-orange/20 text-brand-orange",
    desc: "sc.error.d",
  },
  {
    id: "scan-detection",
    title: "sc.scan",
    icon: Search,
    color: "bg-brand-red/20 text-brand-red",
    desc: "sc.scan.d",
  },
  {
    id: "bigresp-analysis",
    title: "sc.bigresp",
    icon: Box,
    color: "bg-brand-blue/20 text-brand-blue",
    desc: "sc.bigresp.d",
  },
  {
    id: "bot-ua",
    title: "sc.bot",
    icon: Bot,
    color: "bg-brand-green/20 text-brand-green",
    desc: "sc.bot.d",
  },
  {
    id: "ip-rate",
    title: "sc.iprate",
    icon: Gauge,
    color: "bg-brand-orange/20 text-brand-orange",
    desc: "sc.iprate.d",
  },
  {
    id: "url-injection",
    title: "sc.injection",
    icon: ShieldAlert,
    color: "bg-primary/15 text-primary",
    desc: "sc.injection.d",
  },
];

type Props = {
  open: boolean;
  onClose: () => void;
  logId?: string;
  job?: Job | null;
  backend: LLMBackend;
  onBackendChange: (b: LLMBackend) => void;
  /** 走哪个网关 —— 由控制面选定, 提问时随请求带过去。 */
  provider: GatewayProvider;
  /** 每次拿到带 trace 的回答就往上抛, 控制面的回放器要用它。 */
  onTrace: (t: ChatTrace, question: string, citations: number) => void;
  /** 「查看本次链路回放」—— 直接跳到控制面的回放那一项。 */
  onOpenReplay: () => void;
};

export function AiAssistantDrawer({
  open,
  onClose,
  logId,
  job,
  backend,
  onBackendChange,
  provider,
  onTrace,
  onOpenReplay,
}: Props) {
  const { t, lang } = useI18n();
  const [question, setQuestion] = useState("");
  const [asked, setAsked] = useState<string>("");
  const [scenario, setScenario] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resp, setResp] = useState<ChatResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function run(args: { scenarioId?: string; q?: string }) {
    const finalQ = args.q ?? question;
    if (!finalQ.trim() && !args.scenarioId) return;
    // 自由提问 (来自输入框) 发送后清空输入框
    const fromInput = args.q === undefined && !args.scenarioId;
    const picked = SCENARIOS.find((s) => s.id === args.scenarioId);
    const label = finalQ || (picked ? t(picked.title) : finalQ);
    setBusy(true);
    setErr(null);
    setAsked(label);
    try {
      const r = await chat({
        question: finalQ || t("ai.fallbackQuestion"),
        log_id: logId,
        backend,
        scenario: args.scenarioId,
        // 让模型用读者正在看的语言作答 —— 界面切成 English 而答案还是中文是最扎眼的漏译。
        lang,
        provider,
      });
      setResp(r);
      setScenario(args.scenarioId ?? null);
      if (fromInput) setQuestion("");
      // 真实链路交给控制面 —— 回放器优先放真的, 没有才放剧本。
      if (r.trace) onTrace(r.trace, label, r.citations.length);
    } catch (e: any) {
      setErr(String(e?.message || e));
    } finally {
      setBusy(false);
    }
  }

  return (
    // 并排面板 — 无 backdrop, 不遮挡主页 (主页自身收窄留出空间)
    <aside
      className={clsx(
        "fixed right-0 top-0 z-40 flex h-screen w-[460px] flex-col border-l border-line bg-card transition-transform",
        open ? "translate-x-0" : "translate-x-full",
      )}
    >
      <header className="flex shrink-0 items-center justify-between border-b border-line px-5 py-3">
        <div className="flex items-center gap-2.5">
          <Sparkles className="size-5 shrink-0 text-primary" />
          <h2 className="text-sm font-semibold text-ink">{t("ai.title")}</h2>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={backend}
            onChange={(e) => onBackendChange(e.target.value as LLMBackend)}
            className="rounded-lg border border-line bg-card px-2 py-1 text-xs text-ink"
            title={t("ai.backendPicker")}
          >
            <option value="deepseek">DeepSeek</option>
            <option value="qwen">Qwen3-Coder</option>
          </select>
          <button
            onClick={onClose}
            aria-label={t("common.close")}
            className="grid size-7 place-items-center rounded-lg text-muted transition hover:bg-surface hover:text-ink"
          >
            <X className="size-4" />
          </button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {/* 场景卡 —— 提过一次问之后收起来, 别一直占着半屏 */}
        {!resp && !busy && (
          <>
            <div className="mb-1 text-xs font-medium text-muted">{t("ai.pickScenario")}</div>
            <p className="mb-3 text-xs text-muted">{t("ai.pickScenarioHint")}</p>
            <div className="space-y-2">
              {SCENARIOS.map((s) => (
                <button
                  key={s.id}
                  disabled={busy}
                  onClick={() => run({ scenarioId: s.id })}
                  className={clsx(
                    "group flex w-full items-center gap-3 rounded-xl border border-line bg-card p-3 text-left transition hover:border-ink/25 disabled:opacity-50",
                    scenario === s.id && "border-primary",
                  )}
                >
                  <div
                    className={clsx("grid size-9 shrink-0 place-items-center rounded-lg", s.color)}
                  >
                    <s.icon className="size-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-ink">{t(s.title)}</div>
                    <div className="truncate text-xs text-muted">{t(s.desc)}</div>
                  </div>
                  <ChevronRight className="size-4 shrink-0 text-muted transition group-hover:text-ink" />
                </button>
              ))}
            </div>
          </>
        )}

        {/* 提出的问题 —— 像聊天客户端那样贴右, 不用饱和色块 */}
        {asked && (
          <p className="mb-4 ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-surface px-3.5 py-2 text-sm">
            {asked}
          </p>
        )}

        {busy && (
          <p className="flex items-center gap-2 text-sm text-muted">
            <Loader2 className="size-4 animate-spin text-primary" />
            {t("home.analyzing")}…
          </p>
        )}

        {resp && !busy && (
          <div>
            {/* 链路在答案上方 —— 先看它怎么来的, 再看它说了什么 */}
            {resp.trace && <AnswerTrace trace={resp.trace} />}

            {resp.blocked ? (
              <div className="rounded-xl border border-brand-red/30 bg-brand-red/10 p-3 text-sm text-brand-red">
                <div className="mb-1 flex items-center gap-1.5 font-medium">
                  <AlertTriangle className="size-4" />
                  {t("ai.blocked")}
                </div>
                <div className="break-all font-mono text-xs">{resp.block_reason}</div>
              </div>
            ) : (
              <div className="space-y-3">
                {/* PII 脱敏提示 — 不阻断但要让用户看见 */}
                {resp.redacted && (
                  <div className="rounded-xl border border-brand-orange/30 bg-brand-orange/10 p-3 text-sm text-brand-orange">
                    <div className="mb-1.5 font-medium">{t("ai.redacted")}</div>
                    <div className="mb-1.5 flex flex-wrap gap-1">
                      {(resp.redaction_rules ?? []).map((r) => (
                        <span
                          key={r}
                          className="rounded bg-card/70 px-1.5 py-0.5 font-mono text-[11px]"
                        >
                          {r}
                        </span>
                      ))}
                    </div>
                    {resp.redaction_preview && (
                      <pre className="whitespace-pre-wrap rounded bg-card/70 p-1.5 text-[11px]">
                        {resp.redaction_preview}
                      </pre>
                    )}
                  </div>
                )}

                {/* 图表 — 从结构化数据出 */}
                {job && <ScenarioCharts job={job} />}

                {/* LLM 文字结论 */}
                <Markdown text={resp.answer} />

                {/* 页脚: 用量 / 引用 / 回放入口 / 复制 —— 读完答案之后才看的东西 */}
                <dl className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line pt-2.5 font-mono text-[11px] text-muted">
                  <div>
                    <dt className="inline">{resp.backend}</dt>{" "}
                    <dd className="inline text-ink">{resp.model}</dd>
                  </div>
                  {resp.trace && (
                    <div>
                      <dt className="inline">{t("trace.tokens")}</dt>{" "}
                      <dd className="inline text-ink">
                        {resp.trace.prompt_tokens + resp.trace.completion_tokens === 0
                          ? t("trace.unreported")
                          : `${resp.trace.prompt_tokens} in / ${resp.trace.completion_tokens} out`}
                      </dd>
                    </div>
                  )}
                  <div>
                    <dd className="inline text-ink">{resp.citations.length}</dd>{" "}
                    <dt className="inline">{t("ai.citations")}</dt>
                  </div>
                  <span className="flex-1" />
                  {/* 业务面到管理面的那座桥: 刚才这次提问, 去控制面逐帧看它怎么走的 */}
                  {resp.trace && (
                    <button
                      type="button"
                      onClick={onOpenReplay}
                      className="flex items-center gap-1 rounded-lg px-1.5 py-0.5 transition hover:text-ink"
                    >
                      <Waypoints className="size-3.5" />
                      {t("ai.replay")}
                    </button>
                  )}
                  <Copy text={resp.answer} label={t("ai.copy")} />
                </dl>

                {resp.citations.length > 0 && (
                  <details className="text-xs">
                    <summary className="cursor-pointer text-muted transition hover:text-ink">
                      {t("ai.citationsToggle")}
                    </summary>
                    <ul className="mt-2 space-y-2">
                      {resp.citations.map((c) => (
                        <li
                          key={c.chunk_id}
                          className="rounded-lg border border-line bg-card p-2 text-muted"
                        >
                          <div className="font-mono text-[10px] text-muted">
                            chunk_idx={c.chunk_idx} · lines {c.line_start}-{c.line_end} · score{" "}
                            {c.score.toFixed(2)}
                          </div>
                          <pre className="mt-1 whitespace-pre-wrap break-all font-mono text-[11px]">
                            {c.excerpt}
                          </pre>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
            )}
          </div>
        )}

        {err && (
          <div className="mt-4 rounded-xl border border-brand-red/30 bg-brand-red/10 p-3 text-sm text-brand-red">
            {err}
          </div>
        )}
      </div>

      <footer className="shrink-0 border-t border-line px-5 py-3">
        <div className="flex items-end gap-2 rounded-2xl border border-line bg-bg p-2 transition focus-within:border-primary">
          <textarea
            rows={1}
            className="max-h-28 min-h-[24px] flex-1 resize-none bg-transparent px-1.5 py-1 text-sm outline-none placeholder:text-muted/60"
            placeholder={t("ai.placeholder")}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              // Enter 发送, Shift+Enter 换行 —— 和所有聊天框一样的手感
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void run({});
              }
            }}
            disabled={busy}
          />
          <button
            onClick={() => run({})}
            disabled={busy || !question.trim()}
            aria-label={t("ai.send")}
            title={t("ai.send")}
            className="grid size-8 shrink-0 place-items-center rounded-full bg-primary text-white transition hover:brightness-95 disabled:opacity-40"
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : <ArrowUp className="size-4" />}
          </button>
        </div>
      </footer>
    </aside>
  );
}

function Copy({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={() => {
        void navigator.clipboard.writeText(text);
        setDone(true);
        setTimeout(() => setDone(false), 1200);
      }}
      className="grid size-6 place-items-center rounded-lg text-muted transition hover:text-ink"
    >
      {done ? <Check className="size-3.5" /> : <CopyIcon className="size-3.5" />}
    </button>
  );
}
