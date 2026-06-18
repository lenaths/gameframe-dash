import "@tanstack/react-start/server-only";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const CURSEFORGE_BASE_URL = "https://api.curseforge.com";
const MINECRAFT_GAME_ID = 432;
const MINECRAFT_MODPACK_CLASS_ID = 4471;
const REQUEST_TIMEOUT_MS = 8_000;

const LOADER_TYPES: Record<string, number> = {
  forge: 1,
  fabric: 4,
  quilt: 5,
  neoforge: 6,
};

export type CurseForgeMod = {
  id: number;
  slug?: string | null;
  name: string;
  summary?: string | null;
  logo?: { url?: string | null } | null;
  links?: { websiteUrl?: string | null } | null;
  downloadCount?: number | null;
  classId?: number | null;
  primaryCategoryId?: number | null;
};

export type CurseForgeFile = {
  id: number;
  displayName?: string | null;
  fileName?: string | null;
  releaseType?: number | null;
  fileStatus?: number | null;
  gameVersions?: string[] | null;
  serverPackFileId?: number | null;
  fileDate?: string | null;
  fileLength?: number | null;
  hashes?: unknown;
  dependencies?: unknown;
};

type CurseForgeResponse<T> = {
  data: T;
};

type CurseForgeDiagnostic = {
  endpoint: string;
  baseUrl: string;
  url: string;
  cwd: string;
  nodeEnv: string | null;
  apiKeyPresent: boolean;
  keyLength: number;
  keyPrefix: string | null;
  keySuffix: string | null;
  hasQuotes: boolean;
  hasWhitespace: boolean;
  keySource: "process.env" | ".env";
  envFilePath: string | null;
  processKeyLength: number;
  envFileKeyLength: number | null;
  method: "GET";
  status: number | null;
  ok: boolean;
  message: string;
  body: string | null;
};

function normalizeCurseForgeKey(raw: string | undefined) {
  const value = raw ?? "";
  const trimmed = value.trim();
  const unquoted = trimmed.replace(/^["']+|["']+$/g, "");
  return {
    rawPresent: value.length > 0,
    rawLength: value.length,
    hasWhitespace: value !== trimmed,
    hasQuotes: trimmed !== unquoted,
    key: unquoted.trim(),
  };
}

function readLocalEnvFileKey() {
  const envPath = join(process.cwd(), ".env");
  if (!existsSync(envPath)) return null;
  const lines = readFileSync(envPath, "utf8").split(/\r?\n/);
  let match: { raw: string; path: string } | null = null;
  for (const line of lines) {
    const found = line.match(/^\s*CURSEFORGE_API_KEY\s*=\s*(.*)\s*$/);
    if (found) match = { raw: found[1] ?? "", path: envPath };
  }
  if (!match) return null;
  return {
    ...normalizeCurseForgeKey(match.raw),
    path: match.path,
  };
}

function getCurseForgeKeyMaterial() {
  const processKey = normalizeCurseForgeKey(process.env.CURSEFORGE_API_KEY);
  const fileKey = readLocalEnvFileKey();
  if (fileKey?.key && fileKey.key.length > processKey.key.length) {
    return {
      ...fileKey,
      source: ".env" as const,
      envFilePath: fileKey.path,
      processKeyLength: processKey.key.length,
      envFileKeyLength: fileKey.key.length,
    };
  }
  return {
    ...processKey,
    source: "process.env" as const,
    envFilePath: fileKey?.path ?? null,
    processKeyLength: processKey.key.length,
    envFileKeyLength: fileKey?.key.length ?? null,
  };
}

function getKeyDebug() {
  const normalized = getCurseForgeKeyMaterial();
  return {
    apiKeyPresent: normalized.key.length > 0,
    keyLength: normalized.key.length,
    keyPrefix: normalized.key ? normalized.key.slice(0, 3) : null,
    keySuffix: normalized.key ? normalized.key.slice(-3) : null,
    hasQuotes: normalized.hasQuotes,
    hasWhitespace: normalized.hasWhitespace,
    keySource: normalized.source,
    envFilePath: normalized.envFilePath,
    processKeyLength: normalized.processKeyLength,
    envFileKeyLength: normalized.envFileKeyLength,
  };
}

function requireCurseForgeKey() {
  const { key } = getCurseForgeKeyMaterial();
  if (!key) {
    throw new Error("Configuration CurseForge absente. Ajoutez CURSEFORGE_API_KEY côté serveur.");
  }
  return key;
}

async function readResponseBody(response: Response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function stringifyBody(body: unknown) {
  if (body == null) return null;
  return typeof body === "string" ? body : JSON.stringify(body, null, 2);
}

function describeCurseForgeError(status: number, body: unknown) {
  const bodyMessage =
    body && typeof body === "object"
      ? ((body as Record<string, unknown>).message ??
        (body as Record<string, unknown>).error ??
        (body as Record<string, unknown>).title)
      : null;
  const message = typeof bodyMessage === "string" && bodyMessage.trim() ? bodyMessage : null;
  return message ?? `CurseForge API error ${status}`;
}

async function curseForgeRequest<T>(path: string, searchParams?: URLSearchParams) {
  const key = requireCurseForgeKey();
  const url = new URL(path, CURSEFORGE_BASE_URL);
  if (searchParams) {
    for (const [name, value] of searchParams.entries()) url.searchParams.append(name, value);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    console.info("[CurseForge Debug] request", {
      cwd: process.cwd(),
      nodeEnv: process.env.NODE_ENV ?? null,
      ...getKeyDebug(),
      method: "GET",
      url: url.toString(),
    });
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "x-api-key": key,
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      const body = await readResponseBody(response);
      console.warn("[CurseForge Debug] request failed", {
        cwd: process.cwd(),
        url: url.toString(),
        status: response.status,
        body: stringifyBody(body),
      });
      throw new Error(describeCurseForgeError(response.status, body));
    }

    return (await response.json()) as CurseForgeResponse<T>;
  } catch (error) {
    if ((error as Error).name === "AbortError") {
      throw new Error("CurseForge ne répond pas assez vite. Réessayez dans quelques instants.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function searchCurseForgeModpacks(input: {
  query: string;
  minecraftVersion?: string | null;
  loader?: string | null;
  pageSize?: number;
}) {
  const params = new URLSearchParams({
    gameId: String(MINECRAFT_GAME_ID),
    classId: String(MINECRAFT_MODPACK_CLASS_ID),
    searchFilter: input.query,
    pageSize: String(Math.min(Math.max(input.pageSize ?? 20, 1), 50)),
    index: "0",
  });

  if (input.minecraftVersion?.trim()) {
    params.set("gameVersion", input.minecraftVersion.trim());
  }

  const loaderType = input.loader ? LOADER_TYPES[input.loader.toLowerCase()] : null;
  if (loaderType) {
    params.set("modLoaderTypes", String(loaderType));
  }

  const response = await curseForgeRequest<CurseForgeMod[]>("/v1/mods/search", params);
  return response.data;
}

export async function getCurseForgeMod(modId: number) {
  const response = await curseForgeRequest<CurseForgeMod>(`/v1/mods/${modId}`);
  return response.data;
}

export async function listCurseForgeModFiles(modId: number) {
  const params = new URLSearchParams({
    pageSize: "50",
    index: "0",
  });
  const response = await curseForgeRequest<CurseForgeFile[]>(`/v1/mods/${modId}/files`, params);
  return response.data;
}

export async function testCurseForgeConnection(): Promise<CurseForgeDiagnostic> {
  const { key } = getCurseForgeKeyMaterial();
  const keyDebug = getKeyDebug();
  const params = new URLSearchParams({
    gameId: String(MINECRAFT_GAME_ID),
    classId: String(MINECRAFT_MODPACK_CLASS_ID),
    searchFilter: "minecraft",
    pageSize: "1",
    index: "0",
  });
  const endpoint = "/v1/mods/search";
  const url = new URL(endpoint, CURSEFORGE_BASE_URL);
  for (const [name, value] of params.entries()) url.searchParams.append(name, value);

  if (!key) {
    return {
      endpoint,
      baseUrl: CURSEFORGE_BASE_URL,
      url: url.toString(),
      cwd: process.cwd(),
      nodeEnv: process.env.NODE_ENV ?? null,
      ...keyDebug,
      method: "GET",
      status: null,
      ok: false,
      message: "CURSEFORGE_API_KEY absente côté serveur.",
      body: null,
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    console.info("[CurseForge Debug] diagnostic request", {
      cwd: process.cwd(),
      nodeEnv: process.env.NODE_ENV ?? null,
      ...keyDebug,
      method: "GET",
      url: url.toString(),
    });
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "x-api-key": key,
      },
      signal: controller.signal,
    });
    const body = await readResponseBody(response);
    const diagnostic = {
      endpoint,
      baseUrl: CURSEFORGE_BASE_URL,
      url: url.toString(),
      cwd: process.cwd(),
      nodeEnv: process.env.NODE_ENV ?? null,
      ...keyDebug,
      method: "GET" as const,
      status: response.status,
      ok: response.ok,
      message: response.ok
        ? "Connexion CurseForge OK."
        : describeCurseForgeError(response.status, body),
      body: stringifyBody(body),
    };
    console.info("[CurseForge Debug] diagnostic result", diagnostic);
    return diagnostic;
  } catch (error) {
    const message =
      (error as Error).name === "AbortError"
        ? "Timeout CurseForge."
        : ((error as Error).message ?? "Erreur réseau CurseForge.");
    console.warn("[CurseForge Debug] diagnostic failed", {
      cwd: process.cwd(),
      url: url.toString(),
      error: message,
    });
    return {
      endpoint,
      baseUrl: CURSEFORGE_BASE_URL,
      url: url.toString(),
      cwd: process.cwd(),
      nodeEnv: process.env.NODE_ENV ?? null,
      ...keyDebug,
      method: "GET",
      status: null,
      ok: false,
      message,
      body: null,
    };
  } finally {
    clearTimeout(timeout);
  }
}

export function extractMinecraftVersions(file: CurseForgeFile) {
  return (file.gameVersions ?? []).filter((version) => /^\d+\.\d+(?:\.\d+)?$/.test(version));
}

export function extractLoaders(file: CurseForgeFile) {
  const known = new Set(["forge", "fabric", "quilt", "neoforge"]);
  return (file.gameVersions ?? [])
    .map((version) => version.toLowerCase())
    .filter((version) => known.has(version));
}
