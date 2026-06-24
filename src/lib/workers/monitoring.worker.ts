import { reportServerError } from "@/lib/monitoring.server";
import { listWorkerRuntimeStates } from "@/lib/workers/history";
import { WORKER_NAMES } from "@/lib/workers/shared";

export async function runMonitoringWorker() {
  try {
    const states = listWorkerRuntimeStates([...WORKER_NAMES]);
    const errors = states.filter((state) => state.last_success === false).length;
    return {
      ok: true as const,
      processedCount: states.length,
      errors,
      states,
    };
  } catch (error) {
    reportServerError(error, { action: "monitoring_worker" });
    throw error;
  }
}
