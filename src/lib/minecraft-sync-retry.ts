export const INITIAL_MINECRAFT_SYNC_MAX_ATTEMPTS = 5;
export const INITIAL_MINECRAFT_SYNC_RETRY_DELAYS_SECONDS = [30, 60, 120, 300, 300] as const;

export function isRetryableInitialMinecraftSyncError(message: string) {
  return /409|ServerStateConflict|state conflict|installation|install|not yet completed|server\.properties|contents|not found|introuvable|fichier|file/i.test(
    message,
  );
}

export function nextInitialMinecraftSyncRetry(previousRetryCount: unknown, now = new Date()) {
  const retryCount = Math.max(
    1,
    Math.min(
      INITIAL_MINECRAFT_SYNC_MAX_ATTEMPTS,
      (typeof previousRetryCount === "number" && Number.isFinite(previousRetryCount)
        ? Math.round(previousRetryCount)
        : 0) + 1,
    ),
  );
  const delaySeconds =
    INITIAL_MINECRAFT_SYNC_RETRY_DELAYS_SECONDS[retryCount - 1] ??
    INITIAL_MINECRAFT_SYNC_RETRY_DELAYS_SECONDS.at(-1) ??
    300;
  return {
    retryCount,
    nextRetryAt: new Date(now.getTime() + delaySeconds * 1000).toISOString(),
  };
}
