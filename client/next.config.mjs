import { fileURLToPath } from "node:url";

/** @type {import('next').NextConfig} */
const nextConfig = {
  agentRules: false,
  turbopack: { root: fileURLToPath(new URL("..", import.meta.url)) },
  async rewrites() {
    const apiUrl = process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:4001";
    return [
      {
        source: "/uploads/:path*",
        destination: `${apiUrl}/uploads/:path*`
      }
    ];
  }
};

export default nextConfig;
