import { randomBytes } from "node:crypto";
import http from "node:http";
import https from "node:https";
import { lookup } from "node:dns/promises";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type WsCheckResult = {
  success: boolean;
  opened: boolean;
  closeCode: number | null;
  closeReason: string | null;
  handshakeError: string | null;
  url?: string;
  endpoint?: string;
  origin?: string | null;
  dns?: { address: string; family: number } | null;
  upgrade?: {
    statusCode: number | null;
    statusMessage: string | null;
    headers: Record<string, string>;
    received101: boolean;
  };
  websocket?: {
    open: boolean;
    authSent: boolean;
    authSuccess: boolean;
    authFailed: boolean;
    lastRawMessage: string | null;
    error: string | null;
  };
};

function requireSupabaseEnv() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Supabase auth environment is not configured.");
  return { url, key };
}

function getBearerToken(request: Request) {
  const authHeader = request.headers.get("authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) throw new Error("Unauthorized.");
  const token = authHeader.slice("Bearer ".length).trim();
  if (!token) throw new Error("Unauthorized.");
  return token;
}

async function getAuthenticatedUserId(request: Request) {
  const token = getBearerToken(request);
  const { url, key } = requireSupabaseEnv();
  const supabase = createClient<Database>(url, key, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: {
      storage: undefined,
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const { data, error } = await supabase.auth.getClaims(token);
  if (error || !data?.claims?.sub) throw new Error("Unauthorized.");
  return { supabase, userId: data.claims.sub };
}

function serializeHeaders(headers: http.IncomingHttpHeaders) {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    result[key] = Array.isArray(value) ? value.join(", ") : String(value ?? "");
  }
  return result;
}

function websocketToHttpUrl(socketUrl: string) {
  const url = new URL(socketUrl);
  if (url.protocol === "wss:") url.protocol = "https:";
  else if (url.protocol === "ws:") url.protocol = "http:";
  else throw new Error(`Unsupported websocket protocol: ${url.protocol}`);
  return url;
}

async function performUpgradeProbe(socketUrl: string, origin: string | null) {
  const url = websocketToHttpUrl(socketUrl);
  const key = randomBytes(16).toString("base64");
  const transport = url.protocol === "https:" ? https : http;

  return new Promise<WsCheckResult["upgrade"]>((resolve, reject) => {
    const req = transport.request(
      url,
      {
        method: "GET",
        headers: {
          Host: url.host,
          Upgrade: "websocket",
          Connection: "Upgrade",
          "Sec-WebSocket-Key": key,
          "Sec-WebSocket-Version": "13",
          ...(origin ? { Origin: origin } : {}),
        },
        timeout: 10_000,
      },
      (res) => {
        const headers = serializeHeaders(res.headers);
        res.resume();
        resolve({
          statusCode: res.statusCode ?? null,
          statusMessage: res.statusMessage ?? null,
          headers,
          received101: false,
        });
      },
    );

    req.on("upgrade", (res, socket) => {
      socket.destroy();
      resolve({
        statusCode: res.statusCode ?? null,
        statusMessage: res.statusMessage ?? null,
        headers: serializeHeaders(res.headers),
        received101: res.statusCode === 101,
      });
    });
    req.on("timeout", () => {
      req.destroy(new Error("WebSocket upgrade timeout."));
    });
    req.on("error", reject);
    req.end();
  });
}

async function performNodeWebSocketProbe(socketUrl: string, token: string) {
  const result: NonNullable<WsCheckResult["websocket"]> = {
    open: false,
    authSent: false,
    authSuccess: false,
    authFailed: false,
    lastRawMessage: null,
    error: null,
  };

  if (typeof WebSocket === "undefined") {
    result.error = "Node.js WebSocket API is not available in this runtime.";
    return { result, closeCode: null, closeReason: null };
  }

  return new Promise<{
    result: NonNullable<WsCheckResult["websocket"]>;
    closeCode: number | null;
    closeReason: string | null;
  }>((resolve) => {
    let settled = false;
    let closeCode: number | null = null;
    let closeReason: string | null = null;
    const ws = new WebSocket(socketUrl);

    const timeout = setTimeout(() => {
      if (settled) return;
      result.error = "Node WebSocket probe timeout.";
      settled = true;
      try {
        ws.close();
      } catch {
        // ignore
      }
      resolve({ result, closeCode, closeReason });
    }, 12_000);

    const settle = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve({ result, closeCode, closeReason });
    };

    ws.addEventListener("open", () => {
      result.open = true;
      ws.send(JSON.stringify({ event: "auth", args: [token] }));
      result.authSent = true;
    });

    ws.addEventListener("message", (event) => {
      const raw = typeof event.data === "string" ? event.data : "[binary websocket message]";
      result.lastRawMessage = raw.length > 500 ? `${raw.slice(0, 500)}...` : raw;
      try {
        const parsed = JSON.parse(raw) as { event?: string; args?: unknown[] };
        if (parsed.event === "auth success") {
          result.authSuccess = true;
          ws.send(JSON.stringify({ event: "send logs", args: [null] }));
          ws.send(JSON.stringify({ event: "send stats", args: [null] }));
          settle();
        } else if (parsed.event === "jwt error" || parsed.event === "auth error") {
          result.authFailed = true;
          result.error = String(parsed.args?.[0] ?? parsed.event);
          settle();
        }
      } catch {
        // Keep raw message in result.
      }
    });

    ws.addEventListener("close", (event) => {
      closeCode = event.code;
      closeReason = event.reason || null;
      if (!result.authSuccess) {
        result.error ??= `Closed before auth success: ${event.code}`;
      }
      settle();
    });

    ws.addEventListener("error", () => {
      result.error = "Node WebSocket error event.";
    });
  });
}

function classifyFailure(result: WsCheckResult) {
  if (result.websocket?.authSuccess) return "success";
  if (result.upgrade && !result.upgrade.received101) return "reverse_proxy_or_wings_upgrade";
  if (result.handshakeError?.toLowerCase().includes("certificate")) return "tls_certificate";
  if (result.handshakeError?.toLowerCase().includes("enotfound")) return "dns";
  if (result.opened && result.websocket?.authFailed) return "pterodactyl_auth";
  if (!result.opened && result.upgrade?.received101) return "websocket_runtime_or_origin";
  return "unknown";
}

export async function handleWsCheckRequest(request: Request) {
  if (process.env.NODE_ENV !== "development") {
    return Response.json(
      { error: "Debug endpoint is only available in development." },
      { status: 404 },
    );
  }

  const url = new URL(request.url);
  const orderId = url.searchParams.get("orderId");
  if (!orderId) return Response.json({ error: "Missing orderId." }, { status: 400 });

  try {
    const { supabase, userId } = await getAuthenticatedUserId(request);
    const { data: order, error } = await supabase
      .from("server_orders")
      .select("pterodactyl_server_identifier")
      .eq("id", orderId)
      .eq("user_id", userId)
      .single();

    if (error || !order?.pterodactyl_server_identifier) {
      return Response.json({ error: "Server not found or access denied." }, { status: 404 });
    }

    const identifier = order.pterodactyl_server_identifier;
    const { ptero, assertPteroClientConfigured } = await import("@/lib/pterodactyl.server");
    assertPteroClientConfigured();
    const endpoint = `/api/client/servers/${identifier}/websocket`;
    const wsResponse = (await ptero.client(`/servers/${identifier}/websocket`)) as {
      data?: { token?: string; socket?: string };
      token?: string;
      socket?: string;
    };
    const token = wsResponse.data?.token ?? wsResponse.token ?? "";
    const socket = wsResponse.data?.socket ?? wsResponse.socket ?? "";
    if (!token || !socket) {
      throw new Error("Pterodactyl websocket response is missing token or socket.");
    }

    const socketUrl = new URL(socket);
    const origin = request.headers.get("origin");
    const dns = await lookup(socketUrl.hostname).catch((dnsError: Error) => {
      console.error("[WS Debug] DNS lookup failed", {
        socket,
        hostname: socketUrl.hostname,
        error: dnsError.message,
      });
      return null;
    });

    console.info("[WS Debug] starting websocket diagnostic", {
      endpoint,
      socket,
      origin,
      hostname: socketUrl.hostname,
      dns,
      requiredUpgradeHeaders: [
        "Upgrade",
        "Connection",
        "Sec-WebSocket-Key",
        "Sec-WebSocket-Version",
      ],
    });

    const result: WsCheckResult = {
      success: false,
      opened: false,
      closeCode: null,
      closeReason: null,
      handshakeError: null,
      url: socket,
      endpoint,
      origin,
      dns,
    };

    try {
      result.upgrade = await performUpgradeProbe(socket, origin);
      console.info("[WS Debug] upgrade probe result", {
        socket,
        statusCode: result.upgrade?.statusCode,
        statusMessage: result.upgrade?.statusMessage,
        headers: result.upgrade?.headers,
        received101: result.upgrade?.received101,
      });
    } catch (upgradeError) {
      result.handshakeError = (upgradeError as Error).message;
      console.error("[WS Debug] upgrade probe failed", {
        socket,
        error: (upgradeError as Error).message,
        cause: (upgradeError as Error & { code?: string }).code ?? null,
      });
    }

    const wsProbe = await performNodeWebSocketProbe(socket, token);
    result.websocket = wsProbe.result;
    result.opened = wsProbe.result.open;
    result.closeCode = wsProbe.closeCode;
    result.closeReason = wsProbe.closeReason;
    result.success = Boolean(result.upgrade?.received101 && wsProbe.result.authSuccess);
    result.handshakeError ??= wsProbe.result.error;

    console.info("[WS Debug] websocket probe result", {
      socket,
      opened: result.opened,
      closeCode: result.closeCode,
      closeReason: result.closeReason,
      websocket: result.websocket,
      failureLayer: classifyFailure(result),
    });

    return Response.json({ ...result, failureLayer: classifyFailure(result) });
  } catch (error) {
    console.error("[WS Debug] diagnostic failed", {
      orderId,
      error: (error as Error).message,
      stack: (error as Error).stack,
    });
    return Response.json(
      {
        success: false,
        opened: false,
        closeCode: null,
        closeReason: null,
        handshakeError: (error as Error).message,
      },
      { status: 500 },
    );
  }
}
