import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdmin } from "@/lib/admin.functions";
import {
  getWorkersSnapshot,
  processAllWorkers,
  processWorker,
  setWorkerEnabled,
} from "@/lib/workers/orchestrator";
import { WORKER_NAMES, type WorkerName } from "@/lib/workers/shared";

const workerNameSchema = z.enum(WORKER_NAMES);

export const adminListWorkers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    return getWorkersSnapshot();
  });

export const adminRunWorker = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ worker: workerNameSchema }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    return processWorker(data.worker as WorkerName, { force: true });
  });

export const adminRunAllWorkers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    return processAllWorkers();
  });

export const adminSetWorkerEnabled = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ worker: workerNameSchema, enabled: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    return setWorkerEnabled(data.worker as WorkerName, data.enabled);
  });
