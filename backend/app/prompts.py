"""集中式提示词管理 — 对应 PPT Slide 38 Gateway 的'提示词管理'能力。

把 system prompt + 场景模板放在一处, 让它们:
  - 被 chat / analyzer 复用
  - 被 GET /gateway/prompts 暴露 (前端'提示词管理'面板可见)
  - 成为可审计的资产

场景按**日志族**分组, 因为两族日志能回答的问题没有交集:
  access  Nginx/Apache access log —— path / status / UA / bytes
  system  Linux syslog / Apache error log —— 进程 / level / 消息文本

不分族的后果是实测出来的: 上传一份 sshd 认证日志, 七个 access 场景问的全是
HTTP 字段, 模型只能每次都回同一句"这不是 access log 数据", 七个场景塌成一个答案。
场景要问日志里真有的东西, 才问得出七个不同的答案。

两族都只用日志里**真实存在的字段**, 不引入日志里不存在的概念(证书/VS/告警源)。
"""
from __future__ import annotations

from typing import Literal

# RAG / 助手 的 system prompt — 混合上下文版 (结构化优先, RAG 补细节, 缺数据不编)
#
# 两族各一份。共享的部分 (材料怎么用 / 不许编 / 简洁给数字) 抽在 _SYSTEM_COMMON,
# 差异只有两句: 助手是什么分析助手, 以及"这份日志能回答什么"。
_SYSTEM_COMMON = (
    "回答必须基于下方提供的两类材料:\n"
    "1) STRUCTURED ANALYSIS — 已聚合的权威统计, "
    "聚合类问题(谁最多/分布/总量)必须从这里取数, 不要自己重新估算。\n"
    "2) RAW LOG EXCERPTS — 原始日志行, 仅用于举证具体某条记录, 引用时标 [chunk_idx=N]。\n\n"
    "硬规则:\n"
)

_SYSTEM_ACCESS = (
    "你是 Nginx/Apache access log 分析助手。"
    + _SYSTEM_COMMON
    + "- 如果两类材料都不包含某信息(例如 SSL 证书、TLS handshake、后端服务名、"
    "应用内部错误堆栈), 直接说明 'access log 不包含该信息', 禁止编造。\n"
    "- access log 能回答的范围: 请求量、状态码、路径、客户端 IP、UA、referer、"
    "响应大小、扫描/枚举特征、速率异常。\n"
    "- 简洁、给数字。"
)

_SYSTEM_SYSLOG = (
    "你是 Linux 系统日志 (syslog / auth.log / Apache error_log) 分析助手。"
    + _SYSTEM_COMMON
    + "- 这份日志里**没有 HTTP 字段** —— 没有 URL 路径、query string、HTTP 方法、"
    "HTTP 状态码、User-Agent、响应字节数。用户若问到这些, 说明该日志类型不含, "
    "并指出这份日志实际能回答什么, 禁止编造。\n"
    "- 系统日志能回答的范围: 进程/服务名 (sshd、su、cron、logrotate、pam_unix)、"
    "日志级别、认证成功与失败、用户名与远端主机 (rhost)、会话开启/关闭、"
    "提权 (su/sudo)、服务异常退出、时间分布与频次。\n"
    "- 简洁、给数字。"
)

_SYSTEM_BY_FAMILY: dict[str, str] = {
    "access": _SYSTEM_ACCESS,
    "system": _SYSTEM_SYSLOG,
}


def system_prompt(family: str | None) -> str:
    """按日志族取 system prompt。未知族回落 access。"""
    return _SYSTEM_BY_FAMILY.get(family or "", _SYSTEM_ACCESS)


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

# 场景化 quick-action 模板 —— 按日志族分两组。
#
# id 全局唯一 (跨族不重名), 所以查找不需要先知道族: scenario_prompt(id) 一把查到。
# 前端按族决定**显示哪一组卡片**, 后端按 id 取提示词, 两边不用同步族的判断。
SCENARIO_PROMPTS: dict[str, dict[str, dict[str, str]]] = {
    # ---- Nginx/Apache access log ----
    "access": {
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
            "prompt": "请检查 path/query 里的注入特征: SQLi(union/select/\' or)、"
            "XSS(<script>/onerror)、路径穿越(../)、命令注入。列出可疑请求和命中特征。",
        },
    },
    # ---- Linux syslog / auth.log / Apache error_log ----
    #
    # 这一组问的全是 syslog 里真有的东西: 进程名、level、用户名、rhost、会话。
    # 一个 HTTP 字段都没有 —— 有的话就又会退化成"这不是 access log"。
    "system": {
        "sys-overview": {
            "title": "系统日志概览",
            "prompt": "请给出这份系统日志的概览: 覆盖的时间范围、总条数、"
            "按进程/服务 (sshd、su、cron、logrotate 等) 分布的条数 TOP 5、"
            "按级别 (error/notice/info) 的条数分布。用数字说话。",
        },
        "sys-auth-failure": {
            "title": "认证失败分析",
            "prompt": "请分析认证失败: authentication failure 共多少条、涉及哪些服务 (sshd/su/login)、"
            "失败集中在哪些用户名、来自哪些 rhost。给出计数, 不要估算。",
        },
        "sys-brute-force": {
            "title": "暴力破解源",
            "prompt": "请判断是否存在暴力破解: 哪些远端主机 (rhost) 的失败次数最多、"
            "失败是否在短时间内密集出现、是否最终出现过成功登录 (session opened / Accepted)。"
            "列出 IP 与次数, 并说明判定依据。",
        },
        "sys-user-enum": {
            "title": "用户名枚举",
            "prompt": "请检测用户名枚举: 'user unknown'、'invalid user'、'illegal user' 各多少条、"
            "被尝试的用户名有哪些 (列出高频的)、来自哪些来源。"
            "说明这些用户名是否为常见默认账户 (root/admin/test/oracle 等)。",
        },
        "sys-privilege": {
            "title": "提权与会话",
            "prompt": "请分析提权与会话活动: su / sudo 的成功与失败各多少、"
            "谁切到了谁 (from-to 用户对)、session opened 与 session closed 是否配对、"
            "有没有长时间未关闭的会话。",
        },
        "sys-service-health": {
            "title": "服务异常",
            "prompt": "请找服务层面的异常: 哪些进程报了 error 级别的消息、"
            "有没有异常退出 / 重启 / ALERT (例如 logrotate 'ALERT exited abnormally')、"
            "各出现多少次、是否周期性重复。给出进程名与次数。",
        },
        "sys-timeline": {
            "title": "时间线与频次",
            "prompt": "请做时间维度分析: 事件在时间上的分布, 哪些时段是峰值、"
            "峰值时段以哪类事件为主 (认证失败 / 服务错误 / 例行任务)、"
            "有没有明显不属于业务时间的活动。给出时段与条数。",
        },
    },
}

#: 该族没有匹配时的兜底族。
DEFAULT_FAMILY = "access"


def scenarios_for(family: str | None) -> dict[str, dict[str, str]]:
    """某一族的场景表。未知族回落 access。"""
    return SCENARIO_PROMPTS.get(family or "", SCENARIO_PROMPTS[DEFAULT_FAMILY])


def scenario_prompt(scenario_id: str) -> str | None:
    """按 id 取提示词, 跨族查找 —— id 全局唯一, 调用方不必先判断族。"""
    for table in SCENARIO_PROMPTS.values():
        item = table.get(scenario_id)
        if item:
            return item["prompt"]
    return None


# ===== 报告翻译 =====
#
# 分析报告是**数据** (上传时生成一次, 存库), 但报告里的散文不是 —— 界面切成
# English 之后, 摘要和关键发现还是中文, 那是整页最扎眼的一块漏译。
#
# 不重跑分析: 重跑既贵又可能得到**不同的结论** (同一份日志, 两次分析说法不一致,
# 比语言不对更糟)。只翻译散文字段, 事实字段 (IP / 路径 / 状态码 / 严重度 / 计数)
# 原样保留 —— 它们是证据, 翻译过的证据没法拿去和原始日志对账。
REPORT_TRANSLATE_PROMPT = (
    "You translate a log-analysis report into the reader's language. "
    "Return ONLY a JSON object with exactly the same keys and array lengths as the input.\n\n"
    "Rules:\n"
    "- Translate ONLY prose: summary, key_observations, and each event's title/description.\n"
    "- Do NOT translate evidence: IP addresses, URL paths, user agents, status codes, "
    "process names (sshd, logrotate), log lines, or field names. Copy them verbatim.\n"
    "- Keep every list the same length and order; do not add, drop, merge or reorder items.\n"
    "- Keep numbers exactly as given.\n"
    "- No prose outside the JSON. No code fences."
)

_TARGET_LANG_NAME: dict[str, str] = {
    "zh-Hans": "Simplified Chinese (简体中文)",
    "zh-Hant": "Traditional Chinese (繁體中文)",
    "en": "English",
}


def target_language_name(lang: str | None) -> str:
    return _TARGET_LANG_NAME.get(lang or "", _TARGET_LANG_NAME[DEFAULT_ANSWER_LANG])
