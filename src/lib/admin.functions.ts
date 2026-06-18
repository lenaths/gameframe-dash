import { createServerFn } from "@tanstack/react-start";
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
  insert: (values: unknown) => SupabaseQuery<T>;
  upsert: (values: unknown, options?: Record<string, unknown>) => SupabaseQuery<T>;
  update: (values: unknown) => SupabaseQuery<T>;
  single: () => SupabaseQuery<T>;
  maybeSingle: () => SupabaseQuery<T>;
};

type ProfileRef = { id: string; email: string | null };
type PlanRef = { name?: string | null; game?: string | null } | null;
type OrderRow = {
  id: string;
  user_id: string | null;
  plan_id: string | null;
  status: string;
  total_cents: number;
  currency: string;
  stripe_subscription_id: string | null;
  stripe_checkout_session_id: string | null;
  selected_template_label?: string | null;
  selected_modpack_label?: string | null;
  minecraft_settings?: MinecraftSettings | null;
  created_at: string;
  plans?: PlanRef;
};
type ServerLinkRow = {
  id: string;
  order_id: string | null;
  status: string;
  error_message: string | null;
  pterodactyl_server_id: number | null;
  pterodactyl_server_identifier: string | null;
  selected_template_label?: string | null;
  selected_modpack_label?: string | null;
  minecraft_settings?: MinecraftSettings | null;
};
type ServerDetailRow = ServerLinkRow & {
  user_id: string | null;
  plan_id: string | null;
  server_name: string;
  created_at: string;
  plans?: PlanRef;
};
type MinecraftSettings = {
  server_type: string | null;
  minecraft_version: string | null;
  max_players: number | null;
  max_players_applied: boolean;
  extra_price_cents: number | null;
  total_price_cents: number | null;
};

function selectedTemplateLabel(metadata: unknown) {
  const root =
    metadata && typeof metadata === "object" ? (metadata as Record<string, unknown>) : {};
  const selectedTemplate =
    root.selected_template && typeof root.selected_template === "object"
      ? (root.selected_template as Record<string, unknown>)
      : null;
  return typeof selectedTemplate?.label === "string" && selectedTemplate.label.trim()
    ? selectedTemplate.label
    : null;
}

function selectedModpackLabel(metadata: unknown) {
  const root =
    metadata && typeof metadata === "object" ? (metadata as Record<string, unknown>) : {};
  const selectedModpack =
    root.selected_modpack && typeof root.selected_modpack === "object"
      ? (root.selected_modpack as Record<string, unknown>)
      : null;
  return typeof selectedModpack?.name === "string" && selectedModpack.name.trim()
    ? selectedModpack.name
    : null;
}

function selectedMinecraftSettings(metadata: unknown): MinecraftSettings | null {
  const root =
    metadata && typeof metadata === "object" ? (metadata as Record<string, unknown>) : {};
  const settings =
    root.minecraft_settings && typeof root.minecraft_settings === "object"
      ? (root.minecraft_settings as Record<string, unknown>)
      : root;
  const rawMax = settings.max_players ?? root.max_players;
  const maxPlayers =
    typeof rawMax === "number"
      ? rawMax
      : typeof rawMax === "string" && rawMax.trim()
        ? Number(rawMax)
        : null;
  return {
    server_type:
      typeof settings.server_type === "string"
        ? settings.server_type
        : selectedTemplateLabel(metadata),
    minecraft_version:
      typeof settings.minecraft_version === "string" ? settings.minecraft_version : null,
    max_players: Number.isFinite(maxPlayers) ? Math.round(Number(maxPlayers)) : null,
    max_players_applied: settings.max_players_applied === true,
    extra_price_cents:
      root.player_pricing &&
      typeof root.player_pricing === "object" &&
      typeof (root.player_pricing as Record<string, unknown>).extra_price_cents === "number"
        ? ((root.player_pricing as Record<string, unknown>).extra_price_cents as number)
        : null,
    total_price_cents:
      root.player_pricing &&
      typeof root.player_pricing === "object" &&
      typeof (root.player_pricing as Record<string, unknown>).total_price_cents === "number"
        ? ((root.player_pricing as Record<string, unknown>).total_price_cents as number)
        : null,
  };
}
type PaymentDetailRow = {
  id: string;
  user_id: string | null;
  order_id: string | null;
  provider: string;
  provider_payment_id: string | null;
  status: string;
  currency: string;
  amount_cents: number;
  stripe_payment_intent_id: string | null;
  stripe_charge_id: string | null;
  stripe_invoice_id: string | null;
  created_at: string;
};
type InvoiceDetailRow = {
  id: string;
  user_id: string | null;
  order_id: string | null;
  payment_id: string | null;
  invoice_number: string;
  status: string;
  currency: string;
  total_cents: number;
  stripe_invoice_id: string | null;
  stripe_hosted_invoice_url: string | null;
  stripe_invoice_pdf: string | null;
  created_at: string;
};
type ActivityLogRow = {
  id: string;
  user_id: string;
  order_id: string | null;
  server_order_id: string | null;
  action: string;
  description: string | null;
  created_at: string;
};
type InvoiceRow = {
  id: string;
  user_id: string;
  invoice_number: string;
  status: string;
  total_cents: number;
  currency: string;
  created_at: string;
};
type AdminCatalogGame = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  icon_url: string | null;
  is_active: boolean;
  sort_order: number;
};
type AdminTemplateModpackInstallConfig = {
  enabled?: boolean;
  command_template?: string;
  max_file_size_mb?: number | null;
  requires_server_pack?: boolean;
  supported_loaders?: string[];
  notes?: string;
};
type AdminTemplateMetadata = {
  modpack_install?: AdminTemplateModpackInstallConfig | null;
};
type AdminCatalogTemplate = {
  id: string;
  game_id: string;
  slug: string;
  name: string;
  description: string | null;
  provider: string;
  internal_nest_id: number;
  internal_egg_id: number;
  docker_image: string | null;
  startup: string | null;
  metadata: AdminTemplateMetadata | null;
  is_active: boolean;
  sort_order: number;
};
type AdminCatalogVersion = {
  id: string;
  template_id: string;
  label: string;
  minecraft_version: string | null;
  loader: string | null;
  loader_version: string | null;
  java_version: string | null;
  is_active: boolean;
  sort_order: number;
};
type AdminCatalogCompatibility = {
  id: string;
  plan_id: string;
  template_id: string;
  min_ram_mb: number | null;
  recommended_ram_mb: number | null;
  is_active: boolean;
  sort_order: number;
  plans?: { name?: string | null; game?: string | null } | null;
};
type AdminCurseForgeModpack = {
  id: string;
  curseforge_mod_id: number;
  game_id: string | null;
  slug: string | null;
  name: string;
  summary: string | null;
  logo_url: string | null;
  website_url: string | null;
  download_count: number | null;
  class_id: number | null;
  primary_category_id: number | null;
  is_active: boolean;
  is_featured: boolean;
  last_synced_at: string | null;
  created_at: string;
  game_catalog?: { name?: string | null; slug?: string | null } | null;
};
type AdminCurseForgeVersion = {
  id: string;
  modpack_id: string;
  curseforge_file_id: number;
  display_name: string;
  file_name: string | null;
  release_type: number | null;
  file_status: number | null;
  minecraft_versions: string[];
  loaders: string[];
  server_pack_file_id: number | null;
  is_server_pack: boolean;
  file_date: string | null;
  file_length: number | null;
  download_url_cached: boolean;
  is_active: boolean;
  last_synced_at: string | null;
  created_at: string;
};
type AdminCurseForgeMapping = {
  id: string;
  modpack_id: string;
  template_id: string;
  loader: string | null;
  minecraft_version: string | null;
  is_active: boolean;
  priority: number;
  created_at: string;
  curseforge_modpacks?: { name?: string | null } | null;
  server_templates?: { name?: string | null } | null;
};
type AdminCurseForgePlanCompatibility = {
  id: string;
  modpack_id: string;
  plan_id: string;
  min_ram_mb: number | null;
  recommended_ram_mb: number | null;
  is_active: boolean;
  created_at: string;
  curseforge_modpacks?: { name?: string | null } | null;
  plans?: { name?: string | null; game?: string | null } | null;
};
type CurseForgeSearchResult = {
  curseforge_mod_id: number;
  slug: string | null;
  name: string;
  summary: string | null;
  logo_url: string | null;
  website_url: string | null;
  download_count: number | null;
  class_id: number | null;
  primary_category_id: number | null;
};
type ReconciliationAnomaly = {
  id: string;
  type: string;
  area: "stripe" | "pterodactyl" | "notifications";
  severity: "critical" | "important" | "info";
  status: string;
  date: string;
  message: string;
  recommendation: string;
  repairAction:
    | "retry_provisioning"
    | "sync_server"
    | "reprocess_stripe_event"
    | "regenerate_notification"
    | "none";
  orderId?: string | null;
  serverOrderId?: string | null;
  stripeEventId?: string | null;
  activityLogId?: string | null;
  invoiceId?: string | null;
};

async function getProfilesById(userIds: Array<string | null | undefined>) {
  const ids = [...new Set(userIds.filter((id): id is string => Boolean(id)))];
  if (ids.length === 0) return new Map<string, { id: string; email: string | null }>();

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.from("profiles").select("id, email").in("id", ids);
  if (error) throw new Error(error.message);

  return new Map((data ?? []).map((profile) => [profile.id, profile satisfies ProfileRef]));
}

export async function assertAdmin(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (!data) throw new Error("Admin access required.");
}

async function writeAdminAuditLog(input: {
  actorUserId: string;
  action: string;
  entityType: string;
  entityId?: string | null;
  after?: Record<string, unknown>;
}) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as unknown as SupabaseAny;
  const { error } = await db.from("audit_logs").insert({
    actor_user_id: input.actorUserId,
    entity_type: input.entityType,
    entity_id: input.entityId ?? null,
    action: input.action,
    after: input.after ?? {},
  });
  if (error) {
    console.warn(`[Admin] audit log failed for ${input.action}: ${error.message}`);
  }
}

async function syncServerOrderStatus(serverOrderId: string, actorUserId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { ptero, assertPteroAppConfigured } = await import("@/lib/pterodactyl.server");
  assertPteroAppConfigured();

  const { data: order, error: orderError } = await supabaseAdmin
    .from("server_orders")
    .select("id, pterodactyl_server_id")
    .eq("id", serverOrderId)
    .maybeSingle();
  if (orderError || !order?.pterodactyl_server_id) {
    throw new Error(orderError?.message ?? "Server order has no Pterodactyl server id.");
  }

  try {
    const server = (await ptero.app(`/servers/${order.pterodactyl_server_id}`)) as {
      attributes: { status?: string | null };
    };
    const status =
      server.attributes.status === null
        ? "active"
        : server.attributes.status === "suspended"
          ? "suspended"
          : server.attributes.status === "install_failed" ||
              server.attributes.status === "restore_failed"
            ? "failed"
            : "provisioning";

    const { error: updateError } = await supabaseAdmin
      .from("server_orders")
      .update({
        status,
        error_message: status === "failed" ? "Pterodactyl install failed." : null,
      })
      .eq("id", serverOrderId);
    if (updateError) throw new Error(updateError.message);
    await writeAdminAuditLog({
      actorUserId,
      action: "admin.sync_server_status",
      entityType: "server_order",
      entityId: serverOrderId,
      after: { status, pterodactyl_server_id: order.pterodactyl_server_id },
    });
    return { ok: true, status };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown Pterodactyl sync error.";
    const missing = message.includes("404") || message.toLowerCase().includes("not found");
    if (!missing) throw error;
    const { error: updateError } = await supabaseAdmin
      .from("server_orders")
      .update({
        status: "failed",
        error_message: "Pterodactyl server introuvable lors de la réconciliation admin.",
      })
      .eq("id", serverOrderId);
    if (updateError) throw new Error(updateError.message);
    await writeAdminAuditLog({
      actorUserId,
      action: "admin.sync_server_missing",
      entityType: "server_order",
      entityId: serverOrderId,
      after: { status: "failed", pterodactyl_server_id: order.pterodactyl_server_id },
    });
    return { ok: true, status: "failed", missing: true };
  }
}

function formatNotificationMoney(cents: number, currency: string) {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: currency || "EUR",
  }).format(cents / 100);
}

async function regenerateNotificationRepair(input: {
  actorUserId: string;
  activityLogId: string | null;
  invoiceId: string | null;
}) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as unknown as SupabaseAny;
  if (input.activityLogId) {
    const { data, error } = await db
      .from("activity_logs")
      .select("id, user_id, order_id, server_order_id, action, description, created_at")
      .eq("id", input.activityLogId)
      .maybeSingle();
    const log = data as ActivityLogRow | null;
    if (error || !log) throw new Error(error?.message ?? "Activity log introuvable.");
    const map: Record<string, { title: string; type: string }> = {
      payment_received: { title: "Paiement reçu", type: "payment" },
      provisioning_started: { title: "Provisioning démarré", type: "provisioning" },
      provisioning_succeeded: { title: "Serveur prêt", type: "server_ready" },
      provisioning_failed: { title: "Erreur provisioning", type: "provisioning_failed" },
      "ticket.staff_replied": { title: "Ticket répondu", type: "support" },
    };
    const item = map[log.action] ?? { title: log.action, type: "activity" };
    const href = log.server_order_id
      ? `/manage/${log.server_order_id}`
      : log.action.startsWith("ticket.")
        ? "/support"
        : log.order_id
          ? "/billing"
          : "/dashboard";
    const { error: insertError } = await db.from("notifications").insert({
      user_id: log.user_id,
      source_activity_log_id: log.id,
      type: item.type,
      title: item.title,
      body: log.description,
      href,
      created_at: log.created_at,
    });
    if (insertError && insertError.code !== "23505") throw new Error(insertError.message);
    await writeAdminAuditLog({
      actorUserId: input.actorUserId,
      action: "admin.reconciliation.regenerate_notification",
      entityType: "activity_log",
      entityId: input.activityLogId,
      after: { inserted: !insertError },
    });
    return { ok: true, duplicate: insertError?.code === "23505" };
  }
  if (!input.invoiceId) throw new Error("Missing activity log or invoice id.");
  const { data, error } = await db
    .from("invoices")
    .select("id, user_id, invoice_number, status, total_cents, currency, created_at")
    .eq("id", input.invoiceId)
    .maybeSingle();
  const invoice = data as InvoiceRow | null;
  if (error || !invoice) throw new Error(error?.message ?? "Invoice introuvable.");
  const { error: insertError } = await db.from("notifications").insert({
    user_id: invoice.user_id,
    source_invoice_id: invoice.id,
    type: "invoice",
    title: "Facture créée",
    body: `${invoice.invoice_number} · ${formatNotificationMoney(invoice.total_cents, invoice.currency)} · ${invoice.status}`,
    href: "/billing",
    created_at: invoice.created_at,
  });
  if (insertError && insertError.code !== "23505") throw new Error(insertError.message);
  await writeAdminAuditLog({
    actorUserId: input.actorUserId,
    action: "admin.reconciliation.regenerate_notification",
    entityType: "invoice",
    entityId: input.invoiceId,
    after: { inserted: !insertError },
  });
  return { ok: true, duplicate: insertError?.code === "23505" };
}

export const adminListAll = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: orders }, { data: profiles }, { data: roles }] = await Promise.all([
      supabaseAdmin
        .from("server_orders")
        .select(
          "id, server_name, status, user_id, pterodactyl_server_id, created_at, plans(name, game)",
        )
        .order("created_at", { ascending: false }),
      supabaseAdmin
        .from("profiles")
        .select("id, email, display_name, created_at")
        .order("created_at", { ascending: false }),
      supabaseAdmin.from("user_roles").select("user_id, role"),
    ]);
    return { orders: orders ?? [], profiles: profiles ?? [], roles: roles ?? [] };
  });

export const checkIsAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "admin")
      .maybeSingle();
    return { isAdmin: !!data };
  });

import { z } from "zod";

export const adminListPlans = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("plans")
      .select(
        "id, name, game, pterodactyl_nest_id, pterodactyl_egg_id, allowed_eggs, is_active, sort_order",
      )
      .order("sort_order", { ascending: true });
    if (error) throw new Error(error.message);
    return { plans: data ?? [] };
  });

export const adminUpdatePlanEggs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        planId: z.string().uuid(),
        allowedEggs: z.array(
          z.object({
            nest_id: z.number().int(),
            egg_id: z.number().int(),
            label: z.string().min(1),
            docker_image: z.string().optional(),
            startup: z.string().optional(),
          }),
        ),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("plans")
      .update({ allowed_eggs: data.allowedEggs })
      .eq("id", data.planId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminListGameCatalog = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as unknown as SupabaseAny;
    const [
      { data: games, error: gamesError },
      { data: templates, error: templatesError },
      { data: versions, error: versionsError },
      { data: compatibilities, error: compatibilitiesError },
    ] = await Promise.all([
      db
        .from("game_catalog")
        .select("id, slug, name, description, icon_url, is_active, sort_order")
        .order("sort_order", { ascending: true }),
      db
        .from("server_templates")
        .select(
          "id, game_id, slug, name, description, provider, internal_nest_id, internal_egg_id, docker_image, startup, metadata, is_active, sort_order",
        )
        .order("sort_order", { ascending: true }),
      db
        .from("server_template_versions")
        .select(
          "id, template_id, label, minecraft_version, loader, loader_version, java_version, is_active, sort_order",
        )
        .order("sort_order", { ascending: true }),
      db
        .from("plan_template_compatibilities")
        .select(
          "id, plan_id, template_id, min_ram_mb, recommended_ram_mb, is_active, sort_order, plans(name, game)",
        )
        .order("sort_order", { ascending: true }),
    ]);
    const firstError = gamesError ?? templatesError ?? versionsError ?? compatibilitiesError;
    if (firstError) throw new Error(firstError.message);

    return {
      games: (games ?? []) as AdminCatalogGame[],
      templates: (templates ?? []) as AdminCatalogTemplate[],
      versions: (versions ?? []) as AdminCatalogVersion[],
      compatibilities: (compatibilities ?? []) as AdminCatalogCompatibility[],
    };
  });

const ALLOWED_MODPACK_INSTALL_PLACEHOLDERS = new Set([
  "download_url",
  "modpack_name",
  "modpack_id",
  "file_id",
  "server_pack_file_id",
]);

const modpackInstallConfigInput = z.object({
  templateId: z.string().uuid(),
  config: z.object({
    enabled: z.boolean(),
    command_template: z.string().trim().max(1000).optional().default(""),
    max_file_size_mb: z.number().int().min(1).max(4096).optional().nullable(),
    requires_server_pack: z.boolean().optional().default(true),
    supported_loaders: z.array(z.string().trim().min(1).max(32)).max(10).optional().default([]),
    notes: z.string().trim().max(1000).optional().default(""),
  }),
});

function assertAllowedInstallPlaceholders(command: string) {
  const matches = command.matchAll(/\{([^{}]+)\}/g);
  const unknown = new Set<string>();
  for (const match of matches) {
    const name = (match[1] ?? "").trim();
    if (!ALLOWED_MODPACK_INSTALL_PLACEHOLDERS.has(name)) unknown.add(name);
  }
  if (unknown.size > 0) {
    throw new Error(`Placeholders inconnus: ${Array.from(unknown).join(", ")}`);
  }
}

export const adminUpdateTemplateModpackInstall = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => modpackInstallConfigInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    assertAllowedInstallPlaceholders(data.config.command_template);
    if (data.config.enabled && !data.config.command_template) {
      throw new Error("Une commande contrôlée est requise pour activer l’installation modpack.");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as unknown as SupabaseAny;
    const { data: currentData, error: currentError } = await db
      .from("server_templates")
      .select("id, metadata")
      .eq("id", data.templateId)
      .maybeSingle();
    if (currentError) throw new Error(currentError.message);
    const current = currentData as { id: string; metadata?: AdminTemplateMetadata | null } | null;
    if (!current) throw new Error("Template serveur introuvable.");
    const currentMetadata =
      current.metadata && typeof current.metadata === "object" ? current.metadata : {};
    const nextMetadata = {
      ...currentMetadata,
      modpack_install: {
        enabled: data.config.enabled,
        command_template: data.config.command_template,
        max_file_size_mb: data.config.max_file_size_mb ?? null,
        requires_server_pack: data.config.requires_server_pack,
        supported_loaders: data.config.supported_loaders,
        notes: data.config.notes,
      },
    };
    const { error } = await db
      .from("server_templates")
      .update({ metadata: nextMetadata })
      .eq("id", data.templateId);
    if (error) throw new Error(error.message);
    await writeAdminAuditLog({
      actorUserId: context.userId,
      action: "admin.game_catalog.update_modpack_install",
      entityType: "server_template",
      entityId: data.templateId,
      after: { modpack_install: nextMetadata.modpack_install },
    });
    return { ok: true };
  });

export const adminToggleCatalogActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        table: z.enum([
          "game_catalog",
          "server_templates",
          "server_template_versions",
          "plan_template_compatibilities",
        ]),
        id: z.string().uuid(),
        isActive: z.boolean(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as unknown as SupabaseAny;
    const { error } = await db
      .from(data.table)
      .update({ is_active: data.isActive })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    await writeAdminAuditLog({
      actorUserId: context.userId,
      action: "admin.game_catalog.toggle_active",
      entityType: data.table,
      entityId: data.id,
      after: { isActive: data.isActive },
    });
    return { ok: true };
  });

export const listCurseForgeModpacks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as unknown as SupabaseAny;
    const { data, error } = await db
      .from("curseforge_modpacks")
      .select(
        "id, curseforge_mod_id, game_id, slug, name, summary, logo_url, website_url, download_count, class_id, primary_category_id, is_active, is_featured, last_synced_at, created_at, game_catalog(name, slug)",
      )
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return { modpacks: (data ?? []) as AdminCurseForgeModpack[] };
  });

export const listCurseForgeModpackVersions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as unknown as SupabaseAny;
    const { data, error } = await db
      .from("curseforge_modpack_versions")
      .select(
        "id, modpack_id, curseforge_file_id, display_name, file_name, release_type, file_status, minecraft_versions, loaders, server_pack_file_id, is_server_pack, file_date, file_length, download_url_cached, is_active, last_synced_at, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(300);
    if (error) throw new Error(error.message);
    return { versions: (data ?? []) as AdminCurseForgeVersion[] };
  });

export const listCurseForgeMappings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as unknown as SupabaseAny;
    const { data, error } = await db
      .from("curseforge_template_mappings")
      .select(
        "id, modpack_id, template_id, loader, minecraft_version, is_active, priority, created_at, curseforge_modpacks(name), server_templates(name, game_catalog(name))",
      )
      .order("priority", { ascending: true })
      .limit(300);
    if (error) throw new Error(error.message);
    return { mappings: (data ?? []) as AdminCurseForgeMapping[] };
  });

export const listCurseForgePlanCompatibilities = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as unknown as SupabaseAny;
    const { data, error } = await db
      .from("curseforge_plan_compatibilities")
      .select(
        "id, modpack_id, plan_id, min_ram_mb, recommended_ram_mb, is_active, created_at, curseforge_modpacks(name), plans(name, game)",
      )
      .order("created_at", { ascending: false })
      .limit(300);
    if (error) throw new Error(error.message);
    return { compatibilities: (data ?? []) as AdminCurseForgePlanCompatibility[] };
  });

export const adminSearchCurseForgeModpacks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        query: z.string().trim().min(2).max(80),
        minecraftVersion: z.string().trim().max(20).optional(),
        loader: z.enum(["forge", "fabric", "quilt", "neoforge"]).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { searchCurseForgeModpacks } = await import("@/lib/curseforge.server");
    const results = await searchCurseForgeModpacks({
      query: data.query,
      minecraftVersion: data.minecraftVersion,
      loader: data.loader,
      pageSize: 20,
    });

    return {
      results: results.map(
        (mod): CurseForgeSearchResult => ({
          curseforge_mod_id: mod.id,
          slug: mod.slug ?? null,
          name: mod.name,
          summary: mod.summary ?? null,
          logo_url: mod.logo?.url ?? null,
          website_url: mod.links?.websiteUrl ?? null,
          download_count: mod.downloadCount ?? null,
          class_id: mod.classId ?? null,
          primary_category_id: mod.primaryCategoryId ?? null,
        }),
      ),
    };
  });

export const adminTestCurseForgeConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { testCurseForgeConnection } = await import("@/lib/curseforge.server");
    return testCurseForgeConnection();
  });

async function getMinecraftGameId(db: SupabaseAny) {
  const { data } = await db.from("game_catalog").select("id").eq("slug", "minecraft").maybeSingle();
  return ((data as { id?: string } | null)?.id ?? null) as string | null;
}

export const adminImportCurseForgeModpack = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ modId: z.number().int().positive() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { getCurseForgeMod } = await import("@/lib/curseforge.server");
    const db = supabaseAdmin as unknown as SupabaseAny;
    const mod = await getCurseForgeMod(data.modId);
    const gameId = await getMinecraftGameId(db);

    const { data: saved, error } = await db
      .from("curseforge_modpacks")
      .upsert(
        {
          curseforge_mod_id: mod.id,
          game_id: gameId,
          slug: mod.slug ?? null,
          name: mod.name,
          summary: mod.summary ?? null,
          logo_url: mod.logo?.url ?? null,
          website_url: mod.links?.websiteUrl ?? null,
          download_count: mod.downloadCount ?? null,
          class_id: mod.classId ?? null,
          primary_category_id: mod.primaryCategoryId ?? null,
          is_active: false,
          raw_payload: mod,
          last_synced_at: new Date().toISOString(),
        },
        { onConflict: "curseforge_mod_id" },
      )
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    await writeAdminAuditLog({
      actorUserId: context.userId,
      action: "admin.curseforge.import_modpack",
      entityType: "curseforge_modpack",
      entityId: (saved as { id?: string } | null)?.id ?? null,
      after: { curseforgeModId: mod.id, name: mod.name },
    });

    return { ok: true, id: (saved as { id?: string } | null)?.id ?? null };
  });

export const adminSyncCurseForgeModpackVersions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ modpackId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { extractLoaders, extractMinecraftVersions, listCurseForgeModFiles } =
      await import("@/lib/curseforge.server");
    const db = supabaseAdmin as unknown as SupabaseAny;

    const { data: modpack, error: modpackError } = await db
      .from("curseforge_modpacks")
      .select("id, curseforge_mod_id")
      .eq("id", data.modpackId)
      .maybeSingle();
    if (modpackError) throw new Error(modpackError.message);
    const row = modpack as { id: string; curseforge_mod_id: number } | null;
    if (!row) throw new Error("Modpack CurseForge introuvable.");

    const files = await listCurseForgeModFiles(row.curseforge_mod_id);
    const payloads = files.map((file) => ({
      modpack_id: row.id,
      curseforge_file_id: file.id,
      display_name: file.displayName ?? file.fileName ?? `File ${file.id}`,
      file_name: file.fileName ?? null,
      release_type: file.releaseType ?? null,
      file_status: file.fileStatus ?? null,
      minecraft_versions: extractMinecraftVersions(file),
      loaders: extractLoaders(file),
      server_pack_file_id: file.serverPackFileId ?? null,
      is_server_pack: Boolean(file.serverPackFileId),
      file_date: file.fileDate ?? null,
      file_length: file.fileLength ?? null,
      download_url_cached: false,
      hashes: file.hashes ?? {},
      dependencies: file.dependencies ?? [],
      raw_payload: file,
      last_synced_at: new Date().toISOString(),
    }));

    if (payloads.length > 0) {
      const { error } = await db
        .from("curseforge_modpack_versions")
        .upsert(payloads, { onConflict: "curseforge_file_id" });
      if (error) throw new Error(error.message);
    }

    const { error: updateError } = await db
      .from("curseforge_modpacks")
      .update({ last_synced_at: new Date().toISOString() })
      .eq("id", row.id);
    if (updateError) throw new Error(updateError.message);

    await writeAdminAuditLog({
      actorUserId: context.userId,
      action: "admin.curseforge.sync_versions",
      entityType: "curseforge_modpack",
      entityId: row.id,
      after: { importedVersions: payloads.length },
    });

    return { ok: true, imported: payloads.length };
  });

export const adminToggleCurseForgeModpack = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z.object({ modpackId: z.string().uuid(), isActive: z.boolean() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as unknown as SupabaseAny;
    const { error } = await db
      .from("curseforge_modpacks")
      .update({ is_active: data.isActive })
      .eq("id", data.modpackId);
    if (error) throw new Error(error.message);
    await writeAdminAuditLog({
      actorUserId: context.userId,
      action: "admin.curseforge.toggle_modpack",
      entityType: "curseforge_modpack",
      entityId: data.modpackId,
      after: { isActive: data.isActive },
    });
    return { ok: true };
  });

export const adminToggleCurseForgeModpackVersion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z.object({ versionId: z.string().uuid(), isActive: z.boolean() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as unknown as SupabaseAny;
    const { error } = await db
      .from("curseforge_modpack_versions")
      .update({ is_active: data.isActive })
      .eq("id", data.versionId);
    if (error) throw new Error(error.message);
    await writeAdminAuditLog({
      actorUserId: context.userId,
      action: "admin.curseforge.toggle_version",
      entityType: "curseforge_modpack_version",
      entityId: data.versionId,
      after: { isActive: data.isActive },
    });
    return { ok: true };
  });

const curseForgeMappingInput = z.object({
  modpackId: z.string().uuid(),
  templateId: z.string().uuid(),
  loader: z.string().trim().max(40).optional(),
  minecraftVersion: z.string().trim().max(40).optional(),
  priority: z.number().int().min(0).max(1000).default(0),
  isActive: z.boolean().default(true),
});

async function assertCurseForgeMappingRefs(
  db: SupabaseAny,
  input: { modpackId: string; templateId: string },
) {
  const [{ data: modpack, error: modpackError }, { data: template, error: templateError }] =
    await Promise.all([
      db.from("curseforge_modpacks").select("id").eq("id", input.modpackId).maybeSingle(),
      db.from("server_templates").select("id").eq("id", input.templateId).maybeSingle(),
    ]);

  if (modpackError) throw new Error(modpackError.message);
  if (templateError) throw new Error(templateError.message);
  if (!modpack) throw new Error("Modpack CurseForge introuvable.");
  if (!template) throw new Error("Template serveur introuvable.");
}

function cleanNullableText(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

async function assertCurseForgeMappingUnique(
  db: SupabaseAny,
  input: {
    modpackId: string;
    templateId: string;
    loader: string | null;
    minecraftVersion: string | null;
    ignoreMappingId?: string;
  },
) {
  const { data, error } = await db
    .from("curseforge_template_mappings")
    .select("id, loader, minecraft_version")
    .eq("modpack_id", input.modpackId)
    .eq("template_id", input.templateId);
  if (error) throw new Error(error.message);

  const duplicate = (
    (data ?? []) as Array<{ id: string; loader: string | null; minecraft_version: string | null }>
  ).find(
    (mapping) =>
      mapping.id !== input.ignoreMappingId &&
      (mapping.loader ?? null) === input.loader &&
      (mapping.minecraft_version ?? null) === input.minecraftVersion,
  );
  if (duplicate) {
    throw new Error("Ce mapping existe déjà pour ce modpack, template, loader et version.");
  }
}

export const adminCreateCurseForgeTemplateMapping = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => curseForgeMappingInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as unknown as SupabaseAny;
    await assertCurseForgeMappingRefs(db, data);

    const payload = {
      modpack_id: data.modpackId,
      template_id: data.templateId,
      loader: cleanNullableText(data.loader),
      minecraft_version: cleanNullableText(data.minecraftVersion),
      is_active: data.isActive,
      priority: data.priority,
      metadata: {},
    };
    await assertCurseForgeMappingUnique(db, {
      modpackId: data.modpackId,
      templateId: data.templateId,
      loader: payload.loader,
      minecraftVersion: payload.minecraft_version,
    });

    const { data: inserted, error } = await db
      .from("curseforge_template_mappings")
      .insert(payload)
      .select("id")
      .single();
    if (error) {
      if (error.code === "23505") {
        throw new Error("Ce mapping existe déjà pour ce modpack, template, loader et version.");
      }
      throw new Error(error.message);
    }

    await writeAdminAuditLog({
      actorUserId: context.userId,
      action: "admin.curseforge.create_mapping",
      entityType: "curseforge_template_mapping",
      entityId: (inserted as { id?: string } | null)?.id ?? null,
      after: payload,
    });

    return { ok: true, id: (inserted as { id?: string } | null)?.id ?? null };
  });

export const adminUpdateCurseForgeTemplateMapping = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    curseForgeMappingInput.extend({ mappingId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as unknown as SupabaseAny;
    await assertCurseForgeMappingRefs(db, data);

    const payload = {
      modpack_id: data.modpackId,
      template_id: data.templateId,
      loader: cleanNullableText(data.loader),
      minecraft_version: cleanNullableText(data.minecraftVersion),
      is_active: data.isActive,
      priority: data.priority,
    };
    await assertCurseForgeMappingUnique(db, {
      modpackId: data.modpackId,
      templateId: data.templateId,
      loader: payload.loader,
      minecraftVersion: payload.minecraft_version,
      ignoreMappingId: data.mappingId,
    });

    const { error } = await db
      .from("curseforge_template_mappings")
      .update(payload)
      .eq("id", data.mappingId);
    if (error) {
      if (error.code === "23505") {
        throw new Error("Ce mapping existe déjà pour ce modpack, template, loader et version.");
      }
      throw new Error(error.message);
    }

    await writeAdminAuditLog({
      actorUserId: context.userId,
      action: "admin.curseforge.update_mapping",
      entityType: "curseforge_template_mapping",
      entityId: data.mappingId,
      after: payload,
    });

    return { ok: true };
  });

export const adminDeleteCurseForgeTemplateMapping = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ mappingId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as unknown as SupabaseAny;
    const { error } = await db
      .from("curseforge_template_mappings")
      .update({ is_active: false })
      .eq("id", data.mappingId);
    if (error) throw new Error(error.message);
    await writeAdminAuditLog({
      actorUserId: context.userId,
      action: "admin.curseforge.disable_mapping",
      entityType: "curseforge_template_mapping",
      entityId: data.mappingId,
      after: { isActive: false },
    });
    return { ok: true };
  });

export const adminListProvisioningQueue = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as unknown as SupabaseAny;
    const [{ data: orders, error: ordersError }, { data: serverOrders, error: serversError }] =
      await Promise.all([
        db
          .from("orders")
          .select(
            "id, user_id, plan_id, status, total_cents, currency, created_at, plans(name, game)",
          )
          .in("status", ["paid", "active"])
          .order("created_at", { ascending: false }),
        db
          .from("server_orders")
          .select("id, order_id, status, error_message, pterodactyl_server_id"),
      ]);

    if (ordersError) throw new Error(ordersError.message);
    if (serversError) throw new Error(serversError.message);

    const serverRows = (serverOrders ?? []) as Array<{
      id: string;
      order_id: string | null;
      status: string;
      error_message: string | null;
      pterodactyl_server_id: number | null;
    }>;
    const orderRows = (orders ?? []) as Array<{ id: string } & Record<string, unknown>>;

    const serversByOrder = new Map(
      serverRows
        .filter((server) => server.order_id)
        .map((server) => [server.order_id as string, server]),
    );

    const queue = orderRows
      .map((order) => ({ ...order, server_order: serversByOrder.get(order.id) ?? null }))
      .filter((order) => !order.server_order?.pterodactyl_server_id);

    return { orders: queue };
  });

export const adminRetryProvisioning = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ orderId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { provisionPaidOrder } = await import("@/lib/provisioning.server");
    return provisionPaidOrder(data.orderId, {
      actorUserId: context.userId,
      source: "admin_retry",
    });
  });

export const adminListOrdersDetailed = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as unknown as SupabaseAny;
    const [{ data: orders, error: ordersError }, { data: servers, error: serversError }] =
      await Promise.all([
        db
          .from("orders")
          .select(
            "id, user_id, plan_id, status, total_cents, currency, stripe_subscription_id, stripe_checkout_session_id, metadata, created_at, plans(name, game)",
          )
          .order("created_at", { ascending: false })
          .limit(100),
        db
          .from("server_orders")
          .select(
            "id, order_id, status, error_message, pterodactyl_server_id, pterodactyl_server_identifier, metadata",
          ),
      ]);
    if (ordersError) throw new Error(ordersError.message);
    if (serversError) throw new Error(serversError.message);

    const orderRows = ((orders ?? []) as Array<OrderRow & { metadata?: unknown }>).map(
      ({ metadata, ...order }) => ({
        ...order,
        selected_template_label: selectedTemplateLabel(metadata),
        selected_modpack_label: selectedModpackLabel(metadata),
        minecraft_settings: selectedMinecraftSettings(metadata),
      }),
    );
    const profilesById = await getProfilesById(orderRows.map((order) => order.user_id));
    const serversByOrder = new Map(
      ((servers ?? []) as Array<ServerLinkRow & { metadata?: unknown }>)
        .map(({ metadata, ...server }) => ({
          ...server,
          selected_template_label: selectedTemplateLabel(metadata),
          selected_modpack_label: selectedModpackLabel(metadata),
          minecraft_settings: selectedMinecraftSettings(metadata),
        }))
        .filter((server) => server.order_id)
        .map((server) => [server.order_id as string, server]),
    );

    return {
      orders: orderRows.map((order) => ({
        ...order,
        profile: order.user_id ? (profilesById.get(order.user_id) ?? null) : null,
        server_order: serversByOrder.get(order.id) ?? null,
      })),
    };
  });

export const adminListServersDetailed = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as unknown as SupabaseAny;
    const { data, error } = await db
      .from("server_orders")
      .select(
        "id, order_id, user_id, plan_id, server_name, status, pterodactyl_server_id, pterodactyl_server_identifier, metadata, error_message, created_at, plans(name, game)",
      )
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    const servers = ((data ?? []) as Array<ServerDetailRow & { metadata?: unknown }>).map(
      ({ metadata, ...server }) => ({
        ...server,
        selected_template_label: selectedTemplateLabel(metadata),
        selected_modpack_label: selectedModpackLabel(metadata),
        minecraft_settings: selectedMinecraftSettings(metadata),
      }),
    );
    const profilesById = await getProfilesById(servers.map((server) => server.user_id));
    return {
      servers: servers.map((server) => ({
        ...server,
        profile: server.user_id ? (profilesById.get(server.user_id) ?? null) : null,
      })),
    };
  });

export const adminListPaymentsDetailed = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as unknown as SupabaseAny;
    const [{ data: payments, error: paymentsError }, { data: invoices, error: invoicesError }] =
      await Promise.all([
        db
          .from("payments")
          .select(
            "id, user_id, order_id, provider, provider_payment_id, status, currency, amount_cents, stripe_payment_intent_id, stripe_charge_id, stripe_invoice_id, created_at",
          )
          .order("created_at", { ascending: false })
          .limit(100),
        db
          .from("invoices")
          .select(
            "id, user_id, order_id, payment_id, invoice_number, status, currency, total_cents, stripe_invoice_id, stripe_hosted_invoice_url, stripe_invoice_pdf, created_at",
          )
          .order("created_at", { ascending: false })
          .limit(100),
      ]);
    if (paymentsError) throw new Error(paymentsError.message);
    if (invoicesError) throw new Error(invoicesError.message);
    const paymentRows = (payments ?? []) as PaymentDetailRow[];
    const invoiceRows = (invoices ?? []) as InvoiceDetailRow[];
    const profilesById = await getProfilesById([
      ...paymentRows.map((payment) => payment.user_id),
      ...invoiceRows.map((invoice) => invoice.user_id),
    ]);

    return {
      payments: paymentRows.map((payment) => ({
        ...payment,
        profile: payment.user_id ? (profilesById.get(payment.user_id) ?? null) : null,
      })),
      invoices: invoiceRows.map((invoice) => ({
        ...invoice,
        profile: invoice.user_id ? (profilesById.get(invoice.user_id) ?? null) : null,
      })),
    };
  });

export const adminListLogsDetailed = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as unknown as SupabaseAny;
    const [{ data: activity, error: activityError }, { data: audit, error: auditError }] =
      await Promise.all([
        db
          .from("activity_logs")
          .select(
            "id, user_id, order_id, server_order_id, action, description, metadata, created_at",
          )
          .order("created_at", { ascending: false })
          .limit(150),
        db
          .from("audit_logs")
          .select(
            "id, actor_user_id, target_user_id, entity_type, entity_id, action, before, after, created_at",
          )
          .order("created_at", { ascending: false })
          .limit(150),
      ]);
    if (activityError) throw new Error(activityError.message);
    if (auditError) throw new Error(auditError.message);
    return { activity: activity ?? [], audit: audit ?? [] };
  });

export const adminSyncServerStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ serverOrderId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    return syncServerOrderStatus(data.serverOrderId, context.userId);
  });

export const adminGetMonitoring = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as unknown as SupabaseAny;
    const [
      { data: profiles, error: profilesError },
      { data: servers, error: serversError },
      { data: orders, error: ordersError },
      { data: payments, error: paymentsError },
      { data: tickets, error: ticketsError },
    ] = await Promise.all([
      db.from("profiles").select("id"),
      db.from("server_orders").select("id, status"),
      db.from("orders").select("id, status, total_cents, created_at"),
      db.from("payments").select("id, status, amount_cents, refunded_cents, created_at"),
      db.from("tickets").select("id, status"),
    ]);
    const firstError =
      profilesError ?? serversError ?? ordersError ?? paymentsError ?? ticketsError;
    if (firstError) throw new Error(firstError.message);

    const paymentRows = (payments ?? []) as Array<{
      status: string;
      amount_cents: number | null;
      refunded_cents: number | null;
      created_at: string;
    }>;
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const paidPayments = paymentRows.filter((payment) => payment.status === "paid");
    const net = (payment: { amount_cents: number | null; refunded_cents: number | null }) =>
      (payment.amount_cents ?? 0) - (payment.refunded_cents ?? 0);

    return {
      users: ((profiles ?? []) as unknown[]).length,
      servers: ((servers ?? []) as unknown[]).length,
      orders: ((orders ?? []) as unknown[]).length,
      payments: paymentRows.length,
      revenueTotalCents: paidPayments.reduce((sum, payment) => sum + net(payment), 0),
      revenueMonthCents: paidPayments
        .filter((payment) => new Date(payment.created_at) >= monthStart)
        .reduce((sum, payment) => sum + net(payment), 0),
      ticketsOpen: ((tickets ?? []) as Array<{ status: string }>).filter(
        (ticket) => ticket.status !== "closed",
      ).length,
      ticketsClosed: ((tickets ?? []) as Array<{ status: string }>).filter(
        (ticket) => ticket.status === "closed",
      ).length,
    };
  });

export const adminListReconciliation = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as unknown as SupabaseAny;
    const [
      { data: orders, error: ordersError },
      { data: servers, error: serversError },
      { data: invoices, error: invoicesError },
      { data: payments, error: paymentsError },
      { data: stripeEvents, error: stripeEventsError },
      { data: activityLogs, error: activityLogsError },
      { data: notifications, error: notificationsError },
    ] = await Promise.all([
      db
        .from("orders")
        .select("id, status, stripe_subscription_id, stripe_checkout_session_id, created_at")
        .order("created_at", { ascending: false })
        .limit(200),
      db
        .from("server_orders")
        .select(
          "id, order_id, status, pterodactyl_server_id, pterodactyl_server_identifier, error_message, created_at",
        )
        .order("created_at", { ascending: false })
        .limit(200),
      db
        .from("invoices")
        .select("id, order_id, payment_id, status, stripe_invoice_id, created_at")
        .order("created_at", { ascending: false })
        .limit(200),
      db
        .from("payments")
        .select("id, order_id, status, stripe_invoice_id, stripe_payment_intent_id, created_at")
        .order("created_at", { ascending: false })
        .limit(200),
      db
        .from("stripe_events")
        .select("id, stripe_event_id, type, processed_at, created_at")
        .order("created_at", { ascending: false })
        .limit(200),
      db
        .from("activity_logs")
        .select("id, user_id, action, created_at")
        .in("action", [
          "payment_received",
          "provisioning_started",
          "provisioning_succeeded",
          "provisioning_failed",
          "ticket.staff_replied",
        ])
        .order("created_at", { ascending: false })
        .limit(200),
      db
        .from("notifications")
        .select("id, source_activity_log_id, source_invoice_id, created_at")
        .order("created_at", { ascending: false })
        .limit(500),
    ]);
    const firstError =
      ordersError ??
      serversError ??
      invoicesError ??
      paymentsError ??
      stripeEventsError ??
      activityLogsError ??
      notificationsError;
    if (firstError) throw new Error(firstError.message);

    const serverRows = (servers ?? []) as ServerLinkRow[];
    const invoiceRows = (invoices ?? []) as Array<{
      id: string;
      order_id: string | null;
      payment_id: string | null;
      status: string;
      stripe_invoice_id: string | null;
      created_at: string;
    }>;
    const paymentRows = (payments ?? []) as Array<{
      id: string;
      order_id: string | null;
      status: string;
      stripe_invoice_id: string | null;
      stripe_payment_intent_id: string | null;
      created_at: string;
    }>;
    const serversByOrder = new Map(
      serverRows
        .filter((server) => server.order_id)
        .map((server) => [server.order_id as string, server]),
    );
    const paymentsByInvoice = new Set(
      paymentRows.map((payment) => payment.stripe_invoice_id).filter(Boolean),
    );
    const invoicesByStripe = new Set(
      invoiceRows.map((invoice) => invoice.stripe_invoice_id).filter(Boolean),
    );
    const notificationRows = (notifications ?? []) as Array<{
      source_activity_log_id: string | null;
      source_invoice_id: string | null;
    }>;
    const notifiedActivities = new Set(
      notificationRows.map((notification) => notification.source_activity_log_id).filter(Boolean),
    );
    const notifiedInvoices = new Set(
      notificationRows.map((notification) => notification.source_invoice_id).filter(Boolean),
    );
    const anomalies: ReconciliationAnomaly[] = [];

    for (const order of (orders ?? []) as Array<{
      id: string;
      status: string;
      stripe_subscription_id: string | null;
      created_at: string;
    }>) {
      const server = serversByOrder.get(order.id);
      if (["paid", "active"].includes(order.status) && !server) {
        anomalies.push({
          id: `order-${order.id}`,
          type: "paid_order_without_server",
          area: "stripe",
          severity: "critical",
          status: "repairable",
          date: order.created_at,
          message: `Order ${order.id.slice(0, 8)} is paid but has no server_order.`,
          recommendation: "Retry provisioning from the paid order.",
          repairAction: "retry_provisioning",
          orderId: order.id,
        });
      }
      if (["paid", "active"].includes(order.status) && !order.stripe_subscription_id) {
        anomalies.push({
          id: `subscription-${order.id}`,
          type: "incomplete_subscription",
          area: "stripe",
          severity: "important",
          status: "manual_review",
          date: order.created_at,
          message: `Order ${order.id.slice(0, 8)} has no stripe_subscription_id.`,
          recommendation: "Review Stripe session/subscription manually.",
          repairAction: "none",
          orderId: order.id,
        });
      }
    }

    for (const invoice of invoiceRows) {
      if (
        invoice.status === "paid" &&
        invoice.stripe_invoice_id &&
        !paymentsByInvoice.has(invoice.stripe_invoice_id)
      ) {
        anomalies.push({
          id: `invoice-${invoice.id}`,
          type: "invoice_without_payment",
          area: "stripe",
          severity: "important",
          status: "manual_review",
          date: invoice.created_at,
          message: `Invoice ${invoice.id.slice(0, 8)} has no matching payment.`,
          recommendation: "Resend Stripe invoice event or review webhook logs.",
          repairAction: "none",
          orderId: invoice.order_id,
        });
      }
    }

    for (const payment of paymentRows) {
      if (payment.stripe_invoice_id && !invoicesByStripe.has(payment.stripe_invoice_id)) {
        anomalies.push({
          id: `payment-${payment.id}`,
          type: "payment_without_invoice",
          area: "stripe",
          severity: "important",
          status: "manual_review",
          date: payment.created_at,
          message: `Payment ${payment.id.slice(0, 8)} has no matching invoice.`,
          recommendation: "Resend Stripe invoice event or review webhook logs.",
          repairAction: "none",
          orderId: payment.order_id,
        });
      }
    }

    for (const server of serverRows) {
      const stuck =
        server.status === "provisioning" &&
        Date.now() -
          new Date(
            (server as ServerLinkRow & { created_at?: string }).created_at ?? Date.now(),
          ).getTime() >
          20 * 60_000;
      if (!server.pterodactyl_server_id || !server.pterodactyl_server_identifier) {
        anomalies.push({
          id: `server-missing-${server.id}`,
          type: "server_order_without_pterodactyl",
          area: "pterodactyl",
          severity: "critical",
          status: "repairable",
          date:
            (server as ServerLinkRow & { created_at?: string }).created_at ??
            new Date().toISOString(),
          message: `Server order ${server.id.slice(0, 8)} has no Pterodactyl server.`,
          recommendation: "Retry provisioning if the linked order is paid.",
          repairAction: server.order_id ? "retry_provisioning" : "none",
          orderId: server.order_id,
          serverOrderId: server.id,
        });
      } else if (stuck) {
        anomalies.push({
          id: `server-stuck-${server.id}`,
          type: "provisioning_stuck",
          area: "pterodactyl",
          severity: "important",
          status: "repairable",
          date:
            (server as ServerLinkRow & { created_at?: string }).created_at ??
            new Date().toISOString(),
          message: `Server order ${server.id.slice(0, 8)} appears stuck in provisioning.`,
          recommendation: "Sync status, then retry provisioning if needed.",
          repairAction: "sync_server",
          serverOrderId: server.id,
        });
      }
    }

    const { ptero, assertPteroAppConfigured } = await import("@/lib/pterodactyl.server");
    try {
      assertPteroAppConfigured();
      for (const server of serverRows.filter((row) => row.pterodactyl_server_id).slice(0, 50)) {
        try {
          await ptero.app(`/servers/${server.pterodactyl_server_id}`);
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown Pterodactyl error.";
          if (message.includes("404") || message.toLowerCase().includes("not found")) {
            anomalies.push({
              id: `ptero-missing-${server.id}`,
              type: "pterodactyl_server_missing",
              area: "pterodactyl",
              severity: "critical",
              status: "repairable",
              date:
                (server as ServerLinkRow & { created_at?: string }).created_at ??
                new Date().toISOString(),
              message: `Pterodactyl server ${server.pterodactyl_server_id} is referenced but not found.`,
              recommendation: "Sync server status to mark it failed, then review before retry.",
              repairAction: "sync_server",
              orderId: server.order_id,
              serverOrderId: server.id,
            });
          } else {
            anomalies.push({
              id: `ptero-check-${server.id}`,
              type: "pterodactyl_check_failed",
              area: "pterodactyl",
              severity: "info",
              status: "manual_review",
              date:
                (server as ServerLinkRow & { created_at?: string }).created_at ??
                new Date().toISOString(),
              message: `Could not verify Pterodactyl server ${server.pterodactyl_server_id}: ${message}`,
              recommendation: "Check Pterodactyl Application API connectivity.",
              repairAction: "none",
              serverOrderId: server.id,
            });
          }
        }
      }
    } catch (error) {
      anomalies.push({
        id: "pterodactyl-config-check",
        type: "pterodactyl_check_unavailable",
        area: "pterodactyl",
        severity: "info",
        status: "manual_review",
        date: new Date().toISOString(),
        message: error instanceof Error ? error.message : "Pterodactyl check unavailable.",
        recommendation: "Verify server-only Pterodactyl Application API configuration.",
        repairAction: "none",
      });
    }

    for (const event of (stripeEvents ?? []) as Array<{
      stripe_event_id: string;
      type: string;
      processed_at: string | null;
      created_at: string;
    }>) {
      if (!event.processed_at) {
        anomalies.push({
          id: `stripe-event-${event.stripe_event_id}`,
          type: "stripe_event_unprocessed",
          area: "stripe",
          severity: "critical",
          status: "repairable",
          date: event.created_at,
          message: `Stripe event ${event.stripe_event_id} (${event.type}) is stored but unprocessed.`,
          recommendation: "Reprocess only if processed_at is still null.",
          repairAction: "reprocess_stripe_event",
          stripeEventId: event.stripe_event_id,
        });
      }
    }

    for (const log of (activityLogs ?? []) as Array<{
      id: string;
      action: string;
      created_at: string;
    }>) {
      if (!notifiedActivities.has(log.id)) {
        anomalies.push({
          id: `notification-activity-${log.id}`,
          type: "notification_missing_activity",
          area: "notifications",
          severity: "info",
          status: "repairable",
          date: log.created_at,
          message: `Notification missing for activity ${log.action}.`,
          recommendation: "Regenerate the notification from the activity log.",
          repairAction: "regenerate_notification",
          activityLogId: log.id,
        });
      }
    }

    for (const invoice of invoiceRows.filter((row) => row.status === "paid")) {
      if (!notifiedInvoices.has(invoice.id)) {
        anomalies.push({
          id: `notification-invoice-${invoice.id}`,
          type: "notification_missing_invoice",
          area: "notifications",
          severity: "info",
          status: "repairable",
          date: invoice.created_at,
          message: `Notification missing for invoice ${invoice.id.slice(0, 8)}.`,
          recommendation: "Regenerate the invoice notification.",
          repairAction: "regenerate_notification",
          invoiceId: invoice.id,
          orderId: invoice.order_id,
        });
      }
    }

    return { anomalies };
  });

export const adminRepairReconciliation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        repairAction: z.enum([
          "retry_provisioning",
          "sync_server",
          "reprocess_stripe_event",
          "regenerate_notification",
        ]),
        orderId: z.string().uuid().optional().nullable(),
        serverOrderId: z.string().uuid().optional().nullable(),
        stripeEventId: z.string().optional().nullable(),
        activityLogId: z.string().uuid().optional().nullable(),
        invoiceId: z.string().uuid().optional().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    if (data.repairAction === "retry_provisioning") {
      if (!data.orderId) throw new Error("Missing order id for provisioning repair.");
      const { provisionPaidOrder } = await import("@/lib/provisioning.server");
      const result = await provisionPaidOrder(data.orderId, {
        actorUserId: context.userId,
        source: "admin_reconciliation",
      });
      await writeAdminAuditLog({
        actorUserId: context.userId,
        action: "admin.reconciliation.retry_provisioning",
        entityType: "order",
        entityId: data.orderId,
        after: { result },
      });
      return result;
    }
    if (data.repairAction === "reprocess_stripe_event") {
      if (!data.stripeEventId) throw new Error("Missing Stripe event id for reprocess repair.");
      const { reprocessStoredStripeEvent } = await import("@/lib/stripe-webhook.server");
      const result = await reprocessStoredStripeEvent(data.stripeEventId);
      await writeAdminAuditLog({
        actorUserId: context.userId,
        action: "admin.reconciliation.reprocess_stripe_event",
        entityType: "stripe_event",
        entityId: data.stripeEventId,
        after: result,
      });
      return result;
    }
    if (data.repairAction === "regenerate_notification") {
      const result = await regenerateNotificationRepair({
        actorUserId: context.userId,
        activityLogId: data.activityLogId ?? null,
        invoiceId: data.invoiceId ?? null,
      });
      return result;
    }
    if (!data.serverOrderId) throw new Error("Missing server order id for sync repair.");
    return syncServerOrderStatus(data.serverOrderId, context.userId);
  });
