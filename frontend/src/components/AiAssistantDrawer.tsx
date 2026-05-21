"use client";

import { useState } from "react";
import clsx from "clsx";
import { chat, type ChatResponse, type LLMBackend } from "@/lib/api";

type Scenario = {
  id: string;
  title: string;
  icon: string;
  badge: "P0" | "P1" | "P2";
  color: string;
  desc: string;
};

// 全部基于 Nginx access log 真实字段, 无证据来源的场景 (VS/SSL/告警) 已删
const SCENARIOS: Scenario[] = [
  {
    id: "traffic-overview",
    title: "流量概览",
    icon: "📊",
    badge: "P0",
    color: "bg-violet-100 text-violet-700",
    desc: "总量/状态码分布/TOP 路径/TOP IP",
  },
  {
    id: "error-analysis",
    title: "错误码分析",
    icon: "⚠️",
    badge: "P0",
    color: "bg-orange-100 text-orange-700",
    desc: "4xx/5xx 分布 + 集中时段/IP + 根因",
  },
  {
    id: "scan-detection",
    title: "扫描与枚举检测",
    icon: "🔍",
    badge: "P0",
    color: "bg-rose-100 text-rose-700",
    desc: "/admin 枚举/404 风暴/顺序探测",
  },
  {
    id: "bigresp-analysis",
    title: "大响应/异常体积",
    icon: "📦",
    badge: "P1",
    color: "bg-sky-100 text-sky-700",
    desc: "基于 bytes_sent 找疑似批量导出",
  },
  {
    id: "bot-ua",
    title: "可疑 UA 与 Bot",
    icon: "🤖",
    badge: "P1",
    color: "bg-emerald-100 text-emerald-700",
    desc: "搜索引擎 Bot vs 工具型/伪造 UA",
  },
  {
    id: "ip-rate",
    title: "异常源 IP 与速率",
    icon: "🚦",
    badge: "P0",
    color: "bg-amber-100 text-amber-700",
    desc: "单 IP 高频/IP 段爆发/疑似 DoS",
  },
  {
    id: "url-injection",
    title: "URL 注入特征",
    icon: "🛡️",
    badge: "P0",
    color: "bg-indigo-100 text-indigo-700",
    desc: "path/query 里 SQLi/XSS/路径穿越",
  },
];

type Props = {
  open: boolean;
  onClose: () => void;
  logId?: string;
  backend: LLMBackend;
  onBackendChange: (b: LLMBackend) => void;
};

export function AiAssistantDrawer({
  open,
  onClose,
  logId,
  backend,
  onBackendChange,
}: Props) {
  const [question, setQuestion] = useState("");
  const [scenario, setScenario] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resp, setResp] = useState<ChatResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function run(args: { scenarioId?: string; q?: string }) {
    const finalQ = args.q ?? question;
    if (!finalQ.trim() && !args.scenarioId) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await chat({
        question: finalQ || (args.scenarioId ?? "请分析当前日志"),
        log_id: logId,
        backend,
        scenario: args.scenarioId,
      });
      setResp(r);
      setScenario(args.scenarioId ?? null);
    } catch (e: any) {
      setErr(String(e?.message || e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {/* backdrop */}
      <div
        className={clsx(
          "fixed inset-0 z-40 bg-slate-900/30 backdrop-blur-sm transition-opacity",
          open ? "opacity-100" : "pointer-events-none opacity-0",
        )}
        onClick={onClose}
      />

      {/* drawer */}
      <aside
        className={clsx(
          "fixed right-0 top-0 z-50 flex h-screen w-[420px] flex-col bg-white shadow-2xl transition-transform",
          open ? "translate-x-0" : "translate-x-full",
        )}
      >
        <header className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <div className="text-sm text-slate-500">VS · GX-CWSK-nginx</div>
            <h2 className="text-lg font-semibold text-slate-800">AI 助手</h2>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={backend}
              onChange={(e) => onBackendChange(e.target.value as LLMBackend)}
              className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-700"
              title="选择模型上游 (Gateway header 路由)"
            >
              <option value="deepseek">DeepSeek</option>
              <option value="qwen">Qwen3-Coder</option>
            </select>
            <button
              onClick={onClose}
              className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            >
              ✕
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <div className="mb-1 text-xs font-medium text-slate-500">选择分析场景</div>
          <p className="mb-3 text-xs text-slate-400">
            场景化 prompt 一键提问 — 每个场景都已经写好上下文
          </p>

          <div className="space-y-2">
            {SCENARIOS.map((s) => (
              <button
                key={s.id}
                disabled={busy}
                onClick={() => run({ scenarioId: s.id })}
                className={clsx(
                  "group flex w-full items-center gap-3 rounded-lg border border-slate-200 bg-white p-3 text-left transition hover:border-slate-300 hover:shadow-sm disabled:opacity-50",
                  scenario === s.id && "ring-2 ring-violet-300",
                )}
              >
                <div
                  className={clsx(
                    "flex h-9 w-9 items-center justify-center rounded-lg text-base",
                    s.color,
                  )}
                >
                  {s.icon}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-slate-800">{s.title}</span>
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">
                      {s.badge}
                    </span>
                  </div>
                  <div className="text-xs text-slate-500">{s.desc}</div>
                </div>
                <span className="text-slate-300 group-hover:text-slate-500">›</span>
              </button>
            ))}
          </div>

          {resp && (
            <div className="mt-6 rounded-lg border border-slate-200 bg-slate-50/60 p-4">
              {resp.blocked ? (
                <div className="rounded bg-amber-50 p-3 text-sm text-amber-800 ring-1 ring-amber-200">
                  <div className="mb-1 font-medium">⚠️ 已被 guardrail 拦截</div>
                  <div className="text-xs">{resp.block_reason}</div>
                </div>
              ) : (
                <>
                  <div className="mb-2 flex items-center justify-between text-xs text-slate-500">
                    <span>
                      {resp.backend} · {resp.model}
                    </span>
                    <span>{resp.citations.length} 处引用</span>
                  </div>
                  <pre className="whitespace-pre-wrap text-sm text-slate-700">
                    {resp.answer}
                  </pre>
                  {resp.citations.length > 0 && (
                    <details className="mt-3 text-xs">
                      <summary className="cursor-pointer text-slate-500 hover:text-slate-700">
                        查看引用片段
                      </summary>
                      <ul className="mt-2 space-y-2">
                        {resp.citations.map((c) => (
                          <li
                            key={c.chunk_id}
                            className="rounded border border-slate-200 bg-white p-2 text-slate-600"
                          >
                            <div className="text-slate-400">
                              chunk_idx={c.chunk_idx} · lines {c.line_start}-
                              {c.line_end} · score {c.score.toFixed(2)}
                            </div>
                            <pre className="mt-1 whitespace-pre-wrap break-all">
                              {c.excerpt}
                            </pre>
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                </>
              )}
            </div>
          )}
          {err && (
            <div className="mt-4 rounded bg-rose-50 p-3 text-sm text-rose-700 ring-1 ring-rose-200">
              {err}
            </div>
          )}
        </div>

        <footer className="border-t border-slate-200 px-5 py-3">
          <div className="flex gap-2">
            <input
              className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none"
              placeholder="输入问题..."
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && run({})}
              disabled={busy}
            />
            <button
              onClick={() => run({})}
              disabled={busy}
              className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50"
            >
              {busy ? "…" : "提问"}
            </button>
          </div>
          <div className="mt-1 text-[10px] text-slate-400">
            走 Envoy AI Gateway · 模型 = {backend} · 注入/越权请求会被拦截
          </div>
        </footer>
      </aside>
    </>
  );
}
