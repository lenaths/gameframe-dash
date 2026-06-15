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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { SiteHeader } from "@/components/site-header";
import { toast } from "sonner";
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
  getServerStartup,
  updateServerStartup,
} from "@/lib/servers.functions";
import { EggVariablesForm } from "@/components/egg-variables-form";

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

export const Route = createFileRoute("/_authenticated/manage/$orderId")({
  head: () => ({ meta: [{ title: "Manage server · XntServers" }] }),
  component: ServerDetail,
});

function ServerDetail() {
  const { orderId } = Route.useParams();
  const fetchDetail = useServerFn(getServerDetail);
  const sendPower = useServerFn(powerServer);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["server-detail", orderId],
    queryFn: () => fetchDetail({ data: { orderId } }),
    refetchInterval: 5000,
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
  const live = data?.live;
  const connection = live?.connection;

  return (
    <div className="xnt-page min-h-screen">
      <SiteHeader />
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <Button asChild variant="ghost" size="sm" className="mb-4 -ml-2">
          <Link to="/dashboard">
            <ArrowLeft className="h-4 w-4 mr-1.5" /> Back
          </Link>
        </Button>

        {isLoading || !order ? (
          <div className="xnt-card rounded-xl p-8 text-muted-foreground">Loading server data…</div>
        ) : (
          <>
            <div className="xnt-card mb-6 rounded-2xl p-6">
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <div className="mb-3 inline-flex rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs text-primary">
                    Server control room
                  </div>
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

            <Tabs defaultValue="console">
              <TabsList>
                <TabsTrigger value="console">Console</TabsTrigger>
                <TabsTrigger value="files">Files</TabsTrigger>
                <TabsTrigger value="startup">Startup &amp; Variables</TabsTrigger>
                <TabsTrigger value="info">SFTP &amp; Info</TabsTrigger>
              </TabsList>

              <TabsContent value="console" className="mt-4">
                <ConsoleTab orderId={orderId} />
              </TabsContent>
              <TabsContent value="files" className="mt-4">
                <FilesTab orderId={orderId} />
              </TabsContent>
              <TabsContent value="startup" className="mt-4">
                <StartupTab orderId={orderId} />
              </TabsContent>
              <TabsContent value="info" className="mt-4">
                <InfoTab
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

  useEffect(() => {
    let cancelled = false;
    let ws: WebSocket | null = null;
    let xterm: { dispose: () => void } | null = null;
    let ro: ResizeObserver | null = null;
    setConnected(false);
    setConsoleError(null);

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
        try {
          ws = new WebSocket(creds.socket);
        } catch (error) {
          console.error("[Pterodactyl WS] constructor failed", error);
          throw new Error("Console WebSocket inaccessible. Vérifiez Wings / NPM / SSL.");
        }
        wsRef.current = ws;
        ws.onopen = () => {
          ws?.send(JSON.stringify({ event: "auth", args: [creds.token] }));
          setConnected(true);
          t.write("\x1b[32m[Connected to server console]\x1b[0m\r\n");
        };
        ws.onmessage = async (ev) => {
          try {
            const msg = JSON.parse(ev.data);
            if (msg.event === "console output" || msg.event === "install output") {
              t.write(String(msg.args?.[0] ?? "") + "\r\n");
            } else if (msg.event === "status") {
              t.write(`\x1b[33m[status: ${msg.args?.[0]}]\x1b[0m\r\n`);
            } else if (msg.event === "token expiring" || msg.event === "token expired") {
              try {
                const fresh = await fetchWs({ data: { orderId } });
                if (!fresh.ok) throw new Error(fresh.error);
                ws?.send(JSON.stringify({ event: "auth", args: [fresh.token] }));
              } catch (err) {
                t.write(`\x1b[31m[token refresh failed: ${(err as Error).message}]\x1b[0m\r\n`);
              }
            } else if (msg.event === "jwt error" || msg.event === "auth error") {
              t.write(`\x1b[31m[auth error]\x1b[0m\r\n`);
            }
          } catch {
            /* ignore */
          }
        };
        ws.onclose = (event) => {
          console.warn("[Pterodactyl WS] closed", {
            code: event.code,
            reason: event.reason,
            wasClean: event.wasClean,
          });
          setConnected(false);
          t.write(
            `\x1b[31m[disconnected code=${event.code} reason=${event.reason || "none"}]\x1b[0m\r\n`,
          );
        };
        ws.onerror = (event) => {
          console.error("[Pterodactyl WS] error", event);
          setConsoleError("Console WebSocket inaccessible. Vérifiez Wings / NPM / SSL.");
          setConnected(false);
          t.write("\x1b[31m[ws error]\x1b[0m\r\n");
        };
      };

      try {
        await connect();
      } catch (e) {
        const message =
          (e as Error).message || "Console WebSocket inaccessible. Vérifiez Wings / NPM / SSL.";
        console.error("[Pterodactyl WS] connect failed", e);
        setConsoleError(
          message.includes("WebSocket")
            ? message
            : "Console WebSocket inaccessible. Vérifiez Wings / NPM / SSL.",
        );
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

/* ---------------- Files ---------------- */

function FilesTab({ orderId }: { orderId: string }) {
  const fetchList = useServerFn(listServerFiles);
  const fetchFile = useServerFn(readServerFile);
  const saveFile = useServerFn(writeServerFile);
  const removeFiles = useServerFn(deleteServerFiles);
  const mkdir = useServerFn(createServerFolder);
  const qc = useQueryClient();

  const [dir, setDir] = useState("/");
  const [editing, setEditing] = useState<{ path: string; contents: string } | null>(null);
  const [folderName, setFolderName] = useState("");

  const list = useQuery({
    queryKey: ["files", orderId, dir],
    queryFn: () => fetchList({ data: { orderId, directory: dir } }),
  });

  const parentDir = useMemo(() => {
    if (dir === "/" || dir === "") return null;
    const trimmed = dir.replace(/\/+$/, "");
    const idx = trimmed.lastIndexOf("/");
    return idx <= 0 ? "/" : trimmed.slice(0, idx);
  }, [dir]);

  const openFile = async (file: { name: string; size: number }) => {
    if (file.size > MAX_EDITABLE_FILE_SIZE_BYTES || hasBlockedEditorExtension(file.name)) {
      toast.warning("Ce fichier ne peut pas être ouvert dans l’éditeur.");
      return;
    }

    const path = joinPath(dir, file.name);
    try {
      const res = await fetchFile({ data: { orderId, file: path } });
      setEditing({ path, contents: res.contents });
    } catch (e) {
      toast.error((e as Error).message || "Impossible d’ouvrir ce fichier.");
    }
  };

  const save = useMutation({
    mutationFn: () =>
      saveFile({ data: { orderId, file: editing!.path, contents: editing!.contents } }),
    onSuccess: () => toast.success("Saved"),
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: (name: string) => removeFiles({ data: { orderId, root: dir, files: [name] } }),
    onSuccess: () => {
      toast.success("Deleted");
      qc.invalidateQueries({ queryKey: ["files", orderId, dir] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const createFolder = useMutation({
    mutationFn: () => mkdir({ data: { orderId, root: dir, name: folderName } }),
    onSuccess: () => {
      toast.success("Folder created");
      setFolderName("");
      qc.invalidateQueries({ queryKey: ["files", orderId, dir] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (editing) {
    return (
      <div className="xnt-card rounded-xl p-4">
        <div className="flex items-center justify-between mb-3 gap-2">
          <div className="font-mono text-sm truncate">{editing.path}</div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setEditing(null)}>
              Close
            </Button>
            <Button
              size="sm"
              onClick={() => save.mutate()}
              disabled={save.isPending}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              <Save className="h-4 w-4 mr-1.5" /> Save
            </Button>
          </div>
        </div>
        <Textarea
          value={editing.contents}
          onChange={(e) => setEditing({ ...editing, contents: e.target.value })}
          className="h-[500px] bg-[#050816] font-mono text-sm"
          spellCheck={false}
        />
      </div>
    );
  }

  return (
    <div className="xnt-card rounded-xl">
      <div className="flex flex-wrap items-center gap-2 border-b border-border/60 p-3">
        <Button
          size="sm"
          variant="ghost"
          disabled={!parentDir}
          onClick={() => parentDir && setDir(parentDir)}
        >
          <ChevronLeft className="h-4 w-4 mr-1" /> Up
        </Button>
        <div className="font-mono text-sm text-muted-foreground truncate flex-1">{dir}</div>
        <Button size="sm" variant="ghost" onClick={() => list.refetch()}>
          <RefreshCw className="h-4 w-4" />
        </Button>
        <Input
          value={folderName}
          onChange={(e) => setFolderName(e.target.value)}
          placeholder="New folder name"
          className="h-8 w-44"
        />
        <Button
          size="sm"
          variant="outline"
          onClick={() => createFolder.mutate()}
          disabled={!folderName.trim()}
        >
          <FolderPlus className="h-4 w-4 mr-1" /> Create
        </Button>
      </div>
      <div className="divide-y divide-border/60">
        {list.isLoading ? (
          <div className="p-6 text-sm text-muted-foreground">Loading…</div>
        ) : list.error || list.data?.error ? (
          <div className="space-y-3 p-6">
            <div className="text-sm font-medium text-destructive">File manager unavailable</div>
            <div className="text-sm text-muted-foreground">
              {(list.error as Error | null)?.message ?? list.data?.error}
            </div>
            <Button size="sm" variant="outline" onClick={() => list.refetch()}>
              <RefreshCw className="h-4 w-4 mr-1" /> Retry
            </Button>
          </div>
        ) : (list.data?.files ?? []).length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground">Empty directory.</div>
        ) : (
          list.data!.files.map((f) => (
            <div key={f.name} className="flex items-center gap-3 p-3 hover:bg-muted/30">
              <button
                type="button"
                className="flex items-center gap-2 flex-1 text-left truncate"
                onClick={() => (f.is_file ? openFile(f) : setDir(joinPath(dir, f.name)))}
              >
                {f.is_file ? (
                  <FileIcon className="h-4 w-4 text-muted-foreground shrink-0" />
                ) : (
                  <Folder className="h-4 w-4 text-primary shrink-0" />
                )}
                <span className="font-mono text-sm truncate">{f.name}</span>
              </button>
              <span className="text-xs text-muted-foreground w-24 text-right">
                {f.is_file ? formatSize(f.size) : "—"}
              </span>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  if (confirm(`Delete ${f.name}?`)) del.mutate(f.name);
                }}
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function joinPath(dir: string, name: string) {
  if (dir.endsWith("/")) return dir + name;
  return dir + "/" + name;
}
function formatSize(b: number) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1024 * 1024 * 1024) return `${(b / 1024 / 1024).toFixed(1)} MB`;
  return `${(b / 1024 / 1024 / 1024).toFixed(2)} GB`;
}
function hasBlockedEditorExtension(name: string) {
  const normalized = name.toLowerCase();
  return [...BLOCKED_EDITOR_EXTENSIONS].some((extension) => normalized.endsWith(extension));
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

function InfoTab({ connection }: { connection: ConnectionInfo }) {
  return (
    <div className="xnt-card space-y-4 rounded-xl p-6">
      <div>
        <h3 className="font-display text-lg font-semibold mb-2">Connexion serveur</h3>
        <div className="grid gap-3 md:grid-cols-2">
          <InfoLine
            label="Adresse publique"
            value={connection.address ?? "Adresse publique indisponible"}
          />
          <InfoLine label="Port serveur" value={connection.port ?? "Port indisponible"} />
          <InfoLine label="Hôte SFTP public" value={connection.sftpHost ?? "SFTP indisponible"} />
          <InfoLine label="Port SFTP" value={connection.sftpPort ?? "Port SFTP indisponible"} />
          <InfoLine
            label="Utilisateur SFTP"
            value={connection.sftpUsername ?? "Utilisateur SFTP indisponible"}
          />
          <InfoLine label="Identifier Pterodactyl" value={connection.identifier ?? "—"} />
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

function InfoLine({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-primary/15 bg-background/35 p-3">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 break-all font-mono text-sm text-primary">{value}</div>
    </div>
  );
}

/* ---------------- Startup & Variables ---------------- */

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

  if (startup.isLoading) return <div className="text-sm text-muted-foreground">Loading…</div>;
  if (startup.error)
    return <div className="text-sm text-destructive">{(startup.error as Error).message}</div>;
  if (!startup.data) return null;

  return (
    <div className="xnt-card space-y-6 rounded-xl p-6">
      <div>
        <h3 className="font-display text-lg font-semibold">Server variables</h3>
        <p className="text-xs text-muted-foreground mt-1">
          Change version, mods, modpack ID, or any other option below. Changing the version or
          modpack usually requires a reinstall.
        </p>
      </div>

      <EggVariablesForm variables={startup.data.variables} values={env} onChange={setEnv} />

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
