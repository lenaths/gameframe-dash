export function isArchivedServerOrderMetadata(metadata: unknown) {
  const root =
    metadata && typeof metadata === "object" ? (metadata as Record<string, unknown>) : {};
  return Boolean(
    root.archived_at || root.archived_reason || root.cleanup_source === "admin_reconciliation",
  );
}

export function isStagingServerOrderMetadata(metadata: unknown) {
  const root =
    metadata && typeof metadata === "object" ? (metadata as Record<string, unknown>) : {};
  return Boolean(
    root.staging || root.test || root.run_id || root.source === "staging_provisioning_audit",
  );
}

export function canCleanupStagingMissingServer(input: {
  metadata: unknown;
  pterodactylServerMissing: boolean;
}) {
  return (
    input.pterodactylServerMissing &&
    isStagingServerOrderMetadata(input.metadata) &&
    !isArchivedServerOrderMetadata(input.metadata)
  );
}

export function buildMissingServerArchiveMetadata(input: {
  existingMetadata: unknown;
  actorUserId: string;
  archivedAt: string;
}) {
  const root =
    input.existingMetadata && typeof input.existingMetadata === "object"
      ? (input.existingMetadata as Record<string, unknown>)
      : {};
  return {
    ...root,
    archived_reason: "pterodactyl_server_missing",
    archived_at: input.archivedAt,
    archived_by: input.actorUserId,
    cleanup_source: "admin_reconciliation",
    infrastructure_server_missing: true,
  };
}
