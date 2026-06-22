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

export function isHiddenFromCustomerMetadata(metadata: unknown) {
  const root =
    metadata && typeof metadata === "object" ? (metadata as Record<string, unknown>) : {};
  return root.hidden_from_customer === true;
}

export function canShowServerOrderToCustomer(metadata: unknown) {
  return !isHiddenFromCustomerMetadata(metadata);
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
  hideFromCustomer?: boolean;
  hiddenReason?: string;
}) {
  const root =
    input.existingMetadata && typeof input.existingMetadata === "object"
      ? (input.existingMetadata as Record<string, unknown>)
      : {};
  const hidden = input.hideFromCustomer
    ? {
        hidden_from_customer: true,
        hidden_at: input.archivedAt,
        hidden_reason: input.hiddenReason ?? "staging_cleanup",
      }
    : {};
  return {
    ...root,
    archived_reason: "pterodactyl_server_missing",
    archived_at: input.archivedAt,
    archived_by: input.actorUserId,
    cleanup_source: "admin_reconciliation",
    infrastructure_server_missing: true,
    ...hidden,
  };
}

export function restoreCustomerVisibilityMetadata(metadata: unknown) {
  const root =
    metadata && typeof metadata === "object" ? (metadata as Record<string, unknown>) : {};
  const { hidden_from_customer, hidden_at, hidden_reason, ...rest } = root;
  void hidden_from_customer;
  void hidden_at;
  void hidden_reason;
  return rest;
}
