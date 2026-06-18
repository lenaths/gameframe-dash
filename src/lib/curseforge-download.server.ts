import "@tanstack/react-start/server-only";

const CURSEFORGE_BASE_URL = "https://api.curseforge.com";
const REQUEST_TIMEOUT_MS = 8_000;

function cleanKey(raw: string | undefined) {
  return (raw ?? "")
    .trim()
    .replace(/^["']+|["']+$/g, "")
    .trim();
}

function requireCurseForgeApiKey() {
  const key = cleanKey(process.env.CURSEFORGE_API_KEY);
  if (!key) throw new Error("Configuration CurseForge absente côté serveur.");
  return key;
}

export async function getCurseForgeDownloadUrl(modId: number, fileId: number) {
  if (!Number.isInteger(modId) || modId <= 0) throw new Error("Modpack CurseForge invalide.");
  if (!Number.isInteger(fileId) || fileId <= 0) {
    throw new Error("Server pack CurseForge invalide.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const url = `${CURSEFORGE_BASE_URL}/v1/mods/${modId}/files/${fileId}/download-url`;

  try {
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "x-api-key": requireCurseForgeApiKey(),
      },
      signal: controller.signal,
    });
    const text = await response.text();
    if (!response.ok) {
      console.warn("[CurseForge Download] request failed", {
        url,
        status: response.status,
        body: text.slice(0, 500),
      });
      throw new Error(`CurseForge download-url HTTP ${response.status}`);
    }
    const parsed = text ? (JSON.parse(text) as { data?: string }) : {};
    if (!parsed.data || !/^https:\/\//i.test(parsed.data)) {
      throw new Error("URL de téléchargement CurseForge indisponible pour ce fichier.");
    }
    return parsed.data;
  } catch (error) {
    if ((error as Error).name === "AbortError") {
      throw new Error("CurseForge ne répond pas assez vite pour préparer le téléchargement.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
