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
  adminListMinecraftSyncQueue,
  adminMarkInitialMinecraftSyncFailed,
  adminProcessPendingMinecraftSyncs,
  adminRetryInitialMinecraftSync,
  adminSendMonitoringTestEvent,
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
  adminRestoreServerOrderVisibility,
  adminRetryProvisioning,
  adminSearchCurseForgeModpacks,
  adminSyncServerStatus,
  adminSyncCurseForgeModpackVersions,
  adminTestCurseForgeConnection,
  adminToggleCatalogActive,
  adminToggleCurseForgeModpack,
  adminToggleCurseForgeModpackVersion,
  adminUpdateTemplateModpackInstall,
  adminUpdateTemplateSettingsSync,
  adminUpdateCurseForgeTemplateMapping,
  adminUpdatePlanEggs,
} from "@/lib/admin.functions";
import { adminListTickets, adminReplyToTicket } from "@/lib/support.functions";
import {
  adminCancelModpackInstallJob,
  adminListModpackInstallJobs,
  adminProcessModpackInstallJob,
  adminProcessNextModpackInstallJob,
  adminRetryModpackInstallJob,
} from "@/lib/modpack-install.functions";
import {
  adminListWorkers,
  adminRunAllWorkers,
  adminRunWorker,
  adminSetWorkerEnabled,
} from "@/lib/workers.functions";

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
  const fetchWorkers = useServerFn(adminListWorkers);
  const fetchMinecraftSyncQueue = useServerFn(adminListMinecraftSyncQueue);
  const fetchReconciliation = useServerFn(adminListReconciliation);
  const fetchCatalog = useServerFn(adminListGameCatalog);
  const fetchCurseForgeModpacks = useServerFn(listCurseForgeModpacks);
  const fetchCurseForgeVersions = useServerFn(listCurseForgeModpackVersions);
  const fetchCurseForgeMappings = useServerFn(listCurseForgeMappings);
  const fetchCurseForgePlans = useServerFn(listCurseForgePlanCompatibilities);
  const fetchModpackJobs = useServerFn(adminListModpackInstallJobs);

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
  const workersQ = useQuery({
    queryKey: ["admin-workers"],
    queryFn: () => fetchWorkers(),
    retry: false,
  });
  const minecraftSyncQueueQ = useQuery({
    queryKey: ["admin-minecraft-sync-queue"],
    queryFn: () => fetchMinecraftSyncQueue(),
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
  const modpackJobsQ = useQuery({
    queryKey: ["admin-modpack-install-jobs"],
    queryFn: () => fetchModpackJobs({ data: {} }),
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
    workersQ.error ??
    minecraftSyncQueueQ.error ??
    reconciliationQ.error ??
    catalogQ.error ??
    curseForgeModpacksQ.error ??
    curseForgeVersionsQ.error ??
    curseForgeMappingsQ.error ??
    curseForgePlansQ.error ??
    modpackJobsQ.error;

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
            <TabsTrigger value="workers">Workers</TabsTrigger>
            <TabsTrigger value="reconciliation">Reconciliation</TabsTrigger>
            <TabsTrigger value="minecraft-sync">Minecraft Sync</TabsTrigger>
            <TabsTrigger value="servers">Servers</TabsTrigger>
            <TabsTrigger value="payments">Payments</TabsTrigger>
            <TabsTrigger value="logs">Logs</TabsTrigger>
            <TabsTrigger value="plans">Plans</TabsTrigger>
            <TabsTrigger value="catalog">Game Catalog</TabsTrigger>
            <TabsTrigger value="modpack-jobs">Modpack Jobs</TabsTrigger>
            <TabsTrigger value="users">Users</TabsTrigger>
            <TabsTrigger value="support">Support</TabsTrigger>
          </TabsList>

          <TabsContent value="orders" className="mt-6">
            <AdminOrdersSection orders={(ordersQ.data?.orders ?? []) as AdminOrder[]} />
          </TabsContent>
          <TabsContent value="monitoring" className="mt-6">
            <AdminMonitoringSection data={monitoringQ.data as AdminMonitoring | undefined} />
          </TabsContent>
          <TabsContent value="workers" className="mt-6">
            <AdminWorkersSection data={workersQ.data as AdminWorkersData | undefined} />
          </TabsContent>
          <TabsContent value="reconciliation" className="mt-6">
            <AdminReconciliationSection
              anomalies={(reconciliationQ.data?.anomalies ?? []) as AdminAnomaly[]}
            />
          </TabsContent>
          <TabsContent value="minecraft-sync" className="mt-6">
            <AdminMinecraftSyncQueueSection
              queue={(minecraftSyncQueueQ.data?.queue ?? []) as AdminMinecraftSyncQueueItem[]}
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
          <TabsContent value="modpack-jobs" className="mt-6">
            <AdminModpackJobsSection
              jobs={(modpackJobsQ.data?.jobs ?? []) as AdminModpackInstallJob[]}
            />
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
type AdminMinecraftSettings = {
  server_type?: string | null;
  minecraft_version?: string | null;
  version_apply_status?: string | null;
  max_players?: number | null;
  max_players_applied?: boolean;
  extra_price_cents?: number | null;
  total_price_cents?: number | null;
} | null;

type AdminOrder = {
  id: string;
  user_id: string;
  status: string;
  total_cents: number;
  currency: string;
  stripe_subscription_id: string | null;
  selected_template_label?: string | null;
  selected_modpack_label?: string | null;
  minecraft_settings?: AdminMinecraftSettings;
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
    selected_modpack_label?: string | null;
    minecraft_settings?: AdminMinecraftSettings;
    is_archived?: boolean;
    hidden_from_customer?: boolean;
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
  selected_modpack_label?: string | null;
  minecraft_settings?: AdminMinecraftSettings;
  is_archived?: boolean;
  hidden_from_customer?: boolean;
  error_message: string | null;
  created_at: string;
  profile?: AdminProfileRef | null;
  plans?: AdminPlanRef;
};

type AdminMinecraftSyncQueueItem = {
  id: string;
  user_id: string | null;
  server_name: string;
  status: string;
  pterodactyl_server_id: number | null;
  pterodactyl_server_identifier: string | null;
  initial_minecraft_sync?: {
    status: string | null;
    retry_count: number;
    next_retry_at: string | null;
    last_attempt_at: string | null;
    last_error: string | null;
  } | null;
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

type AdminModpackInstallJob = {
  id: string;
  order_id: string | null;
  server_order_id: string | null;
  user_id: string | null;
  curseforge_mod_id: number | null;
  curseforge_file_id: number | null;
  server_pack_file_id: number | null;
  status: string;
  attempts: number;
  max_attempts: number;
  file_length: number | null;
  started_at: string | null;
  finished_at: string | null;
  error_message: string | null;
  logs?: Array<{ at?: string; event?: string; message?: string }>;
  created_at: string;
  updated_at: string;
  curseforge_modpacks?: { name?: string | null } | null;
  curseforge_modpack_versions?: {
    display_name?: string | null;
    minecraft_versions?: string[] | null;
    loaders?: string[] | null;
  } | null;
  server_orders?: { server_name?: string | null; status?: string | null } | null;
  orders?: { status?: string | null } | null;
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
  sentry?: {
    frontendDsnConfigured: boolean;
    serverDsnConfigured: boolean;
    environment: string;
    tracesSampleRate: number;
  };
  users: number;
  servers: number;
  orders: number;
  payments: number;
  revenueTotalCents: number;
  revenueMonthCents: number;
  ticketsOpen: number;
  ticketsClosed: number;
};

type AdminWorkerName = "minecraft-sync" | "reconciliation" | "modpack" | "monitoring";

type AdminWorkerState = {
  name: AdminWorkerName;
  enabled: boolean;
  status: string;
  last_run_at: string | null;
  last_duration_ms: number | null;
  last_success: boolean | null;
  last_error: string | null;
  next_run_at: string | null;
  success_count: number;
  error_count: number;
};

type AdminWorkerHistoryEntry = {
  id: string;
  worker: AdminWorkerName | "all";
  started_at: string;
  finished_at: string;
  duration_ms: number;
  success: boolean;
  processed: number;
  error?: string | null;
};

type AdminWorkersData = {
  workers: AdminWorkerState[];
  history: AdminWorkerHistoryEntry[];
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
    | "archive_missing_server"
    | "cleanup_staging_missing_servers"
    | "none";
  orderId?: string | null;
  serverOrderId?: string | null;
  stripeEventId?: string | null;
  activityLogId?: string | null;
  invoiceId?: string | null;
};

function AdminMonitoringSection({ data }: { data?: AdminMonitoring }) {
  const sendTestFn = useServerFn(adminSendMonitoringTestEvent);
  const sendTest = useMutation({
    mutationFn: () => sendTestFn(),
    onSuccess: (result) => {
      if (result.sent) toast.success("Événement test Sentry envoyé.");
      else toast.info(result.message);
    },
    onError: (error: Error) => toast.error(error.message),
  });
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
      <div className="xnt-card mt-4 rounded-xl p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="font-display text-lg font-semibold">Sentry</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              État de la configuration monitoring beta, sans afficher de DSN ni de secret.
            </p>
          </div>
          <Button variant="outline" disabled={sendTest.isPending} onClick={() => sendTest.mutate()}>
            <RefreshCw className="mr-1.5 h-4 w-4" />
            {sendTest.isPending ? "Envoi…" : "Envoyer événement test"}
          </Button>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <InfoPill
            label="Frontend DSN"
            value={data?.sentry?.frontendDsnConfigured ? "Oui" : "Non"}
          />
          <InfoPill label="Server DSN" value={data?.sentry?.serverDsnConfigured ? "Oui" : "Non"} />
          <InfoPill label="Environment" value={data?.sentry?.environment ?? "development"} />
          <InfoPill label="Traces sample" value={String(data?.sentry?.tracesSampleRate ?? 0.1)} />
        </div>
      </div>
    </section>
  );
}

function AdminWorkersSection({ data }: { data?: AdminWorkersData }) {
  const qc = useQueryClient();
  const runWorkerFn = useServerFn(adminRunWorker);
  const runAllFn = useServerFn(adminRunAllWorkers);
  const setEnabledFn = useServerFn(adminSetWorkerEnabled);
  const workers = data?.workers ?? [];
  const history = data?.history ?? [];
  const refreshWorkers = () => {
    qc.invalidateQueries({ queryKey: ["admin-workers"] });
    qc.invalidateQueries({ queryKey: ["admin-minecraft-sync-queue"] });
    qc.invalidateQueries({ queryKey: ["admin-reconciliation"] });
    qc.invalidateQueries({ queryKey: ["admin-modpack-install-jobs"] });
    qc.invalidateQueries({ queryKey: ["admin-servers-detailed"] });
  };
  const runWorker = useMutation({
    mutationFn: (worker: AdminWorkerName) => runWorkerFn({ data: { worker } }),
    onSuccess: (result) => {
      const entry = result as AdminWorkerHistoryEntry;
      if (entry.success) toast.success(`Worker ${workerLabel(entry.worker)} terminé.`);
      else toast.error(entry.error ?? "Worker en erreur.");
      refreshWorkers();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const runAll = useMutation({
    mutationFn: () => runAllFn(),
    onSuccess: (result) => {
      const output = result as { entry: AdminWorkerHistoryEntry };
      if (output.entry.success) toast.success("Tous les workers ont été exécutés.");
      else toast.error("Un ou plusieurs workers sont en erreur.");
      refreshWorkers();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const setEnabled = useMutation({
    mutationFn: (input: { worker: AdminWorkerName; enabled: boolean }) =>
      setEnabledFn({ data: input }),
    onSuccess: (result) => {
      const state = result as AdminWorkerState;
      toast.success(`${workerLabel(state.name)} ${state.enabled ? "activé" : "désactivé"}.`);
      refreshWorkers();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <section className="grid gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <SectionTitle icon={<Gauge className="h-5 w-5" />} title="Workers" />
          <p className="mt-1 text-sm text-muted-foreground">
            Exécution contrôlée des traitements automatiques. Aucun worker ne démarre au lancement
            du serveur.
          </p>
        </div>
        <Button
          className="bg-primary text-primary-foreground hover:bg-primary/90"
          disabled={runAll.isPending}
          onClick={() => runAll.mutate()}
        >
          <RefreshCw className="mr-1.5 h-4 w-4" />
          {runAll.isPending ? "Exécution…" : "Run all"}
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {workers.map((worker) => (
          <div key={worker.name} className="xnt-card rounded-xl p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="font-display text-lg font-semibold">{workerLabel(worker.name)}</div>
                <div className="mt-1 flex flex-wrap gap-2">
                  <StatusBadge status={worker.enabled ? worker.status : "disabled"} />
                  <Badge variant="outline">
                    {worker.success_count} OK · {worker.error_count} erreurs
                  </Badge>
                </div>
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={runWorker.isPending}
                  onClick={() => runWorker.mutate(worker.name)}
                >
                  Run now
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={setEnabled.isPending}
                  onClick={() =>
                    setEnabled.mutate({ worker: worker.name, enabled: !worker.enabled })
                  }
                >
                  {worker.enabled ? "Disable" : "Enable"}
                </Button>
              </div>
            </div>
            <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
              <InfoPill label="Dernier run" value={formatDateTime(worker.last_run_at)} />
              <InfoPill
                label="Durée"
                value={
                  typeof worker.last_duration_ms === "number"
                    ? `${worker.last_duration_ms} ms`
                    : "—"
                }
              />
              <InfoPill label="Prochain run" value={worker.next_run_at ?? "Cron externe"} />
              <InfoPill label="Dernière erreur" value={worker.last_error ?? "—"} />
            </div>
          </div>
        ))}
      </div>

      <div className="xnt-card rounded-xl p-5">
        <SectionTitle icon={<ScrollText className="h-5 w-5" />} title="Historique workers" />
        <TableShell empty={history.length === 0 ? "Aucun run worker enregistré." : null}>
          <Table>
            <TableHeader className="bg-surface-2">
              <TableRow>
                <TableHead>Worker</TableHead>
                <TableHead>Résultat</TableHead>
                <TableHead>Traités</TableHead>
                <TableHead>Durée</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Erreur</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {history.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell>{workerLabel(entry.worker)}</TableCell>
                  <TableCell>
                    <StatusBadge status={entry.success ? "success" : "error"} />
                  </TableCell>
                  <TableCell>{entry.processed}</TableCell>
                  <TableCell>{entry.duration_ms} ms</TableCell>
                  <TableCell>{formatDateTime(entry.finished_at)}</TableCell>
                  <TableCell className="max-w-80 truncate text-xs text-muted-foreground">
                    {entry.error ?? "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableShell>
      </div>
    </section>
  );
}

function InfoPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-primary/15 bg-background/35 p-3">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 font-medium text-primary">{value}</div>
    </div>
  );
}

function AdminReconciliationSection({ anomalies }: { anomalies: AdminAnomaly[] }) {
  const qc = useQueryClient();
  const repairFn = useServerFn(adminRepairReconciliation);
  const refreshReconciliation = () => {
    qc.invalidateQueries({ queryKey: ["admin-reconciliation"] });
    qc.invalidateQueries({ queryKey: ["admin-orders-detailed"] });
    qc.invalidateQueries({ queryKey: ["admin-servers-detailed"] });
    qc.invalidateQueries({ queryKey: ["admin-logs-detailed"] });
  };
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
      refreshReconciliation();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const cleanupStaging = useMutation({
    mutationFn: () =>
      repairFn({
        data: {
          repairAction: "cleanup_staging_missing_servers",
        },
      }),
    onSuccess: () => {
      toast.success("Nettoyage staging lancé");
      refreshReconciliation();
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
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={cleanupStaging.isPending}
            onClick={() => {
              if (
                confirm(
                  "Nettoyer uniquement les serveurs test/staging absents côté infrastructure ? Les paiements/factures ne seront jamais supprimés.",
                )
              ) {
                cleanupStaging.mutate();
              }
            }}
          >
            Nettoyer tests manquants
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => qc.invalidateQueries({ queryKey: ["admin-reconciliation"] })}
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Rafraîchir
          </Button>
        </div>
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
                      onClick={() => {
                        if (
                          anomaly.repairAction === "archive_missing_server" &&
                          !confirm(
                            "Archiver cette référence de serveur absent ? Aucun paiement, facture ou commande réelle ne sera supprimé.",
                          )
                        ) {
                          return;
                        }
                        if (
                          anomaly.repairAction === "cleanup_staging_missing_servers" &&
                          !confirm(
                            "Nettoyer cette référence staging absente ? Cette action ne concerne que les serveurs marqués test/staging.",
                          )
                        ) {
                          return;
                        }
                        repair.mutate(anomaly);
                      }}
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
                  <TableCell>
                    <div>{order.selected_template_label ?? "—"}</div>
                    {order.selected_modpack_label ? (
                      <div className="text-xs text-accent">
                        Modpack: {order.selected_modpack_label}
                      </div>
                    ) : null}
                    <MinecraftMetaLine settings={order.minecraft_settings} />
                  </TableCell>
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
                        {order.server_order.is_archived ? (
                          <Badge variant="outline">Archivé</Badge>
                        ) : null}
                        {order.server_order.hidden_from_customer ? (
                          <Badge variant="outline">Masqué client</Badge>
                        ) : null}
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
  const restoreVisibilityFn = useServerFn(adminRestoreServerOrderVisibility);
  const sync = useMutation({
    mutationFn: (serverOrderId: string) => syncFn({ data: { serverOrderId } }),
    onSuccess: (result) => {
      toast.success(`Statut synchronisé: ${result.status}`);
      qc.invalidateQueries({ queryKey: ["admin-servers-detailed"] });
      qc.invalidateQueries({ queryKey: ["admin-orders-detailed"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const restoreVisibility = useMutation({
    mutationFn: (serverOrderId: string) => restoreVisibilityFn({ data: { serverOrderId } }),
    onSuccess: () => {
      toast.success("Visibilité client restaurée");
      qc.invalidateQueries({ queryKey: ["admin-servers-detailed"] });
      qc.invalidateQueries({ queryKey: ["admin-orders-detailed"] });
      qc.invalidateQueries({ queryKey: ["admin-reconciliation"] });
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
                <TableCell>
                  <div>{server.selected_template_label ?? "—"}</div>
                  {server.selected_modpack_label ? (
                    <div className="text-xs text-accent">
                      Modpack: {server.selected_modpack_label}
                    </div>
                  ) : null}
                  <MinecraftMetaLine settings={server.minecraft_settings} />
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    <StatusBadge status={server.status} />
                    {server.is_archived ? <Badge variant="outline">Archivé</Badge> : null}
                    {server.hidden_from_customer ? (
                      <Badge variant="outline">Masqué client</Badge>
                    ) : null}
                  </div>
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
                    {server.hidden_from_customer ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={restoreVisibility.isPending}
                        onClick={() => {
                          if (confirm("Restaurer la visibilité client de ce serveur archivé ?")) {
                            restoreVisibility.mutate(server.id);
                          }
                        }}
                      >
                        Restaurer visibilité
                      </Button>
                    ) : null}
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

function AdminMinecraftSyncQueueSection({ queue }: { queue: AdminMinecraftSyncQueueItem[] }) {
  const qc = useQueryClient();
  const processFn = useServerFn(adminProcessPendingMinecraftSyncs);
  const retryFn = useServerFn(adminRetryInitialMinecraftSync);
  const markFailedFn = useServerFn(adminMarkInitialMinecraftSyncFailed);
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["admin-minecraft-sync-queue"] });
    qc.invalidateQueries({ queryKey: ["admin-servers-detailed"] });
  };

  const process = useMutation({
    mutationFn: () => processFn({ data: { limit: 25 } }),
    onSuccess: (result) => {
      toast.success(`${result.processed.length} synchronisation(s) traitée(s).`);
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const retry = useMutation({
    mutationFn: (serverOrderId: string) => retryFn({ data: { serverOrderId } }),
    onSuccess: () => {
      toast.success("Retry lancé.");
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const markFailed = useMutation({
    mutationFn: (serverOrderId: string) => markFailedFn({ data: { serverOrderId } }),
    onSuccess: () => {
      toast.success("Synchronisation marquée échouée.");
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <section>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <SectionTitle
          icon={<RefreshCw className="h-5 w-5" />}
          title={`Minecraft Sync Queue (${queue.length})`}
        />
        <Button variant="outline" disabled={process.isPending} onClick={() => process.mutate()}>
          <RefreshCw className="mr-1.5 h-4 w-4" />
          {process.isPending ? "Traitement…" : "Process pending"}
        </Button>
      </div>
      <TableShell
        empty={queue.length === 0 ? "Aucune synchronisation Minecraft en attente." : null}
      >
        <Table>
          <TableHeader className="bg-surface-2">
            <TableRow>
              <TableHead>Serveur</TableHead>
              <TableHead>Client</TableHead>
              <TableHead>Retry</TableHead>
              <TableHead>Prochain retry</TableHead>
              <TableHead>Dernière erreur</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {queue.map((item) => (
              <TableRow key={item.id}>
                <TableCell>
                  <div className="font-medium">{item.server_name}</div>
                  <div className="font-mono text-xs text-muted-foreground">{shortId(item.id)}</div>
                </TableCell>
                <TableCell>{item.profile?.email ?? shortId(item.user_id)}</TableCell>
                <TableCell>{item.initial_minecraft_sync?.retry_count ?? 0}/5</TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {item.initial_minecraft_sync?.next_retry_at
                    ? new Date(item.initial_minecraft_sync.next_retry_at).toLocaleString()
                    : "Maintenant"}
                </TableCell>
                <TableCell className="max-w-80 truncate text-xs text-muted-foreground">
                  {item.initial_minecraft_sync?.last_error ?? "—"}
                </TableCell>
                <TableCell>
                  <div className="flex justify-end gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={retry.isPending}
                      onClick={() => retry.mutate(item.id)}
                    >
                      Retry now
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={markFailed.isPending}
                      onClick={() => markFailed.mutate(item.id)}
                    >
                      Mark failed
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

function AdminModpackJobsSection({ jobs }: { jobs: AdminModpackInstallJob[] }) {
  const qc = useQueryClient();
  const retryFn = useServerFn(adminRetryModpackInstallJob);
  const cancelFn = useServerFn(adminCancelModpackInstallJob);
  const processJobFn = useServerFn(adminProcessModpackInstallJob);
  const processNextFn = useServerFn(adminProcessNextModpackInstallJob);
  const [status, setStatus] = useState("");
  const filtered = status ? jobs.filter((job) => job.status === status) : jobs;
  const refreshJobs = () => {
    qc.invalidateQueries({ queryKey: ["admin-modpack-install-jobs"] });
    qc.invalidateQueries({ queryKey: ["my-servers"] });
    qc.invalidateQueries({ queryKey: ["my-notifications"] });
  };

  const retry = useMutation({
    mutationFn: (jobId: string) => retryFn({ data: { jobId } }),
    onSuccess: (result) => {
      if (result.skipped) toast.info(`Job inchangé: ${result.status}`);
      else toast.success("Job remis en file d’attente");
      refreshJobs();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const cancel = useMutation({
    mutationFn: (jobId: string) => cancelFn({ data: { jobId } }),
    onSuccess: (result) => {
      if (result.skipped) toast.info(`Job inchangé: ${result.status}`);
      else toast.success("Job annulé");
      refreshJobs();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const processJob = useMutation({
    mutationFn: (jobId: string) => processJobFn({ data: { jobId } }),
    onSuccess: (result) => {
      if ("skipped" in result && result.skipped) toast.info(`Worker inchangé: ${result.status}`);
      else if (result.ok) toast.success("Job validé par le worker MVP");
      else toast.error(result.error ?? "Validation échouée");
      refreshJobs();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const processNext = useMutation({
    mutationFn: () => processNextFn(),
    onSuccess: (result) => {
      if ("skipped" in result && result.skipped)
        toast.info(`Aucun job à traiter: ${result.status}`);
      else if (result.ok) toast.success("Prochain job traité");
      else toast.error(result.error ?? "Validation échouée");
      refreshJobs();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <section>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <SectionTitle
          icon={<Package className="h-5 w-5" />}
          title={`Modpack Jobs (${filtered.length})`}
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            className="bg-primary text-primary-foreground hover:bg-primary/90"
            disabled={processNext.isPending}
            onClick={() => {
              if (
                window.confirm(
                  "Lancer le worker modpack sur le prochain job queued ? Aucun upload backend ne sera fait, mais une commande serveur peut être envoyée si le template l’autorise.",
                )
              ) {
                processNext.mutate();
              }
            }}
          >
            Install next
          </Button>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="rounded-md border border-border bg-background px-3 py-2 text-sm"
          >
            <option value="">Tous les statuts</option>
            {[
              "queued",
              "downloading",
              "extracting",
              "installing",
              "configuring",
              "ready",
              "failed",
              "cancelled",
            ].map((item) => (
              <option key={item} value={item}>
                {modpackInstallLabel(item)}
              </option>
            ))}
          </select>
        </div>
      </div>
      <TableShell empty={filtered.length === 0 ? "Aucun job modpack." : null}>
        <Table>
          <TableHeader className="bg-surface-2">
            <TableRow>
              <TableHead>Job</TableHead>
              <TableHead>Modpack</TableHead>
              <TableHead>Server</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Attempts</TableHead>
              <TableHead>Taille</TableHead>
              <TableHead>Timing</TableHead>
              <TableHead>Logs</TableHead>
              <TableHead>Error</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((job) => (
              <TableRow key={job.id}>
                <TableCell>
                  <div className="font-mono text-xs">{shortId(job.id)}</div>
                  <div className="text-xs text-muted-foreground">{formatDate(job.created_at)}</div>
                </TableCell>
                <TableCell className="min-w-56">
                  <div className="font-medium">
                    {job.curseforge_modpacks?.name ?? `CF ${job.curseforge_mod_id ?? "—"}`}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {job.curseforge_modpack_versions?.display_name ??
                      `file ${job.curseforge_file_id ?? "—"}`}
                  </div>
                </TableCell>
                <TableCell>
                  <div>{job.server_orders?.server_name ?? shortId(job.server_order_id)}</div>
                  <div className="text-xs text-muted-foreground">order {shortId(job.order_id)}</div>
                </TableCell>
                <TableCell>
                  <StatusBadge status={job.status} />
                  <div className="mt-1 text-xs text-muted-foreground">
                    {modpackInstallLabel(job.status)}
                  </div>
                </TableCell>
                <TableCell>
                  {job.attempts}/{job.max_attempts}
                </TableCell>
                <TableCell>{formatBytes(job.file_length)}</TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  <div>Start: {formatDate(job.started_at)}</div>
                  <div>End: {formatDate(job.finished_at)}</div>
                </TableCell>
                <TableCell className="min-w-72">
                  <div className="max-h-28 space-y-1 overflow-y-auto rounded-md border border-border/70 bg-background/30 p-2 text-xs">
                    {(job.logs ?? []).length === 0 ? (
                      <div className="text-muted-foreground">Aucun log.</div>
                    ) : (
                      (job.logs ?? []).map((log, index) => (
                        <div key={`${job.id}-log-${index}`} className="text-muted-foreground">
                          <span className="text-primary">{log.event ?? "log"}</span>
                          {log.message ? ` · ${log.message}` : ""}
                        </div>
                      ))
                    )}
                  </div>
                </TableCell>
                <TableCell className="max-w-64 truncate text-muted-foreground">
                  {job.error_message ?? "—"}
                </TableCell>
                <TableCell>
                  <div className="flex justify-end gap-2">
                    {job.status === "queued" ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={processJob.isPending}
                        onClick={() => {
                          if (
                            window.confirm(
                              "Lancer l’installation MVP pour ce job ? Une commande serveur contrôlée peut être envoyée uniquement si le template l’autorise.",
                            )
                          ) {
                            processJob.mutate(job.id);
                          }
                        }}
                      >
                        Install
                      </Button>
                    ) : null}
                    {["failed", "cancelled"].includes(job.status) ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={retry.isPending}
                        onClick={() => retry.mutate(job.id)}
                      >
                        Retry
                      </Button>
                    ) : null}
                    {job.status === "queued" ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={cancel.isPending}
                        onClick={() => cancel.mutate(job.id)}
                      >
                        Cancel
                      </Button>
                    ) : null}
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
type AdminTemplateModpackInstallConfig = {
  enabled?: boolean;
  command_template?: string;
  max_file_size_mb?: number | null;
  requires_server_pack?: boolean;
  supported_loaders?: string[];
  notes?: string;
};
type AdminTemplateSettingsSyncConfig = {
  enabled?: boolean;
  mode?: "metadata_only" | "file_patch" | "command_template";
  target_file?: string | null;
  restart_required?: boolean;
  command_template?: string | null;
  allowed_settings?: Record<
    string,
    {
      type?: "string" | "number" | "boolean";
      target_key?: string;
      section?: string | null;
      min?: number | null;
      max?: number | null;
    }
  >;
};
type AdminTemplateMetadata = {
  modpack_install?: AdminTemplateModpackInstallConfig | null;
  settings_sync?: AdminTemplateSettingsSyncConfig | null;
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
  metadata: AdminTemplateMetadata | null;
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
type AdminCurseForgeDiagnostic = {
  endpoint: string;
  baseUrl: string;
  url: string;
  cwd: string;
  nodeEnv: string | null;
  apiKeyPresent: boolean;
  keyLength: number;
  keyPrefix: string | null;
  keySuffix: string | null;
  hasQuotes: boolean;
  hasWhitespace: boolean;
  keySource: "process.env" | ".env";
  envFilePath: string | null;
  processKeyLength: number;
  envFileKeyLength: number | null;
  method: "GET";
  status: number | null;
  ok: boolean;
  message: string;
  body: string | null;
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
const MODPACK_INSTALL_LOADERS = ["Forge", "Fabric", "Quilt", "NeoForge", "Vanilla"];

type ModpackInstallConfig = {
  enabled: boolean;
  command_template: string;
  max_file_size_mb: number | null;
  requires_server_pack: boolean;
  supported_loaders: string[];
  notes: string;
};

function readTemplateModpackInstall(template: AdminCatalogTemplate): ModpackInstallConfig {
  const metadata =
    template.metadata && typeof template.metadata === "object" ? template.metadata : {};
  const raw =
    metadata.modpack_install && typeof metadata.modpack_install === "object"
      ? metadata.modpack_install
      : {};
  return {
    enabled: raw.enabled === true,
    command_template: typeof raw.command_template === "string" ? raw.command_template : "",
    max_file_size_mb:
      typeof raw.max_file_size_mb === "number" && Number.isFinite(raw.max_file_size_mb)
        ? raw.max_file_size_mb
        : null,
    requires_server_pack: raw.requires_server_pack !== false,
    supported_loaders: Array.isArray(raw.supported_loaders)
      ? raw.supported_loaders.filter((item): item is string => typeof item === "string")
      : [],
    notes: typeof raw.notes === "string" ? raw.notes : "",
  };
}

function ModpackInstallBadge({ template }: { template: AdminCatalogTemplate }) {
  const config = readTemplateModpackInstall(template);
  return (
    <div className="space-y-1">
      <Badge variant={config.enabled ? "default" : "outline"}>
        {config.enabled ? "Installation modpack activée" : "Désactivée"}
      </Badge>
      {config.supported_loaders.length > 0 ? (
        <div className="text-xs text-muted-foreground">{config.supported_loaders.join(", ")}</div>
      ) : null}
    </div>
  );
}

type SettingsSyncConfig = Required<
  Pick<AdminTemplateSettingsSyncConfig, "enabled" | "mode" | "restart_required">
> & {
  target_file: string;
  command_template: string;
  allowed_settings: NonNullable<AdminTemplateSettingsSyncConfig["allowed_settings"]>;
};

const SETTINGS_SYNC_EXAMPLE = JSON.stringify(
  {
    serverName: { type: "string", target_key: "SessionName", section: "SessionSettings" },
    motd: { type: "string", target_key: "Message", section: "MessageOfTheDay" },
    xpRate: {
      type: "number",
      target_key: "XPMultiplier",
      section: "ServerSettings",
      min: 0.1,
      max: 10,
    },
  },
  null,
  2,
);

const SETTINGS_SYNC_PRESETS: Record<
  "minecraft" | "ark" | "conan" | "gmod",
  {
    label: string;
    mode: SettingsSyncConfig["mode"];
    target_file: string;
    restart_required: boolean;
    allowed_settings: SettingsSyncConfig["allowed_settings"];
  }
> = {
  minecraft: {
    label: "Minecraft",
    mode: "file_patch",
    target_file: "server.properties",
    restart_required: true,
    allowed_settings: {
      motd: { type: "string", target_key: "motd" },
      difficulty: { type: "string", target_key: "difficulty" },
      gamemode: { type: "string", target_key: "gamemode" },
      hardcore: { type: "boolean", target_key: "hardcore" },
      pvp: { type: "boolean", target_key: "pvp" },
      whitelist: { type: "boolean", target_key: "white-list" },
      onlineMode: { type: "boolean", target_key: "online-mode" },
      allowFlight: { type: "boolean", target_key: "allow-flight" },
      spawnProtection: { type: "number", target_key: "spawn-protection", min: 0, max: 64 },
      viewDistance: { type: "number", target_key: "view-distance", min: 2, max: 32 },
      simulationDistance: { type: "number", target_key: "simulation-distance", min: 2, max: 32 },
      seed: { type: "string", target_key: "level-seed" },
    },
  },
  ark: {
    label: "ARK",
    mode: "file_patch",
    target_file: "ShooterGame/Saved/Config/LinuxServer/GameUserSettings.ini",
    restart_required: true,
    allowed_settings: {
      serverName: { type: "string", target_key: "SessionName", section: "SessionSettings" },
      motd: { type: "string", target_key: "Message", section: "MessageOfTheDay" },
      password: { type: "string", target_key: "ServerPassword", section: "ServerSettings" },
      xpRate: {
        type: "number",
        target_key: "XPMultiplier",
        section: "ServerSettings",
        min: 0.1,
        max: 10,
      },
      harvestRate: {
        type: "number",
        target_key: "HarvestAmountMultiplier",
        section: "ServerSettings",
        min: 0.1,
        max: 10,
      },
      tamingRate: {
        type: "number",
        target_key: "TamingSpeedMultiplier",
        section: "ServerSettings",
        min: 0.1,
        max: 10,
      },
    },
  },
  conan: {
    label: "Conan",
    mode: "file_patch",
    target_file: "ConanSandbox/Saved/Config/LinuxServer/ServerSettings.ini",
    restart_required: true,
    allowed_settings: {
      serverName: { type: "string", target_key: "ServerName", section: "ServerSettings" },
      motd: { type: "string", target_key: "MessageOfTheDay", section: "ServerSettings" },
      password: { type: "string", target_key: "ServerPassword", section: "ServerSettings" },
    },
  },
  gmod: {
    label: "Garry’s Mod",
    mode: "file_patch",
    target_file: "garrysmod/cfg/server.cfg",
    restart_required: true,
    allowed_settings: {
      hostname: { type: "string", target_key: "hostname" },
      gamemode: { type: "string", target_key: "sv_gamemode" },
      collectionId: { type: "string", target_key: "host_workshop_collection" },
    },
  },
};

function readTemplateSettingsSync(template: AdminCatalogTemplate): SettingsSyncConfig {
  const metadata =
    template.metadata && typeof template.metadata === "object" ? template.metadata : {};
  const raw =
    metadata.settings_sync && typeof metadata.settings_sync === "object"
      ? metadata.settings_sync
      : {};
  return {
    enabled: raw.enabled === true,
    mode: raw.mode === "file_patch" || raw.mode === "command_template" ? raw.mode : "metadata_only",
    target_file: typeof raw.target_file === "string" ? raw.target_file : "",
    restart_required: raw.restart_required === true,
    command_template: typeof raw.command_template === "string" ? raw.command_template : "",
    allowed_settings:
      raw.allowed_settings && typeof raw.allowed_settings === "object" ? raw.allowed_settings : {},
  };
}

function SettingsSyncBadge({ template }: { template: AdminCatalogTemplate }) {
  const config = readTemplateSettingsSync(template);
  return (
    <div className="space-y-1">
      <Badge variant={config.enabled ? "default" : "outline"}>
        {config.enabled ? "Sync paramètres activée" : "Sync metadata only"}
      </Badge>
      <div className="text-xs text-muted-foreground">
        {config.mode}
        {config.target_file ? ` · ${config.target_file}` : ""}
      </div>
    </div>
  );
}

function EditTemplateSettingsSyncDialog({ template }: { template: AdminCatalogTemplate }) {
  const qc = useQueryClient();
  const updateFn = useServerFn(adminUpdateTemplateSettingsSync);
  const initial = readTemplateSettingsSync(template);
  const [open, setOpen] = useState(false);
  const [enabled, setEnabled] = useState(initial.enabled);
  const [mode, setMode] = useState<SettingsSyncConfig["mode"]>(initial.mode);
  const [targetFile, setTargetFile] = useState(initial.target_file);
  const [restartRequired, setRestartRequired] = useState(initial.restart_required);
  const [commandTemplate, setCommandTemplate] = useState(initial.command_template);
  const [allowedSettingsJson, setAllowedSettingsJson] = useState(
    JSON.stringify(initial.allowed_settings, null, 2),
  );
  const hasExistingConfig =
    initial.enabled ||
    initial.mode !== "metadata_only" ||
    initial.target_file ||
    Object.keys(initial.allowed_settings).length > 0;

  const applyPreset = (presetKey: keyof typeof SETTINGS_SYNC_PRESETS) => {
    const preset = SETTINGS_SYNC_PRESETS[presetKey];
    if (
      hasExistingConfig &&
      !window.confirm(`Remplacer la configuration actuelle par le preset ${preset.label} ?`)
    ) {
      return;
    }
    setEnabled(true);
    setMode(preset.mode);
    setTargetFile(preset.target_file);
    setRestartRequired(preset.restart_required);
    setCommandTemplate("");
    setAllowedSettingsJson(JSON.stringify(preset.allowed_settings, null, 2));
    toast.success(`Preset ${preset.label} appliqué`);
  };

  const resetMetadataOnly = () => {
    if (
      hasExistingConfig &&
      !window.confirm("Réinitialiser cette configuration en metadata_only ?")
    ) {
      return;
    }
    setEnabled(false);
    setMode("metadata_only");
    setTargetFile("");
    setRestartRequired(false);
    setCommandTemplate("");
    setAllowedSettingsJson("{}");
  };

  const previewConfig = {
    enabled,
    mode,
    target_file: targetFile || null,
    restart_required: restartRequired,
    command_template: commandTemplate || null,
    allowed_settings: allowedSettingsJson.trim()
      ? (() => {
          try {
            return JSON.parse(allowedSettingsJson);
          } catch {
            return { error: "JSON invalide" };
          }
        })()
      : {},
  };

  const save = useMutation({
    mutationFn: () => {
      const parsed = allowedSettingsJson.trim() ? JSON.parse(allowedSettingsJson) : {};
      return updateFn({
        data: {
          templateId: template.id,
          config: {
            enabled,
            mode,
            target_file: targetFile,
            restart_required: restartRequired,
            command_template: commandTemplate,
            allowed_settings: parsed,
          },
        },
      });
    },
    onSuccess: () => {
      toast.success("Configuration de synchronisation sauvegardée");
      qc.invalidateQueries({ queryKey: ["admin-game-catalog"] });
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          Sync paramètres
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Synchronisation paramètres · {template.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {(Object.keys(SETTINGS_SYNC_PRESETS) as Array<keyof typeof SETTINGS_SYNC_PRESETS>).map(
              (presetKey) => (
                <Button
                  key={presetKey}
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => applyPreset(presetKey)}
                >
                  Appliquer preset {SETTINGS_SYNC_PRESETS[presetKey].label}
                </Button>
              ),
            )}
            <Button type="button" size="sm" variant="outline" onClick={resetMetadataOnly}>
              Réinitialiser en metadata_only
            </Button>
          </div>
          <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs text-primary">
            Les presets n’incluent jamais max_players, slots, ports, tokens, secrets ni rcon
            password. Le serveur revalide aussi la configuration à la sauvegarde.
          </div>
          {mode === "command_template" && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              Commande contrôlée : utiliser uniquement des scripts internes. Cette phase valide et
              stocke la commande, l’exécution réelle reste contrôlée côté serveur.
            </div>
          )}
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(event) => setEnabled(event.target.checked)}
              className="accent-[color:var(--primary)]"
            />
            Activer la synchronisation paramètres
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-2">
              <span className="text-sm font-medium">Mode</span>
              <select
                value={mode}
                onChange={(event) => setMode(event.target.value as SettingsSyncConfig["mode"])}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="metadata_only">metadata_only</option>
                <option value="file_patch">file_patch</option>
                <option value="command_template">command_template</option>
              </select>
            </label>
            <label className="flex items-end gap-2 pb-2 text-sm">
              <input
                type="checkbox"
                checked={restartRequired}
                onChange={(event) => setRestartRequired(event.target.checked)}
                className="accent-[color:var(--primary)]"
              />
              Redémarrage requis
            </label>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Fichier cible</label>
            <Input
              value={targetFile}
              onChange={(event) => setTargetFile(event.target.value)}
              placeholder="ShooterGame/Saved/Config/LinuxServer/GameUserSettings.ini"
            />
            <div className="text-xs text-muted-foreground">
              Chemin relatif uniquement. Chemins absolus et ../ refusés.
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Command template</label>
            <Textarea
              value={commandTemplate}
              onChange={(event) => setCommandTemplate(event.target.value)}
              rows={3}
              placeholder='xnt-apply-setting "{server_name}" "{motd}"'
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Allowed settings mapping JSON</label>
            <Textarea
              value={allowedSettingsJson}
              onChange={(event) => setAllowedSettingsJson(event.target.value)}
              rows={10}
              placeholder={SETTINGS_SYNC_EXAMPLE}
              className="font-mono text-xs"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Aperçu JSON</label>
            <pre className="max-h-56 overflow-auto rounded-lg border border-primary/15 bg-background/40 p-3 text-xs text-muted-foreground">
              {JSON.stringify(previewConfig, null, 2)}
            </pre>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Annuler
          </Button>
          <Button
            disabled={save.isPending}
            onClick={() => save.mutate()}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            Sauvegarder
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditTemplateModpackInstallDialog({ template }: { template: AdminCatalogTemplate }) {
  const qc = useQueryClient();
  const updateFn = useServerFn(adminUpdateTemplateModpackInstall);
  const initial = readTemplateModpackInstall(template);
  const [open, setOpen] = useState(false);
  const [enabled, setEnabled] = useState(initial.enabled);
  const [commandTemplate, setCommandTemplate] = useState(initial.command_template);
  const [maxFileSizeMb, setMaxFileSizeMb] = useState(
    initial.max_file_size_mb ? String(initial.max_file_size_mb) : "",
  );
  const [requiresServerPack, setRequiresServerPack] = useState(initial.requires_server_pack);
  const [supportedLoaders, setSupportedLoaders] = useState<string[]>(initial.supported_loaders);
  const [notes, setNotes] = useState(initial.notes);

  const save = useMutation({
    mutationFn: () =>
      updateFn({
        data: {
          templateId: template.id,
          config: {
            enabled,
            command_template: commandTemplate,
            max_file_size_mb: maxFileSizeMb ? Number(maxFileSizeMb) : null,
            requires_server_pack: requiresServerPack,
            supported_loaders: supportedLoaders,
            notes,
          },
        },
      }),
    onSuccess: () => {
      toast.success("Configuration modpack sauvegardée");
      qc.invalidateQueries({ queryKey: ["admin-game-catalog"] });
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleLoader = (loader: string) => {
    setSupportedLoaders((current) =>
      current.includes(loader) ? current.filter((item) => item !== loader) : [...current, loader],
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          Modpack
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Installation modpack · {template.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            Cette commande sera exécutée côté serveur client. Utiliser uniquement des scripts
            internes contrôlés. Ne pas coller de commande shell arbitraire.
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(event) => setEnabled(event.target.checked)}
              className="accent-[color:var(--primary)]"
            />
            Activer l’installation modpack pour ce template
          </label>
          <div className="space-y-2">
            <label className="text-sm font-medium">Command template</label>
            <Textarea
              value={commandTemplate}
              onChange={(event) => setCommandTemplate(event.target.value)}
              rows={4}
              placeholder="Exemple interne uniquement : xnt-install-modpack --url {download_url} --server-pack {server_pack_file_id}"
            />
            <div className="text-xs text-muted-foreground">
              Placeholders autorisés : {"{download_url}"}, {"{modpack_name}"}, {"{modpack_id}"},{" "}
              {"{file_id}"}, {"{server_pack_file_id}"}.
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">Taille max fichier (MB)</label>
              <Input
                type="number"
                min={1}
                max={4096}
                value={maxFileSizeMb}
                onChange={(event) => setMaxFileSizeMb(event.target.value)}
                placeholder="1024"
              />
            </div>
            <label className="flex items-end gap-2 pb-2 text-sm">
              <input
                type="checkbox"
                checked={requiresServerPack}
                onChange={(event) => setRequiresServerPack(event.target.checked)}
                className="accent-[color:var(--primary)]"
              />
              Server pack obligatoire
            </label>
          </div>
          <div className="space-y-2">
            <div className="text-sm font-medium">Loaders supportés</div>
            <div className="flex flex-wrap gap-2">
              {MODPACK_INSTALL_LOADERS.map((loader) => (
                <button
                  key={loader}
                  type="button"
                  onClick={() => toggleLoader(loader)}
                  className={`rounded-full border px-3 py-1 text-sm ${
                    supportedLoaders.includes(loader)
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-background/30 text-muted-foreground"
                  }`}
                >
                  {loader}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Notes admin</label>
            <Textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={3}
              placeholder="Script attendu dans l’image, contraintes, rollback manuel..."
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Annuler
          </Button>
          <Button
            disabled={save.isPending}
            onClick={() => save.mutate()}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            Sauvegarder
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

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
                <TableHead>Installation modpack</TableHead>
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
                <TableHead>Sync paramètres</TableHead>
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
                    <ModpackInstallBadge template={template} />
                  </TableCell>
                  <TableCell>
                    <SettingsSyncBadge template={template} />
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={template.is_active ? "active" : "disabled"} />
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-2">
                      <EditTemplateModpackInstallDialog template={template} />
                      <EditTemplateSettingsSyncDialog template={template} />
                      <ToggleButton
                        table="server_templates"
                        id={template.id}
                        active={template.is_active}
                      />
                    </div>
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
  const testConnectionFn = useServerFn(adminTestCurseForgeConnection);
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
  const [diagnostic, setDiagnostic] = useState<AdminCurseForgeDiagnostic | null>(null);
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

  const testConnection = useMutation({
    mutationFn: () => testConnectionFn(),
    onSuccess: (payload) => {
      const result = payload as AdminCurseForgeDiagnostic;
      setDiagnostic(result);
      if (result.ok) toast.success("Connexion CurseForge OK");
      else toast.warning(result.message);
    },
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

        <div className="xnt-card mb-4 rounded-lg p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="font-medium">Diagnostic API CurseForge</div>
              <p className="text-sm text-muted-foreground">
                Test server-only avec endpoint public de recherche. La clé n’est jamais affichée.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              disabled={testConnection.isPending}
              onClick={() => testConnection.mutate()}
            >
              {testConnection.isPending ? "Test..." : "Tester connexion CurseForge"}
            </Button>
          </div>
          {diagnostic ? (
            <div className="mt-4 grid gap-2 rounded-lg border border-primary/15 bg-background/40 p-3 text-sm md:grid-cols-2">
              <div>
                API key détectée :{" "}
                <span className={diagnostic.apiKeyPresent ? "text-success" : "text-destructive"}>
                  {diagnostic.apiKeyPresent ? "oui" : "non"}
                </span>
              </div>
              <div>Status HTTP : {diagnostic.status ?? "—"}</div>
              <div>Longueur clé : {diagnostic.keyLength}</div>
              <div>Source clé : {diagnostic.keySource}</div>
              <div>Longueur process.env : {diagnostic.processKeyLength}</div>
              <div>Longueur .env : {diagnostic.envFileKeyLength ?? "—"}</div>
              <div>
                Empreinte : {diagnostic.keyPrefix ?? "—"}...{diagnostic.keySuffix ?? "—"}
              </div>
              <div>Quotes : {diagnostic.hasQuotes ? "oui" : "non"}</div>
              <div>Whitespace : {diagnostic.hasWhitespace ? "oui" : "non"}</div>
              <div>NODE_ENV : {diagnostic.nodeEnv ?? "—"}</div>
              <div className="break-all">cwd : {diagnostic.cwd}</div>
              <div className="break-all">Fichier env : {diagnostic.envFilePath ?? "—"}</div>
              <div>Endpoint : {diagnostic.endpoint}</div>
              <div>Base URL : {diagnostic.baseUrl}</div>
              <div>Méthode : {diagnostic.method}</div>
              <div className="md:col-span-2">Message : {diagnostic.message}</div>
              <div className="md:col-span-2 break-all text-xs text-muted-foreground">
                URL testée : {diagnostic.url}
              </div>
              {diagnostic.body ? (
                <pre className="max-h-40 overflow-auto rounded-md border border-border/70 bg-black/30 p-3 text-xs md:col-span-2">
                  {diagnostic.body}
                </pre>
              ) : null}
            </div>
          ) : null}
        </div>

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

function workerLabel(worker: AdminWorkerName | "all") {
  const labels: Record<AdminWorkerName | "all", string> = {
    "minecraft-sync": "Minecraft Sync",
    reconciliation: "Reconciliation",
    modpack: "Modpacks",
    monitoring: "Monitoring",
    all: "Tous les workers",
  };
  return labels[worker] ?? worker;
}

function StatusBadge({ status }: { status: string }) {
  return (
    <Badge variant="outline" className={`capitalize xnt-status-${status}`}>
      {status.replaceAll("_", " ")}
    </Badge>
  );
}

function MinecraftMetaLine({ settings }: { settings?: AdminMinecraftSettings }) {
  if (!settings?.max_players && !settings?.minecraft_version && !settings?.server_type) {
    return null;
  }
  return (
    <div className="mt-1 text-xs text-muted-foreground">
      {settings.server_type ?? "Type auto"} · {settings.minecraft_version ?? "Version auto"} ·{" "}
      version {settings.version_apply_status ?? "auto"} ·{" "}
      {settings.max_players ? `${settings.max_players} joueurs` : "Joueurs auto"} ·{" "}
      {settings.max_players_applied ? "appliqué" : "en attente"}
      {typeof settings.extra_price_cents === "number"
        ? ` · supplément ${(settings.extra_price_cents / 100).toFixed(2)}`
        : ""}
      {typeof settings.total_price_cents === "number"
        ? ` · total ${(settings.total_price_cents / 100).toFixed(2)}`
        : ""}
    </div>
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
    archive_missing_server: "Archiver",
    cleanup_staging_missing_servers: "Nettoyer test",
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

function formatBytes(bytes: number | null | undefined) {
  if (!bytes) return "—";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}

function modpackInstallLabel(status: string) {
  const labels: Record<string, string> = {
    queued: "Installation planifiée",
    downloading: "Téléchargement",
    extracting: "Extraction",
    installing: "Installation",
    configuring: "Configuration",
    ready: "Prêt",
    failed: "Échec",
    cancelled: "Annulé",
  };
  return labels[status] ?? status;
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
