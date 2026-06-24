import { reportProvisioningError } from "@/lib/monitoring.server";
import { processModpackInstallJob } from "@/lib/modpack-install.functions";
import { shouldRetryModpackJob } from "@/lib/workers/shared";

type SupabaseAny = {
  from: (table: string) => SupabaseQuery;
};

type SupabaseResult<T = unknown> = {
  data: T | null;
  error: { message: string; code?: string } | null;
};

type SupabaseQuery<T = unknown> = PromiseLike<SupabaseResult<T>> & {
  select: (columns: string) => SupabaseQuery<T>;
  eq: (column: string, value: unknown) => SupabaseQuery<T>;
  in: (column: string, values: unknown[]) => SupabaseQuery<T>;
  order: (column: string, options?: Record<string, unknown>) => SupabaseQuery<T>;
  limit: (count: number) => SupabaseQuery<T>;
  update: (values: unknown) => SupabaseQuery<T>;
};

type ModpackWorkerJob = {
  id: string;
  status: string;
  attempts: number | null;
  max_attempts: number | null;
  updated_at: string | null;
  logs?: unknown;
};

function appendWorkerRetryLog(logs: unknown, message: string) {
  const current = Array.isArray(logs) ? logs : [];
  return [
    ...current,
    {
      at: new Date().toISOString(),
      event: "worker_retry",
      message,
    },
  ];
}

async function getDb() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as SupabaseAny;
}

async function resetRetryableJob(db: SupabaseAny, job: ModpackWorkerJob) {
  if (job.status === "queued") return false;
  const { error } = await db
    .from("modpack_install_jobs")
    .update({
      status: "queued",
      started_at: null,
      finished_at: null,
      error_message: null,
      logs: appendWorkerRetryLog(job.logs, "Worker automatique: job remis en file d’attente."),
    })
    .eq("id", job.id);
  if (error) throw new Error(error.message);
  return true;
}

export async function runModpackWorker(options: { limit?: number; now?: Date } = {}) {
  const db = await getDb();
  const now = options.now ?? new Date();
  const limit = options.limit ?? 10;
  const { data, error } = await db
    .from("modpack_install_jobs")
    .select("id, status, attempts, max_attempts, updated_at, logs")
    .in("status", ["queued", "failed", "downloading", "extracting", "installing", "configuring"])
    .order("updated_at", { ascending: true })
    .limit(limit * 2);
  if (error) throw new Error(error.message);

  const candidates = ((data ?? []) as ModpackWorkerJob[]).filter((job) =>
    shouldRetryModpackJob(job, now),
  );
  const processed = [];

  for (const job of candidates.slice(0, limit)) {
    try {
      await resetRetryableJob(db, job);
      const result = await processModpackInstallJob(job.id);
      processed.push({ jobId: job.id, ok: result.ok, status: result.status, result });
    } catch (error) {
      reportProvisioningError(error, { action: "modpack_worker", job_id: job.id });
      processed.push({
        jobId: job.id,
        ok: false,
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    ok: true as const,
    checked: candidates.length,
    processedCount: processed.length,
    processed,
  };
}
