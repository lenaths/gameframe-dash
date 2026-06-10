import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Play, Square, RotateCw, Server as ServerIcon, Plus, ShieldAlert, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SiteHeader } from "@/components/site-header";
import { listMyServers, powerServer } from "@/lib/servers.functions";
import { checkIsAdmin } from "@/lib/admin.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard · XntServers" }] }),
  component: Dashboard,
});

const statusColor: Record<string, string> = {
  active: "text-success bg-success/10 border-success/30",
  provisioning: "text-accent bg-accent/10 border-accent/30",
  pending: "text-accent bg-accent/10 border-accent/30",
  failed: "text-destructive bg-destructive/10 border-destructive/30",
  suspended: "text-muted-foreground bg-muted border-border",
  cancelled: "text-muted-foreground bg-muted border-border",
};

function Dashboard() {
  const fetchServers = useServerFn(listMyServers);
  const fetchAdmin = useServerFn(checkIsAdmin);
  const sendPower = useServerFn(powerServer);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({ queryKey: ["my-servers"], queryFn: () => fetchServers() });
  const { data: adminData } = useQuery({ queryKey: ["is-admin"], queryFn: () => fetchAdmin() });

  const power = useMutation({
    mutationFn: (vars: { orderId: string; signal: "start" | "stop" | "restart" }) => sendPower({ data: vars }),
    onSuccess: (_d, vars) => {
      toast.success(`Sent ${vars.signal} signal`);
      qc.invalidateQueries({ queryKey: ["my-servers"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <div className="mx-auto max-w-6xl px-6 py-12">
        <div className="flex items-end justify-between mb-8 gap-4 flex-wrap">
          <div>
            <h1 className="font-display text-4xl font-bold">Your servers</h1>
            <p className="text-muted-foreground mt-1">Manage everything you've deployed.</p>
          </div>
          <div className="flex gap-2">
            {adminData?.isAdmin && (
              <Button asChild variant="outline"><Link to="/admin"><ShieldAlert className="mr-2 h-4 w-4" /> Admin</Link></Button>
            )}
            <Button asChild className="bg-primary text-primary-foreground hover:bg-primary/90">
              <Link to="/pricing"><Plus className="mr-2 h-4 w-4" /> Deploy new server</Link>
            </Button>
          </div>
        </div>

        {isLoading ? (
          <div className="text-muted-foreground">Loading…</div>
        ) : (data?.servers ?? []).length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-surface p-12 text-center">
            <ServerIcon className="h-10 w-10 text-muted-foreground mx-auto mb-4" />
            <h3 className="font-display text-xl font-semibold">No servers yet</h3>
            <p className="text-muted-foreground mt-1">Get started by deploying your first game server.</p>
            <Button asChild className="mt-6 bg-primary text-primary-foreground hover:bg-primary/90">
              <Link to="/pricing">Browse plans</Link>
            </Button>
          </div>
        ) : (
          <div className="grid gap-3">
            {(data?.servers ?? []).map((s) => (
              <div key={s.id} className="rounded-xl border border-border/60 bg-surface p-5 flex flex-wrap items-center gap-4 justify-between">
                <div className="flex items-center gap-4">
                  <div className="grid h-12 w-12 place-items-center rounded-md bg-primary/15 text-primary">
                    <ServerIcon className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="font-display text-lg font-semibold">{s.server_name}</div>
                    <div className="text-sm text-muted-foreground">
                      {s.plans?.game} · {s.plans?.name} · {((s.plans?.ram_mb ?? 0) / 1024).toFixed(0)} GB RAM
                    </div>
                    {s.error_message && <div className="text-xs text-destructive mt-1">{s.error_message}</div>}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`text-xs uppercase tracking-wider px-2.5 py-1 rounded-full border ${statusColor[s.status] ?? ""}`}>
                    {s.status}
                  </span>
                  {s.status === "active" && (
                    <div className="flex gap-1.5 items-center">
                      <Button size="sm" variant="outline" onClick={() => power.mutate({ orderId: s.id, signal: "start" })}><Play className="h-4 w-4" /></Button>
                      <Button size="sm" variant="outline" onClick={() => power.mutate({ orderId: s.id, signal: "restart" })}><RotateCw className="h-4 w-4" /></Button>
                      <Button size="sm" variant="outline" onClick={() => power.mutate({ orderId: s.id, signal: "stop" })}><Square className="h-4 w-4" /></Button>
                      <Button asChild size="sm" className="bg-primary text-primary-foreground hover:bg-primary/90">
                        <Link to="/manage/$orderId" params={{ orderId: s.id }}>
                          <Settings className="h-4 w-4 mr-1.5" /> Manage
                        </Link>
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
