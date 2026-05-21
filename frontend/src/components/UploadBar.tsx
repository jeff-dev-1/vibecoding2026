"use client";

import { useState } from "react";
import { uploadLog, type Job } from "@/lib/api";

type Props = {
  onUploaded: (jobId: string) => void;
  currentJob?: Job | null;
  onRefresh: () => void;
};

export function UploadBar({ onUploaded, currentJob, onRefresh }: Props) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handle(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await uploadLog(f, "nginx");
      onUploaded(r.job_id);
    } catch (e: any) {
      setErr(String(e?.message || e));
    } finally {
      setBusy(false);
      e.target.value = "";
    }
  }

  return (
    <div className="flex items-center gap-3 border-b border-slate-200 bg-white px-6 py-3">
      <label
        htmlFor="upload"
        className="flex cursor-pointer items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
      >
        {busy ? "上传中…" : "上传日志"}
        <input
          id="upload"
          type="file"
          accept=".log,.txt,.json,.gz"
          className="hidden"
          onChange={handle}
        />
      </label>

      {currentJob ? (
        <div className="text-xs text-slate-500">
          当前 job{" "}
          <code className="font-mono text-slate-700">{currentJob.id.slice(0, 8)}</code>{" "}
          ·{" "}
          <span
            className={
              currentJob.status === "done"
                ? "text-emerald-600"
                : currentJob.status === "failed"
                  ? "text-rose-600"
                  : "text-amber-600"
            }
          >
            {currentJob.status}
          </span>
        </div>
      ) : (
        <div className="text-xs text-slate-400">未上传 — 先点 "上传日志"</div>
      )}

      <div className="flex-1" />
      <button
        onClick={onRefresh}
        className="rounded-md border border-slate-300 px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-50"
        title="刷新"
      >
        ⟳
      </button>

      {err && (
        <div className="text-xs text-rose-600">{err}</div>
      )}
    </div>
  );
}
