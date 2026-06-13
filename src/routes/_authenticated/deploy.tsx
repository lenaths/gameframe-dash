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
import { listPlans, getDeployOptions } from "@/lib/plans.functions";
import { deployServer } from "@/lib/servers.functions";
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
  const callDeploy = useServerFn(deployServer);

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
  useEffect(() => { setVariantIndex(0); }, [planId]);
  const currentVariant = opts.data?.variants[variantIndex];
  useEffect(() => {
    if (!currentVariant) return;
    const seed: Record<string, string> = {};
    for (const v of currentVariant.variables) seed[v.env_variable] = v.default_value ?? "";
    setEnv(seed);
  }, [currentVariant]);

  const deploy = useMutation({
    mutationFn: () => callDeploy({ data: { planId, serverName: name, variantIndex, environment: env } }),
    onSuccess: () => { toast.success("Server provisioned!"); navigate({ to: "/dashboard" }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const variants = opts.data?.variants ?? [];

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <div className="mx-auto max-w-3xl px-6 py-12">
        <h1 className="font-display text-4xl font-bold">Deploy a new server</h1>
        <p className="text-muted-foreground mt-2">Pick a plan, a flavor, and configure your version/mods.</p>

        <form
          onSubmit={(e) => { e.preventDefault(); if (planId && name) deploy.mutate(); }}
          className="mt-8 space-y-6 rounded-2xl border border-border/60 bg-surface p-6"
        >
          <div className="space-y-2">
            <Label htmlFor="name">Server name</Label>
            <Input id="name" required maxLength={40} value={name} onChange={(e) => setName(e.target.value)} placeholder="The Adventurer's Guild" />
          </div>

          <div className="space-y-2">
            <Label>Plan</Label>
            <div className="grid gap-2">
              {(plansData?.plans ?? []).map((p) => (
                <label
                  key={p.id}
                  className={`cursor-pointer rounded-lg border p-4 flex items-center justify-between transition-colors ${
                    planId === p.id ? "border-primary bg-primary/5" : "border-border hover:border-border/80"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <input type="radio" name="plan" checked={planId === p.id} onChange={() => setPlanId(p.id)} className="accent-[color:var(--primary)]" />
                    <div>
                      <div className="font-medium">{p.game} — {p.name}</div>
                      <div className="text-xs text-muted-foreground">{(p.ram_mb / 1024).toFixed(0)} GB RAM · {p.cpu_percent}% CPU · {(p.disk_mb / 1024).toFixed(0)} GB SSD</div>
                    </div>
                  </div>
                  <div className="font-display text-lg">${(p.price_monthly_cents / 100).toFixed(2)}<span className="text-xs text-muted-foreground font-sans">/mo</span></div>
                </label>
              ))}
            </div>
          </div>

          {planId && (
            <div className="space-y-3">
              <Label>Server flavor</Label>
              {opts.isLoading && <div className="text-sm text-muted-foreground">Loading options…</div>}
              {opts.error && <div className="text-sm text-destructive">{(opts.error as Error).message}</div>}
              {variants.length > 0 && (
                <div className="grid sm:grid-cols-2 gap-2">
                  {variants.map((v) => (
                    <button
                      type="button"
                      key={v.index}
                      onClick={() => setVariantIndex(v.index)}
                      disabled={!!v.error}
                      className={`text-left rounded-lg border p-3 transition-colors ${
                        v.error ? "border-destructive/40 bg-destructive/5 cursor-not-allowed" :
                        variantIndex === v.index ? "border-primary bg-primary/5" : "border-border hover:border-border/80"
                      }`}
                    >
                      <div className="font-medium">{v.label}</div>
                      <div className={`text-xs line-clamp-2 mt-0.5 ${v.error ? "text-destructive" : "text-muted-foreground"}`}>
                        {v.error || v.eggDescription || v.eggName}
                      </div>
                    </button>
                  ))}
                </div>
              )}

            </div>
          )}

          {currentVariant && currentVariant.variables.length > 0 && (
            <div className="space-y-3">
              <Label>Configuration</Label>
              <div className="rounded-lg border border-border/60 bg-background/40 p-4">
                <EggVariablesForm variables={currentVariant.variables} values={env} onChange={setEnv} />
              </div>
            </div>
          )}

          <Button
            type="submit"
            disabled={!planId || !name || deploy.isPending || opts.isLoading}
            className="w-full bg-primary text-primary-foreground hover:bg-primary/90 glow-primary"
          >
            <Rocket className="mr-2 h-4 w-4" />
            {deploy.isPending ? "Provisioning…" : "Deploy server"}
          </Button>
        </form>
      </div>
    </div>
  );
}
