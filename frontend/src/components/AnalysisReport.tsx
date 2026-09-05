"use client";

import { BarChart3, FileText, KeyRound, TriangleAlert, type LucideIcon } from "lucide-react";
import { useState } from "react";
import clsx from "clsx";
import type { LogAnalysis, LogFamily, SecurityEvent } from "@/lib/api";
import { useI18n } from "@/lib/i18n";

// 对应 dottxt STRESSED 输出结构, 用 controller-frontend 的设计语言渲染:
//  1. Analysis Summary   2. Key Observations
//  3. Security Events     4. Related Log Entries
//  5. Traffic Patterns

const SEV_CLASS: Record<string, string> = {
  critical: "bg-brand-red/10 text-brand-red",
  high: "bg-brand-red/10 text-brand-red",
  medium: "bg-brand-orange/10 text-brand-orange",
  low: "bg-brand-blue/10 text-brand-blue",
  info: "bg-brand-green/10 text-brand-green",
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
  icon: Icon,
  count,
  children,
}: {
  title: string;
  icon: LucideIcon;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-line bg-card p-4">
      <div className="mb-3 flex items-center gap-2 border-b border-line pb-2 text-sm font-semibold text-ink">
        <Icon className="size-4 text-muted" />
        <span>{title}</span>
        {count != null && (
          <span className="ml-1 rounded-full bg-surface px-2 py-0.5 text-xs font-normal text-muted">
            {count}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

function EventCard({ e }: { e: SecurityEvent }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-lg border border-line bg-surface/50 p-3">
      <div className="mb-1.5 flex flex-wrap items-center gap-2">
        <SevBadge sev={e.severity} />
        <span className="text-sm font-medium text-ink">{e.event_type}</span>
        <span className="rounded bg-surface px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-muted">
          {e.category}
        </span>
        <span className="ml-auto text-xs text-muted">
          {t("report.confidence")} {(e.confidence * 100).toFixed(0)}%
        </span>
      </div>
      <div className="mb-1 text-sm font-medium text-ink">{e.title}</div>
      <p className="mb-2 text-sm leading-relaxed text-muted">{e.description}</p>

      <div className="flex flex-wrap gap-1.5">
        {e.possible_attacks.map((a) => (
          <span
            key={a}
            className="rounded-full bg-brand-red/10 px-2 py-0.5 text-[11px] text-brand-red"
          >
            {a}
          </span>
        ))}
      </div>

      <div className="mt-2 grid grid-cols-1 gap-1 text-xs text-muted md:grid-cols-2">
        {e.source_ips.length > 0 && (
          <div>
            <span className="text-muted">{t("report.sourceIps")}: </span>
            <span className="font-mono">
              {e.source_ips.slice(0, 5).join(", ")}
              {e.source_ips.length > 5 && " …"}
            </span>
          </div>
        )}
        {e.url_pattern && (
          <div className="truncate">
            <span className="text-muted">{t("report.urlPattern")}: </span>
            <span className="font-mono">{e.url_pattern}</span>
          </div>
        )}
      </div>

      {/* Related Log Entries (per-event, STRESSED 第 4 段) */}
      {e.related_log_entries.length > 0 && (
        <div className="mt-2">
          <button
            onClick={() => setOpen(!open)}
            className="text-xs text-primary hover:underline"
          >
            {open
              ? t("report.collapse")
              : `${t("report.relatedLogs")} ${e.related_log_entries.length} ${t("report.relatedLogsUnit")}`}
          </button>
          {open && (
            <div className="mt-1 space-y-1">
              {e.related_log_entries.map((line, i) => (
                <pre
                  key={i}
                  className="overflow-x-auto rounded border border-line bg-surface px-2 py-1.5 font-mono text-[11px] leading-tight text-ink"
                >
                  {line}
                </pre>
              ))}
            </div>
          )}
        </div>
      )}

      {e.evidence_chunks.length > 0 && (
        <div className="mt-1.5 text-[11px] text-muted">
          chunks: {e.evidence_chunks.join(", ")}
        </div>
      )}
    </div>
  );
}

export function AnalysisReport({
  a,
  family = "access",
}: {
  a: LogAnalysis;
  family?: LogFamily;
}) {
  const { t } = useI18n();
  const stat = a.traffic;
  return (
    <div className="space-y-4">
      {/* ① Analysis Summary — 紫色渐变卡 (controller-frontend 风格) */}
      <div className="rounded-xl border border-primary/25 bg-primary/[0.07] p-5">
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-primary">
            <FileText className="size-3.5" />
            {t("report.summary")}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted">{t("report.highestSeverity")}</span>
            <SevBadge sev={a.highest_severity} />
            {a.requires_immediate_attention && (
              <span className="animate-pulse rounded bg-brand-red px-2 py-0.5 text-[11px] font-bold text-white">
                {t("report.immediate")}
              </span>
            )}
          </div>
        </div>
        <p className="text-[15px] leading-relaxed text-ink">{a.summary}</p>
        {a.model && (
          <div className="mt-2 text-xs text-primary">
            {t("report.schemaLocked")} {a.model}
          </div>
        )}
      </div>

      {/* traffic 统计快照。
          后端的 TrafficStat 对两族日志复用同一组字段 (system 族里 error_4xx 装的是
          warn 数, error_5xx 装的是 error 级数)。数字是对的, 但标签不能照抄字段名 ——
          一份 sshd 认证日志里根本没有 HTTP, 顶上却写着 "5XX 492", 那是把认证失败数
          当成 HTTP 错误报出去了, 比不显示更糟。字段可以复用, 标签必须跟着日志族走。 */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {family === "system" ? (
          <>
            <Stat label={t("report.totalLines")} v={stat.total_requests} />
            <Stat label={t("report.warnLevel")} v={stat.error_4xx} cls="text-brand-orange" />
            <Stat label={t("report.errorLevel")} v={stat.error_5xx} cls="text-brand-red" />
            <Stat label={t("report.uniqueHosts")} v={stat.unique_client_ips} />
          </>
        ) : (
          <>
            <Stat label={t("report.totalRequests")} v={stat.total_requests} />
            <Stat label="4xx" v={stat.error_4xx} cls="text-brand-orange" />
            <Stat label="5xx" v={stat.error_5xx} cls="text-brand-red" />
            <Stat label={t("report.uniqueIps")} v={stat.unique_client_ips} />
          </>
        )}
      </div>

      {/* ② Key Observations */}
      {a.key_observations.length > 0 && (
        <SectionCard title={t("report.keyObservations")} icon={KeyRound} count={a.key_observations.length}>
          <ul className="space-y-2">
            {a.key_observations.map((o, i) => (
              <li key={i} className="flex gap-2.5 text-sm leading-relaxed text-muted">
                <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-bold text-primary">
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
        <SectionCard title={t("report.securityEvents")} icon={TriangleAlert} count={a.events.length}>
          <div className="space-y-2.5">
            {a.events.map((e, i) => (
              <EventCard key={i} e={e} />
            ))}
          </div>
        </SectionCard>
      )}

      {/* ⑤ Traffic Patterns / Error Patterns (自适应) */}
      {a.traffic_patterns.length > 0 &&
        (() => {
          // error 日志的 status_codes 全空 -> 切换成"错误模式"表头
          const isError = a.traffic_patterns.every(
            (p) => Object.keys(p.status_codes || {}).length === 0,
          );
          return (
            <SectionCard
              title={isError ? t("report.errorPatterns") : t("report.trafficPatterns")}
              icon={BarChart3}
              count={a.traffic_patterns.length}
            >
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-line text-xs uppercase tracking-wider text-muted">
                      <th className="py-2 pr-3 text-left font-medium">
                        {isError ? t("report.colMessage") : t("report.colPath")}
                      </th>
                      <th className="w-24 py-2 pr-3 text-left font-medium">
                        {isError ? t("report.colLevel") : t("report.colMethod")}
                      </th>
                      <th className="w-16 py-2 pr-3 text-right font-medium">{t("report.colHits")}</th>
                      {!isError && (
                        <th className="w-40 py-2 text-left font-medium">{t("report.colStatus")}</th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {a.traffic_patterns.slice(0, 20).map((p, i) => (
                      <tr key={i} className="border-b border-line">
                        <td className="py-1.5 pr-3 font-mono text-xs text-ink">
                          <div className="max-w-md truncate">{p.url_path}</div>
                        </td>
                        <td className="py-1.5 pr-3 font-mono text-xs text-muted">
                          {p.method}
                        </td>
                        <td className="py-1.5 pr-3 text-right font-mono text-muted">
                          {p.hits}
                        </td>
                        {!isError && (
                          <td className="py-1.5">
                            <div className="flex flex-wrap gap-1">
                              {Object.entries(p.status_codes).map(([code, n]) => (
                                <span
                                  key={code}
                                  className={clsx(
                                    "rounded px-1.5 py-0.5 text-[10px] font-mono",
                                    code.startsWith("5")
                                      ? "bg-brand-red/10 text-brand-red"
                                      : code.startsWith("4")
                                        ? "bg-brand-orange/10 text-brand-orange"
                                        : code.startsWith("3")
                                          ? "bg-brand-blue/10 text-brand-blue"
                                          : "bg-brand-green/10 text-brand-green",
                                  )}
                                >
                                  {code}: {n}
                                </span>
                              ))}
                            </div>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </SectionCard>
          );
        })()}
    </div>
  );
}

function Stat({ label, v, cls }: { label: string; v: number | string; cls?: string }) {
  return (
    <div className="rounded-lg border border-line bg-card p-3">
      <div className="text-[10px] uppercase tracking-wider text-muted">{label}</div>
      <div className={clsx("mt-0.5 font-mono text-xl font-semibold", cls ?? "text-ink")}>
        {v}
      </div>
    </div>
  );
}
