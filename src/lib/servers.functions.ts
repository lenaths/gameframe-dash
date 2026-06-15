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
const MAX_FILE_CONTENT_BYTES = 1024 * 1024;
const BLOCKED_FILE_EXTENSIONS = new Set([
  ".jar",
  ".zip",
  ".tar",
  ".gz",
  ".exe",
  ".bin",
  ".sqlite",
  ".db",
]);

function byteLength(value: string) {
  return new TextEncoder().encode(value).length;
}

function hasBlockedExtension(path: string) {
  const lower = path.toLowerCase();
  return [...BLOCKED_FILE_EXTENSIONS].some((extension) => lower.endsWith(extension));
}

function normalizeServerPath(input: string, fallback = "/") {
  const raw = (input || fallback).trim().replace(/\\/g, "/");
  const prefixed = raw.startsWith("/") ? raw : `/${raw}`;
  const parts = prefixed.split("/");
  const clean: string[] = [];

  for (const part of parts) {
    if (!part || part === ".") continue;
    if (part === "..") throw new Error("Chemin de fichier non autorisé.");
    clean.push(part);
  }

  return `/${clean.join("/")}`;
}

function basename(path: string) {
  const normalized = normalizeServerPath(path);
  return normalized.split("/").pop() ?? "";
}

function dirname(path: string) {
  const normalized = normalizeServerPath(path);
  const index = normalized.lastIndexOf("/");
  return index <= 0 ? "/" : normalized.slice(0, index);
}

function assertEditableFilePath(path: string) {
  const normalized = normalizeServerPath(path);
  if (hasBlockedExtension(normalized)) {
    throw new Error("Ce fichier ne peut pas être ouvert dans l’éditeur.");
  }
  return normalized;
}

async function assertFileSizeAllowed(identifier: string, file: string) {
  const { ptero } = await import("@/lib/pterodactyl.server");
  const directory = dirname(file);
  const name = basename(file);
  const res = (await ptero.client(
    `/servers/${identifier}/files/list?directory=${encodeURIComponent(directory)}`,
  )) as {
    data?: Array<{
      attributes: {
        name: string;
        size: number;
        is_file: boolean;
      };
    }>;
  };
  const entry = res.data?.find((item) => item.attributes.name === name)?.attributes;
  if (!entry || !entry.is_file) throw new Error("Fichier introuvable.");
  if (entry.size > MAX_FILE_CONTENT_BYTES) {
    throw new Error("Ce fichier ne peut pas être ouvert dans l’éditeur.");
  }
}

async function loadOwnedOrder(
  supabase: import("@supabase/supabase-js").SupabaseClient,
  orderId: string,
  userId: string,
): Promise<{
  pterodactyl_server_identifier: string | null;
  pterodactyl_server_id: number | null;
}> {
  const { data, error } = await supabase
    .from("server_orders")
    .select("pterodactyl_server_identifier, pterodactyl_server_id")
    .eq("id", orderId)
    .eq("user_id", userId)
    .single();
  if (error || !data) {
    throw new Error("Server not found or access denied.");
  }
  return data;
}

/** Resolve a server identifier owned by the current authenticated user. */
async function loadOwnedIdentifier(
  supabase: import("@supabase/supabase-js").SupabaseClient,
  orderId: string,
  userId: string,
): Promise<string> {
  const order = await loadOwnedOrder(supabase, orderId, userId);
  if (!order.pterodactyl_server_identifier) {
    throw new Error("Server not found or access denied.");
  }
  return order.pterodactyl_server_identifier;
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
      .eq("user_id", context.userId)
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

    const { data: plan, error: planErr } = await supabaseAdmin
      .from("plans")
      .select("*")
      .eq("id", data.planId)
      .eq("is_active", true)
      .single();
    if (planErr || !plan) throw new Error("Plan not found.");

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

    const { provisionServerOrder } = await import("@/lib/provisioning.server");
    const result = await provisionServerOrder({
      serverOrderId: order.id,
      userId,
      planId: plan.id,
      serverName: data.serverName,
      variantIndex: data.variantIndex,
      environment: data.environment,
      fallbackEmail: (claims?.email as string | undefined) ?? null,
    });

    if (!result.ok) {
      return { ok: false as const, orderId: order.id, status: result.status, error: result.error };
    }
    return { ok: true as const, orderId: order.id, status: result.status, error: result.error };
  });

export const powerServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => powerInput.parse(d))
  .handler(async ({ data, context }) => {
    const identifier = await loadOwnedIdentifier(context.supabase, data.orderId, context.userId);
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
      .eq("user_id", context.userId)
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
      const identifier = await loadOwnedIdentifier(context.supabase, data.orderId, context.userId);
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
    const identifier = await loadOwnedIdentifier(context.supabase, data.orderId, context.userId);
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
      const identifier = await loadOwnedIdentifier(context.supabase, data.orderId, context.userId);
      const { ptero, assertPteroClientConfigured } = await import("@/lib/pterodactyl.server");
      assertPteroClientConfigured();
      const directory = normalizeServerPath(data.directory);
      const res = (await ptero.client(
        `/servers/${identifier}/files/list?directory=${encodeURIComponent(directory)}`,
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
        directory,
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
    const identifier = await loadOwnedIdentifier(context.supabase, data.orderId, context.userId);
    const { ptero, assertPteroClientConfigured } = await import("@/lib/pterodactyl.server");
    assertPteroClientConfigured();
    const file = assertEditableFilePath(data.file);
    await assertFileSizeAllowed(identifier, file);
    const text = (await ptero.client(
      `/servers/${identifier}/files/contents?file=${encodeURIComponent(file)}`,
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
        contents: z.string(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const identifier = await loadOwnedIdentifier(context.supabase, data.orderId, context.userId);
    const { ptero, assertPteroClientConfigured } = await import("@/lib/pterodactyl.server");
    assertPteroClientConfigured();
    const file = assertEditableFilePath(data.file);
    if (byteLength(data.contents) > MAX_FILE_CONTENT_BYTES) {
      throw new Error("Ce fichier ne peut pas être ouvert dans l’éditeur.");
    }
    await ptero.client(`/servers/${identifier}/files/write?file=${encodeURIComponent(file)}`, {
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
    const identifier = await loadOwnedIdentifier(context.supabase, data.orderId, context.userId);
    const { ptero, assertPteroClientConfigured } = await import("@/lib/pterodactyl.server");
    assertPteroClientConfigured();
    const root = normalizeServerPath(data.root);
    const files = data.files.map((file) => {
      if (file.includes("/") || file.includes("\\") || file === "." || file === "..") {
        throw new Error("Chemin de fichier non autorisé.");
      }
      if (hasBlockedExtension(file)) {
        throw new Error("Ce fichier ne peut pas être ouvert dans l’éditeur.");
      }
      return file;
    });
    await ptero.client(`/servers/${identifier}/files/delete`, {
      method: "POST",
      body: JSON.stringify({ root, files }),
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
    const identifier = await loadOwnedIdentifier(context.supabase, data.orderId, context.userId);
    const { ptero, assertPteroClientConfigured } = await import("@/lib/pterodactyl.server");
    assertPteroClientConfigured();
    const root = normalizeServerPath(data.root);
    if (
      data.name.includes("/") ||
      data.name.includes("\\") ||
      data.name === "." ||
      data.name === ".."
    ) {
      throw new Error("Chemin de fichier non autorisé.");
    }
    if (hasBlockedExtension(data.name)) {
      throw new Error("Ce fichier ne peut pas être ouvert dans l’éditeur.");
    }
    await ptero.client(`/servers/${identifier}/files/create-folder`, {
      method: "POST",
      body: JSON.stringify({ root, name: data.name }),
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
    const identifier = await loadOwnedIdentifier(context.supabase, data.orderId, context.userId);
    const { ptero, assertPteroClientConfigured } = await import("@/lib/pterodactyl.server");
    assertPteroClientConfigured();
    const root = normalizeServerPath(data.root);
    for (const file of [data.from, data.to]) {
      if (file.includes("/") || file.includes("\\") || file === "." || file === "..") {
        throw new Error("Chemin de fichier non autorisé.");
      }
      if (hasBlockedExtension(file)) {
        throw new Error("Ce fichier ne peut pas être ouvert dans l’éditeur.");
      }
    }
    await ptero.client(`/servers/${identifier}/files/rename`, {
      method: "PUT",
      body: JSON.stringify({ root, files: [{ from: data.from, to: data.to }] }),
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
      .eq("user_id", context.userId)
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
      .eq("user_id", context.userId)
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
