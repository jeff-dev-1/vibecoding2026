"""确定性流量聚合。

这个模块的产出直接变成报告顶上的四张卡和"流量/错误模式"表 —— 数错了不会报错,
只会显示一个看起来很像真的错数字。而且它对两族日志复用同一组字段
(system 族里 error_4xx 装 warn 数、error_5xx 装 error 级数), 复用点尤其要钉住。
"""
from app.services.log_parser import parse_entries
from app.services.traffic import aggregate

ACCESS = (
    '1.1.1.1 - - [22/Jan/2019:03:56:14 +0330] "GET /a HTTP/1.1" 200 100 "-" "curl" "-"\n'
    '1.1.1.1 - - [22/Jan/2019:03:56:15 +0330] "GET /a HTTP/1.1" 200 100 "-" "curl" "-"\n'
    '2.2.2.2 - - [22/Jan/2019:03:56:16 +0330] "GET /b HTTP/1.1" 404 10 "-" "curl" "-"\n'
    '3.3.3.3 - - [22/Jan/2019:03:56:17 +0330] "POST /c HTTP/1.1" 500 20 "-" "curl" "-"\n'
    '3.3.3.3 - - [22/Jan/2019:03:56:18 +0330] "POST /c HTTP/1.1" 503 20 "-" "curl" "-"\n'
)

SYSLOG = (
    "Jun 14 15:16:01 combo sshd(pam_unix)[1]: authentication failure; rhost=1.1.1.1\n"
    "Jun 14 15:16:02 combo sshd(pam_unix)[2]: authentication failure; rhost=1.1.1.1\n"
    "Jun 14 15:16:03 combo sshd(pam_unix)[3]: check pass; user unknown\n"
    "Jun 15 02:08:01 combo su(pam_unix)[4]: session opened for user news by (uid=0)\n"
    "Jun 16 11:35:41 combo logrotate: ALERT exited abnormally with [1]\n"
)


def test_empty_input_yields_zero_not_crash():
    stat, patterns = aggregate([])
    assert stat.total_requests == 0
    assert patterns == []


class TestAccessLog:
    def setup_method(self):
        self.stat, self.patterns = aggregate(parse_entries(ACCESS))

    def test_counts_requests_and_status_classes(self):
        assert self.stat.total_requests == 5
        assert self.stat.error_4xx == 1          # 404
        assert self.stat.error_5xx == 2          # 500 + 503
        assert self.stat.unique_client_ips == 3

    def test_groups_by_path_and_method(self):
        by_path = {(p.url_path, p.method): p for p in self.patterns}
        assert by_path[("/a", "GET")].hits == 2
        assert by_path[("/c", "POST")].hits == 2
        assert by_path[("/c", "POST")].status_codes == {"500": 1, "503": 1}

    def test_patterns_sorted_by_hits_desc(self):
        assert [p.hits for p in self.patterns] == sorted(
            (p.hits for p in self.patterns), reverse=True
        )

    def test_top_paths_reflects_patterns(self):
        assert self.stat.top_paths[0] == self.patterns[0].url_path


def test_query_string_is_stripped_so_one_endpoint_is_one_row():
    """/search?q=a 和 /search?q=b 是同一个端点。不归一的话 TOP 路径会被同一个
    接口的不同参数刷满, 真正的热点反而挤不进前十。"""
    raw = "".join(
        f'1.1.1.1 - - [22/Jan/2019:03:56:1{i} +0330] "GET /search?q={i} HTTP/1.1" 200 5 "-" "c" "-"\n'
        for i in range(3)
    )
    _, patterns = aggregate(parse_entries(raw))
    assert len(patterns) == 1
    assert patterns[0].url_path == "/search" and patterns[0].hits == 3


class TestSystemLog:
    def setup_method(self):
        self.stat, self.patterns = aggregate(parse_entries(SYSLOG))

    def test_reuses_fields_for_levels(self):
        assert self.stat.total_requests == 5
        # error 级: 两条 authentication failure + 一条 ALERT exited abnormally
        assert self.stat.error_5xx == 3
        # warn 级恒为 0 —— _parse_syslog 不产出 warn。前端据此改显示"涉及服务",
        # 这条断言和 test_log_family 里那条一起把这个事实锁住。
        assert self.stat.error_4xx == 0

    def test_only_rhost_counts_as_a_client_ip(self):
        # 只有带 rhost= 的行能解析出来源, 且两条来自同一个 IP。
        assert self.stat.unique_client_ips == 1

    def test_groups_by_message_prefix_not_full_text(self):
        """按进程名归并 —— 消息正文里带 pid/时间戳, 不归一的话每行自成一组,
        "错误模式"表就退化成原始日志的副本。"""
        by_key = {(p.url_path, p.method): p.hits for p in self.patterns}
        assert by_key[("sshd(pam_unix)", "error")] == 2
        assert by_key[("logrotate", "error")] == 1
        assert ("su(pam_unix)", "info") in by_key

    def test_status_codes_empty_for_system_logs(self):
        # 前端靠"status_codes 全空"切换成错误模式表头; 塞了东西表头就切错。
        assert all(p.status_codes == {} for p in self.patterns)
