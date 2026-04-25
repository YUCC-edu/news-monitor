import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function isLocalHostname(hostname: string) {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  return h === "localhost" || h === "127.0.0.1" || h === "::1";
}

function providedAdminToken(request: NextRequest) {
  const auth = request.headers.get("authorization") ?? "";
  const bearer = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  return (
    request.headers.get("x-app-admin-token") ??
    request.headers.get("x-assistant-key") ??
    request.cookies.get("app_admin_token")?.value ??
    bearer
  );
}

function getExpectedAdminToken() {
  return process.env.APP_ADMIN_TOKEN || process.env.ASSISTANT_API_KEY;
}

function hasAdminToken(request: NextRequest) {
  const expected = getExpectedAdminToken();
  const provided = providedAdminToken(request);
  return Boolean(expected && provided && provided === expected);
}

function isProtectedApiPath(path: string) {
  return (
    path === "/api/settings" ||
    path === "/api/system" ||
    path.startsWith("/api/sources") ||
    path.startsWith("/api/ops")
  );
}

function shouldGateAssistantWrite(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const method = request.method.toUpperCase();
  const write = WRITE_METHODS.has(method);
  if (!write) return false;
  return path.startsWith("/api/assistant/") || path.startsWith("/api/agent/");
}

function shouldRequireAdminAuth(request: NextRequest, isLocal: boolean, protectedApi: boolean) {
  if (!protectedApi || process.env.APP_ENFORCE_AUTH === "0") return false;
  if (!isLocal) return true;
  if (!WRITE_METHODS.has(request.method.toUpperCase())) return false;
  return Boolean(getExpectedAdminToken());
}

export function middleware(request: NextRequest) {
  const hostname = request.nextUrl.hostname || request.headers.get("host")?.split(":")[0] || "";
  const isLocal = isLocalHostname(hostname);
  if (!isLocal && process.env.ALLOW_LAN !== "1") {
    return NextResponse.json(
      { error: "LAN access disabled. Set ALLOW_LAN=1 to allow non-localhost access." },
      { status: 403 },
    );
  }

  const path = request.nextUrl.pathname;
  const protectedApi = isProtectedApiPath(path) || shouldGateAssistantWrite(request);
  if (shouldRequireAdminAuth(request, isLocal, protectedApi) && !hasAdminToken(request)) {
    return NextResponse.json(
      { error: "admin auth required" },
      { status: 401 },
    );
  }

  if (shouldGateAssistantWrite(request) && process.env.ASSISTANT_ENFORCE_AUTH === "1") {
    const expected = process.env.ASSISTANT_API_KEY;
    const key = request.headers.get("x-assistant-key");
    if (!expected || !key || key !== expected) {
      return NextResponse.json({ error: "assistant auth required" }, { status: 401 });
    }
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
