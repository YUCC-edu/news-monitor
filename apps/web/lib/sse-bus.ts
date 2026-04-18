import Redis from "ioredis";

type OnMessage = (channel: string, payload: string) => void;

export function createRedisSseBus(onMessage: OnMessage) {
  const redisUrl = process.env.REDIS_URL ?? "redis://127.0.0.1:6379";
  const sub = new Redis(redisUrl, { maxRetriesPerRequest: null });

  const handleMessage = (channel: string, payload: string) => {
    if (channel !== "news.events" && channel !== "sources.changed") return;
    onMessage(channel, payload);
  };

  sub.on("message", handleMessage);

  async function start() {
    await sub.subscribe("news.events", "sources.changed");
  }

  async function stop() {
    sub.off("message", handleMessage);
    await sub.quit();
  }

  return { start, stop };
}
