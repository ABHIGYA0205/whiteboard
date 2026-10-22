/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    externalDir: true
  },
  eslint: {
    ignoreDuringBuilds: true
  },
  async rewrites() {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4001";
    return [
      {
        source: "/uploads/:path*",
        destination: `${apiUrl}/uploads/:path*`
      }
    ];
  }
};

export default nextConfig;
