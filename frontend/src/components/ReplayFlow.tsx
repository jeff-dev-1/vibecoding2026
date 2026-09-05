"use client";

import {
  Database,
  Globe,
  MonitorSmartphone,
  Server,
  ShieldCheck,
  Sparkles,
  User,
} from "lucide-react";
import { useMemo } from "react";
import clsx from "clsx";
import {
  ConfigChip,
  FlowPlayer,
  fmtMs,
  type FlowEdge,
  type FlowGroup,
  type FlowNode,
  type Frame,
} from "./FlowPlayer";
import { useI18n } from "@/lib/i18n";
import type { ChatTrace, LLMBackend, TraceStep } from "@/lib/api";

/**
 * 运行时的请求链路回放 —— 「刚才那个问题在这套系统里怎么走的」。
 *
 * 数据来源有两种, 界面上必须能一眼分清:
 *   真实请求  后端 ChatResponse.trace, 每一跳的耗时/用量/路由头都是量出来的
 *   演示剧本  还没人提过问时的占位, 顶部挂"演示剧本"标签
 * 混在一起而不标注是这类演示最容易被客户抓住的地方, 所以标签不给关。
 *
 * 帧从 trace.steps 生成, 不是写死的。被护栏拦下的请求就只有护栏那一帧,
 * 后面几帧根本不存在 —— 因为那几跳确实没有发生。
 *
 * Koi 不在这张图上。它是构建期的门禁, 一个请求永远不会经过它; 画一条永远不亮的
 * 虚线只会让人问"那个东西为什么在那儿、为什么从来不亮"。它在供应链那一页有
 * 自己的流水线图, 那才是它的主场。
 */

const W = 940;
const H = 540;

const GROUPS = (t: (k: any) => string, provider: string): FlowGroup[] => [
  { id: "app", x: 150, y: 30, w: 400, h: 430, label: t("replay.groupApp"), tone: "app" },
  {
    id: "gw",
    x: 606,
    y: 40,
    // Portkey 路径下这个框里多一个 Prisma AIRS 节点, 所以要更高。
    w: 300,
    h: provider === "portkey" ? 250 : 160,
    // 框名点出这是谁家的控制面 —— Envoy 是你自己跑的, Portkey 是厂商的 SaaS。
    label: provider === "portkey" ? t("replay.groupPortkey") : t("replay.groupGateway"),
    tone: "gateway",
  },
  // 厂商框要让开上面的网关框 —— Portkey 路径下网关框里多一个 AIRS 节点, 高到 y=290,
  // 厂商框还留在 322 的话, 里面的节点会骑在框线上 (deepseek 冒出去过)。
  {
    id: "vendor",
    x: 606,
    y: provider === "portkey" ? 322 : 262,
    w: 300,
    h: provider === "portkey" ? 168 : 180,
    label: t("replay.groupVendor"),
    tone: "vendor",
  },
];

function nodes(backend: LLMBackend, provider: string): FlowNode[] {
  return [
    { id: "you", x: 68, y: 226, label: "You", icon: User, tone: "neutral", width: 104 },
    // 应用内部同一竖列对齐: 浏览器 → 后端 → 后端依赖的两样东西。
    // 同 x 的两点之间连线是一条直线, 图就不会到处是斜线。
    {
      id: "web", x: 350, y: 96, label: "Next.js", icon: MonitorSmartphone, badge: "UI",
      tags: ["ssr", "rewrite /api"], tone: "app", width: 190,
    },
    {
      id: "api", x: 350, y: 226, label: "FastAPI", icon: Server, badge: "APP",
      tags: ["parse", "rag", "analyze"], tone: "app", width: 196,
    },
    // 护栏在左、检索在右, 因为链路是从左往右串下去的: 过闸 → 取证据 → 出境去网关。
    //
    // 这一层在两条路径下的职责不同, 标签如实反映:
    //   envoy    注入 + PII 都归它 (网关那层的 Lua filter 是同一套规则的另一份)
    //   portkey  注入交给 AIRS —— 实测本地正则更弱 (放行了 AIRS 拦下的 payload);
    //            但 PII 脱敏只有本地这层能做, 因为它发生在请求**离开你的机器之前*。
    //            AIRS 再强也是等 payload 到了 SaaS 才看到它。这不是冗余, 是边界。
    {
      id: "guard", x: 248, y: 386, label: "input_guard", icon: ShieldCheck, badge: "GUARD",
      tags: provider === "portkey" ? ["pii · pre-egress"] : ["injection", "pii"],
      tone: "app", width: 178,
    },
    {
      id: "vec", x: 452, y: 386, label: "pgvector", icon: Database, badge: "STORE",
      tags: ["embed", "search"], tone: "app", width: 172,
    },
    // 网关和两个厂商同一竖列, 让"网关 → 上游"这一跳画成一条直线。
    //
    // 节点名跟着 provider 走: 切到 Portkey 之后还画着 "Envoy AI GW", 图就和
    // 右边说明卡里的 provider 自相矛盾了。
    {
      id: "gw", x: 756, y: 108,
      label: provider === "portkey" ? "Portkey gateway" : "Envoy AI GW",
      icon: Globe, badge: provider === "portkey" ? "SAAS" : "SELF-HOSTED",
      tags:
        provider === "portkey"
          ? ["routing", "cost", "observability"]
          : ["routing", "guardrail (400)", "observability"],
      tone: "gateway", width: 214,
    },
    // Prisma AIRS 单独画一个节点, 而不是塞成网关上的一个标签。
    //
    // 它是挂在网关上的 inline hook: 请求在到达厂商之前先过它一遍, 命中就回 446。
    // 画成网关的一个 tag 会让人以为"护栏是网关自带的能力"; 实际上它是一个可换的
    // 引擎 (AIRS / Lakera / NeMo 都能挂在这个位置), 这一点值得画出来。
    ...(provider === "portkey"
      ? [
          {
            // 归属标在节点上, 不标在分组框上。
            //
            // 分组框原来叫 "Palo Alto Networks · Portkey", 那是把两家公司写成了一家:
            // Portkey 是独立的网关厂商, Prisma AIRS 是 Palo Alto 的产品, 以 PARTNER
            // check 的形式挂在 Portkey 的护栏配置里。框是 Portkey 的, 引擎是 PANW 的。
            id: "airs" as const, x: 756, y: 222, label: "Prisma AIRS", icon: ShieldCheck,
            badge: "PANW",
            tags: ["injection", "dlp", "toxicity", "redaction"],
            tone: "gateway" as const, width: 214,
          },
        ]
      : []),
    // 宽度要装得下 "qwen3-coder" + STANDBY 徽章; 176px 会把它截成 "qwen3-co…"
    {
      id: "deepseek", x: 756, y: provider === "portkey" ? 388 : 318, label: "deepseek", icon: Sparkles,
      badge: backend === "deepseek" ? "ACTIVE" : "STANDBY", tone: "vendor", width: 200,
    },
    {
      id: "qwen", x: 756, y: provider === "portkey" ? 450 : 388, label: "qwen3-coder", icon: Sparkles,
      badge: backend === "qwen" ? "ACTIVE" : "STANDBY", tone: "vendor", width: 200,
    },
  ];
}

function edges(backend: LLMBackend, provider: string): FlowEdge[] {
  const vendor = backend === "qwen" ? "qwen" : "deepseek";
  // 一条串行的链, 不是从 api 发散出去的三条支路。
  //
  // 之前画成 api→guard、api→vec、api→gw 三条并列的线, 看着像后端同时做了三件事;
  // 实际顺序是: 先过输入护栏 (没过就到此为止), 过了再检索证据, 拿到证据才去调网关。
  // 顺序画丢了, 回放就讲不出"护栏在最前面"这件事。
  return [
    { id: "user-web", from: "you", to: "web" },
    { id: "web-api", from: "web", to: "api" },
    { id: "api-guard", from: "api", to: "guard" },
    { id: "guard-vec", from: "guard", to: "vec" },
    { id: "vec-gw", from: "vec", to: "gw" },
    // Portkey 路径上, 请求先过 AIRS 再出境; Envoy 路径上网关直连上游。
    ...(provider === "portkey"
      ? [
          { id: "gw-airs", from: "gw", to: "airs" },
          { id: "airs-vendor", from: "airs", to: vendor },
        ]
      : [{ id: "gw-vendor", from: "gw", to: vendor }]),
  ];
}

/** 演示剧本 —— 没有真实请求时用。顶部会挂"演示剧本"标签。 */
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
      id: "gateway", ok: true, ms: 0, summary: "pc-hk-dem-975209",
      detail: {
        provider: "portkey", url: "https://api.portkey.ai/v1/chat/completions",
        "x-portkey-config": "pc-hk-dem-975209",
        guardrail: "Prisma AIRS · inline hook (446 = DENY)",
      },
    },
    {
      id: "llm", ok: true, ms: 4120, summary: "deepseek-chat",
      detail: {
        model: "deepseek-chat", prompt_tokens: 2418, completion_tokens: 386,
        answer_language: "zh-Hans",
      },
    },
  ],
  total_ms: 4159,
  backend: "deepseek",
  model: "deepseek-chat",
  // 剧本跟着默认 provider 走 —— 默认是 Portkey, 剧本却演 Envoy 的话,
  // 顶上的 GATEWAY_PROVIDER 徽章和图里画的东西就对不上。
  provider: "portkey",
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
  const vendor = trace.backend === "qwen" ? "qwen" : "deepseek";
  const step = (id: TraceStep["id"]) => trace.steps.find((s) => s.id === id);
  const frames: Frame[] = [];

  frames.push({
    key: "in", title: t("replay.f.question"), ok: true,
    nodes: ["you", "web"], edges: ["user-web"],
    rows: [["REQ", question || "—"]],
  });

  frames.push({
    key: "post", title: t("replay.f.forward"), ok: true,
    nodes: ["web", "api"], edges: ["web-api"],
    rows: [
      ["POST", "/api/chat/query"],
      ["rewrite", "next.config.mjs → http://backend:8000"],
    ],
  });

  const g = step("guard");
  if (g) {
    const rules = (g.detail.rules as string[]) ?? [];
    frames.push({
      key: "guard", title: t("replay.f.guard"), ok: g.ok, ms: g.ms,
      nodes: ["api", "guard"], edges: ["api-guard"],
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
      key: "retrieval", title: t("replay.f.retrieval"), ok: r.ok, ms: r.ms,
      nodes: ["guard", "vec"], edges: ["guard-vec"],
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
      key: "gateway", title: t("replay.f.route"), ok: gw.ok, ms: gw.ms || undefined,
      nodes: ["vec", "gw"], edges: ["vec-gw"],
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
    const outNodes = trace.provider === "portkey" ? ["gw", "airs", vendor] : ["gw", vendor];
    const outEdges =
      trace.provider === "portkey" ? ["gw-airs", "airs-vendor"] : ["gw-vendor"];
    frames.push({
      key: "llm-out", title: t("replay.f.upstream"), ok: true,
      nodes: outNodes, edges: outEdges,
      rows: [
        ["model", String(llm.detail.model ?? trace.model)],
        ["key", t("replay.keyInjected")],
      ],
    });
    frames.push({
      key: "llm-in", title: t("replay.f.generated"), ok: llm.ok, ms: llm.ms,
      nodes: [vendor, "gw"], edges: outEdges,
      rows: [
        ["model", String(llm.detail.model ?? trace.model)],
        [
          "tokens",
          trace.prompt_tokens + trace.completion_tokens === 0
            ? t("trace.unreported")
            : `${trace.prompt_tokens} in / ${trace.completion_tokens} out`,
        ],
        ["language", String(llm.detail.answer_language ?? "—")],
      ],
    });
  }

  // 被拦下的请求在这里就结束了 —— 不画"答案返回浏览器", 因为没有答案。
  const blocked = trace.steps.some((s) => !s.ok);
  if (!blocked) {
    frames.push({
      key: "out", title: t("replay.f.answer"), ok: true, ms: trace.total_ms,
      nodes: ["gw", "api", "web", "you"], edges: ["web-api", "user-web"],
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

  return (
    <FlowPlayer
      width={W}
      height={H}
      groups={GROUPS(t, trace.provider)}
      nodes={nodes(trace.backend, trace.provider)}
      edges={edges(trace.backend, trace.provider)}
      frames={frames}
      resetKey={trace}
      header={
        <div className="flex flex-wrap items-center gap-3">
          {/* 数据来源 —— 真实请求 vs 演示剧本, 这个标签不给关 */}
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
      }
    />
  );
}
