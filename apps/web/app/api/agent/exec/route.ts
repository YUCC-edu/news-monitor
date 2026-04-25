import { capabilityCatalog, capabilityNameSchema, executeCapability } from "@news/engine";
import { NextResponse } from "next/server";
import { checkAssistantWritePermission } from "@/lib/assistant-auth";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | { capability?: string; input?: unknown }
    | null;
  const parsed = capabilityNameSchema.safeParse(body?.capability);
  if (!parsed.success) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "invalid_input",
          message: "capability is required and must be a supported capability name",
        },
      },
      { status: 400 },
    );
  }

  const capability = parsed.data;
  if (capabilityCatalog[capability].writesData) {
    const gate = checkAssistantWritePermission(request);
    if (!gate.allowed) {
      return NextResponse.json(
        {
          ok: false,
          capability,
          error: {
            code: "permission_denied",
            message: gate.reason ?? "forbidden",
          },
        },
        { status: 403 },
      );
    }
  }

  const result = await executeCapability(capability, body?.input ?? {});
  const payload = result.ok
    ? (result.data as { conflict?: boolean; existing?: unknown })
    : null;
  if (result.ok && payload?.conflict) {
    return NextResponse.json(
      {
        ok: false,
        capability,
        error: {
          code: "conflict",
          message: "resource already exists",
          details: { existing: payload.existing },
        },
      },
      { status: 409 },
    );
  }
  const status =
    result.ok
      ? 200
      : result.error.code === "permission_denied"
        ? 403
        : result.error.code === "not_found"
          ? 404
          : result.error.code === "conflict"
            ? 409
            : result.error.code === "invalid_input"
              ? 400
              : 500;
  return NextResponse.json(result, { status });
}
