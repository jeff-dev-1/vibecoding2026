"use client";

import {
  Boxes,
  FileCode2,
  Route,
  ShieldCheck,
  Swords,
  Waypoints,
  X,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import {
  AssuranceView,
  GuardrailView,
  ModelsView,
  PromptsView,
  SupplyChainView,
} from "./GatewayPanel";
import { DEMO_QUESTION, DEMO_TRACE, ReplayFlow } from "./ReplayFlow";
import { useI18n, type Key } from "@/lib/i18n";
import type { ChatTrace, GatewayProvider, LLMBackend } from "@/lib/api";

/**
 * 控制面 —— 管理面的家。
 *
 * 为什么单独开一层, 而不是继续挂在首页顶部:
 * 这两块东西的读者不是同一个人。业务面回答"这份日志里有什么", 管理面回答
 * "这套 AI 系统是怎么被管住的"。把七个标签页压在业务页最上方, 等于每次演示
 * "上传→看报告"都要先划过一整屏治理内容, 两边都讲不清楚。
 *
 * 分组按"这件事发生在什么时候"排, 不按实现:
 *   运行时  每一次请求都在发生的 (链路回放 / 模型与用量)
 *   护栏    拦住坏东西的两道闸 (运行时拦坏请求 / 构建期拦坏软件)
 *   验证    上线前跑的 (红队 + 渗透)
 *   配置    平时改的 (提示词)
 */

type SectionId = "replay" | "models" | "guardrail" | "supply" | "assurance" | "prompts";

type Section = { id: SectionId; icon: LucideIcon; labelKey: Key };
type Group = { titleKey: Key; items: Section[] };

// 八项并成五项。合掉的三处都是"分开之后各自不足一屏、而且回答的是同一个问题":
//   模型路由 + 可观测 → 模型与用量 (用哪个模型, 花了多少)
//   红队 + 渗透测试   → 对抗性验证 (上线前用对抗手段打自己)
// 护栏和供应链没有合: 一个拦坏请求 (运行时), 一个拦坏软件 (构建期),
// 这条分界线是整个演示里最值得讲清楚的一条, 合了就糊了。
const GROUPS: Group[] = [
  {
    titleKey: "console.group.runtime",
    items: [
      { id: "replay", icon: Waypoints, labelKey: "console.replay" },
      { id: "models", icon: Route, labelKey: "console.models" },
    ],
  },
  {
    titleKey: "console.group.guardrails",
    items: [
      { id: "guardrail", icon: ShieldCheck, labelKey: "console.guardrail" },
      { id: "supply", icon: Boxes, labelKey: "console.supplyChain" },
    ],
  },
  {
    titleKey: "console.group.assurance",
    items: [{ id: "assurance", icon: Swords, labelKey: "console.assurance" }],
  },
  {
    titleKey: "console.group.config",
    items: [{ id: "prompts", icon: FileCode2, labelKey: "console.prompts" }],
  },
];

export type ControlPlaneProps = {
  open: boolean;
  onClose: () => void;
  section: SectionId;
  onSectionChange: (s: SectionId) => void;
  backend: LLMBackend;
  onBackendChange: (b: LLMBackend) => void;
  /** 网关 provider —— 和 backend 一样是"这次请求怎么走"的一部分, 所以状态提到页面层。 */
  provider: GatewayProvider;
  onProviderChange: (p: GatewayProvider) => void;
  /** 最近一次真实提问的链路。为空时回放器放演示剧本, 并在顶部标注。 */
  trace: ChatTrace | null;
  question: string;
  citations: number;
};

export function ControlPlane({
  open,
  onClose,
  section,
  onSectionChange,
  backend,
  onBackendChange,
  provider,
  onProviderChange,
  trace,
  question,
  citations,
}: ControlPlaneProps) {
  const { t } = useI18n();
  const panel = useRef<HTMLDivElement>(null);

  // Escape 关闭。捕获阶段的监听器 (Menu 里那个) 会先吃掉自己的那次,
  // 所以下拉菜单开着时按 Escape 只关菜单, 再按一次才关这一层。
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", esc);
    // 浮层打开时锁掉背景滚动, 否则滚轮会穿透到下面的业务页。
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", esc);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  useEffect(() => {
    if (open) panel.current?.focus();
  }, [open]);

  if (!open) return null;

  const live = trace !== null;
  const shownTrace = trace ?? DEMO_TRACE;
  const shownQuestion = trace ? question : DEMO_QUESTION;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-bg"
      role="dialog"
      aria-modal="true"
      aria-label={t("console.title")}
      tabIndex={-1}
      ref={panel}
    >
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-line bg-card px-5">
        <span className="text-base font-semibold tracking-tight">{t("console.title")}</span>
        <span className="hidden text-xs text-muted md:inline">{t("console.subtitle")}</span>
        <span className="flex-1" />
        <button
          type="button"
          onClick={onClose}
          aria-label={t("console.close")}
          title={`${t("console.close")} (Esc)`}
          className="grid size-9 place-items-center rounded-xl border border-line text-muted transition hover:border-ink/25 hover:text-ink"
        >
          <X className="size-4" />
        </button>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* 左栏: 分组导航。窄屏收成一列图标, 标题隐藏。 */}
        <nav className="w-14 shrink-0 overflow-y-auto border-r border-line bg-card py-3 sm:w-56">
          {GROUPS.map((g) => (
            <div key={g.titleKey} className="mb-4">
              <div className="mb-1 hidden px-4 font-mono text-[10px] uppercase tracking-[0.12em] text-muted sm:block">
                {t(g.titleKey)}
              </div>
              {g.items.map((item) => {
                const active = section === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onSectionChange(item.id)}
                    aria-current={active ? "page" : undefined}
                    title={t(item.labelKey)}
                    className={clsx(
                      "flex w-full items-center gap-2.5 border-l-2 px-4 py-2 text-left text-sm transition",
                      active
                        ? "border-primary bg-primary/[0.08] font-medium text-primary"
                        : "border-transparent text-muted hover:bg-surface hover:text-ink",
                    )}
                  >
                    <item.icon className="size-4 shrink-0" />
                    <span className="hidden truncate sm:inline">{t(item.labelKey)}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        {/* 右栏: 内容。两张流程图要整块宽度 (图 + 说明卡横着放得下),
            其余板块给一个居中的阅读宽度。 */}
        <div className="min-w-0 flex-1 overflow-y-auto">
          {section === "replay" ? (
            <div className="h-full p-5">
              <ReplayFlow
                trace={shownTrace}
                question={shownQuestion}
                citations={live ? citations : 5}
                live={live}
              />
            </div>
          ) : (
            // 内容不足一屏时整体居中, 而不是顶在上面、底下空一大片。
            // my-auto 在有余量时居中, 内容超高时退回正常流 —— justify-center 会裁掉顶部。
            <div className="flex min-h-full flex-col px-5 py-5">
              <div
                className={clsx(
                  "my-auto w-full",
                  // 供应链页里有一张流程图, 和回放一样需要整块宽度; 其余给阅读宽度。
                  section === "supply" ? "min-w-0" : "mx-auto max-w-5xl",
                )}
              >
              {section === "models" && (
                <ModelsView backend={backend} onBackendChange={onBackendChange} provider={provider} />
              )}
              {section === "guardrail" && (
                <GuardrailView provider={provider} onProviderChange={onProviderChange} />
              )}
              {section === "supply" && <SupplyChainView />}
              {section === "assurance" && <AssuranceView />}
              {section === "prompts" && <PromptsView />}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export type { SectionId as ControlPlaneSection };
