import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const standalone = process.env.NEXT_STANDALONE === "1";

const nextConfig: NextConfig = {
  ...(standalone
    ? {
        output: "standalone" as const,
        outputFileTracingRoot: path.join(__dirname, "../.."),
      }
    : {}),
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
