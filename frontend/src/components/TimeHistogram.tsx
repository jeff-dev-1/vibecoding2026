"use client";

import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ParsedLogEntry } from "@/lib/api";

type Props = {
  entries: ParsedLogEntry[];
  bucketMinutes?: number;
};

export function TimeHistogram({ entries, bucketMinutes = 15 }: Props) {
  const data = useMemo(() => {
    if (entries.length === 0) return [];
    const buckets = new Map<number, { normal: number; severe: number }>();
    const bucketMs = bucketMinutes * 60 * 1000;
    for (const e of entries) {
      if (!e.ts) continue;
      const t = new Date(e.ts).getTime();
      if (isNaN(t)) continue;
      const key = Math.floor(t / bucketMs) * bucketMs;
      const cur = buckets.get(key) ?? { normal: 0, severe: 0 };
      const severe = (e.status ?? 0) >= 400;
      if (severe) cur.severe += 1;
      else cur.normal += 1;
      buckets.set(key, cur);
    }
    const arr = Array.from(buckets.entries())
      .sort(([a], [b]) => a - b)
      .map(([t, v]) => ({
        time: new Date(t).toLocaleString("zh-CN", {
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        }),
        正常日志: v.normal,
        重要日志: v.severe,
      }));
    return arr;
  }, [entries, bucketMinutes]);

  if (data.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-slate-400">
        上传一份日志查看时间分布
      </div>
    );
  }

  const first = data[0]?.time ?? "";
  const last = data[data.length - 1]?.time ?? "";

  return (
    <div className="px-4 pb-4 pt-2">
      <div className="mb-1 flex justify-between text-xs text-slate-500">
        <span>共有 {entries.length} 条日志</span>
        <span>
          {first} — {last}
        </span>
      </div>
      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={data} barCategoryGap={6}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
          <XAxis
            dataKey="time"
            stroke="#94a3b8"
            tick={{ fontSize: 10 }}
            interval={Math.max(0, Math.floor(data.length / 12))}
          />
          <YAxis stroke="#94a3b8" tick={{ fontSize: 10 }} />
          <Tooltip
            contentStyle={{
              fontSize: 12,
              borderRadius: 6,
              border: "1px solid #e2e8f0",
            }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar
            dataKey="正常日志"
            stackId="a"
            fill="#84cc16"
            radius={[0, 0, 0, 0]}
          />
          <Bar dataKey="重要日志" stackId="a" fill="#f97316" radius={[2, 2, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
