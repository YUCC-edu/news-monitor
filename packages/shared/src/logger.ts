type LogLevel = "debug" | "info" | "warn" | "error";

type LogContext = Record<string, unknown>;

type Logger = {
  debug: (message: string, context?: LogContext) => void;
  info: (message: string, context?: LogContext) => void;
  warn: (message: string, context?: LogContext) => void;
  error: (message: string, context?: LogContext) => void;
  child: (context?: LogContext) => Logger;
};

const LEVEL_WEIGHT: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function getLogLevel(): LogLevel {
  const raw = (process.env.LOG_LEVEL ?? "info").trim().toLowerCase();
  if (raw === "debug" || raw === "info" || raw === "warn" || raw === "error") return raw;
  return "info";
}

function getModuleAllowList(): Set<string> | null {
  const raw = process.env.LOG_MODULES?.trim();
  if (!raw) return null;
  const values = raw
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
  return values.length > 0 ? new Set(values) : null;
}

function normalizeError(value: unknown): unknown {
  if (!(value instanceof Error)) return value;
  return {
    name: value.name,
    message: value.message,
    stack: value.stack,
  };
}

function contextToText(context: LogContext | undefined): string {
  if (!context || Object.keys(context).length === 0) return "";
  const parts: string[] = [];
  for (const [key, raw] of Object.entries(context)) {
    const v = normalizeError(raw);
    if (v == null) {
      parts.push(`${key}=null`);
      continue;
    }
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
      parts.push(`${key}=${String(v)}`);
      continue;
    }
    try {
      parts.push(`${key}=${JSON.stringify(v)}`);
    } catch {
      parts.push(`${key}=[unserializable]`);
    }
  }
  return parts.length > 0 ? ` ${parts.join(" ")}` : "";
}

function shouldLog(level: LogLevel, moduleName: string): boolean {
  if (LEVEL_WEIGHT[level] < LEVEL_WEIGHT[getLogLevel()]) return false;
  const allow = getModuleAllowList();
  if (!allow) return true;
  return allow.has(moduleName);
}

function createLoggerWithBase(moduleName: string, base: LogContext): Logger {
  const write = (level: LogLevel, message: string, context?: LogContext) => {
    if (!shouldLog(level, moduleName)) return;
    const merged = context ? { ...base, ...context } : base;
    const time = new Date().toISOString();
    const line = `[${time}] [${level}] [${moduleName}] ${message}${contextToText(merged)}`;
    if (level === "error") {
      console.error(line);
      return;
    }
    if (level === "warn") {
      console.warn(line);
      return;
    }
    console.log(line);
  };

  return {
    debug: (message, context) => write("debug", message, context),
    info: (message, context) => write("info", message, context),
    warn: (message, context) => write("warn", message, context),
    error: (message, context) => write("error", message, context),
    child: (context) => createLoggerWithBase(moduleName, { ...base, ...(context ?? {}) }),
  };
}

export function createLogger(moduleName: string): Logger {
  return createLoggerWithBase(moduleName, {});
}

export type { Logger, LogLevel };
