import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowLeft,
  Download,
  HardDrive,
  PackageSearch,
  Rocket,
  Server,
  Sparkles,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { getPublicModpack, getRelatedModpacks } from "@/lib/modpacks.functions";

export const Route = createFileRoute("/modpacks/$slug")({
  head: ({ params }) => ({
    meta: [
      { title: `${params.slug} · Modpack XNT Servers` },
      {
        name: "description",
        content: "Détails, versions et plans compatibles pour ce modpack Minecraft validé par XNT.",
      },
    ],
  }),
  component: ModpackDetail,
});

type PublicModpack = {
  id: string;
  slug: string | null;
  name: string;
  summary: string | null;
  logo_url: string | null;
  download_count: number | null;
  is_featured: boolean;
  primary_loader: string | null;
  primary_minecraft_version: string | null;
  has_server_pack: boolean;
  active_versions_count: number;
  game_catalog?: { name?: string | null } | null;
};

type PublicVersion = {
  id: string;
  display_name: string;
  minecraft_versions: string[];
  loaders: string[];
  server_pack_file_id: number | null;
  is_server_pack: boolean;
  file_date: string | null;
  file_length: number | null;
};

type CompatiblePlan = {
  plan: {
    id: string;
    name: string;
    game: string;
    price_monthly_cents: number;
    ram_mb: number;
    cpu_percent: number;
    disk_mb: number;
  };
  templateLabel: string;
  templateVersion: string | null;
  recommendedRamMb: number | null;
};

function ModpackDetail() {
  const { slug } = Route.useParams();
  const fetchModpack = useServerFn(getPublicModpack);
  const fetchRelated = useServerFn(getRelatedModpacks);
  const detailQ = useQuery({
    queryKey: ["public-modpack", slug],
    queryFn: () => fetchModpack({ data: { idOrSlug: slug } }),
  });
  const relatedQ = useQuery({
    queryKey: ["related-modpacks", slug],
    queryFn: () => fetchRelated({ data: { idOrSlug: slug } }),
  });
  const modpack = detailQ.data?.modpack as PublicModpack | null | undefined;
  const versions = useMemo(
    () => (detailQ.data?.versions ?? []) as PublicVersion[],
    [detailQ.data?.versions],
  );
  const plans = useMemo(
    () => (detailQ.data?.plans ?? []) as CompatiblePlan[],
    [detailQ.data?.plans],
  );
  const [selectedVersionId, setSelectedVersionId] = useState("");

  const selectedVersion = useMemo(
    () => versions.find((version) => version.id === selectedVersionId) ?? versions[0],
    [selectedVersionId, versions],
  );

  if (detailQ.isLoading) {
    return (
      <div className="xnt-page min-h-screen">
        <SiteHeader />
        <main className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <div className="xnt-card rounded-xl p-8 text-muted-foreground">
            Chargement du modpack…
          </div>
        </main>
      </div>
    );
  }

  if (!modpack) {
    return (
      <div className="xnt-page min-h-screen">
        <SiteHeader />
        <main className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <div className="xnt-card rounded-xl p-8">
            <h1 className="font-display text-3xl font-bold">Modpack indisponible</h1>
            <p className="mt-2 text-muted-foreground">
              Ce modpack n’est pas actif ou n’a pas encore de template serveur validé.
            </p>
            <Button asChild className="mt-6">
              <Link to={"/modpacks" as never}>Retour au catalogue</Link>
            </Button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="xnt-page min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <Button asChild variant="ghost" className="mb-6">
          <Link to={"/modpacks" as never}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Catalogue modpacks
          </Link>
        </Button>

        <section className="grid gap-6 lg:grid-cols-[0.85fr_1fr] lg:items-start">
          <div className="xnt-card overflow-hidden rounded-2xl p-6">
            <div className="flex flex-col gap-5 sm:flex-row">
              {modpack.logo_url ? (
                <img
                  src={modpack.logo_url}
                  alt=""
                  className="h-32 w-32 rounded-2xl object-cover shadow-[0_0_34px_rgba(0,191,255,0.16)]"
                />
              ) : (
                <div className="grid h-32 w-32 shrink-0 place-items-center rounded-2xl border border-primary/20 bg-primary/10 text-primary">
                  <PackageSearch className="h-12 w-12" />
                </div>
              )}
              <div className="min-w-0">
                <div className="flex flex-wrap gap-2">
                  {modpack.is_featured && <Badge>Featured</Badge>}
                  {modpack.has_server_pack && (
                    <Badge variant="outline">Server Pack Available</Badge>
                  )}
                  <Badge variant="outline">{modpack.game_catalog?.name ?? "Minecraft"}</Badge>
                </div>
                <h1 className="mt-4 font-display text-4xl font-bold md:text-5xl">{modpack.name}</h1>
                <div className="mt-3 flex flex-wrap gap-3 text-sm text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <Download className="h-4 w-4 text-primary" />
                    {modpack.download_count?.toLocaleString() ?? "—"} téléchargements
                  </span>
                  <span>{modpack.primary_loader ?? "Loader auto"}</span>
                  <span>MC {modpack.primary_minecraft_version ?? "multi-version"}</span>
                </div>
              </div>
            </div>
            <p className="mt-6 leading-7 text-muted-foreground">
              {modpack.summary ?? "Modpack Minecraft validé par l’équipe XNT."}
            </p>
          </div>

          <div className="xnt-card rounded-2xl p-6">
            <div className="flex items-center gap-2 text-primary">
              <Rocket className="h-5 w-5" />
              <h2 className="font-display text-2xl font-semibold">Créer ce serveur</h2>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              Choisis une version validée, puis continue vers le tunnel de commande XNT.
            </p>

            <div className="mt-5 space-y-3">
              <label className="text-sm font-medium">Version disponible</label>
              <select
                value={selectedVersion?.id ?? ""}
                onChange={(event) => setSelectedVersionId(event.target.value)}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              >
                {versions.map((version) => (
                  <option key={version.id} value={version.id}>
                    {version.display_name}
                  </option>
                ))}
              </select>
              {selectedVersion && (
                <div className="rounded-lg border border-primary/15 bg-primary/5 p-3 text-sm text-muted-foreground">
                  Minecraft {selectedVersion.minecraft_versions.join(", ") || "—"} ·{" "}
                  {selectedVersion.loaders.join(", ") || "loader auto"}
                  {selectedVersion.file_length
                    ? ` · ${formatBytes(selectedVersion.file_length)}`
                    : ""}
                </div>
              )}
            </div>

            <Button
              asChild
              disabled={!selectedVersion || plans.length === 0}
              className="mt-5 w-full bg-primary text-primary-foreground shadow-[0_0_30px_rgba(0,191,255,0.24)] hover:bg-primary/90"
            >
              <Link
                to={"/deploy" as never}
                search={
                  {
                    type: "modpack",
                    modpack: modpack.id,
                    version: selectedVersion?.id,
                  } as never
                }
              >
                Créer ce serveur
              </Link>
            </Button>
            {plans.length === 0 && (
              <div className="mt-3 text-sm text-muted-foreground">
                Aucun plan compatible n’est actif pour ce modpack.
              </div>
            )}
          </div>
        </section>

        <section className="mt-8 grid gap-6 lg:grid-cols-[1fr_0.7fr]">
          <div className="xnt-card rounded-xl p-6">
            <h2 className="font-display text-2xl font-semibold">Versions validées</h2>
            <div className="mt-4 grid gap-3">
              {versions.map((version) => (
                <button
                  key={version.id}
                  type="button"
                  onClick={() => setSelectedVersionId(version.id)}
                  className={`rounded-lg border p-4 text-left transition-colors ${
                    selectedVersion?.id === version.id
                      ? "border-primary bg-primary/10"
                      : "border-border/70 bg-background/20 hover:border-primary/40"
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="font-medium">{version.display_name}</div>
                    {version.is_server_pack || version.server_pack_file_id ? (
                      <Badge variant="outline">Server Pack</Badge>
                    ) : null}
                  </div>
                  <div className="mt-2 text-xs text-muted-foreground">
                    Minecraft {version.minecraft_versions.join(", ") || "—"} ·{" "}
                    {version.loaders.join(", ") || "loader auto"}
                    {version.file_date
                      ? ` · ${new Date(version.file_date).toLocaleDateString()}`
                      : ""}
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="xnt-card rounded-xl p-6">
            <h2 className="font-display text-2xl font-semibold">Plans compatibles</h2>
            <div className="mt-4 space-y-3">
              {plans.length === 0 ? (
                <div className="rounded-lg border border-border/70 bg-background/30 p-4 text-sm text-muted-foreground">
                  Compatibilité en cours de validation.
                </div>
              ) : (
                plans.map((item) => (
                  <div
                    key={item.plan.id}
                    className="rounded-lg border border-border/70 bg-background/30 p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-medium">{item.plan.name}</div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {item.templateLabel}
                          {item.templateVersion ? ` · ${item.templateVersion}` : ""}
                        </div>
                      </div>
                      <div className="font-display text-lg text-primary">
                        ${(item.plan.price_monthly_cents / 100).toFixed(2)}
                      </div>
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-2 text-xs text-muted-foreground">
                      <span>{(item.plan.ram_mb / 1024).toFixed(0)} GB RAM</span>
                      <span>{item.plan.cpu_percent}% CPU</span>
                      <span>{(item.plan.disk_mb / 1024).toFixed(0)} GB SSD</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>

        {(relatedQ.data?.modpacks ?? []).length > 0 && (
          <section className="mt-8">
            <div className="mb-4 flex items-center gap-2 text-primary">
              <Sparkles className="h-5 w-5" />
              <h2 className="font-display text-2xl font-semibold text-foreground">
                Modpacks associés
              </h2>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {((relatedQ.data?.modpacks ?? []) as PublicModpack[]).map((item) => (
                <Link
                  key={item.id}
                  to={"/modpacks/$slug" as never}
                  params={{ slug: item.slug ?? item.id } as never}
                  className="xnt-card xnt-card-hover rounded-xl p-4"
                >
                  <div className="flex items-center gap-3">
                    {item.logo_url ? (
                      <img
                        src={item.logo_url}
                        alt=""
                        className="h-14 w-14 rounded-lg object-cover"
                      />
                    ) : (
                      <div className="grid h-14 w-14 place-items-center rounded-lg border border-primary/20 bg-primary/10">
                        <Server className="h-6 w-6 text-primary" />
                      </div>
                    )}
                    <div>
                      <div className="font-medium">{item.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {item.primary_loader ?? "Loader auto"} · MC{" "}
                        {item.primary_minecraft_version ?? "multi-version"}
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}

function formatBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "—";
  const units = ["B", "KB", "MB", "GB"];
  let amount = value;
  let unit = 0;
  while (amount >= 1024 && unit < units.length - 1) {
    amount /= 1024;
    unit += 1;
  }
  return `${amount.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}
