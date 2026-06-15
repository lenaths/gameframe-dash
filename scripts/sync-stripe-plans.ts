import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";

type Plan = {
  id: string;
  slug: string;
  game: string;
  name: string;
  description: string | null;
  price_monthly_cents: number;
  currency: string | null;
  stripe_product_id: string | null;
  stripe_price_id: string | null;
};

type SupabasePlanUpdate = {
  stripe_product_id: string;
  stripe_price_id: string;
};

const REQUIRED_STRIPE_PLAN_COLUMNS = ["stripe_product_id", "stripe_price_id", "currency"] as const;

function loadDotEnv(filePath: string) {
  if (!fs.existsSync(filePath)) return;

  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const equalsIndex = line.indexOf("=");
    if (equalsIndex === -1) continue;

    const key = line.slice(0, equalsIndex).trim();
    const value = line
      .slice(equalsIndex + 1)
      .trim()
      .replace(/^(['"])(.*)\1$/, "$2");

    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function requireEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Variable .env manquante: ${name}`);
  }
  return value;
}

function isMissingColumnError(error: { message?: string; code?: string } | null | undefined) {
  if (!error) return false;
  return error.code === "42703" || /column .* does not exist/i.test(error.message ?? "");
}

function migrationRequiredMessage(error: { message?: string } | null | undefined) {
  return [
    "La migration Stripe DB n'est pas appliquee sur cette base Supabase.",
    "Applique d'abord supabase/migrations/20260614003000_stripe_database_preparation.sql, puis relance npm run stripe:sync-plans.",
    error?.message ? `Erreur Supabase: ${error.message}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

async function findExistingProduct(stripe: Stripe, plan: Plan) {
  if (plan.stripe_product_id) {
    try {
      const product = await stripe.products.retrieve(plan.stripe_product_id);
      if (!product.deleted) return product;
    } catch (error) {
      console.warn(
        `[stripe] Product ${plan.stripe_product_id} introuvable pour ${plan.slug}, recherche par metadata...`,
      );
    }
  }

  const escapedPlanId = plan.id.replace(/'/g, "\\'");
  const products = await stripe.products.search({
    query: `metadata['supabase_plan_id']:'${escapedPlanId}'`,
    limit: 1,
  });

  return products.data[0] ?? null;
}

async function ensureProduct(stripe: Stripe, plan: Plan) {
  const existing = await findExistingProduct(stripe, plan);
  if (existing) return existing;

  return stripe.products.create({
    name: `${plan.game} - ${plan.name}`,
    description: plan.description ?? undefined,
    active: true,
    metadata: {
      supabase_plan_id: plan.id,
      plan_slug: plan.slug,
      game: plan.game,
    },
  });
}

async function createMonthlyPrice(stripe: Stripe, plan: Plan, productId: string) {
  const currency = (plan.currency ?? "EUR").toLowerCase();
  if (plan.price_monthly_cents <= 0) {
    throw new Error(`Plan ${plan.slug} ignore: price_monthly_cents doit etre > 0.`);
  }

  return stripe.prices.create({
    product: productId,
    currency,
    unit_amount: plan.price_monthly_cents,
    recurring: { interval: "month" },
    metadata: {
      supabase_plan_id: plan.id,
      plan_slug: plan.slug,
    },
  });
}

async function main() {
  loadDotEnv(path.resolve(process.cwd(), ".env"));

  const supabaseUrl = requireEnv("SUPABASE_URL");
  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const stripeSecretKey = requireEnv("STRIPE_SECRET_KEY");

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
  const stripe = new Stripe(stripeSecretKey);

  console.log("[stripe] Verification des colonnes Stripe sur public.plans...");
  const { error: columnCheckError } = await supabase
    .from("plans")
    .select(REQUIRED_STRIPE_PLAN_COLUMNS.join(", "))
    .limit(1);

  if (isMissingColumnError(columnCheckError)) {
    throw new Error(migrationRequiredMessage(columnCheckError));
  }
  if (columnCheckError) {
    throw new Error(`Impossible de verifier la table plans: ${columnCheckError.message}`);
  }

  const { data: plans, error: plansError } = await supabase
    .from("plans")
    .select(
      "id, slug, game, name, description, price_monthly_cents, currency, stripe_product_id, stripe_price_id",
    )
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  if (isMissingColumnError(plansError)) {
    throw new Error(migrationRequiredMessage(plansError));
  }
  if (plansError) {
    throw new Error(`Impossible de recuperer les plans actifs: ${plansError.message}`);
  }

  const activePlans = (plans ?? []) as Plan[];
  console.log(`[stripe] ${activePlans.length} plan(s) actif(s) trouve(s).`);

  for (const plan of activePlans) {
    if (plan.stripe_price_id) {
      console.log(`[stripe] ${plan.slug}: deja synchronise (${plan.stripe_price_id}).`);
      continue;
    }

    console.log(`[stripe] ${plan.slug}: synchronisation...`);
    const product = await ensureProduct(stripe, plan);
    const price = await createMonthlyPrice(stripe, plan, product.id);

    const update: SupabasePlanUpdate = {
      stripe_product_id: product.id,
      stripe_price_id: price.id,
    };

    const { error: updateError } = await supabase.from("plans").update(update).eq("id", plan.id);
    if (updateError) {
      throw new Error(`Impossible de mettre a jour le plan ${plan.slug}: ${updateError.message}`);
    }

    console.log(`[stripe] ${plan.slug}: product=${product.id}, price=${price.id}`);
  }

  console.log(
    "[stripe] Synchronisation terminee. Aucun provisioning Pterodactyl n'a ete declenche.",
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
