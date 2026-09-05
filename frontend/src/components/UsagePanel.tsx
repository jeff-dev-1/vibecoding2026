"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";
import { gatewayAnalytics, type Analytics, type SeriesPoint } from "@/lib/api";
import { useI18n, type Key, type Lang } from "@/lib/i18n";
import { useTokenColors } from "@/lib/tokens";

/**
 * AI 网关用量 —— 数据取自 Portkey 的分析 API, 不是本地内存窗口。
 *
 * 为什么换数据源, 三条都是被现场问出来的:
 *   1. 内存窗口每次重启后端就清零。面板显示 "no calls yet" 而账单上明明有调用,
 *      解释起来很难看。
 *   2. Portkey 那份是厂商自己的计量; 本地那份只能标"估算量级(非账单)"。
 *   3. 护栏裁定只有厂商侧有 —— 246 (标记但放行) 在本地根本看不到, 因为那种请求
 *      在我们这里就是一次正常返回。
 *
 * 图的形态: 大数字 + 迷你趋势线。四个指标各自一条序列, 单序列不需要图例 ——
 * 标题就说明了它是什么。颜色只用一个 primary; 护栏那一块才用状态色, 因为那里
 * 红/橙/绿是有约定含义的 (拒绝/标记/放行), 不是拿来区分四个指标的装饰。
 */

const WINDOWS: { id: string; labelKey: Key }[] = [
  { id: "24h", labelKey: "usage.w24h" },
  { id: "7d", labelKey: "usage.w7d" },
  { id: "30d", labelKey: "usage.w30d" },
];

export function UsagePanel({ provider }: { provider: string }) {
  const { t, lang } = useI18n();
  const [win, setWin] = useState("24h");
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let stale = false;
    setLoading(true);
    gatewayAnalytics(win)
      .then((d) => {
        if (!stale) setData(d);
      })
      .catch(() => {
        if (!stale) setData(null);
      })
      .finally(() => {
        if (!stale) setLoading(false);
      });
    return () => {
      stale = true;
    };
  }, [win]);

  // Envoy 路径下没有厂商侧的账, 这一页只有 Portkey 有数据 —— 说清楚而不是显示一堆 0。
  if (provider !== "portkey") {
    return (
      <div className="rounded-xl border border-dashed border-line px-4 py-3 text-sm text-muted">
        {t("usage.envoyNote")}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="text-sm font-semibold text-ink">{t("usage.title")}</h3>
        {/* 时间范围放在图表上方一行 —— 它作用于下面所有图 */}
        <nav className="flex gap-1 rounded-xl bg-surface p-1">
          {WINDOWS.map((w) => (
            <button
              key={w.id}
              type="button"
              onClick={() => setWin(w.id)}
              aria-pressed={win === w.id}
              className={clsx(
                "rounded-lg px-2.5 py-1 text-xs font-medium transition",
                win === w.id ? "bg-card text-primary shadow-sm" : "text-muted hover:text-ink",
              )}
            >
              {t(w.labelKey)}
            </button>
          ))}
        </nav>
        <span className="text-[11px] text-muted">{t("usage.source")}</span>
      </div>

      {loading && !data ? (
        <div className="grid animate-pulse gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-28 rounded-xl bg-surface" />
          ))}
        </div>
      ) : !data?.configured ? (
        <div className="rounded-xl border border-dashed border-line px-4 py-3 text-sm text-muted">
          {t("usage.notConfigured")}
        </div>
      ) : (
        <>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <Stat
              label={t("usage.requests")}
              value={String(data.summary.requests ?? 0)}
              points={data.series.requests}
              lang={lang}
            />
            <Stat
              label={t("usage.cost")}
              value={`$${(data.summary.cost_usd ?? 0).toFixed(4)}`}
              points={data.series.cost}
              lang={lang}
            />
            <Stat
              label={t("usage.tokens")}
              value={fmtCompact(data.summary.tokens ?? 0)}
              points={data.series.tokens}
              lang={lang}
            />
            <Stat
              label={t("usage.latency")}
              value={`${Math.round(data.summary.latency_p50 ?? 0)}ms`}
              sub={`p90 ${Math.round(data.summary.latency_p90 ?? 0)}ms`}
              points={data.series.latency}
              lang={lang}
            />
          </div>

          {/* 第二排: 错误与用户。Portkey 还给了这几条, 单独一排而不是挤进上面四张 ——
              上排是"用了多少", 这排是"出了多少问题 / 谁在用", 两个问题。 */}
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <Stat
              label={t("usage.errors")}
              value={String(data.summary.errors ?? 0)}
              sub={
                data.summary.requests
                  ? `${(((data.summary.errors ?? 0) / data.summary.requests) * 100).toFixed(1)}%`
                  : "0%"
              }
              points={data.series.errors ?? []}
              lang={lang}
              tone={(data.summary.errors ?? 0) > 0 ? "danger" : undefined}
            />
            <Stat
              label={t("usage.users")}
              value={String(data.summary.users ?? 0)}
              points={data.series.users ?? []}
              lang={lang}
            />
          </div>

          <GuardrailVerdicts g={data.guardrail} />

          {data.by_model.length > 0 && (
            <div className="rounded-xl border border-line">
              <div className="border-b border-line px-3 py-2 text-xs font-medium text-muted">
                {t("usage.byModel")}
              </div>
              <ul className="divide-y divide-line">
                {data.by_model.map((m) => (
                  <li key={m.model} className="flex items-center gap-3 px-3 py-2">
                    <span className="font-mono text-xs text-ink">{m.model}</span>
                    <span className="flex-1" />
                    <span className="font-mono text-xs text-muted">
                      {m.requests} {t("gw.calls")}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className="text-[11px] leading-relaxed text-muted">{t("usage.note")}</p>
        </>
      )}
    </div>
  );
}

/** 大数字 + 迷你趋势。单序列, 所以不需要图例 —— 标题已经说明它是什么。 */
function Stat({
  label,
  value,
  sub,
  points,
  lang,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  points: SeriesPoint[];
  lang: Lang;
  /** 只有"错误"这类有好坏之分的指标才染色; 其余保持中性, 颜色不用来装饰。 */
  tone?: "danger";
}) {
  return (
    <div className="rounded-xl border border-line p-3">
      <div className="text-[10px] uppercase tracking-wide text-muted">{label}</div>
      <div className="mt-0.5 font-mono text-xl font-semibold text-ink">{value}</div>
      {/* 副行始终占位, 哪怕没内容 —— 只有延迟卡有 p90, 不占位的话它的趋势线
          比另外三张低一行, 四张卡的线就对不齐了。 */}
      <div className="h-[14px] font-mono text-[10px] text-muted">{sub ?? ""}</div>
      <Sparkline points={points} lang={lang} tone={tone} />
    </div>
  );
}

/**
 * 迷你趋势线。手写 SVG 而不是拉图表库: 一条线 + 一块面积 + 一个悬停点,
 * recharts 在 60px 高的盒子里要处理的坐标轴/边距反而碍事。
 */
function Sparkline({
  points,
  lang,
  tone,
}: {
  points: SeriesPoint[];
  lang: Lang;
  tone?: "danger";
}) {
  const c = useTokenColors();
  const stroke = tone === "danger" ? c.red : c.primary;
  const [hover, setHover] = useState<number | null>(null);
  const vals = points.map((p) => p.v);
  if (vals.length < 2) {
    return <div className="mt-2 h-[46px]" />;
  }

  const W = 200;
  const H = 46;
  const max = Math.max(...vals, 1);
  // 底部留 1px, 免得 0 值那一段贴着边框看不出来
  const xy = (v: number, i: number) => [
    (i / (vals.length - 1)) * W,
    H - 1 - (v / max) * (H - 4),
  ];
  const line = vals.map((v, i) => xy(v, i).join(",")).join(" L ");
  const area = `M 0,${H} L ${line} L ${W},${H} Z`;
  const at = hover != null ? xy(vals[hover], hover) : null;

  return (
    <div
      className="relative mt-2"
      onMouseLeave={() => setHover(null)}
      onMouseMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        const i = Math.round(((e.clientX - r.left) / r.width) * (vals.length - 1));
        setHover(Math.max(0, Math.min(vals.length - 1, i)));
      }}
    >
      <svg viewBox={`0 0 ${W} ${H}`} className="h-[46px] w-full" preserveAspectRatio="none">
        <path d={area} fill={stroke} opacity={0.14} />
        <path
          d={`M ${line}`}
          fill="none"
          stroke={stroke}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
        {at && (
          <circle cx={at[0]} cy={at[1]} r={3} fill={stroke} vectorEffect="non-scaling-stroke" />
        )}
      </svg>
      {hover != null && (
        <div className="pointer-events-none absolute -top-1 left-0 right-0 text-center font-mono text-[10px] text-ink">
          {fmtCompact(vals[hover])}
          <span className="ml-1 text-muted" suppressHydrationWarning>
            {fmtTime(points[hover].t, lang)}
          </span>
        </div>
      )}
    </div>
  );
}

/** 护栏裁定 —— 这一块用状态色, 因为红/橙/绿在这里有约定含义, 不是装饰。 */
function GuardrailVerdicts({
  g,
}: {
  g: { denied: number; flagged: number; ok: number; other: number };
}) {
  const { t } = useI18n();
  const total = g.denied + g.flagged + g.ok + g.other;
  if (total === 0) return null;
  const rows = [
    { k: "ok", n: g.ok, cls: "bg-brand-green", textCls: "text-brand-green" },
    { k: "flagged", n: g.flagged, cls: "bg-brand-orange", textCls: "text-brand-orange" },
    { k: "denied", n: g.denied, cls: "bg-brand-red", textCls: "text-brand-red" },
  ];

  return (
    <div className="rounded-xl border border-line p-3">
      <div className="mb-2 flex items-baseline gap-2">
        <span className="text-xs font-medium text-ink">{t("usage.verdicts")}</span>
        <span className="text-[11px] text-muted">{t("usage.verdictsNote")}</span>
      </div>
      {/* 一条堆叠比例条 —— 三个数放在一起才看得出比例 */}
      <div className="flex h-2 overflow-hidden rounded-full bg-surface">
        {rows.map((r) =>
          r.n > 0 ? (
            <div key={r.k} className={r.cls} style={{ width: `${(r.n / total) * 100}%` }} />
          ) : null,
        )}
      </div>
      <dl className="mt-2 flex flex-wrap gap-x-5 gap-y-1 font-mono text-[11px]">
        {rows.map((r) => (
          <div key={r.k}>
            <dt className="inline text-muted">{t(`usage.v.${r.k}` as Key)}</dt>{" "}
            <dd className={clsx("inline font-semibold", r.textCls)}>{r.n}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

const fmtCompact = (n: number) =>
  n >= 1_000_000
    ? `${(n / 1_000_000).toFixed(1)}M`
    : n >= 1000
      ? `${(n / 1000).toFixed(1)}K`
      : n % 1 === 0
        ? String(n)
        : n.toFixed(3);

const LOCALE: Record<Lang, string> = {
  "zh-Hans": "zh-CN",
  "zh-Hant": "zh-TW",
  en: "en-GB",
};

function fmtTime(iso: string, lang: Lang) {
  try {
    return new Date(iso).toLocaleString(LOCALE[lang], { month: "2-digit", day: "2-digit", hour: "2-digit" });
  } catch {
    return "";
  }
}
