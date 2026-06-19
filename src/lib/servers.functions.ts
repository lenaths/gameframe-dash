import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isMinecraftGame, normalizeGameKey } from "@/lib/game-config";

const deployInput = z.object({
  planId: z.string().uuid(),
  serverName: z.string().min(2).max(40),
  variantIndex: z.number().int().min(0).default(0),
  environment: z.record(z.string(), z.string()).default({}),
  maxPlayers: z.number().int().min(1).max(200).optional(),
});

const powerInput = z.object({
  orderId: z.string().uuid(),
  signal: z.enum(["start", "stop", "restart", "kill"]),
});

const orderInput = z.object({ orderId: z.string().uuid() });
const backupInput = z.object({ orderId: z.string().uuid(), backupId: z.string().uuid() });
const allocationInput = z.object({
  orderId: z.string().uuid(),
  allocationId: z.number().int().positive(),
});
const renameServerInput = z.object({
  orderId: z.string().uuid(),
  name: z.string().min(2).max(40),
});
const applyServerSettingsInput = z.object({
  orderId: z.string().uuid(),
  settings: z.record(z.string(), z.unknown()),
});

type ServerSettingValue = string | number | boolean | null;

const FORBIDDEN_SETTING_KEYS = new Set([
  "max_players",
  "slot_count",
  "slots",
  "max-players",
  "memory",
  "ram",
  "cpu",
  "disk",
  "port",
  "ports",
  "allocation",
  "allocations",
  "startup",
  "egg",
  "egg_id",
  "nest",
  "nest_id",
  "docker",
  "docker_image",
  "node",
  "node_id",
]);

const MINECRAFT_SERVER_PROPERTIES_KEYS = {
  motd: "motd",
  difficulty: "difficulty",
  gamemode: "gamemode",
  hardcore: "hardcore",
  pvp: "pvp",
  whitelist: "white-list",
  onlineMode: "online-mode",
  allowFlight: "allow-flight",
  spawnProtection: "spawn-protection",
  viewDistance: "view-distance",
  simulationDistance: "simulation-distance",
  seed: "level-seed",
} as const;

const MINECRAFT_RESTART_RECOMMENDED_KEYS = new Set([
  "difficulty",
  "gamemode",
  "hardcore",
  "onlineMode",
  "whitelist",
]);

const MINECRAFT_NEVER_SYNC_KEYS = new Set([
  "max_players",
  "slot_count",
  "slots",
  "max-players",
  "server-port",
  "query.port",
  "rcon.port",
  "rcon.password",
  "enable-rcon",
  "network-compression-threshold",
  "server-ip",
]);

const SERVER_SETTING_DEFINITIONS = {
  minecraft: {
    serverName: { type: "string", max: 40 },
    motd: { type: "string", max: 120 },
    difficulty: { type: "enum", values: ["peaceful", "easy", "normal", "hard"] },
    gamemode: { type: "enum", values: ["survival", "creative", "adventure", "spectator"] },
    hardcore: { type: "boolean" },
    pvp: { type: "boolean" },
    whitelist: { type: "boolean" },
    onlineMode: { type: "boolean" },
    allowFlight: { type: "boolean" },
    spawnProtection: { type: "integer", min: 0, max: 64 },
    viewDistance: { type: "integer", min: 2, max: 32 },
    simulationDistance: { type: "integer", min: 2, max: 32 },
    seed: { type: "string", max: 64 },
  },
  conan: {
    serverName: { type: "string", max: 40 },
    motd: { type: "string", max: 120 },
    password: { type: "string", max: 80 },
  },
  ark: {
    serverName: { type: "string", max: 40 },
    motd: { type: "string", max: 120 },
    password: { type: "string", max: 80 },
    xpRate: { type: "number", min: 0.1, max: 10 },
    harvestRate: { type: "number", min: 0.1, max: 10 },
    tamingRate: { type: "number", min: 0.1, max: 10 },
  },
  gmod: {
    hostname: { type: "string", max: 40 },
    gamemode: { type: "string", max: 40 },
    collectionId: { type: "string", max: 32 },
  },
} as const;

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

type AdminTableQuery = {
  select: (columns: string) => AdminTableQuery;
  eq: (column: string, value: unknown) => AdminTableQuery;
  maybeSingle: () => Promise<SupabaseResult<unknown>>;
  update: (values: Record<string, unknown>) => {
    eq: (column: string, value: unknown) => Promise<SupabaseResult>;
  };
};

type AdminDb = {
  from: (table: string) => AdminTableQuery;
};

type ServerListRow = {
  id: string;
  order_id: string | null;
  server_name: string;
  status: string;
  pterodactyl_server_identifier: string | null;
  pterodactyl_server_id: number | null;
  error_message: string | null;
  selected_template_label?: string | null;
  selected_modpack_label?: string | null;
  minecraft_settings?: MinecraftSettings | null;
  created_at: string;
  plans?: {
    name?: string | null;
    game?: string | null;
    ram_mb?: number | null;
    cpu_percent?: number | null;
    disk_mb?: number | null;
  } | null;
};

type MinecraftSettings = {
  server_type: string | null;
  minecraft_version: string | null;
  version_apply_status: string | null;
  version_variable?: string | null;
  max_players: number | null;
  max_players_applied: boolean;
};

type ServerSettingsChangeLogEntry = {
  at: string;
  user_id: string;
  key: string;
  old_value: ServerSettingValue;
  new_value: ServerSettingValue;
};

type ServerListItem = ServerListRow & {
  billing_status: string | null;
  last_payment_at: string | null;
  next_renewal_at: string | null;
  modpack_install_job?: ModpackInstallJob | null;
};

type ModpackInstallJob = {
  id: string;
  server_order_id?: string | null;
  status: string;
  error_message: string | null;
  created_at: string;
  updated_at: string;
  curseforge_modpacks?: { name?: string | null; logo_url?: string | null } | null;
  curseforge_modpack_versions?: {
    display_name?: string | null;
    minecraft_versions?: string[] | null;
    loaders?: string[] | null;
  } | null;
};

type ServerOrderInsertRow = {
  id: string;
};

type ServerDetailOrderRow = {
  id: string;
  user_id?: string;
  order_id?: string | null;
  server_name: string;
  status: string;
  pterodactyl_server_identifier: string | null;
  pterodactyl_server_id: number | null;
  error_message: string | null;
  metadata?: unknown;
  created_at: string;
  plans?: {
    name?: string | null;
    game?: string | null;
    ram_mb?: number | null;
    cpu_percent?: number | null;
    disk_mb?: number | null;
  } | null;
};

type AccessibleServerOrder = ServerDetailOrderRow & {
  user_id: string;
  order_id: string | null;
};

type ServerOwnerProfile = {
  id: string;
  email?: string | null;
  display_name?: string | null;
};

function selectedTemplateLabel(metadata: unknown) {
  const root =
    metadata && typeof metadata === "object" ? (metadata as Record<string, unknown>) : {};
  const selectedTemplate =
    root.selected_template && typeof root.selected_template === "object"
      ? (root.selected_template as Record<string, unknown>)
      : null;
  return typeof selectedTemplate?.label === "string" && selectedTemplate.label.trim()
    ? selectedTemplate.label
    : null;
}

function selectedModpackLabel(metadata: unknown) {
  const root =
    metadata && typeof metadata === "object" ? (metadata as Record<string, unknown>) : {};
  const selectedModpack =
    root.selected_modpack && typeof root.selected_modpack === "object"
      ? (root.selected_modpack as Record<string, unknown>)
      : null;
  return typeof selectedModpack?.name === "string" && selectedModpack.name.trim()
    ? selectedModpack.name
    : null;
}

function selectedMinecraftSettings(metadata: unknown): MinecraftSettings | null {
  const root =
    metadata && typeof metadata === "object" ? (metadata as Record<string, unknown>) : {};
  const settings =
    root.minecraft_settings && typeof root.minecraft_settings === "object"
      ? (root.minecraft_settings as Record<string, unknown>)
      : root;
  const rawMax = settings.max_players ?? root.max_players;
  const maxPlayers =
    typeof rawMax === "number"
      ? rawMax
      : typeof rawMax === "string" && rawMax.trim()
        ? Number(rawMax)
        : null;
  return {
    server_type:
      typeof settings.server_type === "string"
        ? settings.server_type
        : selectedTemplateLabel(metadata),
    minecraft_version:
      typeof settings.minecraft_version === "string" ? settings.minecraft_version : null,
    version_apply_status:
      typeof settings.version_apply_status === "string" ? settings.version_apply_status : null,
    version_variable:
      typeof settings.version_variable === "string" ? settings.version_variable : null,
    max_players: Number.isFinite(maxPlayers) ? Math.round(Number(maxPlayers)) : null,
    max_players_applied: settings.max_players_applied === true,
  };
}

function selectedServerSettings(metadata: unknown): Record<string, ServerSettingValue> {
  const root =
    metadata && typeof metadata === "object" ? (metadata as Record<string, unknown>) : {};
  if (!root.server_settings || typeof root.server_settings !== "object") return {};
  const settings: Record<string, ServerSettingValue> = {};
  for (const [key, value] of Object.entries(root.server_settings as Record<string, unknown>)) {
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      settings[key] = value;
    } else if (value == null) {
      settings[key] = null;
    }
  }
  return settings;
}

function selectedSettingsChangeLog(metadata: unknown): ServerSettingsChangeLogEntry[] {
  const root =
    metadata && typeof metadata === "object" ? (metadata as Record<string, unknown>) : {};
  return Array.isArray(root.settings_change_log)
    ? (root.settings_change_log as ServerSettingsChangeLogEntry[]).slice(-20)
    : [];
}

function selectedSettingsSync(metadata: unknown) {
  const root =
    metadata && typeof metadata === "object" ? (metadata as Record<string, unknown>) : {};
  const sync = root.server_settings_sync;
  if (!sync || typeof sync !== "object") {
    return {
      last_sync_at: null as string | null,
      last_sync_status: null as string | null,
      last_sync_error: null as string | null,
      restart_recommended: false,
      changed_keys: [] as string[],
    };
  }
  const value = sync as Record<string, unknown>;
  return {
    last_sync_at: typeof value.last_sync_at === "string" ? value.last_sync_at : null,
    last_sync_status: typeof value.last_sync_status === "string" ? value.last_sync_status : null,
    last_sync_error: typeof value.last_sync_error === "string" ? value.last_sync_error : null,
    restart_recommended: value.restart_recommended === true,
    changed_keys: Array.isArray(value.changed_keys)
      ? value.changed_keys.filter((key): key is string => typeof key === "string")
      : [],
  };
}

function selectedSettingsSyncHistory(metadata: unknown) {
  const root =
    metadata && typeof metadata === "object" ? (metadata as Record<string, unknown>) : {};
  return Array.isArray(root.server_settings_sync_history)
    ? (root.server_settings_sync_history as Array<Record<string, unknown>>).slice(-20)
    : [];
}

function getPurchasedPlayerSlots(metadata: unknown): number | null {
  const root =
    metadata && typeof metadata === "object" ? (metadata as Record<string, unknown>) : {};
  const minecraftSettings =
    root.minecraft_settings && typeof root.minecraft_settings === "object"
      ? (root.minecraft_settings as Record<string, unknown>)
      : {};
  const playerPricing =
    root.player_pricing && typeof root.player_pricing === "object"
      ? (root.player_pricing as Record<string, unknown>)
      : {};
  const candidates = [
    root.max_players,
    minecraftSettings.max_players,
    playerPricing.selected_players,
    playerPricing.players,
  ];
  for (const candidate of candidates) {
    const value =
      typeof candidate === "number"
        ? candidate
        : typeof candidate === "string" && candidate.trim()
          ? Number(candidate)
          : null;
    if (Number.isFinite(value) && Number(value) > 0) return Math.round(Number(value));
  }
  return null;
}

function hasForbiddenServerSetting(input: Record<string, unknown>) {
  return Object.keys(input).find((key) => FORBIDDEN_SETTING_KEYS.has(key.trim().toLowerCase()));
}

function sanitizeServerSettings(
  game: string | null | undefined,
  input: Record<string, unknown>,
): Record<string, ServerSettingValue> {
  const gameKey = normalizeGameKey(game);
  const definitions =
    SERVER_SETTING_DEFINITIONS[gameKey as keyof typeof SERVER_SETTING_DEFINITIONS] ?? null;
  if (!definitions) return {};

  const sanitized: Record<string, ServerSettingValue> = {};
  for (const [rawKey, rawValue] of Object.entries(input)) {
    const key = rawKey.trim();
    if (!key || FORBIDDEN_SETTING_KEYS.has(key.toLowerCase())) continue;
    const definition = definitions[key as keyof typeof definitions] as
      | { type: "string"; max: number }
      | { type: "enum"; values: readonly string[] }
      | { type: "boolean" }
      | { type: "integer"; min: number; max: number }
      | { type: "number"; min: number; max: number }
      | undefined;
    if (!definition) continue;

    if (definition.type === "string") {
      const value = String(rawValue ?? "")
        .trim()
        .slice(0, definition.max);
      sanitized[key] = value;
    } else if (definition.type === "enum") {
      const value = String(rawValue ?? "")
        .trim()
        .toLowerCase();
      if (definition.values.includes(value)) sanitized[key] = value;
    } else if (definition.type === "boolean") {
      sanitized[key] = rawValue === true || rawValue === "true" || rawValue === "on";
    } else if (definition.type === "integer") {
      const value = Math.round(Number(rawValue));
      if (Number.isFinite(value)) {
        sanitized[key] = Math.min(definition.max, Math.max(definition.min, value));
      }
    } else if (definition.type === "number") {
      const value = Number(rawValue);
      if (Number.isFinite(value)) {
        sanitized[key] = Math.min(definition.max, Math.max(definition.min, value));
      }
    }
  }
  return sanitized;
}

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
const MANAGED_FILE_MESSAGE =
  "Ce fichier est géré par XNTServers. Modifie ces paramètres depuis l’onglet Paramètres serveur.";
const PROTECTED_FILE_BASENAMES = new Set([
  "server.properties",
  "config.yml",
  "paper.yml",
  "paper-global.yml",
  "paper-world-defaults.yml",
  "spigot.yml",
  "bukkit.yml",
  "commands.yml",
  "permissions.yml",
  "velocity.toml",
  "waterfall.yml",
  "fabric-server-launcher.properties",
  "forge-server.toml",
  "eula.txt",
  "xnt-install-modpack",
  ".env",
  ".env.local",
  ".env.production",
  "docker-compose.yml",
  "docker-compose.yaml",
]);
const PROTECTED_PATH_PREFIXES = [
  "/bungeecord/config.yml",
  "/.xnt",
  "/.xnt-modpack-install",
  "/.ptero",
  "/.config/xnt",
  "/scripts/xnt",
  "/xnt",
];

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

function isProtectedServerPath(path: string) {
  const normalized = normalizeServerPath(path).toLowerCase();
  const name = normalized.split("/").pop() ?? "";
  if (PROTECTED_FILE_BASENAMES.has(name)) return true;
  if (/(secret|token|private[_-]?key|api[_-]?key|credentials?)/i.test(name)) return true;
  return PROTECTED_PATH_PREFIXES.some(
    (prefix) => normalized === prefix || normalized.startsWith(`${prefix}/`),
  );
}

function assertNotProtectedServerPath(path: string) {
  const normalized = normalizeServerPath(path);
  if (isProtectedServerPath(normalized)) throw new Error(MANAGED_FILE_MESSAGE);
  return normalized;
}

function dirname(path: string) {
  const normalized = normalizeServerPath(path);
  const index = normalized.lastIndexOf("/");
  return index <= 0 ? "/" : normalized.slice(0, index);
}

function assertEditableFilePath(path: string) {
  const normalized = normalizeServerPath(path);
  assertNotProtectedServerPath(normalized);
  if (hasBlockedExtension(normalized)) {
    throw new Error("Ce fichier ne peut pas être ouvert dans l’éditeur.");
  }
  return normalized;
}

function publicServerServiceError(
  error: unknown,
  fallback = "Service serveur temporairement indisponible.",
) {
  const message = error instanceof Error ? error.message : String(error);
  if (
    /pterodactyl|wings|panel|api key|application api|client api|egg|nest|node|allocation|identifier|uuid/i.test(
      message,
    )
  ) {
    return fallback;
  }
  return message;
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

async function isAdminUser(userId: string): Promise<boolean> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("user_id")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) {
    console.warn("[ManageAccess] admin role lookup failed", {
      userId,
      error: error.message,
    });
  }
  return Boolean(data);
}

async function loadAccessibleServerOrder(
  orderId: string,
  userId: string,
  reason = "manage",
): Promise<{
  order: AccessibleServerOrder;
  ownerProfile: ServerOwnerProfile | null;
  isAdmin: boolean;
  isAdminAccess: boolean;
}> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const adminDb = supabaseAdmin as unknown as AdminDb;
  const isAdmin = await isAdminUser(userId);
  const { data: order, error } = await adminDb
    .from("server_orders")
    .select(
      "id, user_id, order_id, server_name, status, pterodactyl_server_identifier, pterodactyl_server_id, error_message, metadata, created_at, plans(name, game, ram_mb, cpu_percent, disk_mb)",
    )
    .eq("id", orderId)
    .maybeSingle();

  if (error) {
    console.warn("[ManageAccess] server order lookup failed", {
      userId,
      isAdmin,
      orderId,
      ownerId: null,
      granted: false,
      reason,
      error: error.message,
    });
    throw new Error("Impossible de charger ce serveur.");
  }

  if (!order) {
    console.info("[ManageAccess] server order not found", {
      userId,
      isAdmin,
      orderId,
      ownerId: null,
      granted: false,
      reason,
    });
    throw new Error("Serveur introuvable.");
  }

  const typedOrder = order as unknown as AccessibleServerOrder;
  const isOwner = typedOrder.user_id === userId;
  if (!isOwner && !isAdmin) {
    console.info("[ManageAccess] access denied", {
      userId,
      isAdmin,
      orderId,
      ownerId: typedOrder.user_id,
      granted: false,
      reason,
    });
    throw new Error("Accès refusé à ce serveur.");
  }

  const { data: ownerProfile } = await adminDb
    .from("profiles")
    .select("id, email, display_name")
    .eq("id", typedOrder.user_id)
    .maybeSingle();

  console.info("[ManageAccess] access granted", {
    userId,
    isAdmin,
    orderId,
    ownerId: typedOrder.user_id,
    granted: true,
    reason,
  });

  return {
    order: typedOrder,
    ownerProfile: (ownerProfile as ServerOwnerProfile | null) ?? null,
    isAdmin,
    isAdminAccess: isAdmin && !isOwner,
  };
}

async function loadOwnedOrder(
  supabase: import("@supabase/supabase-js").SupabaseClient,
  orderId: string,
  userId: string,
): Promise<{
  pterodactyl_server_identifier: string | null;
  pterodactyl_server_id: number | null;
}> {
  void supabase;
  return (await loadAccessibleServerOrder(orderId, userId, "manage action")).order;
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

function parseServerProperties(contents: string) {
  const values = new Map<string, string>();
  const lines = contents.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = line.indexOf("=");
    if (index <= 0) continue;
    const key = line.slice(0, index).trim();
    const value = line.slice(index + 1);
    values.set(key, value);
  }
  return { lines, values };
}

function serializeServerProperties(
  contents: string,
  updates: Record<string, string>,
): { contents: string; before: Record<string, string | null>; after: Record<string, string> } {
  const parsed = parseServerProperties(contents);
  const before: Record<string, string | null> = {};
  const after: Record<string, string> = {};
  const remaining = new Map(Object.entries(updates));
  const nextLines = parsed.lines.map((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return line;
    const index = line.indexOf("=");
    if (index <= 0) return line;
    const key = line.slice(0, index).trim();
    if (!remaining.has(key)) return line;
    const value = remaining.get(key) ?? "";
    before[key] = parsed.values.get(key) ?? null;
    after[key] = value;
    remaining.delete(key);
    return `${key}=${value}`;
  });

  for (const [key, value] of remaining) {
    before[key] = parsed.values.get(key) ?? null;
    after[key] = value;
    nextLines.push(`${key}=${value}`);
  }

  return { contents: nextLines.join("\n"), before, after };
}

function minecraftSettingToPropertyValue(key: string, value: ServerSettingValue): string | null {
  if (value == null) return null;
  if (MINECRAFT_NEVER_SYNC_KEYS.has(key)) return null;
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return String(Math.round(value));
  return value.trim();
}

function buildMinecraftPropertiesUpdates(settings: Record<string, ServerSettingValue>) {
  const updates: Record<string, string> = {};
  for (const [settingKey, propertyKey] of Object.entries(MINECRAFT_SERVER_PROPERTIES_KEYS)) {
    if (!(settingKey in settings)) continue;
    const value = minecraftSettingToPropertyValue(settingKey, settings[settingKey]);
    if (value == null) continue;
    updates[propertyKey] = value;
  }
  return updates;
}

async function updateServerOrderMetadata(
  serverOrderId: string,
  metadata: Record<string, unknown>,
): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const adminDb = supabaseAdmin as unknown as AdminDb;
  const result = await adminDb.from("server_orders").update({ metadata }).eq("id", serverOrderId);
  if (result.error) throw new Error(result.error.message);
}

async function syncMinecraftServerPropertiesInternal(
  order: AccessibleServerOrder,
  syncedBy: string,
): Promise<{
  ok: true;
  changedKeys: string[];
  restartRecommended: boolean;
  before: Record<string, string | null>;
  after: Record<string, string>;
}> {
  if (!isMinecraftGame(order.plans?.game)) {
    throw new Error("La synchronisation Minecraft est disponible uniquement pour Minecraft.");
  }
  if (!order.pterodactyl_server_identifier) {
    throw new Error("Serveur indisponible pour la synchronisation.");
  }

  const metadata =
    order.metadata && typeof order.metadata === "object"
      ? (order.metadata as Record<string, unknown>)
      : {};
  const slots = getPurchasedPlayerSlots(metadata);
  const settings = selectedServerSettings(metadata);
  const updates = buildMinecraftPropertiesUpdates(settings);
  const changedSettingKeys = Object.keys(updates)
    .map(
      (propertyKey) =>
        Object.entries(MINECRAFT_SERVER_PROPERTIES_KEYS).find(
          ([, value]) => value === propertyKey,
        )?.[0],
    )
    .filter((key): key is string => Boolean(key));
  const restartRecommended = changedSettingKeys.some((key) =>
    MINECRAFT_RESTART_RECOMMENDED_KEYS.has(key),
  );

  if (Object.keys(updates).length === 0) {
    throw new Error("Aucun paramètre Minecraft synchronisable.");
  }

  const { ptero, assertPteroClientConfigured } = await import("@/lib/pterodactyl.server");
  assertPteroClientConfigured();
  const file = "/server.properties";
  const current = (await ptero.client(
    `/servers/${order.pterodactyl_server_identifier}/files/contents?file=${encodeURIComponent(
      file,
    )}`,
    { raw: true },
  )) as string;
  const serialized = serializeServerProperties(current, updates);

  await ptero.client(
    `/servers/${order.pterodactyl_server_identifier}/files/write?file=${encodeURIComponent(file)}`,
    {
      method: "POST",
      body: serialized.contents,
      contentType: "text/plain",
    },
  );

  const syncedAt = new Date().toISOString();
  const nextMetadata = {
    ...metadata,
    server_settings_sync: {
      last_sync_at: syncedAt,
      last_sync_status: "success",
      last_sync_error: null,
      restart_recommended: restartRecommended,
      changed_keys: changedSettingKeys,
      purchased_slots: slots,
    },
    server_settings_sync_history: [
      ...selectedSettingsSyncHistory(metadata),
      {
        before: serialized.before,
        after: serialized.after,
        synced_by: syncedBy,
        synced_at: syncedAt,
        restart_recommended: restartRecommended,
      },
    ].slice(-20),
  };
  await updateServerOrderMetadata(order.id, nextMetadata);

  console.info("[MinecraftSettingsSync] success", {
    serverOrderId: order.id,
    serverId: order.pterodactyl_server_id,
    keysChanged: changedSettingKeys,
    restartRecommended,
  });

  return {
    ok: true,
    changedKeys: changedSettingKeys,
    restartRecommended,
    before: serialized.before,
    after: serialized.after,
  };
}

async function syncMinecraftSettingsInternal(orderId: string, userId: string) {
  const { order } = await loadAccessibleServerOrder(orderId, userId, "syncMinecraftSettings");
  try {
    return await syncMinecraftServerPropertiesInternal(order, userId);
  } catch (error) {
    const metadata =
      order.metadata && typeof order.metadata === "object"
        ? (order.metadata as Record<string, unknown>)
        : {};
    const syncedAt = new Date().toISOString();
    const message =
      error instanceof Error ? error.message : "Synchronisation Minecraft impossible.";
    await updateServerOrderMetadata(order.id, {
      ...metadata,
      server_settings_sync: {
        last_sync_at: syncedAt,
        last_sync_status: "failed",
        last_sync_error: message,
        restart_recommended: false,
        changed_keys: [],
        purchased_slots: getPurchasedPlayerSlots(metadata),
      },
      server_settings_sync_history: [
        ...selectedSettingsSyncHistory(metadata),
        {
          before: {},
          after: {},
          synced_by: userId,
          synced_at: syncedAt,
          error: message,
        },
      ].slice(-20),
    });
    console.warn("[MinecraftSettingsSync] failed", {
      serverOrderId: order.id,
      serverId: order.pterodactyl_server_id,
      error: message,
    });
    throw new Error(message);
  }
}

export const listMyServers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = context.supabase as unknown as SupabaseAny;
    const { data, error } = await db
      .from("server_orders")
      .select(
        "id, order_id, server_name, status, pterodactyl_server_identifier, pterodactyl_server_id, error_message, metadata, created_at, plans(name, game, ram_mb, cpu_percent, disk_mb)",
      )
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    const servers = ((data ?? []) as Array<ServerListRow & { metadata?: unknown }>).map(
      ({ metadata, ...server }) => ({
        ...server,
        selected_template_label: selectedTemplateLabel(metadata),
        selected_modpack_label: selectedModpackLabel(metadata),
        minecraft_settings: isMinecraftGame(server.plans?.game)
          ? selectedMinecraftSettings(metadata)
          : null,
      }),
    );
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
      latestJobByServer = new Map<string, ModpackInstallJob>(),
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
          modpack_install_job: latestJobByServer.get(server.id) ?? null,
        };
      });

    if (orderIds.length === 0) return { servers: withBilling(servers) };

    const [{ data: orders }, { data: payments }, { data: jobs }] = await Promise.all([
      db.from("orders").select("id, status, current_period_end, renews_at").in("id", orderIds),
      db
        .from("payments")
        .select("id, order_id, paid_at, created_at")
        .in("order_id", orderIds)
        .order("created_at", { ascending: false }),
      db
        .from("modpack_install_jobs")
        .select(
          "id, server_order_id, status, error_message, created_at, updated_at, curseforge_modpacks(name, logo_url), curseforge_modpack_versions(display_name, minecraft_versions, loaders)",
        )
        .in(
          "server_order_id",
          servers.map((server) => server.id),
        )
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
    const latestJobByServer = new Map<string, ModpackInstallJob>();
    for (const job of (jobs ?? []) as Array<
      ModpackInstallJob & { server_order_id?: string | null }
    >) {
      if (job.server_order_id && !latestJobByServer.has(job.server_order_id)) {
        latestJobByServer.set(job.server_order_id, job);
      }
    }

    return { servers: withBilling(servers, ordersById, latestPaymentByOrder, latestJobByServer) };
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

    const serverOrdersDb = supabase as unknown as {
      from: (table: string) => {
        insert: (values: Record<string, unknown>) => {
          select: (columns: string) => {
            single: () => Promise<SupabaseResult<ServerOrderInsertRow>>;
          };
        };
        update: (values: Record<string, unknown>) => {
          eq: (
            column: string,
            value: unknown,
          ) => {
            eq: (column: string, value: unknown) => Promise<SupabaseResult<ServerOrderInsertRow>>;
          };
        };
      };
    };
    const { data: order, error: orderErr } = await serverOrdersDb
      .from("server_orders")
      .insert({
        user_id: userId,
        plan_id: plan.id,
        server_name: data.serverName,
        status: "provisioning",
        metadata: {
          max_players: data.maxPlayers ?? 10,
          minecraft_settings: {
            max_players: data.maxPlayers ?? 10,
            max_players_applied: false,
          },
        },
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
      maxPlayers: data.maxPlayers ?? 10,
      fallbackEmail: (claims?.email as string | undefined) ?? null,
    });
    await serverOrdersDb
      .from("server_orders")
      .update({
        metadata: {
          max_players: data.maxPlayers ?? 10,
          minecraft_settings: {
            max_players: data.maxPlayers ?? 10,
            max_players_applied:
              "minecraftSettings" in result
                ? Boolean(result.minecraftSettings?.maxPlayersApplied)
                : false,
            max_players_variable:
              "minecraftSettings" in result ? result.minecraftSettings?.maxPlayersVariable : null,
          },
        },
      })
      .eq("id", order.id)
      .eq("user_id", userId);

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
    const access = await loadAccessibleServerOrder(data.orderId, context.userId, "getServerDetail");
    const order = access.order;
    const { loadLatestModpackInstallJob } = await import("@/lib/modpack-install.functions");
    const modpackInstallJob = await loadLatestModpackInstallJob(order.id);
    const { metadata, ...serializableOrder } = order;
    const accessInfo = {
      isAdminAccess: access.isAdminAccess,
      ownerUserId: order.user_id,
      ownerEmail: access.ownerProfile?.email ?? null,
      ownerName: access.ownerProfile?.display_name ?? null,
      orderId: order.order_id,
      serverOrderId: order.id,
    };
    const orderWithMinecraft = {
      ...serializableOrder,
      minecraft_settings: isMinecraftGame(order.plans?.game)
        ? selectedMinecraftSettings(metadata)
        : null,
      server_settings: selectedServerSettings(metadata),
      settings_change_log: selectedSettingsChangeLog(metadata),
      settings_sync: selectedSettingsSync(metadata),
    };
    if (!order.pterodactyl_server_identifier) {
      return { order: orderWithMinecraft, live: null, modpackInstallJob, access: accessInfo };
    }

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
        order: orderWithMinecraft,
        modpackInstallJob,
        access: accessInfo,
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
        order: orderWithMinecraft,
        modpackInstallJob,
        access: accessInfo,
        live: null,
        warning: publicServerServiceError(err, "Données serveur en direct indisponibles."),
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
        throw new Error("Console temps réel temporairement indisponible.");
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
      return {
        ok: false as const,
        error: publicServerServiceError(e, "Console temps réel temporairement indisponible."),
      };
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
        files: res.data.map((d) => ({
          ...d.attributes,
          is_managed: isProtectedServerPath(`${directory}/${d.attributes.name}`),
        })),
        error: null as string | null,
      };
    } catch (err) {
      const msg = publicServerServiceError(err);
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
      assertNotProtectedServerPath(`${root}/${file}`);
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
    assertNotProtectedServerPath(root);
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
    assertNotProtectedServerPath(`${root}/${data.name}`);
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

/** List server network allocations through the Pterodactyl Client API. */
export const listServerNetworkAllocations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => orderInput.parse(d))
  .handler(async ({ data, context }) => {
    const order = await loadOwnedOrder(context.supabase, data.orderId, context.userId);
    if (!order.pterodactyl_server_identifier) {
      throw new Error("Server not found or access denied.");
    }
    const identifier = order.pterodactyl_server_identifier;
    const { ptero, assertPteroClientConfigured } = await import("@/lib/pterodactyl.server");
    assertPteroClientConfigured();

    let nodePublicAddress: string | null = null;
    if (order.pterodactyl_server_id) {
      try {
        const { assertPteroAppConfigured } = await import("@/lib/pterodactyl.server");
        assertPteroAppConfigured();
        const appMeta = (await ptero.app(
          `/servers/${order.pterodactyl_server_id}?include=node`,
        )) as PteroApplicationServerMeta;
        nodePublicAddress = await resolvePublicIPv4(getNodeHostFromApplicationMeta(appMeta));
      } catch (error) {
        console.warn("[Pterodactyl Network] node public IP lookup failed", {
          identifier,
          error: (error as Error).message,
        });
      }
    }

    const res = (await ptero.client(`/servers/${identifier}/network/allocations`)) as {
      data?: Array<{
        attributes: {
          id: number;
          ip: string | null;
          ip_alias?: string | null;
          alias?: string | null;
          port: number;
          notes?: string | null;
          is_default: boolean;
        };
      }>;
    };

    return {
      allocations: (res.data ?? []).map((allocation) => {
        const attrs = allocation.attributes;
        const alias = attrs.ip_alias ?? attrs.alias ?? null;
        const publicAddress =
          publicHost(alias) ?? publicHost(attrs.ip) ?? publicHost(nodePublicAddress);
        return {
          id: attrs.id,
          address: publicAddress,
          port: attrs.port,
          alias,
          notes: attrs.notes ?? null,
          isDefault: attrs.is_default,
          isPrivateSource: Boolean(attrs.ip && !publicHost(attrs.ip)),
        };
      }),
    };
  });

/** Set a network allocation as primary through the Pterodactyl Client API. */
export const setPrimaryServerAllocation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => allocationInput.parse(d))
  .handler(async ({ data, context }) => {
    const identifier = await loadOwnedIdentifier(context.supabase, data.orderId, context.userId);
    const { ptero, assertPteroClientConfigured } = await import("@/lib/pterodactyl.server");
    assertPteroClientConfigured();
    await ptero.client(`/servers/${identifier}/network/allocations/${data.allocationId}/primary`, {
      method: "POST",
    });
    return { ok: true };
  });

/** Delete a network allocation through the Pterodactyl Client API. */
export const deleteServerAllocation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => allocationInput.parse(d))
  .handler(async ({ data, context }) => {
    const identifier = await loadOwnedIdentifier(context.supabase, data.orderId, context.userId);
    const { ptero, assertPteroClientConfigured } = await import("@/lib/pterodactyl.server");
    assertPteroClientConfigured();
    await ptero.client(`/servers/${identifier}/network/allocations/${data.allocationId}`, {
      method: "DELETE",
      contentType: null,
    });
    return { ok: true };
  });

/** Rename a server through the Pterodactyl Client API when the panel permits it. */
export const renameServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => renameServerInput.parse(d))
  .handler(async ({ data, context }) => {
    const { order } = await loadAccessibleServerOrder(data.orderId, context.userId, "renameServer");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const adminDb = supabaseAdmin as unknown as AdminDb;
    const { error } = await adminDb
      .from("server_orders")
      .update({ server_name: data.name })
      .eq("id", order.id);
    if (error) throw new Error(error.message);

    if (!order.pterodactyl_server_identifier) {
      return { ok: true, infrastructureRenamed: false };
    }

    try {
      const { ptero, assertPteroClientConfigured } = await import("@/lib/pterodactyl.server");
      assertPteroClientConfigured();
      await ptero.client(`/servers/${order.pterodactyl_server_identifier}/settings/rename`, {
        method: "POST",
        body: JSON.stringify({ name: data.name }),
      });
      return { ok: true, infrastructureRenamed: true };
    } catch (error) {
      console.warn(
        `[Servers] XNT display name updated but infrastructure rename failed for ${data.orderId}: ${publicServerServiceError(error, "rename failed")}`,
      );
      return { ok: true, infrastructureRenamed: false };
    }
  });

export const applyServerSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => applyServerSettingsInput.parse(d))
  .handler(async ({ data, context }) => {
    const { order } = await loadAccessibleServerOrder(
      data.orderId,
      context.userId,
      "applyServerSettings",
    );
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const adminDb = supabaseAdmin as unknown as AdminDb;
    const forbiddenKey = hasForbiddenServerSetting(data.settings);
    if (forbiddenKey) {
      console.warn("[ServerSettings] forbidden setting rejected", {
        serverOrderId: order.id,
        userId: context.userId,
        key: forbiddenKey,
      });
      throw new Error("Ce paramètre est verrouillé par votre offre XNTServers.");
    }

    const sanitized = sanitizeServerSettings(order.plans?.game, data.settings);
    const existingMetadata =
      order.metadata && typeof order.metadata === "object"
        ? (order.metadata as Record<string, unknown>)
        : {};
    const previousSettings = selectedServerSettings(existingMetadata);
    const nextSettings = { ...previousSettings, ...sanitized };
    const changes: ServerSettingsChangeLogEntry[] = [];
    for (const [key, newValue] of Object.entries(sanitized)) {
      const oldValue = previousSettings[key];
      if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
        changes.push({
          at: new Date().toISOString(),
          user_id: context.userId,
          key,
          old_value: oldValue ?? null,
          new_value: newValue,
        });
      }
    }

    const newDisplayName =
      typeof sanitized.serverName === "string" && sanitized.serverName.trim()
        ? sanitized.serverName.trim()
        : typeof sanitized.hostname === "string" && sanitized.hostname.trim()
          ? sanitized.hostname.trim()
          : null;
    const nextMetadata = {
      ...existingMetadata,
      server_settings: nextSettings,
      settings_change_log: [...selectedSettingsChangeLog(existingMetadata), ...changes].slice(-50),
    };
    const updatePayload: Record<string, unknown> = { metadata: nextMetadata };
    if (newDisplayName) updatePayload.server_name = newDisplayName;

    const updateResult = await adminDb
      .from("server_orders")
      .update(updatePayload)
      .eq("id", order.id);
    if (updateResult.error) throw new Error(updateResult.error.message);

    let infrastructureRenamed = false;
    if (newDisplayName && order.pterodactyl_server_identifier) {
      try {
        const { ptero, assertPteroClientConfigured } = await import("@/lib/pterodactyl.server");
        assertPteroClientConfigured();
        await ptero.client(`/servers/${order.pterodactyl_server_identifier}/settings/rename`, {
          method: "POST",
          body: JSON.stringify({ name: newDisplayName }),
        });
        infrastructureRenamed = true;
      } catch (renameError) {
        console.warn(
          `[Servers] Settings saved but infrastructure rename failed for ${data.orderId}: ${publicServerServiceError(renameError, "rename failed")}`,
        );
      }
    }

    let minecraftSync:
      | { status: "success"; changedKeys: string[]; restartRecommended: boolean }
      | { status: "failed"; error: string }
      | { status: "skipped" } = { status: "skipped" };
    if (isMinecraftGame(order.plans?.game)) {
      try {
        const syncResult = await syncMinecraftSettingsInternal(order.id, context.userId);
        minecraftSync = {
          status: "success",
          changedKeys: syncResult.changedKeys,
          restartRecommended: syncResult.restartRecommended,
        };
      } catch (syncError) {
        minecraftSync = {
          status: "failed",
          error:
            syncError instanceof Error
              ? syncError.message
              : "Synchronisation Minecraft impossible.",
        };
      }
    }

    return {
      ok: true,
      changed: changes.map((change) => change.key),
      infrastructureRenamed,
      minecraftSync,
    };
  });

export const syncMinecraftSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => orderInput.parse(d))
  .handler(async ({ data, context }) => {
    const result = await syncMinecraftSettingsInternal(data.orderId, context.userId);
    return {
      ok: true,
      changedKeys: result.changedKeys,
      restartRecommended: result.restartRecommended,
    };
  });

export const syncMinecraftServerProperties = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => orderInput.parse(d))
  .handler(async ({ data, context }) => {
    const result = await syncMinecraftSettingsInternal(data.orderId, context.userId);
    return {
      ok: true,
      changedKeys: result.changedKeys,
      restartRecommended: result.restartRecommended,
    };
  });

/** Reinstall a server through the Pterodactyl Client API. */
export const reinstallServerClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => orderInput.parse(d))
  .handler(async ({ data, context }) => {
    const identifier = await loadOwnedIdentifier(context.supabase, data.orderId, context.userId);
    const { ptero, assertPteroClientConfigured } = await import("@/lib/pterodactyl.server");
    assertPteroClientConfigured();
    await ptero.client(`/servers/${identifier}/settings/reinstall`, {
      method: "POST",
      body: JSON.stringify({}),
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
    const { order } = await loadAccessibleServerOrder(
      data.orderId,
      context.userId,
      "getServerStartup",
    );
    if (!order.pterodactyl_server_id) throw new Error("Serveur introuvable.");

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
    const { order } = await loadAccessibleServerOrder(
      data.orderId,
      context.userId,
      "updateServerStartup",
    );
    if (!order.pterodactyl_server_id) throw new Error("Serveur introuvable.");

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
