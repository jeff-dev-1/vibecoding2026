import { HomeClient } from "./HomeClient";
import { getLatestJobServer } from "@/lib/server-api";

// Server Component: 渲染前在服务端 (内网直连 backend) 预取最近一次分析,
// 首屏 HTML 即带数据, 省掉浏览器侧 listJobs+getJob 两次往返 (冷启时尤其明显)。
export const dynamic = "force-dynamic"; // 每次请求实时取, 不做静态化

export default async function Page() {
  const initialJob = await getLatestJobServer();
  return <HomeClient initialJob={initialJob} />;
}
