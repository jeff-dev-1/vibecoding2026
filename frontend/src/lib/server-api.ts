import type { Job } from "./api";

// 服务端 (Server Component / SSR) 直连内网 backend, 不走浏览器的 /api rewrite。
// (此模块只应被 server component 引用; 仅用 process.env, 不含浏览器 API)
// 鉴权由 middleware 的 demo_auth cookie 门把守; 页面能渲染说明已登录, backend 本身不校验。
function backendBase() {
  return process.env.INTERNAL_BACKEND_URL || "http://backend:8000";
}

// 首屏预取: 取最近一个完成的分析。
//
// 只取 1 条, 且交给数据库过滤 status。原来是 `?limit=10` 再在内存里挑一个 ——
// 每个 job 带 1000 条 sample_entries, 一次 2.6 MB, 其中 9 个当场扔掉,
// 首屏就白等这段传输。现在 status=done 由 SQL 过滤, 只传要用的那一份 (~260 KB)。
//
// 没有任何 done 的 job 时 (刚上传、还在分析) 再退一步取最近一条, 让页面能显示
// "分析中" 而不是空白。这一步只在确实没有完成分析时才发生。
// 失败返回 null → 客户端会自动回退到自己的 listJobs effect, 不影响可用性。
export async function getLatestJobServer(): Promise<Job | null> {
  const one = async (q: string): Promise<Job | null> => {
    const r = await fetch(`${backendBase()}/logs?${q}`, { cache: "no-store" });
    if (!r.ok) return null;
    const jobs = (await r.json()) as Job[];
    return jobs[0] ?? null;
  };
  try {
    return (await one("limit=1&status=done")) ?? (await one("limit=1"));
  } catch {
    return null;
  }
}
