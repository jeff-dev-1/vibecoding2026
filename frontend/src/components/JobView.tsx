"use client";

import { useEffect, useState } from "react";
import { getJob, type Job } from "@/lib/api";

export function JobView({ jobId }: { jobId: string }) {
  const [job, setJob] = useState<Job | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let stop = false;
    async function tick() {
      try {
        const j = await getJob(jobId);
        if (stop) return;
        setJob(j);
        if (j.status === "done" || j.status === "failed") return;
        setTimeout(tick, 2000);
      } catch (e: any) {
        if (!stop) setErr(String(e?.message || e));
      }
    }
    tick();
    return () => {
      stop = true;
    };
  }, [jobId]);

  if (err) return <div className="rounded bg-red-50 p-4 text-sm text-red-700">{err}</div>;
  if (!job) return <div className="rounded bg-white p-4 text-sm text-slate-500">Loading…</div>;

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-6">
      <h2 className="mb-2 font-medium">2 · 异常摘要</h2>
      <p className="mb-4 text-xs text-slate-500">
        Job <code>{job.id}</code> · status:{" "}
        <span
          className={
            job.status === "done"
              ? "text-emerald-700"
              : job.status === "failed"
                ? "text-red-700"
                : "text-amber-700"
          }
        >
          {job.status}
        </span>
      </p>

      {job.status === "pending" || job.status === "running" ? (
        <div className="text-sm text-slate-500">Analyzing… (polling every 2s)</div>
      ) : null}

      {job.summary && (
        <pre className="whitespace-pre-wrap rounded bg-slate-50 p-4 text-sm">{job.summary}</pre>
      )}

      {job.evidence && job.evidence.length > 0 && (
        <div className="mt-4">
          <h3 className="mb-2 text-sm font-medium">证据 ({job.evidence.length} chunks)</h3>
          <ul className="space-y-2 text-xs">
            {job.evidence.map((e) => (
              <li key={e.chunk_id} className="rounded border border-slate-200 p-2">
                <div className="text-slate-500">
                  chunk_idx={e.chunk_idx} · lines {e.line_start}–{e.line_end}
                </div>
                <pre className="mt-1 whitespace-pre-wrap">{e.excerpt}</pre>
              </li>
            ))}
          </ul>
        </div>
      )}

      {job.error && (
        <pre className="mt-2 rounded bg-red-50 p-2 text-xs text-red-700">{job.error}</pre>
      )}
    </div>
  );
}
