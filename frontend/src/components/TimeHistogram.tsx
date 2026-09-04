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
import { useI18n, type Lang } from "@/lib/i18n";
import { useTokenColors } from "@/lib/tokens";

type Props = {
  entries: ParsedLogEntry[];
  bucketMinutes?: number;
};

const LOCALE: Record<Lang, string> = {
  "zh-Hans": "zh-CN",
  "zh-Hant": "zh-TW",
  en: "en-GB",
};

export function TimeHistogram({ entries, bucketMinutes = 15 }: Props) {
  const { t, lang } = useI18n();
  const c = useTokenColors();

  // 图例上的名字就是数据的键名, 所以它必须跟着语言走 —— 这也是 data 依赖 lang 的原因。
  const kNormal = t("hist.normal");
  const kSevere = t("hist.important");

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
      const lvl = (e.level ?? "").toLowerCase();
      const severe =
        (e.status ?? 0) >= 400 ||
        ["error", "crit", "alert", "emerg", "warn", "warning"].includes(lvl);
      if (severe) cur.severe += 1;
      else cur.normal += 1;
      buckets.set(key, cur);
    }
    return Array.from(buckets.entries())
      .sort(([a], [b]) => a - b)
      .map(([ts, v]) => ({
        time: new Date(ts).toLocaleString(LOCALE[lang], {
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        }),
        [kNormal]: v.normal,
        [kSevere]: v.severe,
      }));
  }, [entries, bucketMinutes, lang, kNormal, kSevere]);

  if (data.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-muted">
        {t("hist.empty")}
      </div>
    );
  }

  const first = data[0]?.time ?? "";
  const last = data[data.length - 1]?.time ?? "";

  return (
    <div className="px-4 pb-4 pt-2">
      <div className="mb-1 flex justify-between text-xs text-muted">
        <span>
          {t("hist.total")} {entries.length} {t("hist.entries")}
        </span>
        {/* 容器是 UTC, 浏览器是本地时区 —— 同一个时间戳两边格式化结果不同。
            时间本就该按读者的时区显示, 所以声明这处差异是有意的, 而不是去凑一致。 */}
        <span className="font-mono" suppressHydrationWarning>
          {first} — {last}
        </span>
      </div>
      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={data} barCategoryGap={6}>
          {/* recharts 要真实颜色值, 吃不了 Tailwind 类, 所以从 token 里读出来喂给它 */}
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={c.line} />
          <XAxis
            dataKey="time"
            stroke={c.muted}
            tick={{ fontSize: 10, fill: c.muted }}
            interval={Math.max(0, Math.floor(data.length / 12))}
          />
          <YAxis stroke={c.muted} tick={{ fontSize: 10, fill: c.muted }} />
          <Tooltip
            cursor={{ fill: c.line, opacity: 0.25 }}
            contentStyle={{
              fontSize: 12,
              borderRadius: 8,
              border: `1px solid ${c.line}`,
              background: c.card,
              color: c.ink,
            }}
            labelStyle={{ color: c.ink }}
          />
          <Legend wrapperStyle={{ fontSize: 12, color: c.muted }} />
          <Bar dataKey={kNormal} stackId="a" fill={c.green} radius={[0, 0, 0, 0]} />
          <Bar dataKey={kSevere} stackId="a" fill={c.orange} radius={[2, 2, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
