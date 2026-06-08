import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const deployInput = z.object({
  planId: z.string().uuid(),
  serverName: z.string().min(2).max(40),
});

const powerInput = z.object({
  orderId: z.string().uuid(),
  signal: z.enum(["start", "stop", "restart", "kill"]),
});

/** List the current user's provisioned servers (from our DB + live status from Pterodactyl). */
export const listMyServers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("server_orders")
      .select("id, server_name, status, pterodactyl_server_identifier, pterodactyl_server_id, error_message, created_at, plans(name, game, ram_mb, cpu_percent, disk_mb)")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { servers: data ?? [] };
  });

/** Provision a new server through the Pterodactyl Application API. */
export const deployServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => deployInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { ptero, getDefaultLocationId, assertPteroConfigured } = await import("@/lib/pterodactyl.server");
    assertPteroConfigured();

    const { data: plan, error: planErr } = await supabaseAdmin
      .from("plans").select("*").eq("id", data.planId).eq("is_active", true).single();
    if (planErr || !plan) throw new Error("Plan not found.");

    // Create the order row in 'provisioning' state.
    const { data: order, error: orderErr } = await supabase
      .from("server_orders")
      .insert({ user_id: userId, plan_id: plan.id, server_name: data.serverName, status: "provisioning" })
      .select("*").single();
    if (orderErr || !order) throw new Error(orderErr?.message ?? "Could not create order.");

    try {
      // Resolve the panel owner: we provision under the admin's panel user id (env), or the first admin user we find.
      const ownerId = Number(process.env.PTERODACTYL_DEFAULT_USER_ID ?? "1");
      const locationId = await getDefaultLocationId();

      const env = (plan.environment as Record<string, unknown>) ?? {};

      const payload = {
        name: data.serverName,
        user: ownerId,
        egg: plan.pterodactyl_egg_id,
        docker_image: plan.docker_image,
        startup: plan.startup,
        environment: env,
        limits: {
          memory: plan.ram_mb,
          swap: plan.swap_mb,
          disk: plan.disk_mb,
          io: plan.io_weight,
          cpu: plan.cpu_percent,
        },
        feature_limits: { databases: 1, allocations: 1, backups: 2 },
        deploy: { locations: [locationId], dedicated_ip: false, port_range: [] },
        start_on_completion: false,
      };

      const created = (await ptero.app("/servers", {
        method: "POST",
        body: JSON.stringify(payload),
      })) as { attributes: { id: number; identifier: string } };

      const { error: updErr } = await supabaseAdmin
        .from("server_orders")
        .update({
          status: "active",
          pterodactyl_server_id: created.attributes.id,
          pterodactyl_server_identifier: created.attributes.identifier,
        })
        .eq("id", order.id);
      if (updErr) throw new Error(updErr.message);

      return { ok: true, orderId: order.id };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await supabaseAdmin
        .from("server_orders")
        .update({ status: "failed", error_message: msg })
        .eq("id", order.id);
      throw new Error(msg);
    }
  });

/** Send a power signal (start/stop/restart/kill) to a server the user owns. */
export const powerServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => powerInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: order, error } = await supabase
      .from("server_orders").select("pterodactyl_server_identifier").eq("id", data.orderId).single();
    if (error || !order?.pterodactyl_server_identifier) throw new Error("Server not found.");

    const { ptero, assertPteroConfigured } = await import("@/lib/pterodactyl.server");
    assertPteroConfigured();

    await ptero.client(`/servers/${order.pterodactyl_server_identifier}/power`, {
      method: "POST",
      body: JSON.stringify({ signal: data.signal }),
    });
    return { ok: true };
  });

/** Live resource snapshot for a single server (used in the dashboard). */
export const getServerResources = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ orderId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: order } = await supabase
      .from("server_orders").select("pterodactyl_server_identifier").eq("id", data.orderId).single();
    if (!order?.pterodactyl_server_identifier) return { state: "unknown" as const };

    const { ptero, assertPteroConfigured } = await import("@/lib/pterodactyl.server");
    assertPteroConfigured();
    const res = (await ptero.client(`/servers/${order.pterodactyl_server_identifier}/resources`)) as {
      attributes: { current_state: string; resources: { memory_bytes: number; cpu_absolute: number; disk_bytes: number } };
    };
    return {
      state: res.attributes.current_state,
      memoryMb: Math.round(res.attributes.resources.memory_bytes / 1024 / 1024),
      cpu: Math.round(res.attributes.resources.cpu_absolute),
      diskMb: Math.round(res.attributes.resources.disk_bytes / 1024 / 1024),
    };
  });
