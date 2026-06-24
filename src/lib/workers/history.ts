import {
  appendWorkerHistory,
  MAX_WORKER_HISTORY,
  type WorkerName,
  type WorkerRunEntry,
  type WorkerStatus,
} from "@/lib/workers/shared";

export type WorkerRuntimeState = {
  name: WorkerName;
  enabled: boolean;
  status: WorkerStatus;
  last_run_at: string | null;
  last_duration_ms: number | null;
  last_success: boolean | null;
  last_error: string | null;
  next_run_at: string | null;
  success_count: number;
  error_count: number;
};

const states = new Map<WorkerName, WorkerRuntimeState>();
let history: WorkerRunEntry[] = [];

export function getWorkerRuntimeState(name: WorkerName): WorkerRuntimeState {
  const existing = states.get(name);
  if (existing) return existing;
  const state: WorkerRuntimeState = {
    name,
    enabled: true,
    status: "idle",
    last_run_at: null,
    last_duration_ms: null,
    last_success: null,
    last_error: null,
    next_run_at: null,
    success_count: 0,
    error_count: 0,
  };
  states.set(name, state);
  return state;
}

export function setWorkerEnabled(name: WorkerName, enabled: boolean) {
  const state = getWorkerRuntimeState(name);
  state.enabled = enabled;
  state.status = enabled ? "idle" : "disabled";
  states.set(name, state);
  return state;
}

export function markWorkerRunning(name: WorkerName) {
  const state = getWorkerRuntimeState(name);
  state.status = "running";
  states.set(name, state);
  return state;
}

export function recordWorkerRun(entry: WorkerRunEntry) {
  history = appendWorkerHistory(history, entry, MAX_WORKER_HISTORY);
  if (entry.worker !== "all") {
    const state = getWorkerRuntimeState(entry.worker);
    state.status = state.enabled ? (entry.success ? "success" : "error") : "disabled";
    state.last_run_at = entry.finished_at;
    state.last_duration_ms = entry.duration_ms;
    state.last_success = entry.success;
    state.last_error = entry.error ?? null;
    if (entry.success) state.success_count += 1;
    else state.error_count += 1;
    states.set(entry.worker, state);
  }
  return entry;
}

export function listWorkerRuntimeStates(names: WorkerName[]) {
  return names.map((name) => getWorkerRuntimeState(name));
}

export function listWorkerHistory(limit = MAX_WORKER_HISTORY) {
  return history.slice(0, limit);
}
