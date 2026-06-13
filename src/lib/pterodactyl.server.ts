// Server-only helpers for talking to a Pterodactyl panel.
// Never import this from client code.

const PANEL = () => {
  const raw = (process.env.PTERODACTYL_PANEL_URL ?? "").trim().replace(/\/+$/, "");
  if (!raw) return "";
  return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
};
const APP_KEY = () => process.env.PTERODACTYL_APP_API_KEY ?? "";
const CLIENT_KEY = () => process.env.PTERODACTYL_CLIENT_API_KEY ?? "";

export function getPanelBaseUrl() {
  return PANEL();
}

type Json = Record<string, unknown>;

type PteroApiKind = "Application" | "Client";

export class PterodactylConfigError extends Error {
  constructor(apiKind: PteroApiKind, missing: string[]) {
    super(
      `Pterodactyl ${apiKind} API is not configured. Missing ${missing.join(
        ", ",
      )}. Update your environment variables and restart the server.`,
    );
    this.name = "PterodactylConfigError";
  }
}

function requirePanel(apiKind: PteroApiKind) {
  if (!PANEL()) throw new PterodactylConfigError(apiKind, ["PTERODACTYL_PANEL_URL"]);
}

export function assertPteroAppConfigured() {
  const missing = [
    ...(!PANEL() ? ["PTERODACTYL_PANEL_URL"] : []),
    ...(!APP_KEY() ? ["PTERODACTYL_APP_API_KEY"] : []),
  ];
  if (missing.length) throw new PterodactylConfigError("Application", missing);
}

export function assertPteroClientConfigured() {
  const missing = [
    ...(!PANEL() ? ["PTERODACTYL_PANEL_URL"] : []),
    ...(!CLIENT_KEY() ? ["PTERODACTYL_CLIENT_API_KEY"] : []),
  ];
  if (missing.length) throw new PterodactylConfigError("Client", missing);
}

function formatPteroError(status: number, path: string, body: string, statusText: string) {
  let detail = body || statusText;
  let code = "";
  try {
    const parsed = JSON.parse(body) as { errors?: Array<{ code?: string; detail?: string }> };
    const first = parsed.errors?.[0];
    detail = first?.detail || detail;
    code = first?.code ? ` ${first.code}` : "";
  } catch {
    // Keep the raw response body when the panel does not return JSON.
  }

  if (status === 502 && detail.toLowerCase().includes("communicating with the machine")) {
    detail =
      "The panel could not contact the Wings/node daemon while creating the server. Check the node is online, reachable from the panel, and has a valid allocation available.";
  }

  if (status === 401 && path.startsWith("/api/client/")) {
    detail =
      "The Pterodactyl Client API key was rejected. Update PTERODACTYL_CLIENT_API_KEY with a valid Account API key from a panel user that can access this server.";
  } else if (status === 401 && path.startsWith("/api/application/")) {
    detail =
      "The Pterodactyl Application API key was rejected. Update PTERODACTYL_APP_API_KEY with a valid Application API key that has the required permissions.";
  }

  return `Pterodactyl ${status}${code} ${path}: ${detail}`;
}

interface PteroOptions extends Omit<RequestInit, "body"> {
  body?: BodyInit | null;
  raw?: boolean; // return raw text instead of JSON
  contentType?: string | null; // override / disable content-type
}

async function pteroFetch(path: string, key: string, opts: PteroOptions = {}) {
  requirePanel(path.startsWith("/api/application/") ? "Application" : "Client");
  if (!key) {
    throw new PterodactylConfigError(
      path.startsWith("/api/application/") ? "Application" : "Client",
      [
        path.startsWith("/api/application/")
          ? "PTERODACTYL_APP_API_KEY"
          : "PTERODACTYL_CLIENT_API_KEY",
      ],
    );
  }

  const url = `${PANEL()}${path}`;
  const headers: Record<string, string> = {
    Accept: "application/json",
    Authorization: `Bearer ${key}`,
    ...(opts.headers as Record<string, string> | undefined),
  };
  if (opts.contentType !== null) {
    headers["Content-Type"] = opts.contentType ?? "application/json";
  }
  let res: Response;
  try {
    res = await fetch(url, { ...opts, headers });
  } catch (e) {
    const cause = (e as Error & { cause?: Error }).cause?.message ?? (e as Error).message;
    throw new Error(`Pterodactyl fetch failed for ${path}: ${cause}`);
  }

  const text = await res.text();
  if (!res.ok) {
    throw new Error(formatPteroError(res.status, path, text, res.statusText));
  }
  if (opts.raw) return text;
  if (!text) return null;
  try {
    return JSON.parse(text) as Json;
  } catch {
    return text;
  }
}

export const ptero = {
  app: (path: string, opts?: PteroOptions) =>
    pteroFetch(`/api/application${path}`, APP_KEY(), opts),
  client: (path: string, opts?: PteroOptions) =>
    pteroFetch(`/api/client${path}`, CLIENT_KEY(), opts),
};

export function assertPteroConfigured() {
  const missing = [
    ...(!PANEL() ? ["PTERODACTYL_PANEL_URL"] : []),
    ...(!APP_KEY() ? ["PTERODACTYL_APP_API_KEY"] : []),
    ...(!CLIENT_KEY() ? ["PTERODACTYL_CLIENT_API_KEY"] : []),
  ];
  if (missing.length) throw new PterodactylConfigError("Application", missing);
}

export async function getDefaultLocationId(): Promise<number> {
  const list = (await ptero.app("/locations")) as { data?: Array<{ attributes: { id: number } }> };
  const first = list.data?.[0]?.attributes?.id;
  if (!first) throw new Error("No locations configured on the Pterodactyl panel.");
  return first;
}

export type PterodactylAllocation = {
  id: number;
  ip: string;
  port: number;
  nodeId: number;
};

export async function getFirstFreeAllocation(): Promise<PterodactylAllocation> {
  const nodes = (await ptero.app("/nodes")) as {
    data?: Array<{ attributes: { id: number; name: string } }>;
  };

  for (const node of nodes.data ?? []) {
    const allocations = (await ptero.app(`/nodes/${node.attributes.id}/allocations`)) as {
      data?: Array<{
        attributes: {
          id: number;
          ip: string;
          port: number;
          assigned?: boolean | null;
        };
      }>;
    };

    const free = allocations.data
      ?.map((allocation) => allocation.attributes)
      .find((allocation) => allocation.assigned === false || allocation.assigned == null);
    if (free) return { id: free.id, ip: free.ip, port: free.port, nodeId: node.attributes.id };
  }

  throw new Error("Aucune allocation disponible sur ce node");
}

export type EggVariable = {
  name: string;
  description: string;
  env_variable: string;
  default_value: string;
  user_viewable: boolean;
  user_editable: boolean;
  rules: string;
};

export type EggDetails = {
  id: number;
  name: string;
  description: string;
  docker_image: string;
  startup: string;
  variables: EggVariable[];
};

export async function getEggDetails(nestId: number, eggId: number): Promise<EggDetails> {
  const res = (await ptero.app(`/nests/${nestId}/eggs/${eggId}?include=variables`)) as {
    attributes: {
      id: number;
      name: string;
      description: string;
      docker_image: string;
      startup: string;
      relationships?: { variables?: { data?: Array<{ attributes: EggVariable }> } };
    };
  };
  const a = res.attributes;
  return {
    id: a.id,
    name: a.name,
    description: a.description,
    docker_image: a.docker_image,
    startup: a.startup,
    variables: (a.relationships?.variables?.data ?? []).map((v) => v.attributes),
  };
}

export async function getEggDefaultEnvironment(
  nestId: number,
  eggId: number,
): Promise<Record<string, string>> {
  const details = await getEggDetails(nestId, eggId);
  const env: Record<string, string> = {};
  for (const v of details.variables) env[v.env_variable] = v.default_value ?? "";
  return env;
}

/** Update an existing server's startup (env vars, egg, image). */
export async function updateServerStartupApp(
  serverId: number,
  payload: {
    environment: Record<string, string>;
    startup: string;
    egg: number;
    image: string;
    skip_scripts?: boolean;
  },
) {
  await ptero.app(`/servers/${serverId}/startup`, {
    method: "PATCH",
    body: JSON.stringify({ skip_scripts: false, ...payload }),
  });
}

export async function reinstallServer(serverId: number) {
  await ptero.app(`/servers/${serverId}/reinstall`, { method: "POST", body: "" });
}

/** Get a server's current egg, image, startup, env from app API. */
export async function getServerStartupApp(serverId: number) {
  const res = (await ptero.app(`/servers/${serverId}?include=egg,variables`)) as {
    attributes: {
      nest: number;
      egg: number;
      container: { startup_command: string; image: string; environment: Record<string, string> };
      relationships?: { variables?: { data?: Array<{ attributes: EggVariable }> } };
    };
  };
  return {
    nest: res.attributes.nest,
    egg: res.attributes.egg,
    startup: res.attributes.container.startup_command,
    image: res.attributes.container.image,
    environment: res.attributes.container.environment,
    variables: (res.attributes.relationships?.variables?.data ?? []).map((v) => v.attributes),
  };
}

/** Create a Pterodactyl panel user. Returns the user id. */
export async function createPanelUser(input: {
  email: string;
  username: string;
  firstName: string;
  lastName: string;
}): Promise<number> {
  const res = (await ptero.app("/users", {
    method: "POST",
    body: JSON.stringify({
      email: input.email,
      username:
        input.username
          .toLowerCase()
          .replace(/[^a-z0-9._-]/g, "")
          .slice(0, 32) || `user${Date.now()}`,
      first_name: input.firstName || "Player",
      last_name: input.lastName || "User",
    }),
  })) as { attributes: { id: number } };
  return res.attributes.id;
}
