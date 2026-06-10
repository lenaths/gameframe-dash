import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { Users, Server, Package, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { SiteHeader } from "@/components/site-header";
import { adminListAll, adminListPlans, adminUpdatePlanEggs } from "@/lib/admin.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({ meta: [{ title: "Admin · XntServers" }] }),
  component: Admin,
});

function Admin() {
  const fetchAll = useServerFn(adminListAll);
  const fetchPlans = useServerFn(adminListPlans);
  const { data, isLoading, error } = useQuery({ queryKey: ["admin-all"], queryFn: () => fetchAll(), retry: false });
  const plansQ = useQuery({ queryKey: ["admin-plans"], queryFn: () => fetchPlans(), retry: false });

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <div className="mx-auto max-w-6xl px-6 py-12">
        <h1 className="font-display text-4xl font-bold">Admin</h1>
        <p className="text-muted-foreground mt-2">Manage users, servers, and plan variants.</p>

        {error && <div className="mt-6 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">{(error as Error).message}</div>}
        {isLoading && <div className="mt-8 text-muted-foreground">Loading…</div>}

        {data && (
          <div className="grid gap-8 mt-8">
            <section>
              <div className="flex items-center gap-2 mb-4"><Package className="h-5 w-5 text-primary" /><h2 className="font-display text-xl font-semibold">Plans &amp; variants ({plansQ.data?.plans.length ?? 0})</h2></div>
              <div className="rounded-xl border border-border/60 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-surface-2 text-muted-foreground text-left">
                    <tr><th className="p-3">Game</th><th className="p-3">Name</th><th className="p-3">Default egg</th><th className="p-3">Variants</th><th className="p-3"></th></tr>
                  </thead>
                  <tbody>
                    {(plansQ.data?.plans ?? []).map((p) => {
                      const variants = Array.isArray(p.allowed_eggs) ? (p.allowed_eggs as unknown as Array<{ label: string }>) : [];
                      return (
                        <tr key={p.id} className="border-t border-border/60">
                          <td className="p-3 text-muted-foreground">{p.game}</td>
                          <td className="p-3 font-medium">{p.name}</td>
                          <td className="p-3 text-muted-foreground">nest {p.pterodactyl_nest_id} · egg {p.pterodactyl_egg_id}</td>
                          <td className="p-3 text-muted-foreground">{variants.length === 0 ? "—" : variants.map((v) => v.label).join(", ")}</td>
                          <td className="p-3 text-right"><EditEggsDialog plan={p} /></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>

            <section>
              <div className="flex items-center gap-2 mb-4"><Server className="h-5 w-5 text-primary" /><h2 className="font-display text-xl font-semibold">All servers ({data.orders.length})</h2></div>
              <div className="rounded-xl border border-border/60 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-surface-2 text-muted-foreground text-left">
                    <tr><th className="p-3">Name</th><th className="p-3">Plan</th><th className="p-3">Status</th><th className="p-3">Pterodactyl ID</th><th className="p-3">Created</th></tr>
                  </thead>
                  <tbody>
                    {data.orders.map((o) => (
                      <tr key={o.id} className="border-t border-border/60">
                        <td className="p-3 font-medium">{o.server_name}</td>
                        <td className="p-3 text-muted-foreground">{o.plans?.game} — {o.plans?.name}</td>
                        <td className="p-3">{o.status}</td>
                        <td className="p-3 text-muted-foreground">{o.pterodactyl_server_id ?? "—"}</td>
                        <td className="p-3 text-muted-foreground">{new Date(o.created_at).toLocaleDateString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section>
              <div className="flex items-center gap-2 mb-4"><Users className="h-5 w-5 text-primary" /><h2 className="font-display text-xl font-semibold">Users ({data.profiles.length})</h2></div>
              <div className="rounded-xl border border-border/60 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-surface-2 text-muted-foreground text-left">
                    <tr><th className="p-3">Display name</th><th className="p-3">Email</th><th className="p-3">Roles</th><th className="p-3">Joined</th></tr>
                  </thead>
                  <tbody>
                    {data.profiles.map((p) => {
                      const roles = data.roles.filter((r) => r.user_id === p.id).map((r) => r.role).join(", ");
                      return (
                        <tr key={p.id} className="border-t border-border/60">
                          <td className="p-3 font-medium">{p.display_name}</td>
                          <td className="p-3 text-muted-foreground">{p.email}</td>
                          <td className="p-3 text-muted-foreground">{roles || "user"}</td>
                          <td className="p-3 text-muted-foreground">{new Date(p.created_at).toLocaleDateString()}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}

type Variant = { nest_id: number; egg_id: number; label: string; docker_image?: string; startup?: string };

function EditEggsDialog({ plan }: { plan: { id: string; name: string; allowed_eggs: unknown } }) {
  const qc = useQueryClient();
  const save = useServerFn(adminUpdatePlanEggs);
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Variant[]>([]);

  useEffect(() => {
    if (open) {
      const initial = Array.isArray(plan.allowed_eggs) ? (plan.allowed_eggs as Variant[]) : [];
      setRows(initial.map((r) => ({ nest_id: r.nest_id, egg_id: r.egg_id, label: r.label, docker_image: r.docker_image, startup: r.startup })));
    }
  }, [open, plan.allowed_eggs]);

  const mutation = useMutation({
    mutationFn: () => save({ data: { planId: plan.id, allowedEggs: rows } }),
    onSuccess: () => { toast.success("Variants saved"); setOpen(false); qc.invalidateQueries({ queryKey: ["admin-plans"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const update = (i: number, patch: Partial<Variant>) => setRows(rows.map((r, idx) => idx === i ? { ...r, ...patch } : r));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm" variant="outline">Edit variants</Button></DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>{plan.name} — variants</DialogTitle></DialogHeader>
        <p className="text-xs text-muted-foreground">
          Each row is an egg users can pick at deploy. Get nest/egg IDs from your panel under Admin → Nests.
          Leave docker image &amp; startup blank to use the egg's defaults from the panel.
        </p>
        <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
          {rows.length === 0 && <p className="text-sm text-muted-foreground italic">No variants — plan falls back to its default egg.</p>}
          {rows.map((r, i) => (
            <div key={i} className="rounded-lg border border-border/60 p-3 space-y-2">
              <div className="grid grid-cols-3 gap-2">
                <div><label className="text-xs text-muted-foreground">Label</label><Input value={r.label} onChange={(e) => update(i, { label: e.target.value })} placeholder="Paper" /></div>
                <div><label className="text-xs text-muted-foreground">Nest ID</label><Input type="number" value={r.nest_id || ""} onChange={(e) => update(i, { nest_id: Number(e.target.value) })} /></div>
                <div><label className="text-xs text-muted-foreground">Egg ID</label><Input type="number" value={r.egg_id || ""} onChange={(e) => update(i, { egg_id: Number(e.target.value) })} /></div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Docker image override (optional)</label>
                <Input value={r.docker_image ?? ""} onChange={(e) => update(i, { docker_image: e.target.value || undefined })} placeholder="ghcr.io/pterodactyl/yolks:java_17" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Startup override (optional)</label>
                <Input value={r.startup ?? ""} onChange={(e) => update(i, { startup: e.target.value || undefined })} placeholder="java -Xms128M -Xmx{{SERVER_MEMORY}}M -jar {{SERVER_JARFILE}}" />
              </div>
              <Button size="sm" variant="ghost" onClick={() => setRows(rows.filter((_, idx) => idx !== i))} className="text-destructive"><Trash2 className="h-4 w-4 mr-1" /> Remove</Button>
            </div>
          ))}
        </div>
        <Button variant="outline" size="sm" onClick={() => setRows([...rows, { nest_id: 0, egg_id: 0, label: "" }])}>
          <Plus className="h-4 w-4 mr-1" /> Add variant
        </Button>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending} className="bg-primary text-primary-foreground hover:bg-primary/90">
            {mutation.isPending ? "Saving…" : "Save variants"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
