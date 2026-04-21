import { logTimelineServer } from "@news/shared";
import { createLogger } from "@news/shared";
import { createRedisSseBus } from "@/lib/sse-bus";

export const runtime = "nodejs";
const log = createLogger("api:stream");

export async function GET(request: Request) {
  const t0 = Date.now();
  let cleanup: (() => Promise<void>) | null = null;
  const stream = new ReadableStream({
    async start(controller) {
      log.debug("sse stream start");
      const encoder = new TextEncoder();
      const write = (event: string, data: unknown) => {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
        );
      };

      write("connected", { ok: true, ts: Date.now() });
      const ping = setInterval(() => {
        controller.enqueue(encoder.encode(": ping\n\n"));
      }, 15_000);

      const bus = createRedisSseBus((channel, payload) => {
        if (channel === "sources.changed") {
          try {
            write("sources.changed", JSON.parse(payload) as Record<string, unknown>);
          } catch {
            write("sources.changed", { raw: payload });
          }
          return;
        }
        try {
          const parsed = JSON.parse(payload) as { type?: string; [k: string]: unknown };
          const t = parsed.type;
          if (t === "item.created") {
            const it = parsed.item as { id?: string; sourceId?: string; title?: string } | undefined;
            logTimelineServer("sse", "fanout item.created → browser", {
              itemId: it?.id,
              sourceId: it?.sourceId,
              title: it?.title?.slice(0, 80),
            });
          }
          write(parsed.type ?? "message", parsed);
        } catch {
          log.warn("sse payload parse failed; forwarding raw payload");
          write("message", { type: "message", payload });
        }
      });
      await bus.start();
      log.info("sse bus started", { latencyMs: Date.now() - t0 });
      cleanup = async () => {
        clearInterval(ping);
        await bus.stop();
        log.debug("sse bus stopped");
      };
      request.signal.addEventListener("abort", () => {
        void cleanup?.();
      });
    },
    async cancel() {
      if (cleanup) await cleanup();
      log.debug("sse stream cancelled");
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
