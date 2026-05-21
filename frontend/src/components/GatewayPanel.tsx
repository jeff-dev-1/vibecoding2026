"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";
import {
  gatewayInfo,
  gatewayPrompts,
  type GatewayInfo,
  type GatewayPrompts,
  type LLMBackend,
} from "@/lib/api";

// AI Gateway 控制面 — 对应 PPT Slide 38:
// 模型路由 (DeepSeek↔Qwen) + 提示词管理 + Guardrail 状态

type Props = {
  backend: LLMBackend;
  onBackendChange: (b: LLMBackend) => void;
};

export function GatewayPanel({ backend, onBackendChange }: Props) {
  const [info, setInfo] = useState<GatewayInfo | null>(null);
  const [prompts, setPrompts] = useState<GatewayPrompts | null>(null);
  const [tab, setTab] = useState<"routing" | "guardrail" | "prompts">("routing");

  useEffect(() => {
    gatewayInfo().then(setInfo).catch(() => {});
    gatewayPrompts().then(setPrompts).catch(() => {});
  }, []);

  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="text-base">🚪</span>
          <span className="text-sm font-semibold text-slate-700">Envoy AI Gateway 控制面</span>
          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-600">
            ● 在线
          </span>
        </div>
        {/* 当前模型快切 */}
        <div className="flex items-center gap-1.5 rounded-lg bg-slate-100 p-0.5">
          {(["deepseek", "qwen"] as LLMBackend[]).map((b) => (
            <button
              key={b}
              onClick={() => onBackendChange(b)}
              className={clsx(
                "rounded-md px-3 py-1 text-xs font-medium transition",
                backend === b
                  ? "bg-white text-indigo-600 shadow-sm"
                  : "text-slate-500 hover:text-slate-700",
              )}
            >
              {b === "deepseek" ? "DeepSeek" : "Qwen3-Coder"}
            </button>
          ))}
        </div>
      </div>

      {/* tabs */}
      <div className="flex gap-4 border-b border-slate-100 px-4 text-xs">
        {[
          ["routing", "模型路由"],
          ["guardrail", "Guardrail"],
          ["prompts", "提示词管理"],
        ].map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id as typeof tab)}
            className={clsx(
              "border-b-2 py-2 font-medium transition",
              tab === id
                ? "border-indigo-500 text-indigo-600"
                : "border-transparent text-slate-400 hover:text-slate-600",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="p-4">
        {/* 模型路由 */}
        {tab === "routing" && info && (
          <div className="space-y-2">
            {info.backends.map((b) => (
              <div
                key={b.id}
                className={clsx(
                  "flex items-center justify-between rounded-lg border p-3",
                  backend === b.id
                    ? "border-indigo-200 bg-indigo-50/40"
                    : "border-slate-200",
                )}
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-slate-800">{b.label}</span>
                    {backend === b.id && (
                      <span className="rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] text-indigo-600">
                        当前
                      </span>
                    )}
                    {b.default && (
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">
                        默认
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 text-xs text-slate-500">
                    <span className="font-mono">{b.model}</span> · 上游{" "}
                    <span className="font-mono">{b.upstream}</span>
                  </div>
                  <div className="mt-0.5 text-[11px] text-slate-400">路由: {b.routing}</div>
                </div>
                <button
                  onClick={() => onBackendChange(b.id as LLMBackend)}
                  disabled={backend === b.id}
                  className="rounded-md border border-slate-300 px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                >
                  {backend === b.id ? "使用中" : "切换"}
                </button>
              </div>
            ))}
            <p className="pt-1 text-[11px] text-slate-400">
              业务代码不变 — Gateway 看 <code>X-LLM-Backend</code> 头一行 yaml 切换上游
              (PPT Slide 38)
            </p>
          </div>
        )}

        {/* Guardrail */}
        {tab === "guardrail" && info && (
          <div className="space-y-2">
            {info.guardrails.map((g) => (
              <div key={g.id} className="rounded-lg border border-slate-200 p-3">
                <div className="flex items-center gap-2">
                  <span
                    className={clsx(
                      "h-2 w-2 rounded-full",
                      g.enabled ? "bg-emerald-500" : "bg-slate-300",
                    )}
                  />
                  <span className="text-sm font-medium text-slate-800">{g.label}</span>
                  <span className="ml-auto rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">
                    {g.action}
                  </span>
                </div>
                <div className="mt-1 text-xs text-slate-500">{g.where}</div>
                {g.patterns && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {g.patterns.map((p) => (
                      <span
                        key={p}
                        className="rounded bg-rose-50 px-1.5 py-0.5 font-mono text-[10px] text-rose-600"
                      >
                        {p}
                      </span>
                    ))}
                  </div>
                )}
                {g.categories && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {g.categories.map((c) => (
                      <span
                        key={c}
                        className="rounded bg-amber-50 px-1.5 py-0.5 font-mono text-[10px] text-amber-600"
                      >
                        {c}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
            <p className="pt-1 text-[11px] text-slate-400">
              提示词是软约束, Guardrail 是硬护栏 (PPT Slide 44)。试在 AI 助手里输入
              &quot;ignore previous instructions&quot; 看拦截。
            </p>
          </div>
        )}

        {/* 提示词管理 */}
        {tab === "prompts" && prompts && (
          <div className="space-y-3">
            <div>
              <div className="mb-1.5 text-xs font-medium text-slate-500">System Prompts</div>
              <div className="space-y-1.5">
                {prompts.system_prompts.map((p) => (
                  <PromptCard key={p.id} title={p.label || p.id} content={p.content} />
                ))}
              </div>
            </div>
            <div>
              <div className="mb-1.5 text-xs font-medium text-slate-500">
                场景模板 ({prompts.scenario_prompts.length})
              </div>
              <div className="space-y-1.5">
                {prompts.scenario_prompts.map((p) => (
                  <PromptCard key={p.id} title={p.title || p.id} content={p.content} />
                ))}
              </div>
            </div>
            <p className="text-[11px] text-slate-400">
              提示词作为受管资产集中存放, 可审计、可复用、可版本化 — 而不是散落在代码里
              (PPT Slide 38 提示词管理)
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function PromptCard({ title, content }: { title: string; content: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/50">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-3 py-2 text-left"
      >
        <span className="text-sm text-slate-700">{title}</span>
        <span className="text-xs text-slate-400">{open ? "−" : "+"}</span>
      </button>
      {open && (
        <pre className="overflow-x-auto whitespace-pre-wrap border-t border-slate-200 px-3 py-2 text-xs leading-relaxed text-slate-600">
          {content}
        </pre>
      )}
    </div>
  );
}
