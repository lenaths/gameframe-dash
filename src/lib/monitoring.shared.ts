const SECRET_KEY_PATTERN =
  /token|secret|api[_-]?key|password|authorization|cookie|stripe[_-]?secret|resend|curseforge|pterodactyl/i;
const MAX_STRING_LENGTH = 500;
const MAX_DEPTH = 5;

export type MonitoringContext = Record<string, unknown>;

export function sanitizeMonitoringContext(context: unknown, depth = 0): unknown {
  if (depth > MAX_DEPTH) return "[truncated]";
  if (context == null) return context;
  if (typeof context === "string") {
    return context.length > MAX_STRING_LENGTH
      ? `${context.slice(0, MAX_STRING_LENGTH)}...[truncated]`
      : context;
  }
  if (typeof context === "number" || typeof context === "boolean") return context;
  if (Array.isArray(context)) {
    return context.slice(0, 25).map((item) => sanitizeMonitoringContext(item, depth + 1));
  }
  if (typeof context !== "object") return String(context);

  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(context as Record<string, unknown>)) {
    if (SECRET_KEY_PATTERN.test(key)) {
      output[key] = "[redacted]";
      continue;
    }
    output[key] = sanitizeMonitoringContext(value, depth + 1);
  }
  return output;
}

export function monitoringSampleRate(raw: string | undefined, fallback = 0.1) {
  const value = Number(raw);
  if (!Number.isFinite(value)) return fallback;
  return Math.max(0, Math.min(1, value));
}
