import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CreditCard, FileText, RefreshCw } from "lucide-react";
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
};

function Billing() {
  const fetchBilling = useServerFn(listMyBilling);
  const billing = useQuery({
    queryKey: ["my-billing"],
    queryFn: () => fetchBilling(),
  });

  const invoices = (billing.data?.invoices ?? []) as Invoice[];
  const payments = (billing.data?.payments ?? []) as Payment[];

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <div className="mx-auto max-w-6xl px-6 py-10">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
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
                <FileText className="h-5 w-5 text-primary" />
                <h2 className="font-display text-xl font-semibold">Invoices</h2>
              </div>
              {invoices.length === 0 ? (
                <EmptyState text="No invoices yet." />
              ) : (
                <div className="overflow-x-auto rounded-xl border border-border/60">
                  <table className="w-full min-w-[720px] text-sm">
                    <thead className="bg-surface-2 text-left text-muted-foreground">
                      <tr>
                        <th className="p-3">Invoice</th>
                        <th className="p-3">Status</th>
                        <th className="p-3">Date</th>
                        <th className="p-3">Due</th>
                        <th className="p-3 text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {invoices.map((invoice) => (
                        <tr key={invoice.id} className="border-t border-border/60">
                          <td className="p-3 font-medium">{invoice.invoice_number}</td>
                          <td className="p-3">
                            <Badge variant="outline" className="capitalize">
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
                <EmptyState text="No payments yet. Stripe is not connected at this stage." />
              ) : (
                <div className="overflow-x-auto rounded-xl border border-border/60">
                  <table className="w-full min-w-[720px] text-sm">
                    <thead className="bg-surface-2 text-left text-muted-foreground">
                      <tr>
                        <th className="p-3">Provider</th>
                        <th className="p-3">Status</th>
                        <th className="p-3">Date</th>
                        <th className="p-3 text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payments.map((payment) => (
                        <tr key={payment.id} className="border-t border-border/60">
                          <td className="p-3 font-medium capitalize">{payment.provider}</td>
                          <td className="p-3">
                            <Badge variant="outline" className="capitalize">
                              {payment.status.replace(/_/g, " ")}
                            </Badge>
                          </td>
                          <td className="p-3 text-muted-foreground">
                            {formatDate(payment.created_at)}
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
    <div className="rounded-xl border border-dashed border-border bg-surface p-8 text-sm text-muted-foreground">
      {text}
    </div>
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
