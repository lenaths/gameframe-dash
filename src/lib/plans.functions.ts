import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export type PlanVariant = {
  nest_id: number;
  egg_id: number;
  label: string;
  docker_image?: string;
  startup?: string;
};

const TEMPLATE_DESCRIPTIONS: Record<string, string> = {
  vanilla: "Expérience officielle Minecraft, simple et stable.",
  paper: "Performance optimisée pour serveurs avec plugins.",
  forge: "Serveur prêt pour mods Forge.",
  fabric: "Serveur prêt pour mods Fabric.",
  purpur: "Performances avancées et réglages poussés.",
  spigot: "Compatibilité plugins classiques.",
};

export function getTemplateKey(label: string) {
  const normalized = label.toLowerCase();
  if (normalized.includes("paper")) return "paper";
  if (normalized.includes("forge")) return "forge";
  if (normalized.includes("fabric")) return "fabric";
  if (normalized.includes("purpur")) return "purpur";
  if (normalized.includes("spigot")) return "spigot";
  if (normalized.includes("vanilla")) return "vanilla";
  return normalized.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "template";
}

export function getTemplateDescription(label: string, fallback?: string | null) {
  return TEMPLATE_DESCRIPTIONS[getTemplateKey(label)] ?? fallback ?? "Template serveur compatible.";
}

export function findVersionVariable<
  T extends { env_variable: string; name?: string | null; description?: string | null },
>(variables: T[]) {
  return (
    variables.find((variable) =>
      /^(MINECRAFT_VERSION|SERVER_VERSION|VERSION|BUNGEE_VERSION|PAPER_VERSION|FABRIC_VERSION|FORGE_VERSION|PURPUR_VERSION|SPIGOT_VERSION)$/i.test(
        variable.env_variable,
      ),
    ) ??
    variables.find((variable) =>
      /minecraft.*version|version.*minecraft|server.*version/i.test(
        `${variable.name ?? ""} ${variable.description ?? ""} ${variable.env_variable}`,
      ),
    ) ??
    null
  );
}

export const listPlans = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("plans")
    .select(
      "id, slug, game, name, description, price_monthly_cents, ram_mb, cpu_percent, disk_mb, sort_order, allowed_eggs",
    )
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  if (error) throw new Error(error.message);
  return { plans: data ?? [] };
});

/** Returns the plan plus its templates enriched with server variables fetched live. */
export const getDeployOptions = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ planId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { getEggDetails, assertPteroAppConfigured } = await import("@/lib/pterodactyl.server");
    assertPteroAppConfigured();

    const { data: plan, error } = await supabaseAdmin
      .from("plans")
      .select("*")
      .eq("id", data.planId)
      .eq("is_active", true)
      .single();
    if (error || !plan) throw new Error("Plan not found.");

    const variantsRaw =
      Array.isArray(plan.allowed_eggs) && plan.allowed_eggs.length > 0
        ? (plan.allowed_eggs as unknown as PlanVariant[])
        : [
            {
              nest_id: plan.pterodactyl_nest_id,
              egg_id: plan.pterodactyl_egg_id,
              label: plan.name,
            } as PlanVariant,
          ];

    const variants = await Promise.all(
      variantsRaw.map(async (v, i) => {
        try {
          const egg = await getEggDetails(v.nest_id, v.egg_id);
          return {
            index: i,
            label: v.label || egg.name,
            templateKey: getTemplateKey(v.label || egg.name),
            templateDescription: getTemplateDescription(v.label || egg.name, egg.description),
            variables: egg.variables.filter((vv) => vv.user_viewable),
            error: null as string | null,
          };
        } catch (e) {
          const msg = (e as Error).message || "";
          const cause = ((e as Error).cause as Error | undefined)?.message || "";
          const combined = `${msg} ${cause}`.toLowerCase();
          const isNetwork =
            /fetch failed|enotfound|econnrefused|etimedout|econnreset|network|getaddrinfo/.test(
              combined,
            );
          const friendly = isNetwork
            ? "L’infrastructure serveur est temporairement inaccessible. Réessayez dans quelques instants."
            : /\b5\d\d\b/.test(msg)
              ? "L’infrastructure serveur est temporairement indisponible."
              : /\b404\b/.test(msg)
                ? "Template serveur indisponible. Contactez le support."
                : /\b401\b|\b403\b/.test(msg)
                  ? "Service serveur temporairement indisponible."
                  : msg;

          return {
            index: i,
            label: v.label || "Template serveur",
            templateKey: getTemplateKey(v.label || "Template serveur"),
            templateDescription: "",
            variables: [] as Awaited<ReturnType<typeof getEggDetails>>["variables"],
            error: friendly,
          };
        }
      }),
    );

    return {
      plan: {
        id: plan.id,
        slug: plan.slug,
        game: plan.game,
        name: plan.name,
        ram_mb: plan.ram_mb,
        cpu_percent: plan.cpu_percent,
        disk_mb: plan.disk_mb,
        price_monthly_cents: plan.price_monthly_cents,
      },
      variants,
    };
  });
