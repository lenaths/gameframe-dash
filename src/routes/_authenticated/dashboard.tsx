import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Play,
  Square,
  RotateCw,
  Server as ServerIcon,
  Plus,
  ShieldAlert,
  Settings,
  Copy,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { SiteHeader } from "@/components/site-header";
import { getServerDetail, listMyServers, powerServer } from "@/lib/servers.functions";
import { checkIsAdmin } from "@/lib/admin.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard · XntServers" }] }),
  component: Dashboard,
});

const statusColor: Record<string, string> = {
  active: "xnt-status-active",
  running: "xnt-status-active",
  paid: "xnt-status-paid",
  provisioning: "xnt-status-provisioning",
  installing: "xnt-status-installing",
  pending: "xnt-status-pending",
  pending_payment: "xnt-status-pending_payment",
  failed: "xnt-status-failed",
  provisioning_failed: "xnt-status-provisioning_failed",
  suspended: "text-muted-foreground bg-muted border-border",
  cancelled: "xnt-status-cancelled",
};

function isServerUsable(status: string) {
  return status === "active" || status === "running";
}

function statusDescription(status: string) {
  const descriptions: Record<string, string> = {
    pending_payment: "Paiement en attente avant préparation du serveur.",
    paid: "Paiement reçu, préparation du serveur en attente.",
    provisioning: "Préparation en cours sur l’infrastructure XNT.",
    installing: "Installation serveur en cours.",
    active: "Serveur prêt à être géré.",
    running: "Serveur en ligne et prêt à jouer.",
    failed: "Une erreur est survenue, le support peut vous aider.",
    provisioning_failed: "La préparation a échoué, contactez le support ou attendez une relance.",
    suspended: "Serveur suspendu, vérifiez votre facturation ou contactez le support.",
    cancelled: "Abonnement annulé.",
  };
  return descriptions[status] ?? "Statut serveur en cours de synchronisation.";
}

function Dashboard() {
  const fetchServers = useServerFn(listMyServers);
  const fetchAdmin = useServerFn(checkIsAdmin);
  const sendPower = useServerFn(powerServer);
  const fetchDetail = useServerFn(getServerDetail);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({ queryKey: ["my-servers"], queryFn: () => fetchServers() });
  const { data: adminData } = useQuery({ queryKey: ["is-admin"], queryFn: () => fetchAdmin() });

  const waitForStateChange = async (orderId: string, previousState: string | null) => {
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
      await new Promise((resolve) => window.setTimeout(resolve, 2_000));
      const next = await fetchDetail({ data: { orderId } });
      const nextState = next.live?.state ?? null;
      if (nextState && nextState !== previousState) return nextState;
    }
    return null;
  };

  const power = useMutation({
    mutationFn: async (vars: { orderId: string; signal: "start" | "stop" | "restart" }) => {
      const before = await fetchDetail({ data: { orderId: vars.orderId } });
      const previousState = before.live?.state ?? null;
      await sendPower({ data: vars });
      toast.info("Signal envoyé, attente du changement d’état…");
      return {
        ...vars,
        previousState,
        nextState: await waitForStateChange(vars.orderId, previousState),
      };
    },
    onSuccess: (result) => {
      if (result.nextState) {
        toast.success(
          `${result.signal} confirmé: ${result.previousState ?? "unknown"} → ${result.nextState}`,
        );
      } else {
        toast.warning("Signal envoyé, mais aucun changement d’état détecté après 30 secondes.");
      }
      qc.invalidateQueries({ queryKey: ["my-servers"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="xnt-page min-h-screen">
      <SiteHeader />
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="flex items-end justify-between mb-8 gap-4 flex-wrap">
          <div>
            <div className="mb-3 inline-flex rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs text-primary">
              Live command center
            </div>
            <h1 className="font-display text-4xl font-bold">Your servers</h1>
            <p className="text-muted-foreground mt-1">
              Monitor provisioning, power state and server controls.
            </p>
          </div>
          <div className="flex gap-2">
            {adminData?.isAdmin && (
              <Button asChild variant="outline">
                <Link to="/admin">
                  <ShieldAlert className="mr-2 h-4 w-4" /> Admin
                </Link>
              </Button>
            )}
            <Button
              asChild
              className="bg-primary text-primary-foreground shadow-[0_0_28px_rgba(0,191,255,0.22)] hover:bg-primary/90"
            >
              <Link to="/pricing">
                <Plus className="mr-2 h-4 w-4" /> Deploy new server
              </Link>
            </Button>
          </div>
        </div>

        {isLoading ? (
          <div className="text-muted-foreground">Loading…</div>
        ) : (data?.servers ?? []).length === 0 ? (
          <div className="xnt-card rounded-xl border-dashed p-12 text-center">
            <ServerIcon className="h-10 w-10 text-muted-foreground mx-auto mb-4" />
            <h3 className="font-display text-xl font-semibold">No servers yet</h3>
            <p className="text-muted-foreground mt-1">
              Get started by deploying your first game server.
            </p>
            <Button asChild className="mt-6 bg-primary text-primary-foreground hover:bg-primary/90">
              <Link to="/pricing">Browse plans</Link>
            </Button>
          </div>
        ) : (
          <div className="grid gap-4">
            {(data?.servers ?? []).map((s) => (
              <ServerCard
                key={s.id}
                server={s as DashboardServer}
                powerPending={power.isPending}
                onPower={power.mutate}
                onFetchDetail={(orderId) => fetchDetail({ data: { orderId } })}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

type DashboardServer = {
  id: string;
  server_name: string;
  status: string;
  error_message: string | null;
  created_at: string;
  last_payment_at?: string | null;
  next_renewal_at?: string | null;
  plans?: {
    game?: string | null;
    name?: string | null;
    ram_mb?: number | null;
    cpu_percent?: number | null;
    disk_mb?: number | null;
  } | null;
};

function ServerCard({
  server: s,
  powerPending,
  onPower,
  onFetchDetail,
}: {
  server: DashboardServer;
  powerPending: boolean;
  onPower: (vars: { orderId: string; signal: "start" | "stop" | "restart" }) => void;
  onFetchDetail: (orderId: string) => Promise<{
    live?: {
      connection?: {
        address: string | null;
        port: number | null;
        sftpHost: string | null;
        sftpPort: number | null;
        sftpUsername: string | null;
        identifier: string | null;
      };
    } | null;
  }>;
}) {
  const status = String(s.status);
  const copyConnection = async () => {
    try {
      const detail = await onFetchDetail(s.id);
      const connection = detail.live?.connection;
      const lines: string[] = [];
      if (connection?.address && connection.port) {
        lines.push(`Adresse : ${connection.address}:${connection.port}`);
      }
      if (connection?.sftpHost && connection.sftpPort) {
        lines.push(`SFTP : ${connection.sftpHost}:${connection.sftpPort}`);
      }
      if (connection?.sftpUsername) lines.push(`Utilisateur SFTP : ${connection.sftpUsername}`);
      lines.push(`Identifiant serveur : ${s.id}`);
      if (lines.length === 0) {
        toast.warning("Informations de connexion indisponibles.");
        return;
      }
      await navigator.clipboard.writeText(`Serveur XNTServers\n${lines.join("\n")}`);
      toast.success("Connexion copiée.");
    } catch (error) {
      toast.error((error as Error).message);
    }
  };
  return (
    <div className="xnt-card xnt-card-hover rounded-xl p-5">
      <div className="flex flex-wrap items-center justify-between gap-5">
        <div className="flex items-center gap-4">
          <div className="grid h-14 w-14 place-items-center rounded-lg border border-primary/25 bg-primary/10 text-primary shadow-[0_0_24px_rgba(0,191,255,0.12)]">
            <ServerIcon className="h-6 w-6" />
          </div>
          <div>
            <div className="font-display text-xl font-semibold">{s.server_name}</div>
            <div className="text-sm text-muted-foreground">
              {s.plans?.game} · {s.plans?.name} · {((s.plans?.ram_mb ?? 0) / 1024).toFixed(0)} GB
              RAM
            </div>
            <div className="mt-2 grid gap-2 text-xs text-muted-foreground sm:grid-cols-3">
              <span>Créé: {formatDate(s.created_at)}</span>
              <span>Paiement: {formatDate(s.last_payment_at)}</span>
              <span>Renouvellement: {formatDate(s.next_renewal_at)}</span>
            </div>
            {s.error_message && (
              <div className="mt-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {s.error_message}
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span
            className={`rounded-full border px-2.5 py-1 text-xs uppercase tracking-wider ${statusColor[status] ?? ""}`}
          >
            {status}
          </span>
          {isServerUsable(status) && (
            <div className="flex gap-1.5 items-center">
              <Button
                size="sm"
                variant="outline"
                disabled={powerPending}
                onClick={() => onPower({ orderId: s.id, signal: "start" })}
              >
                <Play className="h-4 w-4" />
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={powerPending}
                onClick={() => onPower({ orderId: s.id, signal: "restart" })}
              >
                <RotateCw className="h-4 w-4" />
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={powerPending}
                onClick={() => onPower({ orderId: s.id, signal: "stop" })}
              >
                <Square className="h-4 w-4" />
              </Button>
              <Button
                asChild
                size="sm"
                className="bg-primary text-primary-foreground hover:bg-primary/90"
              >
                <Link to="/manage/$orderId" params={{ orderId: s.id }}>
                  <Settings className="h-4 w-4 mr-1.5" /> Manage
                </Link>
              </Button>
            </div>
          )}
        </div>
      </div>
      <p className="mt-3 text-sm text-muted-foreground">{statusDescription(status)}</p>
      <ProvisioningTimeline status={status} />
      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        <ResourcePill label="RAM" value={`${((s.plans?.ram_mb ?? 0) / 1024).toFixed(0)} GB`} />
        <ResourcePill label="CPU" value={`${s.plans?.cpu_percent ?? 0}%`} />
        <ResourcePill label="Disque" value={`${((s.plans?.disk_mb ?? 0) / 1024).toFixed(0)} GB`} />
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button asChild size="sm" variant="outline">
          <Link to="/billing">Voir la facturation</Link>
        </Button>
        {isServerUsable(status) && (
          <>
            <Button size="sm" variant="outline" onClick={copyConnection}>
              <Copy className="mr-1.5 h-4 w-4" /> Copier connexion
            </Button>
            <Button
              asChild
              size="sm"
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              <Link to="/manage/$orderId" params={{ orderId: s.id }}>
                Gérer
              </Link>
            </Button>
          </>
        )}
        {(status === "failed" || status === "provisioning_failed") && (
          <Button asChild size="sm" variant="outline">
            <Link
              to="/support"
              search={
                {
                  subject: `Erreur provisioning serveur ${s.server_name}`,
                  orderId: s.id,
                } as never
              }
            >
              Contacter le support
            </Link>
          </Button>
        )}
      </div>
    </div>
  );
}

function ResourcePill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-primary/15 bg-background/35 p-3">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 font-display text-lg font-semibold text-primary">{value}</div>
    </div>
  );
}

function formatDate(value?: string | null) {
  return value ? new Date(value).toLocaleDateString() : "—";
}

function ProvisioningTimeline({ status }: { status: string }) {
  const steps = ["Paiement reçu", "Provisioning", "Installation", "Serveur prêt"];
  const activeIndex =
    status === "active"
      ? 3
      : status === "installing"
        ? 2
        : status === "provisioning" || status === "paid"
          ? 1
          : status === "failed" || status === "provisioning_failed"
            ? 2
            : 0;
  return (
    <div className="mt-5 grid gap-2 border-t border-border/60 pt-4 sm:grid-cols-4">
      {steps.map((step, index) => (
        <div key={step} className="flex items-center gap-2 text-xs text-muted-foreground">
          <span
            className={`h-2.5 w-2.5 rounded-full ${
              status === "failed" && index === activeIndex
                ? "bg-destructive shadow-[0_0_14px_rgba(239,68,68,0.75)]"
                : index <= activeIndex
                  ? "bg-primary shadow-[0_0_14px_rgba(0,191,255,0.75)]"
                  : "bg-muted"
            }`}
          />
          <span className={index <= activeIndex ? "text-foreground" : ""}>{step}</span>
        </div>
      ))}
    </div>
  );
}
