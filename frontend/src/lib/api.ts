// 浏览器走相对 /api/*, Next.js 服务端 rewrite 代理到 backend (next.config.mjs)
const BASE = "/api";

export type EvidenceItem = {
  chunk_id: string;
  chunk_idx: number;
  line_start: number;
  line_end: number;
  excerpt: string;
};

export type Severity = "critical" | "high" | "medium" | "low" | "info";

export type EventCategory =
  | "scan"
  | "brute_force"
  | "injection_attempt"
  | "5xx_spike"
  | "4xx_anomaly"
  | "rate_anomaly"
  | "data_exfiltration"
  | "auth_failure"
  | "unknown";

export type SecurityEvent = {
  event_type: string;
  severity: Severity;
  category: EventCategory;
  title: string;
  description: string;
  confidence: number;
  source_ips: string[];
  url_pattern?: string | null;
  possible_attacks: string[];
  evidence_chunks: number[];
  related_log_entries: string[];
  affected_paths: string[];
};

export type TrafficStat = {
  total_requests: number;
  error_4xx: number;
  error_5xx: number;
  unique_client_ips: number;
  top_paths: string[];
};

export type TrafficPattern = {
  url_path: string;
  method: string;
  hits: number;
  status_codes: Record<string, number>;
};

export type LogAnalysis = {
  summary: string;
  highest_severity: Severity;
  requires_immediate_attention: boolean;
  key_observations: string[];
  events: SecurityEvent[];
  traffic: TrafficStat;
  traffic_patterns: TrafficPattern[];
  model?: string | null;
};

// ===== Gateway introspection =====

export type GatewayBackend = {
  id: string;
  label: string;
  model: string;
  upstream: string;
  routing: string;
  default: boolean;
};

export type GatewayGuardrail = {
  id: string;
  label: string;
  enabled: boolean;
  where: string;
  action: string;
  patterns?: string[];
  categories?: string[];
};

export type GatewayInfo = {
  gateway: string;
  default_backend: string;
  backends: GatewayBackend[];
  guardrails: GatewayGuardrail[];
};

export type PromptItem = { id: string; title?: string; label?: string; content: string };
export type GatewayPrompts = {
  system_prompts: PromptItem[];
  scenario_prompts: PromptItem[];
};

export type ParsedLogEntry = {
  line_no: number;
  ts?: string | null;
  client_ip?: string | null;
  method?: string | null;
  path?: string | null;
  status?: number | null;
  bytes_sent?: number | null;
  user_agent?: string | null;
  referer?: string | null;
  client_rtt_ms?: number | null;
  lb_ms?: number | null;
  server_rtt_ms?: number | null;
  app_ms?: number | null;
  transfer_ms?: number | null;
};

export type Job = {
  id: string;
  log_id: string;
  status: "pending" | "running" | "done" | "failed";
  summary?: string | null;
  evidence?: EvidenceItem[] | null;
  analysis?: LogAnalysis | null;
  sample_entries?: ParsedLogEntry[] | null;
  error?: string | null;
  created_at: string;
  finished_at?: string | null;
};

export type Citation = EvidenceItem & { score: number };

export type LLMBackend = "deepseek" | "qwen";

export type ChatResponse = {
  answer: string;
  citations: Citation[];
  model: string;
  backend: LLMBackend;
  blocked: boolean;
  block_reason?: string | null;
};

async function _fetch<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`${BASE}${path}`, { cache: "no-store", ...init });
  if (!r.ok) throw new Error(`${r.status} ${r.statusText} — ${await r.text()}`);
  return (await r.json()) as T;
}

export async function uploadLog(file: File, source = "nginx") {
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

export async function chat(args: {
  question: string;
  log_id?: string;
  backend?: LLMBackend;
  scenario?: string;
}) {
  return _fetch<ChatResponse>("/chat/query", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      question: args.question,
      log_id: args.log_id,
      top_k: 5,
      backend: args.backend ?? "deepseek",
      scenario: args.scenario,
    }),
  });
}

export async function gatewayInfo() {
  return _fetch<GatewayInfo>("/gateway/info");
}

export async function gatewayPrompts() {
  return _fetch<GatewayPrompts>("/gateway/prompts");
}
