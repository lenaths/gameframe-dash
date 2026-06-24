import { reportServerError } from "@/lib/monitoring.server";
import {
  getWorkerRuntimeState,
  listWorkerHistory,
  listWorkerRuntimeStates,
  markWorkerRunning,
  recordWorkerRun,
  setWorkerEnabled,
} from "@/lib/workers/history";
import { runMinecraftSyncWorker } from "@/lib/workers/minecraft-sync.worker";
import { runModpackWorker } from "@/lib/workers/modpack.worker";
import { runMonitoringWorker } from "@/lib/workers/monitoring.worker";
import { runReconciliationWorker } from "@/lib/workers/reconciliation.worker";
import { WORKER_NAMES, type WorkerName } from "@/lib/workers/shared";

export { listWorkerHistory, listWorkerRuntimeStates, setWorkerEnabled };

function workerRunId(name: string) {
  return `${name}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function processedCount(result: unknown) {
  if (!result || typeof result !== "object") return 0;
  const record = result as Record<string, unknown>;
  if (typeof record.processedCount === "number") return record.processedCount;
  if (typeof record.checked === "number") return record.checked;
  if (typeof record.processed === "number") return record.processed;
  if (Array.isArray(record.processed)) return record.processed.length;
  return 0;
}

async function executeWorker(name: WorkerName) {
  switch (name) {
    case "minecraft-sync":
      return runMinecraftSyncWorker({ syncedBy: null });
    case "reconciliation":
      return runReconciliationWorker({ actorUserId: null });
    case "modpack":
      return runModpackWorker();
    case "monitoring":
      return runMonitoringWorker();
    default: {
      const exhaustive: never = name;
      throw new Error(`Unknown worker ${exhaustive}`);
    }
  }
}

export async function processWorker(name: WorkerName, options: { force?: boolean } = {}) {
  const state = getWorkerRuntimeState(name);
  if (!state.enabled && !options.force) {
    return recordWorkerRun({
      id: workerRunId(name),
      worker: name,
      started_at: new Date().toISOString(),
      finished_at: new Date().toISOString(),
      duration_ms: 0,
      success: true,
      processed: 0,
      error: "worker_disabled",
    });
  }

  const started = Date.now();
  const startedAt = new Date(started).toISOString();
  markWorkerRunning(name);
  try {
    const result = await executeWorker(name);
    const finished = Date.now();
    return recordWorkerRun({
      id: workerRunId(name),
      worker: name,
      started_at: startedAt,
      finished_at: new Date(finished).toISOString(),
      duration_ms: finished - started,
      success: true,
      processed: processedCount(result),
      error: null,
    });
  } catch (error) {
    reportServerError(error, { action: "process_worker", worker: name });
    const finished = Date.now();
    return recordWorkerRun({
      id: workerRunId(name),
      worker: name,
      started_at: startedAt,
      finished_at: new Date(finished).toISOString(),
      duration_ms: finished - started,
      success: false,
      processed: 0,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function processAllWorkers() {
  const started = Date.now();
  const startedAt = new Date(started).toISOString();
  const results = [];
  for (const name of WORKER_NAMES) {
    results.push(await processWorker(name));
  }
  const success = results.every((entry) => entry.success);
  const finished = Date.now();
  const entry = recordWorkerRun({
    id: workerRunId("all"),
    worker: "all",
    started_at: startedAt,
    finished_at: new Date(finished).toISOString(),
    duration_ms: finished - started,
    success,
    processed: results.reduce((sum, item) => sum + item.processed, 0),
    error: success ? null : "one_or_more_workers_failed",
  });
  return { entry, workers: results };
}

export function getWorkersSnapshot() {
  return {
    workers: listWorkerRuntimeStates([...WORKER_NAMES]),
    history: listWorkerHistory(),
  };
}
