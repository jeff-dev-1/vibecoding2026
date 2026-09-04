"use client";

import { Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { AiAssistantDrawer } from "@/components/AiAssistantDrawer";
import { AnalysisReport } from "@/components/AnalysisReport";
import { ControlPlane, type ControlPlaneSection } from "@/components/ControlPlane";
import { LogTable } from "@/components/LogTable";
import { TimeHistogram } from "@/components/TimeHistogram";
import { TopBar } from "@/components/TopBar";
import { UploadBar } from "@/components/UploadBar";
import {
  getJob,
  listJobs,
  type ChatTrace,
  type GatewayProvider,
  type Job,
  type LLMBackend,
} from "@/lib/api";
import { useI18n } from "@/lib/i18n";

// initialJob: 服务端 (SSR) 预取的最近一次分析。命中时首屏直接带数据, 客户端零往返。
// 为 null 时 (预取失败/无历史) 回退到客户端 listJobs。
export function HomeClient({ initialJob }: { initialJob: Job | null }) {
  const { t } = useI18n();
  const notTerminal = (j: Job) => j.status !== "done" && j.status !== "failed";
  const [jobId, setJobId] = useState<string | null>(
    initialJob && notTerminal(initialJob) ? initialJob.id : null,
  );
  const [job, setJob] = useState<Job | null>(initialJob);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [backend, setBackend] = useState<LLMBackend>("deepseek");
  // 网关 provider —— 现场可切; 切换会改变护栏所在的位置, 不只是换个 URL。
  // 默认 Portkey (托管护栏更强, 实测能拦下 Envoy 规则漏掉的注入); Envoy 作为备用路径。
  const [provider, setProvider] = useState<GatewayProvider>("portkey");
  // 已有 SSR 数据则不再显示骨架; 否则首屏数据回来前先占位, 而非误导性的"暂无数据"
  const [initialLoading, setInitialLoading] = useState(!initialJob);

  // 管理面: 一个浮层, 不是一条路由。业务页只负责开合它和喂给它数据。
  const [consoleOpen, setConsoleOpen] = useState(false);
  const [section, setSection] = useState<ControlPlaneSection>("replay");

  // 最近一次真实提问的链路 —— AI 助手拿到就往上抛, 控制面的回放器消费它。
  // 放在这一层而不是各自持有: 抽屉关掉后链路还在, 回放不会跟着消失。
  const [lastTrace, setLastTrace] = useState<ChatTrace | null>(null);
  const [lastQuestion, setLastQuestion] = useState("");
  const [lastCitations, setLastCitations] = useState(0);

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
    // 整页不滚, 只有内容区滚 —— 顶栏和上传条固定在上面。
    // 演示时经常要一边看报告一边点"上传"/"刷新", 它们跟着内容滚走就得来回翻。
    <div
      className="flex h-screen flex-col overflow-hidden transition-[margin] duration-300"
      style={{ marginRight: drawerOpen ? 460 : 0 }}
    >
      <TopBar
        onToggleAssistant={() => setDrawerOpen((v) => !v)}
        assistantOpen={drawerOpen}
        onOpenConsole={() => setConsoleOpen(true)}
        consoleOpen={consoleOpen}
      />
      <UploadBar onUploaded={setJobId} currentJob={job} onRefresh={refresh} />

      {/* 业务面 —— 只有"这份日志里有什么"。治理相关的一切都在控制面浮层里。
          自己滚, 所以滚动条落在内容区右侧, 而不是整页最外层。 */}
      <main className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4">
        {initialLoading && !job ? (
          <DataSkeleton />
        ) : (
          <>
            {/* 时间柱图 */}
            <section className="rounded-xl border border-line bg-card">
              <TimeHistogram entries={entries} bucketMinutes={5} />
            </section>

            {/* 分析进行中 */}
            {job && job.status !== "done" && job.status !== "failed" && (
              <div className="rounded-xl border border-line bg-card p-6 text-center text-sm text-muted">
                {t("home.analyzing")} ({job.status})… {t("home.viaGateway")} {backend}
              </div>
            )}

            {/* 5 段 STRESSED 结构报告 */}
            {job?.analysis && (
              <section>
                <div className="mb-2 flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-ink">{t("home.reportTitle")}</h2>
                  <button
                    onClick={() => setDrawerOpen(true)}
                    className="flex items-center gap-1.5 text-xs text-primary transition hover:brightness-90"
                  >
                    <Sparkles className="size-3.5" />
                    {t("home.deepDive")} →
                  </button>
                </div>
                <AnalysisReport a={job.analysis} />
              </section>
            )}

            {/* 日志明细表 */}
            <section>
              <h2 className="mb-2 text-sm font-semibold text-ink">{t("home.logDetail")}</h2>
              <LogTable entries={entries} maxRows={30} />
            </section>

            {job?.error && (
              <section className="rounded-xl border border-brand-red/30 bg-brand-red/10 p-3 text-sm text-brand-red">
                <div className="mb-1 font-medium">{t("home.analysisFailed")}</div>
                <pre className="whitespace-pre-wrap font-mono text-xs">{job.error}</pre>
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
        provider={provider}
        onTrace={(tr, q, n) => {
          setLastTrace(tr);
          setLastQuestion(q);
          setLastCitations(n);
        }}
        onOpenReplay={() => {
          setSection("replay");
          setConsoleOpen(true);
        }}
      />

      {/* 管理面。渲染在最后 = 盖在最上层; 内部 open=false 时直接返回 null。 */}
      <ControlPlane
        open={consoleOpen}
        onClose={() => setConsoleOpen(false)}
        section={section}
        onSectionChange={setSection}
        backend={backend}
        onBackendChange={setBackend}
        provider={provider}
        onProviderChange={setProvider}
        trace={lastTrace}
        question={lastQuestion}
        citations={lastCitations}
      />
    </div>
  );
}

// 首屏冷启 (后端首个响应 ~3-5s) 期间的占位骨架, 替代误导性的"暂无数据"
function DataSkeleton() {
  return (
    <div className="animate-pulse space-y-4" aria-busy="true">
      <section className="rounded-xl border border-line bg-card p-6">
        <div className="mb-4 h-3 w-32 rounded bg-line" />
        <div className="flex items-end gap-1.5">
          {[40, 70, 30, 90, 55, 75, 45, 85, 35, 60, 50, 80].map((h, i) => (
            <div key={i} className="flex-1 rounded-t bg-surface" style={{ height: h }} />
          ))}
        </div>
      </section>
      <section className="rounded-xl border border-line bg-card p-6">
        <div className="mb-3 h-3 w-24 rounded bg-line" />
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-3 w-full rounded bg-surface" />
          ))}
        </div>
      </section>
    </div>
  );
}
