import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Activity, CheckCircle2, AlertTriangle, XCircle } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getPlatformStatus } from "@/lib/status.functions";

export const Route = createFileRoute("/status")({
  head: () => ({ meta: [{ title: "Status · XNT Servers" }] }),
  component: StatusPage,
});

function StatusPage() {
  const fetchStatus = useServerFn(getPlatformStatus);
  const status = useQuery({ queryKey: ["platform-status"], queryFn: () => fetchStatus() });

  return (
    <div className="xnt-page min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="mb-3 inline-flex rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs text-primary">
              XNT status
            </div>
            <h1 className="font-display text-4xl font-bold">Platform status</h1>
            <p className="mt-2 text-muted-foreground">
              Simple beta health view for API, Stripe, Supabase and Pterodactyl.
            </p>
          </div>
          <Button variant="outline" onClick={() => status.refetch()}>
            Refresh
          </Button>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {(status.data?.services ?? []).map((service) => (
            <article key={service.name} className="xnt-card rounded-xl p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="grid h-11 w-11 place-items-center rounded-lg border border-primary/25 bg-primary/10 text-primary">
                    <Activity className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="font-display text-xl font-semibold">{service.name}</h2>
                    <p className="mt-1 text-sm text-muted-foreground">{service.detail}</p>
                  </div>
                </div>
                <ServiceBadge status={service.status} />
              </div>
            </article>
          ))}
        </div>

        <div className="mt-6 text-sm text-muted-foreground">
          Last check:{" "}
          {status.data?.checkedAt ? new Date(status.data.checkedAt).toLocaleString() : "—"}
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}

function ServiceBadge({ status }: { status: "Operational" | "Degraded" | "Down" }) {
  const Icon =
    status === "Operational" ? CheckCircle2 : status === "Degraded" ? AlertTriangle : XCircle;
  const className =
    status === "Operational"
      ? "xnt-status-active"
      : status === "Degraded"
        ? "xnt-status-provisioning"
        : "xnt-status-failed";
  return (
    <Badge variant="outline" className={className}>
      <Icon className="mr-1 h-3.5 w-3.5" />
      {status}
    </Badge>
  );
}
