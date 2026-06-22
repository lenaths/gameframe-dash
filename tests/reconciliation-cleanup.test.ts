import assert from "node:assert/strict";
import {
  buildMissingServerArchiveMetadata,
  canCleanupStagingMissingServer,
  canShowServerOrderToCustomer,
  isArchivedServerOrderMetadata,
  isHiddenFromCustomerMetadata,
  isStagingServerOrderMetadata,
  restoreCustomerVisibilityMetadata,
} from "../src/lib/reconciliation-cleanup";

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (error) {
    console.error(`✗ ${name}`);
    throw error;
  }
}

test("staging missing server cleanup is restricted to staging metadata", () => {
  assert.equal(isStagingServerOrderMetadata({ staging: true }), true);
  assert.equal(isStagingServerOrderMetadata({ run_id: "staging-123" }), true);
  assert.equal(isStagingServerOrderMetadata({ source: "staging_provisioning_audit" }), true);
  assert.equal(isStagingServerOrderMetadata({ selected_game: "minecraft" }), false);
});

test("archived missing server references are detected and hidden", () => {
  assert.equal(isArchivedServerOrderMetadata({ archived_at: "2026-06-21T10:00:00Z" }), true);
  assert.equal(isArchivedServerOrderMetadata({ cleanup_source: "admin_reconciliation" }), true);
  assert.equal(isArchivedServerOrderMetadata({ staging: true }), false);
});

test("cleanup requires both staging metadata and verified missing infrastructure", () => {
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
      metadata: { selected_game: "minecraft" },
      pterodactylServerMissing: true,
    }),
    false,
  );
  assert.equal(
    canCleanupStagingMissingServer({
      metadata: { staging: true, archived_at: "now" },
      pterodactylServerMissing: true,
    }),
    false,
  );
});

test("archive metadata preserves history and never touches payment objects", () => {
  const metadata = buildMissingServerArchiveMetadata({
    existingMetadata: { staging: true, run_id: "staging-1" },
    actorUserId: "admin-user",
    archivedAt: "2026-06-21T10:00:00.000Z",
  });
  assert.equal(metadata.staging, true);
  assert.equal(metadata.run_id, "staging-1");
  assert.equal(metadata.archived_reason, "pterodactyl_server_missing");
  assert.equal(metadata.archived_by, "admin-user");
  assert.equal(metadata.cleanup_source, "admin_reconciliation");
  assert.equal("payment_id" in metadata, false);
  assert.equal("invoice_id" in metadata, false);
});

test("staging cleanup hides server from customer", () => {
  const metadata = buildMissingServerArchiveMetadata({
    existingMetadata: { staging: true, run_id: "staging-1" },
    actorUserId: "admin-user",
    archivedAt: "2026-06-22T10:00:00.000Z",
    hideFromCustomer: true,
    hiddenReason: "staging_cleanup",
  });
  assert.equal(metadata.hidden_from_customer, true);
  assert.equal(metadata.hidden_reason, "staging_cleanup");
  assert.equal(isHiddenFromCustomerMetadata(metadata), true);
  assert.equal(canShowServerOrderToCustomer(metadata), false);
});

test("real customer archive remains visible unless explicitly hidden", () => {
  const metadata = buildMissingServerArchiveMetadata({
    existingMetadata: { selected_game: "minecraft" },
    actorUserId: "admin-user",
    archivedAt: "2026-06-22T10:00:00.000Z",
  });
  assert.equal(isHiddenFromCustomerMetadata(metadata), false);
  assert.equal(canShowServerOrderToCustomer(metadata), true);
});

test("restoring visibility removes only customer hidden metadata", () => {
  const restored = restoreCustomerVisibilityMetadata({
    staging: true,
    archived_at: "2026-06-22T10:00:00.000Z",
    hidden_from_customer: true,
    hidden_at: "2026-06-22T10:00:00.000Z",
    hidden_reason: "staging_cleanup",
  });
  assert.equal(restored.staging, true);
  assert.equal(restored.archived_at, "2026-06-22T10:00:00.000Z");
  assert.equal("hidden_from_customer" in restored, false);
  assert.equal(canShowServerOrderToCustomer(restored), true);
});
