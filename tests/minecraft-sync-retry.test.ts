import { strict as assert } from "node:assert";
import {
  INITIAL_MINECRAFT_SYNC_MAX_ATTEMPTS,
  isRetryableInitialMinecraftSyncError,
  nextInitialMinecraftSyncRetry,
} from "../src/lib/minecraft-sync-retry";

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (error) {
    console.error(`✗ ${name}`);
    throw error;
  }
}

const baseNow = new Date("2026-06-21T10:00:00.000Z");

test("initial Minecraft sync treats install conflicts as retryable", () => {
  assert.equal(
    isRetryableInitialMinecraftSyncError(
      "Pterodactyl 409 ServerStateConflictException: This server has not yet completed its installation process",
    ),
    true,
  );
  assert.equal(
    isRetryableInitialMinecraftSyncError("server.properties not found while installing"),
    true,
  );
  assert.equal(isRetryableInitialMinecraftSyncError("Permission denied: invalid token"), false);
});

test("initial Minecraft sync retry schedule is progressive", () => {
  assert.deepEqual(nextInitialMinecraftSyncRetry(0, baseNow), {
    retryCount: 1,
    nextRetryAt: "2026-06-21T10:00:30.000Z",
  });
  assert.deepEqual(nextInitialMinecraftSyncRetry(1, baseNow), {
    retryCount: 2,
    nextRetryAt: "2026-06-21T10:01:00.000Z",
  });
  assert.deepEqual(nextInitialMinecraftSyncRetry(2, baseNow), {
    retryCount: 3,
    nextRetryAt: "2026-06-21T10:02:00.000Z",
  });
  assert.deepEqual(nextInitialMinecraftSyncRetry(3, baseNow), {
    retryCount: 4,
    nextRetryAt: "2026-06-21T10:05:00.000Z",
  });
});

test("initial Minecraft sync retry count is capped", () => {
  const retry = nextInitialMinecraftSyncRetry(99, baseNow);
  assert.equal(retry.retryCount, INITIAL_MINECRAFT_SYNC_MAX_ATTEMPTS);
  assert.equal(retry.nextRetryAt, "2026-06-21T10:05:00.000Z");
});
