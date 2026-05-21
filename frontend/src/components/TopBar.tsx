"use client";

type Props = { onOpenAssistant: () => void };

export function TopBar({ onOpenAssistant }: Props) {
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
          onClick={onOpenAssistant}
          className="flex items-center gap-1.5 rounded-full border border-violet-200 bg-gradient-to-r from-violet-50 to-indigo-50 px-3 py-1.5 text-sm font-medium text-violet-700 shadow-sm transition hover:from-violet-100 hover:to-indigo-100"
        >
          <span className="text-violet-500">✨</span> AI 助手
        </button>
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-700 text-xs font-medium text-white">
            A
          </div>
          <span className="text-sm text-slate-600">admin</span>
        </div>
      </div>
    </header>
  );
}
