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

// 后端只给 id 和事实数据; label / where / action 由前端按语言渲染 (gr.* 键)。
export type GatewayGuardrail = {
  id: string;
  enabled: boolean;
  patterns?: string[];
  categories?: string[];
  /** Portkey 路径下的配置 id, 拼进 where 文案里 —— 是事实, 不是文案。 */
  config?: string;
  guardrail?: string;
};

export type GatewayProvider = "envoy" | "portkey";

export type ProviderMeta = { id: GatewayProvider };

export type GatewayInfo = {
  provider?: GatewayProvider;
  providers?: ProviderMeta[];
  default_backend: string;
  backends: GatewayBackend[];
  guardrails: GatewayGuardrail[];
};

export type PromptItem = { id: string; title?: string; label?: string; content: string };
export type GatewayPrompts = {
  system_prompts: PromptItem[];
  scenario_prompts: PromptItem[];
};

export type LogKind = "access" | "error" | "generic";

export type ParsedLogEntry = {
  line_no: number;
  kind?: LogKind;
  ts?: string | null;
  client_ip?: string | null;
  method?: string | null;
  path?: string | null;
  status?: number | null;
  bytes_sent?: number | null;
  user_agent?: string | null;
  referer?: string | null;
  level?: string | null;
  message?: string | null;
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

// ===== 请求链路 (控制面的"链路回放"消费这个) =====
// 后端每一跳自己计时后返回, 前端只负责画。没走到的跳不会出现在 steps 里,
// 所以回放器不需要 (也不允许) 为了动画顺滑而补一个假节点。
export type TraceStepId = "guard" | "retrieval" | "gateway" | "llm";

export type TraceStep = {
  id: TraceStepId;
  ok: boolean;
  ms: number;
  summary: string;
  detail: Record<string, unknown>;
};

export type ChatTrace = {
  steps: TraceStep[];
  total_ms: number;
  backend: LLMBackend;
  model: string;
  provider: string;
  /** Portkey 侧 trace id + 控制台链接 —— 用来跳过去对账, 我们不复刻它的日志表。 */
  trace_id?: string;
  console_url?: string;
  prompt_tokens: number;
  completion_tokens: number;
};

export type ChatResponse = {
  answer: string;
  citations: Citation[];
  model: string;
  backend: LLMBackend;
  blocked: boolean;
  block_reason?: string | null;
  redacted?: boolean;
  redaction_rules?: string[];
  redaction_preview?: string | null;
  trace?: ChatTrace | null;
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
  /** 界面语言 —— 模型用它决定散文用哪种语言作答。证据 (日志原文/IP/路径) 不受影响。 */
  lang?: string;
  /** 网关 provider —— 现场可切, 不传则用后端启动默认值。 */
  provider?: GatewayProvider;
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
      lang: args.lang ?? "zh-Hans",
      provider: args.provider,
    }),
  });
}

/** provider 可选 —— 传了就预览那个 provider 的配置 (护栏清单会跟着变)。 */
export async function gatewayInfo(provider?: string) {
  return _fetch<GatewayInfo>(`/gateway/info${provider ? `?provider=${provider}` : ""}`);
}

export async function gatewayPrompts() {
  return _fetch<GatewayPrompts>("/gateway/prompts");
}

export type GuardrailVerdict = "PASS" | "BLOCKED" | "REDACTED";
export type GuardrailTestResult = {
  verdict: GuardrailVerdict;
  matched_rules: string[];
  redacted_preview?: string | null;
};

export async function guardrailTest(text: string) {
  return _fetch<GuardrailTestResult>("/gateway/guardrail-test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
}

export type RedteamCategory = {
  category: string;
  total: number;
  passed: number;
  pass_rate: number;
};
export type RedteamFailure = {
  category: string;
  payload: string;
  expected: string;
  actual: string;
};
export type RedteamReport = {
  overall_pass_rate: number;
  total: number;
  passed: number;
  categories: RedteamCategory[];
  failures: RedteamFailure[];
  tool: string;
  created_at?: string | null;
  empty?: boolean;
  hint?: string;
};

export async function redteamReport() {
  return _fetch<RedteamReport>("/gateway/redteam-report");
}

// ===== 渗透测试 (DAST) — ZAP + Nuclei =====

export type PentestFinding = {
  name: string;
  risk: "High" | "Medium" | "Low" | "Info";
  source: string; // zap / nuclei / builtin
  url?: string | null;
  cwe?: string | null;
  count: number;
};

export type PentestReport = {
  target: string;
  gate: "pass" | "fail";
  total: number;
  counts: Record<string, number>; // High/Medium/Low/Info
  high: number;
  medium: number;
  findings: PentestFinding[];
  tools: string[];
  tool: string;
  created_at?: string | null;
  empty?: boolean;
  hint?: string;
};

export async function pentestReport() {
  return _fetch<PentestReport>("/gateway/pentest-report");
}

// ===== 供应链网关 (Koi) — Pattern A =====

export type SupplyChainState = "BLOCK" | "REQUEST_APPROVAL" | "PASS";
export type SupplyChainFinding = {
  finding_name: string;
  severity: string;
  description: string;
  evidence: string;
};
export type SupplyChainVerdict = {
  marketplace: string;
  item_id: string;
  item_display_name?: string | null;
  version?: string | null;
  state: SupplyChainState;
  risk?: number | null;
  risk_level?: string | null;
  ai_risk_summary?: string | null;
  findings: SupplyChainFinding[];
  source: "koi" | "offline";
  note?: string | null;
};
export type SupplyChainSamples = {
  enabled: boolean;
  marketplaces: { id: string }[];
  samples: { marketplace: string; item_id: string; label: string }[];
};

export async function supplyChainSamples() {
  return _fetch<SupplyChainSamples>("/gateway/supply-chain/samples");
}

export async function supplyChainCheck(args: {
  marketplace: string;
  item_id: string;
  version?: string;
}) {
  return _fetch<SupplyChainVerdict>("/gateway/supply-chain-check", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
}

// 本项目供应链门禁报告 (make supply-scan / CI POST 上来的最近一次结果)
export type SupplyChainReportItem = {
  marketplace: string;
  item_id: string;
  state: SupplyChainState;
  risk?: number | null;
  risk_level?: string | null;
  source: string;
  approved: boolean;
  findings_count: number;
};
export type SupplyChainReport = {
  generated_at?: string | null;
  gate: "pass" | "fail";
  total: number;
  counts: Record<string, number>;
  blocked: string[];
  needs_approval: string[];
  approved: string[];
  items: SupplyChainReportItem[];
  koi_enabled: boolean;
  created_at?: string | null;
  empty?: boolean;
  hint?: string;
};

export async function supplyChainReport() {
  return _fetch<SupplyChainReport>("/gateway/supply-chain-report");
}

// ===== AI GW 可观测性 =====

export type ObsCall = {
  ts: number;
  provider: string;
  backend: string;
  model: string;
  prompt_tokens: number;
  completion_tokens: number;
  latency_ms: number;
  cost_usd: number;
  ok: boolean;
  guardrail?: string | null;
};
export type Observability = {
  empty?: boolean;
  hint?: string;
  current_provider: string;
  total_calls?: number;
  failed_calls?: number;
  blocked_calls?: number;
  error_rate?: number;
  total_prompt_tokens?: number;
  total_completion_tokens?: number;
  total_cost_usd?: number;
  latency_p50_ms?: number;
  latency_p95_ms?: number;
  by_model?: Record<string, { calls: number; tokens: number; cost_usd: number }>;
  by_backend?: Record<
    string,
    { calls: number; tokens?: number; cost_usd?: number; latency_p50_ms?: number; latency_p95_ms?: number }
  >;
  by_provider?: Record<string, number>;
  recent?: ObsCall[];
  window?: number;
};

export async function gatewayObservability() {
  return _fetch<Observability>("/gateway/observability");
}


// ===== AI 网关用量 (取自 Portkey 分析 API, 后端代理) =====
export type SeriesPoint = { t: string; v: number };

export type Analytics = {
  configured: boolean;
  window: string;
  since?: string;
  summary: {
    requests: number;
    cost_usd: number;
    tokens: number;
    latency_p50: number;
    latency_p90: number;
    errors: number;
    users: number;
  };
  series: {
    requests: SeriesPoint[];
    cost: SeriesPoint[];
    tokens: SeriesPoint[];
    latency: SeriesPoint[];
    errors: SeriesPoint[];
    users: SeriesPoint[];
  };
  by_model: { model: string; requests: number }[];
  /** 护栏裁定分布 —— Portkey 约定: 446 拒绝, 246 标记但放行。 */
  guardrail: { denied: number; flagged: number; ok: number; other: number };
};

export async function gatewayAnalytics(window = "24h") {
  return _fetch<Analytics>(`/gateway/analytics?window=${window}`);
}
