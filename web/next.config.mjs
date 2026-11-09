/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
  // 构建产物目录可用环境变量隔离（如 NEXT_DIST_DIR=.next-prod），
  // 公网构建与本地开发构建互不覆盖，无需删除对方产物。
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // 构建时间戳：注入客户端，用于页面角落的版本水印，
  // 让使用者能确认自己看到的是否为最新构建（排查缓存问题的判据）。
  env: {
    NEXT_PUBLIC_BUILD_TIME: new Date().toISOString(),
  },
  // HTML 文档不走长缓存：/chat、/tasks 等是静态预渲染，Next 默认给
  // s-maxage=31536000，浏览器可能长期复用旧 HTML，导致新构建的样式/脚本
  // 在用户端不可见。改为每次重新验证（ETag 命中仍走 304，代价极小）。
  // _next/static 带内容 hash 的资源不受影响，继续保持一年强缓存。
  async headers() {
    return [
      {
        source: "/((?!_next/static|_next/image|favicon.ico|hero-campus.jpg|illustrations|logo).*)",
        headers: [
          { key: "Cache-Control", value: "public, max-age=0, must-revalidate" },
        ],
      },
    ];
  },
  // 公网部署时前端与后端不同源：把 /api 透传给本机后端，
  // 这样只需暴露一个端口，也不依赖后端 CORS 放行随机域名。
  async rewrites() {
    const backend = process.env.BACKEND_ORIGIN || "http://127.0.0.1:3001";
    return [{ source: "/api/:path*", destination: `${backend}/api/:path*` }];
  },
};

export default nextConfig;
