import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export type PlanVariant = {
  nest_id: number;
  egg_id: number;
  label: string;
  docker_image?: string;
  startup?: string;
};

export const listPlans = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("plans")
    .select("id, slug, game, name, description, price_monthly_cents, ram_mb, cpu_percent, disk_mb, sort_order, allowed_eggs")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  if (error) throw new Error(error.message);
  return { plans: data ?? [] };
});

/** Returns the plan plus its variants enriched with egg variables fetched live from the panel. */
export const getDeployOptions = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ planId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { getEggDetails, assertPteroConfigured } = await import("@/lib/pterodactyl.server");
    assertPteroConfigured();

    const { data: plan, error } = await supabaseAdmin
      .from("plans").select("*").eq("id", data.planId).eq("is_active", true).single();
    if (error || !plan) throw new Error("Plan not found.");

    const variantsRaw = Array.isArray(plan.allowed_eggs) && plan.allowed_eggs.length > 0
      ? (plan.allowed_eggs as unknown as PlanVariant[])
      : [{ nest_id: plan.pterodactyl_nest_id, egg_id: plan.pterodactyl_egg_id, label: plan.name } as PlanVariant];

    const variants = await Promise.all(
      variantsRaw.map(async (v, i) => {
        const egg = await getEggDetails(v.nest_id, v.egg_id);
        return {
          index: i,
          label: v.label || egg.name,
          eggName: egg.name,
          eggDescription: egg.description,
          variables: egg.variables.filter((vv) => vv.user_viewable),
        };
      }),
    );

    return {
      plan: {
        id: plan.id, slug: plan.slug, game: plan.game, name: plan.name,
        ram_mb: plan.ram_mb, cpu_percent: plan.cpu_percent, disk_mb: plan.disk_mb,
        price_monthly_cents: plan.price_monthly_cents,
      },
      variants,
    };
  });
