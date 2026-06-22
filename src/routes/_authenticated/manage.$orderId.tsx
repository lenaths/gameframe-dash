import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Play,
  RotateCw,
  Square,
  Folder,
  File as FileIcon,
  Trash2,
  FolderPlus,
  Save,
  RefreshCw,
  ChevronLeft,
  Copy,
  LifeBuoy,
  Archive,
  Network,
  AlertTriangle,
  Upload,
  Download,
  Pencil,
  MoveRight,
  Search,
  X,
  Image as ImageIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { SiteHeader } from "@/components/site-header";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  getServerDetail,
  getServerWebsocket,
  powerServer,
  sendServerCommand,
  listServerFiles,
  readServerFile,
  writeServerFile,
  deleteServerFiles,
  createServerFolder,
  uploadServerFiles,
  getServerFileDownload,
  moveServerFile,
  listServerBackups,
  createServerBackup,
  deleteServerBackup,
  listServerNetworkAllocations,
  setPrimaryServerAllocation,
  deleteServerAllocation,
  renameServer,
  applyServerSettings,
  syncGameSettings,
  reinstallServerClient,
  getServerStartup,
  updateServerStartup,
} from "@/lib/servers.functions";
import { EggVariablesForm } from "@/components/egg-variables-form";
import { isMinecraftGame, normalizeGameKey } from "@/lib/game-config";

const MAX_EDITABLE_FILE_SIZE_BYTES = 1024 * 1024;
const BLOCKED_EDITOR_EXTENSIONS = new Set([
  ".jar",
  ".zip",
  ".tar",
  ".gz",
  ".exe",
  ".bin",
  ".sqlite",
  ".db",
]);
const MANAGED_FILE_MESSAGE =
  "Ce fichier est géré par XNTServers. Modifie ces paramètres depuis l’onglet Paramètres serveur.";
const PROTECTED_FILE_BASENAMES = new Set([
  "server.properties",
  "config.yml",
  "paper.yml",
  "paper-global.yml",
  "paper-world-defaults.yml",
  "spigot.yml",
  "bukkit.yml",
  "commands.yml",
  "permissions.yml",
  "velocity.toml",
  "waterfall.yml",
  "fabric-server-launcher.properties",
  "forge-server.toml",
  "eula.txt",
  "xnt-install-modpack",
  ".env",
  ".env.local",
  ".env.production",
  "docker-compose.yml",
  "docker-compose.yaml",
  "gameusersettings.ini",
  "game.ini",
  "engine.ini",
  "serversettings.ini",
  "server.cfg",
]);

type SettingsChangeLogEntry = {
  at: string;
  user_id: string;
  key: string;
  old_value: unknown;
  new_value: unknown;
};

type SettingsSyncState = {
  last_sync_at: string | null;
  last_sync_status: string | null;
  last_sync_error: string | null;
  restart_recommended: boolean;
  mode?: string | null;
  target_file?: string | null;
  purchased_slots?: number | null;
  changed_keys: string[];
};

type InitialMinecraftSyncState = {
  status: string | null;
  synced_at: string | null;
  changed_keys: string[];
  error: string | null;
  retry_count?: number | null;
  next_retry_at?: string | null;
  last_attempt_at?: string | null;
  last_error?: string | null;
};

const WS_ERROR_MESSAGE =
  "Console temps réel inaccessible. Le service serveur est temporairement indisponible.";
const SHOW_CONSOLE_DEBUG = import.meta.env.DEV;

type ConsoleDebugState = {
  endpoint: string;
  responseShape: string;
  hasToken: string;
  tokenLength: string;
  originalSocket: string;
  normalizedSocket: string;
  socketProtocol: string;
  socketHost: string;
  attempt1Socket: string;
  attempt1Result: string;
  attempt2Socket: string;
  attempt2Result: string;
  reachedStage: string;
  websocketOpenAt: string;
  authSentAt: string;
  authSuccessAt: string;
  authFailedAt: string;
  closeCode: string;
  closeReason: string;
  lastRawMessage: string;
  lastWebsocketError: string;
  serverDiagnostic: string;
};

const initialConsoleDebug: ConsoleDebugState = {
  endpoint: "—",
  responseShape: "—",
  hasToken: "—",
  tokenLength: "—",
  originalSocket: "—",
  normalizedSocket: "—",
  socketProtocol: "—",
  socketHost: "—",
  attempt1Socket: "—",
  attempt1Result: "—",
  attempt2Socket: "—",
  attempt2Result: "—",
  reachedStage: "—",
  websocketOpenAt: "—",
  authSentAt: "—",
  authSuccessAt: "—",
  authFailedAt: "—",
  closeCode: "—",
  closeReason: "—",
  lastRawMessage: "—",
  lastWebsocketError: "—",
  serverDiagnostic: "—",
};

export const Route = createFileRoute("/_authenticated/manage/$orderId")({
  head: () => ({ meta: [{ title: "Manage server · XntServers" }] }),
  component: ServerDetail,
});

function ServerDetail() {
  const { orderId } = Route.useParams();
  const fetchDetail = useServerFn(getServerDetail);
  const sendPower = useServerFn(powerServer);
  const qc = useQueryClient();

  const {
    data,
    isLoading,
    isFetching,
    error: serverDetailError,
    refetch: refetchServerDetail,
  } = useQuery({
    queryKey: ["server-detail", orderId],
    queryFn: () => fetchDetail({ data: { orderId } }),
    refetchInterval: 5000,
    retry: 1,
  });

  const waitForStateChange = async (previousState: string | null) => {
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
    mutationFn: async (signal: "start" | "stop" | "restart") => {
      const previousState = live?.state ?? null;
      await sendPower({ data: { orderId, signal } });
      toast.info("Signal envoyé, attente du changement d’état…");
      return { signal, previousState, nextState: await waitForStateChange(previousState) };
    },
    onSuccess: ({ signal, previousState, nextState }) => {
      if (nextState) {
        toast.success(`${signal} confirmé: ${previousState ?? "unknown"} → ${nextState}`);
      } else {
        toast.warning("Signal envoyé, mais aucun changement d’état détecté après 30 secondes.");
      }
      qc.invalidateQueries({ queryKey: ["server-detail", orderId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const order = data?.order;
  const access = data?.access;
  const live = data?.live;
  const connection = live?.connection;
  const gameKey = normalizeGameKey(order?.plans?.game);
  const minecraftSettings =
    (
      order as
        | {
            minecraft_settings?: {
              server_type?: string | null;
              minecraft_version?: string | null;
              version_apply_status?: string | null;
              version_variable?: string | null;
              max_players?: number | null;
              max_players_applied?: boolean;
            } | null;
          }
        | undefined
    )?.minecraft_settings ?? null;
  const serverSettings =
    (
      order as
        | {
            server_settings?: Record<string, unknown> | null;
          }
        | undefined
    )?.server_settings ?? {};
  const settingsChangeLog =
    (
      order as
        | {
            settings_change_log?: SettingsChangeLogEntry[] | null;
          }
        | undefined
    )?.settings_change_log ?? [];
  const settingsSync =
    (
      order as
        | {
            settings_sync?: SettingsSyncState | null;
          }
        | undefined
    )?.settings_sync ?? null;
  const initialMinecraftSync =
    (
      order as
        | {
            initial_minecraft_sync?: InitialMinecraftSyncState | null;
          }
        | undefined
    )?.initial_minecraft_sync ?? null;
  const serverSettingsLabel = getServerSettingsLabel(gameKey);

  return (
    <div className="xnt-page min-h-screen">
      <SiteHeader />
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <Button asChild variant="ghost" size="sm" className="mb-4 -ml-2">
          <Link to="/dashboard">
            <ArrowLeft className="h-4 w-4 mr-1.5" /> Back
          </Link>
        </Button>

        {isLoading ? (
          <div className="xnt-card rounded-xl p-8 text-muted-foreground">
            Chargement des données serveur…
          </div>
        ) : serverDetailError ? (
          <div className="xnt-card rounded-xl border border-destructive/30 p-8">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="mb-2 inline-flex rounded-full border border-destructive/30 bg-destructive/10 px-3 py-1 text-xs text-destructive">
                  Accès serveur indisponible
                </div>
                <h1 className="font-display text-2xl font-semibold">
                  Impossible d’ouvrir ce serveur
                </h1>
                <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                  {serverDetailError instanceof Error
                    ? serverDetailError.message
                    : "Une erreur est survenue pendant le chargement du serveur."}
                </p>
              </div>
              <Button
                variant="outline"
                disabled={isFetching}
                onClick={() => void refetchServerDetail()}
              >
                <RefreshCw className="mr-1.5 h-4 w-4" />
                Réessayer
              </Button>
            </div>
          </div>
        ) : !order ? (
          <div className="xnt-card rounded-xl border border-accent/30 p-8">
            <h1 className="font-display text-2xl font-semibold">Serveur introuvable</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Ce serveur n’existe pas ou vous n’avez pas les droits nécessaires pour l’ouvrir.
            </p>
          </div>
        ) : (
          <>
            <div className="xnt-card mb-6 rounded-2xl p-6">
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <div className="mb-3 inline-flex rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs text-primary">
                    Server control room
                  </div>
                  {access?.isAdminAccess && (
                    <div className="mb-3 inline-flex flex-wrap gap-2 rounded-lg border border-accent/35 bg-accent/10 px-3 py-2 text-xs text-accent">
                      <span className="font-semibold">Vue admin — serveur client</span>
                      <span>Client: {access.ownerEmail ?? access.ownerUserId}</span>
                      <span>Order: {access.orderId ?? "—"}</span>
                      <span>Server order: {access.serverOrderId}</span>
                    </div>
                  )}
                  <h1 className="font-display text-3xl font-bold">{order.server_name}</h1>
                  <div className="text-sm text-muted-foreground mt-1">
                    {order.plans?.game} · {order.plans?.name}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge
                    variant="outline"
                    className={`capitalize xnt-status-${live?.state ?? order.status}`}
                  >
                    {live?.state ?? order.status}
                  </Badge>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={power.isPending}
                    onClick={() => power.mutate("start")}
                  >
                    <Play className="h-4 w-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={power.isPending}
                    onClick={() => power.mutate("restart")}
                  >
                    <RotateCw className="h-4 w-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={power.isPending}
                    onClick={() => power.mutate("stop")}
                  >
                    <Square className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                <NetworkStat
                  label="IP publique"
                  value={connection?.address ?? "Adresse publique indisponible"}
                />
                <NetworkStat label="Port serveur" value={connection?.port ?? "Port indisponible"} />
                <NetworkStat
                  label="Adresse SFTP"
                  value={connection?.sftpHost ?? "SFTP indisponible"}
                />
                <NetworkStat
                  label="Port SFTP"
                  value={connection?.sftpPort ?? "Port SFTP indisponible"}
                />
                <NetworkStat
                  label="Utilisateur SFTP"
                  value={connection?.sftpUsername ?? "Utilisateur SFTP indisponible"}
                />
              </div>
              {connection?.unavailableReason && (
                <div className="mt-4 rounded-lg border border-accent/30 bg-accent/10 p-3 text-sm text-accent">
                  {connection.unavailableReason}
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3 mb-6 md:grid-cols-4">
              <Stat label="State" value={live?.state ?? "—"} />
              <Stat label="RAM" value={`${live?.memoryMb ?? 0} / ${order.plans?.ram_mb ?? 0} MB`} />
              <Stat label="CPU" value={`${live?.cpu ?? 0}%`} />
              <Stat label="Disk" value={`${live?.diskMb ?? 0} MB`} />
            </div>

            {data.warning && (
              <div className="mb-6 rounded-lg border border-accent/30 bg-accent/10 p-4 text-sm text-accent">
                {data.warning}
              </div>
            )}

            {data.modpackInstallJob && (
              <div className="xnt-card mb-6 rounded-xl p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-xs uppercase tracking-wider text-muted-foreground">
                      Installation modpack
                    </div>
                    <h3 className="mt-1 font-display text-xl font-semibold">
                      {data.modpackInstallJob.curseforge_modpacks?.name ?? "Modpack sélectionné"}
                    </h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {data.modpackInstallJob.curseforge_modpack_versions?.display_name ??
                        "Version sélectionnée"}
                    </p>
                  </div>
                  <Badge variant="outline" className="capitalize">
                    {modpackInstallLabel(data.modpackInstallJob.status)}
                  </Badge>
                </div>
                <p className="mt-3 text-sm text-muted-foreground">
                  {modpackInstallDescription(data.modpackInstallJob.status)}
                </p>
                {data.modpackInstallJob.error_message && (
                  <div className="mt-3 rounded-lg border border-destructive/35 bg-destructive/10 p-3 text-sm text-destructive">
                    {data.modpackInstallJob.error_message}
                  </div>
                )}
                {data.modpackInstallJob.status === "failed" && (
                  <Button asChild size="sm" variant="outline" className="mt-4">
                    <Link
                      to="/support"
                      search={
                        {
                          subject: `Échec installation modpack ${order.server_name}`,
                          orderId: order.id,
                        } as never
                      }
                    >
                      <LifeBuoy className="mr-1.5 h-4 w-4" />
                      Contacter le support
                    </Link>
                  </Button>
                )}
              </div>
            )}

            <Tabs defaultValue="console">
              <TabsList>
                <TabsTrigger value="console">Console</TabsTrigger>
                <TabsTrigger value="stats">Stats</TabsTrigger>
                <TabsTrigger value="files">Files</TabsTrigger>
                <TabsTrigger value="backups">Backups</TabsTrigger>
                <TabsTrigger value="network">Network</TabsTrigger>
                <TabsTrigger value="server-settings">{serverSettingsLabel}</TabsTrigger>
                <TabsTrigger value="startup">Paramètres avancés</TabsTrigger>
                <TabsTrigger value="settings">Paramètres</TabsTrigger>
                <TabsTrigger value="info">SFTP &amp; Info</TabsTrigger>
              </TabsList>

              <TabsContent value="console" className="mt-4">
                <ConsoleTab orderId={orderId} />
              </TabsContent>
              <TabsContent value="stats" className="mt-4">
                <StatsTab orderId={orderId} />
              </TabsContent>
              <TabsContent value="files" className="mt-4">
                <FilesTab orderId={orderId} />
              </TabsContent>
              <TabsContent value="backups" className="mt-4">
                <BackupsTab orderId={orderId} />
              </TabsContent>
              <TabsContent value="network" className="mt-4">
                <NetworkTab
                  orderId={orderId}
                  serverName={order.server_name}
                  identifier={order.pterodactyl_server_identifier ?? null}
                />
              </TabsContent>
              <TabsContent value="server-settings" className="mt-4">
                <ServerSettingsTab
                  orderId={orderId}
                  settings={minecraftSettings}
                  serverSettings={serverSettings}
                  changeLog={settingsChangeLog}
                  syncState={settingsSync}
                  initialSyncState={initialMinecraftSync}
                  serverName={order.server_name}
                  planName={order.plans?.name ?? null}
                  game={order.plans?.game ?? null}
                  gameKey={gameKey}
                  title={serverSettingsLabel}
                />
              </TabsContent>
              <TabsContent value="startup" className="mt-4">
                <StartupTab orderId={orderId} />
              </TabsContent>
              <TabsContent value="settings" className="mt-4">
                <SettingsTab
                  orderId={orderId}
                  serverName={order.server_name}
                  identifier={order.pterodactyl_server_identifier ?? null}
                />
              </TabsContent>
              <TabsContent value="info" className="mt-4">
                <InfoTab
                  order={{
                    id: order.id,
                    serverName: order.server_name,
                    status: live?.state ?? order.status,
                  }}
                  connection={
                    connection ?? {
                      address: null,
                      port: null,
                      sftpHost: null,
                      sftpPort: null,
                      sftpUsername: null,
                      identifier: order.pterodactyl_server_identifier ?? null,
                      unavailableReason: "Informations de connexion indisponibles.",
                    }
                  }
                />
              </TabsContent>
            </Tabs>
          </>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="xnt-panel rounded-lg p-4">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="font-display text-lg font-semibold mt-1">{value}</div>
    </div>
  );
}

function NetworkStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-primary/15 bg-background/35 p-4">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 truncate font-mono text-sm text-primary">{value}</div>
    </div>
  );
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

function modpackInstallDescription(status: string) {
  const descriptions: Record<string, string> = {
    queued:
      "Le job est prêt pour la future installation automatique. Aucun téléchargement n’est lancé dans cette phase.",
    downloading: "Téléchargement du pack en cours.",
    extracting: "Extraction des fichiers du pack.",
    installing: "Installation du modpack.",
    configuring: "Configuration finale du serveur.",
    ready: "Le modpack est prêt.",
    failed: "L’installation du modpack a échoué.",
    cancelled: "Le job d’installation a été annulé.",
  };
  return descriptions[status] ?? "Statut d’installation modpack en cours.";
}

/* ---------------- Stats ---------------- */

type StatsSample = {
  at: number;
  cpu: number;
  memoryMb: number;
  diskMb: number;
  rxMb: number;
  txMb: number;
};

function StatsTab({ orderId }: { orderId: string }) {
  const fetchDetail = useServerFn(getServerDetail);
  const [history, setHistory] = useState<StatsSample[]>([]);

  const stats = useQuery({
    queryKey: ["server-stats", orderId],
    queryFn: () => fetchDetail({ data: { orderId } }),
    refetchInterval: 5000,
  });

  const live = stats.data?.live;
  const order = stats.data?.order;
  const state = live?.state ?? order?.status ?? "unknown";
  const ramLimit = order?.plans?.ram_mb ?? 0;
  const diskLimit = order?.plans?.disk_mb ?? 0;

  useEffect(() => {
    if (!live) return;
    setHistory((current) =>
      [
        ...current,
        {
          at: Date.now(),
          cpu: live.cpu ?? 0,
          memoryMb: live.memoryMb ?? 0,
          diskMb: live.diskMb ?? 0,
          rxMb: live.rxMb ?? 0,
          txMb: live.txMb ?? 0,
        },
      ].slice(-20),
    );
  }, [live?.cpu, live?.diskMb, live?.memoryMb, live?.rxMb, live?.txMb, live]);

  return (
    <div className="xnt-card rounded-xl p-5">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-display text-xl font-semibold">Stats serveur</h3>
          <p className="text-sm text-muted-foreground">
            Mesures serveur en direct, rafraîchies toutes les 5 secondes.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => stats.refetch()}>
          <RefreshCw className="mr-1.5 h-4 w-4" /> Actualiser
        </Button>
      </div>

      {stats.isLoading ? (
        <div className="text-sm text-muted-foreground">Chargement des statistiques…</div>
      ) : stats.error || stats.data?.warning ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          {(stats.error as Error | null)?.message ??
            stats.data?.warning ??
            "Statistiques indisponibles."}
        </div>
      ) : !live ? (
        <div className="rounded-lg border border-accent/30 bg-accent/10 p-4 text-sm text-accent">
          Serveur offline ou statistiques temporairement indisponibles.
        </div>
      ) : (
        <div className="space-y-5">
          {state !== "running" && state !== "active" && (
            <div className="rounded-lg border border-accent/30 bg-accent/10 p-4 text-sm text-accent">
              Le serveur est actuellement {state}. Certaines métriques peuvent rester à zéro.
            </div>
          )}

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <StatsCard
              label="État"
              value={state}
              detail={live.state === "offline" ? "Serveur arrêté" : "Ressources accessibles"}
            />
            <StatsCard label="CPU" value={`${live.cpu}%`} detail="Utilisation instantanée" />
            <StatsCard
              label="RAM"
              value={`${live.memoryMb} / ${ramLimit || "—"} MB`}
              detail={formatPercent(live.memoryMb, ramLimit)}
            />
            <StatsCard
              label="Disque"
              value={`${live.diskMb} / ${diskLimit || "—"} MB`}
              detail={formatPercent(live.diskMb, diskLimit)}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <StatsProgress label="CPU" value={Math.min(live.cpu, 100)} />
            <StatsProgress label="RAM" value={percentage(live.memoryMb, ramLimit)} />
            <StatsProgress label="Disque" value={percentage(live.diskMb, diskLimit)} />
            <div className="rounded-lg border border-primary/15 bg-background/35 p-4">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">Réseau</div>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <div className="font-mono text-sm text-primary">RX {live.rxMb} MB</div>
                <div className="font-mono text-sm text-primary">TX {live.txMb} MB</div>
              </div>
            </div>
          </div>

          {history.length > 1 && (
            <div className="rounded-lg border border-primary/15 bg-background/35 p-4">
              <div className="mb-3 text-xs uppercase tracking-wider text-muted-foreground">
                Mini historique CPU
              </div>
              <div className="flex h-24 items-end gap-1">
                {history.map((sample) => (
                  <div
                    key={sample.at}
                    className="flex-1 rounded-t bg-primary/70 shadow-[0_0_10px_rgba(0,191,255,0.35)]"
                    style={{ height: `${Math.max(4, Math.min(sample.cpu, 100))}%` }}
                    title={`${Math.round(sample.cpu)}%`}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StatsCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-lg border border-primary/15 bg-background/35 p-4 shadow-[0_0_24px_rgba(0,191,255,0.06)]">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 font-display text-2xl font-semibold text-primary">{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{detail}</div>
    </div>
  );
}

function StatsProgress({ label, value }: { label: string; value: number }) {
  const safeValue = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
  return (
    <div className="rounded-lg border border-primary/15 bg-background/35 p-4">
      <div className="mb-2 flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-mono text-primary">{Math.round(safeValue)}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-surface-2">
        <div
          className="h-full rounded-full bg-primary shadow-[0_0_14px_rgba(0,191,255,0.65)]"
          style={{ width: `${safeValue}%` }}
        />
      </div>
    </div>
  );
}

function percentage(value: number, limit: number) {
  if (!limit) return 0;
  return (value / limit) * 100;
}

function formatPercent(value: number, limit: number) {
  if (!limit) return "Limite indisponible";
  return `${Math.round(percentage(value, limit))}% utilisé`;
}

/* ---------------- Console ---------------- */

function ConsoleTab({ orderId }: { orderId: string }) {
  const fetchWs = useServerFn(getServerWebsocket);
  const sendCmd = useServerFn(sendServerCommand);
  const termRef = useRef<HTMLDivElement | null>(null);
  const termInstance = useRef<{ write: (s: string) => void; clear: () => void } | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const [command, setCommand] = useState("");
  const [connected, setConnected] = useState(false);
  const [consoleError, setConsoleError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const [wsCheckPending, setWsCheckPending] = useState(false);
  const [debug, setDebug] = useState<ConsoleDebugState>(initialConsoleDebug);

  const updateDebug = (patch: Partial<ConsoleDebugState>) => {
    if (!SHOW_CONSOLE_DEBUG) return;
    setDebug((current) => ({ ...current, ...patch }));
  };

  useEffect(() => {
    let cancelled = false;
    let ws: WebSocket | null = null;
    let xterm: { dispose: () => void } | null = null;
    let ro: ResizeObserver | null = null;
    setConnected(false);
    setConsoleError(null);
    setDebug(initialConsoleDebug);

    (async () => {
      const [{ Terminal }, { FitAddon }] = await Promise.all([
        import("@xterm/xterm"),
        import("@xterm/addon-fit"),
      ]);
      await import("@xterm/xterm/css/xterm.css");
      if (cancelled || !termRef.current) return;

      const t = new Terminal({
        convertEol: true,
        cursorBlink: true,
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        fontSize: 13,
        theme: { background: "#0a0d12", foreground: "#d1d5db" },
      });
      const fit = new FitAddon();
      t.loadAddon(fit);
      t.open(termRef.current);
      fit.fit();
      xterm = t;
      termInstance.current = { write: (s) => t.write(s), clear: () => t.clear() };

      ro = new ResizeObserver(() => {
        try {
          fit.fit();
        } catch {
          /* ignore */
        }
      });
      ro.observe(termRef.current);

      const connect = async () => {
        const creds = await fetchWs({ data: { orderId } });
        if (!creds.ok) throw new Error(creds.error);
        const socketAttempts = buildWebsocketAttempts(creds.socket);
        const firstSocketMeta = getWebsocketLogMeta(socketAttempts[0] ?? creds.socket);
        updateDebug({
          endpoint: creds.debug?.endpoint ?? "—",
          responseShape: creds.debug?.responseShape ?? "—",
          hasToken: creds.debug?.hasToken ? "oui" : "non",
          tokenLength:
            typeof creds.debug?.tokenLength === "number" ? String(creds.debug.tokenLength) : "—",
          originalSocket: creds.debug?.originalSocket ?? creds.socket,
          normalizedSocket: creds.debug?.normalizedSocket ?? "—",
          socketProtocol: firstSocketMeta.socketProtocol,
          socketHost: firstSocketMeta.socketHost,
          attempt1Socket: socketAttempts[0] ?? "—",
          attempt1Result: "pending",
          attempt2Socket: socketAttempts[1] ?? "—",
          attempt2Result: socketAttempts[1] ? "waiting" : "not needed",
          reachedStage: "created",
        });

        for (let index = 0; index < socketAttempts.length; index += 1) {
          if (cancelled) return;
          const attemptNumber = index + 1;
          const attemptSocket = socketAttempts[index];
          const result = await openConsoleSocket({
            socketUrl: attemptSocket,
            attemptNumber,
            token: creds.token,
            orderId,
            terminal: t,
            setActiveSocket: (activeSocket) => {
              ws = activeSocket;
              wsRef.current = activeSocket;
            },
            setConnected,
            setConsoleError,
            updateDebug,
            fetchWs,
          });

          if (result === "connected") return;
          if (result === "fallback" && socketAttempts[index + 1]) {
            t.write("\x1b[33m[Retrying websocket without explicit :443...]\x1b[0m\r\n");
            continue;
          }
          throw new Error(WS_ERROR_MESSAGE);
        }
      };

      try {
        await connect();
      } catch (e) {
        const message = (e as Error).message || WS_ERROR_MESSAGE;
        updateDebug({ lastWebsocketError: message });
        console.error("[Pterodactyl WS] connect failed", e);
        setConsoleError(message.includes("WebSocket") ? message : WS_ERROR_MESSAGE);
        t.write(`\x1b[31m${message}\x1b[0m\r\n`);
      }
    })();

    return () => {
      cancelled = true;
      try {
        wsRef.current?.close();
      } catch {
        /* ignore */
      }
      try {
        xterm?.dispose();
      } catch {
        /* ignore */
      }
      ro?.disconnect();
    };
  }, [orderId, fetchWs, retryKey]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!command.trim()) return;
    try {
      await sendCmd({ data: { orderId, command } });
      setCommand("");
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const runWsCheck = async () => {
    try {
      setWsCheckPending(true);
      updateDebug({ serverDiagnostic: "running..." });
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error("Session Supabase absente.");

      const response = await fetch(`/api/debug/ws-check?orderId=${encodeURIComponent(orderId)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const body = await response.json();
      updateDebug({ serverDiagnostic: JSON.stringify(body, null, 2) });
      if (!response.ok || !body.success) {
        toast.warning("Diagnostic WebSocket terminé avec une anomalie.");
      } else {
        toast.success("Diagnostic WebSocket OK.");
      }
    } catch (error) {
      const message = (error as Error).message;
      updateDebug({ serverDiagnostic: message });
      toast.error(message);
    } finally {
      setWsCheckPending(false);
    }
  };

  return (
    <div className="overflow-hidden rounded-xl border border-primary/20 bg-[#050816] shadow-[0_0_35px_rgba(0,191,255,0.08)]">
      {consoleError && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <span>{consoleError}</span>
          <Button size="sm" variant="outline" onClick={() => setRetryKey((key) => key + 1)}>
            <RefreshCw className="h-4 w-4 mr-1" /> Retry
          </Button>
        </div>
      )}
      {SHOW_CONSOLE_DEBUG && (
        <ConsoleDebugPanel debug={debug} onRunWsCheck={runWsCheck} pending={wsCheckPending} />
      )}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-primary/15 bg-surface px-3 py-2 text-sm">
        <span className={connected ? "text-success" : "text-muted-foreground"}>
          {connected ? "Console connectée" : "Connexion console en cours ou déconnectée"}
        </span>
        <Button size="sm" variant="outline" onClick={() => setRetryKey((key) => key + 1)}>
          <RefreshCw className="mr-1 h-4 w-4" /> Reconnecter
        </Button>
      </div>
      <div ref={termRef} className="h-[420px] w-full px-3 py-2" />
      <form onSubmit={onSubmit} className="flex gap-2 border-t border-primary/15 bg-surface p-2">
        <Input
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          placeholder={connected ? "Type a command and press Enter…" : "Connecting…"}
          className="font-mono text-sm"
          disabled={!connected}
        />
        <Button type="submit" disabled={!connected || !command.trim()}>
          Send
        </Button>
      </form>
    </div>
  );
}

function ConsoleDebugPanel({
  debug,
  onRunWsCheck,
  pending,
}: {
  debug: ConsoleDebugState;
  onRunWsCheck: () => void;
  pending: boolean;
}) {
  const rows: Array<[string, string]> = [
    ["Endpoint websocket", debug.endpoint],
    ["Structure réponse", debug.responseShape],
    ["Token présent", debug.hasToken],
    ["Longueur token", debug.tokenLength],
    ["Socket original", debug.originalSocket],
    ["Socket final", debug.normalizedSocket],
    ["socketProtocol", debug.socketProtocol],
    ["socketHost", debug.socketHost],
    ["Tentative 1 socket", debug.attempt1Socket],
    ["Tentative 1 résultat", debug.attempt1Result],
    ["Tentative 2 socket", debug.attempt2Socket],
    ["Tentative 2 résultat", debug.attempt2Result],
    ["Étape atteinte", debug.reachedStage],
    ["WebSocket open", debug.websocketOpenAt],
    ["Auth sent", debug.authSentAt],
    ["Auth success", debug.authSuccessAt],
    ["Auth failed", debug.authFailedAt],
    ["Close code", debug.closeCode],
    ["Close reason", debug.closeReason],
    ["Dernier message brut", debug.lastRawMessage],
    ["Dernière erreur", debug.lastWebsocketError],
    ["Diagnostic serveur", debug.serverDiagnostic],
  ];

  return (
    <div className="border-b border-primary/20 bg-primary/5 p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs font-semibold uppercase tracking-wider text-primary">
          Console debug développement
        </div>
        <Button size="sm" variant="outline" onClick={onRunWsCheck} disabled={pending}>
          <RefreshCw className={`h-4 w-4 mr-1 ${pending ? "animate-spin" : ""}`} />
          Test WebSocket
        </Button>
      </div>
      <div className="grid gap-2 text-xs sm:grid-cols-2">
        {rows.map(([label, value]) => (
          <div key={label} className="rounded-md border border-primary/10 bg-background/40 p-2">
            <div className="text-muted-foreground">{label}</div>
            <div className="mt-1 break-all font-mono text-foreground">{value || "—"}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

type ConsoleSocketResult = "connected" | "fallback" | "failed";

type ConsoleSocketArgs = {
  socketUrl: string;
  attemptNumber: number;
  token: string;
  orderId: string;
  terminal: { write: (value: string) => void };
  setActiveSocket: (socket: WebSocket) => void;
  setConnected: (connected: boolean) => void;
  setConsoleError: (message: string | null) => void;
  updateDebug: (patch: Partial<ConsoleDebugState>) => void;
  fetchWs: (input: { data: { orderId: string } }) => Promise<{
    ok: boolean;
    token?: string;
    error?: string;
  }>;
};

function openConsoleSocket({
  socketUrl,
  attemptNumber,
  token,
  orderId,
  terminal,
  setActiveSocket,
  setConnected,
  setConsoleError,
  updateDebug,
  fetchWs,
}: ConsoleSocketArgs) {
  return new Promise<ConsoleSocketResult>((resolve) => {
    const socketMeta = getWebsocketLogMeta(socketUrl);
    const attemptResultKey = attemptNumber === 1 ? "attempt1Result" : "attempt2Result";
    let opened = false;
    let authenticated = false;
    let settled = false;
    let ws: WebSocket;
    let openTimer: number | null = window.setTimeout(() => {
      if (opened || settled) return;
      updateDebug({
        [attemptResultKey]: "timeout before open",
        reachedStage: "failed",
        lastWebsocketError: "timeout before open",
      });
      settled = true;
      try {
        ws.close();
      } catch {
        /* ignore */
      }
      resolve(attemptNumber === 1 ? "fallback" : "failed");
    }, 8_000);

    const finish = (result: ConsoleSocketResult) => {
      if (settled) return;
      settled = true;
      if (openTimer) {
        window.clearTimeout(openTimer);
        openTimer = null;
      }
      resolve(result);
    };

    updateDebug({
      [attemptResultKey]: "created",
      reachedStage: "created",
      socketProtocol: socketMeta.socketProtocol,
      socketHost: socketMeta.socketHost,
    });

    try {
      ws = new WebSocket(socketUrl);
    } catch (error) {
      updateDebug({
        [attemptResultKey]: "constructor failed",
        reachedStage: "failed",
        lastWebsocketError: stringifyWebsocketError(error),
      });
      console.error("[Pterodactyl WS] constructor failed", { ...socketMeta, error });
      finish(attemptNumber === 1 ? "fallback" : "failed");
      return;
    }

    setActiveSocket(ws);

    ws.onopen = () => {
      opened = true;
      if (openTimer) {
        window.clearTimeout(openTimer);
        openTimer = null;
      }
      const now = formatDebugTime();
      ws.send(JSON.stringify({ event: "auth", args: [token] }));
      updateDebug({
        [attemptResultKey]: "open, auth sent",
        reachedStage: "auth sent",
        websocketOpenAt: now,
        authSentAt: now,
      });
      terminal.write("\x1b[36m[WebSocket open, authenticating...]\x1b[0m\r\n");
    };

    ws.onmessage = async (ev) => {
      const raw = typeof ev.data === "string" ? ev.data : "[binary websocket message]";
      updateDebug({ lastRawMessage: truncateDebugValue(raw) });
      try {
        const msg = JSON.parse(raw);
        if (msg.event === "auth success") {
          authenticated = true;
          updateDebug({
            [attemptResultKey]: "auth success",
            reachedStage: "auth success",
            authSuccessAt: formatDebugTime(),
          });
          setConnected(true);
          setConsoleError(null);
          ws.send(JSON.stringify({ event: "send logs", args: [null] }));
          ws.send(JSON.stringify({ event: "send stats", args: [null] }));
          terminal.write("\x1b[32m[Authenticated to server console]\x1b[0m\r\n");
          finish("connected");
        } else if (msg.event === "console output" || msg.event === "install output") {
          terminal.write(String(msg.args?.[0] ?? "") + "\r\n");
        } else if (msg.event === "status") {
          terminal.write(`\x1b[33m[status: ${msg.args?.[0]}]\x1b[0m\r\n`);
        } else if (msg.event === "token expiring" || msg.event === "token expired") {
          try {
            const fresh = await fetchWs({ data: { orderId } });
            if (!fresh.ok || !fresh.token) throw new Error(fresh.error ?? "Token refresh failed.");
            ws.send(JSON.stringify({ event: "auth", args: [fresh.token] }));
            terminal.write("\x1b[36m[Console token refreshed]\x1b[0m\r\n");
          } catch (err) {
            terminal.write(`\x1b[31m[token refresh failed: ${(err as Error).message}]\x1b[0m\r\n`);
          }
        } else if (msg.event === "jwt error" || msg.event === "auth error") {
          updateDebug({
            [attemptResultKey]: "auth failed",
            reachedStage: "auth failed",
            authFailedAt: formatDebugTime(),
            lastWebsocketError: String(msg.args?.[0] ?? msg.event),
          });
          setConsoleError(WS_ERROR_MESSAGE);
          setConnected(false);
          console.error("[Pterodactyl WS] auth failed", {
            ...socketMeta,
            event: msg.event,
            args: msg.args,
          });
          terminal.write(`\x1b[31m[auth error]\x1b[0m\r\n`);
          finish("failed");
        }
      } catch {
        // Pterodactyl messages should be JSON; keep raw content in the debug panel.
      }
    };

    ws.onclose = (event) => {
      const result =
        !opened && event.code === 1006 && attemptNumber === 1
          ? "closed 1006 before open, fallback"
          : `closed ${event.code}`;
      updateDebug({
        [attemptResultKey]: result,
        reachedStage: authenticated ? "auth success" : opened ? "open" : "failed",
        closeCode: String(event.code),
        closeReason: event.reason || "none",
        lastWebsocketError: event.wasClean ? "—" : `closed: ${event.code}`,
      });
      console.warn("[Pterodactyl WS] closed", {
        ...socketMeta,
        code: event.code,
        reason: event.reason,
        wasClean: event.wasClean,
        opened,
        authenticated,
        attemptNumber,
      });
      setConnected(false);
      terminal.write(
        `\x1b[31m[disconnected code=${event.code} reason=${event.reason || "none"}]\x1b[0m\r\n`,
      );

      if (!opened && event.code === 1006 && attemptNumber === 1) {
        finish("fallback");
        return;
      }

      if (!authenticated) {
        setConsoleError(WS_ERROR_MESSAGE);
        finish("failed");
      }
    };

    ws.onerror = (event) => {
      updateDebug({
        [attemptResultKey]: "websocket error",
        lastWebsocketError: stringifyWebsocketError(event),
      });
      console.error("[Pterodactyl WS] error", { ...socketMeta, event, attemptNumber });
      setConsoleError(WS_ERROR_MESSAGE);
      setConnected(false);
      terminal.write("\x1b[31m[ws error]\x1b[0m\r\n");
    };
  });
}

function formatDebugTime() {
  return new Date().toLocaleTimeString("fr-BE", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function stringifyWebsocketError(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error instanceof Event) return error.type || "websocket event";
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

function buildWebsocketAttempts(socket: string) {
  const first = normalizeBrowserWebsocketUrl(socket, { preserveDefaultPort: true });
  const attempts = [first];
  const withoutDefaultPort = removeExplicitDefaultWebsocketPort(first);
  if (withoutDefaultPort !== first) attempts.push(withoutDefaultPort);
  return attempts;
}

function normalizeBrowserWebsocketUrl(socket: string, options?: { preserveDefaultPort?: boolean }) {
  const url = new URL(socket, window.location.href);
  if (url.protocol === "http:")
    url.protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  if (url.protocol === "https:") url.protocol = "wss:";
  if (window.location.protocol === "https:" && url.protocol === "ws:") url.protocol = "wss:";
  if (url.protocol !== "ws:" && url.protocol !== "wss:") {
    throw new Error(WS_ERROR_MESSAGE);
  }
  if (options?.preserveDefaultPort) {
    return preserveExplicitDefaultWebsocketPort(socket, url);
  }
  return url.toString();
}

function preserveExplicitDefaultWebsocketPort(original: string, url: URL) {
  const serialized = url.toString();
  if (url.protocol === "wss:" && /:443(\/|$|\?)/.test(original)) {
    return serialized.replace(`wss://${url.hostname}`, `wss://${url.hostname}:443`);
  }
  if (url.protocol === "ws:" && /:80(\/|$|\?)/.test(original)) {
    return serialized.replace(`ws://${url.hostname}`, `ws://${url.hostname}:80`);
  }
  return serialized;
}

function removeExplicitDefaultWebsocketPort(socket: string) {
  return socket
    .replace(/^wss:\/\/([^/:?#]+):443(?=\/|$|\?)/, "wss://$1")
    .replace(/^ws:\/\/([^/:?#]+):80(?=\/|$|\?)/, "ws://$1");
}

function truncateDebugValue(value: string) {
  return value.length > 500 ? `${value.slice(0, 500)}…` : value;
}

function getWebsocketLogMeta(socket: string) {
  try {
    const url = new URL(socket);
    return { socketProtocol: url.protocol, socketHost: url.host };
  } catch {
    return { socketProtocol: "invalid", socketHost: "invalid" };
  }
}

/* ---------------- Files ---------------- */

function FilesTab({ orderId }: { orderId: string }) {
  const fetchList = useServerFn(listServerFiles);
  const fetchFile = useServerFn(readServerFile);
  const saveFile = useServerFn(writeServerFile);
  const removeFiles = useServerFn(deleteServerFiles);
  const mkdir = useServerFn(createServerFolder);
  const uploadFiles = useServerFn(uploadServerFiles);
  const downloadFile = useServerFn(getServerFileDownload);
  const moveFile = useServerFn(moveServerFile);
  const qc = useQueryClient();

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [dir, setDir] = useState("/");
  const [search, setSearch] = useState("");
  const [dragActive, setDragActive] = useState(false);
  const [editing, setEditing] = useState<{
    path: string;
    original: string;
    contents: string;
  } | null>(null);
  const [preview, setPreview] = useState<{
    path: string;
    url: string;
    type: "image" | "log";
  } | null>(null);
  const [folderName, setFolderName] = useState("");
  const [moveDialog, setMoveDialog] = useState<{ from: string; to: string } | null>(null);
  const [uploadProgress, setUploadProgress] = useState<
    Array<{ name: string; progress: number; status: string }>
  >([]);

  const list = useQuery({
    queryKey: ["files", orderId, dir],
    queryFn: () => fetchList({ data: { orderId, directory: dir } }),
  });

  const parentDir = useMemo(() => parentPath(dir), [dir]);
  const breadcrumbs = useMemo(() => buildBreadcrumbs(dir), [dir]);
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const items = (list.data?.files ?? []) as FileEntry[];
    return items
      .filter((file) => !q || file.name.toLowerCase().includes(q))
      .sort((a, b) => Number(a.is_file) - Number(b.is_file) || a.name.localeCompare(b.name));
  }, [list.data?.files, search]);

  const invalidateFiles = () => qc.invalidateQueries({ queryKey: ["files", orderId, dir] });

  const openFile = async (file: FileEntry) => {
    if (fileIsManaged(file)) {
      toast.warning(MANAGED_FILE_MESSAGE);
      return;
    }
    const path = joinPath(dir, file.name);
    if (isImageFile(file.name)) {
      try {
        const res = await downloadFile({ data: { orderId, file: path } });
        setPreview({ path, url: res.url, type: "image" });
      } catch (error) {
        toast.error((error as Error).message || "Aperçu indisponible.");
      }
      return;
    }
    if (!isEditableTextFile(file.name)) {
      toast.warning("Ce fichier peut être téléchargé, mais pas édité dans XNT.");
      return;
    }
    if (file.size > MAX_EDITABLE_FILE_SIZE_BYTES || hasBlockedEditorExtension(file.name)) {
      toast.warning("Ce fichier ne peut pas être ouvert dans l’éditeur.");
      return;
    }
    try {
      const res = await fetchFile({ data: { orderId, file: path } });
      if (file.name.toLowerCase().endsWith(".log")) {
        setPreview({ path, url: res.contents, type: "log" });
        return;
      }
      setEditing({ path, original: res.contents, contents: res.contents });
    } catch (error) {
      toast.error((error as Error).message || "Impossible d’ouvrir ce fichier.");
    }
  };

  const save = useMutation({
    mutationFn: () =>
      saveFile({ data: { orderId, file: editing!.path, contents: editing!.contents } }),
    onSuccess: () => {
      toast.success("Fichier sauvegardé.");
      setEditing((current) => current && { ...current, original: current.contents });
      invalidateFiles();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const del = useMutation({
    mutationFn: (name: string) => removeFiles({ data: { orderId, root: dir, files: [name] } }),
    onSuccess: () => {
      toast.success("Élément supprimé.");
      invalidateFiles();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const createFolder = useMutation({
    mutationFn: () => mkdir({ data: { orderId, root: dir, name: folderName } }),
    onSuccess: () => {
      toast.success("Dossier créé.");
      setFolderName("");
      invalidateFiles();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const move = useMutation({
    mutationFn: () => moveFile({ data: { orderId, from: moveDialog!.from, to: moveDialog!.to } }),
    onSuccess: () => {
      toast.success("Élément déplacé.");
      setMoveDialog(null);
      invalidateFiles();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const handleDownload = async (file: FileEntry) => {
    if (!file.is_file) {
      toast.warning("Téléchargement de dossier non supporté par l’infrastructure pour le moment.");
      return;
    }
    try {
      const res = await downloadFile({ data: { orderId, file: joinPath(dir, file.name) } });
      window.open(res.url, "_blank", "noopener,noreferrer");
    } catch (error) {
      toast.error((error as Error).message || "Téléchargement indisponible.");
    }
  };

  const handleUploadFiles = async (files: FileList | File[]) => {
    const selected = Array.from(files);
    if (selected.length === 0) return;
    const progress = selected.map((file) => ({
      name: file.name,
      progress: 5,
      status: "Préparation",
    }));
    setUploadProgress(progress);
    try {
      const payload = [];
      for (const [index, file] of selected.entries()) {
        setUploadProgress((current) => updateUploadProgress(current, file.name, 25, "Lecture"));
        payload.push({
          name: file.name,
          size: file.size,
          type: file.type,
          contentBase64: await readFileAsBase64(file),
        });
        setUploadProgress((current) =>
          updateUploadProgress(
            current,
            file.name,
            55 + Math.round((index / selected.length) * 20),
            "Prêt",
          ),
        );
      }
      setUploadProgress((current) =>
        current.map((row) => ({ ...row, progress: 80, status: "Envoi" })),
      );
      await uploadFiles({ data: { orderId, directory: dir, files: payload } });
      setUploadProgress((current) =>
        current.map((row) => ({ ...row, progress: 100, status: "Terminé" })),
      );
      toast.success(
        `${selected.length} fichier${selected.length > 1 ? "s" : ""} envoyé${selected.length > 1 ? "s" : ""}.`,
      );
      invalidateFiles();
    } catch (error) {
      setUploadProgress((current) => current.map((row) => ({ ...row, status: "Erreur" })));
      toast.error((error as Error).message || "Upload impossible.");
    }
  };

  const closeEditor = () => {
    if (editing && editing.contents !== editing.original && !confirm("Fermer sans sauvegarder ?"))
      return;
    setEditing(null);
  };

  if (editing) {
    const dirty = editing.contents !== editing.original;
    return (
      <div className="xnt-card rounded-xl p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate font-mono text-sm">{editing.path}</div>
            {dirty && <div className="text-xs text-accent">Modifications non sauvegardées</div>}
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={closeEditor}>
              Annuler
            </Button>
            <Button
              size="sm"
              onClick={() => save.mutate()}
              disabled={save.isPending || !dirty}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              <Save className="mr-1.5 h-4 w-4" /> Sauvegarder
            </Button>
          </div>
        </div>
        <Textarea
          value={editing.contents}
          onChange={(event) => setEditing({ ...editing, contents: event.target.value })}
          className="h-[520px] bg-[#050816] font-mono text-sm"
          spellCheck={false}
        />
      </div>
    );
  }

  if (preview) {
    return (
      <div className="xnt-card space-y-4 rounded-xl p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="font-mono text-sm">{preview.path}</div>
          <Button size="sm" variant="outline" onClick={() => setPreview(null)}>
            <X className="mr-1.5 h-4 w-4" /> Fermer
          </Button>
        </div>
        {preview.type === "image" ? (
          <img
            src={preview.url}
            alt="Aperçu fichier"
            className="max-h-[70vh] rounded-lg border border-primary/20 object-contain"
          />
        ) : (
          <pre className="max-h-[70vh] overflow-auto rounded-lg border border-primary/20 bg-background/70 p-4 text-xs text-muted-foreground">
            {preview.url}
          </pre>
        )}
      </div>
    );
  }

  return (
    <div
      className={`xnt-card rounded-xl ${dragActive ? "ring-2 ring-primary" : ""}`}
      onDragOver={(event) => {
        event.preventDefault();
        setDragActive(true);
      }}
      onDragLeave={() => setDragActive(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragActive(false);
        void handleUploadFiles(event.dataTransfer.files);
      }}
    >
      <div className="space-y-4 border-b border-border/60 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-display text-lg font-semibold">Files</h3>
            <p className="text-sm text-muted-foreground">
              Gestionnaire de fichiers XNT pour les opérations courantes.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(event) => {
                if (event.target.files) void handleUploadFiles(event.target.files);
                event.currentTarget.value = "";
              }}
            />
            <Button size="sm" variant="outline" onClick={() => fileInputRef.current?.click()}>
              <Upload className="mr-1.5 h-4 w-4" /> Upload
            </Button>
            <Button size="sm" variant="outline" onClick={() => list.refetch()}>
              <RefreshCw className="mr-1.5 h-4 w-4" /> Actualiser
            </Button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            disabled={!parentDir}
            onClick={() => parentDir && setDir(parentDir)}
          >
            <ChevronLeft className="mr-1 h-4 w-4" /> Up
          </Button>
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1 font-mono text-xs text-muted-foreground">
            {breadcrumbs.map((crumb) => (
              <button
                key={crumb.path}
                type="button"
                className="rounded px-2 py-1 hover:bg-muted/40"
                onClick={() => setDir(crumb.path)}
              >
                {crumb.label}
              </button>
            ))}
          </div>
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Recherche"
              className="h-9 w-48 pl-8"
            />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Input
            value={folderName}
            onChange={(event) => setFolderName(event.target.value)}
            placeholder="Nouveau dossier"
            className="h-9 w-56"
          />
          <Button
            size="sm"
            variant="outline"
            onClick={() => createFolder.mutate()}
            disabled={!folderName.trim() || createFolder.isPending}
          >
            <FolderPlus className="mr-1.5 h-4 w-4" /> Nouveau dossier
          </Button>
        </div>
        {uploadProgress.length > 0 && (
          <div className="grid gap-2">
            {uploadProgress.map((item) => (
              <div
                key={item.name}
                className="rounded-lg border border-primary/15 bg-background/35 p-2"
              >
                <div className="flex justify-between gap-2 text-xs">
                  <span className="truncate font-mono">{item.name}</span>
                  <span className="text-muted-foreground">
                    {item.status} · {item.progress}%
                  </span>
                </div>
                <div className="mt-2 h-1.5 rounded-full bg-muted">
                  <div
                    className="h-1.5 rounded-full bg-primary"
                    style={{ width: `${item.progress}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="overflow-x-auto">
        <div className="min-w-[760px]">
          <div className="grid grid-cols-[1fr_120px_180px_220px] gap-3 border-b border-border/60 px-4 py-2 text-xs uppercase tracking-wider text-muted-foreground">
            <div>Nom</div>
            <div>Taille</div>
            <div>Modification</div>
            <div className="text-right">Actions</div>
          </div>
          {list.isLoading ? (
            <div className="p-6 text-sm text-muted-foreground">Chargement…</div>
          ) : list.error || list.data?.error ? (
            <div className="space-y-3 p-6">
              <div className="text-sm font-medium text-destructive">Gestionnaire indisponible</div>
              <div className="text-sm text-muted-foreground">
                {(list.error as Error | null)?.message ?? list.data?.error}
              </div>
              <Button size="sm" variant="outline" onClick={() => list.refetch()}>
                <RefreshCw className="mr-1 h-4 w-4" /> Réessayer
              </Button>
            </div>
          ) : rows.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">Dossier vide.</div>
          ) : (
            rows.map((file) => {
              const managed = fileIsManaged(file);
              const fullPath = joinPath(dir, file.name);
              return (
                <div
                  key={file.name}
                  className="grid grid-cols-[1fr_120px_180px_220px] items-center gap-3 border-b border-border/50 px-4 py-3 hover:bg-muted/25"
                >
                  <button
                    type="button"
                    className="flex min-w-0 items-center gap-2 text-left"
                    onClick={() => (file.is_file ? openFile(file) : setDir(fullPath))}
                  >
                    {file.is_file ? (
                      isImageFile(file.name) ? (
                        <ImageIcon className="h-4 w-4 shrink-0 text-accent" />
                      ) : (
                        <FileIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                      )
                    ) : (
                      <Folder className="h-4 w-4 shrink-0 text-primary" />
                    )}
                    <span className="truncate font-mono text-sm">{file.name}</span>
                    {managed ? (
                      <Badge
                        variant="outline"
                        className="border-primary/30 bg-primary/10 text-primary"
                      >
                        Géré par XNT
                      </Badge>
                    ) : null}
                  </button>
                  <div className="text-right text-xs text-muted-foreground">
                    {file.is_file ? formatSize(file.size) : "—"}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {file.modified_at ? new Date(file.modified_at).toLocaleString() : "—"}
                  </div>
                  <div className="flex justify-end gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleDownload(file)}
                      disabled={!file.is_file || managed}
                    >
                      <Download className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={managed}
                      onClick={() => setMoveDialog({ from: fullPath, to: fullPath })}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={managed}
                      onClick={() => setMoveDialog({ from: fullPath, to: fullPath })}
                    >
                      <MoveRight className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={managed}
                      onClick={() => {
                        if (confirm(`Supprimer ${file.name} ?`)) del.mutate(file.name);
                      }}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
      {dragActive && (
        <div className="p-4 text-center text-sm text-primary">
          Déposez les fichiers pour les envoyer dans {dir}
        </div>
      )}
      {moveDialog && (
        <div className="border-t border-border/60 p-4">
          <div className="mb-2 text-sm font-medium">Renommer ou déplacer</div>
          <div className="grid gap-2 md:grid-cols-[1fr_auto]">
            <Input
              value={moveDialog.to}
              onChange={(event) => setMoveDialog({ ...moveDialog, to: event.target.value })}
              className="font-mono"
            />
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setMoveDialog(null)}>
                Annuler
              </Button>
              <Button size="sm" onClick={() => move.mutate()} disabled={move.isPending}>
                Valider
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

type FileEntry = {
  name: string;
  mode: string;
  size: number;
  is_file: boolean;
  is_symlink: boolean;
  mimetype: string;
  modified_at: string;
  is_managed?: boolean;
};

function parentPath(path: string) {
  if (path === "/" || path === "") return null;
  const trimmed = path.replace(/\/+$/, "");
  const index = trimmed.lastIndexOf("/");
  return index <= 0 ? "/" : trimmed.slice(0, index);
}

function buildBreadcrumbs(path: string) {
  const parts = path.split("/").filter(Boolean);
  const crumbs = [{ label: "/", path: "/" }];
  let current = "";
  for (const part of parts) {
    current += `/${part}`;
    crumbs.push({ label: part, path: current });
  }
  return crumbs;
}

function joinPath(dir: string, name: string) {
  if (name.startsWith("/")) return name;
  if (dir.endsWith("/")) return dir + name;
  return `${dir}/${name}`;
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function hasBlockedEditorExtension(name: string) {
  const normalized = name.toLowerCase();
  return [...BLOCKED_EDITOR_EXTENSIONS].some((extension) => normalized.endsWith(extension));
}

function hasProtectedFileName(name: string) {
  const normalized = name.toLowerCase();
  return (
    PROTECTED_FILE_BASENAMES.has(normalized) ||
    /(secret|token|private[_-]?key|api[_-]?key|credentials?)/i.test(normalized)
  );
}
function fileIsManaged(file: FileEntry) {
  return Boolean(file.is_managed || hasProtectedFileName(file.name));
}

function isEditableTextFile(name: string) {
  return /\.(txt|json|ya?ml|cfg|properties|ini|log)$/i.test(name);
}

function isImageFile(name: string) {
  return /\.(png|jpe?g|webp)$/i.test(name);
}

function updateUploadProgress(
  rows: Array<{ name: string; progress: number; status: string }>,
  name: string,
  progress: number,
  status: string,
) {
  return rows.map((row) => (row.name === name ? { ...row, progress, status } : row));
}

async function readFileAsBase64(file: File) {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("Lecture du fichier impossible."));
    reader.readAsDataURL(file);
  });
  return dataUrl.includes(",") ? dataUrl.split(",")[1] : dataUrl;
}

/* ---------------- Backups ---------------- */

type ServerBackup = {
  uuid: string;
  name: string;
  bytes: number;
  isSuccessful: boolean;
  isLocked: boolean;
  createdAt: string;
  completedAt: string | null;
  state: "completed" | "processing" | "failed";
};

function BackupsTab({ orderId }: { orderId: string }) {
  const fetchBackups = useServerFn(listServerBackups);
  const createBackup = useServerFn(createServerBackup);
  const deleteBackup = useServerFn(deleteServerBackup);
  const qc = useQueryClient();

  const backups = useQuery({
    queryKey: ["backups", orderId],
    queryFn: () => fetchBackups({ data: { orderId } }),
    refetchInterval: (query) => {
      const rows = (query.state.data?.backups ?? []) as ServerBackup[];
      return rows.some((backup) => backup.state === "processing") ? 5000 : false;
    },
  });

  const create = useMutation({
    mutationFn: () => createBackup({ data: { orderId } }),
    onSuccess: () => {
      toast.success("Sauvegarde lancée.");
      qc.invalidateQueries({ queryKey: ["backups", orderId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const remove = useMutation({
    mutationFn: (backupId: string) => deleteBackup({ data: { orderId, backupId } }),
    onSuccess: () => {
      toast.success("Sauvegarde supprimée.");
      qc.invalidateQueries({ queryKey: ["backups", orderId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const rows = (backups.data?.backups ?? []) as ServerBackup[];

  return (
    <div className="xnt-card rounded-xl">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 p-4">
        <div>
          <h3 className="font-display text-lg font-semibold">Backups</h3>
          <p className="text-sm text-muted-foreground">
            Créez et supprimez les sauvegardes de ce serveur.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => backups.refetch()}>
            <RefreshCw className="mr-1.5 h-4 w-4" /> Actualiser
          </Button>
          <Button
            size="sm"
            onClick={() => create.mutate()}
            disabled={create.isPending}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <Archive className="mr-1.5 h-4 w-4" />
            {create.isPending ? "Création…" : "Créer une sauvegarde"}
          </Button>
        </div>
      </div>

      {backups.isLoading ? (
        <div className="p-6 text-sm text-muted-foreground">Chargement des sauvegardes…</div>
      ) : backups.error ? (
        <div className="space-y-3 p-6">
          <div className="text-sm font-medium text-destructive">Backups indisponibles</div>
          <div className="text-sm text-muted-foreground">{(backups.error as Error).message}</div>
          <Button size="sm" variant="outline" onClick={() => backups.refetch()}>
            <RefreshCw className="mr-1.5 h-4 w-4" /> Réessayer
          </Button>
        </div>
      ) : rows.length === 0 ? (
        <div className="p-8 text-center">
          <Archive className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
          <div className="font-display text-lg font-semibold">Aucune sauvegarde</div>
          <p className="mt-1 text-sm text-muted-foreground">
            Créez une première sauvegarde avant une mise à jour ou un changement important.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 p-4">
          {rows.map((backup) => (
            <article
              key={backup.uuid}
              className="rounded-lg border border-primary/15 bg-background/35 p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="break-words font-display text-base font-semibold">
                    {backup.name || "Backup"}
                  </div>
                  <div className="mt-1 font-mono text-xs text-muted-foreground">{backup.uuid}</div>
                </div>
                <BackupStateBadge state={backup.state} />
              </div>
              <div className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
                <BackupMeta label="Taille" value={formatSize(backup.bytes)} />
                <BackupMeta label="Créée" value={formatDateTime(backup.createdAt)} />
                <BackupMeta
                  label="Terminée"
                  value={backup.completedAt ? formatDateTime(backup.completedAt) : "En cours"}
                />
              </div>
              <div className="mt-4 flex justify-end">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={remove.isPending || backup.isLocked}
                  onClick={() => {
                    if (confirm(`Supprimer la sauvegarde ${backup.name || backup.uuid} ?`)) {
                      remove.mutate(backup.uuid);
                    }
                  }}
                >
                  <Trash2 className="mr-1.5 h-4 w-4 text-destructive" />
                  Supprimer
                </Button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

function BackupMeta({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-primary/10 bg-background/40 p-3">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 break-words font-mono text-sm text-primary">{value}</div>
    </div>
  );
}

function BackupStateBadge({ state }: { state: ServerBackup["state"] }) {
  const classes =
    state === "completed"
      ? "border-success/40 bg-success/10 text-success"
      : state === "failed"
        ? "border-destructive/40 bg-destructive/10 text-destructive"
        : "border-accent/40 bg-accent/10 text-accent";
  return (
    <span className={`rounded-full border px-2.5 py-1 text-xs uppercase tracking-wider ${classes}`}>
      {state}
    </span>
  );
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString();
}

/* ---------------- Network ---------------- */

type ServerAllocation = {
  id: number;
  address: string | null;
  port: number;
  alias: string | null;
  notes: string | null;
  isDefault: boolean;
  isPrivateSource: boolean;
};

function NetworkTab({
  orderId,
  serverName,
  identifier,
}: {
  orderId: string;
  serverName: string;
  identifier: string | null;
}) {
  const fetchNetwork = useServerFn(listServerNetworkAllocations);
  const setPrimary = useServerFn(setPrimaryServerAllocation);
  const removeAllocation = useServerFn(deleteServerAllocation);
  const qc = useQueryClient();

  const network = useQuery({
    queryKey: ["network", orderId],
    queryFn: () => fetchNetwork({ data: { orderId } }),
  });

  const makePrimary = useMutation({
    mutationFn: (allocationId: number) => setPrimary({ data: { orderId, allocationId } }),
    onSuccess: () => {
      toast.success("Port principal mis à jour.");
      qc.invalidateQueries({ queryKey: ["network", orderId] });
      qc.invalidateQueries({ queryKey: ["server-detail", orderId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const remove = useMutation({
    mutationFn: (allocationId: number) => removeAllocation({ data: { orderId, allocationId } }),
    onSuccess: () => {
      toast.success("Port réseau supprimé.");
      qc.invalidateQueries({ queryKey: ["network", orderId] });
      qc.invalidateQueries({ queryKey: ["server-detail", orderId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const allocations = (network.data?.allocations ?? []) as ServerAllocation[];

  return (
    <div className="xnt-card rounded-xl">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 p-4">
        <div>
          <h3 className="font-display text-lg font-semibold">Network</h3>
          <p className="text-sm text-muted-foreground">
            Gérez les ports réseau visibles par vos joueurs.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => network.refetch()}>
            <RefreshCw className="mr-1.5 h-4 w-4" /> Actualiser
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link
              to="/support"
              search={
                {
                  subject: `Demande de port supplémentaire - ${serverName}`,
                  orderId,
                  body: [
                    "Bonjour,",
                    "",
                    `Je souhaite demander un port supplémentaire pour le serveur ${serverName}.`,
                    `Order id : ${orderId}`,
                    `Identifiant serveur : ${orderId}`,
                  ].join("\n"),
                } as never
              }
            >
              <LifeBuoy className="mr-1.5 h-4 w-4" /> Demander un port
            </Link>
          </Button>
        </div>
      </div>

      {network.isLoading ? (
        <div className="p-6 text-sm text-muted-foreground">Chargement des ports réseau…</div>
      ) : network.error ? (
        <div className="space-y-3 p-6">
          <div className="text-sm font-medium text-destructive">Network indisponible</div>
          <div className="text-sm text-muted-foreground">{(network.error as Error).message}</div>
          <Button size="sm" variant="outline" onClick={() => network.refetch()}>
            <RefreshCw className="mr-1.5 h-4 w-4" /> Réessayer
          </Button>
        </div>
      ) : allocations.length === 0 ? (
        <div className="p-8 text-center">
          <Network className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
          <div className="font-display text-lg font-semibold">Aucun port réseau</div>
          <p className="mt-1 text-sm text-muted-foreground">
            Aucun port réseau n’est disponible pour ce serveur.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 p-4">
          {allocations.map((allocation) => (
            <article
              key={allocation.id}
              className="rounded-lg border border-primary/15 bg-background/35 p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="font-display text-base font-semibold">
                      {allocation.address
                        ? `${allocation.address}:${allocation.port}`
                        : `Adresse publique indisponible:${allocation.port}`}
                    </div>
                    {allocation.isDefault && (
                      <span className="rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-xs uppercase tracking-wider text-primary">
                        principale
                      </span>
                    )}
                  </div>
                  {allocation.isPrivateSource && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      IP interne masquée, affichage public via l’adresse serveur.
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {!allocation.isDefault && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={makePrimary.isPending}
                      onClick={() => makePrimary.mutate(allocation.id)}
                    >
                      Définir comme principale
                    </Button>
                  )}
                  {!allocation.isDefault && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={remove.isPending}
                      onClick={() => {
                        if (confirm(`Supprimer le port ${allocation.port} ?`)) {
                          remove.mutate(allocation.id);
                        }
                      }}
                    >
                      <Trash2 className="mr-1.5 h-4 w-4 text-destructive" />
                      Supprimer
                    </Button>
                  )}
                </div>
              </div>
              <div className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
                <BackupMeta label="Adresse publique" value={allocation.address ?? "Indisponible"} />
                <BackupMeta label="Port" value={String(allocation.port)} />
                <BackupMeta label="Alias" value={allocation.alias ?? "Aucun alias"} />
              </div>
              {allocation.notes && (
                <div className="mt-3 rounded-md border border-primary/10 bg-background/40 p-3 text-sm text-muted-foreground">
                  {allocation.notes}
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------------- Info ---------------- */

type ConnectionInfo = {
  address: string | null;
  port: number | null;
  sftpHost: string | null;
  sftpPort: number | null;
  sftpUsername: string | null;
  identifier: string | null;
  unavailableReason: string | null;
};

function InfoTab({
  connection,
  order,
}: {
  connection: ConnectionInfo;
  order: { id: string; serverName: string; status: string };
}) {
  const copyValue = async (label: string, value: string | number | null) => {
    if (value == null || value === "") {
      toast.warning(`${label} indisponible.`);
      return;
    }
    await navigator.clipboard.writeText(String(value));
    toast.success(`${label} copié.`);
  };

  const copyAll = async () => {
    const lines = buildConnectionCopyLines(connection, order.id);
    if (lines.length === 0) {
      toast.warning("Informations de connexion indisponibles.");
      return;
    }
    await navigator.clipboard.writeText(`Serveur XNTServers\n${lines.join("\n")}`);
    toast.success("Infos de connexion copiées.");
  };

  return (
    <div className="xnt-card space-y-4 rounded-xl p-6">
      <div>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-display text-lg font-semibold">Connexion serveur</h3>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={copyAll}>
              <Copy className="mr-1.5 h-4 w-4" /> Copier toutes les infos
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link
                to="/support"
                search={
                  {
                    subject: `Support serveur ${order.serverName}`,
                    orderId: order.id,
                    body: [
                      `Bonjour,`,
                      ``,
                      `J'ai besoin d'aide pour le serveur ${order.serverName}.`,
                      `Order id : ${order.id}`,
                      `Identifiant serveur : ${order.id}`,
                      `Etat actuel : ${order.status}`,
                    ].join("\n"),
                  } as never
                }
              >
                <LifeBuoy className="mr-1.5 h-4 w-4" /> Contacter le support
              </Link>
            </Button>
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <InfoLine
            label="Adresse publique"
            value={connection.address ?? "Adresse publique indisponible"}
            onCopy={() => copyValue("Adresse publique", connection.address)}
          />
          <InfoLine
            label="Port serveur"
            value={connection.port ?? "Port indisponible"}
            onCopy={() => copyValue("Port serveur", connection.port)}
          />
          <InfoLine
            label="Hôte SFTP public"
            value={connection.sftpHost ?? "SFTP indisponible"}
            onCopy={() => copyValue("Hôte SFTP", connection.sftpHost)}
          />
          <InfoLine
            label="Port SFTP"
            value={connection.sftpPort ?? "Port SFTP indisponible"}
            onCopy={() => copyValue("Port SFTP", connection.sftpPort)}
          />
          <InfoLine
            label="Utilisateur SFTP"
            value={connection.sftpUsername ?? "Utilisateur SFTP indisponible"}
            onCopy={() => copyValue("Utilisateur SFTP", connection.sftpUsername)}
          />
          <InfoLine
            label="Identifiant serveur"
            value={order.id}
            onCopy={() => copyValue("Identifiant serveur", order.id)}
          />
        </div>
        {connection.unavailableReason && (
          <div className="mt-4 rounded-lg border border-accent/30 bg-accent/10 p-3 text-sm text-accent">
            {connection.unavailableReason}
          </div>
        )}
      </div>
    </div>
  );
}

function InfoLine({
  label,
  value,
  onCopy,
}: {
  label: string;
  value: string | number;
  onCopy?: () => void;
}) {
  return (
    <div className="rounded-lg border border-primary/15 bg-background/35 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
        {onCopy && (
          <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={onCopy}>
            <Copy className="h-4 w-4" />
          </Button>
        )}
      </div>
      <div className="mt-1 break-all font-mono text-sm text-primary">{value}</div>
    </div>
  );
}

function buildConnectionCopyLines(connection: ConnectionInfo, xntServerId: string) {
  const lines: string[] = [];
  if (connection.address && connection.port) {
    lines.push(`Adresse : ${connection.address}:${connection.port}`);
  }
  if (connection.sftpHost && connection.sftpPort) {
    lines.push(`SFTP : ${connection.sftpHost}:${connection.sftpPort}`);
  }
  if (connection.sftpUsername) lines.push(`Utilisateur SFTP : ${connection.sftpUsername}`);
  lines.push(`Identifiant serveur : ${xntServerId}`);
  return lines;
}

/* ---------------- Server Settings ---------------- */

function ServerSettingsTab({
  orderId,
  settings,
  serverSettings,
  changeLog,
  syncState,
  initialSyncState,
  serverName,
  planName,
  game,
  gameKey,
  title,
}: {
  orderId: string;
  settings: {
    server_type?: string | null;
    minecraft_version?: string | null;
    version_apply_status?: string | null;
    version_variable?: string | null;
    max_players?: number | null;
    max_players_applied?: boolean;
  } | null;
  serverSettings: Record<string, unknown>;
  changeLog: SettingsChangeLogEntry[];
  syncState: SettingsSyncState | null;
  initialSyncState: InitialMinecraftSyncState | null;
  serverName: string;
  planName: string | null;
  game: string | null;
  gameKey: ReturnType<typeof normalizeGameKey>;
  title: string;
}) {
  const applySettingsFn = useServerFn(applyServerSettings);
  const syncGameSettingsFn = useServerFn(syncGameSettings);
  const qc = useQueryClient();
  const maxPlayers = settings?.max_players ?? null;
  const isMinecraft = isMinecraftGame(game);
  const [form, setForm] = useState<Record<string, unknown>>(() =>
    buildServerSettingsForm(gameKey, serverSettings, serverName),
  );

  useEffect(() => {
    setForm(buildServerSettingsForm(gameKey, serverSettings, serverName));
  }, [gameKey, serverName, serverSettings]);

  const applySettingsMutation = useMutation({
    mutationFn: () => applySettingsFn({ data: { orderId, settings: form } }),
    onSuccess: (result) => {
      if (result.minecraftSync?.status === "success") {
        toast.success(
          result.minecraftSync.restartRecommended
            ? "Paramètres sauvegardés et synchronisés. Redémarrage recommandé."
            : "Paramètres sauvegardés et synchronisés.",
        );
      } else if (result.minecraftSync?.status === "failed") {
        toast.warning(
          `Paramètres sauvegardés, synchronisation à vérifier: ${result.minecraftSync.error}`,
        );
      } else {
        toast.success(
          result.infrastructureRenamed
            ? "Paramètres sauvegardés et nom synchronisé."
            : "Paramètres sauvegardés dans XNT.",
        );
      }
      qc.invalidateQueries({ queryKey: ["server-detail", orderId] });
      qc.invalidateQueries({ queryKey: ["my-servers"] });
      qc.invalidateQueries({ queryKey: ["my-billing"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const setValue = (key: string, value: unknown) =>
    setForm((current) => ({ ...current, [key]: value }));

  const syncMutation = useMutation({
    mutationFn: () => syncGameSettingsFn({ data: { orderId } }),
    onSuccess: (result) => {
      if (result.status === "pending_template_support") {
        toast.warning(result.message ?? "Synchronisation en attente d’un template compatible.");
      } else {
        toast.success(
          result.restartRecommended
            ? "Synchronisation réussie. Redémarrage recommandé."
            : "Synchronisation réussie.",
        );
      }
      qc.invalidateQueries({ queryKey: ["server-detail", orderId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div className="xnt-card space-y-5 rounded-xl p-6">
      <div>
        <h3 className="font-display text-lg font-semibold">{title}</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Les fichiers critiques sont gérés par XNTServers. Les réglages modifiables seront
          progressivement exposés ici selon le jeu.
        </p>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <InfoLine label="Jeu" value={game ?? "Jeu indisponible"} />
        <InfoLine label="Plan" value={planName ?? "Plan indisponible"} />
        {isMinecraft ? (
          <>
            <div className="md:col-span-2">
              <div className="mb-2 text-xs uppercase tracking-wider text-primary">Général</div>
              <div className="grid gap-3 md:grid-cols-2">
                <SettingTextField
                  label="Nom du serveur"
                  value={stringValue(form.serverName)}
                  onChange={(value) => setValue("serverName", value)}
                  maxLength={40}
                />
                <SettingTextField
                  label="MOTD"
                  value={stringValue(form.motd)}
                  onChange={(value) => setValue("motd", value)}
                  maxLength={120}
                />
                <InfoLine label="Type" value={settings?.server_type ?? "Géré automatiquement"} />
                <InfoLine
                  label="Version"
                  value={
                    settings?.minecraft_version && settings.minecraft_version !== "auto"
                      ? settings.minecraft_version
                      : "Gérée automatiquement par le template"
                  }
                />
                <InfoLine
                  label="Application version"
                  value={formatVersionApplyStatus(settings?.version_apply_status)}
                />
              </div>
            </div>
            <div className="md:col-span-2">
              <div className="mb-2 text-xs uppercase tracking-wider text-primary">Joueurs</div>
              <InfoLine
                label="Slots achetés"
                value={
                  maxPlayers
                    ? `${maxPlayers} joueur${maxPlayers > 1 ? "s" : ""}`
                    : "Géré automatiquement"
                }
              />
              <p className="mt-2 text-sm text-muted-foreground">
                Pour augmenter le nombre de joueurs, veuillez effectuer un upgrade de votre offre.
              </p>
            </div>
            <div className="md:col-span-2">
              <div className="mb-2 text-xs uppercase tracking-wider text-primary">Gameplay</div>
              <div className="grid gap-3 md:grid-cols-3">
                <SettingSelectField
                  label="Difficulty"
                  value={stringValue(form.difficulty) || "normal"}
                  options={["peaceful", "easy", "normal", "hard"]}
                  onChange={(value) => setValue("difficulty", value)}
                />
                <SettingSelectField
                  label="Gamemode"
                  value={stringValue(form.gamemode) || "survival"}
                  options={["survival", "creative", "adventure", "spectator"]}
                  onChange={(value) => setValue("gamemode", value)}
                />
                <SettingBooleanField
                  label="Hardcore"
                  checked={Boolean(form.hardcore)}
                  onChange={(value) => setValue("hardcore", value)}
                />
              </div>
            </div>
            <div className="md:col-span-2">
              <div className="mb-2 text-xs uppercase tracking-wider text-primary">Réseau</div>
              <div className="grid gap-3 md:grid-cols-4">
                <SettingBooleanField
                  label="PVP"
                  checked={Boolean(form.pvp)}
                  onChange={(value) => setValue("pvp", value)}
                />
                <SettingBooleanField
                  label="Whitelist"
                  checked={Boolean(form.whitelist)}
                  onChange={(value) => setValue("whitelist", value)}
                />
                <SettingBooleanField
                  label="Online Mode"
                  checked={Boolean(form.onlineMode)}
                  onChange={(value) => setValue("onlineMode", value)}
                />
                <SettingBooleanField
                  label="Allow Flight"
                  checked={Boolean(form.allowFlight)}
                  onChange={(value) => setValue("allowFlight", value)}
                />
              </div>
            </div>
            <div className="md:col-span-2">
              <div className="mb-2 text-xs uppercase tracking-wider text-primary">Monde</div>
              <div className="grid gap-3 md:grid-cols-4">
                <SettingNumberField
                  label="Spawn Protection"
                  value={numberValue(form.spawnProtection, 16)}
                  min={0}
                  max={64}
                  onChange={(value) => setValue("spawnProtection", value)}
                />
                <SettingNumberField
                  label="View Distance"
                  value={numberValue(form.viewDistance, 10)}
                  min={2}
                  max={32}
                  onChange={(value) => setValue("viewDistance", value)}
                />
                <SettingNumberField
                  label="Simulation Distance"
                  value={numberValue(form.simulationDistance, 10)}
                  min={2}
                  max={32}
                  onChange={(value) => setValue("simulationDistance", value)}
                />
                <SettingTextField
                  label="Seed"
                  value={stringValue(form.seed)}
                  onChange={(value) => setValue("seed", value)}
                  maxLength={64}
                />
              </div>
            </div>
            <div className="rounded-lg border border-primary/15 bg-background/35 p-3">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">
                Synchronisation initiale
              </div>
              <Badge
                variant="outline"
                className={
                  initialSyncState?.status === "success"
                    ? "mt-2 border-success/40 bg-success/10 text-success"
                    : initialSyncState?.status === "failed"
                      ? "mt-2 border-destructive/40 bg-destructive/10 text-destructive"
                      : "mt-2 border-accent/40 bg-accent/10 text-accent"
                }
              >
                {formatInitialSyncStatus(initialSyncState?.status)}
              </Badge>
              <div className="mt-2 text-xs text-muted-foreground">
                Dernière tentative :{" "}
                {(initialSyncState?.last_attempt_at ?? initialSyncState?.synced_at)
                  ? new Date(
                      initialSyncState.last_attempt_at ?? initialSyncState.synced_at ?? "",
                    ).toLocaleString()
                  : "Jamais"}
              </div>
              {initialSyncState?.status === "pending" && (
                <div className="mt-2 rounded-md border border-accent/25 bg-accent/10 p-2 text-xs text-accent">
                  Le serveur est en cours d'installation. Les paramètres Minecraft seront appliqués
                  automatiquement dès que les fichiers seront disponibles.
                  <div className="mt-1 text-muted-foreground">
                    Tentative {initialSyncState.retry_count ?? 0}/5
                    {initialSyncState.next_retry_at
                      ? ` · Prochain essai ${new Date(initialSyncState.next_retry_at).toLocaleString()}`
                      : ""}
                  </div>
                </div>
              )}
              {(initialSyncState?.last_error ?? initialSyncState?.error) && (
                <div className="mt-2 text-xs text-destructive">
                  {initialSyncState.last_error ?? initialSyncState.error}
                </div>
              )}
              {initialSyncState?.status && initialSyncState.status !== "success" && (
                <div className="mt-2 text-xs text-accent">
                  Les paramètres initiaux seront réessayés automatiquement ou peuvent être
                  resynchronisés depuis cette page.
                </div>
              )}
            </div>
            <div className="rounded-lg border border-primary/15 bg-background/35 p-3">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">
                Synchronisation serveur
              </div>
              <Badge
                variant="outline"
                className={
                  syncState?.last_sync_status === "success"
                    ? "mt-2 border-success/40 bg-success/10 text-success"
                    : syncState?.last_sync_status === "failed"
                      ? "mt-2 border-destructive/40 bg-destructive/10 text-destructive"
                      : "mt-2 border-accent/40 bg-accent/10 text-accent"
                }
              >
                {syncState?.last_sync_status === "success"
                  ? "Synchronisation réussie"
                  : syncState?.last_sync_status === "failed"
                    ? "Erreur de synchronisation"
                    : "Pas encore synchronisé"}
              </Badge>
              <div className="mt-2 text-xs text-muted-foreground">
                Dernière synchronisation :{" "}
                {syncState?.last_sync_at
                  ? new Date(syncState.last_sync_at).toLocaleString()
                  : "Jamais"}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                Mode : {formatSettingsSyncMode(syncState?.mode)}
                {syncState?.target_file ? ` · ${syncState.target_file}` : ""}
              </div>
              {syncState?.restart_recommended && (
                <div className="mt-2 text-xs text-accent">Redémarrage recommandé.</div>
              )}
              {syncState?.last_sync_error && (
                <div className="mt-2 text-xs text-destructive">{syncState.last_sync_error}</div>
              )}
              <Button
                size="sm"
                variant="outline"
                className="mt-3"
                disabled={syncMutation.isPending}
                onClick={() => syncMutation.mutate()}
              >
                <RefreshCw className="mr-1.5 h-4 w-4" />
                {syncMutation.isPending ? "Synchronisation…" : "Synchroniser maintenant"}
              </Button>
            </div>
            <div className="rounded-lg border border-primary/15 bg-background/35 p-3">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">
                Protection slots
              </div>
              <Badge
                variant="outline"
                className="mt-2 border-primary/40 bg-primary/10 text-primary"
              >
                Verrouillé après achat
              </Badge>
              <p className="mt-2 text-xs text-muted-foreground">
                Les slots ne sont jamais synchronisés depuis l’interface Manage.
              </p>
            </div>
          </>
        ) : (
          <>
            <GenericGameSettings
              gameKey={gameKey}
              form={form}
              setValue={setValue}
              serverName={serverName}
              purchasedSlots={syncState?.purchased_slots ?? null}
            />
            <div className="rounded-lg border border-primary/15 bg-background/35 p-3 md:col-span-2">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">
                Synchronisation serveur
              </div>
              <Badge
                variant="outline"
                className={
                  syncState?.last_sync_status === "success"
                    ? "mt-2 border-success/40 bg-success/10 text-success"
                    : syncState?.last_sync_status === "failed"
                      ? "mt-2 border-destructive/40 bg-destructive/10 text-destructive"
                      : "mt-2 border-accent/40 bg-accent/10 text-accent"
                }
              >
                {formatSettingsSyncStatus(syncState?.last_sync_status)}
              </Badge>
              <div className="mt-2 text-xs text-muted-foreground">
                Dernière synchronisation :{" "}
                {syncState?.last_sync_at
                  ? new Date(syncState.last_sync_at).toLocaleString()
                  : "Jamais"}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                Mode : {formatSettingsSyncMode(syncState?.mode)}
                {syncState?.target_file ? ` · ${syncState.target_file}` : ""}
              </div>
              {syncState?.last_sync_error && (
                <div className="mt-2 text-xs text-accent">{syncState.last_sync_error}</div>
              )}
              <Button
                size="sm"
                variant="outline"
                className="mt-3"
                disabled={syncMutation.isPending}
                onClick={() => syncMutation.mutate()}
              >
                <RefreshCw className="mr-1.5 h-4 w-4" />
                {syncMutation.isPending ? "Synchronisation…" : "Synchroniser maintenant"}
              </Button>
            </div>
          </>
        )}
      </div>
      <div className="flex justify-end">
        <Button
          onClick={() => applySettingsMutation.mutate()}
          disabled={applySettingsMutation.isPending}
          className="bg-primary text-primary-foreground hover:bg-primary/90"
        >
          {applySettingsMutation.isPending ? "Sauvegarde…" : "Sauvegarder les paramètres"}
        </Button>
      </div>
      <SettingsChangeLog entries={changeLog} />
      <div className="rounded-lg border border-accent/30 bg-accent/10 p-4 text-sm text-accent">
        {isMinecraft
          ? "Les fichiers comme server.properties restent verrouillés. Les changements sont validés par XNT et préparés pour synchronisation contrôlée."
          : "Les paramètres avancés de ce jeu seront ajoutés progressivement. Les fichiers critiques restent verrouillés côté serveur."}
      </div>
    </div>
  );
}

function GenericGameSettings({
  gameKey,
  form,
  setValue,
  serverName,
  purchasedSlots,
}: {
  gameKey: ReturnType<typeof normalizeGameKey>;
  form: Record<string, unknown>;
  setValue: (key: string, value: unknown) => void;
  serverName: string;
  purchasedSlots: number | null;
}) {
  const slotsLabel = purchasedSlots
    ? `${purchasedSlots} joueur${purchasedSlots > 1 ? "s" : ""}`
    : "Géré par votre offre";
  if (gameKey === "conan") {
    return (
      <>
        <SettingTextField
          label="Nom serveur"
          value={stringValue(form.serverName) || serverName}
          onChange={(value) => setValue("serverName", value)}
          maxLength={40}
        />
        <SettingTextField
          label="Motd"
          value={stringValue(form.motd)}
          onChange={(value) => setValue("motd", value)}
          maxLength={120}
        />
        <SettingTextField
          label="Password"
          value={stringValue(form.password)}
          onChange={(value) => setValue("password", value)}
          maxLength={80}
          type="password"
        />
        <InfoLine label="Slots achetés" value={slotsLabel} />
      </>
    );
  }
  if (gameKey === "ark") {
    return (
      <>
        <SettingTextField
          label="Nom serveur"
          value={stringValue(form.serverName) || serverName}
          onChange={(value) => setValue("serverName", value)}
          maxLength={40}
        />
        <SettingTextField
          label="Motd"
          value={stringValue(form.motd)}
          onChange={(value) => setValue("motd", value)}
          maxLength={120}
        />
        <SettingTextField
          label="Password"
          value={stringValue(form.password)}
          onChange={(value) => setValue("password", value)}
          maxLength={80}
          type="password"
        />
        <SettingNumberField
          label="XP Rate"
          value={numberValue(form.xpRate, 1)}
          min={0.1}
          max={10}
          step={0.1}
          onChange={(value) => setValue("xpRate", value)}
        />
        <SettingNumberField
          label="Harvest Rate"
          value={numberValue(form.harvestRate, 1)}
          min={0.1}
          max={10}
          step={0.1}
          onChange={(value) => setValue("harvestRate", value)}
        />
        <SettingNumberField
          label="Taming Rate"
          value={numberValue(form.tamingRate, 1)}
          min={0.1}
          max={10}
          step={0.1}
          onChange={(value) => setValue("tamingRate", value)}
        />
        <InfoLine label="Slots achetés" value={slotsLabel} />
      </>
    );
  }
  if (gameKey === "gmod") {
    return (
      <>
        <SettingTextField
          label="Hostname"
          value={stringValue(form.hostname) || serverName}
          onChange={(value) => setValue("hostname", value)}
          maxLength={40}
        />
        <SettingTextField
          label="Gamemode"
          value={stringValue(form.gamemode)}
          onChange={(value) => setValue("gamemode", value)}
          maxLength={40}
        />
        <SettingTextField
          label="Collection ID"
          value={stringValue(form.collectionId)}
          onChange={(value) => setValue("collectionId", value)}
          maxLength={32}
        />
        <InfoLine label="Slots achetés" value={slotsLabel} />
      </>
    );
  }
  return (
    <div className="rounded-lg border border-primary/15 bg-background/35 p-3 md:col-span-2">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">
        Paramètres avancés
      </div>
      <div className="mt-1 text-sm text-primary">
        Les paramètres avancés pour ce jeu seront bientôt disponibles.
      </div>
    </div>
  );
}

function SettingTextField({
  label,
  value,
  onChange,
  maxLength,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  maxLength: number;
  type?: string;
}) {
  return (
    <label className="space-y-1">
      <span className="text-xs uppercase tracking-wider text-muted-foreground">{label}</span>
      <Input
        type={type}
        value={value}
        maxLength={maxLength}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function SettingNumberField({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="space-y-1">
      <span className="text-xs uppercase tracking-wider text-muted-foreground">{label}</span>
      <Input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

function SettingSelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="space-y-1">
      <span className="text-xs uppercase tracking-wider text-muted-foreground">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function SettingBooleanField({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-lg border border-primary/15 bg-background/35 p-3">
      <span className="text-sm">{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-5 w-5 accent-[color:var(--primary)]"
      />
    </label>
  );
}

function SettingsChangeLog({ entries }: { entries: SettingsChangeLogEntry[] }) {
  if (entries.length === 0) return null;
  return (
    <div className="rounded-lg border border-primary/15 bg-background/30 p-4">
      <div className="mb-3 text-xs uppercase tracking-wider text-primary">Historique</div>
      <div className="space-y-2">
        {entries
          .slice()
          .reverse()
          .map((entry, index) => (
            <div
              key={`${entry.at}-${entry.key}-${index}`}
              className="text-xs text-muted-foreground"
            >
              {new Date(entry.at).toLocaleString()} · {entry.key} : {String(entry.old_value ?? "—")}{" "}
              → {String(entry.new_value ?? "—")}
            </div>
          ))}
      </div>
    </div>
  );
}

function buildServerSettingsForm(
  gameKey: ReturnType<typeof normalizeGameKey>,
  settings: Record<string, unknown>,
  serverName: string,
) {
  const base = { ...settings };
  if (gameKey === "minecraft") {
    return {
      serverName,
      motd: "",
      difficulty: "normal",
      gamemode: "survival",
      hardcore: false,
      pvp: true,
      whitelist: false,
      onlineMode: true,
      allowFlight: false,
      spawnProtection: 16,
      viewDistance: 10,
      simulationDistance: 10,
      seed: "",
      ...base,
    };
  }
  if (gameKey === "conan") return { serverName, motd: "", password: "", ...base };
  if (gameKey === "ark") {
    return {
      serverName,
      motd: "",
      password: "",
      xpRate: 1,
      harvestRate: 1,
      tamingRate: 1,
      ...base,
    };
  }
  if (gameKey === "gmod") return { hostname: serverName, gamemode: "", collectionId: "", ...base };
  return base;
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function numberValue(value: unknown, fallback: number) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function getServerSettingsLabel(gameKey: ReturnType<typeof normalizeGameKey>) {
  if (gameKey === "minecraft") return "Paramètres Minecraft";
  if (gameKey === "conan") return "Paramètres Conan Exiles";
  if (gameKey === "ark") return "Paramètres ARK";
  if (gameKey === "gmod") return "Paramètres Garry's Mod";
  return "Paramètres serveur";
}

function formatVersionApplyStatus(status?: string | null) {
  if (status === "applied") return "Appliquée";
  if (status === "pending_template_support") return "En attente template compatible";
  if (status === "managed") return "Gérée automatiquement";
  return "Gérée automatiquement";
}

function formatInitialSyncStatus(status?: string | null) {
  if (status === "success") return "Synchronisation initiale réussie";
  if (status === "pending") return "En attente";
  if (status === "pending_template_support") return "En attente template compatible";
  if (status === "failed") return "Échec";
  return "Non lancée";
}

function formatSettingsSyncStatus(status?: string | null) {
  if (status === "success") return "Synchronisation réussie";
  if (status === "pending_template_support") return "En attente template compatible";
  if (status === "pending") return "En attente";
  if (status === "failed") return "Erreur de synchronisation";
  return "Pas encore synchronisé";
}

function formatSettingsSyncMode(mode?: string | null) {
  if (mode === "file_patch") return "Synchronisation fichier";
  if (mode === "command_template") return "Commande contrôlée";
  if (mode === "metadata_only") return "Stockage XNT uniquement";
  return "Stockage XNT uniquement";
}

/* ---------------- Settings ---------------- */

function SettingsTab({
  orderId,
  serverName,
  identifier,
}: {
  orderId: string;
  serverName: string;
  identifier: string | null;
}) {
  const renameFn = useServerFn(renameServer);
  const reinstallFn = useServerFn(reinstallServerClient);
  const qc = useQueryClient();
  const [name, setName] = useState(serverName);
  const [confirmText, setConfirmText] = useState("");

  useEffect(() => setName(serverName), [serverName]);

  const rename = useMutation({
    mutationFn: () => renameFn({ data: { orderId, name: name.trim() } }),
    onSuccess: (result) => {
      toast.success(
        result.infrastructureRenamed
          ? "Serveur renommé."
          : "Nom XNT mis à jour. Le service serveur garde peut-être son nom interne.",
      );
      qc.invalidateQueries({ queryKey: ["server-detail", orderId] });
      qc.invalidateQueries({ queryKey: ["my-servers"] });
      qc.invalidateQueries({ queryKey: ["my-billing"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const reinstall = useMutation({
    mutationFn: () => reinstallFn({ data: { orderId } }),
    onSuccess: () => {
      toast.success("Réinstallation lancée.");
      setConfirmText("");
      qc.invalidateQueries({ queryKey: ["server-detail", orderId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const canReinstall = confirmText === "REINSTALL";

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="xnt-card rounded-xl p-5">
        <h3 className="font-display text-lg font-semibold">Renommer le serveur</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Le renommage utilise le service serveur XNT si cette action est autorisée.
        </p>
        <div className="mt-4 space-y-3">
          <Input value={name} onChange={(event) => setName(event.target.value)} maxLength={40} />
          <Button
            onClick={() => rename.mutate()}
            disabled={rename.isPending || name.trim().length < 2 || name.trim() === serverName}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {rename.isPending ? "Renommage…" : "Renommer"}
          </Button>
        </div>
      </section>

      <section className="xnt-card rounded-xl border-destructive/30 p-5">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-1 h-5 w-5 text-destructive" />
          <div>
            <h3 className="font-display text-lg font-semibold">Réinstaller le serveur</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Action destructive : selon le template serveur, les fichiers peuvent être
              réinitialisés et le script d’installation relancé.
            </p>
          </div>
        </div>
        <div className="mt-4 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          Pour confirmer, tapez <span className="font-mono font-semibold">REINSTALL</span>.
        </div>
        <div className="mt-4 space-y-3">
          <Input
            value={confirmText}
            onChange={(event) => setConfirmText(event.target.value)}
            placeholder="REINSTALL"
            className="font-mono"
          />
          <Button
            variant="destructive"
            disabled={!canReinstall || reinstall.isPending}
            onClick={() => {
              if (
                confirm(
                  `Réinstaller ${serverName} ? Cette action peut réinitialiser les fichiers selon le template serveur.`,
                )
              ) {
                reinstall.mutate();
              }
            }}
          >
            {reinstall.isPending ? "Réinstallation…" : "Réinstaller le serveur"}
          </Button>
        </div>
      </section>

      <section className="xnt-card rounded-xl p-5 lg:col-span-2">
        <h3 className="font-display text-lg font-semibold">Version / Template serveur</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Le projet supporte déjà plusieurs templates de serveur, mais changer le template d’un
          serveur existant touche l’image runtime, la commande de lancement et les paramètres. Pour
          éviter de casser la préparation actuelle, cette action sera ajoutée après validation d’un
          parcours de migration dédié.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-lg border border-primary/15 bg-background/35 p-4">
          <Badge variant="outline" className="border-accent/40 bg-accent/10 text-accent">
            Bientôt disponible
          </Badge>
          <span className="text-sm text-muted-foreground">
            Changement de template prévu dans une prochaine version.
          </span>
        </div>
      </section>
    </div>
  );
}

/* ---------------- Advanced Settings ---------------- */

function StartupTab({ orderId }: { orderId: string }) {
  const fetchStartup = useServerFn(getServerStartup);
  const saveStartup = useServerFn(updateServerStartup);
  const qc = useQueryClient();

  const startup = useQuery({
    queryKey: ["startup", orderId],
    queryFn: () => fetchStartup({ data: { orderId } }),
  });

  const [env, setEnv] = useState<Record<string, string>>({});
  const [reinstall, setReinstall] = useState(false);

  const editableVariableNames = useMemo(
    () =>
      new Set(
        (startup.data?.variables ?? [])
          .filter((variable) => variable.user_editable)
          .map((variable) => variable.env_variable),
      ),
    [startup.data?.variables],
  );

  useEffect(() => {
    if (startup.data) setEnv({ ...startup.data.environment });
  }, [startup.data]);

  const save = useMutation({
    mutationFn: () => {
      const ignored = Object.keys(env).filter((key) => !editableVariableNames.has(key));
      const editableEnv = Object.fromEntries(
        Object.entries(env).filter(([key]) => editableVariableNames.has(key)),
      );
      return saveStartup({ data: { orderId, environment: editableEnv, reinstall } }).then(() => ({
        ignoredCount: ignored.length,
      }));
    },
    onSuccess: ({ ignoredCount }) => {
      toast.success(reinstall ? "Saved — reinstalling…" : "Variables saved");
      if (ignoredCount) {
        toast.warning(`${ignoredCount} variable(s) non éditable(s) ignorée(s).`);
      }
      setReinstall(false);
      qc.invalidateQueries({ queryKey: ["startup", orderId] });
      qc.invalidateQueries({ queryKey: ["server-detail", orderId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (startup.isLoading)
    return (
      <div className="xnt-card rounded-xl p-6 text-sm text-muted-foreground">
        Chargement des variables serveur…
      </div>
    );
  if (startup.error)
    return (
      <div className="xnt-card rounded-xl border-destructive/30 p-6 text-sm text-destructive">
        {(startup.error as Error).message}
      </div>
    );
  if (!startup.data) return null;

  const editableCount = startup.data.variables.filter((variable) => variable.user_editable).length;

  return (
    <div className="xnt-card space-y-6 rounded-xl p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-display text-lg font-semibold">Paramètres avancés</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Modifiez uniquement les paramètres autorisés pour ce template serveur.
          </p>
        </div>
        <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary">
          {editableCount} modifiable(s)
        </Badge>
      </div>

      <EggVariablesForm variables={startup.data.variables} values={env} onChange={setEnv} />

      {reinstall && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          La sauvegarde avec réinstallation peut réinitialiser les fichiers selon le template
          serveur. Créez une sauvegarde avant de continuer.
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-4">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={reinstall}
            onChange={(e) => setReinstall(e.target.checked)}
            className="accent-[color:var(--primary)]"
          />
          Reinstall after save
          <span className="text-xs text-muted-foreground">
            (wipes &amp; re-downloads files — use when changing version or modpack)
          </span>
        </label>
        <Button
          onClick={() => {
            if (
              reinstall &&
              !confirm(
                "Reinstalling will wipe server files and re-run the install script. Continue?",
              )
            )
              return;
            save.mutate();
          }}
          disabled={save.isPending}
          className="bg-primary text-primary-foreground hover:bg-primary/90"
        >
          {save.isPending ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </div>
  );
}
