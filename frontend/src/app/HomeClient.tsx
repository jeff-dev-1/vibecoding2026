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

// initialJob: 服务端 (SSR) 预取的最近一次分析。命中时首屏直接带数据, 客户端零往返。
// 为 null 时 (预取失败/无历史) 回退到客户端 listJobs。
export function HomeClient({ initialJob }: { initialJob: Job | null }) {
  const notTerminal = (j: Job) => j.status !== "done" && j.status !== "failed";
  const [jobId, setJobId] = useState<string | null>(
    initialJob && notTerminal(initialJob) ? initialJob.id : null,
  );
  const [job, setJob] = useState<Job | null>(initialJob);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [backend, setBackend] = useState<LLMBackend>("deepseek");
  // 已有 SSR 数据则不再显示骨架; 否则首屏数据回来前先占位, 而非误导性的"暂无数据"
  const [initialLoading, setInitialLoading] = useState(!initialJob);

  // 客户端回退: 仅当 SSR 没拿到数据时才跑 (listJobs 与 getJob 同一 SELECT, 返回完整 job)。
  useEffect(() => {
    if (jobId || job) return;
    listJobs()
      .then((jobs) => {
        const latest = jobs.find((j) => j.status === "done") || jobs[0];
        if (!latest) {
          setInitialLoading(false); // 确实没有历史分析 → 收起骨架, 显示空状态
          return;
        }
        setJob(latest);
        setInitialLoading(false);
        if (notTerminal(latest)) {
          setJobId(latest.id); // 仍在分析中 → 启动轮询
        }
      })
      .catch(() => setInitialLoading(false));
  }, [jobId, job]);

  useEffect(() => {
    if (!jobId) return;
    let stop = false;
    async function tick() {
      try {
        const j = await getJob(jobId!);
        if (stop) return;
        setJob(j);
        setInitialLoading(false); // 拿到 job 数据, 收起骨架
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
    const id = jobId ?? job?.id;
    if (id) setJob(await getJob(id));
  }

  const entries = job?.sample_entries ?? [];

  return (
    <div
      className="min-h-screen transition-[margin] duration-300"
      style={{ marginRight: drawerOpen ? 440 : 0 }}
    >
      <TopBar
        onToggleAssistant={() => setDrawerOpen((v) => !v)}
        assistantOpen={drawerOpen}
      />
      <UploadBar onUploaded={setJobId} currentJob={job} onRefresh={refresh} />

      <main className="space-y-4 px-6 py-4">
        {/* Gateway 控制面 — 显性化 AI Gateway */}
        <GatewayPanel backend={backend} onBackendChange={setBackend} />

        {/* 首屏数据加载中: 骨架占位, 避免 3-5s 冷启期间显示"暂无数据" */}
        {initialLoading && !job ? (
          <DataSkeleton />
        ) : (
        <>
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
        </>
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

// 首屏冷启 (后端首个响应 ~3-5s) 期间的占位骨架, 替代误导性的"暂无数据"
function DataSkeleton() {
  return (
    <div className="animate-pulse space-y-4" aria-busy="true" aria-label="加载中">
      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="mb-4 h-3 w-32 rounded bg-slate-200" />
        <div className="flex items-end gap-1.5">
          {[40, 70, 30, 90, 55, 75, 45, 85, 35, 60, 50, 80].map((h, i) => (
            <div key={i} className="flex-1 rounded-t bg-slate-100" style={{ height: h }} />
          ))}
        </div>
      </section>
      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="mb-3 h-3 w-24 rounded bg-slate-200" />
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-3 w-full rounded bg-slate-100" />
          ))}
        </div>
      </section>
    </div>
  );
}
