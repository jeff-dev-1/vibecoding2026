"use client";

import clsx from "clsx";

type Props = { onToggleAssistant: () => void; assistantOpen: boolean };

export function TopBar({ onToggleAssistant, assistantOpen }: Props) {
  return (
    <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-2.5">
      <div className="flex items-center gap-3">
        <button className="rounded p-1 text-slate-500 hover:bg-slate-100" title="菜单">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
        <h1 className="text-sm font-medium text-slate-700">
          AI Log Analysis · Vibe Coding Demo
        </h1>
      </div>
      <div className="flex items-center gap-3">
        <button
          onClick={onToggleAssistant}
          aria-pressed={assistantOpen}
          className={clsx(
            "flex items-center gap-1.5 rounded-full bg-gradient-to-r from-violet-50 to-indigo-50 px-3 py-1.5 text-sm font-medium text-violet-700 shadow-sm transition hover:from-violet-100 hover:to-indigo-100",
            // 点一下出边框 (展开), 再点一下收起边框 (收起)
            assistantOpen
              ? "border-2 border-violet-500 ring-2 ring-violet-200"
              : "border border-violet-200",
          )}
        >
          <span className="text-violet-500">✨</span> AI 助手
        </button>
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-700 text-xs font-medium text-white">
            A
          </div>
          <span className="text-sm text-slate-600">admin</span>
        </div>
        <button
          onClick={async () => {
            await fetch("/auth/logout", { method: "POST" });
            window.location.href = "/login";
          }}
          className="rounded px-2 py-1 text-xs text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          title="登出"
        >
          登出
        </button>
      </div>
    </header>
  );
}
