"use client";

import { useEffect, useState } from "react";
import { listJobs, type Job } from "@/lib/api";

export function RecentJobs({ onPick }: { onPick: (jobId: string) => void }) {
  const [jobs, setJobs] = useState<Job[]>([]);

  useEffect(() => {
    listJobs()
      .then(setJobs)
      .catch(() => {});
    const t = setInterval(() => listJobs().then(setJobs).catch(() => {}), 5000);
    return () => clearInterval(t);
  }, []);

  if (jobs.length === 0) return null;

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-6">
      <h2 className="mb-3 font-medium">4 · 最近 10 条</h2>
      <ul className="divide-y divide-slate-200 text-sm">
        {jobs.map((j) => (
          <li key={j.id} className="flex items-center justify-between py-2">
            <button onClick={() => onPick(j.id)} className="text-left">
              <code className="text-xs">{j.id.slice(0, 8)}</code>{" "}
              <span className="text-slate-500">· {new Date(j.created_at).toLocaleString()}</span>
            </button>
            <span
              className={
                j.status === "done"
                  ? "text-xs text-emerald-700"
                  : j.status === "failed"
                    ? "text-xs text-red-700"
                    : "text-xs text-amber-700"
              }
            >
              {j.status}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
