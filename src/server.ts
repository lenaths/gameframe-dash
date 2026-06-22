import "./lib/error-capture";
import { initServerMonitoring, reportServerError } from "./lib/monitoring.server";

initServerMonitoring();

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!body.includes('"unhandled":true') || !body.includes('"message":"HTTPError"')) {
    return response;
  }

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      const url = new URL(request.url);
      if (request.method === "POST" && url.pathname === "/api/stripe/webhook") {
        const { handleStripeWebhookRequest } = await import("@/lib/stripe-webhook.server");
        return handleStripeWebhookRequest(request);
      }
      if (request.method === "GET" && url.pathname === "/api/debug/ws-check") {
        const { handleWsCheckRequest } = await import("@/lib/ws-debug.server");
        return handleWsCheckRequest(request);
      }
      if (request.method === "GET" && url.pathname === "/api/debug/curseforge") {
        const { testCurseForgeConnection } = await import("@/lib/curseforge.server");
        return Response.json(await testCurseForgeConnection());
      }
      if (request.method === "GET" && url.pathname === "/api/health") {
        const { handleHealthRequest } = await import("@/lib/status.functions");
        return handleHealthRequest();
      }

      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return await normalizeCatastrophicSsrResponse(response);
    } catch (error) {
      console.error(error);
      reportServerError(error, { action: "server.fetch" });
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },
};
