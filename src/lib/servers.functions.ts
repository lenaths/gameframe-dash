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
      .select("id, server_name, status, pterodactyl_server_identifier, pterodactyl_server_id, error_message, created_at, plans(name, game, ram_mb, cpu_percent, disk_mb)")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { servers: data ?? [] };
  });

export const deployServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => deployInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId, claims } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { ptero, getDefaultLocationId, getEggDetails, createPanelUser, assertPteroConfigured } = await import("@/lib/pterodactyl.server");
    assertPteroConfigured();

    const { data: plan, error: planErr } = await supabaseAdmin
      .from("plans").select("*").eq("id", data.planId).eq("is_active", true).single();
    if (planErr || !plan) throw new Error("Plan not found.");

    // Resolve the chosen variant (or fall back to the plan's single egg).
    type Variant = { nest_id: number; egg_id: number; label?: string; docker_image?: string; startup?: string };
    const variantsRaw: Variant[] = Array.isArray(plan.allowed_eggs) && plan.allowed_eggs.length > 0
      ? (plan.allowed_eggs as unknown as Variant[])
      : [{ nest_id: plan.pterodactyl_nest_id, egg_id: plan.pterodactyl_egg_id }];
    const variant = variantsRaw[data.variantIndex] ?? variantsRaw[0];
    const egg = await getEggDetails(variant.nest_id, variant.egg_id);

    // Ensure the user has a panel account.
    const { data: profile } = await supabaseAdmin
      .from("profiles").select("id, email, display_name, pterodactyl_user_id").eq("id", userId).maybeSingle();

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
      await supabaseAdmin.from("profiles").update({ pterodactyl_user_id: pteroUserId }).eq("id", userId);
    }

    const { data: order, error: orderErr } = await supabase
      .from("server_orders")
      .insert({ user_id: userId, plan_id: plan.id, server_name: data.serverName, status: "provisioning" })
      .select("*").single();
    if (orderErr || !order) throw new Error(orderErr?.message ?? "Could not create order.");

    try {
      const locationId = await getDefaultLocationId();
      // Defaults from the egg, overlaid with plan-wide overrides and the user's choices.
      const eggDefaults: Record<string, string> = {};
      for (const v of egg.variables) eggDefaults[v.env_variable] = v.default_value ?? "";
      const planEnv = (plan.environment as Record<string, unknown>) ?? {};
      const env: Record<string, unknown> = { ...eggDefaults, ...planEnv, ...data.environment };

      const defaultPorts: Record<string, string> = {
        minecraft: "25565", bungeecord: "25565", rust: "28015", valheim: "2456",
        terraria: "7777", ark: "7777", csgo: "27015", garrysmod: "27015",
      };
      const preferredPort = defaultPorts[String(plan.game ?? "").toLowerCase()];

      const payload = {
        name: data.serverName,
        user: pteroUserId,
        egg: variant.egg_id,
        docker_image: variant.docker_image || egg.docker_image,
        startup: variant.startup || egg.startup,
        environment: env,
        limits: {
          memory: plan.ram_mb, swap: plan.swap_mb, disk: plan.disk_mb,
          io: plan.io_weight, cpu: plan.cpu_percent,
        },
        feature_limits: { databases: 1, allocations: 1, backups: 2 },
        deploy: {
          locations: [locationId],
          dedicated_ip: false,
          port_range: preferredPort ? [preferredPort] : [],
        },
        skip_scripts: false,
        start_on_completion: true,
      };

      const created = (await ptero.app("/servers", {
        method: "POST",
        body: JSON.stringify(payload),
      })) as { attributes: { id: number; identifier: string } };


      const { error: updErr } = await supabaseAdmin
        .from("server_orders")
        .update({
          status: "active",
          pterodactyl_server_id: created.attributes.id,
          pterodactyl_server_identifier: created.attributes.identifier,
        })
        .eq("id", order.id);
      if (updErr) throw new Error(updErr.message);

      return { ok: true as const, orderId: order.id };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await supabaseAdmin
        .from("server_orders")
        .update({ status: "failed", error_message: msg })
        .eq("id", order.id);
      return { ok: false as const, orderId: order.id, error: msg };
    }
  });

export const powerServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => powerInput.parse(d))
  .handler(async ({ data, context }) => {
    const identifier = await loadIdentifier(context.supabase, data.orderId);
    const { ptero, assertPteroConfigured } = await import("@/lib/pterodactyl.server");
    assertPteroConfigured();
    await ptero.client(`/servers/${identifier}/power`, {
      method: "POST",
      body: JSON.stringify({ signal: data.signal }),
    });
    return { ok: true };
  });

export const getServerDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => orderInput.parse(d))
  .handler(async ({ data, context }) => {
    const { data: order, error } = await context.supabase
      .from("server_orders")
      .select("id, server_name, status, pterodactyl_server_identifier, error_message, created_at, plans(name, game, ram_mb, cpu_percent, disk_mb)")
      .eq("id", data.orderId)
      .single();
    if (error || !order) throw new Error("Server not found.");
    if (!order.pterodactyl_server_identifier) return { order, live: null };

    const { ptero, assertPteroConfigured } = await import("@/lib/pterodactyl.server");
    assertPteroConfigured();
    try {
      const res = (await ptero.client(`/servers/${order.pterodactyl_server_identifier}/resources`)) as {
        attributes: { current_state: string; resources: { memory_bytes: number; cpu_absolute: number; disk_bytes: number; network_rx_bytes: number; network_tx_bytes: number } };
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
    } catch {
      return { order, live: null };
    }
  });

/** Get the Pterodactyl websocket URL + short-lived token for the in-app console. */
export const getServerWebsocket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => orderInput.parse(d))
  .handler(async ({ data, context }) => {
    const identifier = await loadIdentifier(context.supabase, data.orderId);
    const { ptero, assertPteroConfigured } = await import("@/lib/pterodactyl.server");
    assertPteroConfigured();
    const res = (await ptero.client(`/servers/${identifier}/websocket`)) as { data: { token: string; socket: string } };
    return res.data;
  });

/** Send a console command to a running server. */
export const sendServerCommand = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ orderId: z.string().uuid(), command: z.string().min(1).max(2000) }).parse(d))
  .handler(async ({ data, context }) => {
    const identifier = await loadIdentifier(context.supabase, data.orderId);
    const { ptero, assertPteroConfigured } = await import("@/lib/pterodactyl.server");
    assertPteroConfigured();
    await ptero.client(`/servers/${identifier}/command`, {
      method: "POST",
      body: JSON.stringify({ command: data.command }),
    });
    return { ok: true };
  });

/** List files in a directory. */
export const listServerFiles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ orderId: z.string().uuid(), directory: z.string().default("/") }).parse(d))
  .handler(async ({ data, context }) => {
    const identifier = await loadIdentifier(context.supabase, data.orderId);
    const { ptero, assertPteroConfigured } = await import("@/lib/pterodactyl.server");
    assertPteroConfigured();
    try {
      const res = (await ptero.client(`/servers/${identifier}/files/list?directory=${encodeURIComponent(data.directory)}`)) as {
        data: Array<{ attributes: { name: string; mode: string; size: number; is_file: boolean; is_symlink: boolean; mimetype: string; modified_at: string } }>;
      };
      return { directory: data.directory, files: res.data.map((d) => d.attributes), error: null as string | null };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { directory: data.directory, files: [], error: msg };
    }
  });

/** Read a text file. */
export const readServerFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ orderId: z.string().uuid(), file: z.string().min(1) }).parse(d))
  .handler(async ({ data, context }) => {
    const identifier = await loadIdentifier(context.supabase, data.orderId);
    const { ptero, assertPteroConfigured } = await import("@/lib/pterodactyl.server");
    assertPteroConfigured();
    const text = (await ptero.client(
      `/servers/${identifier}/files/contents?file=${encodeURIComponent(data.file)}`,
      { raw: true },
    )) as string;
    return { contents: text };
  });

/** Write a text file. */
export const writeServerFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ orderId: z.string().uuid(), file: z.string().min(1), contents: z.string().max(5_000_000) }).parse(d))
  .handler(async ({ data, context }) => {
    const identifier = await loadIdentifier(context.supabase, data.orderId);
    const { ptero, assertPteroConfigured } = await import("@/lib/pterodactyl.server");
    assertPteroConfigured();
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
  .inputValidator((d: unknown) => z.object({ orderId: z.string().uuid(), root: z.string().default("/"), files: z.array(z.string()).min(1) }).parse(d))
  .handler(async ({ data, context }) => {
    const identifier = await loadIdentifier(context.supabase, data.orderId);
    const { ptero, assertPteroConfigured } = await import("@/lib/pterodactyl.server");
    assertPteroConfigured();
    await ptero.client(`/servers/${identifier}/files/delete`, {
      method: "POST",
      body: JSON.stringify({ root: data.root, files: data.files }),
    });
    return { ok: true };
  });

/** Create a new folder. */
export const createServerFolder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ orderId: z.string().uuid(), root: z.string().default("/"), name: z.string().min(1).max(255) }).parse(d))
  .handler(async ({ data, context }) => {
    const identifier = await loadIdentifier(context.supabase, data.orderId);
    const { ptero, assertPteroConfigured } = await import("@/lib/pterodactyl.server");
    assertPteroConfigured();
    await ptero.client(`/servers/${identifier}/files/create-folder`, {
      method: "POST",
      body: JSON.stringify({ root: data.root, name: data.name }),
    });
    return { ok: true };
  });

/** Rename a file or folder. */
export const renameServerFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ orderId: z.string().uuid(), root: z.string().default("/"), from: z.string().min(1), to: z.string().min(1) }).parse(d))
  .handler(async ({ data, context }) => {
    const identifier = await loadIdentifier(context.supabase, data.orderId);
    const { ptero, assertPteroConfigured } = await import("@/lib/pterodactyl.server");
    assertPteroConfigured();
    await ptero.client(`/servers/${identifier}/files/rename`, {
      method: "PUT",
      body: JSON.stringify({ root: data.root, files: [{ from: data.from, to: data.to }] }),
    });
    return { ok: true };
  });

/** Get current startup state (egg, vars, environment) for a server. */
export const getServerStartup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => orderInput.parse(d))
  .handler(async ({ data, context }) => {
    const { data: order, error } = await context.supabase
      .from("server_orders")
      .select("id, pterodactyl_server_id, plan_id")
      .eq("id", data.orderId)
      .single();
    if (error || !order?.pterodactyl_server_id) throw new Error("Server not found.");

    const { getServerStartupApp, assertPteroConfigured } = await import("@/lib/pterodactyl.server");
    assertPteroConfigured();
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
  .inputValidator((d: unknown) => z.object({
    orderId: z.string().uuid(),
    environment: z.record(z.string(), z.string()),
    reinstall: z.boolean().default(false),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: order, error } = await context.supabase
      .from("server_orders")
      .select("id, pterodactyl_server_id")
      .eq("id", data.orderId)
      .single();
    if (error || !order?.pterodactyl_server_id) throw new Error("Server not found.");

    const { getServerStartupApp, updateServerStartupApp, reinstallServer, assertPteroConfigured } = await import("@/lib/pterodactyl.server");
    assertPteroConfigured();

    const current = await getServerStartupApp(order.pterodactyl_server_id);
    const editable = new Set(current.variables.filter((v) => v.user_editable).map((v) => v.env_variable));
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
