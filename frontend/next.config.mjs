/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  reactStrictMode: true,
  // 用 Next 服务端 rewrite 代理到 backend，浏览器走 /api/* 同源,不需要 CORS
  // INTERNAL_BACKEND_URL 在容器内部解析 docker DNS, 不依赖宿主机 IP
  async rewrites() {
    const backend = process.env.INTERNAL_BACKEND_URL || "http://backend:8000";
    return [{ source: "/api/:path*", destination: `${backend}/:path*` }];
  },
};
export default nextConfig;
