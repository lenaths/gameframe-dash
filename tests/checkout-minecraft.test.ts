import assert from "node:assert/strict";
import {
  buildCheckoutPricing,
  buildOrderMetadata,
  buildStripeCheckoutLineItem,
  resolveCheckoutTemplate,
  type CheckoutPlan,
} from "../src/lib/checkout-pricing";
import {
  buildDeployUrlFromPricing,
  buildPricingDeploySearch,
  buildPricingDeployUrl,
  defaultPlayersForPricingPlan,
  isPlanLockedSearchValue,
  resolveDeployPlan,
  resolveDeployPlanState,
} from "../src/lib/deploy-flow";
import type { PlanVariant } from "../src/lib/plans.functions";

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (error) {
    console.error(`✗ ${name}`);
    throw error;
  }
}

const ironPlan: CheckoutPlan = {
  id: "plan-iron",
  product_id: "product-minecraft",
  game: "Minecraft",
  name: "Iron",
  description: "Serveur Minecraft Iron",
  price_monthly_cents: 499,
  ram_mb: 4096,
  cpu_percent: 200,
  currency: "EUR",
  billing_interval: "monthly",
  stripe_price_id: "price_fixed_iron",
  pterodactyl_nest_id: 1,
  pterodactyl_egg_id: 1,
};

const conanPlan: CheckoutPlan = {
  id: "plan-conan",
  product_id: "product-conan",
  game: "Conan Exiles",
  name: "Exile",
  description: "Serveur Conan",
  price_monthly_cents: 1299,
  ram_mb: 8192,
  cpu_percent: 300,
  currency: "EUR",
  billing_interval: "monthly",
  stripe_price_id: "price_fixed_conan",
  pterodactyl_nest_id: 42,
  pterodactyl_egg_id: 88,
};

const diamondPlan: CheckoutPlan = {
  id: "plan-diamond",
  product_id: "product-minecraft",
  game: "Minecraft",
  name: "Diamond",
  description: "Serveur Minecraft Diamond",
  price_monthly_cents: 999,
  ram_mb: 8192,
  cpu_percent: 300,
  currency: "EUR",
  billing_interval: "monthly",
  stripe_price_id: "price_fixed_diamond",
  pterodactyl_nest_id: 1,
  pterodactyl_egg_id: 5,
};

const netheritePlan: CheckoutPlan = {
  id: "plan-netherite",
  product_id: "product-minecraft",
  game: "Minecraft",
  name: "Netherite",
  description: "Serveur Minecraft Netherite",
  price_monthly_cents: 1999,
  ram_mb: 16384,
  cpu_percent: 500,
  currency: "EUR",
  billing_interval: "monthly",
  stripe_price_id: "price_fixed_netherite",
  pterodactyl_nest_id: 1,
  pterodactyl_egg_id: 5,
};

const minecraftVariants: PlanVariant[] = [
  {
    nest_id: 1,
    egg_id: 3,
    label: "Vanilla",
    source: "allowed_eggs",
    minecraftVersion: null,
  },
  {
    nest_id: 1,
    egg_id: 5,
    label: "Paper",
    source: "allowed_eggs",
    minecraftVersion: null,
  },
  {
    nest_id: 1,
    egg_id: 4,
    label: "Forge",
    source: "allowed_eggs",
    minecraftVersion: null,
  },
];

function buildMinecraftCheckoutCase(input: {
  players: number;
  variantIndex: number;
  serverType: string;
  minecraftVersion?: string;
}) {
  const template = resolveCheckoutTemplate({
    plan: ironPlan,
    variants: minecraftVariants,
    requestedVariantIndex: input.variantIndex,
    requestedServerType: input.serverType,
    requestedMinecraftVersion: input.minecraftVersion,
  });
  const pricing = buildCheckoutPricing(ironPlan, input.players);
  const order = buildOrderMetadata({
    plan: ironPlan,
    serverName: "Test Minecraft",
    pricing,
    template,
    environment: {
      total: "1",
      subtotal: "1",
      price: "1",
    },
  });
  const lineItem = buildStripeCheckoutLineItem({
    plan: ironPlan,
    currency: "eur",
    pricing,
  });
  return { template, pricing, order, lineItem };
}

function unitAmount(lineItem: ReturnType<typeof buildStripeCheckoutLineItem>) {
  assert.ok("price_data" in lineItem, "expected dynamic Stripe price_data");
  return lineItem.price_data.unit_amount;
}

test("Minecraft Iron 3 players ignores forged client total and sends 394 cents to Stripe", () => {
  const { pricing, order, lineItem } = buildMinecraftCheckoutCase({
    players: 3,
    variantIndex: 1,
    serverType: "paper",
    minecraftVersion: "1.21.4",
  });
  assert.equal(pricing.total_price_cents, 394);
  assert.equal(unitAmount(lineItem), 394);
  assert.equal(order.metadata.max_players, 3);
  assert.equal(
    (order.metadata.player_pricing as { total_price_cents: number }).total_price_cents,
    394,
  );
  assert.equal((order.metadata.environment as Record<string, string>).total, "1");
});

test("Minecraft Iron 10 players keeps fixed Stripe price and stores correct metadata", () => {
  const { pricing, order, lineItem } = buildMinecraftCheckoutCase({
    players: 10,
    variantIndex: 1,
    serverType: "paper",
  });
  assert.equal(pricing.total_price_cents, 499);
  assert.deepEqual(lineItem, { price: "price_fixed_iron", quantity: 1 });
  assert.equal(order.metadata.max_players, 10);
  assert.equal(
    (order.metadata.player_pricing as { total_price_cents: number }).total_price_cents,
    499,
  );
});

test("Minecraft Iron 20 players sends 649 cents and correct metadata", () => {
  const { pricing, order, lineItem } = buildMinecraftCheckoutCase({
    players: 20,
    variantIndex: 1,
    serverType: "paper",
  });
  assert.equal(pricing.total_price_cents, 649);
  assert.equal(unitAmount(lineItem), 649);
  assert.equal(order.metadata.max_players, 20);
});

test("Minecraft Iron 999 players clamps to 30 and sends 799 cents", () => {
  const { pricing, order, lineItem } = buildMinecraftCheckoutCase({
    players: 999,
    variantIndex: 1,
    serverType: "paper",
  });
  assert.equal(pricing.max_players_allowed, 30);
  assert.equal(pricing.max_players, 30);
  assert.equal(pricing.total_price_cents, 799);
  assert.equal(unitAmount(lineItem), 799);
  assert.equal(order.metadata.max_players, 30);
});

test("Non-Minecraft checkout keeps base price and omits Minecraft metadata", () => {
  const template = resolveCheckoutTemplate({
    plan: conanPlan,
    variants: [
      {
        nest_id: 42,
        egg_id: 88,
        label: "Conan Exiles",
        source: "allowed_eggs",
      },
    ],
    requestedVariantIndex: 0,
  });
  const pricing = buildCheckoutPricing(conanPlan, 999);
  const order = buildOrderMetadata({
    plan: conanPlan,
    serverName: "Conan Test",
    pricing,
    template,
  });
  const lineItem = buildStripeCheckoutLineItem({
    plan: conanPlan,
    currency: "eur",
    pricing,
  });
  assert.equal(pricing.total_price_cents, 1299);
  assert.deepEqual(lineItem, { price: "price_fixed_conan", quantity: 1 });
  assert.equal(order.metadata.selected_game, "conan");
  assert.equal("max_players" in order.metadata, false);
  assert.equal("minecraft_settings" in order.metadata, false);
  assert.equal("player_pricing" in order.metadata, false);
});

test("Minecraft template resolution maps playable types to correct egg IDs", () => {
  const vanilla = buildMinecraftCheckoutCase({
    players: 10,
    variantIndex: 0,
    serverType: "vanilla",
  });
  const paper = buildMinecraftCheckoutCase({ players: 10, variantIndex: 1, serverType: "paper" });
  const forge = buildMinecraftCheckoutCase({ players: 10, variantIndex: 2, serverType: "forge" });

  assert.equal(vanilla.order.metadata.selected_template.egg_id, 3);
  assert.equal(paper.order.metadata.selected_template.egg_id, 5);
  assert.equal(forge.order.metadata.selected_template.egg_id, 4);
  assert.notEqual(vanilla.order.metadata.selected_template.egg_id, 1);
  assert.notEqual(paper.order.metadata.selected_template.egg_id, 1);
  assert.notEqual(forge.order.metadata.selected_template.egg_id, 1);
});

test("Bungeecord variant is never selected when playable Paper variant is requested", () => {
  const template = resolveCheckoutTemplate({
    plan: ironPlan,
    variants: [
      { nest_id: 1, egg_id: 1, label: "Bungeecord", source: "allowed_eggs" },
      { nest_id: 1, egg_id: 5, label: "Paper", source: "allowed_eggs" },
    ],
    requestedVariantIndex: 1,
    requestedServerType: "paper",
  });
  const pricing = buildCheckoutPricing(ironPlan, 10);
  const order = buildOrderMetadata({
    plan: ironPlan,
    serverName: "Paper Test",
    pricing,
    template,
  });
  assert.equal(order.metadata.selected_template.egg_id, 5);
  assert.notEqual(order.metadata.selected_template.egg_id, 1);
});

test("Pricing builds locked deploy URL search with selected Forge template", () => {
  const search = buildDeployUrlFromPricing({
    planId: ironPlan.id,
    variantIndex: 2,
    templateLabel: "Forge",
    minecraftVersion: "auto",
    players: defaultPlayersForPricingPlan(ironPlan),
    lockPlan: true,
  });
  assert.deepEqual(search, {
    plan: "plan-iron",
    variant: 2,
    server_type: "forge",
    minecraft_version: "auto",
    players: 10,
    plan_locked: 1,
  });
});

test("Pricing builds a valid deploy URL without undefined values", () => {
  const url = buildPricingDeployUrl({
    planId: ironPlan.id,
    variantIndex: 2,
    templateLabel: "Forge",
    minecraftVersion: "auto",
    players: 10,
    lockPlan: true,
  });
  assert.equal(
    url,
    "/deploy?plan=plan-iron&variant=2&server_type=forge&minecraft_version=auto&players=10&plan_locked=1",
  );
  assert.equal(url.includes("undefined"), false);
  assert.equal(url.includes("null"), false);
});

test("Pricing deploy URL rejects missing plan", () => {
  assert.throws(
    () =>
      buildPricingDeployUrl({
        planId: "",
        templateLabel: "Forge",
        players: 10,
        lockPlan: true,
      }),
    /Plan requis/,
  );
});

test("Pricing can generate a URL for an unknown plan and Deploy reports it as invalid", () => {
  const url = buildPricingDeployUrl({
    planId: "unknown-plan",
    variantIndex: 0,
    templateLabel: "Paper",
    players: 10,
    lockPlan: true,
  });
  assert.equal(
    url,
    "/deploy?plan=unknown-plan&variant=0&server_type=paper&minecraft_version=auto&players=10&plan_locked=1",
  );
  const state = resolveDeployPlanState({
    plans: [ironPlan],
    planId: "unknown-plan",
    planLockedValue: 1,
  });
  assert.equal(state.selectedPlan, null);
  assert.equal(state.error, "Impossible de retrouver le plan sélectionné.");
});

test("Pricing deploy search helper keeps the same locked URL contract", () => {
  const search = buildPricingDeploySearch({
    planId: ironPlan.id,
    variantIndex: 0,
    templateId: "template-vanilla",
    templateLabel: "Vanilla",
    players: 10,
    lockPlan: true,
  });
  assert.equal(search.plan, "plan-iron");
  assert.equal(search.template, "template-vanilla");
  assert.equal(search.server_type, "vanilla");
  assert.equal(search.plan_locked, 1);
});

test("Deploy resolves plan by id, slug and code", () => {
  const plans = [
    { ...ironPlan, slug: "mc-iron", code: "iron-code" },
    { ...diamondPlan, slug: "mc-diamond", code: "diamond-code" },
  ];
  assert.equal(resolveDeployPlan(plans, "plan-iron")?.id, "plan-iron");
  assert.equal(resolveDeployPlan(plans, "mc-iron")?.id, "plan-iron");
  assert.equal(resolveDeployPlan(plans, "iron-code")?.id, "plan-iron");
  assert.equal(resolveDeployPlan(plans, "Iron")?.id, "plan-iron");
  assert.equal(resolveDeployPlan(plans, "Minecraft Iron")?.id, "plan-iron");
  assert.equal(resolveDeployPlan(plans, "missing"), null);
});

test("Deploy treats numeric and string plan_locked query values as locked", () => {
  assert.equal(isPlanLockedSearchValue(1), true);
  assert.equal(isPlanLockedSearchValue("1"), true);
  assert.equal(isPlanLockedSearchValue(true), true);
  assert.equal(isPlanLockedSearchValue("true"), true);
  assert.equal(isPlanLockedSearchValue(0), false);
  assert.equal(isPlanLockedSearchValue(undefined), false);
});

test("Deploy locked state selects only the requested Iron plan", () => {
  const state = resolveDeployPlanState({
    plans: [ironPlan, diamondPlan, netheritePlan],
    planId: ironPlan.id,
    planLockedValue: "1",
  });
  assert.equal(state.isPlanLocked, true);
  assert.equal(state.selectedPlan?.id, "plan-iron");
  assert.equal(state.visiblePlans.length, 1);
  assert.equal(state.visiblePlans[0]?.id, "plan-iron");
  assert.equal(state.error, null);
});

test("Deploy direct mode keeps all plans visible", () => {
  const state = resolveDeployPlanState({
    plans: [ironPlan, diamondPlan, netheritePlan],
    planId: ironPlan.id,
    planLockedValue: undefined,
  });
  assert.equal(state.isPlanLocked, false);
  assert.equal(state.selectedPlan?.id, "plan-iron");
  assert.deepEqual(
    state.visiblePlans.map((plan) => plan.id),
    ["plan-iron", "plan-diamond", "plan-netherite"],
  );
});

test("Deploy locked mode with invalid plan shows fallback error and no plan list", () => {
  const state = resolveDeployPlanState({
    plans: [ironPlan, diamondPlan, netheritePlan],
    planId: "missing-plan",
    planLockedValue: "true",
  });
  assert.equal(state.isPlanLocked, true);
  assert.equal(state.selectedPlan, null);
  assert.equal(state.visiblePlans.length, 0);
  assert.equal(state.error, "Impossible de retrouver le plan sélectionné.");
  assert.match(state.failureReason ?? "", /missing-plan/);
});

test("Requested server_type selects compatible template within the same plan", () => {
  const template = resolveCheckoutTemplate({
    plan: ironPlan,
    variants: minecraftVariants,
    requestedVariantIndex: 0,
    requestedServerType: "paper",
  });
  assert.equal(template.selectedVariantIndex, 1);
  assert.equal(template.selectedVariant?.egg_id, 5);
  assert.equal(template.selectedServerType, "paper");
});

test("Checkout rejects a Minecraft template not compatible with the selected plan", () => {
  assert.throws(
    () =>
      resolveCheckoutTemplate({
        plan: ironPlan,
        variants: minecraftVariants,
        requestedVariantIndex: 0,
        requestedServerType: "ark",
      }),
    /pas compatible/,
  );
});

test("Checkout rejects Bungeecord for classic Minecraft when directly selected", () => {
  assert.throws(
    () =>
      resolveCheckoutTemplate({
        plan: ironPlan,
        variants: [{ nest_id: 1, egg_id: 1, label: "Bungeecord", source: "allowed_eggs" }],
        requestedVariantIndex: 0,
      }),
    /pas disponible/,
  );
});

test("Checkout rejects Minecraft server_type forged onto non-Minecraft plan", () => {
  assert.throws(
    () =>
      resolveCheckoutTemplate({
        plan: conanPlan,
        variants: [{ nest_id: 42, egg_id: 88, label: "Conan Exiles", source: "allowed_eggs" }],
        requestedVariantIndex: 0,
        requestedServerType: "paper",
      }),
    /pas disponible/,
  );
});
