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
};
type ServerDetailRow = ServerLinkRow & {
  user_id: string | null;
  plan_id: string | null;
  server_name: string;
  created_at: string;
  plans?: PlanRef;
};
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

async function getProfilesById(userIds: Array<string | null | undefined>) {
  const ids = [...new Set(userIds.filter((id): id is string => Boolean(id)))];
  if (ids.length === 0) return new Map<string, { id: string; email: string | null }>();

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.from("profiles").select("id, email").in("id", ids);
  if (error) throw new Error(error.message);

  return new Map((data ?? []).map((profile) => [profile.id, profile satisfies ProfileRef]));
}

async function assertAdmin(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (!data) throw new Error("Admin access required.");
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
            "id, user_id, plan_id, status, total_cents, currency, stripe_subscription_id, stripe_checkout_session_id, created_at, plans(name, game)",
          )
          .order("created_at", { ascending: false })
          .limit(100),
        db
          .from("server_orders")
          .select(
            "id, order_id, status, error_message, pterodactyl_server_id, pterodactyl_server_identifier",
          ),
      ]);
    if (ordersError) throw new Error(ordersError.message);
    if (serversError) throw new Error(serversError.message);

    const orderRows = (orders ?? []) as OrderRow[];
    const profilesById = await getProfilesById(orderRows.map((order) => order.user_id));
    const serversByOrder = new Map(
      ((servers ?? []) as ServerLinkRow[])
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
        "id, order_id, user_id, plan_id, server_name, status, pterodactyl_server_id, pterodactyl_server_identifier, error_message, created_at, plans(name, game)",
      )
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    const servers = (data ?? []) as ServerDetailRow[];
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
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { ptero, assertPteroAppConfigured } = await import("@/lib/pterodactyl.server");
    assertPteroAppConfigured();

    const { data: order, error: orderError } = await supabaseAdmin
      .from("server_orders")
      .select("id, pterodactyl_server_id")
      .eq("id", data.serverOrderId)
      .maybeSingle();
    if (orderError || !order?.pterodactyl_server_id) {
      throw new Error(orderError?.message ?? "Server order has no Pterodactyl server id.");
    }

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
      .update({ status, error_message: status === "failed" ? "Pterodactyl install failed." : null })
      .eq("id", data.serverOrderId);
    if (updateError) throw new Error(updateError.message);
    return { ok: true, status };
  });
