/* eslint-disable @typescript-eslint/no-explicit-any */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadDotEnv() {
  const path = resolve(process.cwd(), ".env");
  let text = "";
  try {
    text = readFileSync(path, "utf8");
  } catch {
    return;
  }
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    const key = match[1];
    if (process.env[key] !== undefined) continue;
    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

loadDotEnv();

type Scenario = {
  key: string;
  game: string;
  planSlug: string;
  variantLabel: string;
  serverType?: string;
  minecraftVersion?: string;
  players?: number;
  expectedNest: number;
  expectedEgg: number;
};

type SupabaseAny = {
  from: (table: string) => any;
  auth: any;
};

type AuditRow = {
  game: string;
  plan: string;
  variant: string;
  expectedNest: number;
  actualNest: number | null;
  expectedEgg: number;
  actualEgg: number | null;
  orderId: string | null;
  serverOrderId: string | null;
  pterodactylServerId: number | null;
  pterodactylIdentifier: string | null;
  checkoutMetadata: string;
  serverOrderMetadata: string;
  provisioningResult: string;
  syncResult: string;
  result: "PASS" | "FAIL" | "WARNING";
  error?: string;
};

const scenarios: Scenario[] = [
  {
    key: "minecraft-paper",
    game: "Minecraft",
    planSlug: "mc-iron",
    variantLabel: "Paper",
    serverType: "paper",
    minecraftVersion: "1.21.4",
    players: 10,
    expectedNest: 1,
    expectedEgg: 5,
  },
  {
    key: "minecraft-forge",
    game: "Minecraft",
    planSlug: "mc-iron",
    variantLabel: "Forge",
    serverType: "forge",
    minecraftVersion: "1.20.1",
    players: 10,
    expectedNest: 1,
    expectedEgg: 4,
  },
  {
    key: "conan",
    game: "Conan Exiles",
    planSlug: "conan-basic",
    variantLabel: "Hyborian",
    expectedNest: 2,
    expectedEgg: 15,
  },
  {
    key: "ark",
    game: "ARK",
    planSlug: "ark-starter",
    variantLabel: "Survivor",
    expectedNest: 2,
    expectedEgg: 10,
  },
  {
    key: "gmod",
    game: "Garry's Mod",
    planSlug: "gmod-basic",
    variantLabel: "Sandbox",
    expectedNest: 2,
    expectedEgg: 7,
  },
];

function arg(name: string) {
  return process.argv.includes(name);
}

function compact(value: unknown) {
  if (!value || typeof value !== "object") return value == null ? "none" : String(value);
  const json = JSON.stringify(value);
  return json.length > 420 ? `${json.slice(0, 417)}...` : json;
}

function nowIso() {
  return new Date().toISOString();
}

function normalizeType(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

async function main() {
  const execute = arg("--execute");
  const keep = arg("--keep");
  const cleanupOnly = arg("--cleanup-only");
  const runIdArg = process.argv.find((entry) => entry.startsWith("--run-id="));
  const runId =
    runIdArg?.split("=")[1]?.trim() || `staging-${Date.now()}-${randomUUID().slice(0, 8)}`;

  if (!execute && !cleanupOnly) {
    console.log("Dry-run only. Re-run with --execute to create staging test servers.");
    console.log("Optional: --keep leaves created servers active for manual inspection.");
    console.log("Cleanup only: --cleanup-only --run-id=<runId>");
    console.table(
      scenarios.map((s) => ({
        game: s.game,
        plan: s.planSlug,
        variant: s.variantLabel,
        expectedNest: s.expectedNest,
        expectedEgg: s.expectedEgg,
      })),
    );
    return;
  }

  const { supabaseAdmin } = await import("../src/integrations/supabase/client.server");
  const { ptero, getServerStartupApp } = await import("../src/lib/pterodactyl.server");
  const { provisionPaidOrder } = await import("../src/lib/provisioning.server");
  const { loadPlanTemplateVariants } = await import("../src/lib/plans.functions");
  const { buildCheckoutPricing, buildOrderMetadata, resolveCheckoutTemplate } =
    await import("../src/lib/checkout-pricing");
  const { isMinecraftGame } = await import("../src/lib/game-config");

  const db = supabaseAdmin as unknown as SupabaseAny;

  if (cleanupOnly) {
    await cleanupByRunId(db, ptero, runId);
    return;
  }

  const createdServerIds: number[] = [];
  const createdOrderIds: string[] = [];
  const createdServerOrderIds: string[] = [];
  const rows: AuditRow[] = [];
  const email = `xnt-staging-${runId.replace(/[^a-zA-Z0-9]/g, "-")}@example.invalid`.slice(0, 120);
  let stagingUserId: string | null = null;

  try {
    const userResult = await db.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: {
        display_name: `XNT Staging ${runId}`,
        staging_provisioning_audit: true,
        run_id: runId,
      },
    });
    if (userResult.error || !userResult.data.user) {
      throw new Error(userResult.error?.message ?? "Could not create staging auth user.");
    }
    stagingUserId = userResult.data.user.id;
    await db.from("profiles").upsert({
      id: stagingUserId,
      email,
      display_name: `XNT Staging ${runId}`,
      metadata: { staging_provisioning_audit: true, run_id: runId },
    });

    for (const scenario of scenarios) {
      const row = await runScenario({
        db,
        ptero,
        getServerStartupApp,
        provisionPaidOrder,
        loadPlanTemplateVariants,
        buildCheckoutPricing,
        buildOrderMetadata,
        resolveCheckoutTemplate,
        isMinecraftGame,
        scenario,
        runId,
        userId: stagingUserId,
      });
      rows.push(row);
      if (row.orderId) createdOrderIds.push(row.orderId);
      if (row.serverOrderId) createdServerOrderIds.push(row.serverOrderId);
      if (row.pterodactylServerId) {
        createdServerIds.push(row.pterodactylServerId);
      }
      console.log(`[staging-audit] ${row.game} ${row.variant}: ${row.result} ${row.error ?? ""}`);
    }
  } finally {
    if (!keep) {
      await cleanupCreated({
        db,
        ptero,
        serverIds: createdServerIds,
        serverOrderIds: createdServerOrderIds,
        orderIds: createdOrderIds,
        userId: stagingUserId,
      });
    } else {
      console.warn(`[staging-audit] --keep used. Created resources remain active. runId=${runId}`);
    }
  }

  console.log(`\nRun ID: ${runId}`);
  console.table(
    rows.map((row) => ({
      Game: row.game,
      Plan: row.plan,
      Variant: row.variant,
      ExpectedNest: row.expectedNest,
      ActualNest: row.actualNest,
      ExpectedEgg: row.expectedEgg,
      ActualEgg: row.actualEgg,
      Order: row.orderId,
      ServerOrder: row.serverOrderId,
      Ptero: row.pterodactylServerId,
      Provisioning: row.provisioningResult,
      Sync: row.syncResult,
      Status: row.result,
    })),
  );
  console.log("\nDetailed rows:");
  console.log(JSON.stringify(rows, null, 2));
}

async function runScenario(ctx: any): Promise<AuditRow> {
  const {
    db,
    ptero,
    getServerStartupApp,
    provisionPaidOrder,
    loadPlanTemplateVariants,
    buildCheckoutPricing,
    buildOrderMetadata,
    resolveCheckoutTemplate,
    isMinecraftGame,
    scenario,
    runId,
    userId,
  } = ctx;
  const planResult = await db
    .from("plans")
    .select("*")
    .eq("slug", scenario.planSlug)
    .eq("is_active", true)
    .single();
  const plan = planResult.data;
  if (planResult.error || !plan) {
    return failedRow(scenario, `Plan ${scenario.planSlug} introuvable ou inactif.`);
  }

  const variants = await loadPlanTemplateVariants(plan);
  const requestedVariant = variants.find((variant: any) => {
    if (scenario.serverType)
      return normalizeType(variant.label) === normalizeType(scenario.serverType);
    return normalizeType(variant.label) === normalizeType(scenario.variantLabel);
  });
  const requestedVariantIndex = requestedVariant ? variants.indexOf(requestedVariant) : 0;
  const pricing = buildCheckoutPricing(plan, scenario.players);
  const template = resolveCheckoutTemplate({
    plan,
    variants,
    requestedVariantIndex,
    requestedServerType: scenario.serverType ?? null,
    requestedMinecraftVersion: scenario.minecraftVersion ?? null,
  });
  const metadataResult = buildOrderMetadata({
    plan,
    serverName: `STAGING ${scenario.variantLabel} ${runId.slice(-8)}`.slice(0, 40),
    pricing,
    template,
    environment: {},
  });
  const metadata = {
    ...metadataResult.metadata,
    source: "staging_provisioning_audit",
    staging: true,
    run_id: runId,
    scenario: scenario.key,
    created_at: nowIso(),
  };

  const orderResult = await db
    .from("orders")
    .insert({
      user_id: userId,
      product_id: plan.product_id ?? null,
      plan_id: plan.id,
      status: "paid",
      currency: (plan.currency ?? "EUR").toUpperCase(),
      subtotal_cents: pricing.total_price_cents ?? plan.price_monthly_cents,
      tax_cents: 0,
      total_cents: pricing.total_price_cents ?? plan.price_monthly_cents,
      billing_interval: plan.billing_interval ?? "monthly",
      starts_at: nowIso(),
      metadata,
    })
    .select("id, metadata")
    .single();
  const order = orderResult.data;
  if (orderResult.error || !order)
    return failedRow(scenario, orderResult.error?.message ?? "Order insert failed.");

  let provisionResult: any;
  try {
    provisionResult = await provisionPaidOrder(order.id, {
      source: "admin_retry",
      actorUserId: userId,
    });
  } catch (error) {
    return {
      ...failedRow(scenario, error instanceof Error ? error.message : String(error)),
      orderId: order.id,
      checkoutMetadata: compact(order.metadata),
    };
  }

  const serverOrderResult = await db
    .from("server_orders")
    .select("*")
    .eq("order_id", order.id)
    .maybeSingle();
  const serverOrder = serverOrderResult.data;
  if (serverOrderResult.error || !serverOrder) {
    return {
      ...failedRow(
        scenario,
        serverOrderResult.error?.message ?? "server_order absent après provisioning.",
      ),
      orderId: order.id,
      checkoutMetadata: compact(order.metadata),
      provisioningResult: compact(provisionResult),
    };
  }

  let actualNest: number | null = null;
  let actualEgg: number | null = null;
  let startup = "not fetched";
  let image = "not fetched";
  let environmentKeys: string[] = [];
  let pteroStatus = "not fetched";
  if (serverOrder.pterodactyl_server_id) {
    try {
      const startupInfo = await getServerStartupApp(serverOrder.pterodactyl_server_id);
      actualNest = Number(startupInfo.nest);
      actualEgg = Number(startupInfo.egg);
      startup = startupInfo.startup;
      image = startupInfo.image;
      environmentKeys = Object.keys(startupInfo.environment ?? {}).sort();
      const fetched = (await ptero.app(`/servers/${serverOrder.pterodactyl_server_id}`)) as any;
      pteroStatus = String(fetched?.attributes?.status ?? "active/null");
    } catch (error) {
      pteroStatus = `fetch failed: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  const syncMeta =
    serverOrder.metadata?.initial_minecraft_sync ??
    serverOrder.metadata?.server_settings_sync ??
    null;
  const syncResult = syncMeta
    ? compact(syncMeta)
    : isMinecraftGame(plan.game)
      ? "missing"
      : "not required/pending";
  const metadataOk = validateMetadata(plan.game, serverOrder.metadata, scenario);
  const result =
    actualNest === scenario.expectedNest &&
    actualEgg === scenario.expectedEgg &&
    metadataOk.ok &&
    provisionResult?.ok !== false
      ? "PASS"
      : "FAIL";

  return {
    game: scenario.game,
    plan: plan.name,
    variant: scenario.variantLabel,
    expectedNest: scenario.expectedNest,
    actualNest,
    expectedEgg: scenario.expectedEgg,
    actualEgg,
    orderId: order.id,
    serverOrderId: serverOrder.id,
    pterodactylServerId: serverOrder.pterodactyl_server_id ?? null,
    pterodactylIdentifier: serverOrder.pterodactyl_server_identifier ?? null,
    checkoutMetadata: compact(order.metadata),
    serverOrderMetadata: compact(serverOrder.metadata),
    provisioningResult: compact({
      ...provisionResult,
      pteroStatus,
      image,
      startup,
      environmentKeys,
    }),
    syncResult,
    result,
    ...(metadataOk.ok ? {} : { error: metadataOk.error }),
  };
}

function validateMetadata(game: string, metadata: any, scenario: Scenario) {
  const selectedGame = String(metadata?.selected_game ?? "");
  const minecraft = game.toLowerCase().includes("minecraft");
  if (minecraft) {
    if (selectedGame !== "minecraft") return { ok: false, error: `selected_game=${selectedGame}` };
    if (metadata?.egg_id === 1 || metadata?.selected_template?.egg_id === 1) {
      return { ok: false, error: "Bungeecord/Egg 1 selected for classic Minecraft." };
    }
    if (
      metadata?.egg_id !== scenario.expectedEgg &&
      metadata?.selected_template?.egg_id !== scenario.expectedEgg
    ) {
      return {
        ok: false,
        error: `metadata egg mismatch: ${metadata?.egg_id}/${metadata?.selected_template?.egg_id}`,
      };
    }
    if (!metadata?.max_players)
      return { ok: false, error: "max_players missing from Minecraft metadata." };
    return { ok: true };
  }
  if (["paper", "forge", "vanilla"].includes(String(metadata?.server_type ?? "").toLowerCase())) {
    return { ok: false, error: `Minecraft server_type leaked into ${game}.` };
  }
  return { ok: true };
}

function failedRow(scenario: Scenario, error: string): AuditRow {
  return {
    game: scenario.game,
    plan: scenario.planSlug,
    variant: scenario.variantLabel,
    expectedNest: scenario.expectedNest,
    actualNest: null,
    expectedEgg: scenario.expectedEgg,
    actualEgg: null,
    orderId: null,
    serverOrderId: null,
    pterodactylServerId: null,
    pterodactylIdentifier: null,
    checkoutMetadata: "none",
    serverOrderMetadata: "none",
    provisioningResult: "failed",
    syncResult: "not run",
    result: "FAIL",
    error,
  };
}

async function cleanupCreated(input: {
  db: SupabaseAny;
  ptero: any;
  serverIds: number[];
  serverOrderIds: string[];
  orderIds: string[];
  userId: string | null;
}) {
  for (const serverId of input.serverIds) {
    try {
      await input.ptero.app(`/servers/${serverId}`, {
        method: "DELETE",
        body: "",
        contentType: null,
      });
      console.log(`[cleanup] deleted Pterodactyl server ${serverId}`);
    } catch (error) {
      try {
        await input.ptero.app(`/servers/${serverId}/force`, {
          method: "DELETE",
          body: "",
          contentType: null,
        });
        console.log(`[cleanup] force deleted Pterodactyl server ${serverId}`);
      } catch (forceError) {
        console.error(
          `[cleanup] could not delete Pterodactyl server ${serverId}: ${String(error)} / ${String(forceError)}`,
        );
      }
    }
  }
  if (input.serverOrderIds.length)
    await input.db.from("server_orders").delete().in("id", input.serverOrderIds);
  if (input.orderIds.length) await input.db.from("orders").delete().in("id", input.orderIds);
  if (input.userId) {
    try {
      await input.db.auth.admin.deleteUser(input.userId);
      console.log(`[cleanup] deleted staging auth user ${input.userId}`);
    } catch (error) {
      console.warn(
        `[cleanup] could not delete staging auth user ${input.userId}: ${String(error)}`,
      );
    }
  }
}

async function cleanupByRunId(db: SupabaseAny, ptero: any, runId: string) {
  const serverOrdersResult = await db
    .from("server_orders")
    .select("id, order_id, user_id, pterodactyl_server_id, metadata")
    .contains("metadata", { run_id: runId, staging: true });
  const serverOrders = serverOrdersResult.data ?? [];
  const serverIds = serverOrders.map((row: any) => row.pterodactyl_server_id).filter(Boolean);
  const serverOrderIds = serverOrders.map((row: any) => row.id).filter(Boolean);
  const orderIds = serverOrders.map((row: any) => row.order_id).filter(Boolean);
  const userIds = Array.from(new Set(serverOrders.map((row: any) => row.user_id).filter(Boolean)));
  await cleanupCreated({ db, ptero, serverIds, serverOrderIds, orderIds, userId: null });
  for (const userId of userIds) {
    try {
      await db.auth.admin.deleteUser(userId);
    } catch {
      // Staging cleanup is best-effort; server resources were already targeted above.
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
