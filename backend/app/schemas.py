from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, ConfigDict


LogSource = Literal["nginx", "app", "custom"]
JobStatus = Literal["pending", "running", "done", "failed"]

# Backend selector — Gateway 看这个 header 决定上游模型
LLMBackend = Literal["deepseek", "qwen"]


# ===== 上传/任务 =====

class UploadResponse(BaseModel):
    log_id: UUID
    job_id: UUID
    bytes: int


# ===== Structured LogAnalysis (核心新增, 对应 dottxt-ai STRESSED) =====

Severity = Literal["critical", "high", "medium", "low", "info"]
EventCategory = Literal[
    "scan",                # 扫描行为 (admin/* 枚举, 端口扫描)
    "brute_force",         # 暴力破解
    "injection_attempt",   # 注入尝试
    "5xx_spike",           # 5xx 飙升
    "4xx_anomaly",         # 4xx 异常
    "rate_anomaly",        # 速率异常
    "data_exfiltration",   # 数据外泄迹象
    "auth_failure",        # 认证失败
    "unknown",
]


class SecurityEvent(BaseModel):
    """单一安全事件 — 对应 STRESSED 的 Security Events 区块。"""
    event_type: str = Field(..., max_length=120, description="如 'Suspicious HTTP Method'")
    severity: Severity
    category: EventCategory
    title: str = Field(..., max_length=120, description="一句话标题")
    description: str = Field(..., max_length=600, description="为什么判定为该事件")
    confidence: float = Field(..., ge=0.0, le=1.0)
    source_ips: list[str] = Field(default_factory=list, max_length=20)
    url_pattern: str | None = Field(default=None, max_length=300, description="涉及的 URL 模式")
    possible_attacks: list[str] = Field(default_factory=list, max_length=10, description="如 SQLi/XSS/Scan")
    evidence_chunks: list[int] = Field(default_factory=list, description="引用的 chunk_idx")
    related_log_entries: list[str] = Field(default_factory=list, max_length=10, description="相关原始日志行")
    affected_paths: list[str] = Field(default_factory=list, max_length=20)


class TrafficPattern(BaseModel):
    """单条流量聚合 — 对应 STRESSED Traffic Patterns 表的一行。后端确定性聚合。"""
    url_path: str
    method: str
    hits: int
    status_codes: dict[str, int] = Field(default_factory=dict, description='{"200":1,"302":1}')


class TrafficStat(BaseModel):
    total_requests: int
    error_4xx: int = 0
    error_5xx: int = 0
    unique_client_ips: int = 0
    top_paths: list[str] = Field(default_factory=list, max_length=10)


class LogAnalysis(BaseModel):
    """完整分析报告 — STRESSED 5 段结构。

    LLM 负责: summary / highest_severity / requires_immediate_attention /
              key_observations / events
    后端确定性计算: traffic (stat) / traffic_patterns (聚合表)
    """
    summary: str = Field(..., max_length=2000, description="人话总结, 1-3 段")
    highest_severity: Severity = "info"
    requires_immediate_attention: bool = False
    key_observations: list[str] = Field(default_factory=list, max_length=12)
    events: list[SecurityEvent] = Field(default_factory=list, max_length=20)
    # 以下由后端填 (LLM 不需返回)
    traffic: TrafficStat
    traffic_patterns: list[TrafficPattern] = Field(default_factory=list, max_length=50)
    model: str | None = None


# ===== 解析后的单条日志记录 (扩展 Nginx parser 后产物) =====

class ParsedLogEntry(BaseModel):
    """从原始日志行解析出来的结构化字段, 喂给前端表格。"""
    line_no: int
    ts: datetime | None = None
    client_ip: str | None = None
    method: str | None = None
    path: str | None = None
    status: int | None = None
    bytes_sent: int | None = None
    user_agent: str | None = None
    referer: str | None = None
    # 5 段链路 (没真实数据就 mock — 客户演示用)
    client_rtt_ms: int | None = None
    lb_ms: int | None = None
    server_rtt_ms: int | None = None
    app_ms: int | None = None
    transfer_ms: int | None = None


# ===== Evidence / Job (向后兼容) =====

class EvidenceItem(BaseModel):
    chunk_id: UUID
    chunk_idx: int
    line_start: int
    line_end: int
    excerpt: str = Field(..., max_length=400)


class JobResponse(BaseModel):
    id: UUID
    log_id: UUID
    status: JobStatus
    summary: str | None = None
    evidence: list[EvidenceItem] | None = None
    error: str | None = None
    created_at: datetime
    finished_at: datetime | None = None
    # 新: structured analysis
    analysis: LogAnalysis | None = None
    # 新: 解析后的样本日志条目 (前端表格用)
    sample_entries: list[ParsedLogEntry] | None = None


# ===== Chat =====

class ChatRequest(BaseModel):
    question: str = Field(..., min_length=1, max_length=2000)
    log_id: UUID | None = None
    top_k: int = Field(default=5, ge=1, le=20)
    backend: LLMBackend = "deepseek"
    scenario: str | None = Field(default=None, max_length=80, description="VS 综合 / 健康巡检 / SSL / 告警 / 慢根因 / 错误码 / 安全运营")


class Citation(BaseModel):
    chunk_id: UUID
    chunk_idx: int
    line_start: int
    line_end: int
    excerpt: str = Field(..., max_length=400)
    score: float


class ChatResponse(BaseModel):
    answer: str
    citations: list[Citation]
    model: str
    backend: LLMBackend
    blocked: bool = False
    block_reason: str | None = None


# ===== Health =====

class HealthResponse(BaseModel):
    ok: bool
    gateway: bool
    db: bool
    backends: dict[str, bool] = Field(default_factory=dict)
