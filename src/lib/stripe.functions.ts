import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  calculateMinecraftPlayerPricing,
  getMinecraftVersionVariable,
  isMinecraftGame,
  normalizeMinecraftServerType,
  normalizeGameKey,
} from "@/lib/game-config";

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
  single: () => SupabaseQuery<T>;
  maybeSingle: () => SupabaseQuery<T>;
  insert: (values: Record<string, unknown>) => SupabaseQuery<T>;
  update: (values: Record<string, unknown>) => SupabaseQuery<T>;
};

type PlanForCheckout = {
  id: string;
  product_id: string | null;
  game: string;
  name: string;
  description: string | null;
  price_monthly_cents: number;
  ram_mb: number;
  cpu_percent: number;
  currency?: string | null;
  billing_interval?: string | null;
  stripe_price_id?: string | null;
  allowed_eggs?: unknown;
  pterodactyl_nest_id: number;
  pterodactyl_egg_id: number;
  docker_image?: string | null;
  startup?: string | null;
  environment?: unknown;
};

type ProfileForCheckout = {
  id: string;
  email: string | null;
  display_name: string | null;
  stripe_customer_id?: string | null;
};

function playerPricingForPlan(plan: PlanForCheckout, requestedMaxPlayers?: number) {
  if (!isMinecraftGame(plan.game)) {
    return {
      pricing_mode: "base",
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

const checkoutInput = z.object({
  planId: z.string().uuid(),
  serverName: z.string().trim().min(2).max(40).optional(),
  variantIndex: z.number().int().min(0).optional(),
  environment: z.record(z.string(), z.string()).optional(),
  maxPlayers: z.number().int().min(1).max(200).optional(),
  serverType: z.string().trim().max(40).optional(),
  minecraftVersion: z.string().trim().max(40).optional(),
  selectedModpack: z
    .object({
      modpackId: z.string().uuid(),
      versionId: z.string().uuid(),
    })
    .optional(),
});

export const createCheckoutSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => checkoutInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { getStripe, getStripeConfig } = await import("@/lib/stripe.server");
    const db = supabaseAdmin as unknown as SupabaseAny;
    const stripe = getStripe();
    const { successUrl, cancelUrl } = getStripeConfig();

    const planResult = await db
      .from("plans")
      .select(
        "id, product_id, game, name, description, price_monthly_cents, ram_mb, cpu_percent, currency, billing_interval, stripe_price_id, allowed_eggs, pterodactyl_nest_id, pterodactyl_egg_id, docker_image, startup, environment",
      )
      .eq("id", data.planId)
      .eq("is_active", true)
      .single();

    const plan = planResult.data as PlanForCheckout | null;
    const planError = planResult.error;
    if (planError || !plan) throw new Error("Plan introuvable ou inactif.");
    if (plan.price_monthly_cents <= 0) throw new Error("Ce plan n'a pas de prix valide.");
    const gameKey = normalizeGameKey(plan.game);
    const minecraft = gameKey === "minecraft";

    const profileResult = await db
      .from("profiles")
      .select("id, email, display_name, stripe_customer_id")
      .eq("id", context.userId)
      .single();

    const profile = profileResult.data as ProfileForCheckout | null;
    const profileError = profileResult.error;
    if (profileError || !profile) throw new Error("Profil utilisateur introuvable.");

    let stripeCustomerId = profile.stripe_customer_id ?? null;
    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        email: profile.email ?? undefined,
        name: profile.display_name ?? undefined,
        metadata: {
          supabase_user_id: context.userId,
        },
      });
      stripeCustomerId = customer.id;

      const { error: updateProfileError } = await db
        .from("profiles")
        .update({ stripe_customer_id: stripeCustomerId })
        .eq("id", context.userId);
      if (updateProfileError) throw new Error(updateProfileError.message);
    }

    const currency = (plan.currency ?? "EUR").toLowerCase();
    const { loadPlanTemplateVariants } = await import("@/lib/plans.functions");
    const modpackSelection = data.selectedModpack
      ? await (
          await import("@/lib/modpacks.functions")
        ).resolveSelectedModpackForCheckout({
          planId: plan.id,
          modpackId: data.selectedModpack.modpackId,
          versionId: data.selectedModpack.versionId,
        })
      : null;
    const variants = await loadPlanTemplateVariants(plan);
    const requestedVariantIndex =
      modpackSelection?.variantIndex ??
      (typeof data.variantIndex === "number" && data.variantIndex >= 0 ? data.variantIndex : 0);
    const selectedVariantIndex = variants[requestedVariantIndex] ? requestedVariantIndex : 0;
    const selectedVariant = variants[selectedVariantIndex] ?? variants[0] ?? null;
    const selectedServerType =
      normalizeMinecraftServerType(data.serverType) ??
      normalizeMinecraftServerType(selectedVariant?.label) ??
      plan.name.toLowerCase();
    const selectedTemplateLabel = selectedVariant?.label || data.serverType?.trim() || plan.name;
    const selectedVersionLabel =
      data.minecraftVersion?.trim() && data.minecraftVersion.trim() !== "auto"
        ? data.minecraftVersion.trim()
        : (selectedVariant?.minecraftVersion ?? selectedVariant?.versionLabel ?? null);
    const serverName = data.serverName?.trim();
    if (!serverName) throw new Error("Nom du serveur obligatoire avant paiement.");
    const playerPricing = playerPricingForPlan(plan, minecraft ? data.maxPlayers : undefined);
    const maxPlayers = playerPricing.max_players;
    const versionVariable = minecraft ? getMinecraftVersionVariable(selectedServerType) : null;
    const versionApplyStatus = !minecraft
      ? null
      : selectedVersionLabel && versionVariable
        ? "applied"
        : selectedVersionLabel
          ? "pending_template_support"
          : "managed";
    const checkoutEnvironment = {
      ...(data.environment ?? {}),
      ...(minecraft && selectedVersionLabel && versionVariable
        ? { [versionVariable]: selectedVersionLabel }
        : {}),
    };
    const minecraftMetadata = minecraft
      ? {
          server_type: selectedServerType,
          egg_id: selectedVariant?.egg_id ?? plan.pterodactyl_egg_id,
          nest_id: selectedVariant?.nest_id ?? plan.pterodactyl_nest_id,
          minecraft_version: selectedVersionLabel ?? "auto",
          version_source: selectedVersionLabel ? "xnt_catalog" : "template",
          version_apply_status: versionApplyStatus,
          ...(versionVariable ? { version_variable: versionVariable } : {}),
          ...(maxPlayers ? { max_players: maxPlayers } : {}),
          player_pricing: playerPricing,
          minecraft_settings: {
            server_type: selectedTemplateLabel,
            minecraft_version: selectedVersionLabel ?? "auto",
            version_apply_status: versionApplyStatus,
            ...(versionVariable ? { version_variable: versionVariable } : {}),
            max_players: maxPlayers,
            max_players_applied: false,
          },
        }
      : {};
    const orderResult = await db
      .from("orders")
      .insert({
        user_id: context.userId,
        product_id: plan.product_id,
        plan_id: plan.id,
        status: "pending_payment",
        currency: currency.toUpperCase(),
        subtotal_cents: playerPricing.total_price_cents,
        tax_cents: 0,
        total_cents: playerPricing.total_price_cents,
        billing_interval: plan.billing_interval ?? "monthly",
        stripe_customer_id: stripeCustomerId,
        stripe_price_id: plan.stripe_price_id ?? null,
        metadata: {
          source: "stripe_checkout",
          provisioning_deferred: true,
          selected_game: gameKey,
          server_name: serverName,
          ...minecraftMetadata,
          selected_template: {
            index: selectedVariantIndex,
            ...(selectedVariant?.templateId ? { template_id: selectedVariant.templateId } : {}),
            label: selectedTemplateLabel,
            server_type: selectedServerType,
            egg_id: selectedVariant?.egg_id ?? plan.pterodactyl_egg_id,
            nest_id: selectedVariant?.nest_id ?? plan.pterodactyl_nest_id,
            version: selectedVersionLabel,
            source: selectedVariant?.source ?? "allowed_eggs",
            ...(modpackSelection ? { selection_source: "curseforge_modpack" } : {}),
          },
          ...(modpackSelection
            ? {
                selected_modpack: modpackSelection.modpack,
                selected_modpack_version: modpackSelection.version,
              }
            : {}),
          environment: checkoutEnvironment,
        },
      })
      .select("id")
      .single();

    const order = orderResult.data as { id: string } | null;
    const orderError = orderResult.error;
    if (orderError || !order)
      throw new Error(orderError?.message ?? "Impossible de créer la commande.");

    const useDynamicPrice = playerPricing.total_price_cents !== plan.price_monthly_cents;
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: stripeCustomerId,
      success_url: successUrl,
      cancel_url: cancelUrl,
      client_reference_id: order.id,
      line_items: [
        plan.stripe_price_id
          ? {
              ...(useDynamicPrice
                ? {
                    price_data: {
                      currency,
                      unit_amount: playerPricing.total_price_cents,
                      recurring: { interval: "month" as const },
                      product_data: {
                        name: `${plan.game} - ${plan.name}`,
                        description:
                          minecraft && maxPlayers
                            ? `${plan.description ?? "Serveur XNT"} · ${maxPlayers} joueurs max`
                            : (plan.description ?? undefined),
                      },
                    },
                  }
                : { price: plan.stripe_price_id }),
              quantity: 1,
            }
          : {
              quantity: 1,
              price_data: {
                currency,
                unit_amount: playerPricing.total_price_cents,
                recurring: { interval: "month" },
                product_data: {
                  name: `${plan.game} - ${plan.name}`,
                  description: plan.description ?? undefined,
                },
              },
            },
      ],
      metadata: {
        order_id: order.id,
        user_id: context.userId,
        plan_id: plan.id,
        template: selectedTemplateLabel,
        game: gameKey,
        ...(minecraft && maxPlayers ? { max_players: String(maxPlayers) } : {}),
        total_price_cents: String(playerPricing.total_price_cents),
        extra_price_cents: String(playerPricing.extra_price_cents),
        ...(minecraft && selectedVersionLabel ? { version: selectedVersionLabel } : {}),
        ...(modpackSelection ? { modpack: modpackSelection.modpack.name } : {}),
        provisioning_deferred: "true",
      },
      subscription_data: {
        metadata: {
          order_id: order.id,
          user_id: context.userId,
          plan_id: plan.id,
          template: selectedTemplateLabel,
          game: gameKey,
          ...(minecraft && maxPlayers ? { max_players: String(maxPlayers) } : {}),
          total_price_cents: String(playerPricing.total_price_cents),
          extra_price_cents: String(playerPricing.extra_price_cents),
          ...(minecraft && selectedVersionLabel ? { version: selectedVersionLabel } : {}),
          ...(modpackSelection ? { modpack: modpackSelection.modpack.name } : {}),
          provisioning_deferred: "true",
        },
      },
    });

    const { error: updateOrderError } = await db
      .from("orders")
      .update({
        stripe_checkout_session_id: session.id,
        stripe_subscription_id:
          typeof session.subscription === "string" ? session.subscription : null,
      })
      .eq("id", order.id);

    if (updateOrderError) throw new Error(updateOrderError.message);
    if (!session.url) throw new Error("Stripe n'a pas retourné d'URL de paiement.");

    return { url: session.url };
  });
