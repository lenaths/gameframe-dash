import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export type PlanVariant = {
  nest_id: number;
  egg_id: number;
  label: string;
  templateId?: string | null;
  docker_image?: string;
  startup?: string;
  environment?: Record<string, string>;
  source?: "catalog" | "allowed_eggs";
  versionLabel?: string | null;
  versionEnvironment?: Record<string, string>;
};

type PlanRowForTemplates = {
  id: string;
  name: string;
  pterodactyl_nest_id: number;
  pterodactyl_egg_id: number;
  docker_image?: string | null;
  startup?: string | null;
  environment?: unknown;
  allowed_eggs?: unknown;
};

type SupabaseAny = {
  from: (table: string) => {
    select: (columns: string) => SupabaseAnyQuery;
  };
};

type SupabaseAnyQuery = PromiseLike<{
  data: unknown[] | null;
  error: { message: string } | null;
}> & {
  eq: (column: string, value: unknown) => SupabaseAnyQuery;
  order: (column: string, options?: Record<string, unknown>) => SupabaseAnyQuery;
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
  if (normalized.includes("neoforge")) return "neoforge";
  if (normalized.includes("forge")) return "forge";
  if (normalized.includes("fabric")) return "fabric";
  if (normalized.includes("quilt")) return "quilt";
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

function normalizeEnvironment(input: unknown) {
  const env: Record<string, string> = {};
  if (!input || typeof input !== "object") return env;
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (!key.trim()) continue;
    if (value == null) env[key] = "";
    else if (typeof value === "string") env[key] = value;
    else if (typeof value === "number" || typeof value === "boolean") env[key] = String(value);
  }
  return env;
}

function fallbackPlanVariants(plan: PlanRowForTemplates): PlanVariant[] {
  if (Array.isArray(plan.allowed_eggs) && plan.allowed_eggs.length > 0) {
    return (plan.allowed_eggs as PlanVariant[]).map((variant) => ({
      ...variant,
      source: "allowed_eggs",
    }));
  }

  return [
    {
      nest_id: plan.pterodactyl_nest_id,
      egg_id: plan.pterodactyl_egg_id,
      label: plan.name,
      docker_image: plan.docker_image ?? undefined,
      startup: plan.startup ?? undefined,
      environment: normalizeEnvironment(plan.environment),
      source: "allowed_eggs",
    },
  ];
}

export async function loadPlanTemplateVariants(plan: PlanRowForTemplates): Promise<PlanVariant[]> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as unknown as SupabaseAny;

  try {
    const { data, error } = await db
      .from("plan_template_compatibilities")
      .select(
        "sort_order, server_templates(id, name, description, internal_nest_id, internal_egg_id, docker_image, startup, environment, is_active, server_template_versions(id, label, minecraft_version, loader, loader_version, java_version, environment_overrides, is_active, sort_order))",
      )
      .eq("plan_id", plan.id)
      .eq("is_active", true)
      .order("sort_order", { ascending: true });

    if (error) {
      const missingCatalog =
        error.message.includes("plan_template_compatibilities") ||
        error.message.includes("server_templates");
      if (!missingCatalog) {
        console.warn(`[GameCatalog] Falling back to plan variants: ${error.message}`);
      }
      return fallbackPlanVariants(plan);
    }

    const catalogVariants: PlanVariant[] = ((data ?? []) as Array<Record<string, unknown>>)
      .flatMap((compatibility) => {
        const template = compatibility.server_templates as
          | {
              id?: string | null;
              name?: string | null;
              description?: string | null;
              internal_nest_id?: number | null;
              internal_egg_id?: number | null;
              docker_image?: string | null;
              startup?: string | null;
              environment?: unknown;
              is_active?: boolean | null;
              server_template_versions?: Array<{
                label?: string | null;
                minecraft_version?: string | null;
                loader?: string | null;
                loader_version?: string | null;
                java_version?: string | null;
                environment_overrides?: unknown;
                is_active?: boolean | null;
                sort_order?: number | null;
              }>;
            }
          | null
          | undefined;
        if (!template?.is_active || !template.internal_nest_id || !template.internal_egg_id) {
          return [];
        }

        const versions = (template.server_template_versions ?? [])
          .filter((version) => version.is_active !== false)
          .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
        const base = {
          nest_id: template.internal_nest_id,
          egg_id: template.internal_egg_id,
          label: template.name || "Template serveur",
          templateId: template.id ?? null,
          docker_image: template.docker_image ?? undefined,
          startup: template.startup ?? undefined,
          environment: normalizeEnvironment(template.environment),
          source: "catalog" as const,
        } satisfies PlanVariant;

        if (versions.length === 0) return [base];
        return versions.map((version) => ({
          ...base,
          label: template.name || "Template serveur",
          versionLabel: version.label ?? version.minecraft_version ?? null,
          versionEnvironment: normalizeEnvironment(version.environment_overrides),
        }));
      })
      .filter((variant) => Boolean(variant.nest_id && variant.egg_id));

    return catalogVariants.length > 0 ? catalogVariants : fallbackPlanVariants(plan);
  } catch (error) {
    console.warn(`[GameCatalog] Falling back to allowed_eggs: ${(error as Error).message}`);
    return fallbackPlanVariants(plan);
  }
}

export const listPlans = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("plans")
    .select(
      "id, slug, game, name, description, price_monthly_cents, ram_mb, cpu_percent, disk_mb, sort_order, allowed_eggs, pterodactyl_nest_id, pterodactyl_egg_id, docker_image, startup, environment",
    )
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  if (error) throw new Error(error.message);
  const plans = await Promise.all(
    (data ?? []).map(async (plan) => {
      const variants = await loadPlanTemplateVariants(plan as PlanRowForTemplates);
      return {
        id: plan.id,
        slug: plan.slug,
        game: plan.game,
        name: plan.name,
        description: plan.description,
        price_monthly_cents: plan.price_monthly_cents,
        ram_mb: plan.ram_mb,
        cpu_percent: plan.cpu_percent,
        disk_mb: plan.disk_mb,
        sort_order: plan.sort_order,
        allowed_eggs: variants.map((variant) => ({
          label: variant.versionLabel ? `${variant.label} ${variant.versionLabel}` : variant.label,
        })),
      };
    }),
  );
  return { plans };
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

    const variantsRaw = await loadPlanTemplateVariants(plan as PlanRowForTemplates);

    const variants = await Promise.all(
      variantsRaw.map(async (v, i) => {
        try {
          const egg = await getEggDetails(v.nest_id, v.egg_id);
          return {
            index: i,
            label: v.label || egg.name,
            versionLabel: v.versionLabel ?? null,
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
            versionLabel: v.versionLabel ?? null,
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
