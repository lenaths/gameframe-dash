import { createServerFn } from "@tanstack/react-start";

export const listPlans = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("plans")
    .select("id, slug, game, name, description, price_monthly_cents, ram_mb, cpu_percent, disk_mb, sort_order")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  if (error) throw new Error(error.message);
  return { plans: data ?? [] };
});
