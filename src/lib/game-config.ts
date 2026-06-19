export type GameKey = "minecraft" | "conan" | "ark" | "gmod" | "rust" | "unknown";

export type MinecraftPlayerPricing = {
  pricing_mode: "included_players_delta";
  base_price_cents: number;
  included_players: number;
  selected_players: number;
  price_per_player_cents: number;
  players_delta: number;
  players_adjustment_cents: number;
  min_price_cents: number;
  total_price_cents: number;
  min_players: number;
  max_players_allowed: number;
};

export const MINECRAFT_SERVER_TYPES = [
  { key: "vanilla", label: "Vanilla", description: "Expérience officielle Minecraft." },
  { key: "paper", label: "Paper", description: "Performance optimisée pour plugins." },
  { key: "purpur", label: "Purpur", description: "Réglages et performances avancés." },
  { key: "fabric", label: "Fabric", description: "Mods Fabric légers et modernes." },
  { key: "forge", label: "Forge", description: "Mods Forge classiques." },
  { key: "neoforge", label: "NeoForge", description: "Mods NeoForge récents." },
  { key: "quilt", label: "Quilt", description: "Mods Quilt." },
] as const;

export const MINECRAFT_NEST_ID = 1;

export const MINECRAFT_REQUIRED_EGG_IDS = {
  vanilla: 3,
  forge: 4,
  paper: 5,
} as const;

export const MINECRAFT_DYNAMIC_EGG_KEYS = ["purpur", "fabric", "neoforge", "quilt"] as const;

export const XNT_MINECRAFT_VERSION_CATALOG: Record<string, string[]> = {
  paper: ["1.21.6", "1.21.5", "1.21.4", "1.20.6", "1.20.4", "1.20.1"],
  vanilla: ["latest", "1.21.6", "1.21.5", "1.21.4", "1.20.6", "1.20.4", "1.20.1"],
  forge: ["1.20.1", "1.19.2", "1.18.2", "1.16.5"],
  fabric: [],
  neoforge: [],
  quilt: [],
  purpur: [],
};

export const MINECRAFT_VERSION_VARIABLE_BY_TYPE: Record<string, string | null> = {
  paper: "MINECRAFT_VERSION",
  vanilla: "VANILLA_VERSION",
  forge: "MC_VERSION",
  fabric: null,
  neoforge: null,
  quilt: null,
  purpur: null,
};

export function getMinecraftVersionsForType(type: unknown) {
  const key = normalizeMinecraftServerType(type);
  return key ? (XNT_MINECRAFT_VERSION_CATALOG[key] ?? []) : [];
}

export function getMinecraftVersionVariable(type: unknown) {
  const key = normalizeMinecraftServerType(type);
  return key ? (MINECRAFT_VERSION_VARIABLE_BY_TYPE[key] ?? null) : null;
}

export function normalizeMinecraftServerType(type: unknown) {
  const key = String(type ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  if (!key) return null;
  if (key.includes("neoforge")) return "neoforge";
  if (key.includes("vanilla")) return "vanilla";
  if (key.includes("paper")) return "paper";
  if (key.includes("forge")) return "forge";
  if (key.includes("fabric")) return "fabric";
  if (key.includes("quilt")) return "quilt";
  if (key.includes("purpur")) return "purpur";
  return key;
}

const PROXY_TEMPLATE_KEYS = new Set(["bungeecord", "velocity", "waterfall"]);

export function normalizeGameKey(input: unknown): GameKey {
  const value = String(input ?? "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ");
  if (!value) return "unknown";
  if (value === "minecraft" || value === "mc" || value.includes("minecraft")) return "minecraft";
  if (value === "conan" || value.includes("conan exiles")) return "conan";
  if (
    value === "ark" ||
    value.includes("survival evolved") ||
    value.includes("survival ascended")
  ) {
    return "ark";
  }
  if (value === "gmod" || value.includes("garry")) return "gmod";
  if (value.includes("rust")) return "rust";
  return "unknown";
}

export function isMinecraftGame(input: unknown) {
  return normalizeGameKey(input) === "minecraft";
}

export function isMinecraftPlan(plan: { game?: string | null } | null | undefined) {
  return isMinecraftGame(plan?.game);
}

export function isProxyTemplateKey(input: unknown) {
  const key = String(input ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return PROXY_TEMPLATE_KEYS.has(key);
}

export function isProxyTemplateLabel(input: unknown) {
  const value = String(input ?? "")
    .trim()
    .toLowerCase();
  return /\b(bungee|bungeecord|velocity|waterfall)\b/.test(value);
}

export function getMinecraftPlayerPricingRules(planName: string, ramMb = 0) {
  const lower = planName.toLowerCase();
  if (lower.includes("netherite")) {
    return {
      includedPlayers: 10,
      minPlayers: 1,
      maxPlayersAllowed: 100,
      defaultPlayers: 40,
      pricePerPlayerCents: 25,
      minPriceCents: 999,
    };
  }
  if (lower.includes("diamond")) {
    return {
      includedPlayers: 10,
      minPlayers: 1,
      maxPlayersAllowed: 60,
      defaultPlayers: 20,
      pricePerPlayerCents: 20,
      minPriceCents: 599,
    };
  }
  if (lower.includes("iron")) {
    return {
      includedPlayers: 10,
      minPlayers: 1,
      maxPlayersAllowed: 30,
      defaultPlayers: 10,
      pricePerPlayerCents: 15,
      minPriceCents: 299,
    };
  }

  const maxPlayersAllowed = ramMb >= 16384 ? 100 : ramMb >= 8192 ? 60 : ramMb >= 4096 ? 30 : 10;
  return {
    includedPlayers: 10,
    minPlayers: 1,
    maxPlayersAllowed,
    defaultPlayers: Math.min(maxPlayersAllowed, ramMb >= 16384 ? 40 : ramMb >= 8192 ? 20 : 10),
    pricePerPlayerCents: ramMb >= 16384 ? 25 : ramMb >= 8192 ? 20 : 15,
    minPriceCents: Math.max(299, Math.round(maxPlayersAllowed * 10)),
  };
}

export function calculateMinecraftPlayerPricing(
  plan: { name: string; ram_mb?: number | null; price_monthly_cents: number },
  requestedPlayers?: number | null,
): MinecraftPlayerPricing {
  const rules = getMinecraftPlayerPricingRules(plan.name, plan.ram_mb ?? 0);
  const selectedPlayers = Math.min(
    rules.maxPlayersAllowed,
    Math.max(
      rules.minPlayers,
      Number.isFinite(requestedPlayers)
        ? Math.round(Number(requestedPlayers))
        : rules.defaultPlayers,
    ),
  );
  const playersDelta = selectedPlayers - rules.includedPlayers;
  const playersAdjustmentCents = playersDelta * rules.pricePerPlayerCents;
  const rawTotal = plan.price_monthly_cents + playersAdjustmentCents;
  return {
    pricing_mode: "included_players_delta",
    base_price_cents: plan.price_monthly_cents,
    included_players: rules.includedPlayers,
    selected_players: selectedPlayers,
    price_per_player_cents: rules.pricePerPlayerCents,
    players_delta: playersDelta,
    players_adjustment_cents: playersAdjustmentCents,
    min_price_cents: rules.minPriceCents,
    total_price_cents: Math.max(rules.minPriceCents, rawTotal),
    min_players: rules.minPlayers,
    max_players_allowed: rules.maxPlayersAllowed,
  };
}
