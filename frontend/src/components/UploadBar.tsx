"use client";

import { useState } from "react";
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
      <label
        htmlFor="upload"
        className="flex cursor-pointer items-center gap-2 rounded-lg border border-line bg-card px-3 py-1.5 text-sm text-ink transition hover:border-ink/25"
      >
        {busy ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
        {busy ? t("upload.busy") : t("upload.button")}
        <input
          id="upload"
          type="file"
          accept=".log,.txt,.json,.gz"
          className="hidden"
          onChange={handle}
        />
      </label>

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
