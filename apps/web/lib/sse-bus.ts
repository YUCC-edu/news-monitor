import Redis from "ioredis";
import { createLogger } from "@news/shared";

type OnMessage = (channel: string, payload: string) => void;
const log = createLogger("web:sse-bus");

export function createRedisSseBus(onMessage: OnMessage) {
  const redisUrl = process.env.REDIS_URL ?? "redis://127.0.0.1:6379";
  const sub = new Redis(redisUrl, { lazyConnect: true, maxRetriesPerRequest: null });
  sub.on("error", (error) => {
    log.warn("redis sse connection error", {
      message: error instanceof Error ? error.message : String(error),
    });
  });

  const handleMessage = (channel: string, payload: string) => {
    if (channel !== "news.events" && channel !== "sources.changed") return;
    onMessage(channel, payload);
  };

  sub.on("message", handleMessage);

  async function start() {
    if (sub.status === "wait") await sub.connect();
    await sub.subscribe("news.events", "sources.changed");
  }

  async function stop() {
    sub.off("message", handleMessage);
    await sub.quit();
  }

  return { start, stop };
}
