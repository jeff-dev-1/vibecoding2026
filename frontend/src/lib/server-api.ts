import type { Job } from "./api";

// 服务端 (Server Component / SSR) 直连内网 backend, 不走浏览器的 /api rewrite。
// (此模块只应被 server component 引用; 仅用 process.env, 不含浏览器 API)
// 鉴权由 middleware 的 demo_auth cookie 门把守; 页面能渲染说明已登录, backend 本身不校验。
function backendBase() {
  return process.env.INTERNAL_BACKEND_URL || "http://backend:8000";
}

// 首屏预取: 取最近一个完成的分析 (与客户端 listJobs 选择逻辑一致)。
// 失败返回 null → 客户端会自动回退到自己的 listJobs effect, 不影响可用性。
export async function getLatestJobServer(): Promise<Job | null> {
  try {
    const r = await fetch(`${backendBase()}/logs?limit=10`, { cache: "no-store" });
    if (!r.ok) return null;
    const jobs = (await r.json()) as Job[];
    return jobs.find((j) => j.status === "done") || jobs[0] || null;
  } catch {
    return null;
  }
}
