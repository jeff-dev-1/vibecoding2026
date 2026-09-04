"""集中式提示词管理 — 对应 PPT Slide 38 Gateway 的'提示词管理'能力。

把 system prompt + 场景模板放在一处, 让它们:
  - 被 chat / analyzer 复用
  - 被 GET /gateway/prompts 暴露 (前端'提示词管理'面板可见)
  - 成为可审计的资产

注意: 所有场景都**基于 Nginx access log 真实字段** (IP/时间/method/path/status/
bytes/referer/UA), 不引入日志里不存在的概念(证书/VS/告警源)。
"""
from __future__ import annotations

from typing import Literal

# RAG / 助手 的 system prompt — 混合上下文版 (结构化优先, RAG 补细节, 缺数据不编)
RAG_SYSTEM_PROMPT = (
    "你是 Nginx access log 分析助手。回答必须基于下方提供的两类材料:\n"
    "1) STRUCTURED ANALYSIS — 已聚合的权威统计(流量/状态码/TOP IP/事件), "
    "聚合类问题(谁最多/分布/总量)必须从这里取数, 不要自己重新估算。\n"
    "2) RAW LOG EXCERPTS — 原始日志行, 仅用于举证具体某条记录, 引用时标 [chunk_idx=N]。\n\n"
    "硬规则:\n"
    "- 如果两类材料都不包含某信息(例如 SSL 证书、TLS handshake、后端服务名、"
    "应用内部错误堆栈), 直接说明 'Nginx access log 不包含该信息', 禁止编造。\n"
    "- access log 能回答的范围: 请求量、状态码、路径、客户端 IP、UA、referer、"
    "响应大小、扫描/枚举特征、速率异常。\n"
    "- 简洁、给数字。"
)

# 回答语言 —— 从 system prompt 里拆出来单独一条。
#
# 原来 RAG_SYSTEM_PROMPT 里写死了"用中文", 结果界面切成 English 之后模型还是中文作答。
# 语言是每次请求的属性 (跟着读者的界面语言走), 不是提示词资产的固定内容, 所以拆开:
# 提示词资产保持一份, 语言指令按请求拼上去。
#
# 不翻译的东西在这条指令里点名: 日志原文、路径、IP、UA、状态码是证据,
# 翻译过的证据没法拿去和原始日志对账。
AnswerLang = Literal["zh-Hans", "zh-Hant", "en"]

_LANG_DIRECTIVE: dict[str, str] = {
    "zh-Hans": (
        "用简体中文作答。日志原文、URL 路径、IP、User-Agent、状态码等证据保持原样, 不要翻译。"
    ),
    "zh-Hant": (
        "用繁體中文作答。日誌原文、URL 路徑、IP、User-Agent、狀態碼等證據保持原樣, 不要翻譯。"
    ),
    "en": (
        "Answer in English. Leave the evidence itself untranslated — raw log lines, URL paths, "
        "IP addresses, user agents and status codes stay exactly as they appear in the log."
    ),
}

DEFAULT_ANSWER_LANG: AnswerLang = "zh-Hans"


def answer_language_directive(lang: str | None) -> str:
    """回答语言指令。未知/缺省回落简体, 和界面的回落规则保持一致。"""
    return _LANG_DIRECTIVE.get(lang or "", _LANG_DIRECTIVE[DEFAULT_ANSWER_LANG])

# 7 个场景化 quick-action 模板 — 全部基于 nginx access log 可支撑的分析
SCENARIO_PROMPTS: dict[str, dict[str, str]] = {
    "traffic-overview": {
        "title": "流量概览",
        "prompt": "请基于 access log 给出流量概览: 总请求数、状态码分布(2xx/3xx/4xx/5xx)、"
        "TOP 5 访问路径、TOP 5 来源 IP、请求方法分布。用数字说话。",
    },
    "error-analysis": {
        "title": "错误码分析",
        "prompt": "请做 4xx/5xx 错误码分析: 各状态码出现次数、最常报错的 path、"
        "5xx 是否集中在某时间段或某来源 IP段, 给出可能根因。",
    },
    "scan-detection": {
        "title": "扫描与枚举检测",
        "prompt": "请检测扫描/枚举行为: 是否有 IP 对 /admin、/wp-login、顺序 id 等做大量探测; "
        "404 风暴; 短时间高频请求。列出涉事 IP 和被扫路径。",
    },
    "bigresp-analysis": {
        "title": "大响应/异常体积",
        "prompt": "请基于响应字节数(bytes_sent)找异常: 哪些 path 的响应体积明显偏大、"
        "是否存在疑似批量数据导出(大 body + 顺序访问)。列出 path 和体积。",
    },
    "bot-ua": {
        "title": "可疑 UA 与 Bot",
        "prompt": "请分析 User-Agent: 哪些是搜索引擎 Bot(Googlebot/Bingbot 等)、"
        "哪些是工具型 UA(curl/python-requests/扫描器)、是否有空 UA 或伪造 UA。"
        "区分良性爬虫与可疑客户端。",
    },
    "ip-rate": {
        "title": "异常源 IP 与速率",
        "prompt": "请做来源 IP 与速率分析: 单 IP 请求量 TOP 榜、是否有 IP 段集中爆发、"
        "是否存在疑似 DoS 或暴力破解的高频源。给出 IP 和频次。",
    },
    "url-injection": {
        "title": "URL 注入特征",
        "prompt": "请检查 path/query 里的注入特征: SQLi(union/select/' or)、"
        "XSS(<script>/onerror)、路径穿越(../)、命令注入。列出可疑请求和命中特征。",
    },
}


def scenario_prompt(scenario_id: str) -> str | None:
    item = SCENARIO_PROMPTS.get(scenario_id)
    return item["prompt"] if item else None
