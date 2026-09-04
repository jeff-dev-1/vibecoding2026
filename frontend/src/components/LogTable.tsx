"use client";

import { Fragment, useState } from "react";
import clsx from "clsx";
import type { ParsedLogEntry } from "@/lib/api";
import { useI18n, type Lang } from "@/lib/i18n";

type Props = { entries: ParsedLogEntry[]; maxRows?: number };

// 界面语言决定时间格式 —— 切成 English 后还显示 "2026/1/22 08:25:13" 是明显的漏译。
//
// 这里的输出必然在服务端和浏览器之间不一致: 容器跑 UTC, 读者的浏览器跑本地时区,
// 同一个时间戳会被格式化成两个字符串, React 会报 hydration mismatch (#425)。
// 时间就是该按读者所在时区显示, 所以正确做法不是让两边一致, 而是告诉 React
// 这一处的差异是有意的 —— 每个渲染时间的元素都带 suppressHydrationWarning。
const LOCALE: Record<Lang, string> = {
  "zh-Hans": "zh-CN",
  "zh-Hant": "zh-TW",
  en: "en-GB",
};

function fmtTime(s: string | null | undefined, lang: Lang) {
  if (!s) return "—";
  try {
    return new Date(s).toLocaleString(LOCALE[lang]);
  } catch {
    return s;
  }
}

function statusColor(s?: number | null) {
  if (!s) return "text-muted";
  if (s >= 500) return "text-brand-red";
  if (s >= 400) return "text-brand-orange";
  if (s >= 300) return "text-brand-blue";
  return "text-brand-green";
}

function levelColor(l?: string | null) {
  const v = (l ?? "").toLowerCase();
  if (["error", "crit", "alert", "emerg"].includes(v)) return "text-brand-red";
  if (["warn", "warning"].includes(v)) return "text-brand-orange";
  if (v === "notice") return "text-brand-blue";
  return "text-muted";
}

function fmtBytes(n?: number | null) {
  if (n == null) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function LogTable({ entries, maxRows = 30 }: Props) {
  const { t, lang } = useI18n();
  const [open, setOpen] = useState<Set<number>>(new Set());
  const rows = entries.slice(0, maxRows);
  const isError = rows.length > 0 && rows.filter((e) => e.kind === "error").length > rows.length / 2;

  const toggle = (i: number) =>
    setOpen((prev) => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-line bg-card p-12 text-center text-sm text-muted">
        {t("table.empty")}
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-line bg-card">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line bg-surface text-xs uppercase tracking-wider text-muted">
            <th className="w-44 px-3 py-2 text-left font-medium">{t("table.time")}</th>
            {isError ? (
              <>
                <th className="w-20 px-3 py-2 text-left font-medium">{t("table.level")}</th>
                <th className="w-32 px-3 py-2 text-left font-medium">{t("table.clientIp")}</th>
                <th className="px-3 py-2 text-left font-medium">{t("table.message")}</th>
              </>
            ) : (
              <>
                <th className="w-32 px-3 py-2 text-left font-medium">{t("table.clientIp")}</th>
                <th className="px-3 py-2 text-left font-medium">{t("table.reqPath")}</th>
                <th className="w-20 px-3 py-2 text-left font-medium">{t("table.method")}</th>
                <th className="w-20 px-3 py-2 text-right font-medium">{t("table.status")}</th>
                <th className="w-24 px-3 py-2 text-right font-medium">{t("table.size")}</th>
              </>
            )}
            <th className="w-10 px-2 py-2 text-center font-medium">+</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((e, i) => {
            const isOpen = open.has(i);
            const colCount = isError ? 5 : 7;
            return (
              <Fragment key={i}>
                <tr
                  className={clsx(
                    "cursor-pointer border-b border-line hover:bg-surface",
                    isOpen && "bg-surface/60",
                  )}
                  onClick={() => toggle(i)}
                >
                  <td className="px-3 py-2 text-ink" suppressHydrationWarning>
                    {fmtTime(e.ts, lang)}
                  </td>
                  {isError ? (
                    <>
                      <td className={clsx("px-3 py-2 font-mono uppercase", levelColor(e.level))}>
                        {e.level ?? "—"}
                      </td>
                      <td className="px-3 py-2 font-mono text-brand-blue">{e.client_ip ?? "—"}</td>
                      <td className="px-3 py-2 text-ink">
                        <div className="max-w-xl truncate">{e.message ?? "—"}</div>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-3 py-2 font-mono text-brand-blue">{e.client_ip ?? "—"}</td>
                      <td className="px-3 py-2 font-mono text-ink">
                        <div className="max-w-md truncate">{e.path ?? "—"}</div>
                      </td>
                      <td className="px-3 py-2 font-mono text-muted">{e.method ?? "—"}</td>
                      <td className={clsx("px-3 py-2 text-right font-mono", statusColor(e.status))}>
                        {e.status ?? "—"}
                      </td>
                      <td className="px-3 py-2 text-right text-muted">
                        {fmtBytes(e.bytes_sent)}
                      </td>
                    </>
                  )}
                  <td className="px-2 py-2 text-center text-muted">{isOpen ? "−" : "+"}</td>
                </tr>
                {isOpen && (
                  <tr>
                    <td colSpan={colCount} className="bg-surface/40 p-4">
                      <div className="grid grid-cols-1 gap-3 text-xs md:grid-cols-2">
                        {isError ? (
                          <>
                            <Field label={t("table.level")}>
                              <span className={clsx("font-mono uppercase", levelColor(e.level))}>
                                {e.level ?? "—"}
                              </span>
                            </Field>
                            <Field label={t("table.clientIp")}>
                              <span className="font-mono">{e.client_ip ?? "—"}</span>
                            </Field>
                            <div className="md:col-span-2">
                              <Field label={t("table.fullMessage")}>
                                <span className="break-all">{e.message ?? "—"}</span>
                              </Field>
                            </div>
                          </>
                        ) : (
                          <>
                            <Field label={t("table.fullRequest")}>
                              <span className="font-mono">
                                {e.method} {e.path} → {e.status}
                              </span>
                            </Field>
                            <Field label={t("table.clientIp")}>
                              <span className="font-mono">{e.client_ip ?? "—"}</span>
                            </Field>
                            <Field label={t("table.ua")}>
                              <span className="break-all">{e.user_agent ?? "—"}</span>
                            </Field>
                            <Field label={t("table.referer")}>
                              <span className="break-all">{e.referer ?? "—"}</span>
                            </Field>
                            <Field label={t("table.respSize")}>{fmtBytes(e.bytes_sent)}</Field>
                          </>
                        )}
                        <Field label={t("table.lineNo")}>#{e.line_no}</Field>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
      {entries.length > maxRows && (
        <div className="border-t border-line bg-surface px-3 py-1.5 text-center text-xs text-muted">
          {t("table.more")} {maxRows} {t("table.moreOf")} {entries.length} {t("table.rows")} ·{" "}
          {isError ? "Apache error_log" : "access log"}
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded bg-card p-2 ring-1 ring-line">
      <div className="mb-0.5 text-[10px] uppercase tracking-wider text-muted">{label}</div>
      <div className="text-ink">{children}</div>
    </div>
  );
}
