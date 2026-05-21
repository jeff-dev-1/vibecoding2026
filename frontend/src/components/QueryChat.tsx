"use client";

import { useState } from "react";
import { chat, type ChatResponse } from "@/lib/api";

export function QueryChat({ logId }: { logId?: string }) {
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [resp, setResp] = useState<ChatResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function ask() {
    if (!q.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      setResp(await chat(q, logId));
    } catch (e: any) {
      setErr(String(e?.message || e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-6">
      <h2 className="mb-2 font-medium">3 · 自然语言查询</h2>
      <p className="mb-4 text-sm text-slate-500">
        提问例: <code>过去一小时 5xx 集中在哪个时间段?</code> /{" "}
        <code>有没有可疑的扫描请求?</code>
      </p>
      <div className="flex gap-2">
        <input
          className="flex-1 rounded border border-slate-300 px-3 py-2 text-sm"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && ask()}
          placeholder="问点什么…"
        />
        <button
          onClick={ask}
          disabled={busy}
          className="rounded bg-slate-900 px-3 py-2 text-sm text-white disabled:opacity-50"
        >
          {busy ? "…" : "Ask"}
        </button>
      </div>

      {err && <div className="mt-3 rounded bg-red-50 p-2 text-sm text-red-700">{err}</div>}

      {resp && resp.blocked && (
        <div className="mt-3 rounded bg-amber-50 p-3 text-sm text-amber-800">
          <div className="font-medium">⚠️ Blocked by guardrail</div>
          <div className="mt-1 text-xs">{resp.block_reason}</div>
        </div>
      )}

      {resp && !resp.blocked && (
        <div className="mt-4">
          <pre className="whitespace-pre-wrap rounded bg-slate-50 p-4 text-sm">{resp.answer}</pre>
          {resp.citations.length > 0 && (
            <div className="mt-3 text-xs text-slate-500">
              引用 {resp.citations.length} 条 chunk · model:{" "}
              <code>{resp.model}</code>
            </div>
          )}
          {resp.citations.length > 0 && (
            <ul className="mt-2 space-y-1 text-xs">
              {resp.citations.map((c) => (
                <li key={c.chunk_id} className="rounded border border-slate-200 p-2">
                  <div className="text-slate-500">
                    chunk_idx={c.chunk_idx} · lines {c.line_start}–{c.line_end} · score{" "}
                    {c.score.toFixed(2)}
                  </div>
                  <pre className="mt-1 whitespace-pre-wrap">{c.excerpt}</pre>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
