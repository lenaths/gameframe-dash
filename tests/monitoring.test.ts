import assert from "node:assert/strict";
import { sanitizeMonitoringContext } from "../src/lib/monitoring.shared";
import { reportServerError, getServerMonitoringConfig } from "../src/lib/monitoring.server";

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (error) {
    console.error(`✗ ${name}`);
    throw error;
  }
}

test("monitoring sanitize removes secrets and keeps safe ids", () => {
  const sanitized = sanitizeMonitoringContext({
    order_id: "order-1",
    server_order_id: "server-order-1",
    token: "secret-token",
    nested: {
      api_key: "secret-api-key",
      plan: "Iron",
      password: "hunter2",
    },
  }) as Record<string, unknown>;
  assert.equal(sanitized.order_id, "order-1");
  assert.equal(sanitized.server_order_id, "server-order-1");
  assert.equal(sanitized.token, "[redacted]");
  assert.deepEqual(sanitized.nested, {
    api_key: "[redacted]",
    plan: "Iron",
    password: "[redacted]",
  });
});

test("monitoring sanitize truncates long values", () => {
  const sanitized = sanitizeMonitoringContext({ value: "x".repeat(700) }) as Record<string, string>;
  assert.equal(sanitized.value.length < 540, true);
  assert.equal(sanitized.value.endsWith("...[truncated]"), true);
});

test("server monitoring helpers do not crash without DSN", () => {
  const previous = process.env.SENTRY_DSN;
  delete process.env.SENTRY_DSN;
  assert.doesNotThrow(() => reportServerError(new Error("test"), { order_id: "order-1" }));
  const config = getServerMonitoringConfig();
  assert.equal(config.serverDsnConfigured, false);
  process.env.SENTRY_DSN = previous;
});
