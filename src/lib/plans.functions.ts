import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  isMinecraftGame,
  isProxyTemplateLabel,
  getMinecraftVersionsForType,
  MINECRAFT_DYNAMIC_EGG_KEYS,
  MINECRAFT_NEST_ID,
  MINECRAFT_REQUIRED_EGG_IDS,
} from "@/lib/game-config";

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
  minecraftVersion?: string | null;
  minecraftVersions?: string[];
  loader?: string | null;
  versionEnvironment?: Record<string, string>;
};

type PlanRowForTemplates = {
  id: string;
  name: string;
  game?: string | null;
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
  neoforge: "Serveur prêt pour mods NeoForge.",
  quilt: "Serveur prêt pour mods Quilt.",
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

function getMinecraftTypeLabel(type: string) {
  return type === "neoforge" ? "NeoForge" : type.charAt(0).toUpperCase() + type.slice(1);
}

async function loadMinecraftNestVariants(): Promise<PlanVariant[]> {
  const { listNestEggs } = await import("@/lib/pterodactyl.server");
  const eggs = await listNestEggs(MINECRAFT_NEST_ID);
  const byId = new Map(eggs.map((egg) => [egg.id, egg]));
  const byKey = new Map(eggs.map((egg) => [getTemplateKey(egg.name), egg]));
  const entries: Array<{ key: string; eggId: number; eggName: string }> = [];

  for (const [key, eggId] of Object.entries(MINECRAFT_REQUIRED_EGG_IDS)) {
    const egg = byId.get(eggId);
    if (!egg || isProxyTemplateLabel(egg.name)) continue;
    entries.push({ key, eggId, eggName: egg.name });
  }

  for (const key of MINECRAFT_DYNAMIC_EGG_KEYS) {
    const egg = byKey.get(key);
    if (!egg || isProxyTemplateLabel(egg.name)) continue;
    entries.push({ key, eggId: egg.id, eggName: egg.name });
  }

  return entries.map((entry) => ({
    nest_id: MINECRAFT_NEST_ID,
    egg_id: entry.eggId,
    label: getMinecraftTypeLabel(entry.key),
    source: "allowed_eggs",
    versionLabel: null,
    minecraftVersion: null,
    environment: {},
  }));
}

export function findVersionVariable<
  T extends { env_variable: string; name?: string | null; description?: string | null },
>(variables: T[]) {
  return (
    variables.find((variable) =>
      /^(MINECRAFT_VERSION|MC_VERSION|VERSION|PAPER_VERSION|FABRIC_VERSION|FORGE_VERSION|PURPUR_VERSION|SPIGOT_VERSION|NEOFORGE_VERSION|QUILT_VERSION)$/i.test(
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

function extractMinecraftVersionsFromText(text: string) {
  const versions = new Set<string>();
  const matches = text.matchAll(/\b1\.(?:1[6-9]|2\d)(?:\.\d+)?\b/g);
  for (const match of matches) versions.add(match[0]);
  return [...versions];
}

function extractMinecraftVersions(input: {
  templateVersion?: string | null;
  minecraftVersion?: string | null;
  variables: Array<{
    env_variable: string;
    name?: string | null;
    description?: string | null;
    default_value?: string | null;
    rules?: string | null;
  }>;
}) {
  const versions = new Set<string>();
  const add = (value?: string | null) => {
    for (const version of extractMinecraftVersionsFromText(value ?? "")) versions.add(version);
  };

  add(input.minecraftVersion);
  add(input.templateVersion);
  for (const variable of input.variables) {
    if (
      /^(MINECRAFT_VERSION|MC_VERSION|VERSION|PAPER_VERSION|PURPUR_VERSION|FORGE_VERSION|FABRIC_VERSION|NEOFORGE_VERSION|QUILT_VERSION)$/i.test(
        variable.env_variable,
      )
    ) {
      add(variable.default_value);
      add(variable.rules);
      add(variable.description);
      add(variable.name);
    }
  }
  return [...versions].sort(compareMinecraftVersionDesc);
}

function compareMinecraftVersionDesc(a: string, b: string) {
  const parse = (value: string) => value.split(".").map((part) => Number(part));
  const aa = parse(a);
  const bb = parse(b);
  for (let i = 0; i < Math.max(aa.length, bb.length); i += 1) {
    const diff = (bb[i] ?? 0) - (aa[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
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
    return (plan.allowed_eggs as PlanVariant[])
      .filter((variant) => !isProxyTemplateLabel(variant.label))
      .map((variant) => ({
        ...variant,
        source: "allowed_eggs",
      }));
  }

  if (
    isMinecraftGame(plan.game) &&
    plan.pterodactyl_nest_id === MINECRAFT_NEST_ID &&
    plan.pterodactyl_egg_id === 1
  ) {
    return [];
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

  if (isMinecraftGame(plan.game)) {
    try {
      const variants = await loadMinecraftNestVariants();
      if (variants.length > 0) return variants;
    } catch (error) {
      console.warn(
        `[MinecraftEggMap] Falling back to catalog/plan variants: ${(error as Error).message}`,
      );
    }
  }

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
        if (isProxyTemplateLabel(template.name)) return [];

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
          minecraftVersion: version.minecraft_version ?? null,
          loader: version.loader ?? null,
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
          const templateKey = getTemplateKey(v.label || egg.name);
          console.info(
            `[MinecraftEggAudit] Nest ID: ${v.nest_id}; Egg ID: ${v.egg_id}; Egg Name: ${egg.name}; Type: ${templateKey}`,
          );
          const variables = egg.variables.filter((vv) => vv.user_viewable);
          const minecraftVersions = extractMinecraftVersions({
            templateVersion: v.versionLabel,
            minecraftVersion: v.minecraftVersion,
            variables,
          });
          const xntVersions = getMinecraftVersionsForType(templateKey);
          return {
            index: i,
            label: v.label || egg.name,
            versionLabel: v.versionLabel ?? null,
            minecraftVersion: v.minecraftVersion ?? null,
            minecraftVersions: xntVersions.length > 0 ? xntVersions : minecraftVersions,
            loader: v.loader ?? null,
            nestId: v.nest_id,
            eggId: v.egg_id,
            templateId: v.templateId ?? null,
            templateKey,
            templateDescription: getTemplateDescription(v.label || egg.name, egg.description),
            variables,
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
            minecraftVersion: v.minecraftVersion ?? null,
            minecraftVersions: v.minecraftVersions ?? [],
            loader: v.loader ?? null,
            nestId: v.nest_id,
            eggId: v.egg_id,
            templateId: v.templateId ?? null,
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
