"use client";

import { Boxes, FlaskConical, Search } from "lucide-react";
import { useEffect, useState } from "react";
import clsx from "clsx";
import { SupplyChainFlow } from "./SupplyChainFlow";
import { UsagePanel } from "./UsagePanel";
import { useI18n, type Key } from "@/lib/i18n";
import {
  gatewayInfo,
  gatewayPrompts,
  guardrailTest,
  pentestReport,
  redteamReport,
  supplyChainCheck,
  supplyChainReport,
  supplyChainSamples,
  type GatewayBackend,
  type GatewayInfo,
  type GatewayProvider,
  type GatewayPrompts,
  type GuardrailTestResult,
  type LLMBackend,
  type PentestFinding,
  type PentestReport,
  type RedteamReport,
  type SupplyChainReport,
  type SupplyChainSamples,
  type SupplyChainVerdict,
} from "@/lib/api";

// AI Gateway 控制面的各个板块。
//
// 这些视图原来挤在业务首页顶部的一个七标签面板里。现在业务面和管理面分开了:
// 首页只留"上传→分析→提问", 这些搬进右上角的控制面浮层 (ControlPlane.tsx),
// 每个 export 就是浮层左栏的一项。组件本身没变, 变的是谁来摆放它们。

type Props = {
  backend: LLMBackend;
  onBackendChange: (b: LLMBackend) => void;
};

/**
 * 模型与用量 —— 路由和可观测合并成一页。
 *
 * 拆成两页是个错误: 它们回答的是同一个问题 ("用哪个模型, 花了多少")。
 * 原来要在一个标签页里切换上游, 再跳到另一个标签页看它的账单, 两边对不上号。
 * 现在上面是模型卡, 点哪个就在下面看哪个的用量。
 */
export function ModelsView({ backend, onBackendChange, provider }: Props & { provider: GatewayProvider }) {
  const { t } = useI18n();
  const [info, setInfo] = useState<GatewayInfo | null>(null);
  // 看哪个模型的用量。默认跟随当前路由, 但可以单独点开另一个做对比 ——
  // "切过去之后成本变了多少"正是要看的事。
  const [viewing, setViewing] = useState<string | null>(null);

  useEffect(() => {
    gatewayInfo().then(setInfo).catch(() => {});
  }, []);

  const selected = viewing ?? backend;
  if (!info) return <Loading />;

  return (
    <div className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-2">
        {info.backends.map((b) => (
          <ModelCard
            key={b.id}
            b={b}
            active={backend === b.id}
            selected={selected === b.id}
            onSelect={() => setViewing(b.id)}
            onRoute={() => {
              onBackendChange(b.id as LLMBackend);
              setViewing(b.id);
            }}
          />
        ))}
      </div>
      <p className="text-[11px] text-muted">
        {t("gw.routeNote1")} <code className="font-mono">X-LLM-Backend</code> {t("gw.routeNote2")}
      </p>

      {/* 用量取自 Portkey (厂商计量), 不是本地内存窗口 —— 后者一重启就清零。
          Envoy 路径下没有厂商侧的账, UsagePanel 内部会说明。 */}
      <UsagePanel provider={provider} />
    </div>
  );
}

function ModelCard({
  b, active, selected, onSelect, onRoute,
}: {
  b: GatewayBackend;
  active: boolean;
  selected: boolean;
  onSelect: () => void;
  onRoute: () => void;
}) {
  const { t } = useI18n();
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={clsx(
        "rounded-xl border p-3 text-left transition",
        selected ? "border-primary bg-primary/[0.06]" : "border-line hover:border-ink/25",
      )}
    >
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-ink">{b.label}</span>
        {active && (
          <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[10px] text-primary">
            {t("gw.current")}
          </span>
        )}
        {b.default && (
          <span className="rounded bg-surface px-1.5 py-0.5 text-[10px] text-muted">{t("gw.default")}</span>
        )}
        <span className="flex-1" />
        {!active && (
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation();
              onRoute();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.stopPropagation();
                onRoute();
              }
            }}
            className="rounded-lg border border-line px-2 py-0.5 text-xs text-muted transition hover:border-ink/25 hover:text-ink"
          >
            {t("gw.switch")}
          </span>
        )}
      </div>
      <div className="mt-1 font-mono text-[11px] text-muted">{b.model}</div>
      <div className="font-mono text-[11px] text-muted">↑ {b.upstream}</div>
    </button>
  );
}

/** 护栏 — 现场测试器 + 网关侧规则清单。 */
export function GuardrailView({
  provider,
  onProviderChange,
}: {
  provider: GatewayProvider;
  onProviderChange: (p: GatewayProvider) => void;
}) {
  const { t } = useI18n();
  const [info, setInfo] = useState<GatewayInfo | null>(null);
  useEffect(() => {
    // 跟着选中的 provider 拉 —— 换网关就是换数据面, 护栏清单必须跟着变,
    // 否则界面会印着一份和当前配置无关的静态说明。
    setInfo(null);
    gatewayInfo(provider).then(setInfo).catch(() => {});
  }, [provider]);

  return (
    <div className="space-y-3">
      <ProviderSwitch value={provider} onChange={onProviderChange} />
      <GuardrailTester />
      {!info ? (
        <Loading />
      ) : (
        info.guardrails.map((g) => (
          <div key={g.id} className="rounded-xl border border-line p-3">
            <div className="flex items-center gap-2">
              <span
                className={clsx(
                  "h-2 w-2 rounded-full",
                  g.enabled ? "bg-brand-green" : "bg-line",
                )}
              />
              <span className="text-sm font-medium text-ink">{t(`gr.${g.id}` as Key)}</span>
              <span className="ml-auto rounded bg-surface px-1.5 py-0.5 text-[10px] text-muted">
                {t(`gr.${g.id}.action` as Key)}
              </span>
            </div>
            <div className="mt-1 text-xs text-muted">
              {t(`gr.${g.id}.where` as Key)}
              {/* 配置 id 是事实, 跟在文案后面 —— 它要能拿去和 Portkey 控制台对账。 */}
              {g.config && <span className="font-mono"> · config {g.config}</span>}
              {g.guardrail && <span className="font-mono"> · guardrail {g.guardrail}</span>}
            </div>
            {g.patterns && (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {g.patterns.map((pat) => (
                  <span
                    key={pat}
                    className="rounded bg-brand-red/10 px-1.5 py-0.5 font-mono text-[10px] text-brand-red"
                  >
                    {pat}
                  </span>
                ))}
              </div>
            )}
            {g.categories && (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {g.categories.map((c) => (
                  <span
                    key={c}
                    className="rounded bg-brand-orange/10 px-1.5 py-0.5 font-mono text-[10px] text-brand-orange"
                  >
                    {c}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))
      )}
      <p className="pt-1 text-[11px] text-muted">
        {t("gw.guardNote")}
      </p>
    </div>
  );
}

/**
 * 供应链 (Koi) — 流水线动图 + 本项目门禁报告 + 交互式查询台。
 *
 * 动图放最前面, 因为它回答的是"这道闸在哪、拦住了什么"; 下面的报告和查询台
 * 是这道闸的具体裁定结果。先讲位置, 再看结论。
 */
export function SupplyChainView() {
  const { t } = useI18n();
  return (
    <div className="space-y-5">
      <section>
        <SupplyChainFlow />
      </section>
      <p className="text-[11px] leading-relaxed text-muted">{t("sc.pipelineNote")}</p>
      <ProjectSupplyReport />
      <SupplyChainTester />
    </div>
  );
}

/**
 * 提示词管理 —— 左边目录, 右边正文。
 *
 * 原来是一列全部收起的手风琴: 打开一个要滚到它、看完再收起, 而且两个提示词
 * 没法对着看。提示词是"受管资产"这个说法要成立, 它就得像一份可以翻阅的文档,
 * 而不是八个折叠条。
 */
export function PromptsView() {
  const { t } = useI18n();
  const [prompts, setPrompts] = useState<GatewayPrompts | null>(null);
  const [sel, setSel] = useState<string | null>(null);

  useEffect(() => {
    gatewayPrompts().then(setPrompts).catch(() => {});
  }, []);

  if (!prompts) return <Loading />;

  const all = [
    ...prompts.system_prompts.map((p) => ({ ...p, group: "system" as const })),
    ...prompts.scenario_prompts.map((p) => ({ ...p, group: "scenario" as const })),
  ];
  const current = all.find((p) => p.id === sel) ?? all[0];

  return (
    <div className="space-y-3">
      <div className="grid gap-4 md:grid-cols-[220px_1fr]">
        {/* 目录 */}
        <nav className="space-y-3">
          {(["system", "scenario"] as const).map((g) => {
            const items = all.filter((p) => p.group === g);
            if (items.length === 0) return null;
            return (
              <div key={g}>
                <div className="mb-1 px-1 font-mono text-[10px] uppercase tracking-[0.12em] text-muted">
                  {g === "system" ? "system" : `scenario (${items.length})`}
                </div>
                <div className="space-y-0.5">
                  {items.map((p) => {
                    const active = current?.id === p.id;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setSel(p.id)}
                        aria-current={active ? "true" : undefined}
                        className={clsx(
                          "block w-full truncate rounded-lg px-2.5 py-1.5 text-left text-sm transition",
                          active
                            ? "bg-primary/10 font-medium text-primary"
                            : "text-muted hover:bg-surface hover:text-ink",
                        )}
                      >
                        {p.label || p.title || p.id}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </nav>

        {/* 正文 */}
        {current && (
          // 目录有 16 条, 正文框被 grid 拉到和目录一样高 (~765px), 而里面的 pre
          // 卡在 max-h-[440px] —— 于是框底下有 300 多 px 是任何内容都填不到的死区。
          // 改成 flex 列 + pre 撑满剩余高度: 框有多高, 可读区就有多高, 长提示词也
          // 在框内滚, 而不是在框中间截断后留一段空白。
          <article className="flex min-w-0 flex-col rounded-xl border border-line">
            <header className="flex shrink-0 items-center gap-2 border-b border-line px-4 py-2.5">
              <span className="text-sm font-semibold text-ink">
                {current.label || current.title || current.id}
              </span>
              <code className="font-mono text-[10px] text-muted">{current.id}</code>
              <span className="flex-1" />
              <CopyBtn text={current.content} />
            </header>
            <pre className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap px-4 py-3 font-mono text-[12px] leading-relaxed text-ink">
              {current.content}
            </pre>
          </article>
        )}
      </div>

      <p className="text-[11px] text-muted">
        {t("gw.promptNote")}
      </p>
    </div>
  );
}

/** 复制提示词原文 —— 讲师要把它贴进 PPT 或另一个工程里。 */
function CopyBtn({ text }: { text: string }) {
  const { t } = useI18n();
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard.writeText(text);
        setDone(true);
        setTimeout(() => setDone(false), 1200);
      }}
      className="rounded-lg border border-line px-2 py-0.5 text-[11px] text-muted transition hover:border-ink/25 hover:text-ink"
    >
      {done ? t("gw.copied") : t("gw.copy")}
    </button>
  );
}

/**
 * 对抗性验证 —— 红队和渗透测试合并成一页。
 *
 * 分成两页时各自只有一屏不到的内容, 底下全是空白; 而它们本来就是一件事的两半:
 * 上线前用对抗性手段去打自己。区别只在打哪一面 —— 红队打模型行为,
 * 渗透打运行时的 HTTP 面。放在一起, 这个区别反而看得更清楚。
 */
export function AssuranceView() {
  const { t } = useI18n();
  const [redteam, setRedteam] = useState<RedteamReport | null>(null);
  const [pentest, setPentest] = useState<PentestReport | null>(null);
  useEffect(() => {
    redteamReport().then(setRedteam).catch(() => {});
    pentestReport().then(setPentest).catch(() => {});
  }, []);

  return (
    <div className="space-y-6">
      <section>
        <div className="mb-2 flex items-baseline gap-2">
          <h3 className="text-sm font-semibold text-ink">{t("gw.redteamTitle")}</h3>
          <span className="text-[11px] text-muted">{t("gw.redteamSub")}</span>
        </div>
        <RedteamView report={redteam} />
      </section>

      <section>
        <div className="mb-2 flex items-baseline gap-2">
          <h3 className="text-sm font-semibold text-ink">{t("gw.pentestTitle")}</h3>
          <span className="text-[11px] text-muted">{t("gw.pentestSub")}</span>
        </div>
        <PentestView report={pentest} />
      </section>

      <p className="text-[11px] text-muted">
        {t("gw.assuranceNote")}
      </p>
    </div>
  );
}

function Loading() {
  // 骨架而不是"加载中…"三个字: 后者在一个空页面正中间, 看起来像卡住了。
  return (
    <div className="animate-pulse space-y-2" aria-busy="true">
      <div className="h-16 rounded-xl bg-surface" />
      <div className="h-16 rounded-xl bg-surface" />
      <div className="h-16 rounded-xl bg-surface" />
    </div>
  );
}

function RedteamView({ report }: { report: RedteamReport | null }) {
  const { t } = useI18n();
  if (!report || report.empty) {
    return (
      <div className="rounded-xl border border-dashed border-line px-4 py-3 text-sm text-muted">
        {t("gw.noRedteam")} <code className="font-mono text-ink">make redteam</code>
        {t("gw.noRedteam2")}
      </div>
    );
  }
  const overall = Math.round(report.overall_pass_rate * 100);
  const meet = overall >= 85;
  return (
    <div className="space-y-3">
      {/* 总通过率 */}
      <div className="rounded-lg border border-line p-3">
        <div className="mb-1 flex items-center justify-between">
          <span className="text-xs text-muted">{t("gw.passRate")}</span>
          <span className={clsx("text-xs font-medium", meet ? "text-brand-green" : "text-brand-orange")}>
            {meet ? t("gw.meets") : t("gw.notMeets")}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <div className="h-3 flex-1 overflow-hidden rounded-full bg-surface">
            <div
              className={clsx("h-full rounded-full", meet ? "bg-brand-green" : "bg-brand-orange")}
              style={{ width: `${overall}%` }}
            />
          </div>
          <span className="font-mono text-lg font-semibold text-ink">{overall}%</span>
        </div>
        <div className="mt-1 text-[11px] text-muted">
          {report.passed}/{report.total} {t("gw.passed")} · {report.tool}
          {report.created_at && ` · ${new Date(report.created_at).toLocaleString("zh-CN")}`}
        </div>
      </div>

      {/* 按类别 */}
      <div className="rounded-lg border border-line p-3">
        <div className="mb-2 text-xs font-medium text-muted">{t("gw.byCategory")}</div>
        <div className="space-y-2">
          {report.categories.map((c) => {
            const pct = Math.round(c.pass_rate * 100);
            return (
              <div key={c.category} className="flex items-center gap-2 text-xs">
                <span className="w-16 text-muted">{c.category}</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface">
                  <div
                    className={clsx(
                      "h-full rounded-full",
                      pct >= 85 ? "bg-brand-green" : pct >= 60 ? "bg-brand-orange" : "bg-brand-red",
                    )}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="w-20 text-right font-mono text-muted">
                  {pct}% ({c.passed}/{c.total})
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* 失败用例 */}
      {report.failures.length > 0 && (
        <div className="rounded-lg border border-brand-red/30 bg-brand-red/10 p-3">
          <div className="mb-2 text-xs font-medium text-brand-red">
            {t("gw.failures")} ({report.failures.length}) — {t("gw.failuresNeedAttention")}
          </div>
          <ul className="space-y-1.5">
            {report.failures.map((f, i) => (
              <li key={i} className="text-xs">
                <div className="flex items-center gap-1.5">
                  <span className="rounded bg-brand-red/20 px-1 text-[10px] text-brand-red">
                    {f.category}
                  </span>
                  <span className="text-muted">
                    {t("gw.expected")} {f.expected} → {t("gw.actual")} {f.actual}
                  </span>
                </div>
                <div className="font-mono text-[11px] text-muted">{f.payload}</div>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] text-muted">
            {t("gw.failureNote")}
          </p>
        </div>
      )}
    </div>
  );
}

// 渗透测试 (DAST) — ZAP + Nuclei: 测运行中的 HTTP 应用面 (red team 测的是 LLM 行为)
const RISK_BAR: Record<string, string> = {
  High: "bg-brand-red",
  Medium: "bg-brand-orange",
  Low: "bg-brand-blue",
  Info: "bg-muted",
};
const RISK_CHIP: Record<string, string> = {
  High: "bg-brand-red/20 text-brand-red",
  Medium: "bg-brand-orange/20 text-brand-orange",
  Low: "bg-brand-blue/20 text-brand-blue",
  Info: "bg-surface text-muted",
};
const RISK_ORDER = ["High", "Medium", "Low", "Info"];

function PentestView({ report }: { report: PentestReport | null }) {
  const { t } = useI18n();
  if (!report || report.empty) {
    return (
      <div className="rounded-lg border border-dashed border-line p-6 text-center text-sm text-muted">
        {t("gw.noPentest")} <code className="font-mono text-ink">make pentest</code>{" "}
        {t("gw.noPentest2")}
      </div>
    );
  }
  const meet = report.high === 0 && report.medium === 0;
  const maxCount = Math.max(1, ...RISK_ORDER.map((r) => report.counts[r] || 0));
  return (
    <div className="space-y-3">
      {/* 总览 */}
      <div className="rounded-lg border border-line p-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs text-muted">
            {t("gw.dastOverview")} <code className="text-muted">{report.target}</code>
          </span>
          <span className={clsx("text-xs font-medium", meet ? "text-brand-green" : "text-brand-red")}>
            {meet ? t("gw.meetsDast") : `${report.high} High · ${report.medium} Medium`}
          </span>
        </div>
        <div className="grid grid-cols-4 gap-2">
          {RISK_ORDER.map((r) => (
            <div key={r} className="rounded-md bg-surface p-2 text-center">
              <div className={clsx("text-lg font-semibold", r === "High" ? "text-brand-red" : r === "Medium" ? "text-brand-orange" : "text-ink")}>
                {report.counts[r] || 0}
              </div>
              <div className="text-[10px] text-muted">{r}</div>
            </div>
          ))}
        </div>
        <div className="mt-2 text-[11px] text-muted">
          {t("gw.totalItems")} {report.total} {t("gw.items")} · {t("gw.scanners")}:{" "}
          {report.tools.join(", ") || "—"} · {report.tool}
          {report.created_at && ` · ${new Date(report.created_at).toLocaleString("zh-CN")}`}
        </div>
      </div>

      {/* 按风险分级条形 */}
      <div className="rounded-lg border border-line p-3">
        <div className="mb-2 text-xs font-medium text-muted">{t("gw.byRisk")}</div>
        <div className="space-y-2">
          {RISK_ORDER.map((r) => {
            const n = report.counts[r] || 0;
            return (
              <div key={r} className="flex items-center gap-2 text-xs">
                <span className="w-14 text-muted">{r}</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface">
                  <div className={clsx("h-full rounded-full", RISK_BAR[r])} style={{ width: `${(n / maxCount) * 100}%` }} />
                </div>
                <span className="w-8 text-right font-mono text-muted">{n}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* 发现列表 (High/Medium 优先) */}
      {report.findings.length > 0 && (
        <div className="rounded-lg border border-line p-3">
          <div className="mb-2 text-xs font-medium text-muted">
            {t("gw.findings")} ({report.findings.length})
          </div>
          <FindingList findings={report.findings} />
        </div>
      )}

      <p className="text-[11px] text-muted">
        {t("gw.pentestNote")}
      </p>
    </div>
  );
}

const VERDICT_STYLE: Record<string, string> = {
  PASS: "bg-brand-green/10 text-brand-green ring-brand-green/30",
  BLOCKED: "bg-brand-red/10 text-brand-red ring-brand-red/30",
  REDACTED: "bg-brand-orange/10 text-brand-orange ring-brand-orange/30",
};

// 示例 payload 也跟着界面语言走 —— 英文界面下弹出中文示例, 讲师现场没法用。
const SAMPLE_KEYS: Key[] = ["gs.injection", "gs.pii", "gs.jailbreak", "gs.normal"];

/**
 * 渗透测试的发现明细。
 *
 * 原来是 23 条拉平的列表, 而其中 20 条是 Info 级的例行提示 (banner 泄露、
 * DNS rebinding 之类), 3 条真正要看的 Low 被埋在里面。按风险等级分组,
 * 高的在上且默认展开, Info 默认收起 —— 演示时先看到的是需要处理的那几条。
 */
function FindingList({ findings }: { findings: PentestFinding[] }) {
  const groups = RISK_ORDER.map((r) => ({
    risk: r,
    items: findings.filter((f) => f.risk === r),
  })).filter((g) => g.items.length > 0);

  return (
    <div className="space-y-2">
      {groups.map((g) => (
        <FindingGroup key={g.risk} risk={g.risk} items={g.items} />
      ))}
    </div>
  );
}

function FindingGroup({ risk, items }: { risk: string; items: PentestFinding[] }) {
  const { t } = useI18n();
  // Info 是噪声, 默认收起; High/Medium/Low 是要看的, 默认展开。
  const [open, setOpen] = useState(risk !== "Info");
  return (
    <div className="overflow-hidden rounded-xl border border-line">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 bg-surface/60 px-3 py-2 text-left transition hover:bg-surface"
      >
        <span className={clsx("rounded px-1.5 py-0.5 text-[10px] font-medium", RISK_CHIP[risk])}>
          {risk}
        </span>
        <span className="text-xs text-muted">
          {items.length} {t("gw.items")}
        </span>
        <span className="flex-1" />
        <span className="font-mono text-[10px] text-muted">{open ? "−" : "+"}</span>
      </button>
      {open && (
        <ul className="divide-y divide-line">
          {items.map((f, i) => (
            <li key={i} className="grid grid-cols-[1fr_auto] items-start gap-3 px-3 py-2">
              <div className="min-w-0">
                <div className="text-[13px] leading-snug text-ink">{f.name}</div>
                {f.url && (
                  <div className="mt-0.5 truncate font-mono text-[10px] text-muted">{f.url}</div>
                )}
              </div>
              {/* 来源和 CWE 靠右对齐成一列, 每行的元数据落在同一个位置上, 好扫读 */}
              <div className="flex shrink-0 items-center gap-1.5 pt-0.5">
                {f.count > 1 && (
                  <span className="font-mono text-[10px] text-muted">×{f.count}</span>
                )}
                {f.cwe && (
                  <span className="rounded bg-surface px-1.5 py-0.5 font-mono text-[10px] text-muted">
                    {f.cwe}
                  </span>
                )}
                <span className="rounded bg-surface px-1.5 py-0.5 font-mono text-[10px] text-muted">
                  {f.source}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * 网关 provider 切换。
 *
 * 这不是一个"设置项", 是演示的一个论点: 换网关就是换数据面, 护栏跟着换位置。
 *   envoy    自建。护栏是网关进程里的 Lua filter, 配置在本仓库, 可 diff 可回滚。
 *   portkey  托管。护栏挂在厂商控制台的 pc-/pg- 配置上 (可接 Prisma AIRS)。
 * 两边 backend 都不持有厂商 key —— 相同的那一条, 恰恰是网关存在的理由。
 */
function ProviderSwitch({
  value,
  onChange,
}: {
  value: GatewayProvider;
  onChange: (p: GatewayProvider) => void;
}) {
  const { t } = useI18n();
  return (
    <div className="rounded-xl border border-line p-3">
      <div className="flex flex-wrap items-center gap-3">
        <nav className="flex gap-1 rounded-xl bg-surface p-1">
          {(["envoy", "portkey"] as GatewayProvider[]).map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => onChange(id)}
              aria-pressed={value === id}
              className={clsx(
                "rounded-lg px-3 py-1 text-xs font-medium transition",
                value === id ? "bg-card text-primary shadow-sm" : "text-muted hover:text-ink",
              )}
            >
              {t(`pv.${id}` as Key)}
            </button>
          ))}
        </nav>
        <span className="rounded-full border border-line px-2 py-0.5 font-mono text-[11px] text-muted">
          {t(`pv.${value}.kind` as Key)}
        </span>
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-muted">{t(`pv.${value}.note` as Key)}</p>
    </div>
  );
}

function GuardrailTester() {
  const { t } = useI18n();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<GuardrailTestResult | null>(null);

  async function run(payload?: string) {
    const t = payload ?? text;
    if (!t.trim()) return;
    if (payload) setText(payload);
    setBusy(true);
    try {
      setRes(await guardrailTest(t));
    } catch {
      setRes(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-dashed border-line bg-surface/60 p-3">
      <div className="mb-2 text-xs font-medium text-muted">
        🧪 {t("gw.guardTester")}
      </div>
      <div className="flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && run()}
          placeholder={t("gw.guardPlaceholder")}
          className="flex-1 rounded border border-line px-2.5 py-1.5 text-sm focus:border-primary focus:outline-none"
        />
        <button
          onClick={() => run()}
          disabled={busy}
          className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-white transition hover:brightness-95 disabled:opacity-40"
        >
          {busy ? "…" : t("gw.test")}
        </button>
      </div>
      <div className="mt-1.5 flex flex-wrap gap-1">
        {SAMPLE_KEYS.map((k) => t(k)).map((s) => (
          <button
            key={s}
            onClick={() => run(s)}
            className="rounded-full bg-card px-2 py-0.5 text-[11px] text-muted ring-1 ring-line hover:text-ink"
          >
            {s.length > 24 ? s.slice(0, 24) + "…" : s}
          </button>
        ))}
      </div>

      {res && (
        <div className={clsx("mt-2 rounded p-2.5 text-sm ring-1", VERDICT_STYLE[res.verdict])}>
          <div className="flex items-center gap-2">
            <span className="font-bold">{res.verdict}</span>
            {res.verdict === "PASS" && <span className="text-xs">{t("gw.toModel")}</span>}
            {res.verdict === "BLOCKED" && <span className="text-xs">{t("gw.rejected")}</span>}
            {res.verdict === "REDACTED" && <span className="text-xs">{t("gw.redactedThen")}</span>}
          </div>
          {res.verdict === "PASS" && /[一-鿿]/.test(text) && /(dan|没有任何限制|忽略|越狱|系统提示)/i.test(text) && (
            <div className="mt-1.5 rounded bg-card/70 p-1.5 text-[11px] text-muted">
              {t("gw.counterExample")}<strong>{t("gw.notBlocked")}</strong>
              {t("gw.counterExample2")}
            </div>
          )}
          {res.matched_rules.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1">
              {res.matched_rules.map((r, i) => (
                <span key={i} className="rounded bg-card/70 px-1.5 py-0.5 font-mono text-[11px]">
                  {r}
                </span>
              ))}
            </div>
          )}
          {res.redacted_preview && (
            <pre className="mt-1.5 whitespace-pre-wrap rounded bg-card/70 p-1.5 text-[11px]">
              {res.redacted_preview}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

const SC_STYLE: Record<string, { ring: string; label: string; hintKey: Key }> = {
  BLOCK: { ring: "bg-brand-red/10 text-brand-red ring-brand-red/30", label: "BLOCK", hintKey: "gw.hintBlock" as const },
  REQUEST_APPROVAL: { ring: "bg-brand-orange/10 text-brand-orange ring-brand-orange/30", label: "REQUEST-APPROVAL", hintKey: "gw.hintApproval" as const },
  PASS: { ring: "bg-brand-green/10 text-brand-green ring-brand-green/30", label: "PASS", hintKey: "gw.hintPass" as const },
};

function ProjectSupplyReport() {
  const { t } = useI18n();
  const [rep, setRep] = useState<SupplyChainReport | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    supplyChainReport().then(setRep).catch(() => {});
  }, []);

  if (!rep) return null;
  if (rep.empty) {
    return (
      <div className="rounded-lg border border-dashed border-line p-4 text-center text-xs text-muted">
        {t("gw.noSupplyReport")} <code className="font-mono text-ink">make supply-scan</code>{" "}
        {t("gw.noSupplyReport2")}
      </div>
    );
  }
  const pass = rep.gate === "pass";
  return (
    <div className="rounded-lg border border-line bg-card">
      <div className="flex items-center gap-2 border-b border-line px-3 py-2">
        <span className="flex items-center gap-1.5 text-sm font-semibold text-ink">
          <Boxes className="size-4 text-muted" />
          {t("gw.supplyReport")}
        </span>
        <span
          className={clsx(
            "rounded-full px-2 py-0.5 text-[10px] font-medium",
            pass ? "bg-brand-green/10 text-brand-green" : "bg-brand-red/10 text-brand-red",
          )}
        >
          {pass ? t("gw.gatePass") : t("gw.gateFail")}
        </span>
        <span className="ml-auto text-[10px] text-muted">
          {rep.koi_enabled ? t("gw.koiLive") : t("gw.koiOffline")}
          {rep.created_at && ` · ${new Date(rep.created_at).toLocaleString("zh-CN")}`}
        </span>
      </div>
      <div className="space-y-2 p-3">
        <div className="flex flex-wrap gap-2 text-[11px]">
          <span className="rounded bg-brand-green/10 px-2 py-0.5 text-brand-green">PASS {rep.counts.PASS ?? 0}</span>
          <span className="rounded bg-brand-orange/10 px-2 py-0.5 text-brand-orange">
            {t("gw.approved")} {rep.approved.length}
          </span>
          <span className="rounded bg-brand-orange/10 px-2 py-0.5 text-brand-orange">
            {t("gw.needsApproval")} {rep.needs_approval.length}
          </span>
          <span className="rounded bg-brand-red/10 px-2 py-0.5 text-brand-red">BLOCK {rep.counts.BLOCK ?? 0}</span>
          <span className="rounded bg-surface px-2 py-0.5 text-muted">
            {t("gw.total")} {rep.total}
          </span>
        </div>
        {rep.blocked.length > 0 && (
          <div className="text-[11px] text-brand-red">{t("gw.blocked")}: {rep.blocked.join(", ")}</div>
        )}
        {rep.needs_approval.length > 0 && (
          <div className="text-[11px] text-brand-orange">
            {t("gw.needsApproval")}: {rep.needs_approval.join(", ")}
          </div>
        )}
        <button onClick={() => setOpen(!open)} className="text-[11px] text-primary">
          {open ? t("gw.collapse") : `${t("gw.expandAll")} ${rep.items.length} ${t("gw.artifacts")}`}
        </button>
        {open && (
          <div className="max-h-60 overflow-auto rounded border border-line">
            <table className="w-full text-[11px]">
              <tbody>
                {rep.items.map((it, i) => (
                  <tr key={i} className="border-b border-line">
                    <td className="px-2 py-1 font-mono text-muted">
                      {it.marketplace}/{it.item_id}
                    </td>
                    <td className="px-2 py-1">
                      <span className={clsx("rounded px-1.5 py-0.5 text-[10px] ring-1", SC_STYLE[it.state]?.ring)}>
                        {it.state === "REQUEST_APPROVAL" && it.approved ? "APPROVED" : SC_STYLE[it.state]?.label}
                      </span>
                    </td>
                    <td className="px-2 py-1 text-right font-mono text-muted">
                      {it.risk != null ? `${it.risk.toFixed(1)} (${it.risk_level})` : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-[11px] text-muted">
          {t("gw.supplyNote")}
        </p>
      </div>
    </div>
  );
}

/**
 * 现场能点的示例制品。
 *
 * 原来这几个只从 /gateway/supply-samples 来, 后端拿不到就一个都不显示 —— 于是
 * 演示时面对一个空输入框, 没人知道该敲什么。示例是演示的一部分, 不该依赖一次网络请求,
 * 所以这里兜底一份; 接口有返回时优先用接口的。
 */
const FALLBACK_SAMPLES: { marketplace: string; item_id: string; label: string }[] = [
  { marketplace: "pypi", item_id: "requests", label: "pypi · requests" },
  { marketplace: "npm", item_id: "express", label: "npm · express" },
  { marketplace: "mcp", item_id: "upstash/context7", label: "MCP · upstash/context7" },
  { marketplace: "huggingface", item_id: "meta-llama/Llama-3.2-3B", label: "HF · Llama-3.2-3B" },
  { marketplace: "vscode", item_id: "ms-python.python", label: "vscode · ms-python.python" },
];

function SupplyChainTester() {
  const { t } = useI18n();
  const [meta, setMeta] = useState<SupplyChainSamples | null>(null);
  const [marketplace, setMarketplace] = useState("pypi");
  const [itemId, setItemId] = useState("");
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<SupplyChainVerdict | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    supplyChainSamples()
      .then((m) => {
        setMeta(m);
        if (m.marketplaces[0]) setMarketplace(m.marketplaces[0].id);
      })
      .catch(() => {});
  }, []);

  async function run(mk?: string, id?: string) {
    const m = mk ?? marketplace;
    const i = (id ?? itemId).trim();
    if (!i) return;
    if (mk) setMarketplace(mk);
    if (id) setItemId(id);
    setBusy(true);
    setErr(null);
    try {
      setRes(await supplyChainCheck({ marketplace: m, item_id: i }));
    } catch (e) {
      setRes(null);
      setErr(e instanceof Error ? e.message : t("gw.reqFailed"));
    } finally {
      setBusy(false);
    }
  }

  const risk = res?.risk ?? null;
  const pct = risk == null ? 0 : Math.round((risk / 10) * 100);

  return (
    <div className="space-y-2">
      <div className="rounded-lg border border-dashed border-line bg-surface/60 p-3">
        <div className="mb-2 text-xs font-medium text-muted">
          <Search className="mr-1 inline size-3.5 align-[-2px] text-muted" />
          {t("gw.koidex")}
          {meta && (
            <span
              className={clsx(
                "ml-2 rounded-full px-2 py-0.5 text-[10px]",
                meta.enabled ? "bg-brand-green/10 text-brand-green" : "bg-line text-muted",
              )}
            >
              {meta.enabled ? t("gw.koiOn") : t("gw.koiOff")}
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <select
            value={marketplace}
            onChange={(e) => setMarketplace(e.target.value)}
            className="rounded border border-line px-2 py-1.5 text-sm focus:border-primary focus:outline-none"
          >
            {(meta?.marketplaces ?? [{ id: "pypi", label: "PyPI" }]).map((m) => (
              <option key={m.id} value={m.id}>
                {t(`mk.${m.id}` as Key)}
              </option>
            ))}
          </select>
          <input
            value={itemId}
            onChange={(e) => setItemId(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && run()}
            placeholder={t("gw.itemPlaceholder")}
            className="flex-1 rounded border border-line px-2.5 py-1.5 text-sm focus:border-primary focus:outline-none"
          />
          <button
            onClick={() => run()}
            disabled={busy}
            className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-white transition hover:brightness-95 disabled:opacity-40"
          >
            {busy ? t("gw.checking") : t("gw.check")}
          </button>
        </div>
        {/* 示例跟着上面选中的 marketplace 走 —— 切到 npm 还列着 pypi 的包, 点下去
            又把下拉框改回 pypi, 看起来像坏了。该 marketplace 没有样例时才回落到全部。 */}
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] text-muted">{t("gw.tryThese")}</span>
          {(() => {
            const all = meta?.samples?.length ? meta.samples : FALLBACK_SAMPLES;
            const forThis = all.filter((x) => x.marketplace === marketplace);
            return forThis.length ? forThis : all;
          })().map((s) => (
            <button
              key={s.label}
              type="button"
              onClick={() => run(s.marketplace, s.item_id)}
              disabled={busy}
              className="rounded-full border border-line bg-card px-2.5 py-1 text-[11px] text-muted transition hover:border-primary hover:text-primary disabled:opacity-50"
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {err && (
        <div className="rounded-lg border border-brand-red/30 bg-brand-red/10 p-2.5 text-xs text-brand-red">
          {err}
        </div>
      )}

      {res && (
        <div className={clsx("rounded-lg p-3 text-sm ring-1", SC_STYLE[res.state]?.ring)}>
          <div className="flex items-center gap-2">
            <span className="font-bold">{SC_STYLE[res.state]?.label}</span>
            <span className="text-xs">
              {SC_STYLE[res.state] ? t(SC_STYLE[res.state].hintKey) : ""}
            </span>
            <span
              className={clsx(
                "ml-auto rounded px-1.5 py-0.5 text-[10px]",
                res.source === "koi" ? "bg-card/70 text-muted" : "bg-line text-muted",
              )}
            >
              {res.source === "koi" ? t("gw.koiLive") : t("gw.koiOffline")}
            </span>
          </div>
          <div className="mt-1 text-xs text-muted">
            {res.item_display_name || res.item_id}
            {res.version ? ` @ ${res.version}` : ""} · {res.marketplace}
          </div>

          {risk != null && (
            <div className="mt-2 flex items-center gap-2">
              <span className="text-[11px] text-muted">{t("gw.riskScore")}</span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-card/70">
                <div
                  className={clsx(
                    "h-full rounded-full",
                    risk >= 7 ? "bg-brand-red" : risk >= 4 ? "bg-brand-orange" : "bg-brand-green",
                  )}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="font-mono text-xs text-muted">
                {risk.toFixed(1)}/10 {res.risk_level ? `(${res.risk_level})` : ""}
              </span>
            </div>
          )}

          {res.ai_risk_summary && (
            <div className="mt-2 rounded bg-card/60 p-2 text-[11px] leading-relaxed text-muted">
              {res.ai_risk_summary}
            </div>
          )}

          {res.findings.length > 0 && (
            <ul className="mt-2 space-y-1">
              {res.findings.map((f, i) => (
                <li key={i} className="rounded bg-card/60 p-1.5 text-[11px]">
                  <span className="font-medium text-ink">{f.finding_name}</span>
                  <span className="ml-1 rounded bg-surface px-1 text-[10px] text-muted">
                    {f.severity}
                  </span>
                  {f.evidence && <div className="mt-0.5 text-muted">{f.evidence}</div>}
                </li>
              ))}
            </ul>
          )}

          {res.note && <div className="mt-2 text-[11px] text-muted">{res.note}</div>}
        </div>
      )}

      <p className="pt-1 text-[11px] text-muted">
        {t("gw.twoGates1")}<strong>{t("gw.badRequests")}</strong>
        {t("gw.twoGates2")}<strong>{t("gw.badSoftware")}</strong>
        {t("gw.twoGates3")}
      </p>
    </div>
  );
}

function PromptCard({ title, content }: { title: string; content: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-lg border border-line bg-surface/50">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-3 py-2 text-left"
      >
        <span className="text-sm text-ink">{title}</span>
        <span className="text-xs text-muted">{open ? "−" : "+"}</span>
      </button>
      {open && (
        <pre className="overflow-x-auto whitespace-pre-wrap border-t border-line px-3 py-2 text-xs leading-relaxed text-muted">
          {content}
        </pre>
      )}
    </div>
  );
}
