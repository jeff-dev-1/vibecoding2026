"use client";

import { useEffect, useState } from "react";
import { AiAssistantDrawer } from "@/components/AiAssistantDrawer";
import { LogTable } from "@/components/LogTable";
import { TimeHistogram } from "@/components/TimeHistogram";
import { TopBar } from "@/components/TopBar";
import { UploadBar } from "@/components/UploadBar";
import { getJob, type Job } from "@/lib/api";

export default function Page() {
  const [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    if (!jobId) return;
    let stop = false;
    async function tick() {
      try {
        const j = await getJob(jobId!);
        if (stop) return;
        setJob(j);
        if (j.status === "done" || j.status === "failed") return;
        setTimeout(tick, 2000);
      } catch {
        /* silent */
      }
    }
    tick();
    return () => {
      stop = true;
    };
  }, [jobId]);

  async function refresh() {
    if (jobId) setJob(await getJob(jobId));
  }

  const entries = job?.sample_entries ?? [];
  const traffic = job?.analysis?.traffic;
  const events = job?.analysis?.events ?? [];

  return (
    <div className="min-h-screen">
      <TopBar onOpenAssistant={() => setDrawerOpen(true)} />
      <UploadBar onUploaded={setJobId} currentJob={job} onRefresh={refresh} />

      <main className="px-6 py-4">
        {/* 顶部时间柱图 */}
        <section className="mb-4 rounded-lg border border-slate-200 bg-white">
          <TimeHistogram entries={entries} bucketMinutes={5} />
        </section>

        {/* AI structured summary 区 (Pydantic-validated LogAnalysis) */}
        {job?.analysis && (
          <section className="mb-4 rounded-lg border border-slate-200 bg-white p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-medium text-slate-700">
                AI 异常分析{" "}
                <span className="ml-1 rounded bg-violet-100 px-1.5 py-0.5 text-[10px] text-violet-700">
                  structured JSON · {job.analysis.model}
                </span>
              </h2>
              <button
                onClick={() => setDrawerOpen(true)}
                className="text-xs text-violet-600 hover:underline"
              >
                深入分析 →
              </button>
            </div>
            <p className="mb-3 whitespace-pre-wrap text-sm text-slate-700">
              {job.analysis.summary}
            </p>
            {traffic && (
              <div className="mb-3 grid grid-cols-2 gap-3 md:grid-cols-5">
                <Stat label="总请求" v={traffic.total_requests} />
                <Stat label="4xx" v={traffic.error_4xx} cls="text-amber-600" />
                <Stat label="5xx" v={traffic.error_5xx} cls="text-rose-600" />
                <Stat label="不同源 IP" v={traffic.unique_client_ips} />
                <div className="col-span-2 rounded bg-slate-50 p-2 md:col-span-1">
                  <div className="text-[10px] uppercase tracking-wider text-slate-400">
                    TOP 路径
                  </div>
                  <div className="mt-1 truncate font-mono text-[11px] leading-tight text-slate-700">
                    {(traffic.top_paths ?? []).slice(0, 3).join(" · ") || "—"}
                  </div>
                </div>
              </div>
            )}
            {events.length > 0 && (
              <div className="space-y-2">
                {events.map((e, i) => (
                  <div
                    key={i}
                    className="rounded border border-slate-200 bg-slate-50/40 p-3 text-sm"
                  >
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <SevBadge sev={e.severity} />
                      <span className="text-xs uppercase tracking-wider text-slate-400">
                        {e.category}
                      </span>
                      <span className="font-medium text-slate-800">{e.title}</span>
                      <span className="ml-auto text-xs text-slate-400">
                        confidence {(e.confidence * 100).toFixed(0)}%
                      </span>
                    </div>
                    <p className="mb-1 text-slate-600">{e.description}</p>
                    <div className="text-xs text-slate-500">
                      {e.evidence_chunks.length > 0 && (
                        <span>
                          chunks: <span className="font-mono">{e.evidence_chunks.join(", ")}</span>
                          {" · "}
                        </span>
                      )}
                      {e.source_ips.length > 0 && (
                        <span>
                          IPs:{" "}
                          <span className="font-mono">
                            {e.source_ips.slice(0, 4).join(", ")}
                            {e.source_ips.length > 4 && "…"}
                          </span>
                          {" · "}
                        </span>
                      )}
                      {e.affected_paths.length > 0 && (
                        <span>
                          paths:{" "}
                          <span className="font-mono">
                            {e.affected_paths.slice(0, 3).join(", ")}
                          </span>
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* 日志表 (可展开行 5 段链路) */}
        <section>
          <LogTable entries={entries} maxRows={30} />
        </section>

        {job?.error && (
          <section className="mt-4 rounded bg-rose-50 p-3 text-sm text-rose-700 ring-1 ring-rose-200">
            <div className="mb-1 font-medium">分析失败</div>
            <pre className="whitespace-pre-wrap text-xs">{job.error}</pre>
          </section>
        )}
      </main>

      <AiAssistantDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        logId={job?.log_id}
      />
    </div>
  );
}

function Stat({ label, v, cls }: { label: string; v: number | string; cls?: string }) {
  return (
    <div className="rounded bg-slate-50 p-2">
      <div className="text-[10px] uppercase tracking-wider text-slate-400">{label}</div>
      <div className={`mt-0.5 font-mono text-lg font-semibold ${cls ?? "text-slate-700"}`}>{v}</div>
    </div>
  );
}

function SevBadge({ sev }: { sev: string }) {
  const m: Record<string, string> = {
    critical: "bg-rose-100 text-rose-700",
    high: "bg-orange-100 text-orange-700",
    medium: "bg-amber-100 text-amber-700",
    low: "bg-sky-100 text-sky-700",
    info: "bg-slate-100 text-slate-600",
  };
  return (
    <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium uppercase ${m[sev] ?? m.info}`}>
      {sev}
    </span>
  );
}
