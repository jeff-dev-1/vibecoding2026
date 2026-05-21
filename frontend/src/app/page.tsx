"use client";

import { useEffect, useState } from "react";
import { AiAssistantDrawer } from "@/components/AiAssistantDrawer";
import { AnalysisReport } from "@/components/AnalysisReport";
import { GatewayPanel } from "@/components/GatewayPanel";
import { LogTable } from "@/components/LogTable";
import { TimeHistogram } from "@/components/TimeHistogram";
import { TopBar } from "@/components/TopBar";
import { UploadBar } from "@/components/UploadBar";
import { getJob, listJobs, type Job, type LLMBackend } from "@/lib/api";

export default function Page() {
  const [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [backend, setBackend] = useState<LLMBackend>("deepseek");

  // 首屏: 自动加载最近一个完成的分析 (登录即见结果, 不空屏)
  useEffect(() => {
    if (jobId) return;
    listJobs()
      .then((jobs) => {
        const latest = jobs.find((j) => j.status === "done") || jobs[0];
        if (latest) setJobId(latest.id);
      })
      .catch(() => {});
  }, [jobId]);

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

  return (
    <div
      className="min-h-screen transition-[margin] duration-300"
      style={{ marginRight: drawerOpen ? 440 : 0 }}
    >
      <TopBar onOpenAssistant={() => setDrawerOpen(true)} />
      <UploadBar onUploaded={setJobId} currentJob={job} onRefresh={refresh} />

      <main className="space-y-4 px-6 py-4">
        {/* Gateway 控制面 — 显性化 AI Gateway */}
        <GatewayPanel backend={backend} onBackendChange={setBackend} />

        {/* 时间柱图 */}
        <section className="rounded-xl border border-slate-200 bg-white">
          <TimeHistogram entries={entries} bucketMinutes={5} />
        </section>

        {/* 分析进行中 */}
        {job && job.status !== "done" && job.status !== "failed" && (
          <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
            AI 分析中 ({job.status})… 走 Envoy AI Gateway → {backend}
          </div>
        )}

        {/* 5 段 STRESSED 结构报告 */}
        {job?.analysis && (
          <section>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-700">Log Analysis Report</h2>
              <button
                onClick={() => setDrawerOpen(true)}
                className="text-xs text-indigo-600 hover:underline"
              >
                深入分析 (AI 助手) →
              </button>
            </div>
            <AnalysisReport a={job.analysis} />
          </section>
        )}

        {/* 日志明细表 (可展开 5 段链路) */}
        <section>
          <h2 className="mb-2 text-sm font-semibold text-slate-700">日志明细</h2>
          <LogTable entries={entries} maxRows={30} />
        </section>

        {job?.error && (
          <section className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700 ring-1 ring-rose-200">
            <div className="mb-1 font-medium">分析失败</div>
            <pre className="whitespace-pre-wrap text-xs">{job.error}</pre>
          </section>
        )}
      </main>

      <AiAssistantDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        logId={job?.log_id}
        job={job}
        backend={backend}
        onBackendChange={setBackend}
      />
    </div>
  );
}
