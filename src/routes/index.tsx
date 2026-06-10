import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight, Cpu, Gauge, Shield, Zap, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { listPlans } from "@/lib/plans.functions";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "XntServers — Game servers, instantly deployed" },
      { name: "description", content: "Premium hosting for Minecraft, ARK, Conan Exiles & Garry's Mod. NVMe SSD, DDoS protection, 99.9% uptime." },
    ],
  }),
  component: Home,
});

const GAMES = [
  { name: "Minecraft", tag: "Java & Bedrock", color: "from-emerald-500/20 to-emerald-500/0" },
  { name: "Conan Exiles", tag: "PvP & PvE", color: "from-orange-500/20 to-orange-500/0" },
  { name: "ARK", tag: "Survival Evolved", color: "from-cyan-500/20 to-cyan-500/0" },
  { name: "Garry's Mod", tag: "Sandbox & DarkRP", color: "from-violet-500/20 to-violet-500/0" },
];

function Home() {
  const fetchPlans = useServerFn(listPlans);
  const { data } = useQuery({ queryKey: ["plans-preview"], queryFn: () => fetchPlans() });
  const featured = (data?.plans ?? []).slice(0, 3);

  return (
    <div className="min-h-screen">
      <SiteHeader />

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 grid-bg opacity-40" />
        <div className="absolute inset-0 radial-glow" />
        <div className="relative mx-auto max-w-6xl px-6 pt-20 pb-28">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs text-primary mb-6">
              <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" /> Live deployment in under 60 seconds
            </div>
            <h1 className="font-display text-5xl md:text-7xl font-bold leading-[1.05]">
              Spin up game servers <span className="text-primary">at light speed</span>.
            </h1>
            <p className="mt-6 max-w-xl text-lg text-muted-foreground">
              Minecraft, ARK, Conan Exiles, Garry's Mod — pick a plan, name your server, and play. We handle the infrastructure.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg" className="bg-primary text-primary-foreground hover:bg-primary/90 glow-primary h-12 px-6">
                <Link to="/pricing">Browse plans <ArrowRight className="ml-2 h-4 w-4" /></Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="h-12 px-6">
                <Link to="/auth">Sign in</Link>
              </Button>
            </div>
          </motion.div>

          {/* Stats */}
          <div className="mt-20 grid grid-cols-2 md:grid-cols-4 gap-px overflow-hidden rounded-xl border border-border/60 bg-border/60">
            {[
              { label: "Uptime", value: "99.9%" },
              { label: "Avg deploy", value: "42s" },
              { label: "Locations", value: "8" },
              { label: "Servers run", value: "12k+" },
            ].map((s) => (
              <div key={s.label} className="bg-surface p-6">
                <div className="font-display text-3xl font-bold text-primary">{s.value}</div>
                <div className="text-sm text-muted-foreground mt-1">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Games */}
      <section className="mx-auto max-w-6xl px-6 py-20">
        <div className="flex items-end justify-between mb-10">
          <div>
            <h2 className="font-display text-3xl md:text-4xl font-bold">Supported games</h2>
            <p className="text-muted-foreground mt-2">More titles added every month.</p>
          </div>
          <Link to="/pricing" className="hidden md:inline-flex items-center text-sm text-primary hover:underline">
            All plans <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {GAMES.map((g) => (
            <motion.div
              key={g.name}
              whileHover={{ y: -4 }}
              className="group relative overflow-hidden rounded-xl border border-border/60 bg-surface p-6 cursor-default"
            >
              <div className={`absolute inset-0 bg-gradient-to-br ${g.color} opacity-0 group-hover:opacity-100 transition-opacity`} />
              <div className="relative">
                <div className="font-display text-xl font-bold">{g.name}</div>
                <div className="text-sm text-muted-foreground mt-1">{g.tag}</div>
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-6xl px-6 py-20">
        <div className="grid md:grid-cols-3 gap-4">
          {[
            { icon: Zap, title: "Instant deploy", body: "Provisioned via Pterodactyl. Live the moment payment clears." },
            { icon: Shield, title: "DDoS protected", body: "Always-on mitigation at the edge — no extra config." },
            { icon: Cpu, title: "Ryzen 7950X", body: "Dedicated cores, NVMe storage, DDR5 memory." },
            { icon: Gauge, title: "Full panel", body: "Console, files, backups, schedulers — your own dashboard." },
            { icon: Shield, title: "Auto backups", body: "Daily snapshots retained for 7 days on every plan." },
            { icon: Zap, title: "Cancel anytime", body: "Month-to-month, no contracts, no nonsense." },
          ].map((f) => (
            <div key={f.title} className="rounded-xl border border-border/60 bg-surface p-6">
              <f.icon className="h-5 w-5 text-primary" />
              <h3 className="font-display text-lg font-semibold mt-4">{f.title}</h3>
              <p className="text-sm text-muted-foreground mt-1">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Featured plans */}
      {featured.length > 0 && (
        <section className="mx-auto max-w-6xl px-6 py-20">
          <h2 className="font-display text-3xl md:text-4xl font-bold mb-10">Popular plans</h2>
          <div className="grid md:grid-cols-3 gap-4">
            {featured.map((p) => (
              <div key={p.id} className="rounded-xl border border-border/60 bg-surface p-6">
                <div className="text-xs uppercase tracking-wider text-primary">{p.game}</div>
                <div className="font-display text-2xl font-bold mt-1">{p.name}</div>
                <div className="font-display text-3xl mt-4">${(p.price_monthly_cents / 100).toFixed(2)}<span className="text-sm text-muted-foreground font-sans">/mo</span></div>
                <div className="text-sm text-muted-foreground mt-3">{(p.ram_mb / 1024).toFixed(0)} GB RAM · {p.cpu_percent}% CPU · {(p.disk_mb / 1024).toFixed(0)} GB SSD</div>
              </div>
            ))}
          </div>
          <div className="mt-8">
            <Button asChild variant="outline"><Link to="/pricing">View all plans</Link></Button>
          </div>
        </section>
      )}

      <SiteFooter />
    </div>
  );
}
