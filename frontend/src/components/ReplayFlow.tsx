"use client";

import {
  Boxes,
  Database,
  Globe,
  MonitorSmartphone,
  Pause,
  Play,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  Server,
  ShieldCheck,
  Sparkles,
  User,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { useI18n } from "@/lib/i18n";
import type { ChatTrace, LLMBackend, TraceStep } from "@/lib/api";

/**
 * 请求链路回放。
 *
 * 一句话: 把"刚才那个问题在这套系统里怎么走的"逐帧放一遍。
 *
 * 数据来源有两种, 界面上必须能一眼分清 ——
 *   真实请求  后端 ChatResponse.trace, 每一跳的耗时/用量/路由头都是量出来的
 *   演示剧本  还没人提过问时的占位, 顶部挂"演示剧本"标签
 * 混在一起而不标注是这类演示最容易被客户抓住的地方, 所以标签不给关。
 *
 * 帧不是写死的: 它从 trace.steps 生成。被护栏拦下的请求就只有护栏那一帧,
 * 后面几帧根本不存在 —— 因为那几跳确实没有发生。
 */

// ===== 画布坐标系 =====
// 固定 viewBox + 容器锁定同一宽高比 ⇒ SVG 连线坐标和 HTML 节点的百分比定位一一对应。
const W = 960;
const H = 600;

type NodeId = "you" | "web" | "api" | "guard" | "vec" | "gw" | "deepseek" | "qwen" | "koi";

type FlowNode = {
  id: NodeId;
  x: number;
  y: number;
  label: string;
  icon: LucideIcon;
  badge?: string;
  tags?: string[];
  tone: Tone;
  width: number;
};

type Tone = "app" | "gateway" | "vendor" | "supply" | "neutral";

// 每个分区一个颜色, 和图例里的分组框对应。节点自己不挑色, 跟着它所在的区。
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
  neutral: {
    border: "border-line",
    text: "text-ink",
    tagBg: "bg-surface text-muted",
    glow: "shadow-[0_0_0_3px_rgb(var(--c-ink)/0.12)]",
  },
};

// 分组框贴着内容排, 不留大片空白 —— 之前每个框都比里面的节点大出一截,
// 整张图读起来是"几个散落的盒子", 而不是一条请求走过的路。
//
// 左右分栏 = 信任边界: 左边是你自己的机器, 右边是网关和外部厂商。
// 上下顺序 = 请求顺序: 浏览器在上, 数据在下, 眼睛跟着回放自然往下走。
const GROUPS: { x: number; y: number; w: number; h: number; labelKey: GroupKey; tone: Tone }[] = [
  { x: 150, y: 30, w: 400, h: 440, labelKey: "replay.groupApp", tone: "app" },
  { x: 600, y: 60, w: 300, h: 160, labelKey: "replay.groupGateway", tone: "gateway" },
  // 两个厂商上下叠, 不并排: 并排要 420px 才装得下 "qwen3-coder" + 徽章, 会撑破分组框。
  { x: 600, y: 270, w: 300, h: 180, labelKey: "replay.groupVendor", tone: "vendor" },
  { x: 150, y: 482, w: 260, h: 108, labelKey: "replay.groupSupply", tone: "supply" },
];

type GroupKey =
  | "replay.groupApp"
  | "replay.groupGateway"
  | "replay.groupVendor"
  | "replay.groupSupply";

function nodes(backend: LLMBackend): FlowNode[] {
  return [
    { id: "you", x: 68, y: 250, label: "You", icon: User, tone: "neutral", width: 104 },
    // 应用内部同一竖列对齐: 浏览器 → 后端 → 后端依赖的两样东西。
    // 同 x 的两点之间连线是一条直线, 图就不会到处是斜线。
    {
      id: "web",
      x: 350, y: 88, label: "Next.js", icon: MonitorSmartphone, badge: "UI",
      tags: ["ssr", "rewrite /api"], tone: "app", width: 190,
    },
    {
      id: "api",
      x: 350, y: 214, label: "FastAPI", icon: Server, badge: "APP",
      tags: ["parse", "rag", "analyze"], tone: "app", width: 196,
    },
    {
      id: "guard",
      x: 250, y: 390, label: "input_guard", icon: ShieldCheck, badge: "GUARD",
      tags: ["injection", "pii"], tone: "app", width: 176,
    },
    {
      id: "vec",
      x: 452, y: 390, label: "pgvector", icon: Database, badge: "STORE",
      tags: ["embed", "search"], tone: "app", width: 170,
    },
    // 网关和两个厂商也同一竖列, 让"网关 → 上游"这一跳画成一条直线。
    {
      id: "gw",
      x: 750, y: 140, label: "Envoy AI GW", icon: Globe, badge: "GATEWAY",
      tags: ["routing", "guardrail", "observability"], tone: "gateway", width: 214,
    },
    // 宽度要装得下 "qwen3-coder" + STANDBY 徽章; 176px 会把它截成 "qwen3-co…"
    {
      id: "deepseek",
      x: 750, y: 330, label: "deepseek", icon: Sparkles,
      badge: backend === "deepseek" ? "ACTIVE" : "STANDBY", tone: "vendor", width: 204,
    },
    {
      id: "qwen",
      x: 750, y: 400, label: "qwen3-coder", icon: Sparkles,
      badge: backend === "qwen" ? "ACTIVE" : "STANDBY", tone: "vendor", width: 204,
    },
    {
      id: "koi",
      x: 280, y: 550, label: "Koi", icon: Boxes, badge: "SIDECAR",
      tags: ["advisory", "ci gate"], tone: "supply", width: 190,
    },
  ];
}

type EdgeId =
  | "user-web" | "web-api" | "api-guard" | "api-vec"
  | "api-gw" | "gw-vendor" | "api-koi";

/**
 * 贝塞尔控制点顺着这条边的主方向偏移。
 *
 * 只按水平方向偏移是不行的: 同一竖列的两个节点 (Next.js → FastAPI) 之间会拱出一个
 * 多余的 S 弯, 明明是直上直下的一跳, 画出来像绕了一圈。竖向为主的边就用竖向控制点,
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

// ===== 帧 =====
type Frame = {
  key: string;
  title: string;
  kind: "req" | "guard" | "store" | "route" | "llm" | "res";
  ok: boolean;
  ms?: number;
  nodes: NodeId[];
  edges: EdgeId[];
  rows: [string, string][];
};

const fmtMs = (ms: number) => (ms >= 1000 ? `${(ms / 1000).toFixed(2)} s` : `${ms} ms`);

/** 演示剧本 —— 没有真实请求时用。数字是标注过的示例值, 顶部会挂"演示剧本"标签。 */
export const DEMO_TRACE: ChatTrace = {
  steps: [
    { id: "guard", ok: true, ms: 1, summary: "pass", detail: { verdict: "pass", rules: [] } },
    {
      id: "retrieval", ok: true, ms: 38, summary: "5 chunks",
      detail: {
        top_k: 5, chunks: 5, structured_context: true,
        store: "postgres + pgvector", scores: [0.83, 0.79, 0.74, 0.71, 0.68],
      },
    },
    {
      id: "gateway", ok: true, ms: 0, summary: "deepseek",
      detail: {
        provider: "envoy", url: "http://envoy-ai-gateway:8080/v1/chat/completions",
        "X-LLM-Backend": "deepseek", "X-LLM-Purpose": "log-analysis",
      },
    },
    {
      id: "llm", ok: true, ms: 4120, summary: "deepseek-chat",
      detail: { model: "deepseek-chat", prompt_tokens: 2418, completion_tokens: 386 },
    },
  ],
  total_ms: 4159,
  backend: "deepseek",
  model: "deepseek-chat",
  provider: "envoy",
  prompt_tokens: 2418,
  completion_tokens: 386,
};

export const DEMO_QUESTION = "这份日志里有没有扫描行为？分别来自哪些 IP？";

function buildFrames(
  trace: ChatTrace,
  question: string,
  citations: number,
  t: (k: any) => string,
): Frame[] {
  const vendor: NodeId = trace.backend === "qwen" ? "qwen" : "deepseek";
  const step = (id: TraceStep["id"]) => trace.steps.find((s) => s.id === id);
  const frames: Frame[] = [];

  frames.push({
    key: "in",
    title: t("replay.f.question"),
    kind: "req",
    ok: true,
    nodes: ["you", "web"],
    edges: ["user-web"],
    rows: [["REQ", question || "—"]],
  });

  frames.push({
    key: "post",
    title: t("replay.f.forward"),
    kind: "req",
    ok: true,
    nodes: ["web", "api"],
    edges: ["web-api"],
    rows: [
      ["POST", "/api/chat/query"],
      ["rewrite", "next.config.mjs → http://backend:8000"],
    ],
  });

  const g = step("guard");
  if (g) {
    const rules = (g.detail.rules as string[]) ?? [];
    frames.push({
      key: "guard",
      title: t("replay.f.guard"),
      kind: "guard",
      ok: g.ok,
      ms: g.ms,
      nodes: ["api", "guard"],
      edges: ["api-guard"],
      rows: [
        ["verdict", String(g.detail.verdict ?? g.summary)],
        ["rules", rules.length ? rules.join(", ") : t("common.none")],
        ["module", "app/security/input_guard.py"],
      ],
    });
  }

  const r = step("retrieval");
  if (r) {
    const scores = (r.detail.scores as number[]) ?? [];
    frames.push({
      key: "retrieval",
      title: t("replay.f.retrieval"),
      kind: "store",
      ok: r.ok,
      ms: r.ms,
      nodes: ["api", "vec"],
      edges: ["api-vec"],
      rows: [
        ["chunks", `${r.detail.chunks ?? 0} / top_k ${r.detail.top_k ?? "—"}`],
        ["scores", scores.length ? scores.join("  ") : t("common.none")],
        ["structured", String(r.detail.structured_context ?? false)],
        ["store", String(r.detail.store ?? "pgvector")],
      ],
    });
  }

  const gw = step("gateway");
  if (gw) {
    frames.push({
      key: "gateway",
      title: t("replay.f.route"),
      kind: "route",
      ok: gw.ok,
      ms: gw.ms || undefined,
      nodes: ["api", "gw"],
      edges: ["api-gw"],
      rows: [
        ["provider", String(gw.detail.provider ?? trace.provider)],
        ["X-LLM-Backend", String(gw.detail["X-LLM-Backend"] ?? trace.backend)],
        ["X-LLM-Purpose", String(gw.detail["X-LLM-Purpose"] ?? "log-analysis")],
        ["url", String(gw.detail.url ?? "—")],
      ],
    });
  }

  const llm = step("llm");
  if (llm) {
    // 一次 HTTP 往返拆成"发出"和"返回"两帧: 耗时是整个往返量出来的, 记在返回那一帧,
    // 发出那一帧不写时间 —— 不把一个数字重复算两次。
    frames.push({
      key: "llm-out",
      title: t("replay.f.upstream"),
      kind: "llm",
      ok: true,
      nodes: ["gw", vendor],
      edges: ["gw-vendor"],
      rows: [
        ["model", String(llm.detail.model ?? trace.model)],
        ["key", t("replay.keyInjected")],
      ],
    });
    frames.push({
      key: "llm-in",
      title: t("replay.f.generated"),
      kind: "llm",
      ok: llm.ok,
      ms: llm.ms,
      nodes: [vendor, "gw", "api"],
      edges: ["gw-vendor", "api-gw"],
      rows: [
        ["model", String(llm.detail.model ?? trace.model)],
        [
          "tokens",
          trace.prompt_tokens + trace.completion_tokens === 0
            ? t("trace.unreported")
            : `${trace.prompt_tokens} in / ${trace.completion_tokens} out`,
        ],
      ],
    });
  }

  // 被拦下的请求在这里就结束了 —— 不画"答案返回浏览器", 因为没有答案。
  const blocked = trace.steps.some((s) => !s.ok);
  if (!blocked) {
    frames.push({
      key: "out",
      title: t("replay.f.answer"),
      kind: "res",
      ok: true,
      ms: trace.total_ms,
      nodes: ["api", "web", "you"],
      edges: ["web-api", "user-web"],
      rows: [
        ["citations", String(citations)],
        ["total", fmtMs(trace.total_ms)],
      ],
    });
  }

  return frames;
}

export function ReplayFlow({
  trace,
  question,
  citations,
  live,
}: {
  trace: ChatTrace;
  question: string;
  citations: number;
  live: boolean;
}) {
  const { t } = useI18n();
  const frames = useMemo(
    () => buildFrames(trace, question, citations, t),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [trace, question, citations],
  );
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 换了一次请求就从头放, 否则索引会停在上一条链路的长度上。
  useEffect(() => {
    setI(0);
    setPlaying(true);
  }, [trace]);

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

  const ns = useMemo(() => nodes(trace.backend), [trace.backend]);
  const byId = useMemo(() => Object.fromEntries(ns.map((n) => [n.id, n])) as Record<NodeId, FlowNode>, [ns]);
  const vendor: NodeId = trace.backend === "qwen" ? "qwen" : "deepseek";

  const edges: { id: EdgeId; d: string; dashed?: boolean }[] = useMemo(
    () => [
      { id: "user-web", d: curve(byId.you, byId.web) },
      { id: "web-api", d: curve(byId.web, byId.api) },
      { id: "api-guard", d: curve(byId.api, byId.guard) },
      { id: "api-vec", d: curve(byId.api, byId.vec) },
      { id: "api-gw", d: curve(byId.api, byId.gw) },
      { id: "gw-vendor", d: curve(byId.gw, byId[vendor]) },
      // Koi 是旁路 advisory + CI 门禁, 不在这条请求链上 —— 画成常驻虚线, 永不点亮。
      { id: "api-koi", d: curve(byId.api, byId.koi), dashed: true },
    ],
    [byId, vendor],
  );

  const frame = frames[Math.min(i, frames.length - 1)];
  const activeNodes = new Set(frame.nodes);
  const activeEdges = new Set(frame.edges);

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      {/* 数据来源 —— 真实请求 vs 演示剧本, 这个标签不给关 */}
      <div className="flex flex-wrap items-center gap-3">
        <span
          className={clsx(
            "rounded-full border px-2.5 py-1 text-xs font-medium",
            live ? "border-primary text-primary" : "border-brand-orange text-brand-orange",
          )}
        >
          {live ? t("replay.sourceLive") : t("replay.sourceDemo")}
        </span>
        <span className="text-xs text-muted">
          {live ? t("replay.sourceLiveHint") : t("replay.sourceDemoHint")}
        </span>
        <span className="flex-1" />
        <ConfigChip label="GATEWAY_PROVIDER" value={trace.provider} />
        <ConfigChip label="X-LLM-Backend" value={trace.backend} />
      </div>

      {/* 图和说明卡各占一栏。卡片曾经是浮在图上的绝对定位, 结果把右上角那个分组整块盖住了 ——
          现在给它自己的位置, 两边都不用为对方让路。 */}
      <div className="flex min-h-0 flex-1 gap-4 overflow-auto">
        <div
          className="relative min-w-[720px] flex-1 self-start"
          style={{ aspectRatio: `${W} / ${H}` }}
        >
          {/* 连线层。fill-none + 同一 viewBox, 坐标和下面的 HTML 节点一一对应。 */}
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="absolute inset-0 h-full w-full"
            aria-hidden="true"
          >
            {GROUPS.map((g) => (
              <g key={g.labelKey}>
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
                  {t(g.labelKey).toUpperCase()}
                </text>
              </g>
            ))}

            {edges.map((e) => {
              const on = activeEdges.has(e.id);
              return (
                <path
                  key={e.id}
                  d={e.d}
                  fill="none"
                  strokeLinecap="round"
                  strokeWidth={on ? 2.5 : 1.25}
                  strokeDasharray={e.dashed ? "4 7" : undefined}
                  className={clsx(
                    "transition-all duration-300",
                    on ? "text-primary" : "text-muted",
                  )}
                  stroke="currentColor"
                  opacity={on ? 1 : 0.3}
                />
              );
            })}
          </svg>

          {/* 节点层 */}
          {ns.map((n) => {
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
                  left: `${(n.x / W) * 100}%`,
                  top: `${(n.y / H) * 100}%`,
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
                <span className="ml-auto font-mono text-[11px] text-muted">
                  {fmtMs(frame.ms)}
                </span>
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
      <div className="flex shrink-0 items-center justify-center gap-3 rounded-2xl border border-line bg-card px-4 py-2.5">
        <Ctrl label={t("replay.restart")} onClick={() => { setI(0); setPlaying(false); }}>
          <RotateCcw className="size-4" />
        </Ctrl>
        <Ctrl
          label={t("replay.prev")}
          disabled={i === 0}
          onClick={() => { setPlaying(false); setI((v) => Math.max(0, v - 1)); }}
        >
          <ChevronLeft className="size-5" />
        </Ctrl>
        <button
          type="button"
          aria-label={playing ? t("replay.pause") : t("replay.play")}
          title={playing ? t("replay.pause") : t("replay.play")}
          onClick={() => {
            // 停在最后一帧时点播放 = 从头再放一遍, 否则这个按钮看起来是坏的。
            if (!playing && i >= frames.length - 1) setI(0);
            setPlaying((p) => !p);
          }}
          className="grid size-10 place-items-center rounded-full bg-primary text-white transition hover:brightness-95"
        >
          {playing ? <Pause className="size-5" /> : <Play className="size-5" />}
        </button>
        <Ctrl
          label={t("replay.next")}
          disabled={i >= frames.length - 1}
          onClick={() => { setPlaying(false); setI((v) => Math.min(frames.length - 1, v + 1)); }}
        >
          <ChevronRight className="size-5" />
        </Ctrl>
        <div className="mx-2 h-1.5 w-40 overflow-hidden rounded-full bg-surface sm:w-64">
          <div
            className="h-full rounded-full bg-primary transition-all duration-300"
            style={{ width: `${((i + 1) / frames.length) * 100}%` }}
          />
        </div>
        <span className="font-mono text-xs text-muted">
          {i + 1}/{frames.length}
        </span>
      </div>
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
      title={label}
      className="grid size-8 place-items-center rounded-lg text-muted transition hover:text-ink disabled:opacity-30"
    >
      {children}
    </button>
  );
}

function ConfigChip({ label, value }: { label: string; value: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="font-mono text-[10px] uppercase tracking-wide text-muted">{label}</span>
      <span className="rounded-full border border-primary px-2 py-0.5 font-mono text-[11px] text-primary">
        {value}
      </span>
    </span>
  );
}
