export const FORBIDDEN_SETTING_KEYS = new Set([
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
  "token",
  "api_key",
  "apikey",
  "secret",
  "private_key",
  "credentials",
]);

export const MAX_FILE_CONTENT_BYTES = 1024 * 1024;

export const BLOCKED_FILE_EXTENSIONS = new Set([
  ".jar",
  ".zip",
  ".tar",
  ".gz",
  ".exe",
  ".bin",
  ".sqlite",
  ".db",
]);

export const MANAGED_FILE_MESSAGE =
  "Ce fichier est géré par XNTServers. Modifie ces paramètres depuis l’onglet Paramètres serveur.";

export const PROTECTED_FILE_BASENAMES = new Set([
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
  "gameusersettings.ini",
  "game.ini",
  "engine.ini",
  "serversettings.ini",
  "server.cfg",
]);

export const PROTECTED_PATH_PREFIXES = [
  "/bungeecord/config.yml",
  "/.xnt",
  "/.xnt-modpack-install",
  "/.ptero",
  "/.config/xnt",
  "/scripts/xnt",
  "/xnt",
];

export function hasForbiddenServerSetting(input: Record<string, unknown>) {
  return Object.keys(input).find((key) => FORBIDDEN_SETTING_KEYS.has(key.trim().toLowerCase()));
}

export function hasBlockedExtension(path: string) {
  const lower = path.toLowerCase();
  return [...BLOCKED_FILE_EXTENSIONS].some((extension) => lower.endsWith(extension));
}

export function normalizeServerPath(input: string, fallback = "/") {
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

export function isProtectedServerPath(path: string) {
  const normalized = normalizeServerPath(path).toLowerCase();
  const name = normalized.split("/").pop() ?? "";
  if (PROTECTED_FILE_BASENAMES.has(name)) return true;
  if (/(secret|token|private[_-]?key|api[_-]?key|credentials?)/i.test(name)) return true;
  return PROTECTED_PATH_PREFIXES.some(
    (prefix) => normalized === prefix || normalized.startsWith(`${prefix}/`),
  );
}

export function assertNotProtectedServerPath(path: string) {
  const normalized = normalizeServerPath(path);
  if (isProtectedServerPath(normalized)) throw new Error(MANAGED_FILE_MESSAGE);
  return normalized;
}

export function assertEditableFilePath(path: string) {
  const normalized = normalizeServerPath(path);
  assertNotProtectedServerPath(normalized);
  if (hasBlockedExtension(normalized)) {
    throw new Error("Ce fichier ne peut pas être ouvert dans l’éditeur.");
  }
  return normalized;
}
