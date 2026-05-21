"use client";

import { useState } from "react";
import clsx from "clsx";
import type { ParsedLogEntry } from "@/lib/api";

type Props = { entries: ParsedLogEntry[]; maxRows?: number };

function fmtTime(s?: string | null) {
  if (!s) return "—";
  try {
    return new Date(s).toLocaleString("zh-CN");
  } catch {
    return s;
  }
}

function statusColor(s?: number | null) {
  if (!s) return "text-slate-500";
  if (s >= 500) return "text-rose-600";
  if (s >= 400) return "text-amber-600";
  if (s >= 300) return "text-sky-600";
  return "text-emerald-600";
}

function fmtBytes(n?: number | null) {
  if (n == null) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function LogTable({ entries, maxRows = 30 }: Props) {
  const [open, setOpen] = useState<Set<number>>(new Set());
  const rows = entries.slice(0, maxRows);

  const toggle = (i: number) =>
    setOpen((prev) => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-12 text-center text-sm text-slate-400">
        暂无日志条目。请先上传 Nginx access log。
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
            <th className="w-44 px-3 py-2 text-left font-medium">时间</th>
            <th className="w-32 px-3 py-2 text-left font-medium">客户端 IP</th>
            <th className="px-3 py-2 text-left font-medium">请求路径</th>
            <th className="w-20 px-3 py-2 text-left font-medium">方法</th>
            <th className="w-20 px-3 py-2 text-right font-medium">状态</th>
            <th className="w-24 px-3 py-2 text-right font-medium">大小</th>
            <th className="w-10 px-2 py-2 text-center font-medium">+</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((e, i) => {
            const isOpen = open.has(i);
            return (
              <>
                <tr
                  key={`r-${i}`}
                  className={clsx(
                    "cursor-pointer border-b border-slate-100 hover:bg-slate-50",
                    isOpen && "bg-slate-50/60",
                  )}
                  onClick={() => toggle(i)}
                >
                  <td className="px-3 py-2 text-slate-700">{fmtTime(e.ts)}</td>
                  <td className="px-3 py-2 font-mono text-sky-700">{e.client_ip ?? "—"}</td>
                  <td className="px-3 py-2 font-mono text-slate-700">
                    <div className="max-w-md truncate">{e.path ?? "—"}</div>
                  </td>
                  <td className="px-3 py-2 font-mono text-slate-500">{e.method ?? "—"}</td>
                  <td className={clsx("px-3 py-2 text-right font-mono", statusColor(e.status))}>
                    {e.status ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-right text-slate-600">{fmtBytes(e.bytes_sent)}</td>
                  <td className="px-2 py-2 text-center text-slate-400">{isOpen ? "−" : "+"}</td>
                </tr>
                {isOpen && (
                  <tr key={`d-${i}`}>
                    <td colSpan={7} className="bg-slate-50/40 p-4">
                      <div className="grid grid-cols-1 gap-3 text-xs md:grid-cols-2">
                        <Field label="完整请求">
                          <span className="font-mono">
                            {e.method} {e.path} → {e.status}
                          </span>
                        </Field>
                        <Field label="客户端 IP">
                          <span className="font-mono">{e.client_ip ?? "—"}</span>
                        </Field>
                        <Field label="User-Agent">
                          <span className="break-all">{e.user_agent ?? "—"}</span>
                        </Field>
                        <Field label="Referer">
                          <span className="break-all">{e.referer ?? "—"}</span>
                        </Field>
                        <Field label="响应大小">{fmtBytes(e.bytes_sent)}</Field>
                        <Field label="行号">#{e.line_no}</Field>
                      </div>
                    </td>
                  </tr>
                )}
              </>
            );
          })}
        </tbody>
      </table>
      {entries.length > maxRows && (
        <div className="border-t border-slate-200 bg-slate-50 px-3 py-1.5 text-center text-xs text-slate-400">
          已显示前 {maxRows} 条,共 {entries.length} 条
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded bg-white p-2 ring-1 ring-slate-200">
      <div className="mb-0.5 text-[10px] uppercase tracking-wider text-slate-400">{label}</div>
      <div className="text-slate-700">{children}</div>
    </div>
  );
}
