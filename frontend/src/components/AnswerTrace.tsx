"use client";

import {
  Brain,
  Check,
  ChevronDown,
  ChevronUp,
  Database,
  Globe,
  Sparkles,
  ShieldCheck,
  X,
  type LucideIcon,
} from "lucide-react";
import { useState } from "react";
import clsx from "clsx";
import { useI18n, type Key } from "@/lib/i18n";
import type { ChatTrace, TraceStep, TraceStepId } from "@/lib/api";

/**
 * 答案上方的链路 —— 参考图 3 的"思考链"那一块。
 *
 * 四跳, 因为这套架构就是四跳, 不是一个 tool-loop agent 的那四步:
 *   guard      输入护栏, 判定 pass / redact / block
 *   retrieval  pgvector 检索, 拿回若干 chunk 和它们的分数
 *   gateway    Envoy 按 X-LLM-Backend 选上游
 *   llm        模型生成, 带 token 用量
 *
 * 每一跳的耗时都是后端量出来的。这里不补"正在思考…"这种假节点 —— 没发生的跳
 * 干脆不出现 (被护栏拦下时就只有第一跳), 这正是要给人看的东西。
 */

const META: Record<TraceStepId, { icon: LucideIcon; labelKey: Key }> = {
  guard: { icon: ShieldCheck, labelKey: "trace.guard" },
  retrieval: { icon: Database, labelKey: "trace.retrieval" },
  gateway: { icon: Globe, labelKey: "trace.gateway" },
  llm: { icon: Sparkles, labelKey: "trace.llm" },
};

const fmtMs = (ms: number) => (ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms} ms`);

export function AnswerTrace({ trace }: { trace: ChatTrace }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(true);
  if (trace.steps.length === 0) return null;

  const failed = trace.steps.filter((s) => !s.ok).length;

  return (
    <div className="mb-3">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 rounded-lg py-1 text-sm text-muted transition hover:text-ink"
      >
        <Brain className="size-4 shrink-0" />
        <span>{open ? t("trace.hide") : t("trace.show")}</span>
        {!open && failed > 0 && (
          <span className="text-brand-red">
            · {failed} {t("trace.guardBlock")}
          </span>
        )}
        <span className="flex-1" />
        <span className="font-mono text-[11px]">{fmtMs(trace.total_ms)}</span>
        {open ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
      </button>

      {open && (
        <ol className="mt-1.5 space-y-2.5">
          {trace.steps.map((s) => (
            <li key={s.id}>
              <Step step={s} />
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/** 一跳: 标题行 + 一条竖线带出的细节。细节默认收起, 展开是原始键值。 */
function Step({ step }: { step: TraceStep }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const { icon: Icon, labelKey } = META[step.id];
  const rows = Object.entries(step.detail);

  return (
    <>
      <p className="flex items-center gap-2 text-sm font-medium">
        <Icon className={clsx("size-4 shrink-0", step.ok ? "text-muted" : "text-brand-red")} />
        {t(labelKey)}
        {step.ms > 0 && (
          <span className="font-mono text-xs text-muted">{fmtMs(step.ms)}</span>
        )}
      </p>
      <div className="ml-2 mt-1 border-l-2 border-line pl-4">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          disabled={rows.length === 0}
          className="flex w-full items-center gap-2 rounded-lg border border-line bg-card px-3 py-1.5 text-left transition hover:border-ink/25 disabled:opacity-60"
        >
          <code className="font-mono text-xs">{step.summary || step.id}</code>
          <span
            className={clsx(
              "flex items-center gap-1 text-xs",
              step.ok ? "text-brand-green" : "text-brand-red",
            )}
          >
            {step.ok ? <Check className="size-3.5" /> : <X className="size-3.5" />}
          </span>
          <span className="flex-1" />
          {rows.length > 0 &&
            (open ? (
              <ChevronUp className="size-4 text-muted" />
            ) : (
              <ChevronDown className="size-4 text-muted" />
            ))}
        </button>
        {open && rows.length > 0 && (
          <dl className="mt-1.5 space-y-1 rounded-lg bg-surface p-2.5">
            {rows.map(([k, v]) => (
              <div key={k} className="grid grid-cols-[110px_1fr] gap-2">
                <dt className="font-mono text-[10px] uppercase leading-4 tracking-wide text-muted">
                  {k}
                </dt>
                <dd className="break-all font-mono text-[11px] leading-4">
                  {Array.isArray(v)
                    ? v.length
                      ? v.join(", ")
                      : t("common.none")
                    : typeof v === "object" && v !== null
                      ? JSON.stringify(v)
                      : String(v)}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </>
  );
}
