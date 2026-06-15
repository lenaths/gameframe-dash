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
};

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
    return provisionPaidOrder(data.orderId);
  });
