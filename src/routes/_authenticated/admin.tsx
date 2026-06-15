import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { LifeBuoy, Users, Server, Package, Plus, Trash2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { SiteHeader } from "@/components/site-header";
import {
  adminListAll,
  adminListPlans,
  adminListProvisioningQueue,
  adminRetryProvisioning,
  adminUpdatePlanEggs,
} from "@/lib/admin.functions";
import { adminListTickets, adminReplyToTicket } from "@/lib/support.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({ meta: [{ title: "Admin · XntServers" }] }),
  component: Admin,
});

function Admin() {
  const fetchAll = useServerFn(adminListAll);
  const fetchPlans = useServerFn(adminListPlans);
  const fetchProvisioningQueue = useServerFn(adminListProvisioningQueue);
  const fetchTickets = useServerFn(adminListTickets);
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-all"],
    queryFn: () => fetchAll(),
    retry: false,
  });
  const plansQ = useQuery({ queryKey: ["admin-plans"], queryFn: () => fetchPlans(), retry: false });
  const ticketsQ = useQuery({
    queryKey: ["admin-tickets"],
    queryFn: () => fetchTickets(),
    retry: false,
  });
  const provisioningQ = useQuery({
    queryKey: ["admin-provisioning-queue"],
    queryFn: () => fetchProvisioningQueue(),
    retry: false,
  });

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <div className="mx-auto max-w-6xl px-6 py-12">
        <h1 className="font-display text-4xl font-bold">Admin</h1>
        <p className="text-muted-foreground mt-2">Manage users, servers, and plan variants.</p>

        {error && (
          <div className="mt-6 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
            {(error as Error).message}
          </div>
        )}
        {isLoading && <div className="mt-8 text-muted-foreground">Loading…</div>}

        {data && (
          <div className="grid gap-8 mt-8">
            <section>
              <div className="flex items-center gap-2 mb-4">
                <Package className="h-5 w-5 text-primary" />
                <h2 className="font-display text-xl font-semibold">
                  Plans &amp; variants ({plansQ.data?.plans.length ?? 0})
                </h2>
              </div>
              <div className="rounded-xl border border-border/60 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-surface-2 text-muted-foreground text-left">
                    <tr>
                      <th className="p-3">Game</th>
                      <th className="p-3">Name</th>
                      <th className="p-3">Default egg</th>
                      <th className="p-3">Variants</th>
                      <th className="p-3"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {(plansQ.data?.plans ?? []).map((p) => {
                      const variants = Array.isArray(p.allowed_eggs)
                        ? (p.allowed_eggs as unknown as Array<{ label: string }>)
                        : [];
                      return (
                        <tr key={p.id} className="border-t border-border/60">
                          <td className="p-3 text-muted-foreground">{p.game}</td>
                          <td className="p-3 font-medium">{p.name}</td>
                          <td className="p-3 text-muted-foreground">
                            nest {p.pterodactyl_nest_id} · egg {p.pterodactyl_egg_id}
                          </td>
                          <td className="p-3 text-muted-foreground">
                            {variants.length === 0 ? "—" : variants.map((v) => v.label).join(", ")}
                          </td>
                          <td className="p-3 text-right">
                            <EditEggsDialog plan={p} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>

            <AdminProvisioningQueueSection
              orders={(provisioningQ.data?.orders ?? []) as ProvisioningQueueOrder[]}
            />

            <section>
              <div className="flex items-center gap-2 mb-4">
                <Server className="h-5 w-5 text-primary" />
                <h2 className="font-display text-xl font-semibold">
                  All servers ({data.orders.length})
                </h2>
              </div>
              <div className="rounded-xl border border-border/60 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-surface-2 text-muted-foreground text-left">
                    <tr>
                      <th className="p-3">Name</th>
                      <th className="p-3">Plan</th>
                      <th className="p-3">Status</th>
                      <th className="p-3">Pterodactyl ID</th>
                      <th className="p-3">Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.orders.map((o) => (
                      <tr key={o.id} className="border-t border-border/60">
                        <td className="p-3 font-medium">{o.server_name}</td>
                        <td className="p-3 text-muted-foreground">
                          {o.plans?.game} — {o.plans?.name}
                        </td>
                        <td className="p-3">{o.status}</td>
                        <td className="p-3 text-muted-foreground">
                          {o.pterodactyl_server_id ?? "—"}
                        </td>
                        <td className="p-3 text-muted-foreground">
                          {new Date(o.created_at).toLocaleDateString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section>
              <div className="flex items-center gap-2 mb-4">
                <Users className="h-5 w-5 text-primary" />
                <h2 className="font-display text-xl font-semibold">
                  Users ({data.profiles.length})
                </h2>
              </div>
              <div className="rounded-xl border border-border/60 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-surface-2 text-muted-foreground text-left">
                    <tr>
                      <th className="p-3">Display name</th>
                      <th className="p-3">Email</th>
                      <th className="p-3">Roles</th>
                      <th className="p-3">Joined</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.profiles.map((p) => {
                      const roles = data.roles
                        .filter((r) => r.user_id === p.id)
                        .map((r) => r.role)
                        .join(", ");
                      return (
                        <tr key={p.id} className="border-t border-border/60">
                          <td className="p-3 font-medium">{p.display_name}</td>
                          <td className="p-3 text-muted-foreground">{p.email}</td>
                          <td className="p-3 text-muted-foreground">{roles || "user"}</td>
                          <td className="p-3 text-muted-foreground">
                            {new Date(p.created_at).toLocaleDateString()}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>

            <AdminTicketsSection tickets={(ticketsQ.data?.tickets ?? []) as AdminTicket[]} />
          </div>
        )}
      </div>
    </div>
  );
}

type AdminTicketMessage = {
  id: string;
  user_id: string;
  is_staff: boolean;
  body: string;
  created_at: string;
};

type ProvisioningQueueOrder = {
  id: string;
  user_id: string;
  status: string;
  total_cents: number;
  currency: string;
  created_at: string;
  plans?: { name?: string; game?: string } | null;
  server_order?: {
    id: string;
    status: string;
    error_message: string | null;
    pterodactyl_server_id: number | null;
  } | null;
};

function AdminProvisioningQueueSection({ orders }: { orders: ProvisioningQueueOrder[] }) {
  const qc = useQueryClient();
  const retryFn = useServerFn(adminRetryProvisioning);
  const retry = useMutation({
    mutationFn: (orderId: string) => retryFn({ data: { orderId } }),
    onSuccess: (result) => {
      if (!result.ok) {
        toast.warning(result.error ?? "Provisioning failed");
      } else {
        toast.success("Provisioning launched");
      }
      qc.invalidateQueries({ queryKey: ["admin-provisioning-queue"] });
      qc.invalidateQueries({ queryKey: ["admin-all"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <section>
      <div className="flex items-center gap-2 mb-4">
        <RefreshCw className="h-5 w-5 text-primary" />
        <h2 className="font-display text-xl font-semibold">
          Paid orders pending server ({orders.length})
        </h2>
      </div>
      {orders.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-surface p-6 text-sm text-muted-foreground">
          No paid orders waiting for provisioning.
        </div>
      ) : (
        <div className="rounded-xl border border-border/60 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-muted-foreground text-left">
              <tr>
                <th className="p-3">Order</th>
                <th className="p-3">Plan</th>
                <th className="p-3">Server state</th>
                <th className="p-3">Error</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr key={order.id} className="border-t border-border/60">
                  <td className="p-3">
                    <div className="font-medium">{order.id.slice(0, 8)}</div>
                    <div className="text-xs text-muted-foreground">
                      {(order.total_cents / 100).toFixed(2)} {order.currency}
                    </div>
                  </td>
                  <td className="p-3 text-muted-foreground">
                    {order.plans?.game} — {order.plans?.name}
                  </td>
                  <td className="p-3">
                    <Badge variant="outline" className="capitalize">
                      {order.server_order?.status ?? "missing"}
                    </Badge>
                  </td>
                  <td className="p-3 max-w-xs truncate text-muted-foreground">
                    {order.server_order?.error_message ?? "—"}
                  </td>
                  <td className="p-3 text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={retry.isPending}
                      onClick={() => retry.mutate(order.id)}
                    >
                      <RefreshCw className="mr-2 h-4 w-4" />
                      Retry
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

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
      toast.success("Staff reply sent");
      setDrafts((current) => ({ ...current, [ticketId]: "" }));
      qc.invalidateQueries({ queryKey: ["admin-tickets"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <section>
      <div className="flex items-center gap-2 mb-4">
        <LifeBuoy className="h-5 w-5 text-primary" />
        <h2 className="font-display text-xl font-semibold">Support tickets ({tickets.length})</h2>
      </div>
      {tickets.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-surface p-8 text-sm text-muted-foreground">
          No tickets yet.
        </div>
      ) : (
        <div className="grid gap-4">
          {tickets.map((ticket) => (
            <article key={ticket.id} className="rounded-xl border border-border/60 bg-surface">
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border/60 p-4">
                <div>
                  <h3 className="font-display text-lg font-semibold">{ticket.subject}</h3>
                  <div className="mt-1 text-xs text-muted-foreground">
                    User {ticket.user_id.slice(0, 8)} ·{" "}
                    {new Date(ticket.created_at).toLocaleString()}
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
                      {new Date(message.created_at).toLocaleString()}
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
                    placeholder="Staff reply…"
                    className="min-h-[90px]"
                  />
                  <Button
                    type="submit"
                    disabled={reply.isPending || !(drafts[ticket.id] ?? "").trim()}
                  >
                    Reply as staff
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
        initial.map((r) => ({
          nest_id: r.nest_id,
          egg_id: r.egg_id,
          label: r.label,
          docker_image: r.docker_image,
          startup: r.startup,
        })),
      );
    }
  }, [open, plan.allowed_eggs]);

  const mutation = useMutation({
    mutationFn: () => save({ data: { planId: plan.id, allowedEggs: rows } }),
    onSuccess: () => {
      toast.success("Variants saved");
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["admin-plans"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const update = (i: number, patch: Partial<Variant>) =>
    setRows(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          Edit variants
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{plan.name} — variants</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">
          Each row is an egg users can pick at deploy. Get nest/egg IDs from your panel under Admin
          → Nests. Leave docker image &amp; startup blank to use the egg's defaults from the panel.
        </p>
        <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
          {rows.length === 0 && (
            <p className="text-sm text-muted-foreground italic">
              No variants — plan falls back to its default egg.
            </p>
          )}
          {rows.map((r, i) => (
            <div key={i} className="rounded-lg border border-border/60 p-3 space-y-2">
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-xs text-muted-foreground">Label</label>
                  <Input
                    value={r.label}
                    onChange={(e) => update(i, { label: e.target.value })}
                    placeholder="Paper"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Nest ID</label>
                  <Input
                    type="number"
                    value={r.nest_id || ""}
                    onChange={(e) => update(i, { nest_id: Number(e.target.value) })}
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Egg ID</label>
                  <Input
                    type="number"
                    value={r.egg_id || ""}
                    onChange={(e) => update(i, { egg_id: Number(e.target.value) })}
                  />
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">
                  Docker image override (optional)
                </label>
                <Input
                  value={r.docker_image ?? ""}
                  onChange={(e) => update(i, { docker_image: e.target.value || undefined })}
                  placeholder="ghcr.io/pterodactyl/yolks:java_17"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Startup override (optional)</label>
                <Input
                  value={r.startup ?? ""}
                  onChange={(e) => update(i, { startup: e.target.value || undefined })}
                  placeholder="java -Xms128M -Xmx{{SERVER_MEMORY}}M -jar {{SERVER_JARFILE}}"
                />
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setRows(rows.filter((_, idx) => idx !== i))}
                className="text-destructive"
              >
                <Trash2 className="h-4 w-4 mr-1" /> Remove
              </Button>
            </div>
          ))}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setRows([...rows, { nest_id: 0, egg_id: 0, label: "" }])}
        >
          <Plus className="h-4 w-4 mr-1" /> Add variant
        </Button>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {mutation.isPending ? "Saving…" : "Save variants"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
