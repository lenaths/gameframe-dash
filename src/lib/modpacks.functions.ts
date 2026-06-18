import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type SupabaseAny = {
  from: (table: string) => SupabaseQuery;
};

type SupabaseResult<T = unknown> = {
  data: T | null;
  error: { message: string; code?: string } | null;
};

type SupabaseQuery<T = unknown> = PromiseLike<SupabaseResult<T>> & {
  select: (columns: string) => SupabaseQuery<T>;
  eq: (column: string, value: unknown) => SupabaseQuery<T>;
  in: (column: string, values: unknown[]) => SupabaseQuery<T>;
  order: (column: string, options?: Record<string, unknown>) => SupabaseQuery<T>;
  limit: (count: number) => SupabaseQuery<T>;
  maybeSingle: () => SupabaseQuery<T>;
};

type ModpackRow = {
  id: string;
  curseforge_mod_id: number;
  slug: string | null;
  name: string;
  summary: string | null;
  logo_url: string | null;
  website_url: string | null;
  download_count: number | null;
  is_featured: boolean;
  game_catalog?: { name?: string | null; slug?: string | null } | null;
};

type PublicModpackCatalogRow = ModpackRow & {
  primary_loader: string | null;
  primary_minecraft_version: string | null;
  has_server_pack: boolean;
  active_versions_count: number;
};

type VersionRow = {
  id: string;
  modpack_id: string;
  curseforge_file_id: number;
  display_name: string;
  file_name: string | null;
  minecraft_versions: string[];
  loaders: string[];
  server_pack_file_id: number | null;
  is_server_pack: boolean;
  file_date: string | null;
  file_length: number | null;
};

type MappingRow = {
  id: string;
  modpack_id: string;
  template_id: string;
  loader: string | null;
  minecraft_version: string | null;
  priority: number;
};

type PlanCompatibilityRow = {
  plan_id: string;
  min_ram_mb: number | null;
  recommended_ram_mb: number | null;
};

type TemplateCompatibilityRow = {
  plan_id: string;
  template_id: string;
  recommended_ram_mb: number | null;
};

type PlanRow = {
  id: string;
  slug: string;
  game: string;
  name: string;
  description: string | null;
  price_monthly_cents: number;
  ram_mb: number;
  cpu_percent: number;
  disk_mb: number;
  sort_order: number | null;
  allowed_eggs?: unknown;
  pterodactyl_nest_id: number;
  pterodactyl_egg_id: number;
  docker_image?: string | null;
  startup?: string | null;
  environment?: unknown;
};

type CompatiblePlan = {
  plan: {
    id: string;
    slug: string;
    game: string;
    name: string;
    description: string | null;
    price_monthly_cents: number;
    ram_mb: number;
    cpu_percent: number;
    disk_mb: number;
  };
  variantIndex: number;
  templateLabel: string;
  templateVersion: string | null;
  loader: string | null;
  minecraftVersion: string | null;
  recommendedRamMb: number | null;
};

const modpackIdInput = z.object({ modpackId: z.string().uuid() });
const publicModpackInput = z.object({ idOrSlug: z.string().min(1).max(160) });

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function normalizeLowerSet(values: string[]) {
  return new Set(values.map((value) => value.toLowerCase()).filter(Boolean));
}

function mappingMatchesVersion(mapping: MappingRow, version: VersionRow) {
  const versionLoaders = normalizeLowerSet(version.loaders ?? []);
  const versionMinecraft = normalizeLowerSet(version.minecraft_versions ?? []);
  const loaderMatches = !mapping.loader || versionLoaders.has(mapping.loader.toLowerCase());
  const versionMatches =
    !mapping.minecraft_version || versionMinecraft.has(mapping.minecraft_version.toLowerCase());
  return loaderMatches && versionMatches;
}

function sanitizeVersion(version: VersionRow) {
  return {
    id: version.id,
    curseforge_file_id: version.curseforge_file_id,
    display_name: version.display_name,
    file_name: version.file_name,
    minecraft_versions: version.minecraft_versions ?? [],
    loaders: version.loaders ?? [],
    server_pack_file_id: version.server_pack_file_id,
    is_server_pack: version.is_server_pack,
    file_date: version.file_date,
    file_length: version.file_length,
  };
}

function primaryFromVersions(versions: VersionRow[]) {
  const loaders = versions.flatMap((version) => version.loaders ?? []).filter(Boolean);
  const minecraftVersions = versions
    .flatMap((version) => version.minecraft_versions ?? [])
    .filter(Boolean);
  return {
    primary_loader: loaders[0] ?? null,
    primary_minecraft_version: minecraftVersions[0] ?? null,
    has_server_pack: versions.some(
      (version) => version.is_server_pack || version.server_pack_file_id,
    ),
    active_versions_count: versions.length,
  };
}

async function loadPublicModpackCatalog(db: SupabaseAny, limit = 200) {
  const { data, error } = await db
    .from("curseforge_modpacks")
    .select(
      "id, curseforge_mod_id, slug, name, summary, logo_url, website_url, download_count, is_featured, created_at, game_catalog(name, slug)",
    )
    .eq("is_active", true)
    .order("is_featured", { ascending: false })
    .order("download_count", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);

  const rows = asArray<ModpackRow & { created_at?: string | null }>(data);
  if (rows.length === 0) return [];
  const ids = rows.map((row) => row.id);
  const [
    { data: versionsData, error: versionsError },
    { data: mappingsData, error: mappingsError },
  ] = await Promise.all([
    db
      .from("curseforge_modpack_versions")
      .select(
        "id, modpack_id, curseforge_file_id, display_name, file_name, minecraft_versions, loaders, server_pack_file_id, is_server_pack, file_date, file_length",
      )
      .in("modpack_id", ids)
      .eq("is_active", true)
      .order("file_date", { ascending: false }),
    db
      .from("curseforge_template_mappings")
      .select("id, modpack_id, template_id, loader, minecraft_version, priority")
      .in("modpack_id", ids)
      .eq("is_active", true),
  ]);
  if (versionsError) throw new Error(versionsError.message);
  if (mappingsError) throw new Error(mappingsError.message);

  const versionsByModpack = new Map<string, VersionRow[]>();
  for (const version of asArray<VersionRow>(versionsData)) {
    const current = versionsByModpack.get(version.modpack_id) ?? [];
    current.push(version);
    versionsByModpack.set(version.modpack_id, current);
  }
  const mappedIds = new Set(asArray<MappingRow>(mappingsData).map((mapping) => mapping.modpack_id));

  return rows
    .filter((row) => mappedIds.has(row.id) && (versionsByModpack.get(row.id)?.length ?? 0) > 0)
    .map((row) => ({
      ...row,
      ...primaryFromVersions(versionsByModpack.get(row.id) ?? []),
    })) as PublicModpackCatalogRow[];
}

async function loadDb() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as SupabaseAny;
}

async function loadActiveMappings(db: SupabaseAny, modpackId: string) {
  const { data, error } = await db
    .from("curseforge_template_mappings")
    .select("id, modpack_id, template_id, loader, minecraft_version, priority")
    .eq("modpack_id", modpackId)
    .eq("is_active", true)
    .order("priority", { ascending: false });
  if (error) throw new Error(error.message);
  return asArray<MappingRow>(data);
}

async function loadCompatiblePlansForModpack(db: SupabaseAny, modpackId: string) {
  const mappings = await loadActiveMappings(db, modpackId);
  if (mappings.length === 0) return [];

  const templateIds = [...new Set(mappings.map((mapping) => mapping.template_id))];
  const [
    { data: explicitRows, error: explicitError },
    { data: templateRows, error: templateError },
  ] = await Promise.all([
    db
      .from("curseforge_plan_compatibilities")
      .select("plan_id, min_ram_mb, recommended_ram_mb")
      .eq("modpack_id", modpackId)
      .eq("is_active", true),
    db
      .from("plan_template_compatibilities")
      .select("plan_id, template_id, recommended_ram_mb")
      .in("template_id", templateIds)
      .eq("is_active", true),
  ]);

  if (explicitError) throw new Error(explicitError.message);
  if (templateError) throw new Error(templateError.message);

  const explicit = asArray<PlanCompatibilityRow>(explicitRows);
  const templateCompatibilities = asArray<TemplateCompatibilityRow>(templateRows);
  const allowedPlanIds =
    explicit.length > 0
      ? new Set(explicit.map((row) => row.plan_id))
      : new Set(templateCompatibilities.map((row) => row.plan_id));
  if (allowedPlanIds.size === 0) return [];

  const { data: plansData, error: plansError } = await db
    .from("plans")
    .select(
      "id, slug, game, name, description, price_monthly_cents, ram_mb, cpu_percent, disk_mb, sort_order, allowed_eggs, pterodactyl_nest_id, pterodactyl_egg_id, docker_image, startup, environment",
    )
    .in("id", [...allowedPlanIds])
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  if (plansError) throw new Error(plansError.message);

  const { loadPlanTemplateVariants } = await import("@/lib/plans.functions");
  const explicitByPlan = new Map(explicit.map((row) => [row.plan_id, row]));
  const templateCompatibilityByPlan = new Map<string, TemplateCompatibilityRow>();
  for (const row of templateCompatibilities) {
    if (!templateCompatibilityByPlan.has(row.plan_id))
      templateCompatibilityByPlan.set(row.plan_id, row);
  }

  const compatible: CompatiblePlan[] = [];
  for (const plan of asArray<PlanRow>(plansData)) {
    const variants = await loadPlanTemplateVariants(plan);
    const match = variants.findIndex(
      (variant) => variant.templateId && templateIds.includes(variant.templateId),
    );
    if (match < 0) continue;
    const variant = variants[match];
    const mapping = mappings.find((item) => item.template_id === variant.templateId) ?? mappings[0];
    const explicitRow = explicitByPlan.get(plan.id);
    const templateRow = templateCompatibilityByPlan.get(plan.id);
    compatible.push({
      plan: {
        id: plan.id,
        slug: plan.slug,
        game: plan.game,
        name: plan.name,
        description: plan.description,
        price_monthly_cents: plan.price_monthly_cents,
        ram_mb: plan.ram_mb,
        cpu_percent: plan.cpu_percent,
        disk_mb: plan.disk_mb,
      },
      variantIndex: match,
      templateLabel: variant.label,
      templateVersion: variant.versionLabel ?? null,
      loader: mapping?.loader ?? null,
      minecraftVersion: mapping?.minecraft_version ?? null,
      recommendedRamMb:
        explicitRow?.recommended_ram_mb ?? templateRow?.recommended_ram_mb ?? plan.ram_mb ?? null,
    });
  }

  return compatible;
}

export async function resolveSelectedModpackForCheckout(input: {
  modpackId: string;
  versionId: string;
  planId: string;
}) {
  const db = await loadDb();
  const [{ data: modpack, error: modpackError }, { data: version, error: versionError }] =
    await Promise.all([
      db
        .from("curseforge_modpacks")
        .select("id, curseforge_mod_id, name, is_active")
        .eq("id", input.modpackId)
        .eq("is_active", true)
        .maybeSingle(),
      db
        .from("curseforge_modpack_versions")
        .select(
          "id, modpack_id, curseforge_file_id, display_name, minecraft_versions, loaders, is_active",
        )
        .eq("id", input.versionId)
        .eq("modpack_id", input.modpackId)
        .eq("is_active", true)
        .maybeSingle(),
    ]);
  if (modpackError) throw new Error(modpackError.message);
  if (versionError) throw new Error(versionError.message);
  const modpackRow = modpack as {
    id: string;
    curseforge_mod_id: number;
    name: string;
    is_active: boolean;
  } | null;
  const versionRow = version as VersionRow | null;
  if (!modpackRow || !versionRow) {
    throw new Error("Modpack ou version indisponible.");
  }

  const compatiblePlans = await loadCompatiblePlansForModpack(db, input.modpackId);
  const planMatch = compatiblePlans.find((item) => item.plan.id === input.planId);
  if (!planMatch) {
    throw new Error("Installation modpack bientôt disponible pour ce plan.");
  }

  const mappings = await loadActiveMappings(db, input.modpackId);
  const matchingMappings = mappings.filter((mapping) => mappingMatchesVersion(mapping, versionRow));
  if (matchingMappings.length === 0) {
    throw new Error("Installation modpack bientôt disponible pour cette version.");
  }

  return {
    variantIndex: planMatch.variantIndex,
    template: {
      label: planMatch.templateLabel,
      version: planMatch.templateVersion,
      loader: planMatch.loader,
      minecraft_version: planMatch.minecraftVersion,
    },
    modpack: {
      id: modpackRow.id,
      name: modpackRow.name,
      curseforge_mod_id: modpackRow.curseforge_mod_id,
    },
    version: {
      id: versionRow.id,
      curseforge_file_id: versionRow.curseforge_file_id,
      display_name: versionRow.display_name,
      minecraft_versions: versionRow.minecraft_versions ?? [],
      loaders: versionRow.loaders ?? [],
    },
  };
}

export const listAvailableModpacks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const db = await loadDb();
    const { data, error } = await db
      .from("curseforge_modpacks")
      .select(
        "id, curseforge_mod_id, slug, name, summary, logo_url, website_url, download_count, is_featured, game_catalog(name, slug)",
      )
      .eq("is_active", true)
      .order("is_featured", { ascending: false })
      .order("download_count", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return { modpacks: asArray<ModpackRow>(data) };
  });

export const listPublicModpackCatalog = createServerFn({ method: "GET" }).handler(async () => {
  const db = await loadDb();
  return { modpacks: await loadPublicModpackCatalog(db) };
});

export const getFeaturedModpacks = createServerFn({ method: "GET" }).handler(async () => {
  const db = await loadDb();
  const modpacks = await loadPublicModpackCatalog(db, 100);
  return { modpacks: modpacks.filter((modpack) => modpack.is_featured).slice(0, 8) };
});

export const getPopularModpacks = createServerFn({ method: "GET" }).handler(async () => {
  const db = await loadDb();
  const modpacks = await loadPublicModpackCatalog(db, 100);
  return {
    modpacks: [...modpacks]
      .sort((a, b) => (b.download_count ?? 0) - (a.download_count ?? 0))
      .slice(0, 12),
  };
});

export const getPublicModpack = createServerFn({ method: "POST" })
  .validator((d: unknown) => publicModpackInput.parse(d))
  .handler(async ({ data }) => {
    const db = await loadDb();
    const catalog = await loadPublicModpackCatalog(db, 300);
    const modpack =
      catalog.find((item) => item.slug === data.idOrSlug) ??
      catalog.find((item) => item.id === data.idOrSlug);
    if (!modpack) return { modpack: null, versions: [], plans: [], mappings: [] };

    const [
      { data: versionsData, error: versionsError },
      { data: mappingsData, error: mappingsError },
    ] = await Promise.all([
      db
        .from("curseforge_modpack_versions")
        .select(
          "id, modpack_id, curseforge_file_id, display_name, file_name, minecraft_versions, loaders, server_pack_file_id, is_server_pack, file_date, file_length",
        )
        .eq("modpack_id", modpack.id)
        .eq("is_active", true)
        .order("file_date", { ascending: false })
        .limit(100),
      db
        .from("curseforge_template_mappings")
        .select("id, modpack_id, template_id, loader, minecraft_version, priority")
        .eq("modpack_id", modpack.id)
        .eq("is_active", true)
        .order("priority", { ascending: false }),
    ]);
    if (versionsError) throw new Error(versionsError.message);
    if (mappingsError) throw new Error(mappingsError.message);

    return {
      modpack,
      versions: asArray<VersionRow>(versionsData).map(sanitizeVersion),
      plans: await loadCompatiblePlansForModpack(db, modpack.id),
      mappings: asArray<MappingRow>(mappingsData),
    };
  });

export const getRelatedModpacks = createServerFn({ method: "POST" })
  .validator((d: unknown) => publicModpackInput.parse(d))
  .handler(async ({ data }) => {
    const db = await loadDb();
    const catalog = await loadPublicModpackCatalog(db, 300);
    const current =
      catalog.find((item) => item.slug === data.idOrSlug) ??
      catalog.find((item) => item.id === data.idOrSlug);
    if (!current) return { modpacks: [] };
    const related = catalog
      .filter((item) => item.id !== current.id)
      .filter(
        (item) =>
          item.primary_loader === current.primary_loader ||
          item.primary_minecraft_version === current.primary_minecraft_version ||
          item.game_catalog?.slug === current.game_catalog?.slug,
      )
      .slice(0, 6);
    return { modpacks: related };
  });

export const listAvailableModpackVersions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => modpackIdInput.parse(d))
  .handler(async ({ data }) => {
    const db = await loadDb();
    const { data: rows, error } = await db
      .from("curseforge_modpack_versions")
      .select(
        "id, modpack_id, curseforge_file_id, display_name, file_name, minecraft_versions, loaders, server_pack_file_id, is_server_pack, file_date, file_length",
      )
      .eq("modpack_id", data.modpackId)
      .eq("is_active", true)
      .order("file_date", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return { versions: asArray<VersionRow>(rows).map(sanitizeVersion) };
  });

export const listCompatiblePlansForModpack = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => modpackIdInput.parse(d))
  .handler(async ({ data }) => {
    const db = await loadDb();
    const { data: modpack, error } = await db
      .from("curseforge_modpacks")
      .select("id")
      .eq("id", data.modpackId)
      .eq("is_active", true)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!modpack) return { plans: [] };
    return { plans: await loadCompatiblePlansForModpack(db, data.modpackId) };
  });
