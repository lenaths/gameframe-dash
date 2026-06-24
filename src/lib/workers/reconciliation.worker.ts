import { cleanupStagingMissingServers } from "@/lib/admin.functions";

export async function runReconciliationWorker(options: { actorUserId?: string | null } = {}) {
  const result = await cleanupStagingMissingServers(options.actorUserId ?? null);
  return {
    ok: true as const,
    processedCount:
      "processed" in result && typeof result.processed === "number"
        ? result.processed
        : "skipped" in result && result.skipped
          ? 0
          : 1,
    result,
  };
}
