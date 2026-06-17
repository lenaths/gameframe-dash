import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Rocket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SiteHeader } from "@/components/site-header";
import { EggVariablesForm } from "@/components/egg-variables-form";
import { findVersionVariable, getDeployOptions, listPlans } from "@/lib/plans.functions";
import { createCheckoutSession } from "@/lib/stripe.functions";
import { toast } from "sonner";

const searchSchema = z.object({ plan: z.string().optional() });

export const Route = createFileRoute("/_authenticated/deploy")({
  validateSearch: searchSchema,
  head: () => ({ meta: [{ title: "Deploy a server · XntServers" }] }),
  component: Deploy,
});

function Deploy() {
  const { plan: preselected } = Route.useSearch();
  const navigate = useNavigate();
  const fetchPlans = useServerFn(listPlans);
  const fetchOptions = useServerFn(getDeployOptions);
  const startCheckout = useServerFn(createCheckoutSession);

  const { data: plansData } = useQuery({ queryKey: ["plans"], queryFn: () => fetchPlans() });
  const [planId, setPlanId] = useState<string>(preselected ?? "");
  const [name, setName] = useState("");
  const [variantIndex, setVariantIndex] = useState(0);
  const [env, setEnv] = useState<Record<string, string>>({});

  const opts = useQuery({
    queryKey: ["deploy-options", planId],
    queryFn: () => fetchOptions({ data: { planId } }),
    enabled: !!planId,
  });

  // Reset variant + env when plan changes; seed env defaults when variant changes.
  useEffect(() => {
    setVariantIndex(0);
  }, [planId]);
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
          serverName: name.trim() || undefined,
          variantIndex,
          environment: env,
        },
      }),
    onSuccess: ({ url }) => {
      window.location.assign(url);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const variants = opts.data?.variants ?? [];
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
          </div>

          <div className="space-y-2">
            <Label>Plan</Label>
            <div className="grid gap-2">
              {(plansData?.plans ?? []).map((p) => (
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
                      onChange={() => setPlanId(p.id)}
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

          {planId && (
            <div className="space-y-3">
              <Label>Template serveur</Label>
              {opts.isLoading && (
                <div className="text-sm text-muted-foreground">Chargement des templates…</div>
              )}
              {opts.error && (
                <div className="text-sm text-destructive">{(opts.error as Error).message}</div>
              )}
              {variants.length > 0 && (
                <div className="grid sm:grid-cols-2 gap-2">
                  {variants.map((v) => (
                    <button
                      type="button"
                      key={v.index}
                      onClick={() => setVariantIndex(v.index)}
                      disabled={!!v.error}
                      className={`text-left rounded-lg border p-3 transition-colors ${
                        v.error
                          ? "border-destructive/40 bg-destructive/10 cursor-not-allowed"
                          : variantIndex === v.index
                            ? "border-primary bg-primary/10"
                            : "border-border/70 bg-background/20 hover:border-primary/40"
                      }`}
                    >
                      <div className="font-medium">{v.label}</div>
                      <div
                        className={`text-xs line-clamp-2 mt-0.5 ${v.error ? "text-destructive" : "text-muted-foreground"}`}
                      >
                        {v.error || v.templateDescription}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {currentVariant && (
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

          {currentVariant && advancedVariables.length > 0 && (
            <div className="space-y-3">
              <Label>Paramètres avancés</Label>
              <div className="rounded-lg border border-primary/15 bg-background/40 p-4">
                <EggVariablesForm variables={advancedVariables} values={env} onChange={setEnv} />
              </div>
            </div>
          )}

          <Button
            type="submit"
            disabled={!planId || checkout.isPending || opts.isLoading}
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
