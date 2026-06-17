import "@tanstack/react-start/server-only";

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

function requireCurseForgeKey() {
  const key = process.env.CURSEFORGE_API_KEY?.trim();
  if (!key) {
    throw new Error("Configuration CurseForge absente. Ajoutez CURSEFORGE_API_KEY côté serveur.");
  }
  return key;
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
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "x-api-key": key,
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`CurseForge API error ${response.status}`);
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

export function extractMinecraftVersions(file: CurseForgeFile) {
  return (file.gameVersions ?? []).filter((version) => /^\d+\.\d+(?:\.\d+)?$/.test(version));
}

export function extractLoaders(file: CurseForgeFile) {
  const known = new Set(["forge", "fabric", "quilt", "neoforge"]);
  return (file.gameVersions ?? [])
    .map((version) => version.toLowerCase())
    .filter((version) => known.has(version));
}
