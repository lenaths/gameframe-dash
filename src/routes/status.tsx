import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  CircleHelp,
  RefreshCw,
  XCircle,
} from "lucide-react";
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
              Vue publique de santé XNTServers, avec checks légers et sans exposition de secrets.
            </p>
          </div>
          <Button variant="outline" onClick={() => status.refetch()} disabled={status.isFetching}>
            <RefreshCw className={`mr-2 h-4 w-4 ${status.isFetching ? "animate-spin" : ""}`} />
            Rafraîchir
          </Button>
        </div>

        {status.error && (
          <div className="mb-6 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
            {(status.error as Error).message}
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {(status.data?.services ?? []).map((service) => (
            <article
              key={service.name}
              className="xnt-card rounded-xl p-5 shadow-[0_0_36px_rgba(0,191,255,0.08)]"
            >
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

        <div className="mt-6 rounded-xl border border-primary/15 bg-surface/70 p-4 text-sm text-muted-foreground">
          Dernière vérification :{" "}
          <span className="text-foreground">
            {status.data?.checkedAt ? new Date(status.data.checkedAt).toLocaleString() : "—"}
          </span>
          <div className="mt-1">
            Les checks Stripe et Resend valident uniquement la configuration serveur. Aucun appel
            lourd ni secret n’est retourné par cette page.
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}

function ServiceBadge({ status }: { status: "Operational" | "Degraded" | "Down" | "Unknown" }) {
  const Icon =
    status === "Operational"
      ? CheckCircle2
      : status === "Degraded"
        ? AlertTriangle
        : status === "Down"
          ? XCircle
          : CircleHelp;
  const className =
    status === "Operational"
      ? "xnt-status-active"
      : status === "Degraded"
        ? "xnt-status-provisioning"
        : status === "Down"
          ? "xnt-status-failed"
          : "border-muted-foreground/40 bg-muted/20 text-muted-foreground";
  return (
    <Badge variant="outline" className={className}>
      <Icon className="mr-1 h-3.5 w-3.5" />
      {status}
    </Badge>
  );
}
