import * as Sentry from "@sentry/react";
import { monitoringSampleRate, sanitizeMonitoringContext } from "@/lib/monitoring.shared";

let initialized = false;

export function initClientMonitoring() {
  if (initialized || typeof window === "undefined") return;
  initialized = true;
  const dsn = import.meta.env.VITE_SENTRY_DSN?.trim();
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment: import.meta.env.MODE || "development",
    release: import.meta.env.VITE_APP_VERSION || undefined,
    tracesSampleRate: monitoringSampleRate(import.meta.env.VITE_SENTRY_TRACES_SAMPLE_RATE, 0.1),
    beforeSend(event) {
      if (event.extra)
        event.extra = sanitizeMonitoringContext(event.extra) as Record<string, unknown>;
      if (event.contexts)
        event.contexts = sanitizeMonitoringContext(event.contexts) as typeof event.contexts;
      return event;
    },
  });
}

export function reportClientError(error: unknown, context: Record<string, unknown> = {}) {
  if (!initialized) initClientMonitoring();
  const dsn = import.meta.env.VITE_SENTRY_DSN?.trim();
  if (!dsn) {
    if (import.meta.env.DEV) console.warn("monitoring disabled: VITE_SENTRY_DSN is not configured");
    return;
  }
  Sentry.captureException(error, {
    extra: sanitizeMonitoringContext(context) as Record<string, unknown>,
  });
}
