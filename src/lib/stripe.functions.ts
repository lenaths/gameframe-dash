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
  currency?: string | null;
  billing_interval?: string | null;
  stripe_price_id?: string | null;
  allowed_eggs?: unknown;
};

type ProfileForCheckout = {
  id: string;
  email: string | null;
  display_name: string | null;
  stripe_customer_id?: string | null;
};

const checkoutInput = z.object({
  planId: z.string().uuid(),
  serverName: z.string().trim().min(2).max(40).optional(),
  variantIndex: z.number().int().min(0).optional(),
  environment: z.record(z.string(), z.string()).optional(),
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
        "id, product_id, game, name, description, price_monthly_cents, currency, billing_interval, stripe_price_id, allowed_eggs",
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
    const variants = Array.isArray((plan as Record<string, unknown>).allowed_eggs)
      ? ((plan as Record<string, unknown>).allowed_eggs as Array<{ label?: string }>)
      : [];
    const requestedVariantIndex =
      typeof data.variantIndex === "number" && data.variantIndex >= 0 ? data.variantIndex : 0;
    const selectedVariantIndex = variants[requestedVariantIndex] ? requestedVariantIndex : 0;
    const selectedVariant = variants[selectedVariantIndex] ?? variants[0] ?? null;
    const selectedTemplateLabel = selectedVariant?.label ?? plan.name;
    const serverName = data.serverName?.trim() || `${plan.game} ${plan.name}`.slice(0, 40);
    const orderResult = await db
      .from("orders")
      .insert({
        user_id: context.userId,
        product_id: plan.product_id,
        plan_id: plan.id,
        status: "pending_payment",
        currency: currency.toUpperCase(),
        subtotal_cents: plan.price_monthly_cents,
        tax_cents: 0,
        total_cents: plan.price_monthly_cents,
        billing_interval: plan.billing_interval ?? "monthly",
        stripe_customer_id: stripeCustomerId,
        stripe_price_id: plan.stripe_price_id ?? null,
        metadata: {
          source: "stripe_checkout",
          provisioning_deferred: true,
          server_name: serverName,
          selected_template: {
            index: selectedVariantIndex,
            label: selectedTemplateLabel,
          },
          environment: data.environment ?? {},
        },
      })
      .select("id")
      .single();

    const order = orderResult.data as { id: string } | null;
    const orderError = orderResult.error;
    if (orderError || !order)
      throw new Error(orderError?.message ?? "Impossible de créer la commande.");

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: stripeCustomerId,
      success_url: successUrl,
      cancel_url: cancelUrl,
      client_reference_id: order.id,
      line_items: [
        plan.stripe_price_id
          ? {
              price: plan.stripe_price_id,
              quantity: 1,
            }
          : {
              quantity: 1,
              price_data: {
                currency,
                unit_amount: plan.price_monthly_cents,
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
        provisioning_deferred: "true",
      },
      subscription_data: {
        metadata: {
          order_id: order.id,
          user_id: context.userId,
          plan_id: plan.id,
          template: selectedTemplateLabel,
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
