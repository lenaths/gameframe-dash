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
const backupInput = z.object({ orderId: z.string().uuid(), backupId: z.string().uuid() });

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
};

type ServerListRow = {
  id: string;
  order_id: string | null;
  server_name: string;
  status: string;
  pterodactyl_server_identifier: string | null;
  pterodactyl_server_id: number | null;
  error_message: string | null;
  created_at: string;
  plans?: {
    name?: string | null;
    game?: string | null;
    ram_mb?: number | null;
    cpu_percent?: number | null;
    disk_mb?: number | null;
  } | null;
};

type ServerListItem = ServerListRow & {
  billing_status: string | null;
  last_payment_at: string | null;
  next_renewal_at: string | null;
};

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

type PteroAllocation = {
  attributes?: {
    id?: number | null;
    ip?: string | null;
    ip_alias?: string | null;
    alias?: string | null;
    port?: number | null;
    is_default?: boolean | null;
  };
};

type PteroServerMeta = {
  attributes: {
    identifier?: string | null;
    uuid?: string | null;
    uuidShort?: string | null;
    uuid_short?: string | null;
    sftp_details?: { ip?: string | null; port?: number | null; username?: string | null };
    relationships?: {
      allocations?: { data?: PteroAllocation[] };
      node?: { attributes?: Record<string, unknown> | null };
    };
  };
};

type PteroApplicationServerMeta = {
  attributes?: {
    relationships?: {
      node?: {
        attributes?: {
          fqdn?: string | null;
          public_ip?: string | null;
          ip?: string | null;
        } | null;
      };
    };
  };
};

function isPrivateIPv4(host: string) {
  const match = host.trim().match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!match) return false;
  const [, aRaw, bRaw] = match;
  const a = Number(aRaw);
  const b = Number(bRaw);
  return (
    a === 10 ||
    a === 127 ||
    (a === 192 && b === 168) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 169 && b === 254) ||
    a === 0
  );
}

function publicHost(host: string | null | undefined) {
  const normalized = host?.trim();
  if (!normalized || normalized === "localhost" || isPrivateIPv4(normalized)) return null;
  return normalized;
}

function getNodeHostFromApplicationMeta(meta: PteroApplicationServerMeta | null) {
  const node = meta?.attributes?.relationships?.node?.attributes;
  return publicHost(node?.public_ip) ?? publicHost(node?.ip) ?? publicHost(node?.fqdn);
}

async function resolvePublicIPv4(host: string | null | undefined) {
  const publicNodeHost = publicHost(host);
  if (!publicNodeHost) return null;
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(publicNodeHost)) return publicNodeHost;

  try {
    const { lookup } = await import("node:dns/promises");
    const records = await lookup(publicNodeHost, { all: true, family: 4 });
    return records.map((record) => record.address).find((address) => publicHost(address)) ?? null;
  } catch (error) {
    console.warn("[Pterodactyl Server Info] node public IP lookup failed", {
      host: publicNodeHost,
      error: (error as Error).message,
    });
    return null;
  }
}

function getDefaultAllocation(allocations: PteroAllocation[]) {
  return (
    allocations.find((allocation) => allocation.attributes?.is_default) ?? allocations[0] ?? null
  );
}

function buildConnectionInfo(
  meta: {
    attributes: {
      identifier?: string | null;
      sftp_details?: { ip?: string | null; port?: number | null; username?: string | null };
      relationships?: { allocations?: { data?: PteroAllocation[] } };
    };
  },
  accountUsername?: string | null,
  nodePublicAddress?: string | null,
) {
  const allocation = getDefaultAllocation(meta.attributes.relationships?.allocations?.data ?? []);
  const sftpHost = publicHost(meta.attributes.sftp_details?.ip);
  const address =
    publicHost(allocation?.attributes?.ip_alias) ??
    publicHost(allocation?.attributes?.alias) ??
    publicHost(allocation?.attributes?.ip) ??
    publicHost(nodePublicAddress);
  const sftpUsername =
    meta.attributes.sftp_details?.username ??
    (accountUsername && meta.attributes.identifier
      ? `${accountUsername}.${meta.attributes.identifier}`
      : null);

  return {
    address,
    port: allocation?.attributes?.port ?? null,
    sftpHost,
    sftpPort: meta.attributes.sftp_details?.port ?? null,
    sftpUsername,
    identifier: meta.attributes.identifier ?? null,
    unavailableReason:
      address || sftpHost
        ? null
        : "Informations de connexion indisponibles ou adresse privée masquée.",
  };
}

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

function normalizePterodactylSocketUrl(socket: string, panelBaseUrl: string) {
  if (!socket?.trim()) throw new Error("Pterodactyl did not return a websocket URL.");

  let url: URL;
  try {
    url = new URL(socket, panelBaseUrl || undefined);
  } catch {
    throw new Error("Pterodactyl returned an invalid websocket URL.");
  }

  if (url.protocol === "http:") url.protocol = "ws:";
  if (url.protocol === "https:") url.protocol = "wss:";

  let upgradedToSecure = false;
  try {
    const panelUrl = new URL(panelBaseUrl);
    if (panelUrl.protocol === "https:" && url.protocol === "ws:") {
      url.protocol = "wss:";
      upgradedToSecure = true;
    }
  } catch {
    // Configuration validation happens in the Pterodactyl helper.
  }

  if (url.protocol !== "ws:" && url.protocol !== "wss:") {
    throw new Error(`Pterodactyl returned an unsupported websocket protocol: ${url.protocol}`);
  }

  return {
    socket: url.toString(),
    protocol: url.protocol,
    host: url.host,
    upgradedToSecure,
  };
}

function inspectPterodactylSocketUrl(socket: string) {
  const url = new URL(socket);
  if (url.protocol !== "ws:" && url.protocol !== "wss:") {
    throw new Error(`Pterodactyl returned an unsupported websocket protocol: ${url.protocol}`);
  }
  return {
    protocol: url.protocol,
    host: url.host,
  };
}

function parseWebsocketResponse(res: {
  data?: { token?: string; socket?: string };
  token?: string;
  socket?: string;
}) {
  const nestedToken = res.data?.token;
  const nestedSocket = res.data?.socket;
  const flatToken = res.token;
  const flatSocket = res.socket;
  const responseShape =
    nestedToken || nestedSocket
      ? "data.token/data.socket"
      : flatToken || flatSocket
        ? "token/socket"
        : "unknown";

  return {
    token: nestedToken ?? flatToken ?? "",
    socket: nestedSocket ?? flatSocket ?? "",
    responseShape,
  };
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
    const db = context.supabase as unknown as SupabaseAny;
    const { data, error } = await db
      .from("server_orders")
      .select(
        "id, order_id, server_name, status, pterodactyl_server_identifier, pterodactyl_server_id, error_message, created_at, plans(name, game, ram_mb, cpu_percent, disk_mb)",
      )
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    const servers = (data ?? []) as ServerListRow[];
    const orderIds = servers
      .map((server) => server.order_id)
      .filter((id): id is string => Boolean(id));

    const withBilling = (
      rows: ServerListRow[],
      ordersById = new Map<
        string,
        { status: string; current_period_end: string | null; renews_at: string | null }
      >(),
      latestPaymentByOrder = new Map<string, string>(),
    ): ServerListItem[] =>
      rows.map((server) => {
        const order = server.order_id ? ordersById.get(server.order_id) : null;
        return {
          ...server,
          billing_status: order?.status ?? null,
          last_payment_at: server.order_id
            ? (latestPaymentByOrder.get(server.order_id) ?? null)
            : null,
          next_renewal_at: order?.current_period_end ?? order?.renews_at ?? null,
        };
      });

    if (orderIds.length === 0) return { servers: withBilling(servers) };

    const [{ data: orders }, { data: payments }] = await Promise.all([
      db.from("orders").select("id, status, current_period_end, renews_at").in("id", orderIds),
      db
        .from("payments")
        .select("id, order_id, paid_at, created_at")
        .in("order_id", orderIds)
        .order("created_at", { ascending: false }),
    ]);
    const ordersById = new Map(
      (
        (orders ?? []) as Array<{
          id: string;
          status: string;
          current_period_end: string | null;
          renews_at: string | null;
        }>
      ).map((order) => [order.id, order]),
    );
    const latestPaymentByOrder = new Map<string, string>();
    for (const payment of (payments ?? []) as Array<{
      order_id: string | null;
      paid_at: string | null;
      created_at: string;
    }>) {
      if (payment.order_id && !latestPaymentByOrder.has(payment.order_id)) {
        latestPaymentByOrder.set(payment.order_id, payment.paid_at ?? payment.created_at);
      }
    }

    return { servers: withBilling(servers, ordersById, latestPaymentByOrder) };
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
        "id, server_name, status, pterodactyl_server_identifier, pterodactyl_server_id, error_message, created_at, plans(name, game, ram_mb, cpu_percent, disk_mb)",
      )
      .eq("id", data.orderId)
      .eq("user_id", context.userId)
      .single();
    if (error || !order) throw new Error("Server not found.");
    if (!order.pterodactyl_server_identifier) return { order, live: null };

    try {
      const { ptero, assertPteroClientConfigured, assertPteroAppConfigured } =
        await import("@/lib/pterodactyl.server");
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
      const [meta, account] = await Promise.all([
        ptero.client(
          `/servers/${order.pterodactyl_server_identifier}?include=allocations,node`,
        ) as Promise<PteroServerMeta>,
        ptero.client("/account") as Promise<{
          attributes?: { username?: string | null };
        }>,
      ]);
      let appMeta: PteroApplicationServerMeta | null = null;
      if (order.pterodactyl_server_id) {
        try {
          assertPteroAppConfigured();
          appMeta = (await ptero.app(
            `/servers/${order.pterodactyl_server_id}?include=node,allocations`,
          )) as PteroApplicationServerMeta;
        } catch (appError) {
          console.warn("[Pterodactyl Server Info] application node lookup failed", {
            identifier: order.pterodactyl_server_identifier,
            pterodactylServerId: order.pterodactyl_server_id,
            error: (appError as Error).message,
          });
        }
      }
      const nodePublicHost = getNodeHostFromApplicationMeta(appMeta);
      const nodePublicAddress = await resolvePublicIPv4(nodePublicHost);
      console.info("[Pterodactyl Server Info] raw server connection data", {
        identifier: meta.attributes.identifier ?? null,
        uuid: meta.attributes.uuid ?? null,
        uuidShort: meta.attributes.uuidShort ?? meta.attributes.uuid_short ?? null,
        allocations: (meta.attributes.relationships?.allocations?.data ?? []).map(
          (allocation) => allocation.attributes ?? null,
        ),
        sftp: meta.attributes.sftp_details ?? null,
        node: meta.attributes.relationships?.node?.attributes ?? null,
        applicationNode: appMeta?.attributes?.relationships?.node?.attributes ?? null,
        nodePublicHost,
        nodePublicAddress,
      });
      const connection = buildConnectionInfo(
        meta,
        account.attributes?.username ?? null,
        nodePublicAddress,
      );
      return {
        order,
        live: {
          state: res.attributes.current_state,
          memoryMb: Math.round(res.attributes.resources.memory_bytes / 1024 / 1024),
          cpu: Math.round(res.attributes.resources.cpu_absolute),
          diskMb: Math.round(res.attributes.resources.disk_bytes / 1024 / 1024),
          rxMb: Math.round(res.attributes.resources.network_rx_bytes / 1024 / 1024),
          txMb: Math.round(res.attributes.resources.network_tx_bytes / 1024 / 1024),
          sftp: connection.sftpHost
            ? { ip: connection.sftpHost, port: connection.sftpPort ?? 2022 }
            : null,
          connection,
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
    let identifier: string | null = null;
    try {
      identifier = await loadOwnedIdentifier(context.supabase, data.orderId, context.userId);
      const { ptero, assertPteroClientConfigured, getPanelBaseUrl } =
        await import("@/lib/pterodactyl.server");
      assertPteroClientConfigured();
      const meta = (await ptero.client(`/servers/${identifier}`)) as {
        attributes?: { identifier?: string; uuid?: string; name?: string };
      };
      const endpoint = `/api/client/servers/${identifier}/websocket`;
      const res = (await ptero.client(`/servers/${identifier}/websocket`)) as {
        data?: { token?: string; socket?: string };
        token?: string;
        socket?: string;
      };
      const wsResponse = parseWebsocketResponse(res);
      if (!wsResponse.token || !wsResponse.socket) {
        throw new Error("Pterodactyl websocket response is missing token or socket.");
      }

      const inspected = inspectPterodactylSocketUrl(wsResponse.socket);
      const normalized = normalizePterodactylSocketUrl(wsResponse.socket, getPanelBaseUrl());
      console.info("[Pterodactyl WS] websocket credentials issued", {
        orderId: data.orderId,
        identifier,
        panelServerIdentifier: meta.attributes?.identifier ?? null,
        panelServerUuid: meta.attributes?.uuid ?? null,
        endpoint,
        responseShape: wsResponse.responseShape,
        hasToken: Boolean(wsResponse.token),
        tokenLength: wsResponse.token.length,
        socketHost: inspected.host,
        socketProtocol: inspected.protocol,
        upgradedToSecure: normalized.upgradedToSecure,
      });

      return {
        ok: true as const,
        token: wsResponse.token,
        socket: wsResponse.socket,
        debug:
          process.env.NODE_ENV === "development"
            ? {
                endpoint,
                responseShape: wsResponse.responseShape,
                hasToken: Boolean(wsResponse.token),
                tokenLength: wsResponse.token.length,
                originalSocket: wsResponse.socket,
                normalizedSocket: normalized.socket,
                socketProtocol: inspected.protocol,
                socketHost: inspected.host,
              }
            : null,
      };
    } catch (e) {
      console.error("[Pterodactyl WS] websocket credential generation failed", {
        orderId: data.orderId,
        userId: context.userId,
        identifier,
        error: (e as Error).message,
      });
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

/** List server backups through the Pterodactyl Client API. */
export const listServerBackups = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => orderInput.parse(d))
  .handler(async ({ data, context }) => {
    const identifier = await loadOwnedIdentifier(context.supabase, data.orderId, context.userId);
    const { ptero, assertPteroClientConfigured } = await import("@/lib/pterodactyl.server");
    assertPteroClientConfigured();
    const res = (await ptero.client(`/servers/${identifier}/backups`)) as {
      data?: Array<{
        attributes: {
          uuid: string;
          name: string;
          bytes: number;
          is_successful: boolean;
          is_locked: boolean;
          created_at: string;
          completed_at: string | null;
        };
      }>;
    };
    return {
      backups: (res.data ?? []).map((backup) => {
        const attrs = backup.attributes;
        return {
          uuid: attrs.uuid,
          name: attrs.name,
          bytes: attrs.bytes,
          isSuccessful: attrs.is_successful,
          isLocked: attrs.is_locked,
          createdAt: attrs.created_at,
          completedAt: attrs.completed_at,
          state: attrs.completed_at ? (attrs.is_successful ? "completed" : "failed") : "processing",
        };
      }),
    };
  });

/** Create a server backup through the Pterodactyl Client API. */
export const createServerBackup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => orderInput.parse(d))
  .handler(async ({ data, context }) => {
    const identifier = await loadOwnedIdentifier(context.supabase, data.orderId, context.userId);
    const { ptero, assertPteroClientConfigured } = await import("@/lib/pterodactyl.server");
    assertPteroClientConfigured();
    const name = `XNT Backup ${new Date().toISOString().slice(0, 16).replace("T", " ")}`;
    const res = (await ptero.client(`/servers/${identifier}/backups`, {
      method: "POST",
      body: JSON.stringify({ name }),
    })) as { attributes?: { uuid?: string } };
    return { ok: true, backupId: res.attributes?.uuid ?? null };
  });

/** Delete a server backup through the Pterodactyl Client API. */
export const deleteServerBackup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => backupInput.parse(d))
  .handler(async ({ data, context }) => {
    const identifier = await loadOwnedIdentifier(context.supabase, data.orderId, context.userId);
    const { ptero, assertPteroClientConfigured } = await import("@/lib/pterodactyl.server");
    assertPteroClientConfigured();
    await ptero.client(`/servers/${identifier}/backups/${data.backupId}`, {
      method: "DELETE",
      contentType: null,
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
