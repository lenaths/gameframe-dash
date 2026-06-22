import "@tanstack/react-start/server-only";

import { z } from "zod";
import { isMinecraftGame, normalizeGameKey } from "@/lib/game-config";
import { reportProvisioningError } from "@/lib/monitoring.server";

type ServerOrderStatus =
  | "pending"
  | "provisioning"
  | "active"
  | "suspended"
  | "failed"
  | "cancelled";

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
  single: () => SupabaseQuery<T>;
  maybeSingle: () => SupabaseQuery<T>;
  insert: (values: Record<string, unknown>) => SupabaseQuery<T>;
  update: (values: Record<string, unknown>) => SupabaseQuery<T>;
};

const planVariantSchema = z.object({
  nest_id: z.number().int().positive(),
  egg_id: z.number().int().positive(),
  label: z.string().optional(),
  docker_image: z.string().trim().min(1).optional(),
  startup: z.string().trim().min(1).optional(),
  environment: z.record(z.string(), z.string()).optional(),
  versionEnvironment: z.record(z.string(), z.string()).optional(),
  source: z.enum(["catalog", "allowed_eggs"]).optional(),
  versionLabel: z.string().nullable().optional(),
});

type ProvisionServerOrderInput = {
  serverOrderId: string;
  userId: string;
  planId: string;
  serverName: string;
  variantIndex?: number;
  environment?: Record<string, string>;
  maxPlayers?: number | null;
  fallbackEmail?: string | null;
};

type PaidOrderRow = {
  id: string;
  user_id: string;
  plan_id: string | null;
  product_id: string | null;
  status: string;
  metadata?: Record<string, unknown> | null;
};

type ExistingServerOrder = {
  id: string;
  status: ServerOrderStatus;
  pterodactyl_server_id: number | null;
  pterodactyl_server_identifier: string | null;
};

type ProvisionPaidOrderOptions = {
  actorUserId?: string | null;
  source?: string;
};

export function cleanProvisioningError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/\s+/g, " ").trim().slice(0, 1000);
}

function mapPterodactylInstallStatus(status: unknown): ServerOrderStatus {
  if (status === null) return "active";
  if (status === "suspended") return "suspended";
  if (status === "install_failed" || status === "restore_failed") return "failed";
  return "provisioning";
}

function normalizeEnvironment(input: Record<string, unknown>) {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(input)) {
    if (!key.trim()) continue;
    if (value == null) {
      env[key] = "";
    } else if (typeof value === "string") {
      env[key] = value;
    } else if (typeof value === "number" || typeof value === "boolean") {
      env[key] = String(value);
    }
  }
  return env;
}

function normalizeMaxPlayers(value: unknown, fallback = 10) {
  const parsed =
    typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(200, Math.max(1, Math.round(parsed)));
}

function defaultMaxPlayersForPlan(plan: { name?: string | null; ram_mb?: number | null }) {
  const name = (plan.name ?? "").toLowerCase();
  if (name.includes("netherite")) return 40;
  if (name.includes("diamond")) return 20;
  if (name.includes("iron")) return 10;
  const ramMb = plan.ram_mb ?? 0;
  if (ramMb >= 16384) return 40;
  if (ramMb >= 8192) return 20;
  return 10;
}

function findMaxPlayersVariable(allowedVariables: Set<string>) {
  const candidates = [
    "MAX_PLAYERS",
    "MINECRAFT_MAX_PLAYERS",
    "SERVER_MAX_PLAYERS",
    "PLAYERS",
    "MAXPLAYERS",
    "PLAYER_SLOTS",
    "SERVER_PLAYERS",
  ];
  return candidates.find((candidate) => allowedVariables.has(candidate)) ?? null;
}

function filterEnvironmentForEgg(
  input: Record<string, string>,
  allowedVariables: Set<string>,
  context: string,
) {
  const env: Record<string, string> = {};
  const ignored: string[] = [];

  for (const [key, value] of Object.entries(input)) {
    if (allowedVariables.has(key)) {
      env[key] = value;
    } else {
      ignored.push(key);
    }
  }

  if (ignored.length > 0) {
    console.warn(
      `[Pterodactyl] Ignored unknown environment variables for ${context}: ${ignored.join(", ")}`,
    );
  }

  return env;
}

function getPaidOrderProvisioningSelection(order: PaidOrderRow) {
  const metadata = order.metadata && typeof order.metadata === "object" ? order.metadata : {};
  const selectedTemplate =
    metadata.selected_template && typeof metadata.selected_template === "object"
      ? (metadata.selected_template as Record<string, unknown>)
      : {};
  const rawIndex = selectedTemplate.index;
  const variantIndex =
    typeof rawIndex === "number" && Number.isInteger(rawIndex) && rawIndex >= 0 ? rawIndex : 0;
  const serverName =
    typeof metadata.server_name === "string" && metadata.server_name.trim()
      ? metadata.server_name.trim().slice(0, 40)
      : null;
  const environment =
    metadata.environment && typeof metadata.environment === "object"
      ? normalizeEnvironment(metadata.environment as Record<string, unknown>)
      : {};
  const templateLabel =
    typeof selectedTemplate.label === "string" && selectedTemplate.label.trim()
      ? selectedTemplate.label.trim()
      : null;
  const templateId =
    typeof selectedTemplate.template_id === "string" && selectedTemplate.template_id.trim()
      ? selectedTemplate.template_id.trim()
      : null;
  const selectedGame =
    typeof metadata.selected_game === "string" && metadata.selected_game.trim()
      ? normalizeGameKey(metadata.selected_game)
      : "unknown";
  const serverType =
    typeof metadata.server_type === "string" && metadata.server_type.trim()
      ? metadata.server_type.trim().toLowerCase()
      : typeof selectedTemplate.server_type === "string" && selectedTemplate.server_type.trim()
        ? selectedTemplate.server_type.trim().toLowerCase()
        : (templateLabel?.toLowerCase() ?? null);
  const eggId =
    typeof metadata.egg_id === "number"
      ? metadata.egg_id
      : typeof selectedTemplate.egg_id === "number"
        ? selectedTemplate.egg_id
        : null;
  const nestId =
    typeof metadata.nest_id === "number"
      ? metadata.nest_id
      : typeof selectedTemplate.nest_id === "number"
        ? selectedTemplate.nest_id
        : null;
  const templateVersion =
    typeof selectedTemplate.version === "string" && selectedTemplate.version.trim()
      ? selectedTemplate.version.trim()
      : null;
  const versionApplyStatus =
    typeof metadata.version_apply_status === "string" && metadata.version_apply_status.trim()
      ? metadata.version_apply_status.trim()
      : metadata.minecraft_settings &&
          typeof metadata.minecraft_settings === "object" &&
          typeof (metadata.minecraft_settings as Record<string, unknown>).version_apply_status ===
            "string"
        ? String((metadata.minecraft_settings as Record<string, unknown>).version_apply_status)
        : null;
  const versionVariable =
    typeof metadata.version_variable === "string" && metadata.version_variable.trim()
      ? metadata.version_variable.trim()
      : metadata.minecraft_settings &&
          typeof metadata.minecraft_settings === "object" &&
          typeof (metadata.minecraft_settings as Record<string, unknown>).version_variable ===
            "string"
        ? String((metadata.minecraft_settings as Record<string, unknown>).version_variable)
        : null;
  const templateSource =
    selectedTemplate.source === "catalog" || selectedTemplate.source === "allowed_eggs"
      ? selectedTemplate.source
      : null;
  const selectedModpack =
    metadata.selected_modpack && typeof metadata.selected_modpack === "object"
      ? (metadata.selected_modpack as Record<string, unknown>)
      : null;
  const selectedModpackVersion =
    metadata.selected_modpack_version && typeof metadata.selected_modpack_version === "object"
      ? (metadata.selected_modpack_version as Record<string, unknown>)
      : null;
  const maxPlayers = normalizeMaxPlayers(
    metadata.max_players ??
      (metadata.minecraft_settings &&
      typeof metadata.minecraft_settings === "object" &&
      "max_players" in metadata.minecraft_settings
        ? (metadata.minecraft_settings as Record<string, unknown>).max_players
        : undefined),
    10,
  );
  const hasMaxPlayersMetadata = Boolean(
    metadata.max_players ??
    (metadata.minecraft_settings &&
    typeof metadata.minecraft_settings === "object" &&
    "max_players" in metadata.minecraft_settings
      ? (metadata.minecraft_settings as Record<string, unknown>).max_players
      : undefined),
  );
  const playerPricing =
    metadata.player_pricing && typeof metadata.player_pricing === "object"
      ? (metadata.player_pricing as Record<string, unknown>)
      : null;

  return {
    variantIndex,
    serverName,
    environment,
    templateLabel,
    templateId,
    selectedGame,
    serverType,
    eggId,
    nestId,
    templateVersion,
    versionApplyStatus,
    versionVariable,
    templateSource,
    selectedModpack,
    selectedModpackVersion,
    maxPlayers,
    hasMaxPlayersMetadata,
    playerPricing,
  };
}

async function ensurePanelUser(input: {
  db: SupabaseAny;
  userId: string;
  fallbackEmail?: string | null;
}) {
  const { createPanelUser, findPanelUserByEmail } = await import("@/lib/pterodactyl.server");
  const profileResult = await input.db
    .from("profiles")
    .select("id, email, display_name, pterodactyl_user_id")
    .eq("id", input.userId)
    .maybeSingle();
  const profile = profileResult.data as {
    email: string | null;
    display_name: string | null;
    pterodactyl_user_id: number | null;
  } | null;

  let pteroUserId = profile?.pterodactyl_user_id ?? null;
  if (pteroUserId) return pteroUserId;

  const email = profile?.email ?? input.fallbackEmail ?? "";
  if (!email) throw new Error("Missing email for panel account creation.");
  const display = profile?.display_name ?? email.split("@")[0];

  pteroUserId = await findPanelUserByEmail(email);
  if (!pteroUserId) {
    pteroUserId = await createPanelUser({
      email,
      username: email.split("@")[0],
      firstName: display.split(" ")[0] || "Player",
      lastName: display.split(" ").slice(1).join(" ") || "User",
    });
  }

  const { error } = await input.db
    .from("profiles")
    .update({ pterodactyl_user_id: pteroUserId })
    .eq("id", input.userId);
  if (error) throw new Error(error.message);

  return pteroUserId;
}

async function getProvisioningRecipientEmail(
  db: SupabaseAny,
  userId: string,
  fallbackEmail?: string | null,
) {
  const profileResult = await db.from("profiles").select("email").eq("id", userId).maybeSingle();
  if (profileResult.error) {
    console.warn(
      `[Email] Could not load profile email for user=${userId}: ${profileResult.error.message}`,
    );
  }
  return ((profileResult.data as { email?: string | null } | null)?.email ?? fallbackEmail) || null;
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
    before?: Record<string, unknown> | null;
    after?: Record<string, unknown> | null;
  },
) {
  const { error } = await db.from("audit_logs").insert({
    actor_user_id: values.actorUserId ?? null,
    target_user_id: values.targetUserId ?? null,
    entity_type: values.entityType,
    entity_id: values.entityId ?? null,
    action: values.action,
    before: values.before ?? null,
    after: values.after ?? null,
  });
  if (error) console.warn(`[Audit] Failed to write ${values.action}: ${error.message}`);
}

export async function provisionServerOrder(input: ProvisionServerOrderInput) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { ptero, getEggDetails, getFirstFreeAllocation, assertPteroAppConfigured } =
    await import("@/lib/pterodactyl.server");
  assertPteroAppConfigured();

  const db = supabaseAdmin as unknown as SupabaseAny;

  const existingResult = await db
    .from("server_orders")
    .select("id, status, pterodactyl_server_id, pterodactyl_server_identifier")
    .eq("id", input.serverOrderId)
    .maybeSingle();
  const existing = existingResult.data as ExistingServerOrder | null;
  if (!existing) throw new Error("Server order not found.");
  if (existing.pterodactyl_server_id || existing.pterodactyl_server_identifier) {
    console.info(`[Provisioning] Server order ${input.serverOrderId} already has a server.`);
    let syncedStatus = existing.status;
    if (existing.pterodactyl_server_id) {
      try {
        const { ptero } = await import("@/lib/pterodactyl.server");
        const fetched = (await ptero.app(`/servers/${existing.pterodactyl_server_id}`)) as {
          attributes: { status?: string | null };
        };
        syncedStatus = mapPterodactylInstallStatus(
          "status" in fetched.attributes ? fetched.attributes.status : existing.status,
        );
        await db
          .from("server_orders")
          .update({ status: syncedStatus, error_message: null })
          .eq("id", input.serverOrderId);
      } catch (error) {
        console.warn(
          `[Provisioning] Could not sync existing server_order=${input.serverOrderId}: ${cleanProvisioningError(error)}`,
        );
      }
    }
    return {
      ok: true as const,
      serverOrderId: input.serverOrderId,
      status: syncedStatus,
      pterodactylServerId: existing.pterodactyl_server_id,
      pterodactylServerIdentifier: existing.pterodactyl_server_identifier,
      reused: true,
    };
  }
  if (existing.status === "provisioning") {
    console.info(
      `[Provisioning] Server order ${input.serverOrderId} is already provisioning; skipping duplicate launch.`,
    );
    return {
      ok: true as const,
      serverOrderId: input.serverOrderId,
      status: "provisioning" as const,
      pterodactylServerId: null,
      pterodactylServerIdentifier: null,
      reused: true,
    };
  }

  const { error: markProvisioningError } = await db
    .from("server_orders")
    .update({ status: "provisioning", error_message: null })
    .eq("id", input.serverOrderId);
  if (markProvisioningError) throw new Error(markProvisioningError.message);
  await writeActivityLog(db, {
    userId: input.userId,
    serverOrderId: input.serverOrderId,
    action: "provisioning_started",
    description: "Provisioning Pterodactyl server.",
    metadata: { planId: input.planId },
  });
  await writeAuditLog(db, {
    targetUserId: input.userId,
    entityType: "server_order",
    entityId: input.serverOrderId,
    action: "provisioning_started",
    after: { planId: input.planId },
  });

  const planResult = await db
    .from("plans")
    .select("*")
    .eq("id", input.planId)
    .eq("is_active", true)
    .single();
  const plan = planResult.data as Record<string, unknown> | null;
  if (planResult.error || !plan) throw new Error("Plan not found.");

  try {
    const { loadPlanTemplateVariants } = await import("@/lib/plans.functions");
    const variantsRaw = await loadPlanTemplateVariants(
      plan as Parameters<typeof loadPlanTemplateVariants>[0],
    );
    const variant = variantsRaw[input.variantIndex ?? 0] ?? variantsRaw[0];
    const parsedVariant = planVariantSchema.parse(variant);
    const egg = await getEggDetails(parsedVariant.nest_id, parsedVariant.egg_id);
    const dockerImage = parsedVariant.docker_image || egg.docker_image;
    const startup = parsedVariant.startup || egg.startup;
    if (!dockerImage) throw new Error("The selected Pterodactyl egg has no Docker image.");
    if (!startup) throw new Error("The selected Pterodactyl egg has no startup command.");

    const pteroUserId = await ensurePanelUser({
      db,
      userId: input.userId,
      fallbackEmail: input.fallbackEmail,
    });

    const allocation = await getFirstFreeAllocation();
    const eggDefaults: Record<string, string> = {};
    for (const v of egg.variables) eggDefaults[v.env_variable] = v.default_value ?? "";
    const allowedVariables = new Set(egg.variables.map((v) => v.env_variable));
    const planEnv = filterEnvironmentForEgg(
      normalizeEnvironment({
        ...((plan.environment as Record<string, unknown>) ?? {}),
        ...(parsedVariant.environment ?? {}),
        ...(parsedVariant.versionEnvironment ?? {}),
      }),
      allowedVariables,
      `plan ${String(plan.slug ?? plan.id)}`,
    );
    const userEnv = filterEnvironmentForEgg(
      normalizeEnvironment(input.environment ?? {}),
      allowedVariables,
      `server ${input.serverName}`,
    );
    const maxPlayersVariable = findMaxPlayersVariable(allowedVariables);
    const env = normalizeEnvironment({
      ...eggDefaults,
      ...planEnv,
      ...userEnv,
      ...(maxPlayersVariable && input.maxPlayers
        ? { [maxPlayersVariable]: String(normalizeMaxPlayers(input.maxPlayers)) }
        : {}),
    });
    if (input.maxPlayers && !maxPlayersVariable) {
      console.warn(
        `[Provisioning] max_players=${input.maxPlayers} stored but not applied: template has no supported max players variable.`,
      );
    }

    const payload = {
      name: input.serverName,
      user: pteroUserId,
      egg: parsedVariant.egg_id,
      docker_image: dockerImage,
      startup,
      environment: env,
      limits: {
        memory: plan.ram_mb,
        swap: plan.swap_mb,
        disk: plan.disk_mb,
        io: plan.io_weight,
        cpu: plan.cpu_percent,
      },
      feature_limits: { databases: 1, allocations: 1, backups: 2 },
      allocation: { default: allocation.id },
      skip_scripts: false,
      start_on_completion: true,
    };

    console.info(
      `[Provisioning] Creating Pterodactyl server for server_order=${input.serverOrderId}`,
    );
    const created = (await ptero.app("/servers", {
      method: "POST",
      body: JSON.stringify(payload),
    })) as { attributes: { id: number; identifier: string; status?: string | null } };

    const fetched = (await ptero.app(`/servers/${created.attributes.id}`)) as {
      attributes: { status?: string | null };
    };
    const createdStatus =
      "status" in fetched.attributes ? fetched.attributes.status : created.attributes.status;
    const nextStatus = mapPterodactylInstallStatus(createdStatus);
    const installError =
      nextStatus === "failed"
        ? `Pterodactyl reported server install status "${String(createdStatus)}".`
        : null;

    const { error: updateError } = await db
      .from("server_orders")
      .update({
        status: nextStatus,
        pterodactyl_server_id: created.attributes.id,
        pterodactyl_server_identifier: created.attributes.identifier,
        error_message: installError,
      })
      .eq("id", input.serverOrderId);
    if (updateError) throw new Error(updateError.message);
    await writeActivityLog(db, {
      userId: input.userId,
      serverOrderId: input.serverOrderId,
      action: nextStatus === "failed" ? "provisioning_failed" : "provisioning_succeeded",
      description:
        nextStatus === "failed"
          ? "Pterodactyl server provisioning failed."
          : "Pterodactyl server provisioning completed.",
      metadata: {
        pterodactylServerId: created.attributes.id,
        pterodactylServerIdentifier: created.attributes.identifier,
        status: nextStatus,
      },
    });
    await writeAuditLog(db, {
      targetUserId: input.userId,
      entityType: "server_order",
      entityId: input.serverOrderId,
      action: nextStatus === "failed" ? "provisioning_failed" : "provisioning_succeeded",
      after: {
        pterodactylServerId: created.attributes.id,
        pterodactylServerIdentifier: created.attributes.identifier,
        status: nextStatus,
      },
    });
    const recipientEmail = await getProvisioningRecipientEmail(
      db,
      input.userId,
      input.fallbackEmail,
    );
    const { sendTransactionalEmail, provisioningFailedEmail, serverReadyEmail } =
      await import("@/lib/email.server");
    await sendTransactionalEmail(
      nextStatus === "failed"
        ? provisioningFailedEmail({
            to: recipientEmail,
            serverName: input.serverName,
            error: installError ?? "Installation Pterodactyl échouée.",
          })
        : serverReadyEmail({
            to: recipientEmail,
            serverName: input.serverName,
            identifier: created.attributes.identifier,
          }),
    );

    return {
      ok: nextStatus !== "failed",
      serverOrderId: input.serverOrderId,
      status: nextStatus,
      pterodactylServerId: created.attributes.id,
      pterodactylServerIdentifier: created.attributes.identifier,
      error: installError,
      reused: false,
      minecraftSettings: {
        maxPlayers: input.maxPlayers ? normalizeMaxPlayers(input.maxPlayers) : null,
        maxPlayersApplied: Boolean(maxPlayersVariable && input.maxPlayers),
        maxPlayersVariable,
      },
    };
  } catch (error) {
    reportProvisioningError(error, {
      action: "provisionServerOrder",
      server_order_id: input.serverOrderId,
      user_id: input.userId,
      plan_id: input.planId,
    });
    const message = cleanProvisioningError(error);
    console.error(`[Provisioning] Failed server_order=${input.serverOrderId}: ${message}`);
    await db
      .from("server_orders")
      .update({ status: "failed", error_message: message })
      .eq("id", input.serverOrderId);
    await writeActivityLog(db, {
      userId: input.userId,
      serverOrderId: input.serverOrderId,
      action: "provisioning_failed",
      description: "Pterodactyl server provisioning failed.",
      metadata: { error: message },
    });
    await writeAuditLog(db, {
      targetUserId: input.userId,
      entityType: "server_order",
      entityId: input.serverOrderId,
      action: "provisioning_failed",
      after: { error: message },
    });
    const recipientEmail = await getProvisioningRecipientEmail(
      db,
      input.userId,
      input.fallbackEmail,
    );
    const { sendTransactionalEmail, provisioningFailedEmail } = await import("@/lib/email.server");
    await sendTransactionalEmail(
      provisioningFailedEmail({
        to: recipientEmail,
        serverName: input.serverName,
        error: message,
      }),
    );
    return {
      ok: false as const,
      serverOrderId: input.serverOrderId,
      status: "failed" as const,
      error: message,
      reused: false,
    };
  }
}

export async function provisionPaidOrder(orderId: string, options: ProvisionPaidOrderOptions = {}) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as unknown as SupabaseAny;

  const orderResult = await db
    .from("orders")
    .select("id, user_id, plan_id, product_id, status, metadata")
    .eq("id", orderId)
    .maybeSingle();
  const order = orderResult.data as PaidOrderRow | null;
  if (orderResult.error) throw new Error(orderResult.error.message);
  if (!order) throw new Error("Paid order not found.");
  if (!order.plan_id) throw new Error("Paid order has no plan_id.");
  if (!["paid", "active"].includes(order.status)) {
    throw new Error(`Order ${order.id} is not paid or active (status=${order.status}).`);
  }

  const planResult = await db
    .from("plans")
    .select("id, game, name, ram_mb")
    .eq("id", order.plan_id)
    .single();
  const plan = planResult.data as { game?: string; name?: string; ram_mb?: number | null } | null;
  if (planResult.error || !plan) throw new Error("Plan not found.");
  const selection = getPaidOrderProvisioningSelection(order);
  if (!selection.hasMaxPlayersMetadata) {
    selection.maxPlayers = defaultMaxPlayersForPlan(plan);
  }
  const selectedGame =
    selection.selectedGame !== "unknown" ? selection.selectedGame : normalizeGameKey(plan.game);
  const minecraft = isMinecraftGame(selectedGame);
  const provisioningMetadataBase = {
    selected_game: selectedGame,
    selected_template: {
      index: selection.variantIndex,
      ...(selection.templateId ? { template_id: selection.templateId } : {}),
      label: selection.templateLabel,
      version: selection.templateVersion,
      source: selection.templateSource,
      server_type: selection.serverType,
      egg_id: selection.eggId,
      nest_id: selection.nestId,
    },
    ...(selection.selectedModpack ? { selected_modpack: selection.selectedModpack } : {}),
    ...(selection.selectedModpackVersion
      ? { selected_modpack_version: selection.selectedModpackVersion }
      : {}),
    ...(selection.maxPlayers ? { max_players: selection.maxPlayers } : {}),
    ...(selection.playerPricing ? { player_pricing: selection.playerPricing } : {}),
    ...(minecraft
      ? {
          server_type: selection.serverType ?? selection.templateLabel,
          egg_id: selection.eggId,
          nest_id: selection.nestId,
          minecraft_version: selection.templateVersion ?? "auto",
          version_source: selection.templateVersion ? "xnt_catalog" : "template",
          version_apply_status: selection.versionApplyStatus ?? "managed",
          ...(selection.versionVariable ? { version_variable: selection.versionVariable } : {}),
          max_players: selection.maxPlayers,
          ...(selection.playerPricing ? { player_pricing: selection.playerPricing } : {}),
        }
      : {}),
  };
  const buildProvisioningMetadata = (
    maxPlayersApplied = false,
    maxPlayersVariable?: string | null,
  ) => ({
    ...provisioningMetadataBase,
    ...(minecraft
      ? {
          minecraft_settings: {
            server_type: selection.templateLabel,
            minecraft_version: selection.templateVersion ?? "auto",
            version_apply_status: selection.versionApplyStatus ?? "managed",
            ...(selection.versionVariable ? { version_variable: selection.versionVariable } : {}),
            max_players: selection.maxPlayers,
            max_players_applied: maxPlayersApplied,
            ...(maxPlayersVariable ? { max_players_variable: maxPlayersVariable } : {}),
          },
        }
      : {}),
  });
  const serverName =
    selection.serverName ?? `${plan.game ?? "Game"} ${plan.name ?? "Server"}`.slice(0, 40);

  const existingServerResult = await db
    .from("server_orders")
    .select("id, status, pterodactyl_server_id, pterodactyl_server_identifier")
    .eq("order_id", order.id)
    .maybeSingle();
  const existingServer = existingServerResult.data as ExistingServerOrder | null;
  if (existingServer?.pterodactyl_server_id || existingServer?.pterodactyl_server_identifier) {
    console.info(`[Provisioning] Order ${order.id} already provisioned.`);
    const result = await provisionServerOrder({
      serverOrderId: existingServer.id,
      userId: order.user_id,
      planId: order.plan_id,
      serverName,
      variantIndex: selection.variantIndex,
      environment: selection.environment,
    });
    return { ...result, orderId: order.id, serverOrderId: existingServer.id };
  }

  let serverOrderId = existingServer?.id ?? null;
  if (!serverOrderId) {
    const createdResult = await db
      .from("server_orders")
      .insert({
        user_id: order.user_id,
        plan_id: order.plan_id,
        product_id: order.product_id,
        order_id: order.id,
        server_name: serverName,
        status: "pending",
        metadata: buildProvisioningMetadata(false),
      })
      .select("id")
      .single();
    const created = createdResult.data as { id: string } | null;
    if (createdResult.error || !created) {
      if (createdResult.error?.code === "23505") {
        console.warn(
          `[Provisioning] server_order already exists for order=${order.id}; reloading.`,
        );
        const reloadedResult = await db
          .from("server_orders")
          .select("id")
          .eq("order_id", order.id)
          .maybeSingle();
        const reloaded = reloadedResult.data as { id: string } | null;
        if (reloadedResult.error || !reloaded) {
          throw new Error(
            reloadedResult.error?.message ??
              "Unique server_order exists but could not be reloaded.",
          );
        }
        serverOrderId = reloaded.id;
      } else {
        throw new Error(createdResult.error?.message ?? "Could not create server_order.");
      }
    } else {
      serverOrderId = created.id;
    }
  }

  if (options.source === "admin_retry") {
    await writeAuditLog(db, {
      actorUserId: options.actorUserId ?? null,
      targetUserId: order.user_id,
      entityType: "order",
      entityId: order.id,
      action: "admin_retry_provisioning",
      after: { serverOrderId },
    });
  }

  await db
    .from("server_orders")
    .update({
      metadata: buildProvisioningMetadata(false),
    })
    .eq("id", serverOrderId);

  const result = await provisionServerOrder({
    serverOrderId,
    userId: order.user_id,
    planId: order.plan_id,
    serverName,
    variantIndex: selection.variantIndex,
    environment: selection.environment,
    maxPlayers: selection.maxPlayers,
  });

  await db
    .from("server_orders")
    .update({
      metadata: buildProvisioningMetadata(
        "minecraftSettings" in result
          ? Boolean(result.minecraftSettings?.maxPlayersApplied)
          : false,
        "minecraftSettings" in result ? result.minecraftSettings?.maxPlayersVariable : null,
      ),
    })
    .eq("id", serverOrderId);

  if (result.ok) {
    try {
      const { applyInitialGameSettings } = await import("@/lib/servers.functions");
      const syncResult = await applyInitialGameSettings(serverOrderId, {
        syncedBy: options.actorUserId ?? order.user_id,
      });
      console.info("[GameSettingsSync] Initial sync after provisioning", {
        orderId: order.id,
        serverOrderId,
        status: syncResult.status,
        ok: syncResult.ok,
      });
    } catch (error) {
      console.warn("[GameSettingsSync] Initial sync hook failed", {
        orderId: order.id,
        serverOrderId,
        error: cleanProvisioningError(error),
      });
    }
  }

  if (selection.selectedModpack && result.ok) {
    try {
      const { enqueueModpackInstallJob } = await import("@/lib/modpack-install.functions");
      const jobResult = await enqueueModpackInstallJob(serverOrderId);
      if (jobResult.queued) {
        console.info("[ModpackInstall] Job queued after provisioning", {
          orderId: order.id,
          serverOrderId,
          jobId: jobResult.job?.id ?? null,
          reused: "reused" in jobResult ? jobResult.reused : false,
        });
      }
    } catch (error) {
      console.warn("[ModpackInstall] Could not enqueue job after provisioning", {
        orderId: order.id,
        serverOrderId,
        error: cleanProvisioningError(error),
      });
    }
  }

  if (result.ok && (result.pterodactylServerId || result.pterodactylServerIdentifier)) {
    await db
      .from("orders")
      .update({ status: "active", updated_at: new Date().toISOString() })
      .eq("id", order.id);
  }

  return { ...result, orderId: order.id, serverOrderId };
}
