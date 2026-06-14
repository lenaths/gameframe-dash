import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type SupabaseAny = {
  from: (table: string) => SupabaseQuery;
};

type SupabaseResult<T = unknown> = {
  data: T | null;
  error: { message: string } | null;
};

type SupabaseQuery<T = unknown> = PromiseLike<SupabaseResult<T>> & {
  select: (columns: string) => SupabaseQuery<T>;
  eq: (column: string, value: unknown) => SupabaseQuery<T>;
  order: (column: string, options?: Record<string, unknown>) => SupabaseQuery<T>;
};

export const listMyBilling = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as unknown as SupabaseAny;

    const [{ data: invoices, error: invoicesError }, { data: payments, error: paymentsError }] =
      await Promise.all([
        db
          .from("invoices")
          .select(
            "id, invoice_number, status, currency, subtotal_cents, tax_cents, total_cents, due_at, paid_at, created_at, order_id, invoice_items(id, description, quantity, unit_amount_cents, total_cents)",
          )
          .eq("user_id", context.userId)
          .order("created_at", { ascending: false }),
        db
          .from("payments")
          .select(
            "id, provider, provider_payment_id, status, currency, amount_cents, refunded_cents, paid_at, failed_at, created_at, order_id",
          )
          .eq("user_id", context.userId)
          .order("created_at", { ascending: false }),
      ]);

    if (invoicesError) throw new Error(invoicesError.message);
    if (paymentsError) throw new Error(paymentsError.message);

    return {
      invoices: invoices ?? [],
      payments: payments ?? [],
    };
  });
