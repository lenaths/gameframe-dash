import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CreditCard, ExternalLink, FileText, RefreshCw, Server } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SiteHeader } from "@/components/site-header";
import { listMyBilling } from "@/lib/billing.functions";

export const Route = createFileRoute("/_authenticated/billing")({
  head: () => ({ meta: [{ title: "Billing · XntServers" }] }),
  component: Billing,
});

type Invoice = {
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

type Payment = {
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
  stripe_payment_intent_id?: string | null;
  stripe_charge_id?: string | null;
  stripe_invoice_id?: string | null;
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

function Billing() {
  const fetchBilling = useServerFn(listMyBilling);
  const billing = useQuery({
    queryKey: ["my-billing"],
    queryFn: () => fetchBilling(),
  });

  const invoices = (billing.data?.invoices ?? []) as Invoice[];
  const payments = (billing.data?.payments ?? []) as Payment[];
  const orders = (billing.data?.orders ?? []) as BillingOrder[];
  const activeOrders = orders.filter((order) =>
    ["paid", "active", "provisioning", "provisioning_failed"].includes(order.status),
  );

  return (
    <div className="xnt-page min-h-screen">
      <SiteHeader />
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="mb-3 inline-flex rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs text-primary">
              SaaS billing center
            </div>
            <h1 className="font-display text-4xl font-bold">Billing</h1>
            <p className="mt-1 text-muted-foreground">Invoices and payments for your account.</p>
          </div>
          <Button size="sm" variant="outline" onClick={() => billing.refetch()}>
            <RefreshCw className="mr-1.5 h-4 w-4" /> Refresh
          </Button>
        </div>

        {billing.isLoading ? (
          <div className="text-sm text-muted-foreground">Loading billing data…</div>
        ) : billing.error ? (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
            {(billing.error as Error).message}
          </div>
        ) : (
          <div className="grid gap-8">
            <section>
              <div className="mb-4 flex items-center gap-2">
                <Server className="h-5 w-5 text-primary" />
                <h2 className="font-display text-xl font-semibold">Abonnements actifs</h2>
              </div>
              {activeOrders.length === 0 ? (
                <EmptyState text="Aucun abonnement actif." />
              ) : (
                <div className="grid gap-4 lg:grid-cols-2">
                  {activeOrders.map((order) => (
                    <article key={order.id} className="xnt-card rounded-xl p-5">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <Badge
                            variant="outline"
                            className={`capitalize xnt-status-${order.status}`}
                          >
                            {order.status.replaceAll("_", " ")}
                          </Badge>
                          <h3 className="mt-3 font-display text-xl font-semibold">
                            {order.plans?.game ?? "Game"} · {order.plans?.name ?? "Plan"}
                          </h3>
                          <p className="mt-1 text-sm text-muted-foreground">
                            {order.server_order?.server_name ?? "Serveur en attente"}
                          </p>
                        </div>
                        <div className="text-right">
                          <div className="font-display text-2xl font-bold text-primary">
                            {formatMoney(order.total_cents, order.currency)}
                          </div>
                          <div className="text-xs text-muted-foreground">mensuel</div>
                        </div>
                      </div>
                      <div className="mt-5 grid gap-3 sm:grid-cols-2">
                        <InfoPill
                          label="Renouvellement"
                          value={formatNullableDate(order.current_period_end ?? order.renews_at)}
                        />
                        <InfoPill
                          label="Subscription"
                          value={order.stripe_subscription_id?.slice(0, 18) ?? "—"}
                        />
                      </div>
                      {order.server_order && (
                        <Button asChild size="sm" variant="outline" className="mt-4">
                          <Link to="/manage/$orderId" params={{ orderId: order.server_order.id }}>
                            Gérer le serveur
                          </Link>
                        </Button>
                      )}
                    </article>
                  ))}
                </div>
              )}
            </section>

            <section>
              <div className="mb-4 flex items-center gap-2">
                <FileText className="h-5 w-5 text-primary" />
                <h2 className="font-display text-xl font-semibold">Invoices</h2>
              </div>
              {invoices.length === 0 ? (
                <EmptyState text="No invoices yet." />
              ) : (
                <div className="xnt-card overflow-x-auto rounded-xl">
                  <table className="w-full min-w-[720px] text-sm">
                    <thead className="bg-surface-2 text-left text-muted-foreground">
                      <tr>
                        <th className="p-3">Invoice</th>
                        <th className="p-3">Status</th>
                        <th className="p-3">Date</th>
                        <th className="p-3">Due</th>
                        <th className="p-3 text-right">Total</th>
                        <th className="p-3 text-right">Links</th>
                      </tr>
                    </thead>
                    <tbody>
                      {invoices.map((invoice) => (
                        <tr key={invoice.id} className="border-t border-border/60">
                          <td className="p-3 font-medium">{invoice.invoice_number}</td>
                          <td className="p-3">
                            <Badge
                              variant="outline"
                              className={`capitalize xnt-status-${invoice.status}`}
                            >
                              {invoice.status}
                            </Badge>
                          </td>
                          <td className="p-3 text-muted-foreground">
                            {formatDate(invoice.created_at)}
                          </td>
                          <td className="p-3 text-muted-foreground">
                            {invoice.due_at ? formatDate(invoice.due_at) : "—"}
                          </td>
                          <td className="p-3 text-right font-medium">
                            {formatMoney(invoice.total_cents, invoice.currency)}
                          </td>
                          <td className="p-3">
                            <div className="flex justify-end gap-2">
                              <ExternalUrl
                                href={invoice.stripe_hosted_invoice_url}
                                label="Invoice"
                              />
                              <ExternalUrl href={invoice.stripe_invoice_pdf} label="PDF" />
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section>
              <div className="mb-4 flex items-center gap-2">
                <CreditCard className="h-5 w-5 text-primary" />
                <h2 className="font-display text-xl font-semibold">Payments</h2>
              </div>
              {payments.length === 0 ? (
                <EmptyState text="No payments yet." />
              ) : (
                <div className="xnt-card overflow-x-auto rounded-xl">
                  <table className="w-full min-w-[720px] text-sm">
                    <thead className="bg-surface-2 text-left text-muted-foreground">
                      <tr>
                        <th className="p-3">Provider</th>
                        <th className="p-3">Status</th>
                        <th className="p-3">Date</th>
                        <th className="p-3">Stripe ID</th>
                        <th className="p-3 text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payments.map((payment) => (
                        <tr key={payment.id} className="border-t border-border/60">
                          <td className="p-3 font-medium capitalize">{payment.provider}</td>
                          <td className="p-3">
                            <Badge
                              variant="outline"
                              className={`capitalize xnt-status-${payment.status}`}
                            >
                              {payment.status.replace(/_/g, " ")}
                            </Badge>
                          </td>
                          <td className="p-3 text-muted-foreground">
                            {formatDate(payment.created_at)}
                          </td>
                          <td className="p-3 font-mono text-xs text-muted-foreground">
                            {payment.stripe_payment_intent_id ??
                              payment.stripe_invoice_id ??
                              payment.provider_payment_id ??
                              "—"}
                          </td>
                          <td className="p-3 text-right font-medium">
                            {formatMoney(payment.amount_cents, payment.currency)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="xnt-card rounded-xl border-dashed p-8 text-sm text-muted-foreground">
      {text}
    </div>
  );
}

function InfoPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-primary/15 bg-background/35 p-3">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 truncate font-medium">{value}</div>
    </div>
  );
}

function ExternalUrl({ href, label }: { href?: string | null; label: string }) {
  if (!href) return null;
  return (
    <Button asChild size="sm" variant="outline">
      <a href={href} target="_blank" rel="noreferrer">
        <ExternalLink className="mr-1 h-4 w-4" />
        {label}
      </a>
    </Button>
  );
}

function formatMoney(cents: number, currency: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(cents / 100);
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString();
}

function formatNullableDate(value: string | null | undefined) {
  return value ? formatDate(value) : "—";
}
