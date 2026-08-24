import type { NextConfig } from "next";
import path from "path";

// Single source of truth for the deployment prefix. Set NEXT_PUBLIC_BASE_PATH=/dms
// when the app is served under /dms; leave unset for a root deployment. The same
// value is read by the API client (lib/basePath.ts) so fetch URLs include the
// prefix. Without this, API calls resolve to "/api/..." (no prefix) and hit the
// edge/nginx instead of the proxy rewrite -> 405.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

const nextConfig: NextConfig = {
  basePath: basePath || undefined,
  trailingSlash: Boolean(basePath),
  reactStrictMode: true,
  outputFileTracingRoot: path.join(__dirname),
  async rewrites() {
    const apiBase = process.env.DMS_API_URL || "http://127.0.0.1:3001";
    return [
      {
        source: "/api/:path*",
        destination: `${apiBase}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
