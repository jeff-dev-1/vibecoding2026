const BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";

export type EvidenceItem = {
  chunk_id: string;
  chunk_idx: number;
  line_start: number;
  line_end: number;
  excerpt: string;
};

export type Job = {
  id: string;
  log_id: string;
  status: "pending" | "running" | "done" | "failed";
  summary?: string | null;
  evidence?: EvidenceItem[] | null;
  error?: string | null;
  created_at: string;
  finished_at?: string | null;
};

export type Citation = EvidenceItem & { score: number };

export type ChatResponse = {
  answer: string;
  citations: Citation[];
  model: string;
  blocked: boolean;
  block_reason?: string | null;
};

async function _fetch<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`${BASE}${path}`, { cache: "no-store", ...init });
  if (!r.ok) throw new Error(`${r.status} ${r.statusText} — ${await r.text()}`);
  return (await r.json()) as T;
}

export async function uploadLog(file: File, source = "custom") {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("source", source);
  return _fetch<{ log_id: string; job_id: string; bytes: number }>("/logs/upload", {
    method: "POST",
    body: fd,
  });
}

export async function getJob(id: string) {
  return _fetch<Job>(`/logs/jobs/${id}`);
}

export async function listJobs() {
  return _fetch<Job[]>(`/logs?limit=10`);
}

export async function chat(question: string, log_id?: string) {
  return _fetch<ChatResponse>("/chat/query", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question, log_id, top_k: 5 }),
  });
}
