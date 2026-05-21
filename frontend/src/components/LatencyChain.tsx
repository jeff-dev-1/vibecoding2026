"use client";

import type { ParsedLogEntry } from "@/lib/api";
import clsx from "clsx";

const STAGES = [
  { key: "client_rtt_ms", label: "客户端", emoji: "👤", color: "text-sky-600" },
  { key: "lb_ms", label: "LB", emoji: "🛡️", color: "text-amber-600" },
  { key: "server_rtt_ms", label: "服务器", emoji: "🖥️", color: "text-emerald-600" },
  { key: "app_ms", label: "应用", emoji: "📦", color: "text-violet-600" },
  { key: "transfer_ms", label: "数据传输", emoji: "📡", color: "text-rose-600" },
] as const;

export function LatencyChain({ entry }: { entry: ParsedLogEntry }) {
  const segs = STAGES.map((s) => ({
    ...s,
    ms: (entry[s.key as keyof ParsedLogEntry] as number | undefined) ?? 0,
  }));
  const total = segs.reduce((a, b) => a + b.ms, 0);

  return (
    <div className="grid grid-cols-1 gap-4 rounded-md border border-slate-200 bg-slate-50/60 p-4 lg:grid-cols-2">
      {/* 链路 6 段卡 */}
      <div className="grid grid-cols-6 gap-3">
        {segs.map((s, i) => (
          <div key={s.key} className="text-center">
            <div className="mb-1 text-2xl">{s.emoji}</div>
            <div className="text-xs text-slate-500">{s.label}</div>
            <div className={clsx("mt-1 text-sm font-semibold", s.color)}>{s.ms} ms</div>
            {i < segs.length - 1 && (
              <div className="mt-1 text-[10px] text-slate-400">200 →</div>
            )}
          </div>
        ))}
        <div className="text-center">
          <div className="mb-1 text-2xl">∑</div>
          <div className="text-xs text-slate-500">总计</div>
          <div className="mt-1 text-sm font-semibold text-slate-800">{total} ms</div>
        </div>
      </div>

      {/* 客户端 / 服务器 详情 */}
      <div className="grid grid-cols-2 gap-3 text-xs">
        <div className="rounded bg-white p-3 ring-1 ring-slate-200">
          <div className="mb-2 font-medium text-slate-700">客户端</div>
          <div className="space-y-1 text-slate-600">
            <div>
              <span className="text-slate-400">IP: </span>
              {entry.client_ip ?? "—"}
            </div>
            <div>
              <span className="text-slate-400">UA: </span>
              <span className="break-all">{entry.user_agent ?? "—"}</span>
            </div>
            <div>
              <span className="text-slate-400">Referer: </span>
              {entry.referer ?? "—"}
            </div>
          </div>
        </div>
        <div className="rounded bg-white p-3 ring-1 ring-slate-200">
          <div className="mb-2 font-medium text-slate-700">请求信息</div>
          <div className="space-y-1 text-slate-600">
            <div>
              <span className="text-slate-400">方法: </span>
              <span className="font-mono">{entry.method ?? "—"}</span>
            </div>
            <div>
              <span className="text-slate-400">URI: </span>
              <span className="break-all font-mono">{entry.path ?? "—"}</span>
            </div>
            <div>
              <span className="text-slate-400">响应: </span>
              <span
                className={clsx(
                  "font-mono",
                  (entry.status ?? 0) >= 500
                    ? "text-rose-600"
                    : (entry.status ?? 0) >= 400
                      ? "text-amber-600"
                      : "text-emerald-600",
                )}
              >
                {entry.status ?? "—"}
              </span>
              {" · "}
              <span className="text-slate-400">长度: </span>
              {entry.bytes_sent ?? 0} B
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
