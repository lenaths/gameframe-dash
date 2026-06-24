export const WORKER_NAMES = ["minecraft-sync", "reconciliation", "modpack", "monitoring"] as const;

export type WorkerName = (typeof WORKER_NAMES)[number];

export type WorkerStatus = "idle" | "running" | "success" | "error" | "disabled";

export type WorkerRunEntry = {
  id: string;
  worker: WorkerName | "all";
  started_at: string;
  finished_at: string;
  duration_ms: number;
  success: boolean;
  processed: number;
  error?: string | null;
};

export const MAX_WORKER_HISTORY = 100;

export function appendWorkerHistory(
  history: WorkerRunEntry[],
  entry: WorkerRunEntry,
  maxEntries = MAX_WORKER_HISTORY,
) {
  return [entry, ...history].slice(0, maxEntries);
}

export type InitialMinecraftSyncLike = {
  status?: unknown;
  next_retry_at?: unknown;
};

export function shouldProcessMinecraftSync(
  sync: InitialMinecraftSyncLike | null | undefined,
  now = new Date(),
) {
  if (!sync || sync.status !== "pending") return false;
  if (typeof sync.next_retry_at !== "string" || !sync.next_retry_at.trim()) return true;
  const nextRetry = new Date(sync.next_retry_at).getTime();
  return Number.isFinite(nextRetry) && nextRetry <= now.getTime();
}

export type ModpackRetryCandidate = {
  status: string;
  attempts?: number | null;
  max_attempts?: number | null;
  updated_at?: string | null;
};

const MODPACK_RETRY_DELAYS_MS = [30_000, 60_000, 120_000, 300_000, 600_000];
const ACTIVE_MODPACK_JOB_STATUSES = new Set([
  "downloading",
  "extracting",
  "installing",
  "configuring",
]);

export function nextModpackRetryAt(job: ModpackRetryCandidate, now = new Date()) {
  const attempts = Math.max(0, Math.round(job.attempts ?? 0));
  const delay = MODPACK_RETRY_DELAYS_MS[Math.min(attempts, MODPACK_RETRY_DELAYS_MS.length - 1)];
  const updatedAt =
    typeof job.updated_at === "string" ? new Date(job.updated_at).getTime() : now.getTime();
  const base = Number.isFinite(updatedAt) ? updatedAt : now.getTime();
  return new Date(base + delay).toISOString();
}

export function shouldRetryModpackJob(job: ModpackRetryCandidate, now = new Date()) {
  const attempts = Math.max(0, Math.round(job.attempts ?? 0));
  const maxAttempts = Math.max(1, Math.round(job.max_attempts ?? 5));
  if (attempts >= maxAttempts) return false;
  if (job.status === "queued") return true;
  if (job.status !== "failed" && !ACTIVE_MODPACK_JOB_STATUSES.has(job.status)) return false;
  return new Date(nextModpackRetryAt(job, now)).getTime() <= now.getTime();
}

export function isTerminalModpackJobStatus(status: string) {
  return status === "ready" || status === "cancelled";
}
