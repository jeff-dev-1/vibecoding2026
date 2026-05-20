"""
Mock LLM upstream — 让 demo 离线也能跑。
返回确定性响应；按请求里是否含 'evidence' 关键词区分摘要 vs 问答两种回复。

兼容三种协议:
  - /v1/chat/completions   (OpenAI)
  - /v1/messages           (Anthropic)
  - /api/chat              (Ollama-like)
"""
from __future__ import annotations

import json
import re
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

PORT = 11434

SUMMARY_TEMPLATE = """检测到 3 类异常:

1. 5xx 错误率在 02:14–02:17 之间从 0.2% 跳到 6.8%（chunk_idx=42–58）
2. 同一 IP 段在 1 分钟内对 /api/login 发起 240 次请求（chunk_idx=71）
3. 一个 /admin/* 路径出现 200 响应但来源 UA 为空（chunk_idx=83）

建议: 检查 02:14 前后是否有部署变更；对 /api/login 加速率限制；审计 /admin 路径访问。
"""

QA_TEMPLATE = """根据日志，最常见的错误是 502 Bad Gateway，集中在 02:14–02:17。
证据: chunk_idx=42 显示 'upstream connect error or disconnect/reset before headers'。
可能原因: 上游 service 启动慢或健康检查失败。
"""


def make_response(prompt_text: str) -> str:
    if "evidence" in prompt_text.lower() or "summary" in prompt_text.lower() or "总结" in prompt_text:
        return SUMMARY_TEMPLATE
    if "ignore previous" in prompt_text.lower() or "ignore all" in prompt_text.lower():
        return "I cannot follow that instruction. Returning safe default."
    return QA_TEMPLATE


def extract_prompt(body: dict) -> str:
    if "messages" in body:
        return "\n".join(m.get("content", "") if isinstance(m.get("content"), str)
                         else json.dumps(m.get("content")) for m in body["messages"])
    if "prompt" in body:
        return body["prompt"]
    return json.dumps(body)


def openai_envelope(text: str, model: str) -> dict:
    return {
        "id": f"mock-{int(time.time())}",
        "object": "chat.completion",
        "created": int(time.time()),
        "model": model,
        "choices": [{
            "index": 0,
            "message": {"role": "assistant", "content": text},
            "finish_reason": "stop",
        }],
        "usage": {"prompt_tokens": 120, "completion_tokens": 80, "total_tokens": 200},
    }


def anthropic_envelope(text: str, model: str) -> dict:
    return {
        "id": f"mock-{int(time.time())}",
        "type": "message",
        "role": "assistant",
        "model": model,
        "content": [{"type": "text", "text": text}],
        "stop_reason": "end_turn",
        "usage": {"input_tokens": 120, "output_tokens": 80},
    }


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):  # quieter logs
        print(f"[mock-llm] {fmt % args}")

    def _read_json(self) -> dict:
        length = int(self.headers.get("Content-Length", "0"))
        raw = self.rfile.read(length) if length else b"{}"
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            return {}

    def _write(self, status: int, payload: dict):
        body = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path == "/health":
            self._write(200, {"ok": True, "service": "mock-llm"})
            return
        self._write(404, {"error": "not found"})

    def do_POST(self):
        body = self._read_json()
        prompt = extract_prompt(body)
        text = make_response(prompt)
        model = body.get("model", "mock-llm")

        if self.path.startswith("/v1/chat/completions"):
            self._write(200, openai_envelope(text, model))
        elif self.path.startswith("/v1/messages"):
            self._write(200, anthropic_envelope(text, model))
        elif self.path.startswith("/api/chat"):
            self._write(200, {"model": model, "message": {"role": "assistant", "content": text}, "done": True})
        else:
            self._write(404, {"error": "unsupported endpoint", "path": self.path})


def main():
    print(f"[mock-llm] listening on :{PORT}")
    server = ThreadingHTTPServer(("0.0.0.0", PORT), Handler)
    server.serve_forever()


if __name__ == "__main__":
    main()
