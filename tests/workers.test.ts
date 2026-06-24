import assert from "node:assert/strict";
import { canCleanupStagingMissingServer } from "../src/lib/reconciliation-cleanup";
import {
  appendWorkerHistory,
  MAX_WORKER_HISTORY,
  nextModpackRetryAt,
  shouldProcessMinecraftSync,
  shouldRetryModpackJob,
  type WorkerRunEntry,
} from "../src/lib/workers/shared";

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (error) {
    console.error(`✗ ${name}`);
    throw error;
  }
}

const now = new Date("2026-06-24T10:00:00.000Z");

test("Minecraft worker processes only pending syncs whose retry is due", () => {
  assert.equal(shouldProcessMinecraftSync({ status: "pending" }, now), true);
  assert.equal(
    shouldProcessMinecraftSync(
      { status: "pending", next_retry_at: "2026-06-24T09:59:59.000Z" },
      now,
    ),
    true,
  );
  assert.equal(
    shouldProcessMinecraftSync(
      { status: "pending", next_retry_at: "2026-06-24T10:05:00.000Z" },
      now,
    ),
    false,
  );
});

test("Minecraft worker ignores success and failed syncs", () => {
  assert.equal(shouldProcessMinecraftSync({ status: "success" }, now), false);
  assert.equal(shouldProcessMinecraftSync({ status: "failed" }, now), false);
  assert.equal(shouldProcessMinecraftSync(null, now), false);
});

test("Reconciliation worker cleanup remains limited to missing staging servers", () => {
  assert.equal(
    canCleanupStagingMissingServer({ metadata: { staging: true }, pterodactylServerMissing: true }),
    true,
  );
  assert.equal(
    canCleanupStagingMissingServer({
      metadata: { staging: true },
      pterodactylServerMissing: false,
    }),
    false,
  );
  assert.equal(
    canCleanupStagingMissingServer({
      metadata: { customer: true },
      pterodactylServerMissing: true,
    }),
    false,
  );
});

test("Modpack worker retries queued and due failed jobs only below max attempts", () => {
  assert.equal(
    shouldRetryModpackJob({ status: "queued", attempts: 0, max_attempts: 5 }, now),
    true,
  );
  assert.equal(
    shouldRetryModpackJob(
      {
        status: "failed",
        attempts: 1,
        max_attempts: 5,
        updated_at: "2026-06-24T09:58:00.000Z",
      },
      now,
    ),
    true,
  );
  assert.equal(
    shouldRetryModpackJob(
      {
        status: "failed",
        attempts: 1,
        max_attempts: 5,
        updated_at: "2026-06-24T09:59:30.000Z",
      },
      now,
    ),
    false,
  );
  assert.equal(
    shouldRetryModpackJob({ status: "failed", attempts: 5, max_attempts: 5 }, now),
    false,
  );
  assert.equal(
    shouldRetryModpackJob({ status: "ready", attempts: 1, max_attempts: 5 }, now),
    false,
  );
});

test("Modpack retry schedule is progressive", () => {
  assert.equal(
    nextModpackRetryAt(
      { status: "failed", attempts: 0, updated_at: "2026-06-24T10:00:00.000Z" },
      now,
    ),
    "2026-06-24T10:00:30.000Z",
  );
  assert.equal(
    nextModpackRetryAt(
      { status: "failed", attempts: 3, updated_at: "2026-06-24T10:00:00.000Z" },
      now,
    ),
    "2026-06-24T10:05:00.000Z",
  );
});

test("Worker history keeps only the latest 100 entries", () => {
  let history: WorkerRunEntry[] = [];
  for (let index = 0; index < MAX_WORKER_HISTORY + 12; index += 1) {
    history = appendWorkerHistory(history, {
      id: `run-${index}`,
      worker: "minecraft-sync",
      started_at: now.toISOString(),
      finished_at: now.toISOString(),
      duration_ms: index,
      success: true,
      processed: index,
    });
  }
  assert.equal(history.length, MAX_WORKER_HISTORY);
  assert.equal(history[0].id, `run-${MAX_WORKER_HISTORY + 11}`);
  assert.equal(history.at(-1)?.id, "run-12");
});
