import { randomUUID } from "node:crypto";

export type AssistantRole = "assistant_read" | "assistant_write_low";

export type AssistantToolEnvelope<T> = {
  tool: string;
  ok: boolean;
  data: T | null;
  error: string | null;
  requestId: string;
  latencyMs: number;
};

export function makeRequestId() {
  return randomUUID();
}

export function toolOk<T>(
  tool: string,
  requestId: string,
  startedAt: number,
  data: T,
): AssistantToolEnvelope<T> {
  return {
    tool,
    ok: true,
    data,
    error: null,
    requestId,
    latencyMs: Date.now() - startedAt,
  };
}

export function toolError(
  tool: string,
  requestId: string,
  startedAt: number,
  error: string,
): AssistantToolEnvelope<null> {
  return {
    tool,
    ok: false,
    data: null,
    error,
    requestId,
    latencyMs: Date.now() - startedAt,
  };
}
