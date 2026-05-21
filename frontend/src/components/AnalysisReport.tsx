"use client";

import { useState } from "react";
import clsx from "clsx";
import type { LogAnalysis, SecurityEvent } from "@/lib/api";

// 对应 dottxt STRESSED 输出结构, 用 controller-frontend 的设计语言渲染:
//  1. Analysis Summary   2. Key Observations
//  3. Security Events     4. Related Log Entries
//  5. Traffic Patterns

const SEV_CLASS: Record<string, string> = {
  critical: "bg-rose-50 text-rose-600",
  high: "bg-rose-50 text-rose-600",
  medium: "bg-amber-50 text-amber-600",
  low: "bg-sky-50 text-sky-600",
  info: "bg-emerald-50 text-emerald-600",
};

function SevBadge({ sev }: { sev: string }) {
  return (
    <span
      className={clsx(
        "rounded px-2 py-0.5 text-[11px] font-bold uppercase",
        SEV_CLASS[sev] ?? SEV_CLASS.info,
      )}
    >
      {sev}
    </span>
  );
}

function SectionCard({
  title,
  icon,
  count,
  children,
}: {
  title: string;
  icon: string;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="mb-3 flex items-center gap-2 border-b border-slate-100 pb-2 text-sm font-semibold text-slate-700">
        <span>{icon}</span>
        <span>{title}</span>
        {count != null && (
          <span className="ml-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-normal text-slate-500">
            {count}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

function EventCard({ e }: { e: SecurityEvent }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-3">
      <div className="mb-1.5 flex flex-wrap items-center gap-2">
        <SevBadge sev={e.severity} />
        <span className="text-sm font-medium text-slate-800">{e.event_type}</span>
        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-slate-500">
          {e.category}
        </span>
        <span className="ml-auto text-xs text-slate-400">
          置信度 {(e.confidence * 100).toFixed(0)}%
        </span>
      </div>
      <div className="mb-1 text-sm font-medium text-slate-700">{e.title}</div>
      <p className="mb-2 text-sm leading-relaxed text-slate-600">{e.description}</p>

      <div className="flex flex-wrap gap-1.5">
        {e.possible_attacks.map((a) => (
          <span
            key={a}
            className="rounded-full bg-rose-50 px-2 py-0.5 text-[11px] text-rose-600"
          >
            {a}
          </span>
        ))}
      </div>

      <div className="mt-2 grid grid-cols-1 gap-1 text-xs text-slate-500 md:grid-cols-2">
        {e.source_ips.length > 0 && (
          <div>
            <span className="text-slate-400">Source IPs: </span>
            <span className="font-mono">
              {e.source_ips.slice(0, 5).join(", ")}
              {e.source_ips.length > 5 && " …"}
            </span>
          </div>
        )}
        {e.url_pattern && (
          <div className="truncate">
            <span className="text-slate-400">URL Pattern: </span>
            <span className="font-mono">{e.url_pattern}</span>
          </div>
        )}
      </div>

      {/* Related Log Entries (per-event, STRESSED 第 4 段) */}
      {e.related_log_entries.length > 0 && (
        <div className="mt-2">
          <button
            onClick={() => setOpen(!open)}
            className="text-xs text-indigo-600 hover:underline"
          >
            {open ? "收起" : `相关日志 ${e.related_log_entries.length} 条`}
          </button>
          {open && (
            <div className="mt-1 space-y-1">
              {e.related_log_entries.map((line, i) => (
                <pre
                  key={i}
                  className="overflow-x-auto rounded bg-slate-900 px-2 py-1.5 font-mono text-[11px] leading-tight text-slate-200"
                >
                  {line}
                </pre>
              ))}
            </div>
          )}
        </div>
      )}

      {e.evidence_chunks.length > 0 && (
        <div className="mt-1.5 text-[11px] text-slate-400">
          chunks: {e.evidence_chunks.join(", ")}
        </div>
      )}
    </div>
  );
}

export function AnalysisReport({ a }: { a: LogAnalysis }) {
  const t = a.traffic;
  return (
    <div className="space-y-4">
      {/* ① Analysis Summary — 紫色渐变卡 (controller-frontend 风格) */}
      <div className="rounded-xl bg-gradient-to-br from-indigo-50 to-violet-100 p-5">
        <div className="mb-2 flex items-center justify-between">
          <div className="text-xs font-semibold uppercase tracking-wider text-indigo-600">
            📝 Analysis Summary
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">最高严重度</span>
            <SevBadge sev={a.highest_severity} />
            {a.requires_immediate_attention && (
              <span className="animate-pulse rounded bg-rose-600 px-2 py-0.5 text-[11px] font-bold text-white">
                需立即处理
              </span>
            )}
          </div>
        </div>
        <p className="text-[15px] leading-relaxed text-slate-700">{a.summary}</p>
        {a.model && (
          <div className="mt-2 text-xs text-indigo-400">
            structured JSON · schema-locked · model = {a.model}
          </div>
        )}
      </div>

      {/* traffic 统计快照 */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="总请求" v={t.total_requests} />
        <Stat label="4xx" v={t.error_4xx} cls="text-amber-600" />
        <Stat label="5xx" v={t.error_5xx} cls="text-rose-600" />
        <Stat label="不同源 IP" v={t.unique_client_ips} />
      </div>

      {/* ② Key Observations */}
      {a.key_observations.length > 0 && (
        <SectionCard title="Key Observations" icon="🔑" count={a.key_observations.length}>
          <ul className="space-y-2">
            {a.key_observations.map((o, i) => (
              <li key={i} className="flex gap-2.5 text-sm leading-relaxed text-slate-600">
                <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-indigo-50 text-[11px] font-bold text-indigo-600">
                  {i + 1}
                </span>
                <span>{o}</span>
              </li>
            ))}
          </ul>
        </SectionCard>
      )}

      {/* ③ Security Events (含 ④ Related Log Entries 内嵌) */}
      {a.events.length > 0 && (
        <SectionCard title="Security Events" icon="⚠️" count={a.events.length}>
          <div className="space-y-2.5">
            {a.events.map((e, i) => (
              <EventCard key={i} e={e} />
            ))}
          </div>
        </SectionCard>
      )}

      {/* ⑤ Traffic Patterns */}
      {a.traffic_patterns.length > 0 && (
        <SectionCard title="Traffic Patterns" icon="📊" count={a.traffic_patterns.length}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase tracking-wider text-slate-400">
                  <th className="py-2 pr-3 text-left font-medium">URL Path</th>
                  <th className="w-20 py-2 pr-3 text-left font-medium">Method</th>
                  <th className="w-16 py-2 pr-3 text-right font-medium">Hits</th>
                  <th className="w-40 py-2 text-left font-medium">Status Codes</th>
                </tr>
              </thead>
              <tbody>
                {a.traffic_patterns.slice(0, 20).map((p, i) => (
                  <tr key={i} className="border-b border-slate-100">
                    <td className="py-1.5 pr-3 font-mono text-xs text-slate-700">
                      <div className="max-w-md truncate">{p.url_path}</div>
                    </td>
                    <td className="py-1.5 pr-3 font-mono text-xs text-slate-500">
                      {p.method}
                    </td>
                    <td className="py-1.5 pr-3 text-right font-mono text-slate-600">
                      {p.hits}
                    </td>
                    <td className="py-1.5">
                      <div className="flex flex-wrap gap-1">
                        {Object.entries(p.status_codes).map(([code, n]) => (
                          <span
                            key={code}
                            className={clsx(
                              "rounded px-1.5 py-0.5 text-[10px] font-mono",
                              code.startsWith("5")
                                ? "bg-rose-50 text-rose-600"
                                : code.startsWith("4")
                                  ? "bg-amber-50 text-amber-600"
                                  : code.startsWith("3")
                                    ? "bg-sky-50 text-sky-600"
                                    : "bg-emerald-50 text-emerald-600",
                            )}
                          >
                            {code}: {n}
                          </span>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}
    </div>
  );
}

function Stat({ label, v, cls }: { label: string; v: number | string; cls?: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="text-[10px] uppercase tracking-wider text-slate-400">{label}</div>
      <div className={clsx("mt-0.5 font-mono text-xl font-semibold", cls ?? "text-slate-700")}>
        {v}
      </div>
    </div>
  );
}
