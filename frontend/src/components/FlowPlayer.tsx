"use client";

import {
  ChevronLeft,
  ChevronRight,
  Pause,
  Play,
  RotateCcw,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";

/**
 * 逐帧回放一张图 —— 运行时的请求链路和构建期的交付流水线共用这一个播放器。
 *
 * 抽出来的原因不是"少写点代码", 是让两张图看起来是同一件事的两个切面:
 * 一张是「一个请求走过哪些跳」, 一张是「一次交付走过哪些闸」。同样的节点样式、
 * 同样的高亮规则、同样的控制条, 观众看第二张时不需要重新学怎么读。
 *
 * 数据驱动: 调用方给 groups / nodes / edges / frames, 这里只负责画和播。
 */

// ===== 画布坐标系 =====
// 固定 viewBox + 容器锁定同一宽高比 ⇒ SVG 连线坐标和 HTML 节点的百分比定位一一对应。
export type Tone = "app" | "gateway" | "vendor" | "supply" | "neutral" | "danger";

export type FlowNode = {
  id: string;
  x: number;
  y: number;
  label: string;
  icon: LucideIcon;
  badge?: string;
  tags?: string[];
  tone: Tone;
  width: number;
};

export type FlowGroup = {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  tone: Tone;
};

export type FlowEdge = {
  id: string;
  from: string;
  to: string;
  /** 虚线 = 不在主链路上 (旁路 / 咨询), 永远不会被点亮。 */
  dashed?: boolean;
};

export type Frame = {
  key: string;
  title: string;
  ok: boolean;
  ms?: number;
  nodes: string[];
  edges: string[];
  rows: [string, string][];
};

/** 每个分区一个颜色。节点自己不挑色, 跟着它所在的区。 */
const TONE: Record<Tone, { border: string; text: string; tagBg: string; glow: string }> = {
  app: {
    border: "border-brand-orange",
    text: "text-brand-orange",
    tagBg: "bg-brand-orange/10 text-brand-orange",
    glow: "shadow-[0_0_0_3px_rgb(var(--c-orange)/0.18)]",
  },
  gateway: {
    border: "border-brand-blue",
    text: "text-brand-blue",
    tagBg: "bg-brand-blue/10 text-brand-blue",
    glow: "shadow-[0_0_0_3px_rgb(var(--c-blue)/0.18)]",
  },
  vendor: {
    border: "border-muted",
    text: "text-ink",
    tagBg: "bg-surface text-muted",
    glow: "shadow-[0_0_0_3px_rgb(var(--c-muted)/0.18)]",
  },
  supply: {
    border: "border-brand-green",
    text: "text-brand-green",
    tagBg: "bg-brand-green/10 text-brand-green",
    glow: "shadow-[0_0_0_3px_rgb(var(--c-green)/0.18)]",
  },
  danger: {
    border: "border-brand-red",
    text: "text-brand-red",
    tagBg: "bg-brand-red/10 text-brand-red",
    glow: "shadow-[0_0_0_3px_rgb(var(--c-red)/0.18)]",
  },
  neutral: {
    border: "border-line",
    text: "text-ink",
    tagBg: "bg-surface text-muted",
    glow: "shadow-[0_0_0_3px_rgb(var(--c-ink)/0.12)]",
  },
};

/**
 * 贝塞尔控制点顺着这条边的主方向偏移。
 *
 * 只按水平方向偏移是不行的: 同一竖列的两个节点之间会拱出一个多余的 S 弯,
 * 明明是直上直下的一跳, 画出来像绕了一圈。竖向为主的边就用竖向控制点,
 * 于是同列的连线是直线, 跨栏的连线才是弧线 —— 弧线因此变成"跨过了一道边界"的信号。
 */
function curve(a: { x: number; y: number }, b: { x: number; y: number }): string {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (Math.abs(dy) > Math.abs(dx)) {
    const k = Math.max(28, Math.abs(dy) * 0.4);
    return `M ${a.x} ${a.y} C ${a.x} ${a.y + k}, ${b.x} ${b.y - k}, ${b.x} ${b.y}`;
  }
  const k = Math.max(40, Math.abs(dx) * 0.45);
  return `M ${a.x} ${a.y} C ${a.x + k} ${a.y}, ${b.x - k} ${b.y}, ${b.x} ${b.y}`;
}

export const fmtMs = (ms: number) => (ms >= 1000 ? `${(ms / 1000).toFixed(2)} s` : `${ms} ms`);

export function FlowPlayer({
  width,
  height,
  groups,
  nodes,
  edges,
  frames,
  header,
  /** 换一批帧时从头播。调用方给一个随数据变化的值 (例如 trace 对象)。 */
  resetKey,
  minWidth = 720,
}: {
  width: number;
  height: number;
  groups: FlowGroup[];
  nodes: FlowNode[];
  edges: FlowEdge[];
  frames: Frame[];
  header?: React.ReactNode;
  resetKey?: unknown;
  minWidth?: number;
}) {
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setI(0);
    setPlaying(true);
  }, [resetKey]);

  useEffect(() => {
    if (!playing) return;
    if (i >= frames.length - 1) {
      setPlaying(false);
      return;
    }
    timer.current = setTimeout(() => setI((v) => v + 1), 1600);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [playing, i, frames.length]);

  const byId = useMemo(
    () => Object.fromEntries(nodes.map((n) => [n.id, n])) as Record<string, FlowNode>,
    [nodes],
  );

  const paths = useMemo(
    () =>
      edges
        .filter((e) => byId[e.from] && byId[e.to])
        .map((e) => ({ ...e, d: curve(byId[e.from], byId[e.to]) })),
    [edges, byId],
  );

  if (frames.length === 0) return null;

  const frame = frames[Math.min(i, frames.length - 1)];
  const activeNodes = new Set(frame.nodes);
  const activeEdges = new Set(frame.edges);

  return (
    // h-full 只在父容器给了固定高度时才起作用 (链路回放那页); 供应链页让它按内容高。
    <div className="flex h-full min-h-0 flex-col gap-3">
      {header}

      {/* 图和说明卡各占一栏。卡片曾经是浮在图上的绝对定位, 结果把右上角那个分组整块盖住了 ——
          现在给它自己的位置, 两边都不用为对方让路。 */}
      <div className="flex min-h-0 flex-1 gap-4 overflow-auto">
        {/* maxWidth 卡在图的自然尺寸上: 不封顶的话, 容器一宽这个盒子就按宽高比一起拉高,
            图还是那么大, 下面白白多出一大块空。 */}
        <div
          className="relative flex-1 self-start"
          style={{ aspectRatio: `${width} / ${height}`, minWidth, maxWidth: width }}
        >
          {/* 连线层。同一 viewBox, 坐标和下面的 HTML 节点一一对应。 */}
          <svg
            viewBox={`0 0 ${width} ${height}`}
            className="absolute inset-0 h-full w-full"
            aria-hidden="true"
          >
            {groups.map((g) => (
              <g key={g.id}>
                <rect
                  x={g.x}
                  y={g.y}
                  width={g.w}
                  height={g.h}
                  rx="18"
                  className={clsx("fill-transparent", TONE[g.tone].text)}
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeDasharray="7 6"
                  opacity="0.55"
                />
                <text
                  x={g.x + 16}
                  y={g.y + 22}
                  className={clsx("font-mono", TONE[g.tone].text)}
                  fill="currentColor"
                  fontSize="12"
                  letterSpacing="1.4"
                  opacity="0.85"
                >
                  {g.label}
                </text>
              </g>
            ))}

            {paths.map((e) => {
              const on = activeEdges.has(e.id);
              return (
                <path
                  key={e.id}
                  d={e.d}
                  fill="none"
                  strokeLinecap="round"
                  strokeWidth={on ? 2.5 : 1.25}
                  strokeDasharray={e.dashed ? "4 7" : undefined}
                  className={clsx("transition-all duration-300", on ? "text-primary" : "text-muted")}
                  stroke="currentColor"
                  opacity={on ? 1 : 0.3}
                />
              );
            })}
          </svg>

          {/* 节点层 */}
          {nodes.map((n) => {
            const on = activeNodes.has(n.id);
            const tone = TONE[n.tone];
            const Icon = n.icon;
            return (
              <div
                key={n.id}
                className={clsx(
                  "absolute -translate-x-1/2 -translate-y-1/2 rounded-xl border bg-card px-3 py-2 transition-all duration-300",
                  on ? `${tone.border} ${tone.glow}` : "border-line",
                )}
                style={{
                  left: `${(n.x / width) * 100}%`,
                  top: `${(n.y / height) * 100}%`,
                  width: n.width,
                }}
              >
                <div className="flex items-center gap-1.5">
                  <Icon className={clsx("size-4 shrink-0", on ? tone.text : "text-muted")} />
                  <span className="truncate text-sm font-medium">{n.label}</span>
                  {n.badge && (
                    <span
                      className={clsx(
                        "ml-auto shrink-0 rounded-full px-1.5 py-px font-mono text-[9px] tracking-wide",
                        on ? tone.tagBg : "bg-surface text-muted",
                      )}
                    >
                      {n.badge}
                    </span>
                  )}
                </div>
                {n.tags && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {n.tags.map((tag) => (
                      <span
                        key={tag}
                        className={clsx(
                          "rounded px-1.5 py-px font-mono text-[9px]",
                          on ? tone.tagBg : "bg-surface text-muted",
                        )}
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* 当前帧的说明卡 */}
        <div className="w-[300px] shrink-0">
          <div className="sticky top-0 rounded-xl border border-line bg-card p-3">
            <div className="flex items-center gap-2">
              <span
                className={clsx(
                  "size-2 shrink-0 rounded-full",
                  frame.ok ? "bg-primary" : "bg-brand-red",
                )}
              />
              <span className="text-sm font-semibold">{frame.title}</span>
              {frame.ms !== undefined && (
                <span className="ml-auto font-mono text-[11px] text-muted">{fmtMs(frame.ms)}</span>
              )}
            </div>
            <dl className="mt-2 space-y-1">
              {frame.rows.map(([k, v]) => (
                <div key={k} className="grid grid-cols-[86px_1fr] gap-2">
                  <dt className="font-mono text-[10px] uppercase leading-4 tracking-wide text-muted">
                    {k}
                  </dt>
                  <dd className="break-words font-mono text-[11px] leading-4">{v}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </div>

      {/* 控制条 */}
      <Controls
        i={i}
        total={frames.length}
        playing={playing}
        onRestart={() => {
          setI(0);
          setPlaying(false);
        }}
        onPrev={() => {
          setPlaying(false);
          setI((v) => Math.max(0, v - 1));
        }}
        onNext={() => {
          setPlaying(false);
          setI((v) => Math.min(frames.length - 1, v + 1));
        }}
        onToggle={() => {
          // 停在最后一帧时点播放 = 从头再放一遍, 否则这个按钮看起来是坏的。
          if (!playing && i >= frames.length - 1) setI(0);
          setPlaying((p) => !p);
        }}
      />
    </div>
  );
}

function Controls({
  i,
  total,
  playing,
  onRestart,
  onPrev,
  onNext,
  onToggle,
}: {
  i: number;
  total: number;
  playing: boolean;
  onRestart: () => void;
  onPrev: () => void;
  onNext: () => void;
  onToggle: () => void;
}) {
  return (
    <div className="flex shrink-0 items-center justify-center gap-3 rounded-2xl border border-line bg-card px-4 py-2.5">
      <Ctrl label="restart" onClick={onRestart}>
        <RotateCcw className="size-4" />
      </Ctrl>
      <Ctrl label="prev" disabled={i === 0} onClick={onPrev}>
        <ChevronLeft className="size-5" />
      </Ctrl>
      <button
        type="button"
        aria-label={playing ? "pause" : "play"}
        onClick={onToggle}
        className="grid size-10 place-items-center rounded-full bg-primary text-white transition hover:brightness-95"
      >
        {playing ? <Pause className="size-5" /> : <Play className="size-5" />}
      </button>
      <Ctrl label="next" disabled={i >= total - 1} onClick={onNext}>
        <ChevronRight className="size-5" />
      </Ctrl>
      <div className="mx-2 h-1.5 w-40 overflow-hidden rounded-full bg-surface sm:w-64">
        <div
          className="h-full rounded-full bg-primary transition-all duration-300"
          style={{ width: `${((i + 1) / total) * 100}%` }}
        />
      </div>
      <span className="font-mono text-xs text-muted">
        {i + 1}/{total}
      </span>
    </div>
  );
}

function Ctrl({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="grid size-8 place-items-center rounded-lg text-muted transition hover:text-ink disabled:opacity-30"
    >
      {children}
    </button>
  );
}

/** 顶部那种 `LABEL (value)` 的配置徽章, 两张图都用。 */
export function ConfigChip({ label, value }: { label: string; value: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="font-mono text-[10px] uppercase tracking-wide text-muted">{label}</span>
      <span className="rounded-full border border-primary px-2 py-0.5 font-mono text-[11px] text-primary">
        {value}
      </span>
    </span>
  );
}
