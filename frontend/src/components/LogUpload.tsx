"use client";

import { useState } from "react";
import { uploadLog } from "@/lib/api";

export function LogUpload({ onUploaded }: { onUploaded: (jobId: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [source, setSource] = useState<"nginx" | "app" | "custom">("custom");

  async function handle(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = (e.currentTarget.elements.namedItem("file") as HTMLInputElement).files?.[0];
    if (!f) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await uploadLog(f, source);
      onUploaded(r.job_id);
    } catch (e: any) {
      setErr(String(e?.message || e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handle} className="rounded-lg border border-dashed border-slate-300 p-6 bg-white">
      <h2 className="mb-2 font-medium">1 · 上传日志</h2>
      <p className="mb-4 text-sm text-slate-500">
        支持 Nginx access log / 应用 JSON log / 纯文本。单文件 ≤ 50 MB。
      </p>
      <div className="flex items-center gap-3">
        <select
          value={source}
          onChange={(e) => setSource(e.target.value as any)}
          className="rounded border border-slate-300 px-2 py-1 text-sm"
        >
          <option value="custom">custom</option>
          <option value="nginx">nginx</option>
          <option value="app">app</option>
        </select>
        <input
          type="file"
          name="file"
          accept=".log,.txt,.json,.gz"
          className="text-sm"
          required
        />
        <button
          disabled={busy}
          className="rounded bg-slate-900 px-3 py-1.5 text-sm text-white disabled:opacity-50"
        >
          {busy ? "Uploading…" : "Upload"}
        </button>
      </div>
      {err && <p className="mt-2 text-sm text-red-600">{err}</p>}
    </form>
  );
}
