import { createServerFn } from "@tanstack/react-start";

type ServiceState = "Operational" | "Degraded" | "Down";

function envState(required: string[]): ServiceState {
  return required.every((key) => Boolean(process.env[key])) ? "Operational" : "Degraded";
}

export const getPlatformStatus = createServerFn({ method: "GET" }).handler(async () => {
  const services: Array<{ name: string; status: ServiceState; detail: string }> = [
    { name: "API", status: "Operational", detail: "Application server responding" },
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
    detail: "Server-side configuration check",
  });
  services.push({
    name: "Pterodactyl",
    status: envState(["PTERODACTYL_PANEL_URL", "PTERODACTYL_APP_API_KEY"]),
    detail: "Application API configuration check",
  });

  return { services, checkedAt: new Date().toISOString() };
});
