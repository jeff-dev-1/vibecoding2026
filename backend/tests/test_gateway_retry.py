"""网关连接抖动的重试与错误归一化。

守的是一次现场故障: 到网关的连接偶发 ConnectError, httpx 的异常直接冒到 FastAPI,
界面上就是一句光秃秃的 "500 — Internal Server Error" —— 分不清是网关连不上还是
代码崩了。
"""
import httpx
import pytest

from app.gateway.client import GatewayError, _post_with_retry


class _Client:
    """按脚本依次抛异常或返回响应, 并记录被调用了几次。"""

    def __init__(self, *outcomes):
        self._outcomes = list(outcomes)
        self.calls = 0

    async def post(self, url, json=None, headers=None):
        self.calls += 1
        out = self._outcomes.pop(0)
        if isinstance(out, Exception):
            raise out
        return out


async def test_returns_response_without_retry_when_first_attempt_works():
    resp = httpx.Response(200, json={"ok": True})
    c = _Client(resp)
    assert await _post_with_retry(c, "u", {}, {}, "portkey") is resp
    assert c.calls == 1


async def test_retries_once_on_connect_error_then_succeeds():
    # 抖动的典型形态: 第一次连不上, 第二次就通了。用户不该看到任何错误。
    resp = httpx.Response(200, json={"ok": True})
    c = _Client(httpx.ConnectError("boom"), resp)
    assert await _post_with_retry(c, "u", {}, {}, "portkey") is resp
    assert c.calls == 2


async def test_gives_up_after_two_attempts_and_raises_gateway_error():
    c = _Client(httpx.ConnectError("boom"), httpx.ConnectError("boom"))
    with pytest.raises(GatewayError) as ei:
        await _post_with_retry(c, "https://gw/chat", {}, {}, "portkey")
    # 502 而不是裸 500 —— chat.py 靠它把"上游连不上"和"我们崩了"分开报。
    assert ei.value.status == 502
    assert "portkey" in ei.value.body and "ConnectError" in ei.value.body
    assert c.calls == 2


async def test_does_not_retry_after_request_was_sent():
    """只重试建连阶段。请求已经发出去的失败不重试 —— 那可能已经在上游计了费。"""
    c = _Client(httpx.ReadTimeout("sent, then timed out"))
    with pytest.raises(httpx.ReadTimeout):
        await _post_with_retry(c, "u", {}, {}, "portkey")
    assert c.calls == 1
