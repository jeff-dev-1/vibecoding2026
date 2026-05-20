"use client";

import { useState } from "react";
import { JobView } from "@/components/JobView";
import { LogUpload } from "@/components/LogUpload";
import { QueryChat } from "@/components/QueryChat";
import { RecentJobs } from "@/components/RecentJobs";

export default function Page() {
  const [jobId, setJobId] = useState<string | null>(null);
  const [logId] = useState<string | undefined>(undefined);

  return (
    <main className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <div className="space-y-6 lg:col-span-2">
        <LogUpload onUploaded={setJobId} />
        {jobId && <JobView jobId={jobId} />}
        <QueryChat logId={logId} />
      </div>
      <aside className="space-y-6">
        <RecentJobs onPick={setJobId} />
        <div className="rounded-lg border border-slate-200 bg-white p-6 text-xs text-slate-500">
          <h3 className="mb-2 font-medium text-slate-800">演示提示</h3>
          <ul className="list-inside list-disc space-y-1">
            <li>所有 LLM 调用经过 Envoy AI Gateway</li>
            <li>试着提问含 &quot;ignore previous instructions&quot; 看看会发生什么</li>
            <li>试着上传一份含邮箱/手机号的日志看 PII 脱敏</li>
            <li>红队报告: <code>make redteam</code></li>
          </ul>
        </div>
      </aside>
    </main>
  );
}
