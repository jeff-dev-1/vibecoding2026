"use client";

import { useState } from "react";

export default function LoginPage() {
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch("/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      if (r.ok) {
        window.location.href = "/";
      } else {
        const b = await r.json().catch(() => ({}));
        setErr(b?.error || "登录失败");
      }
    } catch (e: any) {
      setErr(String(e?.message || e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-100 via-indigo-50 to-violet-100 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="mb-2 text-4xl">🛡️</div>
          <h1 className="text-xl font-semibold text-slate-800">AI Native 日志分析平台</h1>
          <p className="mt-1 text-sm text-slate-500">
            上传日志 → AI 结构化分析 → 带证据的安全洞察
          </p>
        </div>

        <form
          onSubmit={submit}
          className="rounded-2xl border border-slate-200 bg-white/80 p-6 shadow-xl backdrop-blur"
        >
          <label className="mb-1.5 block text-xs font-medium text-slate-600">用户名</label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="用户名"
            className="mb-3 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
          />
          <label className="mb-1.5 block text-xs font-medium text-slate-600">访问密码</label>
          <input
            type="password"
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="请输入密码"
            className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
          />
          {err && <p className="mt-2 text-sm text-rose-600">{err}</p>}
          <button
            type="submit"
            disabled={busy || !username || !password}
            className="mt-4 w-full rounded-lg bg-gradient-to-r from-indigo-600 to-violet-600 py-2.5 text-sm font-medium text-white shadow-sm transition hover:from-indigo-700 hover:to-violet-700 disabled:opacity-50"
          >
            {busy ? "验证中…" : "进入"}
          </button>
        </form>

        <p className="mt-4 text-center text-xs text-slate-400">
          模型控制面 Envoy AI Gateway · Guardrail 三态 · 供应链门禁 Koi · DeepSeek/Qwen 双模型
        </p>
      </div>
    </div>
  );
}
