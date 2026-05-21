"""集中式提示词管理 — 对应 PPT Slide 38 Gateway 的'提示词管理'能力。

把 system prompt + 场景模板放在一处, 让它们:
  - 被 chat / analyzer 复用
  - 被 GET /gateway/prompts 暴露 (前端'提示词管理'面板可见)
  - 成为可审计的资产 (而不是散落在代码各处的字符串)
"""
from __future__ import annotations

# RAG chat 的 system prompt
RAG_SYSTEM_PROMPT = (
    "You are a log analysis assistant. Answer ONLY using the provided LOG CHUNKS. "
    "For every claim, cite the chunk_idx in square brackets like [chunk_idx=12]. "
    "If chunks don't support an answer, say so."
)

# 7 个场景化 quick-action 模板 (右侧抽屉)
SCENARIO_PROMPTS: dict[str, dict[str, str]] = {
    "vs-overview": {
        "title": "VS 综合分析报告",
        "prompt": "请作为 VS 综合分析师, 输出: 健康度评分(0-100)、关键指标快照、TOP3 风险点、TOP3 建议。",
    },
    "health-check": {
        "title": "全站健康巡检",
        "prompt": "请做全站健康巡检: 流量分布、错误率、慢请求热点、可用性。每项给出 PASS/WARN/FAIL。",
    },
    "ssl-check": {
        "title": "SSL 证书巡检",
        "prompt": "请检查证书相关问题: 是否有 SSL handshake 失败、cipher 不匹配、证书近期到期信号。",
    },
    "alert-summary": {
        "title": "告警总览",
        "prompt": "请汇总告警: 按 5xx / 4xx / 速率异常 / 扫描行为 分类, 列前 5 条最严重。",
    },
    "slow-rca": {
        "title": "响应慢根因分析",
        "prompt": "请做响应慢根因分析: 哪些 URL/IP 慢, 慢在 5 段链路哪一段(客户端 RTT / LB / 服务器 RTT / 应用 / 传输)。",
    },
    "error-codes": {
        "title": "错误码分析",
        "prompt": "请做 4xx/5xx 错误码分析: 各状态码分布、最常见 path、可能根因。",
    },
    "security-ops": {
        "title": "安全运营",
        "prompt": "请做安全运营巡查: 注入尝试、扫描行为、可疑 UA、暴力破解、异常源 IP。给出处置建议。",
    },
}


def scenario_prompt(scenario_id: str) -> str | None:
    item = SCENARIO_PROMPTS.get(scenario_id)
    return item["prompt"] if item else None
