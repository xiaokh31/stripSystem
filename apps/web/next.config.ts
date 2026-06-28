import type { NextConfig } from "next";

const apiProxyBaseUrl = normalizeApiBaseUrl(
  process.env.API_PROXY_BASE_URL ??
    process.env.API_BASE_URL ??
    "http://127.0.0.1/api",
);

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${apiProxyBaseUrl}/:path*`,
      },
    ];
  },
};

function normalizeApiBaseUrl(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

export default nextConfig;
