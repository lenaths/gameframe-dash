import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { PackageSearch, Rocket, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SiteHeader } from "@/components/site-header";
import { EggVariablesForm } from "@/components/egg-variables-form";
import { findVersionVariable, getDeployOptions, listPlans } from "@/lib/plans.functions";
import {
  listAvailableModpacks,
  listAvailableModpackVersions,
  listCompatiblePlansForModpack,
} from "@/lib/modpacks.functions";
import { createCheckoutSession } from "@/lib/stripe.functions";
import { toast } from "sonner";

const searchSchema = z.object({
  plan: z.string().optional(),
  variant: z.coerce.number().int().min(0).optional(),
  type: z.enum(["classic", "modpack"]).optional(),
  modpack: z.string().optional(),
  version: z.string().optional(),
});

export const Route = createFileRoute("/_authenticated/deploy")({
  validateSearch: searchSchema,
  head: () => ({ meta: [{ title: "Deploy a server · XntServers" }] }),
  component: Deploy,
});

function Deploy() {
  const {
    plan: preselected,
    variant: preselectedVariant,
    type: preselectedType,
    modpack: preselectedModpack,
    version: preselectedVersion,
  } = Route.useSearch();
  const navigate = useNavigate();
  const fetchPlans = useServerFn(listPlans);
  const fetchOptions = useServerFn(getDeployOptions);
  const fetchModpacks = useServerFn(listAvailableModpacks);
  const fetchModpackVersions = useServerFn(listAvailableModpackVersions);
  const fetchCompatiblePlans = useServerFn(listCompatiblePlansForModpack);
  const startCheckout = useServerFn(createCheckoutSession);

  const { data: plansData } = useQuery({ queryKey: ["plans"], queryFn: () => fetchPlans() });
  const modpacksQ = useQuery({
    queryKey: ["available-modpacks"],
    queryFn: () => fetchModpacks(),
  });
  const [planId, setPlanId] = useState<string>(preselected ?? "");
  const [name, setName] = useState("");
  const [variantIndex, setVariantIndex] = useState(preselectedVariant ?? 0);
  const [env, setEnv] = useState<Record<string, string>>({});
  const [deployType, setDeployType] = useState<"classic" | "modpack">(
    preselectedType === "modpack" ? "modpack" : "classic",
  );
  const [modpackSearch, setModpackSearch] = useState("");
  const [selectedModpackId, setSelectedModpackId] = useState(preselectedModpack ?? "");
  const [selectedVersionId, setSelectedVersionId] = useState(preselectedVersion ?? "");
  const [maxPlayers, setMaxPlayers] = useState(10);

  const opts = useQuery({
    queryKey: ["deploy-options", planId],
    queryFn: () => fetchOptions({ data: { planId } }),
    enabled: !!planId,
  });
  const versionsQ = useQuery({
    queryKey: ["available-modpack-versions", selectedModpackId],
    queryFn: () => fetchModpackVersions({ data: { modpackId: selectedModpackId } }),
    enabled: deployType === "modpack" && !!selectedModpackId,
  });
  const compatiblePlansQ = useQuery({
    queryKey: ["compatible-modpack-plans", selectedModpackId],
    queryFn: () => fetchCompatiblePlans({ data: { modpackId: selectedModpackId } }),
    enabled: deployType === "modpack" && !!selectedModpackId,
  });

  // Reset variant + env when plan changes; seed env defaults when variant changes.
  useEffect(() => {
    if (deployType === "classic") setVariantIndex(0);
  }, [deployType, planId]);
  useEffect(() => {
    if (deployType === "modpack" && preselectedModpack) return;
    setSelectedModpackId("");
    setSelectedVersionId("");
    if (deployType === "modpack") {
      setPlanId("");
      setVariantIndex(0);
    }
  }, [deployType, preselectedModpack]);
  useEffect(() => {
    if (selectedModpackId === preselectedModpack && preselectedVersion) return;
    setSelectedVersionId("");
    setPlanId("");
    setVariantIndex(0);
  }, [preselectedModpack, preselectedVersion, selectedModpackId]);
  const currentVariant = opts.data?.variants[variantIndex];
  useEffect(() => {
    if (!currentVariant) return;
    const seed: Record<string, string> = {};
    for (const v of currentVariant.variables) seed[v.env_variable] = v.default_value ?? "";
    setEnv(seed);
  }, [currentVariant]);

  const checkout = useMutation({
    mutationFn: () =>
      startCheckout({
        data: {
          planId,
          serverName: name.trim(),
          variantIndex,
          environment: env,
          maxPlayers,
          selectedModpack:
            deployType === "modpack" && selectedModpackId && selectedVersionId
              ? { modpackId: selectedModpackId, versionId: selectedVersionId }
              : undefined,
        },
      }),
    onSuccess: ({ url }) => {
      window.location.assign(url);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const variants = useMemo(() => opts.data?.variants ?? [], [opts.data?.variants]);
  const serverTypeOptions = useMemo(
    () =>
      [
        { key: "vanilla", label: "Vanilla", description: "Expérience officielle Minecraft." },
        { key: "paper", label: "Paper", description: "Performance optimisée pour plugins." },
        { key: "purpur", label: "Purpur", description: "Réglages et performances avancés." },
        { key: "fabric", label: "Fabric", description: "Mods Fabric légers et modernes." },
        { key: "forge", label: "Forge", description: "Mods Forge classiques." },
        { key: "neoforge", label: "NeoForge", description: "Mods NeoForge récents." },
        { key: "quilt", label: "Quilt", description: "Mods Quilt." },
      ].map((option) => ({
        ...option,
        variant: variants.find((variant) => variant.templateKey === option.key),
      })),
    [variants],
  );
  const filteredModpacks = useMemo(() => {
    const query = modpackSearch.trim().toLowerCase();
    return (modpacksQ.data?.modpacks ?? []).filter((modpack) => {
      if (!query) return true;
      return `${modpack.name} ${modpack.summary ?? ""}`.toLowerCase().includes(query);
    });
  }, [modpackSearch, modpacksQ.data?.modpacks]);
  const selectedModpack = (modpacksQ.data?.modpacks ?? []).find(
    (modpack) => modpack.id === selectedModpackId,
  );
  const versions = versionsQ.data?.versions ?? [];
  const compatiblePlans = useMemo(
    () => compatiblePlansQ.data?.plans ?? [],
    [compatiblePlansQ.data?.plans],
  );
  const selectedPlan = (
    deployType === "modpack" ? compatiblePlans.map((item) => item.plan) : (plansData?.plans ?? [])
  ).find((plan) => plan.id === planId);
  const maxPlayersLimit = selectedPlan ? getMaxPlayersLimit(selectedPlan.ram_mb) : 10;
  const recommendedPlayers = selectedPlan ? getRecommendedPlayers(selectedPlan.ram_mb) : 10;
  const playerPrice = selectedPlan
    ? getPlayerPricing(
        selectedPlan.name,
        selectedPlan.ram_mb,
        selectedPlan.price_monthly_cents,
        maxPlayers,
      )
    : null;
  useEffect(() => {
    if (deployType !== "modpack" || planId || compatiblePlans.length === 0) return;
    const firstPlan = compatiblePlans[0];
    setPlanId(firstPlan.plan.id);
    setVariantIndex(firstPlan.variantIndex);
  }, [compatiblePlans, deployType, planId]);
  useEffect(() => {
    if (!selectedPlan) return;
    setMaxPlayers((current) => {
      if (current < 1 || current > maxPlayersLimit) return recommendedPlayers;
      return current;
    });
  }, [maxPlayersLimit, recommendedPlayers, selectedPlan]);
  const canSubmit =
    Boolean(planId) &&
    name.trim().length >= 2 &&
    !checkout.isPending &&
    !opts.isLoading &&
    (deployType === "classic" || Boolean(selectedModpackId && selectedVersionId));
  const versionVariable = currentVariant ? findVersionVariable(currentVariant.variables) : null;
  const advancedVariables =
    currentVariant?.variables.filter(
      (variable) => variable.env_variable !== versionVariable?.env_variable,
    ) ?? [];

  return (
    <div className="xnt-page min-h-screen">
      <SiteHeader />
      <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="mb-6 inline-flex rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs text-primary">
          Checkout powered by Stripe
        </div>
        <h1 className="font-display text-4xl font-bold">Créer un nouveau serveur</h1>
        <p className="text-muted-foreground mt-2">
          Choisis un plan, un template serveur et les paramètres avant paiement.
        </p>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (planId) checkout.mutate();
          }}
          className="xnt-card mt-8 space-y-6 rounded-2xl p-6"
        >
          <div className="space-y-2">
            <Label htmlFor="name">Nom du serveur</Label>
            <Input
              id="name"
              maxLength={40}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="The Adventurer's Guild"
            />
            <p className="text-xs text-muted-foreground">
              Obligatoire. 2 à 40 caractères, visible dans ton espace XNT.
            </p>
          </div>

          <div className="space-y-2">
            <Label>Type de déploiement</Label>
            <div className="grid gap-2 sm:grid-cols-2">
              {[
                {
                  id: "classic" as const,
                  title: "Serveur classique",
                  description: "Choisis directement un template serveur XNT.",
                },
                {
                  id: "modpack" as const,
                  title: "Modpack CurseForge",
                  description: "Sélectionne un modpack validé par l’équipe XNT.",
                },
              ].map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setDeployType(option.id)}
                  className={`rounded-lg border p-4 text-left transition-colors ${
                    deployType === option.id
                      ? "border-primary bg-primary/10 shadow-[0_0_24px_rgba(0,191,255,0.12)]"
                      : "border-border/70 bg-background/20 hover:border-primary/40"
                  }`}
                >
                  <div className="font-medium">{option.title}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{option.description}</div>
                </button>
              ))}
            </div>
          </div>

          {deployType === "modpack" && (
            <div className="space-y-5 rounded-xl border border-primary/15 bg-background/30 p-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <Label>Catalogue modpacks validés</Label>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Aucun appel externe n’est effectué ici : seuls les modpacks approuvés par XNT
                    sont proposés.
                  </p>
                </div>
                <div className="relative sm:w-72">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={modpackSearch}
                    onChange={(e) => setModpackSearch(e.target.value)}
                    placeholder="Rechercher localement..."
                    className="pl-9"
                  />
                </div>
              </div>

              {modpacksQ.isLoading && (
                <div className="text-sm text-muted-foreground">Chargement du catalogue…</div>
              )}
              {modpacksQ.error && (
                <div className="text-sm text-destructive">{(modpacksQ.error as Error).message}</div>
              )}
              {!modpacksQ.isLoading && filteredModpacks.length === 0 && (
                <div className="rounded-lg border border-border/70 bg-background/30 p-5 text-sm text-muted-foreground">
                  Aucun modpack validé disponible pour le moment.
                </div>
              )}
              {filteredModpacks.length > 0 && (
                <div className="grid gap-3 md:grid-cols-2">
                  {filteredModpacks.map((modpack) => (
                    <button
                      key={modpack.id}
                      type="button"
                      onClick={() => setSelectedModpackId(modpack.id)}
                      className={`flex gap-3 rounded-lg border p-3 text-left transition-colors ${
                        selectedModpackId === modpack.id
                          ? "border-primary bg-primary/10"
                          : "border-border/70 bg-background/20 hover:border-primary/40"
                      }`}
                    >
                      {modpack.logo_url ? (
                        <img
                          src={modpack.logo_url}
                          alt=""
                          className="h-14 w-14 rounded-lg object-cover"
                        />
                      ) : (
                        <div className="grid h-14 w-14 shrink-0 place-items-center rounded-lg border border-primary/20 bg-primary/10 text-primary">
                          <PackageSearch className="h-6 w-6" />
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="font-medium">{modpack.name}</div>
                        <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                          {modpack.summary ?? "Modpack validé par XNT."}
                        </div>
                        <div className="mt-2 text-xs text-primary">
                          {modpack.download_count?.toLocaleString() ?? "—"} téléchargements
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {selectedModpack && (
                <div className="space-y-3">
                  <Label>Version du modpack</Label>
                  {versionsQ.isLoading && (
                    <div className="text-sm text-muted-foreground">Chargement des versions…</div>
                  )}
                  {versions.length === 0 && !versionsQ.isLoading && (
                    <div className="rounded-lg border border-border/70 bg-background/30 p-4 text-sm text-muted-foreground">
                      Aucune version active pour ce modpack.
                    </div>
                  )}
                  {versions.length > 0 && (
                    <div className="grid gap-2 sm:grid-cols-2">
                      {versions.map((version) => (
                        <button
                          key={version.id}
                          type="button"
                          onClick={() => setSelectedVersionId(version.id)}
                          className={`rounded-lg border p-3 text-left transition-colors ${
                            selectedVersionId === version.id
                              ? "border-primary bg-primary/10"
                              : "border-border/70 bg-background/20 hover:border-primary/40"
                          }`}
                        >
                          <div className="font-medium">{version.display_name}</div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            Minecraft {version.minecraft_versions.join(", ") || "—"} ·{" "}
                            {version.loaders.join(", ") || "loader auto"}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label>Plan</Label>
            {deployType === "modpack" && selectedModpackId && compatiblePlans.length === 0 && (
              <div className="rounded-lg border border-border/70 bg-background/30 p-4 text-sm text-muted-foreground">
                Aucun plan compatible. Installation modpack bientôt disponible.
              </div>
            )}
            <div className="grid gap-2">
              {(deployType === "modpack"
                ? compatiblePlans.map((item) => item.plan)
                : (plansData?.plans ?? [])
              ).map((p) => (
                <label
                  key={p.id}
                  className={`cursor-pointer rounded-lg border p-4 flex items-center justify-between transition-colors ${
                    planId === p.id
                      ? "border-primary bg-primary/10 shadow-[0_0_24px_rgba(0,191,255,0.12)]"
                      : "border-border/70 bg-background/20 hover:border-primary/40"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <input
                      type="radio"
                      name="plan"
                      checked={planId === p.id}
                      onChange={() => {
                        setPlanId(p.id);
                        if (deployType === "modpack") {
                          const compatible = compatiblePlans.find((item) => item.plan.id === p.id);
                          setVariantIndex(compatible?.variantIndex ?? 0);
                        }
                      }}
                      className="accent-[color:var(--primary)]"
                    />
                    <div>
                      <div className="font-medium">
                        {p.game} — {p.name}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {(p.ram_mb / 1024).toFixed(0)} GB RAM · {p.cpu_percent}% CPU ·{" "}
                        {(p.disk_mb / 1024).toFixed(0)} GB SSD
                      </div>
                    </div>
                  </div>
                  <div className="font-display text-lg">
                    ${(p.price_monthly_cents / 100).toFixed(2)}
                    <span className="text-xs text-muted-foreground font-sans">/mo</span>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {planId && deployType === "classic" && (
            <div className="space-y-3">
              <Label>Type serveur Minecraft</Label>
              {opts.isLoading && (
                <div className="text-sm text-muted-foreground">Chargement des templates…</div>
              )}
              {opts.error && (
                <div className="text-sm text-destructive">{(opts.error as Error).message}</div>
              )}
              {serverTypeOptions.length > 0 && (
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {serverTypeOptions.map((option) => {
                    const v = option.variant;
                    return (
                      <button
                        type="button"
                        key={option.key}
                        onClick={() => v && setVariantIndex(v.index)}
                        disabled={!v || !!v.error}
                        className={`text-left rounded-lg border p-3 transition-colors ${
                          !v || v.error
                            ? "border-destructive/40 bg-destructive/10 cursor-not-allowed"
                            : variantIndex === v.index
                              ? "border-primary bg-primary/10"
                              : "border-border/70 bg-background/20 hover:border-primary/40"
                        }`}
                      >
                        <div className="font-medium">{option.label}</div>
                        <div
                          className={`text-xs line-clamp-2 mt-0.5 ${!v || v.error ? "text-destructive" : "text-muted-foreground"}`}
                        >
                          {v?.error || v?.templateDescription || option.description}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {currentVariant && deployType === "classic" && (
            <div className="space-y-3">
              <Label>Version Minecraft</Label>
              <div className="rounded-lg border border-primary/15 bg-background/40 p-4">
                {versionVariable ? (
                  <EggVariablesForm variables={[versionVariable]} values={env} onChange={setEnv} />
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Sélection de version bientôt disponible pour ce template.
                  </p>
                )}
              </div>
            </div>
          )}

          {selectedPlan && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Label htmlFor="maxPlayers">Nombre de joueurs maximum</Label>
                <span className="rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-sm text-primary">
                  {maxPlayers} joueur{maxPlayers > 1 ? "s" : ""}
                </span>
              </div>
              <div className="rounded-lg border border-primary/15 bg-background/40 p-4">
                <input
                  id="maxPlayers"
                  type="range"
                  min={1}
                  max={maxPlayersLimit}
                  value={maxPlayers}
                  onChange={(event) => setMaxPlayers(Number(event.target.value))}
                  className="w-full accent-[color:var(--primary)]"
                />
                <div className="mt-3 flex items-center gap-3">
                  <Input
                    type="number"
                    min={1}
                    max={maxPlayersLimit}
                    value={maxPlayers}
                    onChange={(event) => {
                      const value = Number(event.target.value);
                      setMaxPlayers(Math.min(maxPlayersLimit, Math.max(1, value || 1)));
                    }}
                    className="w-28"
                  />
                  <p className="text-sm text-muted-foreground">
                    Inclus : {playerPrice?.includedPlayers ?? recommendedPlayers}. Limite :{" "}
                    {maxPlayersLimit}. Cette valeur sera appliquée par les templates XNT
                    compatibles.
                  </p>
                </div>
              </div>
            </div>
          )}

          {selectedPlan && playerPrice && (
            <div className="rounded-xl border border-primary/20 bg-primary/10 p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-xs uppercase tracking-wider text-primary">Total mensuel</div>
                  <div className="mt-1 text-sm text-muted-foreground">
                    Plan {selectedPlan.name} · {maxPlayers} joueurs maximum
                  </div>
                </div>
                <div className="font-display text-3xl font-bold text-primary">
                  ${(playerPrice.totalCents / 100).toFixed(2)}
                  <span className="text-sm font-sans text-muted-foreground">/mo</span>
                </div>
              </div>
              <div className="mt-3 text-sm text-muted-foreground">
                Inclus : {playerPrice.includedPlayers} joueurs · Supplément joueurs : $
                {(playerPrice.extraCents / 100).toFixed(2)}/mo
              </div>
            </div>
          )}

          {currentVariant && deployType === "classic" && advancedVariables.length > 0 && (
            <div className="space-y-3">
              <Label>Paramètres avancés</Label>
              <div className="rounded-lg border border-primary/15 bg-background/40 p-4">
                <EggVariablesForm variables={advancedVariables} values={env} onChange={setEnv} />
              </div>
            </div>
          )}

          <Button
            type="submit"
            disabled={!canSubmit}
            className="w-full bg-primary text-primary-foreground shadow-[0_0_30px_rgba(0,191,255,0.24)] hover:bg-primary/90"
          >
            <Rocket className="mr-2 h-4 w-4" />
            {checkout.isPending ? "Redirecting…" : "Payer avec Stripe"}
          </Button>
        </form>
      </div>
    </div>
  );
}

function getMaxPlayersLimit(ramMb: number) {
  if (ramMb >= 16384) return 100;
  if (ramMb >= 8192) return 60;
  if (ramMb >= 4096) return 30;
  return 10;
}

function getRecommendedPlayers(ramMb: number) {
  if (ramMb >= 16384) return 80;
  if (ramMb >= 8192) return 40;
  if (ramMb >= 4096) return 20;
  return 10;
}

function getPlayerPricing(name: string, ramMb: number, baseCents: number, maxPlayers: number) {
  const lower = name.toLowerCase();
  const includedPlayers = lower.includes("netherite")
    ? 80
    : lower.includes("diamond")
      ? 40
      : lower.includes("iron")
        ? 20
        : getRecommendedPlayers(ramMb);
  const stepCents = lower.includes("netherite")
    ? 500
    : lower.includes("diamond")
      ? 200
      : lower.includes("iron")
        ? 100
        : 0;
  const extraPlayers = Math.max(0, maxPlayers - includedPlayers);
  const extraCents = extraPlayers > 0 ? stepCents : 0;
  return {
    includedPlayers,
    extraPlayers,
    extraCents,
    totalCents: baseCents + extraCents,
  };
}
