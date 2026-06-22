import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isHiddenFromCustomerMetadata } from "@/lib/reconciliation-cleanup";

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
  in: (column: string, values: unknown[]) => SupabaseQuery<T>;
};

type BillingOrder = {
  id: string;
  status: string;
  currency: string;
  total_cents: number;
  current_period_end: string | null;
  renews_at: string | null;
  stripe_subscription_id: string | null;
  created_at: string;
  plans?: { name?: string | null; game?: string | null } | null;
  server_order?: {
    id: string;
    server_name: string | null;
    status: string;
    pterodactyl_server_identifier: string | null;
  } | null;
};

type BillingServerOrder = {
  id: string;
  order_id: string | null;
  server_name: string | null;
  status: string;
  pterodactyl_server_identifier: string | null;
};

type BillingInvoice = {
  id: string;
  invoice_number: string;
  status: string;
  currency: string;
  subtotal_cents: number;
  tax_cents: number;
  total_cents: number;
  due_at: string | null;
  paid_at: string | null;
  created_at: string;
  order_id: string | null;
  stripe_invoice_id?: string | null;
  stripe_hosted_invoice_url?: string | null;
  stripe_invoice_pdf?: string | null;
  invoice_items?: Array<{
    id: string;
    description: string;
    quantity: number;
    unit_amount_cents: number;
    total_cents: number;
  }>;
};

type BillingPayment = {
  id: string;
  provider: string;
  provider_payment_id: string | null;
  status: string;
  currency: string;
  amount_cents: number;
  refunded_cents: number;
  paid_at: string | null;
  failed_at: string | null;
  created_at: string;
  order_id: string | null;
  stripe_payment_intent_id?: string | null;
  stripe_charge_id?: string | null;
  stripe_invoice_id?: string | null;
};

type BillingOrderRow = BillingOrder & { metadata?: unknown };
type BillingServerOrderRow = BillingServerOrder & { metadata?: unknown };

export const listMyBilling = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as unknown as SupabaseAny;

    const [
      { data: invoices, error: invoicesError },
      { data: payments, error: paymentsError },
      { data: orders, error: ordersError },
      { data: servers, error: serversError },
    ] = await Promise.all([
      db
        .from("invoices")
        .select(
          "id, invoice_number, status, currency, subtotal_cents, tax_cents, total_cents, due_at, paid_at, created_at, order_id, stripe_invoice_id, stripe_hosted_invoice_url, stripe_invoice_pdf, invoice_items(id, description, quantity, unit_amount_cents, total_cents)",
        )
        .eq("user_id", context.userId)
        .order("created_at", { ascending: false }),
      db
        .from("payments")
        .select(
          "id, provider, provider_payment_id, status, currency, amount_cents, refunded_cents, paid_at, failed_at, created_at, order_id, stripe_payment_intent_id, stripe_charge_id, stripe_invoice_id",
        )
        .eq("user_id", context.userId)
        .order("created_at", { ascending: false }),
      db
        .from("orders")
        .select(
          "id, status, currency, total_cents, current_period_end, renews_at, stripe_subscription_id, created_at, metadata, plans(name, game)",
        )
        .eq("user_id", context.userId)
        .order("created_at", { ascending: false }),
      db
        .from("server_orders")
        .select("id, order_id, server_name, status, pterodactyl_server_identifier, metadata")
        .eq("user_id", context.userId)
        .order("created_at", { ascending: false }),
    ]);

    if (invoicesError) throw new Error(invoicesError.message);
    if (paymentsError) throw new Error(paymentsError.message);
    if (ordersError) throw new Error(ordersError.message);
    if (serversError) throw new Error(serversError.message);

    const visibleServers = ((servers ?? []) as BillingServerOrderRow[]).filter(
      (server) => !isHiddenFromCustomerMetadata(server.metadata),
    );
    const hiddenOrderIds = new Set(
      ((servers ?? []) as BillingServerOrderRow[])
        .filter((server) => server.order_id && isHiddenFromCustomerMetadata(server.metadata))
        .map((server) => server.order_id as string),
    );
    for (const order of (orders ?? []) as BillingOrderRow[]) {
      if (isHiddenFromCustomerMetadata(order.metadata)) hiddenOrderIds.add(order.id);
    }
    const serversByOrderId = new Map(
      visibleServers
        .filter((server) => server.order_id)
        .map(({ metadata, ...server }) => [server.order_id as string, server]),
    );
    const visibleOrders = ((orders ?? []) as BillingOrderRow[]).filter(
      (order) => !hiddenOrderIds.has(order.id) && !isHiddenFromCustomerMetadata(order.metadata),
    );
    const enrichedOrders = visibleOrders.map(({ metadata, ...order }) => ({
      ...order,
      server_order: serversByOrderId.get(order.id) ?? null,
    }));

    return {
      invoices: ((invoices ?? []) as BillingInvoice[]).filter(
        (invoice) => !invoice.order_id || !hiddenOrderIds.has(invoice.order_id),
      ),
      payments: ((payments ?? []) as BillingPayment[]).filter(
        (payment) => !payment.order_id || !hiddenOrderIds.has(payment.order_id),
      ),
      orders: enrichedOrders,
    };
  });
