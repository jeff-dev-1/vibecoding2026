"use client";

import { useMemo } from "react";
import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Job, ParsedLogEntry } from "@/lib/api";

// 从已算好的结构化数据出图表 — 让 AI 助手结果"fancy"。
// 不依赖 LLM 文本, 数据准确。

const COLORS = ["#6366f1", "#f97316", "#10b981", "#f43f5e", "#0ea5e9", "#a855f7", "#eab308"];

function statusColor(code: string) {
  if (code.startsWith("5")) return "#f43f5e";
  if (code.startsWith("4")) return "#f59e0b";
  if (code.startsWith("3")) return "#0ea5e9";
  return "#10b981";
}

export function ScenarioCharts({ job }: { job: Job }) {
  const a = job.analysis;
  const entries = job.sample_entries ?? [];
  const isError =
    entries.length > 0 && entries.filter((e) => e.kind === "error").length > entries.length / 2;

  // 1. 状态码 / 级别 分布
  const statusDist = useMemo(() => {
    if (!a) return [];
    if (isError) {
      const m: Record<string, number> = {};
      for (const e of entries) {
        const k = (e.level || "其他").toUpperCase();
        m[k] = (m[k] || 0) + 1;
      }
      return Object.entries(m).map(([name, value]) => ({ name, value }));
    }
    const m: Record<string, number> = {};
    for (const p of a.traffic_patterns) {
      for (const [code, n] of Object.entries(p.status_codes || {})) {
        m[code] = (m[code] || 0) + n;
      }
    }
    return Object.entries(m).map(([name, value]) => ({ name, value }));
  }, [a, entries, isError]);

  // 2. TOP 路径/消息 by hits
  const topPatterns = useMemo(() => {
    if (!a) return [];
    return a.traffic_patterns
      .slice(0, 6)
      .map((p) => ({ name: p.url_path.slice(0, 28), hits: p.hits }));
  }, [a]);

  // 3. TOP 源 IP (客户端算)
  const topIps = useMemo(() => {
    const m: Record<string, number> = {};
    for (const e of entries) if (e.client_ip) m[e.client_ip] = (m[e.client_ip] || 0) + 1;
    return Object.entries(m)
      .sort((x, y) => y[1] - x[1])
      .slice(0, 6)
      .map(([name, value]) => ({ name, value }));
  }, [entries]);

  // 4. 事件严重度分布
  const sevDist = useMemo(() => {
    if (!a) return [];
    const m: Record<string, number> = {};
    for (const e of a.events) m[e.severity] = (m[e.severity] || 0) + 1;
    return Object.entries(m).map(([name, value]) => ({ name, value }));
  }, [a]);

  if (!a) return null;

  return (
    <div className="grid grid-cols-1 gap-3">
      {statusDist.length > 0 && (
        <ChartCard title={isError ? "日志级别分布" : "状态码分布"}>
          <ResponsiveContainer width="100%" height={150}>
            <PieChart>
              <Pie
                data={statusDist}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={32}
                outerRadius={58}
                paddingAngle={2}
                label={(e) => `${e.name}:${e.value}`}
                labelLine={false}
                style={{ fontSize: 10 }}
              >
                {statusDist.map((d, i) => (
                  <Cell
                    key={i}
                    fill={isError ? COLORS[i % COLORS.length] : statusColor(d.name)}
                  />
                ))}
              </Pie>
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 6 }} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      {topPatterns.length > 0 && (
        <ChartCard title={isError ? "TOP 错误模式" : "TOP 访问路径"}>
          <ResponsiveContainer width="100%" height={Math.max(120, topPatterns.length * 26)}>
            <BarChart data={topPatterns} layout="vertical" margin={{ left: 8, right: 16 }}>
              <XAxis type="number" hide />
              <YAxis
                type="category"
                dataKey="name"
                width={130}
                tick={{ fontSize: 10 }}
                stroke="#94a3b8"
              />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 6 }} />
              <Bar dataKey="hits" fill="#6366f1" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      {topIps.length > 0 && (
        <ChartCard title="TOP 源 IP">
          <ResponsiveContainer width="100%" height={Math.max(120, topIps.length * 26)}>
            <BarChart data={topIps} layout="vertical" margin={{ left: 8, right: 16 }}>
              <XAxis type="number" hide />
              <YAxis
                type="category"
                dataKey="name"
                width={120}
                tick={{ fontSize: 10 }}
                stroke="#94a3b8"
              />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 6 }} />
              <Bar dataKey="value" fill="#f97316" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      {sevDist.length > 0 && (
        <ChartCard title="事件严重度">
          <ResponsiveContainer width="100%" height={140}>
            <PieChart>
              <Pie
                data={sevDist}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius={56}
                label={(e) => `${e.name}:${e.value}`}
                labelLine={false}
                style={{ fontSize: 10 }}
              >
                {sevDist.map((d, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 6 }} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
      )}
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="mb-1.5 text-xs font-medium text-slate-600">{title}</div>
      {children}
    </div>
  );
}
