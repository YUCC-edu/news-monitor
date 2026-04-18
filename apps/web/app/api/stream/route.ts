import { createRedisSseBus } from "@/lib/sse-bus";

export const runtime = "nodejs";

export async function GET(request: Request) {
  let cleanup: (() => Promise<void>) | null = null;
  const stream = new ReadableStream({
    async start(controller) {
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
          write(parsed.type ?? "message", parsed);
        } catch {
          write("message", { type: "message", payload });
        }
      });
      await bus.start();
      cleanup = async () => {
        clearInterval(ping);
        await bus.stop();
      };
      request.signal.addEventListener("abort", () => {
        void cleanup?.();
      });
    },
    async cancel() {
      if (cleanup) await cleanup();
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
