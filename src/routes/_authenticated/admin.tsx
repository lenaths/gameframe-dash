import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Users, Server } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { adminListAll } from "@/lib/admin.functions";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({ meta: [{ title: "Admin · XntServers" }] }),
  component: Admin,
});

function Admin() {
  const fetchAll = useServerFn(adminListAll);
  const { data, isLoading, error } = useQuery({ queryKey: ["admin-all"], queryFn: () => fetchAll(), retry: false });

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <div className="mx-auto max-w-6xl px-6 py-12">
        <h1 className="font-display text-4xl font-bold">Admin</h1>
        <p className="text-muted-foreground mt-2">Manage users and provisioned servers.</p>

        {error && <div className="mt-6 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">{(error as Error).message}</div>}
        {isLoading && <div className="mt-8 text-muted-foreground">Loading…</div>}

        {data && (
          <div className="grid gap-8 mt-8">
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
