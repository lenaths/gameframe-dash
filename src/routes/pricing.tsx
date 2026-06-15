import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { listPlans } from "@/lib/plans.functions";
import { createCheckoutSession } from "@/lib/stripe.functions";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";

export const Route = createFileRoute("/pricing")({
  head: () => ({
    meta: [
      { title: "Pricing — XntServers game server hosting" },
      {
        name: "description",
        content:
          "Transparent monthly pricing for Minecraft, ARK, Conan Exiles and Garry's Mod servers. Pick a plan and deploy.",
      },
    ],
  }),
  component: Pricing,
});

function Pricing() {
  const fetchPlans = useServerFn(listPlans);
  const startCheckout = useServerFn(createCheckoutSession);
  const { user } = useAuth();
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({ queryKey: ["plans"], queryFn: () => fetchPlans() });
  const [game, setGame] = useState<string>("All");
  const checkout = useMutation({
    mutationFn: (planId: string) => startCheckout({ data: { planId } }),
    onSuccess: ({ url }) => {
      window.location.assign(url);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const games = useMemo(
    () => ["All", ...Array.from(new Set((data?.plans ?? []).map((p) => p.game)))],
    [data],
  );
  const visible = (data?.plans ?? []).filter((p) => game === "All" || p.game === game);

  return (
    <div className="xnt-page min-h-screen">
      <SiteHeader />
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 grid-bg opacity-20" />
        <div className="absolute inset-0 radial-glow opacity-70" />
        <div className="relative mx-auto max-w-7xl px-4 pb-10 pt-16 sm:px-6 lg:px-8">
          <div className="mb-4 inline-flex rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs text-primary">
            Plans beta XNT Servers
          </div>
          <h1 className="font-display text-4xl font-bold md:text-6xl">
            Pick your <span className="xnt-text-glow">neon stack</span>.
          </h1>
          <p className="text-muted-foreground mt-3 max-w-xl">
            Hardware-backed game servers with Stripe checkout and automatic Pterodactyl
            provisioning.
          </p>
          <div className="mt-8 flex flex-wrap gap-2">
            {games.map((g) => (
              <button
                key={g}
                onClick={() => setGame(g)}
                className={`px-4 py-2 rounded-full text-sm border transition-colors ${
                  game === g
                    ? "border-primary bg-primary text-primary-foreground shadow-[0_0_24px_rgba(0,191,255,0.18)]"
                    : "border-primary/15 bg-surface/80 text-muted-foreground hover:border-primary/40 hover:text-foreground"
                }`}
              >
                {g}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 pb-24 sm:px-6 lg:px-8">
        {isLoading ? (
          <div className="text-muted-foreground">Loading plans…</div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {visible.map((p) => (
              <div key={p.id} className="xnt-card xnt-card-hover flex flex-col rounded-xl p-6">
                <div className="text-xs uppercase tracking-wider text-primary">{p.game}</div>
                <div className="font-display text-2xl font-bold mt-1">{p.name}</div>
                <p className="text-sm text-muted-foreground mt-2 min-h-10">{p.description}</p>
                <div className="font-display text-4xl mt-6">
                  <span className="xnt-text-glow">${(p.price_monthly_cents / 100).toFixed(2)}</span>
                  <span className="text-sm text-muted-foreground font-sans">/mo</span>
                </div>
                <ul className="mt-6 space-y-2 text-sm">
                  {[
                    `${(p.ram_mb / 1024).toFixed(0)} GB DDR5 RAM`,
                    `${p.cpu_percent}% Ryzen 7950X`,
                    `${(p.disk_mb / 1024).toFixed(0)} GB NVMe SSD`,
                    "DDoS protection",
                    "Full Pterodactyl panel",
                    "Daily backups",
                  ].map((f) => (
                    <li key={f} className="flex items-center gap-2 text-muted-foreground">
                      <Check className="h-4 w-4 text-primary" /> {f}
                    </li>
                  ))}
                </ul>
                <Button
                  className="mt-6 bg-primary text-primary-foreground shadow-[0_0_28px_rgba(0,191,255,0.22)] hover:bg-primary/90"
                  disabled={checkout.isPending}
                  onClick={() => {
                    if (!user) navigate({ to: "/auth", search: { redirect: "/pricing" } as never });
                    else checkout.mutate(p.id);
                  }}
                >
                  {checkout.isPending ? "Redirecting…" : `Commander ${p.name}`}
                </Button>
              </div>
            ))}
          </div>
        )}

        {!isLoading && visible.length === 0 && (
          <div className="text-muted-foreground">No plans available for this game yet.</div>
        )}
      </section>
      <SiteFooter />
    </div>
  );
}
