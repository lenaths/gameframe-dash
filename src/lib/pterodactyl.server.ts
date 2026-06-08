// Server-only helpers for talking to a Pterodactyl panel.
// Never import this from client code.

const PANEL = () => (process.env.PTERODACTYL_PANEL_URL ?? "").replace(/\/+$/, "");
const APP_KEY = () => process.env.PTERODACTYL_APP_API_KEY ?? "";
const CLIENT_KEY = () => process.env.PTERODACTYL_CLIENT_API_KEY ?? "";

type Json = Record<string, unknown>;

async function pteroFetch(path: string, key: string, init: RequestInit = {}) {
  const url = `${PANEL()}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      "Accept": "application/json",
      "Content-Type": "application/json",
      "Authorization": `Bearer ${key}`,
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  let body: unknown = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!res.ok) {
    const detail = typeof body === "object" && body !== null
      ? JSON.stringify(body)
      : String(body);
    throw new Error(`Pterodactyl ${res.status} ${path}: ${detail}`);
  }
  return body as Json;
}

export const ptero = {
  app: (path: string, init?: RequestInit) => pteroFetch(`/api/application${path}`, APP_KEY(), init),
  client: (path: string, init?: RequestInit) => pteroFetch(`/api/client${path}`, CLIENT_KEY(), init),
};

export function assertPteroConfigured() {
  if (!PANEL() || !APP_KEY() || !CLIENT_KEY()) {
    throw new Error("Pterodactyl is not fully configured. Set PTERODACTYL_PANEL_URL, PTERODACTYL_APP_API_KEY, and PTERODACTYL_CLIENT_API_KEY.");
  }
}

/** Pick the first available location id from the panel, used as a deploy hint. */
export async function getDefaultLocationId(): Promise<number> {
  const list = (await ptero.app("/locations")) as { data?: Array<{ attributes: { id: number } }> };
  const first = list.data?.[0]?.attributes?.id;
  if (!first) throw new Error("No locations configured on the Pterodactyl panel.");
  return first;
}
