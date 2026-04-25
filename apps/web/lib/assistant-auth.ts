import type { AssistantRole } from "./assistant-contract";

export type AssistantActor = {
  actor: string;
  role: AssistantRole;
};

export function resolveAssistantActor(request: Request): AssistantActor {
  const roleHeader = request.headers.get("x-assistant-role");
  const role: AssistantRole =
    roleHeader === "assistant_write_low" ? "assistant_write_low" : "assistant_read";
  const actor = request.headers.get("x-assistant-actor")?.trim() || "anonymous";
  return { actor, role };
}

export function checkAssistantWritePermission(request: Request): {
  allowed: boolean;
  reason?: string;
} {
  const enforce = process.env.ASSISTANT_ENFORCE_AUTH === "1";
  if (!enforce) return { allowed: true };
  const expected = process.env.ASSISTANT_API_KEY;
  if (!expected) return { allowed: false, reason: "ASSISTANT_API_KEY is not configured" };
  const provided = request.headers.get("x-assistant-key");
  if (!provided || provided !== expected) return { allowed: false, reason: "invalid assistant key" };
  const role = request.headers.get("x-assistant-role");
  if (role !== "assistant_write_low") return { allowed: false, reason: "assistant_write_low role required" };
  return { allowed: true };
}
