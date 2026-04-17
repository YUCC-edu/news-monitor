import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@news/shared", "@news/db"],
  experimental: {
    typedRoutes: false,
  },
};

export default nextConfig;
