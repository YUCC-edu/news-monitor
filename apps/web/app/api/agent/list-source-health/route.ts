import { executeCapability } from "@news/engine";
import { NextResponse } from "next/server";
import { makeRequestId, toolError, toolOk } from "@/lib/assistant-contract";

export async function GET(request: Request) {
  const requestId = request.headers.get("x-request-id") ?? makeRequestId();
  const startedAt = Date.now();
  try {
    const result = await executeCapability("health.sources", {});
    if (!result.ok) {
      return NextResponse.json(toolError("list_source_health", requestId, startedAt, result.error.message), {
        status: 400,
      });
    }
    const data = result.data as {
      total: number;
      sources: Array<Record<string, unknown>>;
    };
    return NextResponse.json(
      toolOk("list_source_health", requestId, startedAt, {
        total: data.total,
        sources: data.sources,
      }),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(toolError("list_source_health", requestId, startedAt, message), {
      status: 500,
    });
  }
}
