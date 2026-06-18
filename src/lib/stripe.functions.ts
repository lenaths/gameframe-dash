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

function recommendedMaxPlayers(
  plan: Pick<PlanForCheckout, "ram_mb" | "cpu_percent"> & Partial<Record<string, unknown>>,
) {
  const ramMb = typeof plan.ram_mb === "number" ? plan.ram_mb : 0;
  const cpu = typeof plan.cpu_percent === "number" ? plan.cpu_percent : 0;
  if (ramMb >= 32768 || cpu >= 400) return 200;
  if (ramMb >= 16384 || cpu >= 250) return 100;
  if (ramMb >= 8192 || cpu >= 150) return 60;
  if (ramMb >= 4096 || cpu >= 100) return 30;
  return 10;
}

function playerPricingForPlan(plan: PlanForCheckout, requestedMaxPlayers?: number) {
  const planName = plan.name.toLowerCase();
  const ramMb = plan.ram_mb;
  const fallbackMax = ramMb >= 16384 ? 100 : ramMb >= 8192 ? 60 : ramMb >= 4096 ? 30 : 10;
  const included = planName.includes("netherite")
    ? 80
    : planName.includes("diamond")
      ? 40
      : planName.includes("iron")
        ? 20
        : Math.min(recommendedMaxPlayers(plan), fallbackMax);
  const maxAllowed = planName.includes("netherite")
    ? 100
    : planName.includes("diamond")
      ? 60
      : planName.includes("iron")
        ? 30
        : fallbackMax;
  const stepPrice = planName.includes("netherite")
    ? 500
    : planName.includes("diamond")
      ? 200
      : planName.includes("iron")
        ? 100
        : 0;
  const maxPlayers = Math.min(
    maxAllowed,
    Math.max(1, requestedMaxPlayers ?? Math.min(included, maxAllowed)),
  );
  const extraPlayers = Math.max(0, maxPlayers - included);
  const extraPriceCents = extraPlayers > 0 ? stepPrice : 0;
  const totalPriceCents = plan.price_monthly_cents + extraPriceCents;
  return {
    included_players: included,
    max_players_allowed: maxAllowed,
    max_players: maxPlayers,
    extra_players: extraPlayers,
    extra_price_cents: extraPriceCents,
    total_price_cents: totalPriceCents,
  };
}

const checkoutInput = z.object({
  planId: z.string().uuid(),
  serverName: z.string().trim().min(2).max(40).optional(),
  variantIndex: z.number().int().min(0).optional(),
  environment: z.record(z.string(), z.string()).optional(),
  maxPlayers: z.number().int().min(1).max(200).optional(),
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
    const selectedTemplateLabel = selectedVariant?.label ?? plan.name;
    const selectedVersionLabel = selectedVariant?.versionLabel ?? null;
    const serverName = data.serverName?.trim();
    if (!serverName) throw new Error("Nom du serveur obligatoire avant paiement.");
    const playerPricing = playerPricingForPlan(plan, data.maxPlayers);
    const maxPlayers = playerPricing.max_players;
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
          server_name: serverName,
          server_type: selectedTemplateLabel,
          minecraft_version: selectedVersionLabel ?? "managed",
          max_players: maxPlayers,
          player_pricing: playerPricing,
          selected_template: {
            index: selectedVariantIndex,
            label: selectedTemplateLabel,
            version: selectedVersionLabel,
            source: selectedVariant?.source ?? "allowed_eggs",
            ...(modpackSelection ? { selection_source: "curseforge_modpack" } : {}),
          },
          minecraft_settings: {
            server_type: selectedTemplateLabel,
            minecraft_version: selectedVersionLabel ?? "managed",
            max_players: maxPlayers,
            max_players_applied: false,
          },
          ...(modpackSelection
            ? {
                selected_modpack: modpackSelection.modpack,
                selected_modpack_version: modpackSelection.version,
              }
            : {}),
          environment: data.environment ?? {},
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
                        description: `${plan.description ?? "Serveur XNT"} · ${maxPlayers} joueurs max`,
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
        max_players: String(maxPlayers),
        total_price_cents: String(playerPricing.total_price_cents),
        extra_price_cents: String(playerPricing.extra_price_cents),
        ...(selectedVersionLabel ? { version: selectedVersionLabel } : {}),
        ...(modpackSelection ? { modpack: modpackSelection.modpack.name } : {}),
        provisioning_deferred: "true",
      },
      subscription_data: {
        metadata: {
          order_id: order.id,
          user_id: context.userId,
          plan_id: plan.id,
          template: selectedTemplateLabel,
          max_players: String(maxPlayers),
          total_price_cents: String(playerPricing.total_price_cents),
          extra_price_cents: String(playerPricing.extra_price_cents),
          ...(selectedVersionLabel ? { version: selectedVersionLabel } : {}),
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
