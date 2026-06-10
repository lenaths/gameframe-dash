import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Play, RotateCw, Square, Folder, File as FileIcon, Trash2, FolderPlus, Save, RefreshCw, ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { SiteHeader } from "@/components/site-header";
import { toast } from "sonner";
import {
  getServerDetail, getServerWebsocket, powerServer, sendServerCommand,
  listServerFiles, readServerFile, writeServerFile, deleteServerFiles, createServerFolder,
  getServerStartup, updateServerStartup,
} from "@/lib/servers.functions";
import { EggVariablesForm } from "@/components/egg-variables-form";

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

  const power = useMutation({
    mutationFn: (signal: "start" | "stop" | "restart") => sendPower({ data: { orderId, signal } }),
    onSuccess: (_d, s) => { toast.success(`Sent ${s}`); qc.invalidateQueries({ queryKey: ["server-detail", orderId] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const order = data?.order;
  const live = data?.live;

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <div className="mx-auto max-w-6xl px-6 py-8">
        <Button asChild variant="ghost" size="sm" className="mb-4 -ml-2">
          <Link to="/dashboard"><ArrowLeft className="h-4 w-4 mr-1.5" /> Back</Link>
        </Button>

        {isLoading || !order ? (
          <div className="text-muted-foreground">Loading…</div>
        ) : (
          <>
            <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
              <div>
                <h1 className="font-display text-3xl font-bold">{order.server_name}</h1>
                <div className="text-sm text-muted-foreground mt-1">
                  {order.plans?.game} · {order.plans?.name}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="capitalize">{live?.state ?? order.status}</Badge>
                <Button size="sm" variant="outline" onClick={() => power.mutate("start")}><Play className="h-4 w-4" /></Button>
                <Button size="sm" variant="outline" onClick={() => power.mutate("restart")}><RotateCw className="h-4 w-4" /></Button>
                <Button size="sm" variant="outline" onClick={() => power.mutate("stop")}><Square className="h-4 w-4" /></Button>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
              <Stat label="State" value={live?.state ?? "—"} />
              <Stat label="RAM" value={`${live?.memoryMb ?? 0} / ${order.plans?.ram_mb ?? 0} MB`} />
              <Stat label="CPU" value={`${live?.cpu ?? 0}%`} />
              <Stat label="Disk" value={`${live?.diskMb ?? 0} MB`} />
            </div>

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
                <InfoTab sftp={live?.sftp ?? null} />
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
    <div className="rounded-lg border border-border/60 bg-surface p-4">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="font-display text-lg font-semibold mt-1">{value}</div>
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

  useEffect(() => {
    let cancelled = false;
    let ws: WebSocket | null = null;
    let xterm: { dispose: () => void } | null = null;

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

      const ro = new ResizeObserver(() => { try { fit.fit(); } catch { /* ignore */ } });
      ro.observe(termRef.current);

      const connect = async () => {
        const creds = await fetchWs({ data: { orderId } });
        ws = new WebSocket(creds.socket);
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
              const fresh = await fetchWs({ data: { orderId } });
              ws?.send(JSON.stringify({ event: "auth", args: [fresh.token] }));
            } else if (msg.event === "jwt error" || msg.event === "auth error") {
              t.write(`\x1b[31m[auth error]\x1b[0m\r\n`);
            }
          } catch { /* ignore */ }
        };
        ws.onclose = () => { setConnected(false); t.write("\x1b[31m[disconnected]\x1b[0m\r\n"); };
        ws.onerror = () => { t.write("\x1b[31m[ws error]\x1b[0m\r\n"); };
      };

      try { await connect(); } catch (e) {
        t.write(`\x1b[31m${(e as Error).message}\x1b[0m\r\n`);
      }

      return () => { ro.disconnect(); };
    })();

    return () => {
      cancelled = true;
      try { wsRef.current?.close(); } catch { /* ignore */ }
      try { xterm?.dispose(); } catch { /* ignore */ }
    };
  }, [orderId, fetchWs]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!command.trim()) return;
    try {
      await sendCmd({ data: { orderId, command } });
      setCommand("");
    } catch (err) { toast.error((err as Error).message); }
  };

  return (
    <div className="rounded-xl border border-border/60 bg-[#0a0d12] overflow-hidden">
      <div ref={termRef} className="h-[420px] w-full px-3 py-2" />
      <form onSubmit={onSubmit} className="flex gap-2 border-t border-border/60 p-2 bg-surface">
        <Input
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          placeholder={connected ? "Type a command and press Enter…" : "Connecting…"}
          className="font-mono text-sm"
          disabled={!connected}
        />
        <Button type="submit" disabled={!connected || !command.trim()}>Send</Button>
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

  const openFile = async (name: string) => {
    const path = joinPath(dir, name);
    try {
      const res = await fetchFile({ data: { orderId, file: path } });
      setEditing({ path, contents: res.contents });
    } catch (e) { toast.error((e as Error).message); }
  };

  const save = useMutation({
    mutationFn: () => saveFile({ data: { orderId, file: editing!.path, contents: editing!.contents } }),
    onSuccess: () => toast.success("Saved"),
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: (name: string) => removeFiles({ data: { orderId, root: dir, files: [name] } }),
    onSuccess: () => { toast.success("Deleted"); qc.invalidateQueries({ queryKey: ["files", orderId, dir] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const createFolder = useMutation({
    mutationFn: () => mkdir({ data: { orderId, root: dir, name: folderName } }),
    onSuccess: () => { toast.success("Folder created"); setFolderName(""); qc.invalidateQueries({ queryKey: ["files", orderId, dir] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  if (editing) {
    return (
      <div className="rounded-xl border border-border/60 bg-surface p-4">
        <div className="flex items-center justify-between mb-3 gap-2">
          <div className="font-mono text-sm truncate">{editing.path}</div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setEditing(null)}>Close</Button>
            <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending} className="bg-primary text-primary-foreground hover:bg-primary/90">
              <Save className="h-4 w-4 mr-1.5" /> Save
            </Button>
          </div>
        </div>
        <Textarea
          value={editing.contents}
          onChange={(e) => setEditing({ ...editing, contents: e.target.value })}
          className="font-mono text-sm h-[500px] bg-[#0a0d12]"
          spellCheck={false}
        />
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border/60 bg-surface">
      <div className="flex flex-wrap items-center gap-2 p-3 border-b border-border/60">
        <Button size="sm" variant="ghost" disabled={!parentDir} onClick={() => parentDir && setDir(parentDir)}>
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
        <Button size="sm" variant="outline" onClick={() => createFolder.mutate()} disabled={!folderName.trim()}>
          <FolderPlus className="h-4 w-4 mr-1" /> Create
        </Button>
      </div>
      <div className="divide-y divide-border/60">
        {list.isLoading ? (
          <div className="p-6 text-sm text-muted-foreground">Loading…</div>
        ) : (list.data?.files ?? []).length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground">Empty directory.</div>
        ) : (
          list.data!.files.map((f) => (
            <div key={f.name} className="flex items-center gap-3 p-3 hover:bg-muted/30">
              <button
                type="button"
                className="flex items-center gap-2 flex-1 text-left truncate"
                onClick={() => f.is_file ? openFile(f.name) : setDir(joinPath(dir, f.name))}
              >
                {f.is_file ? <FileIcon className="h-4 w-4 text-muted-foreground shrink-0" /> : <Folder className="h-4 w-4 text-primary shrink-0" />}
                <span className="font-mono text-sm truncate">{f.name}</span>
              </button>
              <span className="text-xs text-muted-foreground w-24 text-right">{f.is_file ? formatSize(f.size) : "—"}</span>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => { if (confirm(`Delete ${f.name}?`)) del.mutate(f.name); }}
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

/* ---------------- Info ---------------- */

function InfoTab({ sftp }: { sftp: { ip: string; port: number } | null }) {
  return (
    <div className="rounded-xl border border-border/60 bg-surface p-6 space-y-4">
      <div>
        <h3 className="font-display text-lg font-semibold mb-2">SFTP access</h3>
        {sftp ? (
          <div className="space-y-1 font-mono text-sm">
            <div><span className="text-muted-foreground">Host:</span> {sftp.ip}</div>
            <div><span className="text-muted-foreground">Port:</span> {sftp.port}</div>
            <div className="text-xs text-muted-foreground mt-2">
              Use your account email as username. SFTP password is set in your account settings on the panel.
            </div>
          </div>
        ) : (
          <div className="text-sm text-muted-foreground">SFTP details unavailable.</div>
        )}
      </div>
    </div>
  );
}
