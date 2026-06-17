import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import {
  ClipboardList,
  CreditCard,
  ExternalLink,
  Gauge,
  LifeBuoy,
  Package,
  Plus,
  RefreshCw,
  ScrollText,
  Server,
  Trash2,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { SiteHeader } from "@/components/site-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  adminListAll,
  adminListLogsDetailed,
  adminGetMonitoring,
  adminCreateCurseForgeTemplateMapping,
  adminDeleteCurseForgeTemplateMapping,
  adminImportCurseForgeModpack,
  adminListReconciliation,
  listCurseForgeMappings,
  listCurseForgeModpacks,
  listCurseForgeModpackVersions,
  listCurseForgePlanCompatibilities,
  adminListGameCatalog,
  adminListOrdersDetailed,
  adminListPaymentsDetailed,
  adminListPlans,
  adminListServersDetailed,
  adminRepairReconciliation,
  adminRetryProvisioning,
  adminSearchCurseForgeModpacks,
  adminSyncServerStatus,
  adminSyncCurseForgeModpackVersions,
  adminToggleCatalogActive,
  adminToggleCurseForgeModpack,
  adminToggleCurseForgeModpackVersion,
  adminUpdateCurseForgeTemplateMapping,
  adminUpdatePlanEggs,
} from "@/lib/admin.functions";
import { adminListTickets, adminReplyToTicket } from "@/lib/support.functions";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({ meta: [{ title: "Admin · XntServers" }] }),
  component: Admin,
});

function Admin() {
  const fetchAll = useServerFn(adminListAll);
  const fetchPlans = useServerFn(adminListPlans);
  const fetchOrders = useServerFn(adminListOrdersDetailed);
  const fetchServers = useServerFn(adminListServersDetailed);
  const fetchPayments = useServerFn(adminListPaymentsDetailed);
  const fetchLogs = useServerFn(adminListLogsDetailed);
  const fetchTickets = useServerFn(adminListTickets);
  const fetchMonitoring = useServerFn(adminGetMonitoring);
  const fetchReconciliation = useServerFn(adminListReconciliation);
  const fetchCatalog = useServerFn(adminListGameCatalog);
  const fetchCurseForgeModpacks = useServerFn(listCurseForgeModpacks);
  const fetchCurseForgeVersions = useServerFn(listCurseForgeModpackVersions);
  const fetchCurseForgeMappings = useServerFn(listCurseForgeMappings);
  const fetchCurseForgePlans = useServerFn(listCurseForgePlanCompatibilities);

  const overviewQ = useQuery({ queryKey: ["admin-all"], queryFn: () => fetchAll(), retry: false });
  const plansQ = useQuery({ queryKey: ["admin-plans"], queryFn: () => fetchPlans(), retry: false });
  const ordersQ = useQuery({
    queryKey: ["admin-orders-detailed"],
    queryFn: () => fetchOrders(),
    retry: false,
  });
  const serversQ = useQuery({
    queryKey: ["admin-servers-detailed"],
    queryFn: () => fetchServers(),
    retry: false,
  });
  const paymentsQ = useQuery({
    queryKey: ["admin-payments-detailed"],
    queryFn: () => fetchPayments(),
    retry: false,
  });
  const logsQ = useQuery({
    queryKey: ["admin-logs-detailed"],
    queryFn: () => fetchLogs(),
    retry: false,
  });
  const ticketsQ = useQuery({
    queryKey: ["admin-tickets"],
    queryFn: () => fetchTickets(),
    retry: false,
  });
  const monitoringQ = useQuery({
    queryKey: ["admin-monitoring"],
    queryFn: () => fetchMonitoring(),
    retry: false,
  });
  const reconciliationQ = useQuery({
    queryKey: ["admin-reconciliation"],
    queryFn: () => fetchReconciliation(),
    retry: false,
  });
  const catalogQ = useQuery({
    queryKey: ["admin-game-catalog"],
    queryFn: () => fetchCatalog(),
    retry: false,
  });
  const curseForgeModpacksQ = useQuery({
    queryKey: ["admin-curseforge-modpacks"],
    queryFn: () => fetchCurseForgeModpacks(),
    retry: false,
  });
  const curseForgeVersionsQ = useQuery({
    queryKey: ["admin-curseforge-versions"],
    queryFn: () => fetchCurseForgeVersions(),
    retry: false,
  });
  const curseForgeMappingsQ = useQuery({
    queryKey: ["admin-curseforge-mappings"],
    queryFn: () => fetchCurseForgeMappings(),
    retry: false,
  });
  const curseForgePlansQ = useQuery({
    queryKey: ["admin-curseforge-plans"],
    queryFn: () => fetchCurseForgePlans(),
    retry: false,
  });

  const error =
    overviewQ.error ??
    plansQ.error ??
    ordersQ.error ??
    serversQ.error ??
    paymentsQ.error ??
    logsQ.error ??
    ticketsQ.error ??
    monitoringQ.error ??
    reconciliationQ.error ??
    catalogQ.error ??
    curseForgeModpacksQ.error ??
    curseForgeVersionsQ.error ??
    curseForgeMappingsQ.error ??
    curseForgePlansQ.error;

  return (
    <div className="xnt-page min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div>
          <div className="mb-3 inline-flex rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs text-primary">
            Beta operations monitor
          </div>
          <h1 className="font-display text-3xl font-bold sm:text-4xl">Admin</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Suivi beta des commandes, serveurs, paiements, logs, plans et tickets.
          </p>
        </div>

        {error && (
          <div className="mt-6 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
            {(error as Error).message}
          </div>
        )}

        <Tabs defaultValue="orders" className="mt-8">
          <TabsList className="h-auto w-full flex-wrap justify-start">
            <TabsTrigger value="orders">Orders</TabsTrigger>
            <TabsTrigger value="monitoring">Monitoring</TabsTrigger>
            <TabsTrigger value="reconciliation">Reconciliation</TabsTrigger>
            <TabsTrigger value="servers">Servers</TabsTrigger>
            <TabsTrigger value="payments">Payments</TabsTrigger>
            <TabsTrigger value="logs">Logs</TabsTrigger>
            <TabsTrigger value="plans">Plans</TabsTrigger>
            <TabsTrigger value="catalog">Game Catalog</TabsTrigger>
            <TabsTrigger value="users">Users</TabsTrigger>
            <TabsTrigger value="support">Support</TabsTrigger>
          </TabsList>

          <TabsContent value="orders" className="mt-6">
            <AdminOrdersSection orders={(ordersQ.data?.orders ?? []) as AdminOrder[]} />
          </TabsContent>
          <TabsContent value="monitoring" className="mt-6">
            <AdminMonitoringSection data={monitoringQ.data as AdminMonitoring | undefined} />
          </TabsContent>
          <TabsContent value="reconciliation" className="mt-6">
            <AdminReconciliationSection
              anomalies={(reconciliationQ.data?.anomalies ?? []) as AdminAnomaly[]}
            />
          </TabsContent>
          <TabsContent value="servers" className="mt-6">
            <AdminServersSection servers={(serversQ.data?.servers ?? []) as AdminServer[]} />
          </TabsContent>
          <TabsContent value="payments" className="mt-6">
            <AdminPaymentsSection
              payments={(paymentsQ.data?.payments ?? []) as AdminPayment[]}
              invoices={(paymentsQ.data?.invoices ?? []) as AdminInvoice[]}
            />
          </TabsContent>
          <TabsContent value="logs" className="mt-6">
            <AdminLogsSection
              activity={(logsQ.data?.activity ?? []) as ActivityLog[]}
              audit={(logsQ.data?.audit ?? []) as AuditLog[]}
            />
          </TabsContent>
          <TabsContent value="plans" className="mt-6">
            <AdminPlansSection plans={(plansQ.data?.plans ?? []) as AdminPlan[]} />
          </TabsContent>
          <TabsContent value="catalog" className="mt-6">
            <AdminGameCatalogSection data={catalogQ.data as AdminGameCatalogData | undefined} />
            <div className="mt-8">
              <AdminCurseForgeCacheSection
                data={{
                  modpacks: (curseForgeModpacksQ.data?.modpacks ?? []) as AdminCurseForgeModpack[],
                  versions: (curseForgeVersionsQ.data?.versions ?? []) as AdminCurseForgeVersion[],
                  mappings: (curseForgeMappingsQ.data?.mappings ?? []) as AdminCurseForgeMapping[],
                  compatibilities: (curseForgePlansQ.data?.compatibilities ??
                    []) as AdminCurseForgePlanCompatibility[],
                  templates: (catalogQ.data?.templates ?? []) as AdminCatalogTemplate[],
                  games: (catalogQ.data?.games ?? []) as AdminCatalogGame[],
                }}
              />
            </div>
          </TabsContent>
          <TabsContent value="users" className="mt-6">
            <AdminUsersSection
              profiles={(overviewQ.data?.profiles ?? []) as AdminProfile[]}
              roles={(overviewQ.data?.roles ?? []) as AdminRole[]}
            />
          </TabsContent>
          <TabsContent value="support" className="mt-6">
            <AdminTicketsSection tickets={(ticketsQ.data?.tickets ?? []) as AdminTicket[]} />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

type AdminProfileRef = { id: string; email: string | null };
type AdminPlanRef = { name?: string; game?: string } | null;

type AdminOrder = {
  id: string;
  user_id: string;
  status: string;
  total_cents: number;
  currency: string;
  stripe_subscription_id: string | null;
  selected_template_label?: string | null;
  created_at: string;
  profile?: AdminProfileRef | null;
  plans?: AdminPlanRef;
  server_order?: {
    id: string;
    status: string;
    error_message: string | null;
    pterodactyl_server_id: number | null;
    pterodactyl_server_identifier: string | null;
    selected_template_label?: string | null;
  } | null;
};

type AdminServer = {
  id: string;
  order_id: string | null;
  user_id: string;
  server_name: string;
  status: string;
  pterodactyl_server_id: number | null;
  pterodactyl_server_identifier: string | null;
  selected_template_label?: string | null;
  error_message: string | null;
  created_at: string;
  profile?: AdminProfileRef | null;
  plans?: AdminPlanRef;
};

type AdminPayment = {
  id: string;
  user_id: string;
  order_id: string | null;
  provider: string;
  provider_payment_id: string | null;
  status: string;
  currency: string;
  amount_cents: number;
  stripe_payment_intent_id: string | null;
  stripe_charge_id: string | null;
  stripe_invoice_id: string | null;
  created_at: string;
  profile?: AdminProfileRef | null;
};

type AdminInvoice = {
  id: string;
  user_id: string;
  order_id: string | null;
  invoice_number: string;
  status: string;
  currency: string;
  total_cents: number;
  stripe_invoice_id: string | null;
  stripe_hosted_invoice_url: string | null;
  stripe_invoice_pdf: string | null;
  created_at: string;
  profile?: AdminProfileRef | null;
};

type ActivityLog = {
  id: string;
  user_id: string | null;
  order_id: string | null;
  server_order_id: string | null;
  action: string;
  description: string | null;
  created_at: string;
};

type AuditLog = {
  id: string;
  actor_user_id: string | null;
  target_user_id: string | null;
  entity_type: string;
  entity_id: string | null;
  action: string;
  created_at: string;
};

type AdminMonitoring = {
  users: number;
  servers: number;
  orders: number;
  payments: number;
  revenueTotalCents: number;
  revenueMonthCents: number;
  ticketsOpen: number;
  ticketsClosed: number;
};

type AdminAnomaly = {
  id: string;
  type: string;
  area: "stripe" | "pterodactyl" | "notifications";
  severity: "critical" | "important" | "info";
  status: string;
  date: string;
  message: string;
  recommendation: string;
  repairAction:
    | "retry_provisioning"
    | "sync_server"
    | "reprocess_stripe_event"
    | "regenerate_notification"
    | "none";
  orderId?: string | null;
  serverOrderId?: string | null;
  stripeEventId?: string | null;
  activityLogId?: string | null;
  invoiceId?: string | null;
};

function AdminMonitoringSection({ data }: { data?: AdminMonitoring }) {
  const cards = [
    ["Users", data?.users ?? 0],
    ["Servers", data?.servers ?? 0],
    ["Orders", data?.orders ?? 0],
    ["Payments", data?.payments ?? 0],
    ["Revenue total", formatMoney(data?.revenueTotalCents ?? 0, "EUR")],
    ["Revenue month", formatMoney(data?.revenueMonthCents ?? 0, "EUR")],
    ["Tickets ouverts", data?.ticketsOpen ?? 0],
    ["Tickets fermés", data?.ticketsClosed ?? 0],
  ];
  return (
    <section>
      <SectionTitle icon={<Gauge className="h-5 w-5" />} title="Monitoring" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map(([label, value]) => (
          <div key={label} className="xnt-card rounded-xl p-5">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
            <div className="mt-2 font-display text-3xl font-bold text-primary">{value}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function AdminReconciliationSection({ anomalies }: { anomalies: AdminAnomaly[] }) {
  const qc = useQueryClient();
  const repairFn = useServerFn(adminRepairReconciliation);
  const repair = useMutation({
    mutationFn: (anomaly: AdminAnomaly) =>
      repairFn({
        data: {
          repairAction: anomaly.repairAction,
          orderId: anomaly.orderId,
          serverOrderId: anomaly.serverOrderId,
          stripeEventId: anomaly.stripeEventId,
          activityLogId: anomaly.activityLogId,
          invoiceId: anomaly.invoiceId,
        },
      }),
    onSuccess: () => {
      toast.success("Repair lancé");
      qc.invalidateQueries({ queryKey: ["admin-reconciliation"] });
      qc.invalidateQueries({ queryKey: ["admin-orders-detailed"] });
      qc.invalidateQueries({ queryKey: ["admin-servers-detailed"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <section>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <SectionTitle
          icon={<RefreshCw className="h-5 w-5" />}
          title={`Reconciliation (${anomalies.length})`}
        />
        <Button
          size="sm"
          variant="outline"
          onClick={() => qc.invalidateQueries({ queryKey: ["admin-reconciliation"] })}
        >
          <RefreshCw className="mr-2 h-4 w-4" />
          Rafraîchir
        </Button>
      </div>
      <TableShell empty={anomalies.length === 0 ? "Aucune anomalie détectée." : null}>
        <Table>
          <TableHeader className="bg-surface-2">
            <TableRow>
              <TableHead>Priorité</TableHead>
              <TableHead>Area</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Message</TableHead>
              <TableHead>Action recommandée</TableHead>
              <TableHead className="text-right">Repair</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {anomalies.map((anomaly) => (
              <TableRow key={anomaly.id}>
                <TableCell>
                  <SeverityBadge severity={anomaly.severity} />
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className="capitalize">
                    {anomaly.area}
                  </Badge>
                </TableCell>
                <TableCell className="font-mono text-xs">{anomaly.type}</TableCell>
                <TableCell>
                  <StatusBadge status={anomaly.status} />
                </TableCell>
                <TableCell className="text-muted-foreground">{formatDate(anomaly.date)}</TableCell>
                <TableCell className="min-w-64">{anomaly.message}</TableCell>
                <TableCell className="min-w-64 text-muted-foreground">
                  {anomaly.recommendation}
                </TableCell>
                <TableCell className="text-right">
                  {anomaly.repairAction === "none" ? (
                    <span className="text-sm text-muted-foreground">Manual</span>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={repair.isPending}
                      onClick={() => repair.mutate(anomaly)}
                    >
                      {repairLabel(anomaly.repairAction)}
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableShell>
    </section>
  );
}

function AdminOrdersSection({ orders }: { orders: AdminOrder[] }) {
  const qc = useQueryClient();
  const retryFn = useServerFn(adminRetryProvisioning);
  const retry = useMutation({
    mutationFn: (orderId: string) => retryFn({ data: { orderId } }),
    onSuccess: (result) => {
      if (result.ok) toast.success("Provisioning relancé");
      else toast.warning(result.error ?? "Provisioning échoué");
      qc.invalidateQueries({ queryKey: ["admin-orders-detailed"] });
      qc.invalidateQueries({ queryKey: ["admin-servers-detailed"] });
      qc.invalidateQueries({ queryKey: ["admin-logs-detailed"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <section>
      <SectionTitle
        icon={<ClipboardList className="h-5 w-5" />}
        title={`Orders (${orders.length})`}
      />
      <TableShell empty={orders.length === 0 ? "Aucune commande." : null}>
        <Table>
          <TableHeader className="bg-surface-2">
            <TableRow>
              <TableHead>Order</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>User</TableHead>
              <TableHead>Plan</TableHead>
              <TableHead>Template</TableHead>
              <TableHead>Montant</TableHead>
              <TableHead>Subscription</TableHead>
              <TableHead>Server</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {orders.map((order) => {
              const hasServer = Boolean(order.server_order?.pterodactyl_server_id);
              const canRetry =
                ["paid", "active", "provisioning_failed"].includes(order.status) && !hasServer;
              const failed =
                Boolean(order.server_order?.error_message) ||
                order.server_order?.status === "failed";
              return (
                <TableRow key={order.id}>
                  <TableCell>
                    <div className="font-medium">{shortId(order.id)}</div>
                    <div className="text-xs text-muted-foreground">
                      {formatDate(order.created_at)}
                    </div>
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={order.status} />
                  </TableCell>
                  <TableCell className="min-w-48">
                    {order.profile?.email ?? shortId(order.user_id)}
                  </TableCell>
                  <TableCell className="min-w-40">
                    {order.plans?.game ?? "—"} · {order.plans?.name ?? "—"}
                  </TableCell>
                  <TableCell>{order.selected_template_label ?? "—"}</TableCell>
                  <TableCell>{formatMoney(order.total_cents, order.currency)}</TableCell>
                  <TableCell className="font-mono text-xs">
                    {order.stripe_subscription_id ? shortId(order.stripe_subscription_id, 18) : "—"}
                  </TableCell>
                  <TableCell>
                    {order.server_order ? (
                      <div className="space-y-1">
                        <div className="font-mono text-xs">{shortId(order.server_order.id)}</div>
                        <StatusBadge status={order.server_order.status} />
                        {failed && <Badge variant="destructive">erreur</Badge>}
                      </div>
                    ) : (
                      <Badge variant="outline">aucun</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {canRetry ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={retry.isPending}
                        onClick={() => retry.mutate(order.id)}
                      >
                        <RefreshCw className="mr-2 h-4 w-4" />
                        Retry
                      </Button>
                    ) : (
                      <span className="text-sm text-muted-foreground">—</span>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableShell>
    </section>
  );
}

function AdminServersSection({ servers }: { servers: AdminServer[] }) {
  const qc = useQueryClient();
  const syncFn = useServerFn(adminSyncServerStatus);
  const sync = useMutation({
    mutationFn: (serverOrderId: string) => syncFn({ data: { serverOrderId } }),
    onSuccess: (result) => {
      toast.success(`Statut synchronisé: ${result.status}`);
      qc.invalidateQueries({ queryKey: ["admin-servers-detailed"] });
      qc.invalidateQueries({ queryKey: ["admin-orders-detailed"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <section>
      <SectionTitle icon={<Server className="h-5 w-5" />} title={`Servers (${servers.length})`} />
      <TableShell empty={servers.length === 0 ? "Aucun serveur." : null}>
        <Table>
          <TableHeader className="bg-surface-2">
            <TableRow>
              <TableHead>Server</TableHead>
              <TableHead>User</TableHead>
              <TableHead>Plan</TableHead>
              <TableHead>Template</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Pterodactyl</TableHead>
              <TableHead>Identifier</TableHead>
              <TableHead>Error</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {servers.map((server) => (
              <TableRow key={server.id}>
                <TableCell className="min-w-44">
                  <div className="font-medium">{server.server_name}</div>
                  <div className="font-mono text-xs text-muted-foreground">
                    {shortId(server.id)}
                  </div>
                </TableCell>
                <TableCell className="min-w-48">
                  {server.profile?.email ?? shortId(server.user_id)}
                </TableCell>
                <TableCell className="min-w-40">
                  {server.plans?.game ?? "—"} · {server.plans?.name ?? "—"}
                </TableCell>
                <TableCell>{server.selected_template_label ?? "—"}</TableCell>
                <TableCell>
                  <StatusBadge status={server.status} />
                </TableCell>
                <TableCell>{server.pterodactyl_server_id ?? "—"}</TableCell>
                <TableCell className="font-mono text-xs">
                  {server.pterodactyl_server_identifier ?? "—"}
                </TableCell>
                <TableCell className="max-w-64 truncate text-muted-foreground">
                  {server.error_message ?? "—"}
                </TableCell>
                <TableCell>
                  <div className="flex justify-end gap-2">
                    <Button asChild size="sm" variant="outline">
                      <Link to="/manage/$orderId" params={{ orderId: server.id }}>
                        Manage
                      </Link>
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={sync.isPending || !server.pterodactyl_server_id}
                      onClick={() => sync.mutate(server.id)}
                    >
                      <RefreshCw className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableShell>
    </section>
  );
}

function AdminPaymentsSection({
  payments,
  invoices,
}: {
  payments: AdminPayment[];
  invoices: AdminInvoice[];
}) {
  return (
    <div className="grid gap-8">
      <section>
        <SectionTitle
          icon={<CreditCard className="h-5 w-5" />}
          title={`Payments (${payments.length})`}
        />
        <TableShell empty={payments.length === 0 ? "Aucun paiement." : null}>
          <Table>
            <TableHeader className="bg-surface-2">
              <TableRow>
                <TableHead>Payment</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Montant</TableHead>
                <TableHead>Provider ID</TableHead>
                <TableHead>Stripe</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {payments.map((payment) => (
                <TableRow key={payment.id}>
                  <TableCell>
                    <div className="font-mono text-xs">{shortId(payment.id)}</div>
                    <div className="text-xs text-muted-foreground">
                      {formatDate(payment.created_at)}
                    </div>
                  </TableCell>
                  <TableCell className="min-w-48">
                    {payment.profile?.email ?? shortId(payment.user_id)}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={payment.status} />
                  </TableCell>
                  <TableCell>{formatMoney(payment.amount_cents, payment.currency)}</TableCell>
                  <TableCell className="font-mono text-xs">
                    {shortId(
                      payment.provider_payment_id ??
                        payment.stripe_payment_intent_id ??
                        payment.stripe_charge_id ??
                        payment.stripe_invoice_id,
                      22,
                    )}
                  </TableCell>
                  <TableCell>
                    <StripeLink id={payment.stripe_payment_intent_id} type="payment" />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableShell>
      </section>

      <section>
        <SectionTitle
          icon={<ScrollText className="h-5 w-5" />}
          title={`Invoices (${invoices.length})`}
        />
        <TableShell empty={invoices.length === 0 ? "Aucune facture." : null}>
          <Table>
            <TableHeader className="bg-surface-2">
              <TableRow>
                <TableHead>Invoice</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Stripe ID</TableHead>
                <TableHead>Lien</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoices.map((invoice) => (
                <TableRow key={invoice.id}>
                  <TableCell>
                    <div className="font-medium">{invoice.invoice_number}</div>
                    <div className="text-xs text-muted-foreground">
                      {formatDate(invoice.created_at)}
                    </div>
                  </TableCell>
                  <TableCell className="min-w-48">
                    {invoice.profile?.email ?? shortId(invoice.user_id)}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={invoice.status} />
                  </TableCell>
                  <TableCell>{formatMoney(invoice.total_cents, invoice.currency)}</TableCell>
                  <TableCell className="font-mono text-xs">
                    {shortId(invoice.stripe_invoice_id, 22)}
                  </TableCell>
                  <TableCell>
                    <ExternalUrl
                      href={invoice.stripe_hosted_invoice_url ?? invoice.stripe_invoice_pdf}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableShell>
      </section>
    </div>
  );
}

function AdminLogsSection({ activity, audit }: { activity: ActivityLog[]; audit: AuditLog[] }) {
  const [userFilter, setUserFilter] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const normalizedUserFilter = userFilter.toLowerCase();
  const normalizedActionFilter = actionFilter.toLowerCase();
  const filteredActivity = useMemo(
    () =>
      activity.filter((row) => {
        const userOk =
          !normalizedUserFilter || (row.user_id ?? "").toLowerCase().includes(normalizedUserFilter);
        const actionOk =
          !normalizedActionFilter || row.action.toLowerCase().includes(normalizedActionFilter);
        return userOk && actionOk;
      }),
    [activity, normalizedActionFilter, normalizedUserFilter],
  );
  const filteredAudit = useMemo(
    () =>
      audit.filter((row) => {
        const userId = row.actor_user_id ?? row.target_user_id;
        const userOk =
          !normalizedUserFilter || (userId ?? "").toLowerCase().includes(normalizedUserFilter);
        const actionOk =
          !normalizedActionFilter || row.action.toLowerCase().includes(normalizedActionFilter);
        return userOk && actionOk;
      }),
    [audit, normalizedActionFilter, normalizedUserFilter],
  );

  return (
    <div className="grid gap-6">
      <div className="grid gap-3 sm:grid-cols-2">
        <Input
          value={userFilter}
          onChange={(e) => setUserFilter(e.target.value)}
          placeholder="Filtrer par user id"
        />
        <Input
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          placeholder="Filtrer par action"
        />
      </div>
      <section>
        <SectionTitle
          icon={<ScrollText className="h-5 w-5" />}
          title={`Activity logs (${filteredActivity.length})`}
        />
        <TableShell empty={filteredActivity.length === 0 ? "Aucune activité." : null}>
          <Table>
            <TableHeader className="bg-surface-2">
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Order</TableHead>
                <TableHead>Server</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredActivity.map((log) => (
                <TableRow key={log.id}>
                  <TableCell className="min-w-36">{formatDateTime(log.created_at)}</TableCell>
                  <TableCell className="font-mono text-xs">{shortId(log.user_id)}</TableCell>
                  <TableCell>{log.action}</TableCell>
                  <TableCell className="min-w-64">{log.description ?? "—"}</TableCell>
                  <TableCell className="font-mono text-xs">{shortId(log.order_id)}</TableCell>
                  <TableCell className="font-mono text-xs">
                    {shortId(log.server_order_id)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableShell>
      </section>
      <section>
        <SectionTitle
          icon={<ScrollText className="h-5 w-5" />}
          title={`Audit logs (${filteredAudit.length})`}
        />
        <TableShell empty={filteredAudit.length === 0 ? "Aucun audit log." : null}>
          <Table>
            <TableHeader className="bg-surface-2">
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Actor</TableHead>
                <TableHead>Target</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Entity</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredAudit.map((log) => (
                <TableRow key={log.id}>
                  <TableCell className="min-w-36">{formatDateTime(log.created_at)}</TableCell>
                  <TableCell className="font-mono text-xs">{shortId(log.actor_user_id)}</TableCell>
                  <TableCell className="font-mono text-xs">{shortId(log.target_user_id)}</TableCell>
                  <TableCell>{log.action}</TableCell>
                  <TableCell>
                    {log.entity_type}
                    {log.entity_id ? ` · ${shortId(log.entity_id)}` : ""}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableShell>
      </section>
    </div>
  );
}

type AdminPlan = {
  id: string;
  name: string;
  game: string;
  pterodactyl_nest_id: number | null;
  pterodactyl_egg_id: number | null;
  allowed_eggs: unknown;
};

type AdminCatalogGame = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  icon_url: string | null;
  is_active: boolean;
  sort_order: number;
};
type AdminCatalogTemplate = {
  id: string;
  game_id: string;
  slug: string;
  name: string;
  description: string | null;
  provider: string;
  internal_nest_id: number;
  internal_egg_id: number;
  docker_image: string | null;
  startup: string | null;
  is_active: boolean;
  sort_order: number;
};
type AdminCatalogVersion = {
  id: string;
  template_id: string;
  label: string;
  minecraft_version: string | null;
  loader: string | null;
  loader_version: string | null;
  java_version: string | null;
  is_active: boolean;
  sort_order: number;
};
type AdminCatalogCompatibility = {
  id: string;
  plan_id: string;
  template_id: string;
  min_ram_mb: number | null;
  recommended_ram_mb: number | null;
  is_active: boolean;
  sort_order: number;
  plans?: { name?: string | null; game?: string | null } | null;
};
type AdminGameCatalogData = {
  games: AdminCatalogGame[];
  templates: AdminCatalogTemplate[];
  versions: AdminCatalogVersion[];
  compatibilities: AdminCatalogCompatibility[];
};
type AdminCurseForgeModpack = {
  id: string;
  curseforge_mod_id: number;
  game_id: string | null;
  slug: string | null;
  name: string;
  summary: string | null;
  logo_url: string | null;
  website_url: string | null;
  download_count: number | null;
  class_id: number | null;
  primary_category_id: number | null;
  is_active: boolean;
  is_featured: boolean;
  last_synced_at: string | null;
  created_at: string;
  game_catalog?: { name?: string | null; slug?: string | null } | null;
};
type AdminCurseForgeVersion = {
  id: string;
  modpack_id: string;
  curseforge_file_id: number;
  display_name: string;
  file_name: string | null;
  release_type: number | null;
  file_status: number | null;
  minecraft_versions: string[];
  loaders: string[];
  server_pack_file_id: number | null;
  is_server_pack: boolean;
  file_date: string | null;
  file_length: number | null;
  download_url_cached: boolean;
  is_active: boolean;
  last_synced_at: string | null;
  created_at: string;
};
type AdminCurseForgeMapping = {
  id: string;
  modpack_id: string;
  template_id: string;
  loader: string | null;
  minecraft_version: string | null;
  is_active: boolean;
  priority: number;
  created_at: string;
  curseforge_modpacks?: { name?: string | null } | null;
  server_templates?: {
    name?: string | null;
    game_catalog?: { name?: string | null } | null;
  } | null;
};
type AdminCurseForgePlanCompatibility = {
  id: string;
  modpack_id: string;
  plan_id: string;
  min_ram_mb: number | null;
  recommended_ram_mb: number | null;
  is_active: boolean;
  created_at: string;
  curseforge_modpacks?: { name?: string | null } | null;
  plans?: { name?: string | null; game?: string | null } | null;
};
type AdminCurseForgeSearchResult = {
  curseforge_mod_id: number;
  slug: string | null;
  name: string;
  summary: string | null;
  logo_url: string | null;
  website_url: string | null;
  download_count: number | null;
  class_id: number | null;
  primary_category_id: number | null;
};
type AdminCurseForgeCacheData = {
  modpacks: AdminCurseForgeModpack[];
  versions: AdminCurseForgeVersion[];
  mappings: AdminCurseForgeMapping[];
  compatibilities: AdminCurseForgePlanCompatibility[];
  templates: AdminCatalogTemplate[];
  games: AdminCatalogGame[];
};

type CurseForgeMappingDraft = {
  templateId: string;
  loader: string;
  minecraftVersion: string;
  priority: string;
};

const CURSEFORGE_MAPPING_LOADERS = ["Forge", "Fabric", "Quilt", "NeoForge", "Vanilla", "Other"];

function AdminPlansSection({ plans }: { plans: AdminPlan[] }) {
  return (
    <section>
      <SectionTitle
        icon={<Package className="h-5 w-5" />}
        title={`Plans & variants (${plans.length})`}
      />
      <TableShell empty={plans.length === 0 ? "Aucun plan." : null}>
        <Table>
          <TableHeader className="bg-surface-2">
            <TableRow>
              <TableHead>Game</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Default egg</TableHead>
              <TableHead>Variants</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {plans.map((plan) => {
              const variants = Array.isArray(plan.allowed_eggs)
                ? (plan.allowed_eggs as Array<{ label: string }>)
                : [];
              return (
                <TableRow key={plan.id}>
                  <TableCell>{plan.game}</TableCell>
                  <TableCell className="font-medium">{plan.name}</TableCell>
                  <TableCell className="text-muted-foreground">
                    nest {plan.pterodactyl_nest_id ?? "—"} · egg {plan.pterodactyl_egg_id ?? "—"}
                  </TableCell>
                  <TableCell className="min-w-64 text-muted-foreground">
                    {variants.length === 0
                      ? "—"
                      : variants.map((variant) => variant.label).join(", ")}
                  </TableCell>
                  <TableCell className="text-right">
                    <EditEggsDialog plan={plan} />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableShell>
    </section>
  );
}

function AdminGameCatalogSection({ data }: { data?: AdminGameCatalogData }) {
  const qc = useQueryClient();
  const toggleFn = useServerFn(adminToggleCatalogActive);
  const toggle = useMutation({
    mutationFn: (input: {
      table:
        | "game_catalog"
        | "server_templates"
        | "server_template_versions"
        | "plan_template_compatibilities";
      id: string;
      isActive: boolean;
    }) => toggleFn({ data: input }),
    onSuccess: () => {
      toast.success("Catalogue mis à jour");
      qc.invalidateQueries({ queryKey: ["admin-game-catalog"] });
      qc.invalidateQueries({ queryKey: ["plans"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const games = data?.games ?? [];
  const templates = data?.templates ?? [];
  const versions = data?.versions ?? [];
  const compatibilities = data?.compatibilities ?? [];
  const gamesById = new Map(games.map((game) => [game.id, game]));
  const templatesById = new Map(templates.map((template) => [template.id, template]));

  const ToggleButton = ({
    table,
    id,
    active,
  }: {
    table:
      | "game_catalog"
      | "server_templates"
      | "server_template_versions"
      | "plan_template_compatibilities";
    id: string;
    active: boolean;
  }) => (
    <Button
      size="sm"
      variant="outline"
      disabled={toggle.isPending}
      onClick={() => toggle.mutate({ table, id, isActive: !active })}
    >
      {active ? "Désactiver" : "Activer"}
    </Button>
  );

  return (
    <div className="grid gap-8">
      <section>
        <SectionTitle icon={<Package className="h-5 w-5" />} title="Game Catalog" />
        <TableShell empty={games.length === 0 ? "Aucun jeu dans le catalogue." : null}>
          <Table>
            <TableHeader className="bg-surface-2">
              <TableRow>
                <TableHead>Jeu</TableHead>
                <TableHead>Slug</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {games.map((game) => (
                <TableRow key={game.id}>
                  <TableCell className="font-medium">{game.name}</TableCell>
                  <TableCell className="font-mono text-xs">{game.slug}</TableCell>
                  <TableCell className="max-w-md text-muted-foreground">
                    {game.description ?? "—"}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={game.is_active ? "active" : "disabled"} />
                  </TableCell>
                  <TableCell className="text-right">
                    <ToggleButton table="game_catalog" id={game.id} active={game.is_active} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableShell>
      </section>

      <section>
        <SectionTitle icon={<Server className="h-5 w-5" />} title="Server Templates" />
        <TableShell empty={templates.length === 0 ? "Aucun template." : null}>
          <Table>
            <TableHeader className="bg-surface-2">
              <TableRow>
                <TableHead>Template</TableHead>
                <TableHead>Jeu</TableHead>
                <TableHead>Configuration interne</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {templates.map((template) => (
                <TableRow key={template.id}>
                  <TableCell>
                    <div className="font-medium">{template.name}</div>
                    <div className="font-mono text-xs text-muted-foreground">{template.slug}</div>
                  </TableCell>
                  <TableCell>{gamesById.get(template.game_id)?.name ?? "—"}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    nest {template.internal_nest_id} · egg {template.internal_egg_id}
                    {template.docker_image ? (
                      <div className="max-w-64 truncate">{template.docker_image}</div>
                    ) : null}
                  </TableCell>
                  <TableCell className="max-w-md text-muted-foreground">
                    {template.description ?? "—"}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={template.is_active ? "active" : "disabled"} />
                  </TableCell>
                  <TableCell className="text-right">
                    <ToggleButton
                      table="server_templates"
                      id={template.id}
                      active={template.is_active}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableShell>
      </section>

      <section>
        <SectionTitle icon={<ScrollText className="h-5 w-5" />} title="Template Versions" />
        <TableShell empty={versions.length === 0 ? "Aucune version." : null}>
          <Table>
            <TableHeader className="bg-surface-2">
              <TableRow>
                <TableHead>Version</TableHead>
                <TableHead>Template</TableHead>
                <TableHead>Loader</TableHead>
                <TableHead>Java</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {versions.map((version) => (
                <TableRow key={version.id}>
                  <TableCell>
                    <div className="font-medium">{version.label}</div>
                    <div className="text-xs text-muted-foreground">
                      Minecraft {version.minecraft_version ?? "—"}
                    </div>
                  </TableCell>
                  <TableCell>{templatesById.get(version.template_id)?.name ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {version.loader ?? "—"}
                    {version.loader_version ? ` ${version.loader_version}` : ""}
                  </TableCell>
                  <TableCell>{version.java_version ?? "—"}</TableCell>
                  <TableCell>
                    <StatusBadge status={version.is_active ? "active" : "disabled"} />
                  </TableCell>
                  <TableCell className="text-right">
                    <ToggleButton
                      table="server_template_versions"
                      id={version.id}
                      active={version.is_active}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableShell>
      </section>

      <section>
        <SectionTitle
          icon={<ClipboardList className="h-5 w-5" />}
          title="Plan / Template Compatibilities"
        />
        <TableShell empty={compatibilities.length === 0 ? "Aucune compatibilité." : null}>
          <Table>
            <TableHeader className="bg-surface-2">
              <TableRow>
                <TableHead>Plan</TableHead>
                <TableHead>Template</TableHead>
                <TableHead>RAM recommandée</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {compatibilities.map((compatibility) => (
                <TableRow key={compatibility.id}>
                  <TableCell>
                    {compatibility.plans?.game ?? "—"} · {compatibility.plans?.name ?? "—"}
                  </TableCell>
                  <TableCell>{templatesById.get(compatibility.template_id)?.name ?? "—"}</TableCell>
                  <TableCell>
                    {compatibility.recommended_ram_mb
                      ? `${(compatibility.recommended_ram_mb / 1024).toFixed(0)} GB`
                      : "—"}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={compatibility.is_active ? "active" : "disabled"} />
                  </TableCell>
                  <TableCell className="text-right">
                    <ToggleButton
                      table="plan_template_compatibilities"
                      id={compatibility.id}
                      active={compatibility.is_active}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableShell>
      </section>
    </div>
  );
}

function AdminCurseForgeCacheSection({ data }: { data: AdminCurseForgeCacheData }) {
  const qc = useQueryClient();
  const searchFn = useServerFn(adminSearchCurseForgeModpacks);
  const importFn = useServerFn(adminImportCurseForgeModpack);
  const syncFn = useServerFn(adminSyncCurseForgeModpackVersions);
  const toggleModpackFn = useServerFn(adminToggleCurseForgeModpack);
  const toggleVersionFn = useServerFn(adminToggleCurseForgeModpackVersion);
  const createMappingFn = useServerFn(adminCreateCurseForgeTemplateMapping);
  const updateMappingFn = useServerFn(adminUpdateCurseForgeTemplateMapping);
  const deleteMappingFn = useServerFn(adminDeleteCurseForgeTemplateMapping);
  const [query, setQuery] = useState("");
  const [minecraftVersion, setMinecraftVersion] = useState("");
  const [loader, setLoader] = useState("");
  const [results, setResults] = useState<AdminCurseForgeSearchResult[]>([]);
  const [mappingDrafts, setMappingDrafts] = useState<Record<string, CurseForgeMappingDraft>>({});
  const gamesById = new Map(data.games.map((game) => [game.id, game]));
  const versionsByModpack = new Map<string, AdminCurseForgeVersion[]>();
  for (const version of data.versions) {
    const current = versionsByModpack.get(version.modpack_id) ?? [];
    current.push(version);
    versionsByModpack.set(version.modpack_id, current);
  }

  const refreshCache = () => {
    qc.invalidateQueries({ queryKey: ["admin-curseforge-modpacks"] });
    qc.invalidateQueries({ queryKey: ["admin-curseforge-versions"] });
    qc.invalidateQueries({ queryKey: ["admin-curseforge-mappings"] });
    qc.invalidateQueries({ queryKey: ["admin-curseforge-plans"] });
  };

  const search = useMutation({
    mutationFn: () =>
      searchFn({
        data: {
          query,
          minecraftVersion: minecraftVersion.trim() || undefined,
          loader: loader.trim()
            ? (loader.trim().toLowerCase() as "forge" | "fabric" | "quilt" | "neoforge")
            : undefined,
        },
      }),
    onSuccess: (payload) => setResults((payload.results ?? []) as AdminCurseForgeSearchResult[]),
    onError: (e: Error) => toast.error(e.message),
  });

  const importModpack = useMutation({
    mutationFn: (modId: number) => importFn({ data: { modId } }),
    onSuccess: () => {
      toast.success("Modpack importé dans le cache");
      refreshCache();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const syncVersions = useMutation({
    mutationFn: (modpackId: string) => syncFn({ data: { modpackId } }),
    onSuccess: (payload) => {
      toast.success(`${payload.imported} version(s) synchronisée(s)`);
      refreshCache();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleModpack = useMutation({
    mutationFn: (input: { modpackId: string; isActive: boolean }) =>
      toggleModpackFn({ data: input }),
    onSuccess: () => {
      toast.success("Modpack mis à jour");
      refreshCache();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleVersion = useMutation({
    mutationFn: (input: { versionId: string; isActive: boolean }) =>
      toggleVersionFn({ data: input }),
    onSuccess: () => {
      toast.success("Version mise à jour");
      refreshCache();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const createMapping = useMutation({
    mutationFn: (input: { modpackId: string; draft: CurseForgeMappingDraft }) =>
      createMappingFn({
        data: {
          modpackId: input.modpackId,
          templateId: input.draft.templateId,
          loader: input.draft.loader || undefined,
          minecraftVersion: input.draft.minecraftVersion || undefined,
          priority: Number(input.draft.priority || 0),
          isActive: true,
        },
      }),
    onSuccess: () => {
      toast.success("Mapping créé");
      refreshCache();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateMapping = useMutation({
    mutationFn: (input: { mapping: AdminCurseForgeMapping; isActive?: boolean }) =>
      updateMappingFn({
        data: {
          mappingId: input.mapping.id,
          modpackId: input.mapping.modpack_id,
          templateId: input.mapping.template_id,
          loader: input.mapping.loader ?? undefined,
          minecraftVersion: input.mapping.minecraft_version ?? undefined,
          priority: input.mapping.priority,
          isActive: input.isActive ?? input.mapping.is_active,
        },
      }),
    onSuccess: () => {
      toast.success("Mapping mis à jour");
      refreshCache();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMapping = useMutation({
    mutationFn: (mappingId: string) => deleteMappingFn({ data: { mappingId } }),
    onSuccess: () => {
      toast.success("Mapping désactivé");
      refreshCache();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setMappingDraft = (modpackId: string, patch: Partial<CurseForgeMappingDraft>) =>
    setMappingDrafts((current) => {
      const existing = current[modpackId] ?? {
        templateId: "",
        loader: "",
        minecraftVersion: "",
        priority: "0",
      };
      return {
        ...current,
        [modpackId]: {
          ...existing,
          ...patch,
        },
      };
    });

  return (
    <div className="grid gap-8">
      <section>
        <SectionTitle icon={<Package className="h-5 w-5" />} title="CurseForge Cache" />
        <p className="mb-4 text-sm text-muted-foreground">
          Recherche et import admin server-only. La clé API reste côté serveur et aucune URL de
          téléchargement n’est stockée.
        </p>

        <form
          className="xnt-card mb-4 grid gap-3 rounded-lg p-4 md:grid-cols-[1fr_160px_160px_auto]"
          onSubmit={(e) => {
            e.preventDefault();
            search.mutate();
          }}
        >
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher un modpack..."
            minLength={2}
          />
          <Input
            value={minecraftVersion}
            onChange={(e) => setMinecraftVersion(e.target.value)}
            placeholder="Minecraft 1.20.1"
          />
          <Input value={loader} onChange={(e) => setLoader(e.target.value)} placeholder="Forge" />
          <Button type="submit" disabled={search.isPending || query.trim().length < 2}>
            {search.isPending ? "Recherche..." : "Rechercher"}
          </Button>
        </form>

        {(search.error || results.length > 0) && (
          <div className="mb-6">
            <SectionTitle icon={<ScrollText className="h-5 w-5" />} title="Résultats CurseForge" />
            <TableShell
              empty={
                !search.isPending && results.length === 0
                  ? "Aucun résultat pour cette recherche."
                  : null
              }
            >
              <Table>
                <TableHeader className="bg-surface-2">
                  <TableRow>
                    <TableHead>Modpack</TableHead>
                    <TableHead>Downloads</TableHead>
                    <TableHead>Class</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {results.map((result) => (
                    <TableRow key={result.curseforge_mod_id}>
                      <TableCell>
                        <div className="font-medium">{result.name}</div>
                        <div className="font-mono text-xs text-muted-foreground">
                          CF {result.curseforge_mod_id}
                          {result.slug ? ` · ${result.slug}` : ""}
                        </div>
                        {result.summary ? (
                          <div className="mt-1 max-w-xl truncate text-xs text-muted-foreground">
                            {result.summary}
                          </div>
                        ) : null}
                      </TableCell>
                      <TableCell>{result.download_count?.toLocaleString() ?? "—"}</TableCell>
                      <TableCell>{result.class_id ?? "—"}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={importModpack.isPending}
                          onClick={() => importModpack.mutate(result.curseforge_mod_id)}
                        >
                          Importer
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableShell>
          </div>
        )}

        <TableShell empty={data.modpacks.length === 0 ? "Aucun modpack importé." : null}>
          <Table>
            <TableHeader className="bg-surface-2">
              <TableRow>
                <TableHead>Modpack</TableHead>
                <TableHead>Jeu</TableHead>
                <TableHead>Downloads</TableHead>
                <TableHead>Sync</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.modpacks.map((modpack) => (
                <TableRow key={modpack.id}>
                  <TableCell>
                    <div className="font-medium">{modpack.name}</div>
                    <div className="font-mono text-xs text-muted-foreground">
                      CF {modpack.curseforge_mod_id}
                      {modpack.slug ? ` · ${modpack.slug}` : ""}
                    </div>
                    {modpack.summary ? (
                      <div className="mt-1 max-w-xl truncate text-xs text-muted-foreground">
                        {modpack.summary}
                      </div>
                    ) : null}
                  </TableCell>
                  <TableCell>{modpack.game_catalog?.name ?? "—"}</TableCell>
                  <TableCell>{modpack.download_count?.toLocaleString() ?? "—"}</TableCell>
                  <TableCell>{formatDateTime(modpack.last_synced_at)}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      <StatusBadge status={modpack.is_active ? "active" : "disabled"} />
                      {modpack.is_featured ? <Badge variant="outline">featured</Badge> : null}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={syncVersions.isPending}
                        onClick={() => syncVersions.mutate(modpack.id)}
                      >
                        Sync versions
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={toggleModpack.isPending}
                        onClick={() =>
                          toggleModpack.mutate({
                            modpackId: modpack.id,
                            isActive: !modpack.is_active,
                          })
                        }
                      >
                        {modpack.is_active ? "Désactiver" : "Activer"}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableShell>
      </section>

      <section>
        <SectionTitle icon={<Server className="h-5 w-5" />} title="Mappings par modpack" />
        {data.modpacks.length === 0 ? (
          <EmptyState label="Importe un modpack avant de créer un mapping." />
        ) : (
          <div className="grid gap-4">
            {data.modpacks.map((modpack) => {
              const modpackVersions = versionsByModpack.get(modpack.id) ?? [];
              const minecraftVersions = Array.from(
                new Set(modpackVersions.flatMap((version) => version.minecraft_versions)),
              ).sort();
              const loaders = Array.from(
                new Set([
                  ...modpackVersions.flatMap((version) => version.loaders),
                  ...CURSEFORGE_MAPPING_LOADERS,
                ]),
              ).filter(Boolean);
              const mappings = data.mappings.filter((mapping) => mapping.modpack_id === modpack.id);
              const draft = mappingDrafts[modpack.id] ?? {
                templateId: "",
                loader: "",
                minecraftVersion: "",
                priority: "0",
              };

              return (
                <article key={modpack.id} className="xnt-card rounded-lg p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="font-display text-lg font-semibold">{modpack.name}</h3>
                      <p className="text-xs text-muted-foreground">
                        CF {modpack.curseforge_mod_id} · {mappings.length} mapping(s)
                      </p>
                    </div>
                    <StatusBadge status={modpack.is_active ? "active" : "disabled"} />
                  </div>

                  <form
                    className="mt-4 grid gap-2 lg:grid-cols-[1.4fr_1fr_1fr_100px_auto]"
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (!draft.templateId) {
                        toast.error("Choisis un template serveur.");
                        return;
                      }
                      createMapping.mutate({ modpackId: modpack.id, draft });
                    }}
                  >
                    <select
                      value={draft.templateId}
                      onChange={(e) => setMappingDraft(modpack.id, { templateId: e.target.value })}
                      className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                    >
                      <option value="">Template serveur</option>
                      {data.templates.map((template) => (
                        <option key={template.id} value={template.id}>
                          {template.name} · {gamesById.get(template.game_id)?.name ?? "Jeu"}
                        </option>
                      ))}
                    </select>
                    <select
                      value={draft.loader}
                      onChange={(e) => setMappingDraft(modpack.id, { loader: e.target.value })}
                      className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                    >
                      <option value="">Loader auto</option>
                      {loaders.map((loaderName) => (
                        <option key={loaderName} value={loaderName}>
                          {loaderName}
                        </option>
                      ))}
                    </select>
                    <select
                      value={draft.minecraftVersion}
                      onChange={(e) =>
                        setMappingDraft(modpack.id, { minecraftVersion: e.target.value })
                      }
                      className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                    >
                      <option value="">Version auto</option>
                      {minecraftVersions.map((version) => (
                        <option key={version} value={version}>
                          {version}
                        </option>
                      ))}
                    </select>
                    <Input
                      type="number"
                      min={0}
                      max={1000}
                      value={draft.priority}
                      onChange={(e) => setMappingDraft(modpack.id, { priority: e.target.value })}
                      placeholder="Priorité"
                    />
                    <Button type="submit" disabled={createMapping.isPending || !draft.templateId}>
                      Ajouter
                    </Button>
                  </form>

                  {mappings.length === 0 ? (
                    <p className="mt-3 text-sm text-muted-foreground">
                      Aucun mapping pour ce modpack.
                    </p>
                  ) : (
                    <div className="mt-4 grid gap-2">
                      {mappings.map((mapping) => (
                        <div
                          key={mapping.id}
                          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/60 bg-background/30 p-3"
                        >
                          <div>
                            <div className="font-medium">
                              {mapping.server_templates?.name ?? shortId(mapping.template_id)}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {mapping.server_templates?.game_catalog?.name ?? "Jeu"} · loader{" "}
                              {mapping.loader ?? "auto"} · Minecraft{" "}
                              {mapping.minecraft_version ?? "auto"} · priorité {mapping.priority}
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <StatusBadge status={mapping.is_active ? "active" : "disabled"} />
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={updateMapping.isPending}
                              onClick={() =>
                                updateMapping.mutate({
                                  mapping,
                                  isActive: !mapping.is_active,
                                })
                              }
                            >
                              {mapping.is_active ? "Désactiver" : "Activer"}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={deleteMapping.isPending || !mapping.is_active}
                              onClick={() => deleteMapping.mutate(mapping.id)}
                            >
                              Supprimer
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section>
        <SectionTitle icon={<ScrollText className="h-5 w-5" />} title="Modpack Versions" />
        <TableShell empty={data.versions.length === 0 ? "Aucune version de modpack." : null}>
          <Table>
            <TableHeader className="bg-surface-2">
              <TableRow>
                <TableHead>Version</TableHead>
                <TableHead>Minecraft</TableHead>
                <TableHead>Loaders</TableHead>
                <TableHead>Server Pack</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.versions.map((version) => (
                <TableRow key={version.id}>
                  <TableCell>
                    <div className="font-medium">{version.display_name}</div>
                    <div className="font-mono text-xs text-muted-foreground">
                      file {version.curseforge_file_id}
                    </div>
                  </TableCell>
                  <TableCell>{version.minecraft_versions.join(", ") || "—"}</TableCell>
                  <TableCell>{version.loaders.join(", ") || "—"}</TableCell>
                  <TableCell>
                    {version.is_server_pack ? (
                      <Badge variant="outline">server pack</Badge>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={version.is_active ? "active" : "disabled"} />
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={toggleVersion.isPending}
                      onClick={() =>
                        toggleVersion.mutate({
                          versionId: version.id,
                          isActive: !version.is_active,
                        })
                      }
                    >
                      {version.is_active ? "Désactiver" : "Activer"}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableShell>
      </section>

      <section>
        <SectionTitle icon={<Server className="h-5 w-5" />} title="Template Mappings" />
        <TableShell empty={data.mappings.length === 0 ? "Aucun mapping template." : null}>
          <Table>
            <TableHeader className="bg-surface-2">
              <TableRow>
                <TableHead>Modpack</TableHead>
                <TableHead>Template</TableHead>
                <TableHead>Loader</TableHead>
                <TableHead>Minecraft</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.mappings.map((mapping) => (
                <TableRow key={mapping.id}>
                  <TableCell>
                    {mapping.curseforge_modpacks?.name ?? shortId(mapping.modpack_id)}
                  </TableCell>
                  <TableCell>
                    {mapping.server_templates?.name ?? shortId(mapping.template_id)}
                  </TableCell>
                  <TableCell>{mapping.loader ?? "—"}</TableCell>
                  <TableCell>{mapping.minecraft_version ?? "—"}</TableCell>
                  <TableCell>
                    <StatusBadge status={mapping.is_active ? "active" : "disabled"} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableShell>
      </section>

      <section>
        <SectionTitle
          icon={<ClipboardList className="h-5 w-5" />}
          title="Modpack / Plan Compatibilities"
        />
        <TableShell
          empty={data.compatibilities.length === 0 ? "Aucune compatibilité modpack." : null}
        >
          <Table>
            <TableHeader className="bg-surface-2">
              <TableRow>
                <TableHead>Modpack</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>RAM min.</TableHead>
                <TableHead>RAM recommandée</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.compatibilities.map((compatibility) => (
                <TableRow key={compatibility.id}>
                  <TableCell>
                    {compatibility.curseforge_modpacks?.name ?? shortId(compatibility.modpack_id)}
                  </TableCell>
                  <TableCell>
                    {compatibility.plans?.game ?? "—"} · {compatibility.plans?.name ?? "—"}
                  </TableCell>
                  <TableCell>
                    {compatibility.min_ram_mb
                      ? `${(compatibility.min_ram_mb / 1024).toFixed(0)} GB`
                      : "—"}
                  </TableCell>
                  <TableCell>
                    {compatibility.recommended_ram_mb
                      ? `${(compatibility.recommended_ram_mb / 1024).toFixed(0)} GB`
                      : "—"}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={compatibility.is_active ? "active" : "disabled"} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableShell>
      </section>
    </div>
  );
}

type AdminProfile = {
  id: string;
  email: string | null;
  display_name: string | null;
  created_at: string;
};

type AdminRole = { user_id: string; role: string };

function AdminUsersSection({ profiles, roles }: { profiles: AdminProfile[]; roles: AdminRole[] }) {
  return (
    <section>
      <SectionTitle icon={<Users className="h-5 w-5" />} title={`Users (${profiles.length})`} />
      <TableShell empty={profiles.length === 0 ? "Aucun utilisateur." : null}>
        <Table>
          <TableHeader className="bg-surface-2">
            <TableRow>
              <TableHead>Display name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Roles</TableHead>
              <TableHead>Joined</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {profiles.map((profile) => {
              const profileRoles = roles
                .filter((role) => role.user_id === profile.id)
                .map((role) => role.role)
                .join(", ");
              return (
                <TableRow key={profile.id}>
                  <TableCell className="font-medium">{profile.display_name ?? "—"}</TableCell>
                  <TableCell>{profile.email ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{profileRoles || "user"}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDate(profile.created_at)}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableShell>
    </section>
  );
}

type AdminTicketMessage = {
  id: string;
  user_id: string;
  is_staff: boolean;
  body: string;
  created_at: string;
};

type AdminTicket = {
  id: string;
  user_id: string;
  subject: string;
  status: string;
  priority: string;
  category: string | null;
  created_at: string;
  updated_at: string;
  ticket_messages?: AdminTicketMessage[];
};

function AdminTicketsSection({ tickets }: { tickets: AdminTicket[] }) {
  const qc = useQueryClient();
  const replyFn = useServerFn(adminReplyToTicket);
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const reply = useMutation({
    mutationFn: (ticketId: string) => replyFn({ data: { ticketId, body: drafts[ticketId] ?? "" } }),
    onSuccess: (_result, ticketId) => {
      toast.success("Réponse envoyée");
      setDrafts((current) => ({ ...current, [ticketId]: "" }));
      qc.invalidateQueries({ queryKey: ["admin-tickets"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <section>
      <SectionTitle
        icon={<LifeBuoy className="h-5 w-5" />}
        title={`Support tickets (${tickets.length})`}
      />
      {tickets.length === 0 ? (
        <EmptyState label="Aucun ticket." />
      ) : (
        <div className="grid gap-4">
          {tickets.map((ticket) => (
            <article key={ticket.id} className="xnt-card rounded-lg">
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border/60 p-4">
                <div>
                  <h3 className="font-display text-lg font-semibold">{ticket.subject}</h3>
                  <div className="mt-1 text-xs text-muted-foreground">
                    User {shortId(ticket.user_id)} · {formatDateTime(ticket.created_at)}
                  </div>
                </div>
                <Badge variant="outline" className="capitalize">
                  {ticket.status}
                </Badge>
              </div>
              <div className="space-y-3 p-4">
                {(ticket.ticket_messages ?? []).map((message) => (
                  <div
                    key={message.id}
                    className={`rounded-lg border p-3 ${
                      message.is_staff
                        ? "border-primary/30 bg-primary/10"
                        : "border-border/60 bg-background/40"
                    }`}
                  >
                    <div className="mb-1 text-xs text-muted-foreground">
                      {message.is_staff ? "Staff" : "Customer"} ·{" "}
                      {formatDateTime(message.created_at)}
                    </div>
                    <p className="whitespace-pre-wrap text-sm">{message.body}</p>
                  </div>
                ))}
                <form
                  className="space-y-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    reply.mutate(ticket.id);
                  }}
                >
                  <Textarea
                    value={drafts[ticket.id] ?? ""}
                    onChange={(e) =>
                      setDrafts((current) => ({ ...current, [ticket.id]: e.target.value }))
                    }
                    placeholder="Réponse staff…"
                    className="min-h-[90px]"
                  />
                  <Button
                    type="submit"
                    disabled={reply.isPending || !(drafts[ticket.id] ?? "").trim()}
                  >
                    Répondre
                  </Button>
                </form>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

type Variant = {
  nest_id: number;
  egg_id: number;
  label: string;
  docker_image?: string;
  startup?: string;
};

function EditEggsDialog({ plan }: { plan: { id: string; name: string; allowed_eggs: unknown } }) {
  const qc = useQueryClient();
  const save = useServerFn(adminUpdatePlanEggs);
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Variant[]>([]);

  useEffect(() => {
    if (open) {
      const initial = Array.isArray(plan.allowed_eggs) ? (plan.allowed_eggs as Variant[]) : [];
      setRows(
        initial.map((row) => ({
          nest_id: row.nest_id,
          egg_id: row.egg_id,
          label: row.label,
          docker_image: row.docker_image,
          startup: row.startup,
        })),
      );
    }
  }, [open, plan.allowed_eggs]);

  const mutation = useMutation({
    mutationFn: () => save({ data: { planId: plan.id, allowedEggs: rows } }),
    onSuccess: () => {
      toast.success("Variants enregistrés");
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["admin-plans"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const update = (index: number, patch: Partial<Variant>) =>
    setRows(rows.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          Edit variants
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{plan.name} · variants</DialogTitle>
        </DialogHeader>
        <div className="max-h-[420px] space-y-3 overflow-y-auto pr-1">
          {rows.length === 0 && <p className="text-sm text-muted-foreground">Aucun variant.</p>}
          {rows.map((row, index) => (
            <div
              key={`${row.nest_id}-${row.egg_id}-${index}`}
              className="space-y-2 rounded-lg border border-primary/15 bg-background/25 p-3"
            >
              <div className="grid gap-2 sm:grid-cols-3">
                <Field label="Label">
                  <Input
                    value={row.label}
                    onChange={(e) => update(index, { label: e.target.value })}
                    placeholder="Paper"
                  />
                </Field>
                <Field label="Nest ID">
                  <Input
                    type="number"
                    value={row.nest_id || ""}
                    onChange={(e) => update(index, { nest_id: Number(e.target.value) })}
                  />
                </Field>
                <Field label="Egg ID">
                  <Input
                    type="number"
                    value={row.egg_id || ""}
                    onChange={(e) => update(index, { egg_id: Number(e.target.value) })}
                  />
                </Field>
              </div>
              <Field label="Docker image override">
                <Input
                  value={row.docker_image ?? ""}
                  onChange={(e) => update(index, { docker_image: e.target.value || undefined })}
                  placeholder="ghcr.io/pterodactyl/yolks:java_17"
                />
              </Field>
              <Field label="Startup override">
                <Input
                  value={row.startup ?? ""}
                  onChange={(e) => update(index, { startup: e.target.value || undefined })}
                  placeholder="java -Xms128M -Xmx{{SERVER_MEMORY}}M -jar {{SERVER_JARFILE}}"
                />
              </Field>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setRows(rows.filter((_, rowIndex) => rowIndex !== index))}
                className="text-destructive"
              >
                <Trash2 className="mr-1 h-4 w-4" />
                Remove
              </Button>
            </div>
          ))}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setRows([...rows, { nest_id: 0, egg_id: 0, label: "" }])}
        >
          <Plus className="mr-1 h-4 w-4" />
          Add variant
        </Button>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending ? "Saving…" : "Save variants"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SectionTitle({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="mb-4 flex items-center gap-2">
      <span className="text-primary">{icon}</span>
      <h2 className="font-display text-xl font-semibold">{title}</h2>
    </div>
  );
}

function TableShell({ children, empty }: { children: React.ReactNode; empty: string | null }) {
  if (empty) return <EmptyState label={empty} />;
  return <div className="xnt-card overflow-hidden rounded-lg">{children}</div>;
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="xnt-card rounded-lg border-dashed p-6 text-sm text-muted-foreground">
      {label}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function StatusBadge({ status }: { status: string }) {
  return (
    <Badge variant="outline" className={`capitalize xnt-status-${status}`}>
      {status.replaceAll("_", " ")}
    </Badge>
  );
}

function SeverityBadge({ severity }: { severity: AdminAnomaly["severity"] }) {
  const label = {
    critical: "Critique",
    important: "Important",
    info: "Info",
  }[severity];
  const className = {
    critical: "border-destructive/50 bg-destructive/15 text-destructive",
    important: "border-yellow-400/50 bg-yellow-400/10 text-yellow-200",
    info: "border-primary/40 bg-primary/10 text-primary",
  }[severity];
  return (
    <Badge variant="outline" className={className}>
      {label}
    </Badge>
  );
}

function repairLabel(action: AdminAnomaly["repairAction"]) {
  const labels = {
    retry_provisioning: "Retry provisioning",
    sync_server: "Sync server",
    reprocess_stripe_event: "Reprocess event",
    regenerate_notification: "Regenerate",
    none: "Manual",
  };
  return labels[action];
}

function StripeLink({ id, type }: { id: string | null; type: "payment" | "invoice" }) {
  if (!id) return <span className="text-sm text-muted-foreground">—</span>;
  const path = type === "payment" ? "payments" : "invoices";
  return <ExternalUrl href={`https://dashboard.stripe.com/test/${path}/${id}`} />;
}

function ExternalUrl({ href }: { href?: string | null }) {
  if (!href) return <span className="text-sm text-muted-foreground">—</span>;
  return (
    <Button asChild size="sm" variant="outline">
      <a href={href} target="_blank" rel="noreferrer">
        <ExternalLink className="mr-2 h-4 w-4" />
        Open
      </a>
    </Button>
  );
}

function formatMoney(cents: number | null | undefined, currency: string | null | undefined) {
  if (typeof cents !== "number") return "—";
  return `${(cents / 100).toFixed(2)} ${(currency ?? "EUR").toUpperCase()}`;
}

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString();
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

function shortId(value: string | number | null | undefined, length = 8) {
  if (value === null || value === undefined || value === "") return "—";
  return String(value).slice(0, length);
}
