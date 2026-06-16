import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight, Cpu, Gauge, HardDrive, Shield, Sparkles, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { listPlans } from "@/lib/plans.functions";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "XNT Servers — Premium game server hosting" },
      {
        name: "description",
        content:
          "Premium gaming server hosting with Stripe checkout, automatic XNT server preparation, NVMe storage and a modern dashboard.",
      },
    ],
  }),
  component: Home,
});

const GAMES = [
  { name: "Minecraft", tag: "Paper, Forge, Bungee", tone: "from-primary/30 to-primary/0" },
  { name: "ARK", tag: "Survival clusters", tone: "from-accent/30 to-accent/0" },
  { name: "Conan Exiles", tag: "PvP & PvE worlds", tone: "from-secondary/35 to-secondary/0" },
  { name: "Garry's Mod", tag: "Sandbox & DarkRP", tone: "from-primary/20 to-accent/0" },
];

function Home() {
  const fetchPlans = useServerFn(listPlans);
  const { data } = useQuery({ queryKey: ["plans-preview"], queryFn: () => fetchPlans() });
  const featured = (data?.plans ?? []).slice(0, 3);

  return (
    <div className="xnt-page min-h-screen">
      <SiteHeader />

      <section className="relative overflow-hidden">
        <div className="absolute inset-0 grid-bg opacity-25" />
        <div className="absolute inset-0 radial-glow" />
        <div className="relative mx-auto grid min-h-[calc(100vh-4rem)] max-w-7xl items-center gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[1fr_0.9fr] lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55 }}
            className="max-w-3xl"
          >
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs text-primary shadow-[0_0_26px_rgba(0,191,255,0.12)]">
              <span className="h-1.5 w-1.5 rounded-full bg-primary shadow-[0_0_16px_rgba(0,191,255,0.9)]" />
              Stripe paid, XNT prepared, ready to play
            </div>
            <h1 className="font-display text-5xl font-bold leading-[1.04] sm:text-6xl lg:text-7xl">
              Premium game servers,
              <span className="block xnt-text-glow">deployed at neon speed.</span>
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-muted-foreground">
              XNT Servers combines a polished SaaS dashboard with automatic server preparation for
              Minecraft, ARK, Conan Exiles and Garry's Mod communities.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button
                asChild
                size="lg"
                className="h-12 bg-primary px-6 text-primary-foreground shadow-[0_0_34px_rgba(0,191,255,0.28)] hover:bg-primary/90"
              >
                <Link to="/pricing">
                  View plans <ArrowRight className="ml-1 h-4 w-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="h-12 border-primary/25 px-6">
                <Link to="/auth">Open dashboard</Link>
              </Button>
            </div>

            <div className="mt-12 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                ["99.9%", "Uptime target"],
                ["<60s", "Provisioning"],
                ["NVMe", "Storage"],
                ["24/7", "Monitoring"],
              ].map(([value, label]) => (
                <div key={label} className="xnt-panel rounded-lg p-4">
                  <div className="font-display text-2xl font-bold text-primary">{value}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{label}</div>
                </div>
              ))}
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.7, delay: 0.1 }}
            className="xnt-hero-visual rounded-2xl"
          >
            <span className="xnt-rack" />
            <span className="xnt-rack" />
            <span className="xnt-rack" />
            <span className="xnt-rack" />
            <div className="absolute left-6 right-6 top-6 flex items-center justify-between">
              <div>
                <div className="text-xs uppercase tracking-[0.22em] text-primary">XNT Core</div>
                <div className="font-display text-2xl font-bold">Gaming Datacenter</div>
              </div>
              <div className="rounded-full border border-success/30 bg-success/10 px-3 py-1 text-xs text-success">
                Online
              </div>
            </div>
            <div className="absolute bottom-6 left-6 right-6 grid grid-cols-3 gap-3">
              {[
                ["CPU", "Ryzen"],
                ["DDoS", "Edge"],
                ["Console", "Live"],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="rounded-lg border border-white/10 bg-background/55 p-3 backdrop-blur"
                >
                  <div className="text-xs text-muted-foreground">{label}</div>
                  <div className="font-display text-lg font-semibold text-primary">{value}</div>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
        <div className="mb-10 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="font-display text-3xl font-bold sm:text-4xl">Jeux supportés</h2>
            <p className="mt-2 text-muted-foreground">
              Des presets prêts pour les communautés exigeantes.
            </p>
          </div>
          <Button asChild variant="outline">
            <Link to="/pricing">Comparer les plans</Link>
          </Button>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {GAMES.map((game) => (
            <div
              key={game.name}
              className="xnt-card xnt-card-hover relative overflow-hidden rounded-xl p-6"
            >
              <div className={`absolute inset-0 bg-gradient-to-br ${game.tone}`} />
              <div className="relative">
                <Sparkles className="mb-8 h-5 w-5 text-primary" />
                <div className="font-display text-xl font-bold">{game.name}</div>
                <div className="mt-1 text-sm text-muted-foreground">{game.tag}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
        <div className="grid gap-4 md:grid-cols-3">
          {[
            [
              Zap,
              "Provisioning automatique",
              "Paiement validé, commande activée, serveur préparé automatiquement sur l’infrastructure XNT.",
            ],
            [
              Shield,
              "Sécurité SaaS",
              "RLS Supabase, webhooks idempotents, secrets côté serveur et retry admin contrôlé.",
            ],
            [
              Gauge,
              "Dashboard complet",
              "Console, fichiers, variables, SFTP, factures, support et monitoring admin.",
            ],
            [
              Cpu,
              "Hardware gaming",
              "CPU haute fréquence, limites claires et ports réseau préparés automatiquement.",
            ],
            [
              HardDrive,
              "NVMe & backups",
              "Stockage rapide, gestion fichiers robuste et protections sur fichiers sensibles.",
            ],
            [
              Sparkles,
              "Expérience premium",
              "Interface sombre, néon bleu/violet, états lisibles et parcours beta propres.",
            ],
          ].map(([Icon, title, body]) => (
            <div key={String(title)} className="xnt-card rounded-xl p-6">
              <Icon className="h-5 w-5 text-primary" />
              <h3 className="mt-5 font-display text-lg font-semibold">{title as string}</h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{body as string}</p>
            </div>
          ))}
        </div>
      </section>

      {featured.length > 0 && (
        <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
          <div className="mb-10">
            <h2 className="font-display text-3xl font-bold sm:text-4xl">Plans populaires</h2>
            <p className="mt-2 text-muted-foreground">
              Une base claire pour lancer une bêta privée.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {featured.map((plan) => (
              <div key={plan.id} className="xnt-card xnt-card-hover rounded-xl p-6">
                <div className="text-xs uppercase tracking-[0.18em] text-primary">{plan.game}</div>
                <div className="mt-2 font-display text-2xl font-bold">{plan.name}</div>
                <div className="mt-5 font-display text-4xl font-bold">
                  ${(plan.price_monthly_cents / 100).toFixed(2)}
                  <span className="text-sm font-normal text-muted-foreground">/mo</span>
                </div>
                <div className="mt-4 text-sm text-muted-foreground">
                  {(plan.ram_mb / 1024).toFixed(0)} GB RAM · {plan.cpu_percent}% CPU ·{" "}
                  {(plan.disk_mb / 1024).toFixed(0)} GB NVMe
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <SiteFooter />
    </div>
  );
}
