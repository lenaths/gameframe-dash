import { processPendingMinecraftSyncs } from "@/lib/servers.functions";

export async function runMinecraftSyncWorker(
  options: { limit?: number; syncedBy?: string | null } = {},
) {
  const result = await processPendingMinecraftSyncs({
    limit: options.limit ?? 25,
    syncedBy: options.syncedBy ?? null,
  });
  return {
    ...result,
    processedCount: result.processed.length,
  };
}
