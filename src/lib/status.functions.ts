import { createServerFn } from "@tanstack/react-start";

export type ServiceState = "Operational" | "Degraded" | "Down" | "Unknown";

type StatusService = {
  name: string;
  status: ServiceState;
  detail: string;
};

function envState(required: string[]): ServiceState {
  const present = required.filter((key) => Boolean(process.env[key]));
  if (present.length === required.length) return "Operational";
  return present.length === 0 ? "Unknown" : "Degraded";
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string) {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms),
    ),
  ]);
}

export async function buildPlatformStatus() {
  const services: StatusService[] = [
    { name: "Site web", status: "Operational", detail: "Status page rendered" },
    { name: "API XNT", status: "Operational", detail: "Application health endpoint responding" },
  ];

  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("plans").select("id").limit(1);
    services.push({
      name: "Supabase",
      status: error ? "Degraded" : "Operational",
      detail: error?.message ?? "Database reachable",
    });
  } catch (error) {
    services.push({
      name: "Supabase",
      status: "Down",
      detail: error instanceof Error ? error.message : "Database unreachable",
    });
  }

  services.push({
    name: "Stripe",
    status: envState(["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"]),
    detail: "Server-side configuration check only, no Stripe API call",
  });

  let nodesCount: number | null = null;
  const pterodactylConfig = envState(["PTERODACTYL_PANEL_URL", "PTERODACTYL_APP_API_KEY"]);
  if (pterodactylConfig === "Operational") {
    try {
      const { ptero } = await import("@/lib/pterodactyl.server");
      const nodes = (await withTimeout(
        ptero.app("/nodes"),
        2500,
        "Server infrastructure check",
      )) as {
        data?: unknown[];
      };
      nodesCount = nodes.data?.length ?? 0;
      services.push({
        name: "Infrastructure serveurs",
        status: "Operational",
        detail: "Infrastructure serveur joignable",
      });
    } catch (error) {
      services.push({
        name: "Infrastructure serveurs",
        status: "Down",
        detail:
          error instanceof Error
            ? "Infrastructure serveur temporairement indisponible"
            : "Infrastructure serveur indisponible",
      });
    }
  } else {
    services.push({
      name: "Infrastructure serveurs",
      status: pterodactylConfig,
      detail: "Configuration serveur interne incomplète",
    });
  }

  services.push({
    name: "Réseau serveurs",
    status: nodesCount === null ? "Unknown" : nodesCount > 0 ? "Operational" : "Degraded",
    detail:
      nodesCount === null
        ? "État réseau indisponible car le check infrastructure n’a pas abouti"
        : nodesCount > 0
          ? `${nodesCount} zone(s) serveur disponibles`
          : "Aucune zone serveur retournée par l’infrastructure",
  });

  services.push({
    name: "Email Resend",
    status: envState(["RESEND_API_KEY", "EMAIL_FROM"]),
    detail: "Server-side configuration check only, no Resend API call",
  });

  return { services, checkedAt: new Date().toISOString() };
}

export async function handleHealthRequest() {
  const status = await buildPlatformStatus();
  return Response.json(status, {
    headers: {
      "cache-control": "no-store",
    },
  });
}

export const getPlatformStatus = createServerFn({ method: "GET" }).handler(async () => {
  return buildPlatformStatus();
});
