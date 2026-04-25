import { buildSystemStatusSnapshot, executeCapability } from "@news/engine";
import { createLogger } from "@news/shared";
import { NextResponse } from "next/server";

const log = createLogger("api:system");
const SYSTEM_CACHE_TTL_MS = 5000;
let systemCache:
  | {
      payload: Awaited<ReturnType<typeof buildPayload>>;
      expiresAt: number;
    }
  | null = null;
let inflightSnapshot: Promise<Awaited<ReturnType<typeof buildPayload>>> | null = null;

async function buildPayload(): Promise<Awaited<ReturnType<typeof buildSystemStatusSnapshot>>> {
  const result = await executeCapability("system.status", {});
  if (!result.ok) {
    throw new Error(result.error.message);
  }
  return result.data as Awaited<ReturnType<typeof buildSystemStatusSnapshot>>;
}

export async function GET() {
  const t0 = Date.now();
  if (systemCache && Date.now() < systemCache.expiresAt) {
    log.debug("system snapshot cache hit", { latencyMs: Date.now() - t0 });
    return NextResponse.json(systemCache.payload);
  }
  try {
    if (!inflightSnapshot) {
      inflightSnapshot = buildPayload().finally(() => {
        inflightSnapshot = null;
      });
    }
    const payload = await inflightSnapshot;
    systemCache = { payload, expiresAt: Date.now() + SYSTEM_CACHE_TTL_MS };
    log.debug("system snapshot generated", {
      latencyMs: Date.now() - t0,
      redisOk: payload.env.redis.ok,
      rsshubOk: payload.env.rsshub.ok,
      weweOk: payload.env.wewe.ok,
      queueNames: Object.keys(payload.queues).join(","),
    });
    return NextResponse.json(payload);
  } catch (error) {
    log.warn("system snapshot failed", {
      latencyMs: Date.now() - t0,
      errorClass: error instanceof Error ? error.name : typeof error,
      message: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: "failed to build system snapshot" }, { status: 500 });
  }
}
