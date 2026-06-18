import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Download, Filter, PackageSearch, Search, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { listPublicModpackCatalog } from "@/lib/modpacks.functions";

export const Route = createFileRoute("/modpacks")({
  head: () => ({
    meta: [
      { title: "Modpacks Minecraft validés · XNT Servers" },
      {
        name: "description",
        content:
          "Explore les modpacks Minecraft validés par XNT Servers, filtre par loader et version, puis crée ton serveur en quelques clics.",
      },
    ],
  }),
  component: ModpacksCatalog,
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

function ModpacksCatalog() {
  const fetchCatalog = useServerFn(listPublicModpackCatalog);
  const { data, isLoading, error } = useQuery({
    queryKey: ["public-modpack-catalog"],
    queryFn: () => fetchCatalog(),
  });
  const modpacks = useMemo(() => (data?.modpacks ?? []) as PublicModpack[], [data?.modpacks]);
  const [search, setSearch] = useState("");
  const [loader, setLoader] = useState("all");
  const [minecraftVersion, setMinecraftVersion] = useState("all");
  const [featuredOnly, setFeaturedOnly] = useState(false);
  const [compatibleOnly, setCompatibleOnly] = useState(false);
  const [sort, setSort] = useState<"popular" | "name" | "recent" | "featured">("popular");

  const loaders = useMemo(
    () =>
      Array.from(
        new Set(
          modpacks
            .map((modpack) => modpack.primary_loader)
            .filter((value): value is string => Boolean(value)),
        ),
      ).sort(),
    [modpacks],
  );
  const versions = useMemo(
    () =>
      Array.from(
        new Set(
          modpacks
            .map((modpack) => modpack.primary_minecraft_version)
            .filter((value): value is string => Boolean(value)),
        ),
      ).sort((a, b) => b.localeCompare(a, undefined, { numeric: true })),
    [modpacks],
  );

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    const rows = modpacks.filter((modpack) => {
      const haystack =
        `${modpack.name} ${modpack.summary ?? ""} ${modpack.slug ?? ""}`.toLowerCase();
      if (query && !haystack.includes(query)) return false;
      if (loader !== "all" && modpack.primary_loader !== loader) return false;
      if (minecraftVersion !== "all" && modpack.primary_minecraft_version !== minecraftVersion)
        return false;
      if (featuredOnly && !modpack.is_featured) return false;
      if (compatibleOnly && modpack.active_versions_count === 0) return false;
      return true;
    });
    return [...rows].sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name);
      if (sort === "featured") return Number(b.is_featured) - Number(a.is_featured);
      if (sort === "recent") return b.id.localeCompare(a.id);
      return (b.download_count ?? 0) - (a.download_count ?? 0);
    });
  }, [compatibleOnly, featuredOnly, loader, minecraftVersion, modpacks, search, sort]);

  return (
    <div className="xnt-page min-h-screen">
      <SiteHeader />
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 grid-bg opacity-20" />
        <div className="absolute inset-0 radial-glow opacity-70" />
        <div className="relative mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs text-primary">
            <Sparkles className="h-3.5 w-3.5" />
            Catalogue XNT validé
          </div>
          <div className="mt-5 grid gap-6 lg:grid-cols-[1fr_0.55fr] lg:items-end">
            <div>
              <h1 className="font-display text-4xl font-bold md:text-6xl">
                Découvre ton prochain <span className="xnt-text-glow">modpack</span>.
              </h1>
              <p className="mt-4 max-w-2xl text-muted-foreground">
                Parcours les modpacks Minecraft approuvés par XNT, choisis une version compatible et
                lance la commande depuis un parcours sécurisé.
              </p>
            </div>
            <div className="xnt-panel rounded-xl p-4">
              <div className="text-sm text-muted-foreground">Catalogue actif</div>
              <div className="mt-2 font-display text-4xl font-bold text-primary">
                {modpacks.length}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                Modpacks avec version et template serveur validés.
              </div>
            </div>
          </div>
        </div>
      </section>

      <main className="mx-auto max-w-7xl px-4 pb-20 sm:px-6 lg:px-8">
        <div className="xnt-card mb-6 rounded-xl p-4">
          <div className="grid gap-3 lg:grid-cols-[1fr_repeat(4,minmax(0,180px))]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Rechercher par nom, résumé ou slug..."
                className="pl-9"
              />
            </div>
            <select
              value={loader}
              onChange={(event) => setLoader(event.target.value)}
              className="rounded-md border border-border bg-background px-3 py-2 text-sm"
            >
              <option value="all">Tous loaders</option>
              {loaders.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
            <select
              value={minecraftVersion}
              onChange={(event) => setMinecraftVersion(event.target.value)}
              className="rounded-md border border-border bg-background px-3 py-2 text-sm"
            >
              <option value="all">Toutes versions</option>
              {versions.map((item) => (
                <option key={item} value={item}>
                  Minecraft {item}
                </option>
              ))}
            </select>
            <select
              value={sort}
              onChange={(event) => setSort(event.target.value as typeof sort)}
              className="rounded-md border border-border bg-background px-3 py-2 text-sm"
            >
              <option value="popular">Popularité</option>
              <option value="featured">Featured</option>
              <option value="name">Nom</option>
              <option value="recent">Récent</option>
            </select>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setFeaturedOnly((value) => !value);
                setCompatibleOnly(false);
              }}
              className={featuredOnly ? "border-primary bg-primary/10" : ""}
            >
              <Filter className="mr-2 h-4 w-4" />
              Featured
            </Button>
          </div>
          <label className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={compatibleOnly}
              onChange={(event) => setCompatibleOnly(event.target.checked)}
              className="accent-[color:var(--primary)]"
            />
            Compatible avec un plan actif XNT
          </label>
        </div>

        {isLoading && <ModpackSkeleton />}
        {error && <div className="text-sm text-destructive">{(error as Error).message}</div>}
        {!isLoading && filtered.length === 0 && (
          <div className="xnt-card rounded-xl p-8 text-center text-muted-foreground">
            Aucun modpack ne correspond à ces filtres.
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((modpack) => (
            <ModpackCard key={modpack.id} modpack={modpack} />
          ))}
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}

function ModpackCard({ modpack }: { modpack: PublicModpack }) {
  const detailTarget = modpack.slug ?? modpack.id;
  return (
    <article className="xnt-card xnt-card-hover flex h-full flex-col overflow-hidden rounded-xl">
      <div className="flex gap-4 p-5">
        {modpack.logo_url ? (
          <img src={modpack.logo_url} alt="" className="h-20 w-20 rounded-xl object-cover" />
        ) : (
          <div className="grid h-20 w-20 shrink-0 place-items-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
            <PackageSearch className="h-8 w-8" />
          </div>
        )}
        <div className="min-w-0">
          <div className="flex flex-wrap gap-2">
            {modpack.is_featured && <Badge>Featured</Badge>}
            {modpack.has_server_pack && <Badge variant="outline">Server Pack</Badge>}
          </div>
          <h2 className="mt-2 line-clamp-2 font-display text-xl font-semibold">{modpack.name}</h2>
          <div className="mt-1 flex items-center gap-1 text-xs text-primary">
            <Download className="h-3.5 w-3.5" />
            {modpack.download_count?.toLocaleString() ?? "—"} téléchargements
          </div>
        </div>
      </div>
      <div className="flex flex-1 flex-col px-5 pb-5">
        <p className="line-clamp-3 text-sm leading-6 text-muted-foreground">
          {modpack.summary ?? "Modpack validé par l’équipe XNT."}
        </p>
        <div className="mt-4 flex flex-wrap gap-2 text-xs">
          <span className="rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-primary">
            {modpack.primary_loader ?? "Loader auto"}
          </span>
          <span className="rounded-full border border-accent/20 bg-accent/10 px-2.5 py-1 text-accent">
            MC {modpack.primary_minecraft_version ?? "multi-version"}
          </span>
          <span className="rounded-full border border-border bg-background/40 px-2.5 py-1 text-muted-foreground">
            {modpack.active_versions_count} version(s)
          </span>
        </div>
        <Button asChild className="mt-5 bg-primary text-primary-foreground hover:bg-primary/90">
          <Link to={"/modpacks/$slug" as never} params={{ slug: detailTarget } as never}>
            Voir le modpack
          </Link>
        </Button>
      </div>
    </article>
  );
}

function ModpackSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }).map((_, index) => (
        <div key={index} className="xnt-card rounded-xl p-5">
          <div className="flex gap-4">
            <div className="h-20 w-20 animate-pulse rounded-xl bg-primary/10" />
            <div className="flex-1 space-y-3">
              <div className="h-4 w-24 animate-pulse rounded bg-primary/10" />
              <div className="h-6 w-3/4 animate-pulse rounded bg-primary/10" />
            </div>
          </div>
          <div className="mt-5 h-20 animate-pulse rounded bg-primary/10" />
        </div>
      ))}
    </div>
  );
}
