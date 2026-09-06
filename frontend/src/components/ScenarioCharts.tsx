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
import { useI18n } from "@/lib/i18n";
import { useTokenColors, type TokenColors } from "@/lib/tokens";

// 从已算好的结构化数据出图表 — 不依赖 LLM 文本, 数据准确。
//
// 图表跟着**场景**走, 不是每次都把四张图全铺出来。
// 之前每个场景都渲染同一组图, 于是七个场景在视觉上长得一模一样 —— 问"用户名枚举"
// 和问"服务异常" 顶上都是同一张状态码环图。图要能回答那个场景的问题才放。

type ChartKey = "status" | "patterns" | "ips" | "severity";

// 场景 → 该场景值得看的图。列表为空 = 这个场景的答案是文字, 不配图 ——
// 与其塞一张无关的图, 不如不塞。
const CHART_PLAN: Record<string, ChartKey[]> = {
  // access log
  "traffic-overview": ["status", "patterns", "ips"],
  "error-analysis": ["status", "patterns"],
  "scan-detection": ["patterns", "ips"],
  "bigresp-analysis": ["patterns"],
  "bot-ua": [],
  "ip-rate": ["ips"],
  "url-injection": ["severity"],
  // 系统日志 —— status 在这一族里渲染的是 level 分布, patterns 是 TOP 消息
  "sys-overview": ["status", "patterns"],
  "sys-auth-failure": ["status", "ips"],
  "sys-brute-force": ["ips", "severity"],
  "sys-user-enum": ["ips"],
  "sys-privilege": ["patterns"],
  "sys-service-health": ["status", "patterns"],
  "sys-timeline": [],
};

// 这几张图里其实**没有真正的"分类"数据** —— 状态码、日志级别、严重度全都是
// *状态*, 有内在次序。按分类色板循环上色是把有序的东西涂成了无序的。
//
// 原来的做法是 [primary, orange, blue, red, green, muted, ink] 循环。校验器的结论:
// 橙↔绿在红绿色盲下 ΔE 7.1 (门槛 8), muted/ink 彩度不足被判为灰,
// 绿与青对底色只有 2.1:1 —— 对一部分读者那就是几种"差不多的颜色"。
//
// 现在按语义映射到一条经过校验的状态色阶 (globals.css 的 --c-chart-*):
// 越严重越靠前。同一个概念在所有图里是同一个颜色, 而不是"第几个出现"。
const ramp = (c: TokenColors) => [c.chart1, c.chart2, c.chart3, c.chart4, c.chart5];

// 状态码有约定俗成的语义色: 5xx 最重 / 4xx 次之 / 3xx / 2xx 正常。
function statusColor(code: string, c: TokenColors) {
  if (code.startsWith("5")) return c.chart1;
  if (code.startsWith("4")) return c.chart2;
  if (code.startsWith("3")) return c.chart3;
  return c.chart4;
}

// 日志级别 → 同一条色阶。error 和 5xx 用同一个红不是巧合: 它们是同一件事的
// 两种记法, 图上就该长一样。
const LEVEL_RANK: Record<string, number> = {
  EMERG: 0, ALERT: 0, CRIT: 0, FATAL: 0, ERROR: 0, ERR: 0,
  WARN: 1, WARNING: 1,
  NOTICE: 2,
  INFO: 3, DEBUG: 3,
};

// 严重度 → 同一条色阶, 顺序即严重程度。
const SEVERITY_RANK: Record<string, number> = {
  critical: 0, high: 0,
  medium: 1,
  low: 2,
  info: 3,
};

function rankedColor(key: string, table: Record<string, number>, c: TokenColors) {
  const r = table[key] ?? table[key.toUpperCase()] ?? table[key.toLowerCase()];
  const cols = ramp(c);
  return cols[r ?? cols.length - 1];   // 认不出来的落到最后一档, 不参与前面的语义
}

export function ScenarioCharts({ job, scenario }: { job: Job; scenario: string }) {
  const plan = CHART_PLAN[scenario];
  const show = (k: ChartKey) => (plan ? plan.includes(k) : true);
  const { t } = useI18n();
  const c = useTokenColors();
  const tip = {
    fontSize: 12,
    borderRadius: 8,
    border: `1px solid ${c.line}`,
    background: c.card,
    color: c.ink,
  };
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

  if (!a || (plan && plan.length === 0)) return null;

  return (
    <div className="grid grid-cols-1 gap-3">
      {show("status") && statusDist.length > 0 && (
        <ChartCard title={isError ? t("chart.levelDist") : t("chart.statusDist")}>
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
                    fill={
                      isError ? rankedColor(d.name, LEVEL_RANK, c) : statusColor(d.name, c)
                    }
                  />
                ))}
              </Pie>
              <Tooltip contentStyle={tip} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      {show("patterns") && topPatterns.length > 0 && (
        <ChartCard title={isError ? t("chart.topErrors") : t("chart.topPaths")}>
          <ResponsiveContainer width="100%" height={Math.max(120, topPatterns.length * 26)}>
            <BarChart data={topPatterns} layout="vertical" margin={{ left: 8, right: 16 }}>
              <XAxis type="number" hide />
              <YAxis
                type="category"
                dataKey="name"
                width={130}
                tick={{ fontSize: 10, fill: c.muted }}
                stroke={c.muted}
              />
              <Tooltip contentStyle={tip} />
              <Bar dataKey="hits" fill={c.chart3} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      {show("ips") && topIps.length > 0 && (
        <ChartCard title={t("chart.topIps")}>
          <ResponsiveContainer width="100%" height={Math.max(120, topIps.length * 26)}>
            <BarChart data={topIps} layout="vertical" margin={{ left: 8, right: 16 }}>
              <XAxis type="number" hide />
              <YAxis
                type="category"
                dataKey="name"
                width={120}
                tick={{ fontSize: 10, fill: c.muted }}
                stroke={c.muted}
              />
              <Tooltip contentStyle={tip} />
              <Bar dataKey="value" fill={c.chart2} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      {show("severity") && sevDist.length > 0 && (
        <ChartCard title={t("chart.severity")}>
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
                  <Cell key={i} fill={rankedColor(d.name, SEVERITY_RANK, c)} />
                ))}
              </Pie>
              <Tooltip contentStyle={tip} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
      )}
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-line bg-card p-3">
      <div className="mb-1.5 text-xs font-medium text-muted">{title}</div>
      {children}
    </div>
  );
}
