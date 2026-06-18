import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ACTIVE_JOB_STATUSES = ["queued", "downloading", "extracting", "installing", "configuring"];
const JOB_STATUSES = [
  "queued",
  "downloading",
  "extracting",
  "installing",
  "configuring",
  "ready",
  "failed",
  "cancelled",
] as const;

type ModpackInstallStatus = (typeof JOB_STATUSES)[number];

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
  insert: (values: unknown) => SupabaseQuery<T>;
  update: (values: unknown) => SupabaseQuery<T>;
  maybeSingle: () => SupabaseQuery<T>;
  single: () => SupabaseQuery<T>;
};

type JobLogExtra = Record<string, string | number | boolean | null>;
type JobLog = {
  at?: string;
  event?: string;
  message?: string;
  extra?: JobLogExtra;
};

type ServerOrderForJob = {
  id: string;
  order_id: string | null;
  user_id: string;
  status?: string | null;
  pterodactyl_server_id?: number | null;
  metadata?: Record<string, unknown> | null;
};

type ModpackJobRow = {
  id: string;
  order_id: string | null;
  server_order_id: string | null;
  user_id: string | null;
  modpack_id: string | null;
  modpack_version_id: string | null;
  curseforge_mod_id: number | null;
  curseforge_file_id: number | null;
  server_pack_file_id: number | null;
  status: ModpackInstallStatus;
  attempts: number;
  max_attempts: number;
  file_length: number | null;
  started_at: string | null;
  finished_at: string | null;
  error_message: string | null;
  logs?: JobLog[] | null;
  created_at: string;
  updated_at: string;
  curseforge_modpacks?: { name?: string | null; logo_url?: string | null } | null;
  curseforge_modpack_versions?: {
    display_name?: string | null;
    minecraft_versions?: string[] | null;
    loaders?: string[] | null;
  } | null;
  server_orders?: { server_name?: string | null; status?: string | null } | null;
  orders?: { status?: string | null } | null;
};

const serverOrderInput = z.object({ serverOrderId: z.string().uuid() });
const jobInput = z.object({ jobId: z.string().uuid() });
const adminListInput = z
  .object({
    status: z.enum(JOB_STATUSES).optional(),
  })
  .optional();

function asRecord(value: unknown) {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function selectedModpackFromMetadata(metadata: unknown) {
  const root = asRecord(metadata);
  const selectedModpack = asRecord(root.selected_modpack);
  const selectedVersion = asRecord(root.selected_modpack_version);
  const modpackId = typeof selectedModpack.id === "string" ? selectedModpack.id : null;
  const versionId = typeof selectedVersion.id === "string" ? selectedVersion.id : null;
  if (!modpackId || !versionId) return null;
  return {
    modpackId,
    versionId,
    curseforgeModId:
      typeof selectedModpack.curseforge_mod_id === "number"
        ? selectedModpack.curseforge_mod_id
        : null,
    curseforgeFileId:
      typeof selectedVersion.curseforge_file_id === "number"
        ? selectedVersion.curseforge_file_id
        : null,
    modpackName: typeof selectedModpack.name === "string" ? selectedModpack.name : null,
    versionName:
      typeof selectedVersion.display_name === "string" ? selectedVersion.display_name : null,
  };
}

function appendLog(logs: unknown, event: string, message: string, extra?: JobLogExtra) {
  const current = Array.isArray(logs) ? (logs as JobLog[]) : [];
  return [
    ...current,
    {
      at: new Date().toISOString(),
      event,
      message,
      ...(extra ? { extra } : {}),
    },
  ];
}

async function getDb() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as SupabaseAny;
}

async function getActiveJobByServerOrder(db: SupabaseAny, serverOrderId: string) {
  const { data, error } = await db
    .from("modpack_install_jobs")
    .select(
      "id, order_id, server_order_id, user_id, modpack_id, modpack_version_id, curseforge_mod_id, curseforge_file_id, server_pack_file_id, status, attempts, max_attempts, file_length, started_at, finished_at, error_message, created_at, updated_at, curseforge_modpacks(name, logo_url), curseforge_modpack_versions(display_name, minecraft_versions, loaders)",
    )
    .eq("server_order_id", serverOrderId)
    .in("status", ACTIVE_JOB_STATUSES)
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) throw new Error(error.message);
  return ((data as ModpackJobRow[] | null) ?? [])[0] ?? null;
}

export async function loadLatestModpackInstallJob(serverOrderId: string) {
  const db = await getDb();
  return getLatestJobByServerOrder(db, serverOrderId);
}

async function getLatestJobByServerOrder(db: SupabaseAny, serverOrderId: string) {
  const { data, error } = await db
    .from("modpack_install_jobs")
    .select(
      "id, order_id, server_order_id, user_id, modpack_id, modpack_version_id, curseforge_mod_id, curseforge_file_id, server_pack_file_id, status, attempts, max_attempts, file_length, started_at, finished_at, error_message, created_at, updated_at, curseforge_modpacks(name, logo_url), curseforge_modpack_versions(display_name, minecraft_versions, loaders)",
    )
    .eq("server_order_id", serverOrderId)
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) throw new Error(error.message);
  return ((data as ModpackJobRow[] | null) ?? [])[0] ?? null;
}

async function writeActivityLog(
  db: SupabaseAny,
  values: {
    userId?: string | null;
    orderId?: string | null;
    serverOrderId?: string | null;
    action: string;
    description: string;
    metadata?: Record<string, unknown>;
  },
) {
  const { error } = await db.from("activity_logs").insert({
    user_id: values.userId ?? null,
    order_id: values.orderId ?? null,
    server_order_id: values.serverOrderId ?? null,
    action: values.action,
    description: values.description,
    metadata: values.metadata ?? {},
  });
  if (error) console.warn(`[Activity] Failed to write ${values.action}: ${error.message}`);
}

async function writeAuditLog(
  db: SupabaseAny,
  values: {
    actorUserId?: string | null;
    targetUserId?: string | null;
    entityType: string;
    entityId?: string | null;
    action: string;
    after?: Record<string, unknown> | null;
  },
) {
  const { error } = await db.from("audit_logs").insert({
    actor_user_id: values.actorUserId ?? null,
    target_user_id: values.targetUserId ?? null,
    entity_type: values.entityType,
    entity_id: values.entityId ?? null,
    action: values.action,
    after: values.after ?? null,
  });
  if (error) console.warn(`[Audit] Failed to write ${values.action}: ${error.message}`);
}

async function createJobNotification(
  db: SupabaseAny,
  values: {
    userId?: string | null;
    serverOrderId?: string | null;
    type: string;
    title: string;
    body: string;
  },
) {
  if (!values.userId) return;
  const { error } = await db.from("notifications").insert({
    user_id: values.userId,
    type: values.type,
    title: values.title,
    body: values.body,
    href: values.serverOrderId ? `/manage/${values.serverOrderId}` : "/dashboard",
  });
  if (error && error.code !== "23505") {
    console.warn(`[Notifications] Failed to write ${values.type}: ${error.message}`);
  }
}

type FullJobRow = ModpackJobRow & {
  logs?: JobLog[] | null;
};

async function loadJobForProcessing(db: SupabaseAny, jobId: string) {
  const { data, error } = await db
    .from("modpack_install_jobs")
    .select(
      "id, order_id, server_order_id, user_id, modpack_id, modpack_version_id, curseforge_mod_id, curseforge_file_id, server_pack_file_id, status, attempts, max_attempts, file_length, started_at, finished_at, error_message, logs, created_at, updated_at",
    )
    .eq("id", jobId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as FullJobRow | null;
}

async function failJob(
  db: SupabaseAny,
  job: FullJobRow,
  message: string,
  event = "validation_failed",
) {
  const logs = appendLog(job.logs, event, message);
  const finishedAt = new Date().toISOString();
  const { error } = await db
    .from("modpack_install_jobs")
    .update({
      status: "failed",
      error_message: message,
      finished_at: finishedAt,
      logs,
    })
    .eq("id", job.id);
  if (error) throw new Error(error.message);
  await writeActivityLog(db, {
    userId: job.user_id,
    orderId: job.order_id,
    serverOrderId: job.server_order_id,
    action: "modpack_install_failed",
    description: message,
    metadata: { jobId: job.id, phase: "4H" },
  });
  await createJobNotification(db, {
    userId: job.user_id,
    serverOrderId: job.server_order_id,
    type: "modpack_install_failed",
    title: "Installation modpack échouée",
    body: message,
  });
  return { ok: false as const, status: "failed" as const, error: message };
}

async function processJob(db: SupabaseAny, jobId: string) {
  const job = await loadJobForProcessing(db, jobId);
  if (!job) throw new Error("Job modpack introuvable.");
  if (job.status === "ready") return { ok: true as const, skipped: true, status: "ready" as const };
  if (job.status === "failed" || job.status === "cancelled") {
    return { ok: false as const, skipped: true, status: job.status, error: "Job non traitable." };
  }
  if (job.status !== "queued") {
    return { ok: true as const, skipped: true, status: job.status };
  }
  if ((job.attempts ?? 0) >= (job.max_attempts ?? 3)) {
    return failJob(db, job, "Nombre maximal de tentatives atteint.", "max_attempts_reached");
  }

  const startedAt = new Date().toISOString();
  const downloadingLogs = appendLog(
    job.logs,
    "downloading",
    "Worker MVP démarré: validation du modpack sans téléchargement réel.",
  );
  const { error: markError } = await db
    .from("modpack_install_jobs")
    .update({
      status: "downloading",
      attempts: (job.attempts ?? 0) + 1,
      started_at: startedAt,
      finished_at: null,
      error_message: null,
      logs: downloadingLogs,
    })
    .eq("id", job.id);
  if (markError) throw new Error(markError.message);

  const workingJob: FullJobRow = {
    ...job,
    status: "downloading",
    attempts: (job.attempts ?? 0) + 1,
    started_at: startedAt,
    logs: downloadingLogs,
  };

  if (!workingJob.server_order_id) {
    return failJob(db, workingJob, "Serveur lié introuvable.");
  }
  if (!workingJob.modpack_id || !workingJob.modpack_version_id) {
    return failJob(db, workingJob, "Sélection modpack incomplète.");
  }

  const { data: serverOrderData, error: serverOrderError } = await db
    .from("server_orders")
    .select("id, order_id, user_id, status, pterodactyl_server_id, metadata")
    .eq("id", workingJob.server_order_id)
    .maybeSingle();
  if (serverOrderError) throw new Error(serverOrderError.message);
  const serverOrder = serverOrderData as ServerOrderForJob | null;
  if (!serverOrder) return failJob(db, workingJob, "Serveur XNT introuvable.");
  if (!serverOrder.pterodactyl_server_id) {
    return failJob(db, workingJob, "Serveur pas encore prêt pour une installation modpack.");
  }

  const [{ data: modpackData, error: modpackError }, { data: versionData, error: versionError }] =
    await Promise.all([
      db
        .from("curseforge_modpacks")
        .select("id, name, curseforge_mod_id, is_active")
        .eq("id", workingJob.modpack_id)
        .maybeSingle(),
      db
        .from("curseforge_modpack_versions")
        .select(
          "id, modpack_id, curseforge_file_id, display_name, minecraft_versions, loaders, server_pack_file_id, is_server_pack, file_length, is_active",
        )
        .eq("id", workingJob.modpack_version_id)
        .maybeSingle(),
    ]);
  if (modpackError) throw new Error(modpackError.message);
  if (versionError) throw new Error(versionError.message);
  const modpack = modpackData as {
    id: string;
    name?: string | null;
    curseforge_mod_id?: number | null;
    is_active?: boolean;
  } | null;
  const version = versionData as {
    id: string;
    modpack_id: string;
    curseforge_file_id?: number | null;
    display_name?: string | null;
    minecraft_versions?: string[] | null;
    loaders?: string[] | null;
    server_pack_file_id?: number | null;
    is_server_pack?: boolean | null;
    file_length?: number | null;
    is_active?: boolean;
  } | null;

  if (!modpack || !modpack.is_active)
    return failJob(db, workingJob, "Modpack inactif ou supprimé.");
  if (!version || !version.is_active || version.modpack_id !== modpack.id) {
    return failJob(db, workingJob, "Version modpack inactive ou invalide.");
  }
  if (!version.server_pack_file_id && !workingJob.server_pack_file_id) {
    return failJob(db, workingJob, "Aucun server pack disponible pour cette version.");
  }

  const { data: mappingsData, error: mappingsError } = await db
    .from("curseforge_template_mappings")
    .select("id, loader, minecraft_version, is_active")
    .eq("modpack_id", modpack.id)
    .eq("is_active", true);
  if (mappingsError) throw new Error(mappingsError.message);
  const versionLoaders = new Set((version.loaders ?? []).map((item) => item.toLowerCase()));
  const versionMinecraft = new Set(
    (version.minecraft_versions ?? []).map((item) => item.toLowerCase()),
  );
  const mappings = (mappingsData ?? []) as Array<{
    id: string;
    loader?: string | null;
    minecraft_version?: string | null;
  }>;
  const matchingMapping = mappings.find((mapping) => {
    const loaderOk = !mapping.loader || versionLoaders.has(mapping.loader.toLowerCase());
    const versionOk =
      !mapping.minecraft_version || versionMinecraft.has(mapping.minecraft_version.toLowerCase());
    return loaderOk && versionOk;
  });
  if (!matchingMapping) {
    return failJob(db, workingJob, "Aucun template serveur actif ne correspond à cette version.");
  }

  const readyLogs = appendLog(
    workingJob.logs,
    "ready",
    "Validation modpack OK. Installation réelle non activée dans cette phase.",
    {
      modpack: modpack.name ?? null,
      version: version.display_name ?? null,
      serverPackFileId: version.server_pack_file_id ?? workingJob.server_pack_file_id,
      mappingId: matchingMapping.id,
    },
  );
  const finishedAt = new Date().toISOString();
  const { error: readyError } = await db
    .from("modpack_install_jobs")
    .update({
      status: "ready",
      curseforge_mod_id: modpack.curseforge_mod_id ?? workingJob.curseforge_mod_id,
      curseforge_file_id: version.curseforge_file_id ?? workingJob.curseforge_file_id,
      server_pack_file_id: version.server_pack_file_id ?? workingJob.server_pack_file_id,
      file_length: version.file_length ?? workingJob.file_length,
      finished_at: finishedAt,
      error_message: null,
      logs: readyLogs,
      metadata: {
        phase: "4H",
        install_enabled: false,
        validation_only: true,
        mapping_id: matchingMapping.id,
      },
    })
    .eq("id", workingJob.id);
  if (readyError) throw new Error(readyError.message);

  await writeActivityLog(db, {
    userId: workingJob.user_id,
    orderId: workingJob.order_id,
    serverOrderId: workingJob.server_order_id,
    action: "modpack_install_ready",
    description: "Installation modpack préparée.",
    metadata: { jobId: workingJob.id, phase: "4H", validationOnly: true },
  });
  await createJobNotification(db, {
    userId: workingJob.user_id,
    serverOrderId: workingJob.server_order_id,
    type: "modpack_install_ready",
    title: "Installation modpack préparée",
    body: "Validation modpack OK. L’installation réelle sera activée dans une prochaine phase.",
  });

  return { ok: true as const, skipped: false, status: "ready" as const };
}

export async function enqueueModpackInstallJob(serverOrderId: string) {
  const db = await getDb();

  const { data: serverOrderData, error: serverOrderError } = await db
    .from("server_orders")
    .select("id, order_id, user_id, metadata")
    .eq("id", serverOrderId)
    .maybeSingle();
  if (serverOrderError) throw new Error(serverOrderError.message);
  const serverOrder = serverOrderData as ServerOrderForJob | null;
  if (!serverOrder) throw new Error("Server order introuvable.");

  const modpackSelection = selectedModpackFromMetadata(serverOrder.metadata);
  if (!modpackSelection) {
    console.info(`[ModpackInstall] No selected modpack for server_order=${serverOrderId}.`);
    return { queued: false as const, job: null, reason: "no_modpack" as const };
  }

  const active = await getActiveJobByServerOrder(db, serverOrderId);
  if (active) return { queued: true as const, job: active, reused: true };

  const { data: versionData, error: versionError } = await db
    .from("curseforge_modpack_versions")
    .select("id, curseforge_file_id, server_pack_file_id, file_length, display_name")
    .eq("id", modpackSelection.versionId)
    .maybeSingle();
  if (versionError) throw new Error(versionError.message);
  const version = versionData as {
    id: string;
    curseforge_file_id: number | null;
    server_pack_file_id: number | null;
    file_length: number | null;
    display_name?: string | null;
  } | null;

  const payload = {
    order_id: serverOrder.order_id,
    server_order_id: serverOrder.id,
    user_id: serverOrder.user_id,
    modpack_id: modpackSelection.modpackId,
    modpack_version_id: modpackSelection.versionId,
    curseforge_mod_id: modpackSelection.curseforgeModId,
    curseforge_file_id: version?.curseforge_file_id ?? modpackSelection.curseforgeFileId,
    server_pack_file_id: version?.server_pack_file_id ?? null,
    file_length: version?.file_length ?? null,
    status: "queued",
    logs: [
      {
        at: new Date().toISOString(),
        event: "queued",
        message: "Installation modpack planifiée. Aucun téléchargement lancé dans cette phase.",
      },
    ],
    metadata: {
      phase: "4F",
      install_enabled: false,
      modpack_name: modpackSelection.modpackName,
      version_name: modpackSelection.versionName ?? version?.display_name ?? null,
    },
  };

  const createdResult = await db
    .from("modpack_install_jobs")
    .insert(payload)
    .select(
      "id, order_id, server_order_id, user_id, modpack_id, modpack_version_id, curseforge_mod_id, curseforge_file_id, server_pack_file_id, status, attempts, max_attempts, file_length, started_at, finished_at, error_message, created_at, updated_at, curseforge_modpacks(name, logo_url), curseforge_modpack_versions(display_name, minecraft_versions, loaders)",
    )
    .single();

  if (createdResult.error) {
    if (createdResult.error.code === "23505") {
      const reloaded = await getActiveJobByServerOrder(db, serverOrderId);
      if (reloaded) return { queued: true as const, job: reloaded, reused: true };
    }
    throw new Error(createdResult.error.message);
  }

  const job = createdResult.data as ModpackJobRow;
  await writeActivityLog(db, {
    userId: serverOrder.user_id,
    orderId: serverOrder.order_id,
    serverOrderId: serverOrder.id,
    action: "modpack_install_queued",
    description: "Installation modpack planifiée.",
    metadata: { jobId: job.id, modpackId: modpackSelection.modpackId },
  });

  return { queued: true as const, job, reused: false };
}

export const getLatestModpackInstallJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => serverOrderInput.parse(d))
  .handler(async ({ data, context }) => {
    const { data: serverOrder, error } = await context.supabase
      .from("server_orders")
      .select("id")
      .eq("id", data.serverOrderId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!serverOrder) throw new Error("Server not found.");
    const db = await getDb();
    return { job: await getLatestJobByServerOrder(db, data.serverOrderId) };
  });

export const adminListModpackInstallJobs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => adminListInput.parse(d))
  .handler(async ({ data, context }) => {
    const { assertAdmin } = await import("@/lib/admin.functions");
    await assertAdmin(context.userId);
    const db = await getDb();
    let query = db
      .from("modpack_install_jobs")
      .select(
        "id, order_id, server_order_id, user_id, modpack_id, modpack_version_id, curseforge_mod_id, curseforge_file_id, server_pack_file_id, status, attempts, max_attempts, file_length, started_at, finished_at, error_message, logs, created_at, updated_at, curseforge_modpacks(name, logo_url), curseforge_modpack_versions(display_name, minecraft_versions, loaders), server_orders(server_name, status), orders(status)",
      )
      .order("created_at", { ascending: false })
      .limit(200);
    if (data?.status) query = query.eq("status", data.status);
    const { data: jobs, error } = await query;
    if (error) throw new Error(error.message);
    return { jobs: (jobs ?? []) as ModpackJobRow[] };
  });

export const adminRetryModpackInstallJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => jobInput.parse(d))
  .handler(async ({ data, context }) => {
    const { assertAdmin } = await import("@/lib/admin.functions");
    await assertAdmin(context.userId);
    const db = await getDb();

    const { data: jobData, error: jobError } = await db
      .from("modpack_install_jobs")
      .select("id, user_id, server_order_id, status, attempts, max_attempts, logs")
      .eq("id", data.jobId)
      .maybeSingle();
    if (jobError) throw new Error(jobError.message);
    const job = jobData as FullJobRow | null;
    if (!job) throw new Error("Job modpack introuvable.");
    if (!["failed", "cancelled"].includes(job.status)) {
      return { ok: true, skipped: true, status: job.status };
    }

    const nextLogs = [
      ...((Array.isArray(job.logs) ? job.logs : []) as JobLog[]),
      {
        at: new Date().toISOString(),
        event: "admin_retry",
        message: "Job remis en file d’attente. Aucune installation réelle lancée dans cette phase.",
      },
    ];
    const { error } = await db
      .from("modpack_install_jobs")
      .update({
        status: "queued",
        attempts: Math.min((job.attempts ?? 0) + 1, job.max_attempts ?? 3),
        error_message: null,
        started_at: null,
        finished_at: null,
        logs: nextLogs,
      })
      .eq("id", data.jobId);
    if (error) throw new Error(error.message);

    await writeAuditLog(db, {
      actorUserId: context.userId,
      targetUserId: job.user_id,
      entityType: "modpack_install_job",
      entityId: job.id,
      action: "admin.modpack_install.retry",
      after: { status: "queued" },
    });
    return { ok: true, skipped: false, status: "queued" };
  });

export const adminCancelModpackInstallJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => jobInput.parse(d))
  .handler(async ({ data, context }) => {
    const { assertAdmin } = await import("@/lib/admin.functions");
    await assertAdmin(context.userId);
    const db = await getDb();
    const { data: jobData, error: jobError } = await db
      .from("modpack_install_jobs")
      .select("id, user_id, status, logs")
      .eq("id", data.jobId)
      .maybeSingle();
    if (jobError) throw new Error(jobError.message);
    const job = jobData as FullJobRow | null;
    if (!job) throw new Error("Job modpack introuvable.");
    if (job.status !== "queued") return { ok: true, skipped: true, status: job.status };

    const logs = [
      ...((Array.isArray(job.logs) ? job.logs : []) as JobLog[]),
      {
        at: new Date().toISOString(),
        event: "admin_cancel",
        message: "Job annulé par un administrateur.",
      },
    ];
    const { error } = await db
      .from("modpack_install_jobs")
      .update({
        status: "cancelled",
        finished_at: new Date().toISOString(),
        logs,
      })
      .eq("id", data.jobId);
    if (error) throw new Error(error.message);

    await writeAuditLog(db, {
      actorUserId: context.userId,
      targetUserId: job.user_id,
      entityType: "modpack_install_job",
      entityId: job.id,
      action: "admin.modpack_install.cancel",
      after: { status: "cancelled" },
    });
    return { ok: true, skipped: false, status: "cancelled" };
  });

export async function processModpackInstallJob(jobId: string) {
  const db = await getDb();
  return processJob(db, jobId);
}

export async function processNextModpackInstallJob() {
  const db = await getDb();
  const { data, error } = await db
    .from("modpack_install_jobs")
    .select("id")
    .eq("status", "queued")
    .order("created_at", { ascending: true })
    .limit(1);
  if (error) throw new Error(error.message);
  const next = ((data as Array<{ id: string }> | null) ?? [])[0] ?? null;
  if (!next) return { ok: true as const, skipped: true, status: "idle" as const };
  return processJob(db, next.id);
}

export const adminProcessModpackInstallJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => jobInput.parse(d))
  .handler(async ({ data, context }) => {
    const { assertAdmin } = await import("@/lib/admin.functions");
    await assertAdmin(context.userId);
    const result = await processModpackInstallJob(data.jobId);
    const db = await getDb();
    await writeAuditLog(db, {
      actorUserId: context.userId,
      entityType: "modpack_install_job",
      entityId: data.jobId,
      action: "admin.modpack_install.process_job",
      after: result,
    });
    return result;
  });

export const adminProcessNextModpackInstallJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { assertAdmin } = await import("@/lib/admin.functions");
    await assertAdmin(context.userId);
    const result = await processNextModpackInstallJob();
    const db = await getDb();
    await writeAuditLog(db, {
      actorUserId: context.userId,
      entityType: "modpack_install_job",
      action: "admin.modpack_install.process_next",
      after: result,
    });
    return result;
  });
