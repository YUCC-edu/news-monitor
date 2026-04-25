import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: [
    "@news/ai",
    "@news/connectors-core",
    "@news/connectors-hn",
    "@news/connectors-rss",
    "@news/connectors-wechat-wewe",
    "@news/connectors-x-rsshub",
    "@news/db",
    "@news/engine",
    "@news/shared",
  ],
  typedRoutes: false,
};

export default nextConfig;
