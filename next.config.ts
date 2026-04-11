import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/app",
        destination: "/admin-panel",
      },
      {
        source: "/app/:path*",
        destination: "/admin-panel/:path*",
      },
    ];
  },
};

export default nextConfig;
