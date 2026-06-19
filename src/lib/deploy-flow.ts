import { getMinecraftPlayerPricingRules, normalizeMinecraftServerType } from "@/lib/game-config";

export type PricingDeploySearchInput = {
  planId: string;
  variantIndex?: number | null;
  templateId?: string | null;
  templateLabel?: string | null;
  minecraftVersion?: string | null;
  players?: number | null;
  lockPlan?: boolean;
};

export function buildPricingDeploySearch(input: PricingDeploySearchInput) {
  const plan = input.planId.trim();
  if (!plan) {
    throw new Error("Plan requis pour ouvrir le configurateur.");
  }
  const serverType = normalizeMinecraftServerType(input.templateLabel);
  return {
    plan,
    variant: input.variantIndex ?? 0,
    ...(input.templateId ? { template: input.templateId } : {}),
    ...(serverType ? { server_type: serverType } : {}),
    minecraft_version: input.minecraftVersion?.trim() || "auto",
    players: input.players ?? undefined,
    plan_locked: input.lockPlan ? 1 : undefined,
  };
}

export const buildDeployUrlFromPricing = buildPricingDeploySearch;

export function buildPricingDeployUrl(input: PricingDeploySearchInput) {
  const search = buildPricingDeploySearch(input);
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(search)) {
    if (value === undefined || value === null || value === "") continue;
    params.set(key, String(value));
  }
  return `/deploy?${params.toString()}`;
}

export type DeployPlanSummary = {
  id: string;
  slug?: string | null;
  code?: string | null;
  game: string;
  name: string;
  price_monthly_cents: number;
  ram_mb: number;
  cpu_percent: number;
  disk_mb: number;
};

export function isPlanLockedSearchValue(value: unknown) {
  if (value === true || value === 1) return true;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return normalized === "1" || normalized === "true";
  }
  return false;
}

export function resolveDeployPlan(plans: DeployPlanSummary[], planParam?: string | null) {
  const rawParam = planParam?.trim();
  if (!rawParam) return null;
  const normalizedParam = rawParam.toLowerCase();
  return (
    plans.find((plan) => {
      const candidates = [plan.id, plan.slug, plan.code].filter(
        (value): value is string => typeof value === "string" && value.trim().length > 0,
      );
      return candidates.some(
        (candidate) => candidate === rawParam || candidate.toLowerCase() === normalizedParam,
      );
    }) ?? null
  );
}

export function resolveDeployPlanState(input: {
  plans: DeployPlanSummary[];
  planId?: string | null;
  planLockedValue?: unknown;
}) {
  const isPlanLocked = isPlanLockedSearchValue(input.planLockedValue);
  const selectedPlan = resolveDeployPlan(input.plans, input.planId);

  if (isPlanLocked) {
    return {
      isPlanLocked,
      selectedPlan,
      visiblePlans: selectedPlan ? [selectedPlan] : [],
      error: selectedPlan ? null : "Impossible de retrouver le plan sélectionné.",
      failureReason: selectedPlan
        ? null
        : input.planId?.trim()
          ? `Aucun plan actif ne correspond à "${input.planId}".`
          : "Aucun identifiant de plan reçu dans l’URL.",
    };
  }

  return {
    isPlanLocked,
    selectedPlan,
    visiblePlans: input.plans,
    error: null,
    failureReason: null,
  };
}

export function defaultPlayersForPricingPlan(plan: { name: string; ram_mb: number }) {
  return getMinecraftPlayerPricingRules(plan.name, plan.ram_mb).defaultPlayers;
}
