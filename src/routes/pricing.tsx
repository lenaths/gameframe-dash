import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { listPlans } from "@/lib/plans.functions";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/pricing")({
  head: () => ({
    meta: [
      { title: "Pricing — NexusHost game server hosting" },
      { name: "description", content: "Transparent monthly pricing for Minecraft, ARK, Conan Exiles and Garry's Mod servers. Pick a plan and deploy." },
    ],
  }),
  component: Pricing,
});

function Pricing() {
  const fetchPlans = useServerFn(listPlans);
  const { user } = useAuth();
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({ queryKey: ["plans"], queryFn: () => fetchPlans() });
  const [game, setGame] = useState<string>("All");

  const games = useMemo(() => ["All", ...Array.from(new Set((data?.plans ?? []).map((p) => p.game)))], [data]);
  const visible = (data?.plans ?? []).filter((p) => game === "All" || p.game === game);

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 radial-glow opacity-60" />
        <div className="relative mx-auto max-w-6xl px-6 pt-16 pb-10">
          <h1 className="font-display text-4xl md:text-6xl font-bold">Pick your plan</h1>
          <p className="text-muted-foreground mt-3 max-w-xl">Hardware-backed game servers. No setup fees, cancel anytime.</p>
          <div className="mt-8 flex flex-wrap gap-2">
            {games.map((g) => (
              <button
                key={g}
                onClick={() => setGame(g)}
                className={`px-4 py-2 rounded-full text-sm border transition-colors ${
                  game === g
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-border bg-surface text-muted-foreground hover:text-foreground"
                }`}
              >
                {g}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 pb-24">
        {isLoading ? (
          <div className="text-muted-foreground">Loading plans…</div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {visible.map((p) => (
              <div key={p.id} className="rounded-xl border border-border/60 bg-surface p-6 flex flex-col">
                <div className="text-xs uppercase tracking-wider text-primary">{p.game}</div>
                <div className="font-display text-2xl font-bold mt-1">{p.name}</div>
                <p className="text-sm text-muted-foreground mt-2 min-h-10">{p.description}</p>
                <div className="font-display text-4xl mt-6">
                  ${(p.price_monthly_cents / 100).toFixed(2)}
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
                  className="mt-6 bg-primary text-primary-foreground hover:bg-primary/90"
                  onClick={() => {
                    if (!user) navigate({ to: "/auth", search: { redirect: "/deploy" } as never });
                    else navigate({ to: "/deploy", search: { plan: p.id } as never });
                  }}
                >
                  Deploy {p.name}
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
