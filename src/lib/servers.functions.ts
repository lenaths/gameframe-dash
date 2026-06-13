import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const deployInput = z.object({
  planId: z.string().uuid(),
  serverName: z.string().min(2).max(40),
  variantIndex: z.number().int().min(0).default(0),
  environment: z.record(z.string(), z.string()).default({}),
});

const powerInput = z.object({
  orderId: z.string().uuid(),
  signal: z.enum(["start", "stop", "restart", "kill"]),
});

const orderInput = z.object({ orderId: z.string().uuid() });

const planVariantSchema = z.object({
  nest_id: z.number().int().positive(),
  egg_id: z.number().int().positive(),
  label: z.string().optional(),
  docker_image: z.string().trim().min(1).optional(),
  startup: z.string().trim().min(1).optional(),
});

type ServerOrderStatus =
  | "pending"
  | "provisioning"
  | "active"
  | "suspended"
  | "failed"
  | "cancelled";

function cleanError(error: unknown) {
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

/** Resolve a server identifier owned by the current user (or admin). */
async function loadIdentifier(
  supabase: import("@supabase/supabase-js").SupabaseClient,
  orderId: string,
): Promise<string> {
  const { data, error } = await supabase
    .from("server_orders")
    .select("pterodactyl_server_identifier")
    .eq("id", orderId)
    .single();
  if (error || !data?.pterodactyl_server_identifier) {
    throw new Error("Server not found or access denied.");
  }
  return data.pterodactyl_server_identifier as string;
}

export const listMyServers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("server_orders")
      .select(
        "id, server_name, status, pterodactyl_server_identifier, pterodactyl_server_id, error_message, created_at, plans(name, game, ram_mb, cpu_percent, disk_mb)",
      )
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { servers: data ?? [] };
  });

export const deployServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => deployInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId, claims } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const {
      ptero,
      getEggDetails,
      getFirstFreeAllocation,
      createPanelUser,
      assertPteroAppConfigured,
    } = await import("@/lib/pterodactyl.server");
    assertPteroAppConfigured();

    const { data: plan, error: planErr } = await supabaseAdmin
      .from("plans")
      .select("*")
      .eq("id", data.planId)
      .eq("is_active", true)
      .single();
    if (planErr || !plan) throw new Error("Plan not found.");

    // Resolve the chosen variant (or fall back to the plan's single egg).
    const variantsRaw =
      Array.isArray(plan.allowed_eggs) && plan.allowed_eggs.length > 0
        ? plan.allowed_eggs
        : [{ nest_id: plan.pterodactyl_nest_id, egg_id: plan.pterodactyl_egg_id }];
    const variant = variantsRaw[data.variantIndex] ?? variantsRaw[0];
    const parsedVariant = planVariantSchema.parse(variant);
    const egg = await getEggDetails(parsedVariant.nest_id, parsedVariant.egg_id);
    const dockerImage = parsedVariant.docker_image || egg.docker_image;
    const startup = parsedVariant.startup || egg.startup;
    if (!dockerImage) throw new Error("The selected Pterodactyl egg has no Docker image.");
    if (!startup) throw new Error("The selected Pterodactyl egg has no startup command.");

    // Ensure the user has a panel account.
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("id, email, display_name, pterodactyl_user_id")
      .eq("id", userId)
      .maybeSingle();

    let pteroUserId = profile?.pterodactyl_user_id ?? null;
    if (!pteroUserId) {
      const email = (profile?.email ?? claims?.email ?? "") as string;
      if (!email) throw new Error("Missing email for panel account creation.");
      const display = (profile?.display_name ?? email.split("@")[0]) as string;
      pteroUserId = await createPanelUser({
        email,
        username: email.split("@")[0],
        firstName: display.split(" ")[0] || "Player",
        lastName: display.split(" ").slice(1).join(" ") || "User",
      });
      await supabaseAdmin
        .from("profiles")
        .update({ pterodactyl_user_id: pteroUserId })
        .eq("id", userId);
    }

    const { data: order, error: orderErr } = await supabase
      .from("server_orders")
      .insert({
        user_id: userId,
        plan_id: plan.id,
        server_name: data.serverName,
        status: "provisioning",
      })
      .select("*")
      .single();
    if (orderErr || !order) throw new Error(orderErr?.message ?? "Could not create order.");

    try {
      const allocation = await getFirstFreeAllocation();
      // Defaults from the egg, overlaid with known plan/user variables only.
      const eggDefaults: Record<string, string> = {};
      for (const v of egg.variables) eggDefaults[v.env_variable] = v.default_value ?? "";
      const allowedVariables = new Set(egg.variables.map((v) => v.env_variable));
      const planEnv = filterEnvironmentForEgg(
        normalizeEnvironment((plan.environment as Record<string, unknown>) ?? {}),
        allowedVariables,
        `plan ${String(plan.slug ?? plan.id)}`,
      );
      const userEnv = filterEnvironmentForEgg(
        normalizeEnvironment(data.environment),
        allowedVariables,
        `server ${data.serverName}`,
      );
      const env = normalizeEnvironment({ ...eggDefaults, ...planEnv, ...userEnv });

      const payload = {
        name: data.serverName,
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

      const created = (await ptero.app("/servers", {
        method: "POST",
        body: JSON.stringify(payload),
      })) as { attributes: { id: number; identifier: string; status?: string | null } };

      const createdStatus = created.attributes.status;
      const nextStatus = mapPterodactylInstallStatus(createdStatus);
      const installError =
        nextStatus === "failed"
          ? `Pterodactyl reported server install status "${String(createdStatus)}".`
          : null;

      const { error: updErr } = await supabaseAdmin
        .from("server_orders")
        .update({
          status: nextStatus,
          pterodactyl_server_id: created.attributes.id,
          pterodactyl_server_identifier: created.attributes.identifier,
          error_message: installError,
        })
        .eq("id", order.id);
      if (updErr) throw new Error(updErr.message);

      if (nextStatus === "failed") {
        return { ok: false as const, orderId: order.id, status: nextStatus, error: installError };
      }
      return { ok: true as const, orderId: order.id, status: nextStatus, error: installError };
    } catch (err) {
      const msg = cleanError(err);
      await supabaseAdmin
        .from("server_orders")
        .update({ status: "failed", error_message: msg })
        .eq("id", order.id);
      return { ok: false as const, orderId: order.id, error: msg };
    }
  });

export const powerServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => powerInput.parse(d))
  .handler(async ({ data, context }) => {
    const identifier = await loadIdentifier(context.supabase, data.orderId);
    const { ptero, assertPteroClientConfigured } = await import("@/lib/pterodactyl.server");
    assertPteroClientConfigured();
    await ptero.client(`/servers/${identifier}/power`, {
      method: "POST",
      body: JSON.stringify({ signal: data.signal }),
    });
    return { ok: true };
  });

export const getServerDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => orderInput.parse(d))
  .handler(async ({ data, context }) => {
    const { data: order, error } = await context.supabase
      .from("server_orders")
      .select(
        "id, server_name, status, pterodactyl_server_identifier, error_message, created_at, plans(name, game, ram_mb, cpu_percent, disk_mb)",
      )
      .eq("id", data.orderId)
      .single();
    if (error || !order) throw new Error("Server not found.");
    if (!order.pterodactyl_server_identifier) return { order, live: null };

    try {
      const { ptero, assertPteroClientConfigured } = await import("@/lib/pterodactyl.server");
      assertPteroClientConfigured();
      const res = (await ptero.client(
        `/servers/${order.pterodactyl_server_identifier}/resources`,
      )) as {
        attributes: {
          current_state: string;
          resources: {
            memory_bytes: number;
            cpu_absolute: number;
            disk_bytes: number;
            network_rx_bytes: number;
            network_tx_bytes: number;
          };
        };
      };
      const meta = (await ptero.client(`/servers/${order.pterodactyl_server_identifier}`)) as {
        attributes: { sftp_details?: { ip: string; port: number }; relationships?: unknown };
      };
      return {
        order,
        live: {
          state: res.attributes.current_state,
          memoryMb: Math.round(res.attributes.resources.memory_bytes / 1024 / 1024),
          cpu: Math.round(res.attributes.resources.cpu_absolute),
          diskMb: Math.round(res.attributes.resources.disk_bytes / 1024 / 1024),
          rxMb: Math.round(res.attributes.resources.network_rx_bytes / 1024 / 1024),
          txMb: Math.round(res.attributes.resources.network_tx_bytes / 1024 / 1024),
          sftp: meta.attributes.sftp_details ?? null,
        },
      };
    } catch (err) {
      return {
        order,
        live: null,
        warning: err instanceof Error ? err.message : "Pterodactyl live data unavailable.",
      };
    }
  });

/** Get the Pterodactyl websocket URL + short-lived token for the in-app console. */
export const getServerWebsocket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => orderInput.parse(d))
  .handler(async ({ data, context }) => {
    try {
      const identifier = await loadIdentifier(context.supabase, data.orderId);
      const { ptero, assertPteroClientConfigured } = await import("@/lib/pterodactyl.server");
      assertPteroClientConfigured();
      const res = (await ptero.client(`/servers/${identifier}/websocket`)) as {
        data: { token: string; socket: string };
      };
      return { ok: true as const, token: res.data.token, socket: res.data.socket };
    } catch (e) {
      return { ok: false as const, error: (e as Error).message };
    }
  });

/** Send a console command to a running server. */
export const sendServerCommand = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z.object({ orderId: z.string().uuid(), command: z.string().min(1).max(2000) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const identifier = await loadIdentifier(context.supabase, data.orderId);
    const { ptero, assertPteroClientConfigured } = await import("@/lib/pterodactyl.server");
    assertPteroClientConfigured();
    await ptero.client(`/servers/${identifier}/command`, {
      method: "POST",
      body: JSON.stringify({ command: data.command }),
    });
    return { ok: true };
  });

/** List files in a directory. */
export const listServerFiles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z.object({ orderId: z.string().uuid(), directory: z.string().default("/") }).parse(d),
  )
  .handler(async ({ data, context }) => {
    try {
      const identifier = await loadIdentifier(context.supabase, data.orderId);
      const { ptero, assertPteroClientConfigured } = await import("@/lib/pterodactyl.server");
      assertPteroClientConfigured();
      const res = (await ptero.client(
        `/servers/${identifier}/files/list?directory=${encodeURIComponent(data.directory)}`,
      )) as {
        data: Array<{
          attributes: {
            name: string;
            mode: string;
            size: number;
            is_file: boolean;
            is_symlink: boolean;
            mimetype: string;
            modified_at: string;
          };
        }>;
      };
      return {
        directory: data.directory,
        files: res.data.map((d) => d.attributes),
        error: null as string | null,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { directory: data.directory, files: [], error: msg };
    }
  });

/** Read a text file. */
export const readServerFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z.object({ orderId: z.string().uuid(), file: z.string().min(1) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const identifier = await loadIdentifier(context.supabase, data.orderId);
    const { ptero, assertPteroClientConfigured } = await import("@/lib/pterodactyl.server");
    assertPteroClientConfigured();
    const text = (await ptero.client(
      `/servers/${identifier}/files/contents?file=${encodeURIComponent(data.file)}`,
      { raw: true },
    )) as string;
    return { contents: text };
  });

/** Write a text file. */
export const writeServerFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        orderId: z.string().uuid(),
        file: z.string().min(1),
        contents: z.string().max(5_000_000),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const identifier = await loadIdentifier(context.supabase, data.orderId);
    const { ptero, assertPteroClientConfigured } = await import("@/lib/pterodactyl.server");
    assertPteroClientConfigured();
    await ptero.client(`/servers/${identifier}/files/write?file=${encodeURIComponent(data.file)}`, {
      method: "POST",
      body: data.contents,
      contentType: "text/plain",
    });
    return { ok: true };
  });

/** Delete files or folders. */
export const deleteServerFiles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        orderId: z.string().uuid(),
        root: z.string().default("/"),
        files: z.array(z.string()).min(1),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const identifier = await loadIdentifier(context.supabase, data.orderId);
    const { ptero, assertPteroClientConfigured } = await import("@/lib/pterodactyl.server");
    assertPteroClientConfigured();
    await ptero.client(`/servers/${identifier}/files/delete`, {
      method: "POST",
      body: JSON.stringify({ root: data.root, files: data.files }),
    });
    return { ok: true };
  });

/** Create a new folder. */
export const createServerFolder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        orderId: z.string().uuid(),
        root: z.string().default("/"),
        name: z.string().min(1).max(255),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const identifier = await loadIdentifier(context.supabase, data.orderId);
    const { ptero, assertPteroClientConfigured } = await import("@/lib/pterodactyl.server");
    assertPteroClientConfigured();
    await ptero.client(`/servers/${identifier}/files/create-folder`, {
      method: "POST",
      body: JSON.stringify({ root: data.root, name: data.name }),
    });
    return { ok: true };
  });

/** Rename a file or folder. */
export const renameServerFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        orderId: z.string().uuid(),
        root: z.string().default("/"),
        from: z.string().min(1),
        to: z.string().min(1),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const identifier = await loadIdentifier(context.supabase, data.orderId);
    const { ptero, assertPteroClientConfigured } = await import("@/lib/pterodactyl.server");
    assertPteroClientConfigured();
    await ptero.client(`/servers/${identifier}/files/rename`, {
      method: "PUT",
      body: JSON.stringify({ root: data.root, files: [{ from: data.from, to: data.to }] }),
    });
    return { ok: true };
  });

/** Get current startup state (egg, vars, environment) for a server. */
export const getServerStartup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => orderInput.parse(d))
  .handler(async ({ data, context }) => {
    const { data: order, error } = await context.supabase
      .from("server_orders")
      .select("id, pterodactyl_server_id, plan_id")
      .eq("id", data.orderId)
      .single();
    if (error || !order?.pterodactyl_server_id) throw new Error("Server not found.");

    const { getServerStartupApp, assertPteroAppConfigured } =
      await import("@/lib/pterodactyl.server");
    assertPteroAppConfigured();
    const s = await getServerStartupApp(order.pterodactyl_server_id);
    return {
      nest: s.nest,
      egg: s.egg,
      startup: s.startup,
      image: s.image,
      environment: s.environment,
      variables: s.variables.filter((v) => v.user_viewable),
    };
  });

/** Update startup variables. Triggers reinstall when caller asks (or when egg/version-like vars change). */
export const updateServerStartup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        orderId: z.string().uuid(),
        environment: z.record(z.string(), z.string()),
        reinstall: z.boolean().default(false),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: order, error } = await context.supabase
      .from("server_orders")
      .select("id, pterodactyl_server_id")
      .eq("id", data.orderId)
      .single();
    if (error || !order?.pterodactyl_server_id) throw new Error("Server not found.");

    const {
      getServerStartupApp,
      updateServerStartupApp,
      reinstallServer,
      assertPteroAppConfigured,
    } = await import("@/lib/pterodactyl.server");
    assertPteroAppConfigured();

    const current = await getServerStartupApp(order.pterodactyl_server_id);
    const editable = new Set(
      current.variables.filter((v) => v.user_editable).map((v) => v.env_variable),
    );
    const nextEnv: Record<string, string> = { ...current.environment };
    for (const [k, v] of Object.entries(data.environment)) {
      if (editable.has(k)) nextEnv[k] = v;
    }

    await updateServerStartupApp(order.pterodactyl_server_id, {
      environment: nextEnv,
      startup: current.startup,
      egg: current.egg,
      image: current.image,
    });
    if (data.reinstall) await reinstallServer(order.pterodactyl_server_id);
    return { ok: true };
  });
