"""分族提示词资产。

这些断言守的是一个具体的故障: 场景卡曾经全部写死 Nginx access log, 于是上传一份
sshd 认证日志后, 七个场景问的全是 HTTP 字段, 模型只能每次都回同一句"这不是
access log 数据" —— 卡片看着有七个, 实际只有一个答案。
"""
import pytest

from app.prompts import (
    DEFAULT_FAMILY,
    SCENARIO_PROMPTS,
    answer_language_directive,
    scenario_prompt,
    scenarios_for,
    system_prompt,
)


def test_scenario_ids_are_globally_unique():
    # id 跨族唯一是 scenario_prompt() 能不分族查找的前提; 重名会让某一族的提示词
    # 被另一族悄悄顶掉 —— 界面照常显示, 只是问出去的问题变了。
    ids = [sid for table in SCENARIO_PROMPTS.values() for sid in table]
    assert len(ids) == len(set(ids))


def test_both_families_present_and_populated():
    assert set(SCENARIO_PROMPTS) == {"access", "system"}
    for family, table in SCENARIO_PROMPTS.items():
        assert table, family
        for sid, item in table.items():
            assert set(item) == {"title", "prompt"}, (family, sid)


def test_scenario_prompt_finds_across_families():
    assert scenario_prompt("traffic-overview")
    assert scenario_prompt("sys-brute-force")
    assert scenario_prompt("no-such-scenario") is None


def test_scenarios_for_unknown_family_falls_back():
    assert scenarios_for("bogus") is SCENARIO_PROMPTS[DEFAULT_FAMILY]
    assert scenarios_for(None) is SCENARIO_PROMPTS[DEFAULT_FAMILY]


def test_system_scenarios_ask_no_http_questions():
    """系统日志的场景不能问 HTTP —— 那正是当初七个场景塌成一个答案的原因。

    syslog 里没有状态码/UA/URL, 问了只会得到"这份日志不含该信息"。
    """
    http_words = ("状态码", "User-Agent", "url_path", "referer", "bytes_sent", "4xx", "5xx")
    for sid, item in SCENARIO_PROMPTS["system"].items():
        for w in http_words:
            assert w not in item["prompt"], f"{sid} 问到了 HTTP 概念: {w}"


def test_system_prompt_differs_by_family_and_states_no_http():
    access, sysm = system_prompt("access"), system_prompt("system")
    assert access != sysm
    # 系统日志那份必须明确告诉模型这里没有 HTTP 字段, 否则它会去猜。
    assert "没有 HTTP 字段" in sysm
    # 未知族回落 access, 和 scenarios_for 的规则保持一致。
    assert system_prompt("bogus") == access
    assert system_prompt(None) == access


@pytest.mark.parametrize(
    ("lang", "needle"),
    [("zh-Hans", "简体"), ("zh-Hant", "繁體"), ("en", "English")],
)
def test_language_directive_per_request(lang, needle):
    # 语言是每次请求的属性, 不是提示词资产的固定内容 —— 界面切成 English 而答案
    # 还是中文, 是最扎眼的漏译。
    assert needle in answer_language_directive(lang)


def test_language_directive_falls_back():
    assert answer_language_directive(None) == answer_language_directive("zh-Hans")
    assert answer_language_directive("kl-KL") == answer_language_directive("zh-Hans")
