import { monitoringSampleRate, sanitizeMonitoringContext } from "@/lib/monitoring.shared";

type SentryNodeModule = typeof import("@sentry/node");

let initialized = false;
let warnedDisabled = false;
let sentryModulePromise: Promise<SentryNodeModule> | null = null;

function loadSentryNode() {
  sentryModulePromise ??= (
    new Function("specifier", "return import(specifier)") as (
      specifier: string,
    ) => Promise<SentryNodeModule>
  )("@sentry/node");
  return sentryModulePromise;
}

export function getServerMonitoringConfig() {
  return {
    serverDsnConfigured: Boolean(process.env.SENTRY_DSN?.trim()),
    frontendDsnConfigured: Boolean(process.env.VITE_SENTRY_DSN?.trim()),
    environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || "development",
    tracesSampleRate: monitoringSampleRate(process.env.SENTRY_TRACES_SAMPLE_RATE, 0.1),
  };
}

export function initServerMonitoring() {
  void initServerMonitoringAsync();
}

async function initServerMonitoringAsync() {
  if (initialized) return;
  initialized = true;
  const dsn = process.env.SENTRY_DSN?.trim();
  if (!dsn) {
    if (!warnedDisabled) {
      warnedDisabled = true;
      console.info("monitoring disabled: SENTRY_DSN is not configured");
    }
    return;
  }
  const Sentry = await loadSentryNode();
  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || "development",
    release: process.env.SENTRY_RELEASE || process.env.VERCEL_GIT_COMMIT_SHA || undefined,
    tracesSampleRate: monitoringSampleRate(process.env.SENTRY_TRACES_SAMPLE_RATE, 0.1),
    beforeSend(event) {
      if (event.extra)
        event.extra = sanitizeMonitoringContext(event.extra) as Record<string, unknown>;
      if (event.contexts)
        event.contexts = sanitizeMonitoringContext(event.contexts) as typeof event.contexts;
      return event;
    },
  });
}

function report(error: unknown, context: Record<string, unknown>, tag: string) {
  void reportAsync(error, context, tag);
}

async function reportAsync(error: unknown, context: Record<string, unknown>, tag: string) {
  await initServerMonitoringAsync();
  if (!process.env.SENTRY_DSN?.trim()) return;
  const Sentry = await loadSentryNode();
  Sentry.captureException(error, {
    tags: { area: tag },
    extra: sanitizeMonitoringContext(context) as Record<string, unknown>,
  });
}

export function reportServerError(error: unknown, context: Record<string, unknown> = {}) {
  report(error, context, "server");
}

export function reportProvisioningError(error: unknown, context: Record<string, unknown> = {}) {
  report(error, context, "provisioning");
}

export function reportCheckoutError(error: unknown, context: Record<string, unknown> = {}) {
  report(error, context, "checkout");
}

export function reportSyncError(error: unknown, context: Record<string, unknown> = {}) {
  report(error, context, "sync");
}

export function reportCurseForgeError(error: unknown, context: Record<string, unknown> = {}) {
  report(error, context, "curseforge");
}

export async function captureAdminMonitoringTest(actorUserId: string) {
  await initServerMonitoringAsync();
  const config = getServerMonitoringConfig();
  if (!process.env.SENTRY_DSN?.trim()) {
    return {
      ok: true as const,
      sent: false,
      config,
      message: "monitoring disabled: SENTRY_DSN is not configured",
    };
  }
  const Sentry = await loadSentryNode();
  Sentry.captureMessage("XNTServers admin monitoring test", {
    level: "info",
    tags: { area: "admin_monitoring_test" },
    extra: sanitizeMonitoringContext({
      actor_user_id: actorUserId,
      action: "admin_test_event",
    }) as Record<string, unknown>,
  });
  return { ok: true as const, sent: true, config, message: "Sentry test event queued" };
}
