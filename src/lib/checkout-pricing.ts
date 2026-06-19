import {
  calculateMinecraftPlayerPricing,
  getMinecraftVersionVariable,
  isMinecraftGame,
  isProxyTemplateLabel,
  normalizeGameKey,
  normalizeMinecraftServerType,
} from "@/lib/game-config";
import type { PlanVariant } from "@/lib/plans.functions";

export type CheckoutPlan = {
  id: string;
  product_id?: string | null;
  game: string;
  name: string;
  description?: string | null;
  price_monthly_cents: number;
  ram_mb: number;
  cpu_percent?: number;
  currency?: string | null;
  billing_interval?: string | null;
  stripe_price_id?: string | null;
  pterodactyl_nest_id: number;
  pterodactyl_egg_id: number;
};

export type CheckoutModpackSelection = {
  variantIndex?: number | null;
  modpack: { name: string; [key: string]: unknown };
  version: Record<string, unknown>;
};

export function buildCheckoutPricing(plan: CheckoutPlan, requestedMaxPlayers?: number) {
  if (!isMinecraftGame(plan.game)) {
    return {
      pricing_mode: "base" as const,
      base_price_cents: plan.price_monthly_cents,
      price_per_player_cents: 0,
      players: null,
      players_price_cents: 0,
      min_players: null,
      max_players_allowed: null,
      max_players: null,
      extra_players: 0,
      extra_price_cents: 0,
      total_price_cents: plan.price_monthly_cents,
    };
  }
  const pricing = calculateMinecraftPlayerPricing(plan, requestedMaxPlayers);
  return {
    ...pricing,
    players: pricing.selected_players,
    players_price_cents: pricing.players_adjustment_cents,
    max_players: pricing.selected_players,
    extra_players: pricing.players_delta,
    extra_price_cents: pricing.players_adjustment_cents,
  };
}

export function resolveCheckoutTemplate(input: {
  plan: CheckoutPlan;
  variants: PlanVariant[];
  requestedVariantIndex?: number | null;
  requestedServerType?: string | null;
  requestedMinecraftVersion?: string | null;
  modpackSelection?: CheckoutModpackSelection | null;
}) {
  const minecraft = isMinecraftGame(input.plan.game);
  if (!minecraft && input.requestedServerType?.trim()) {
    throw new Error("Ce type de serveur n’est pas disponible pour ce plan.");
  }

  const requestedVariantIndex =
    input.modpackSelection?.variantIndex ??
    (typeof input.requestedVariantIndex === "number" && input.requestedVariantIndex >= 0
      ? input.requestedVariantIndex
      : 0);
  const requestedServerType = normalizeMinecraftServerType(input.requestedServerType);
  const variantFromType =
    minecraft && requestedServerType
      ? input.variants.find(
          (variant) => normalizeMinecraftServerType(variant.label) === requestedServerType,
        )
      : null;
  if (minecraft && requestedServerType && !variantFromType) {
    throw new Error("Ce template serveur n’est pas compatible avec le plan choisi.");
  }

  const selectedVariant =
    variantFromType ?? input.variants[requestedVariantIndex] ?? input.variants[0] ?? null;
  const selectedVariantIndex = selectedVariant
    ? input.variants.findIndex((variant) => variant === selectedVariant)
    : 0;
  if (minecraft && selectedVariant && isProxyTemplateLabel(selectedVariant.label)) {
    throw new Error(
      "Ce template serveur n’est pas disponible pour un serveur Minecraft classique.",
    );
  }
  const selectedServerType =
    requestedServerType ??
    normalizeMinecraftServerType(selectedVariant?.label) ??
    input.plan.name.toLowerCase();
  const selectedTemplateLabel =
    selectedVariant?.label || input.requestedServerType?.trim() || input.plan.name;
  const selectedVersionLabel =
    input.requestedMinecraftVersion?.trim() && input.requestedMinecraftVersion.trim() !== "auto"
      ? input.requestedMinecraftVersion.trim()
      : (selectedVariant?.minecraftVersion ?? selectedVariant?.versionLabel ?? null);

  return {
    selectedVariantIndex,
    selectedVariant,
    selectedServerType,
    selectedTemplateLabel,
    selectedVersionLabel,
  };
}

export function buildOrderMetadata(input: {
  plan: CheckoutPlan;
  serverName: string;
  pricing: ReturnType<typeof buildCheckoutPricing>;
  template: ReturnType<typeof resolveCheckoutTemplate>;
  environment?: Record<string, string>;
  modpackSelection?: CheckoutModpackSelection | null;
}) {
  const gameKey = normalizeGameKey(input.plan.game);
  const minecraft = gameKey === "minecraft";
  const maxPlayers = input.pricing.max_players;
  const selectedVariant = input.template.selectedVariant;
  const versionVariable = minecraft
    ? getMinecraftVersionVariable(input.template.selectedServerType)
    : null;
  const selectedVersionLabel = input.template.selectedVersionLabel;
  const versionApplyStatus = !minecraft
    ? null
    : selectedVersionLabel && versionVariable
      ? "applied"
      : selectedVersionLabel
        ? "pending_template_support"
        : "managed";
  const checkoutEnvironment = {
    ...(input.environment ?? {}),
    ...(minecraft && selectedVersionLabel && versionVariable
      ? { [versionVariable]: selectedVersionLabel }
      : {}),
  };
  const minecraftMetadata = minecraft
    ? {
        server_type: input.template.selectedServerType,
        egg_id: selectedVariant?.egg_id ?? input.plan.pterodactyl_egg_id,
        nest_id: selectedVariant?.nest_id ?? input.plan.pterodactyl_nest_id,
        minecraft_version: selectedVersionLabel ?? "auto",
        version_source: selectedVersionLabel ? "xnt_catalog" : "template",
        version_apply_status: versionApplyStatus,
        ...(versionVariable ? { version_variable: versionVariable } : {}),
        ...(maxPlayers ? { max_players: maxPlayers } : {}),
        player_pricing: input.pricing,
        minecraft_settings: {
          server_type: input.template.selectedTemplateLabel,
          minecraft_version: selectedVersionLabel ?? "auto",
          version_apply_status: versionApplyStatus,
          ...(versionVariable ? { version_variable: versionVariable } : {}),
          max_players: maxPlayers,
          max_players_applied: false,
        },
      }
    : {};

  return {
    metadata: {
      source: "stripe_checkout",
      provisioning_deferred: true,
      selected_game: gameKey,
      server_name: input.serverName,
      ...minecraftMetadata,
      selected_template: {
        index: input.template.selectedVariantIndex,
        ...(selectedVariant?.templateId ? { template_id: selectedVariant.templateId } : {}),
        label: input.template.selectedTemplateLabel,
        server_type: input.template.selectedServerType,
        egg_id: selectedVariant?.egg_id ?? input.plan.pterodactyl_egg_id,
        nest_id: selectedVariant?.nest_id ?? input.plan.pterodactyl_nest_id,
        version: selectedVersionLabel,
        source: selectedVariant?.source ?? "allowed_eggs",
        ...(input.modpackSelection ? { selection_source: "curseforge_modpack" } : {}),
      },
      ...(input.modpackSelection
        ? {
            selected_modpack: input.modpackSelection.modpack,
            selected_modpack_version: input.modpackSelection.version,
          }
        : {}),
      environment: checkoutEnvironment,
    },
    versionVariable,
    versionApplyStatus,
    checkoutEnvironment,
  };
}

export function buildStripeCheckoutLineItem(input: {
  plan: CheckoutPlan;
  currency: string;
  pricing: ReturnType<typeof buildCheckoutPricing>;
}) {
  const useDynamicPrice = input.pricing.total_price_cents !== input.plan.price_monthly_cents;
  const minecraft = isMinecraftGame(input.plan.game);
  const maxPlayers = input.pricing.max_players;
  if (input.plan.stripe_price_id && !useDynamicPrice) {
    return { price: input.plan.stripe_price_id, quantity: 1 };
  }
  return {
    quantity: 1,
    price_data: {
      currency: input.currency,
      unit_amount: input.pricing.total_price_cents,
      recurring: { interval: "month" as const },
      product_data: {
        name: `${input.plan.game} - ${input.plan.name}`,
        description:
          minecraft && maxPlayers
            ? `${input.plan.description ?? "Serveur XNT"} · ${maxPlayers} joueurs max`
            : (input.plan.description ?? undefined),
      },
    },
  };
}
