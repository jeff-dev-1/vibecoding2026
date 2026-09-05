"""日志族判定 + 系统日志的进程计数。

这两个函数决定了界面上给用户看什么: 族选中哪一组场景卡, 进程数占报告顶上的一格。
判错了不会报错, 只会安静地问错问题、显示错数字 —— 所以拿真实格式的日志行来钉住。
"""
from app.services.log_parser import dominant_family, parse_entries
from app.services.traffic import distinct_processes

NGINX = (
    '1.2.3.4 - - [22/Jan/2019:03:56:14 +0330] "GET /a HTTP/1.1" 200 30 "-" "curl/8" "-"\n'
    '5.6.7.8 - - [22/Jan/2019:03:56:15 +0330] "POST /b HTTP/1.1" 404 12 "-" "curl/8" "-"\n'
)

SYSLOG = (
    "Jun 14 15:16:01 combo sshd(pam_unix)[19939]: authentication failure; "
    "logname= uid=0 euid=0 tty=NODEVssh ruser= rhost=218.188.2.4\n"
    "Jun 14 15:16:02 combo sshd(pam_unix)[19940]: check pass; user unknown\n"
    "Jun 15 02:08:01 combo su(pam_unix)[21416]: session opened for user news by (uid=0)\n"
    "Jun 16 11:35:41 combo logrotate: ALERT exited abnormally with [1]\n"
)


def test_access_log_is_access_family():
    assert dominant_family(parse_entries(NGINX)) == "access"


def test_syslog_is_system_family():
    assert dominant_family(parse_entries(SYSLOG)) == "system"


def test_empty_falls_back_to_access():
    # 空日志走 access —— 和 dominant_kind 的兜底一致, 界面显示默认那组场景卡。
    assert dominant_family([]) == "access"


def test_distinct_processes_counts_services_not_lines():
    # 4 行里 sshd 出现两次, 服务数应是 3 (sshd / su / logrotate) 而不是 4。
    # 这个数会显示在报告的"涉及服务"格里, 数成行数就成了另一个"日志条数"。
    assert distinct_processes(parse_entries(SYSLOG)) == 3


def test_distinct_processes_zero_for_access_log():
    # access log 没有 message 字段, 不该凭空造出一个进程数。
    assert distinct_processes(parse_entries(NGINX)) == 0


def test_syslog_never_yields_warn_level():
    """报告里"警告级"那一格对 syslog 恒为 0 —— 这条断言把这个事实钉住。

    _parse_syslog 只产出 error / info / notice。前端据此在 warn == 0 时改显示
    "涉及服务"; 如果哪天解析器开始产出 warn 了, 这个测试会红, 提醒去改前端那段
    条件 —— 否则就会又出现一张恒为 0 的死卡片。
    """
    levels = {e.level for e in parse_entries(SYSLOG)}
    assert levels and not levels & {"warn", "warning"}
