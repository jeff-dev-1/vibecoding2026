"use client";

import { useRef, useState } from "react";
import { Loader2, RefreshCw, Upload } from "lucide-react";
import { uploadLog, type Job } from "@/lib/api";
import { useI18n } from "@/lib/i18n";

type Props = {
  onUploaded: (jobId: string) => void;
  currentJob?: Job | null;
  onRefresh: () => void;
};

export function UploadBar({ onUploaded, currentJob, onRefresh }: Props) {
  const { t } = useI18n();
  const fileRef = useRef<HTMLInputElement>(null);
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
    <div className="flex items-center gap-3 border-b border-line bg-card px-6 py-2.5">
      {/* button + ref.click(), 不用 label。
          label 那套 (htmlFor / 嵌套 / display:none) 的激活转发在各浏览器上有微妙差异,
          之前 htmlFor 和嵌套同时存在导致双触发, 文件框弹出又被顶掉。显式调用没有这些
          歧义: 点按钮 → 打开文件框, 一条路径。 */}
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        disabled={busy}
        className="flex items-center gap-2 rounded-lg border border-line bg-card px-3 py-1.5 text-sm text-ink transition hover:border-ink/25 disabled:opacity-50"
      >
        {busy ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
        {busy ? t("upload.busy") : t("upload.button")}
      </button>
      {/* 视觉上藏起来, 但仍然参与布局 (sr-only 那套), 而不是 display:none。
          有些 Chrome 策略下, 对一个 display:none 的 file input 调 .click() 不会弹出
          选择器 —— 表现就是"点了没反应", 而且没有任何报错。这样写没有这个风险,
          屏幕阅读器也仍然能找到它。 */}
      <input
        ref={fileRef}
        type="file"
        accept=".log,.txt,.json,.gz"
        onChange={handle}
        tabIndex={-1}
        aria-hidden="true"
        className="absolute h-px w-px overflow-hidden opacity-0"
        style={{ clip: "rect(0 0 0 0)", clipPath: "inset(50%)" }}
      />

      {currentJob ? (
        <div className="text-xs text-muted">
          {t("upload.currentJob")}{" "}
          <code className="font-mono text-ink">{currentJob.id.slice(0, 8)}</code>{" "}
          ·{" "}
          <span
            className={
              currentJob.status === "done"
                ? "text-brand-green"
                : currentJob.status === "failed"
                  ? "text-brand-red"
                  : "text-brand-orange"
            }
          >
            {currentJob.status}
          </span>
        </div>
      ) : (
        <div className="text-xs text-muted">{t("upload.empty")}</div>
      )}

      <div className="flex-1" />
      <button
        onClick={onRefresh}
        className="grid size-7 place-items-center rounded-lg border border-line text-muted transition hover:border-ink/25 hover:text-ink"
        title={t("upload.refresh")}
        aria-label={t("upload.refresh")}
      >
        <RefreshCw className="size-3.5" />
      </button>

      {err && (
        <div className="text-xs text-brand-red">{err}</div>
      )}
    </div>
  );
}
