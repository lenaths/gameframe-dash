import assert from "node:assert/strict";
import {
  MINECRAFT_NEST_ID,
  MINECRAFT_REQUIRED_EGG_IDS,
  calculateMinecraftPlayerPricing,
  calculatePlayerCapacityPricing,
  isMinecraftGame,
  isProxyTemplateLabel,
  normalizeGameKey,
  supportsPlayerCapacityPricing,
} from "../src/lib/game-config";
import {
  assertDownloadFilePath,
  assertEditableFilePath,
  assertFileMovePath,
  assertNotProtectedServerPath,
  assertUploadFilePath,
  hasBlockedExtension,
  hasForbiddenServerSetting,
  isManagedCapacityVariable,
  isProtectedServerPath,
  normalizeServerPath,
} from "../src/lib/server-security";

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (error) {
    console.error(`✗ ${name}`);
    throw error;
  }
}

function assertThrowsManaged(path: string) {
  assert.equal(isProtectedServerPath(path), true, `${path} should be protected`);
  assert.throws(() => assertEditableFilePath(path), /géré par XNTServers/);
  assert.throws(() => assertNotProtectedServerPath(path), /géré par XNTServers/);
}

test("protected config files are blocked for read/write/delete-style operations", () => {
  for (const path of [
    "/server.properties",
    "/config.yml",
    "/ShooterGame/Saved/Config/LinuxServer/Game.ini",
    "/ShooterGame/Saved/Config/LinuxServer/GameUserSettings.ini",
    "/ShooterGame/Saved/Config/LinuxServer/Engine.ini",
    "/ConanSandbox/Saved/Config/LinuxServer/ServerSettings.ini",
    "/garrysmod/cfg/server.cfg",
    "/.env",
    "/plugins/token-store.yml",
    "/plugins/secret-config.yml",
    "/plugins/api_key.txt",
  ]) {
    assertThrowsManaged(path);
  }
});

test("protected paths and path traversal are rejected", () => {
  assert.throws(() => normalizeServerPath("/world/../server.properties"), /non autorisé/);
  assertThrowsManaged("/.xnt/install-state.json");
  assertThrowsManaged("/scripts/xnt/install.sh");
  assertThrowsManaged("/bungeecord/config.yml");
});

test("binary and large archive extensions are blocked from editor actions", () => {
  for (const path of [
    "/server.jar",
    "/world.zip",
    "/backup.tar",
    "/backup.gz",
    "/tool.exe",
    "/data.bin",
    "/database.sqlite",
    "/database.db",
  ]) {
    assert.equal(hasBlockedExtension(path), true, `${path} should have blocked extension`);
    assert.throws(() => assertEditableFilePath(path), /ne peut pas être ouvert/);
  }
});

test("rename-style operations must reject protected source or destination names", () => {
  const root = "/";
  for (const file of ["server.properties", "config.yml", "Game.ini", "ServerSettings.ini"]) {
    assert.throws(() => assertNotProtectedServerPath(`${root}/${file}`), /géré par XNTServers/);
  }
});

test("forged slots and max players settings are rejected", () => {
  for (const key of [
    "max_players",
    "max-players",
    "MAXPLAYERS",
    "slots",
    "slot_count",
    "PLAYER_SLOTS",
    "PLAYERS",
    "SERVER_PLAYERS",
  ]) {
    assert.equal(hasForbiddenServerSetting({ [key]: 999 }), key);
    assert.equal(isManagedCapacityVariable(key), true);
  }
  assert.equal(hasForbiddenServerSetting({ motd: "Bienvenue" }), undefined);
});

test("Minecraft pricing uses recommended-player delta formula", () => {
  const iron = { game: "Minecraft", name: "Iron", ram_mb: 4096, price_monthly_cents: 499 };
  const diamond = { game: "Minecraft", name: "Diamond", ram_mb: 8192, price_monthly_cents: 999 };
  const netherite = {
    game: "Minecraft",
    name: "Netherite",
    ram_mb: 16384,
    price_monthly_cents: 1999,
  };

  assert.equal(calculateMinecraftPlayerPricing(iron, 1).total_price_cents, 479);
  assert.equal(calculateMinecraftPlayerPricing(iron, 5).total_price_cents, 499);
  assert.equal(calculateMinecraftPlayerPricing(iron, 20).total_price_cents, 724);

  assert.equal(calculateMinecraftPlayerPricing(diamond, 1).total_price_cents, 954);
  assert.equal(calculateMinecraftPlayerPricing(diamond, 10).total_price_cents, 999);
  assert.equal(calculateMinecraftPlayerPricing(diamond, 40).total_price_cents, 1599);

  assert.equal(calculateMinecraftPlayerPricing(netherite, 1).total_price_cents, 1904);
  assert.equal(calculateMinecraftPlayerPricing(netherite, 20).total_price_cents, 1999);
  assert.equal(calculateMinecraftPlayerPricing(netherite, 40).total_price_cents, 2499);
  assert.equal(calculateMinecraftPlayerPricing(netherite, 60).total_price_cents, 2999);
});

test("Minecraft pricing clamps player counts and applies plan floors server-side", () => {
  const iron = { game: "Minecraft", name: "Iron", ram_mb: 4096, price_monthly_cents: 499 };
  assert.equal(calculateMinecraftPlayerPricing(iron, -50).selected_players, 1);
  assert.equal(calculateMinecraftPlayerPricing(iron, -50).total_price_cents, 479);
  assert.equal(calculateMinecraftPlayerPricing(iron, 500).selected_players, 20);
  assert.equal(calculateMinecraftPlayerPricing(iron, 500).total_price_cents, 724);

  const cheapIron = { game: "Minecraft", name: "Iron", ram_mb: 4096, price_monthly_cents: 350 };
  assert.equal(calculateMinecraftPlayerPricing(cheapIron, 1).total_price_cents, 399);
});

test("player capacity pricing covers ARK, Conan and Garry's Mod grids", () => {
  const arkSurvivor = { game: "ARK", name: "Survivor", ram_mb: 8192, price_monthly_cents: 1499 };
  const arkAlpha = { game: "ARK", name: "Alpha", ram_mb: 16384, price_monthly_cents: 1999 };
  const conanHyborian = {
    game: "Conan Exiles",
    name: "Hyborian",
    ram_mb: 8192,
    price_monthly_cents: 1299,
  };
  const conanWarlord = {
    game: "Conan Exiles",
    name: "Warlord",
    ram_mb: 16384,
    price_monthly_cents: 1999,
  };
  const gmodSandbox = {
    game: "Garry's Mod",
    name: "Sandbox",
    ram_mb: 4096,
    price_monthly_cents: 999,
  };
  const gmodRoleplay = {
    game: "Garry's Mod",
    name: "Roleplay",
    ram_mb: 8192,
    price_monthly_cents: 1299,
  };

  assert.equal(calculatePlayerCapacityPricing(arkSurvivor, 1).total_price_cents, 1454);
  assert.equal(calculatePlayerCapacityPricing(arkSurvivor, 999).selected_players, 30);
  assert.equal(calculatePlayerCapacityPricing(arkSurvivor, 30).total_price_cents, 1899);
  assert.equal(calculatePlayerCapacityPricing(arkAlpha, 1).total_price_cents, 1999);
  assert.equal(calculatePlayerCapacityPricing(arkAlpha, 50).total_price_cents, 2749);

  assert.equal(calculatePlayerCapacityPricing(conanHyborian, 1).total_price_cents, 1299);
  assert.equal(calculatePlayerCapacityPricing(conanHyborian, 999).selected_players, 30);
  assert.equal(calculatePlayerCapacityPricing(conanHyborian, 30).total_price_cents, 1599);
  assert.equal(calculatePlayerCapacityPricing(conanWarlord, 1).total_price_cents, 1999);
  assert.equal(calculatePlayerCapacityPricing(conanWarlord, 50).total_price_cents, 2599);

  assert.equal(calculatePlayerCapacityPricing(gmodSandbox, 1).total_price_cents, 954);
  assert.equal(calculatePlayerCapacityPricing(gmodSandbox, 32).total_price_cents, 1159);
  assert.equal(calculatePlayerCapacityPricing(gmodRoleplay, 1).total_price_cents, 1299);
  assert.equal(calculatePlayerCapacityPricing(gmodRoleplay, 999).selected_players, 64);
  assert.equal(calculatePlayerCapacityPricing(gmodRoleplay, 64).total_price_cents, 1779);
});

test("player capacity options are scoped to supported games", () => {
  assert.equal(supportsPlayerCapacityPricing("Minecraft"), true);
  assert.equal(supportsPlayerCapacityPricing("ARK Survival Ascended"), true);
  assert.equal(supportsPlayerCapacityPricing("Conan Exiles"), true);
  assert.equal(supportsPlayerCapacityPricing("Garry's Mod"), true);
  assert.equal(supportsPlayerCapacityPricing("Rust"), false);
});

test("game detection keeps Minecraft-only options scoped to Minecraft", () => {
  assert.equal(isMinecraftGame("Minecraft"), true);
  assert.equal(normalizeGameKey("mc"), "minecraft");
  assert.equal(isMinecraftGame("Conan Exiles"), false);
  assert.equal(isMinecraftGame("ARK Survival Ascended"), false);
  assert.equal(isMinecraftGame("Garry's Mod"), false);
});

test("Minecraft egg mapping pins playable templates and excludes proxy eggs", () => {
  assert.equal(MINECRAFT_NEST_ID, 1);
  assert.equal(MINECRAFT_REQUIRED_EGG_IDS.vanilla, 3);
  assert.equal(MINECRAFT_REQUIRED_EGG_IDS.forge, 4);
  assert.equal(MINECRAFT_REQUIRED_EGG_IDS.paper, 5);
  assert.equal(isProxyTemplateLabel("Bungeecord"), true);
  assert.equal(isProxyTemplateLabel("Velocity"), true);
  assert.equal(isProxyTemplateLabel("Waterfall"), true);
  assert.notEqual(MINECRAFT_REQUIRED_EGG_IDS.vanilla, 1);
  assert.notEqual(MINECRAFT_REQUIRED_EGG_IDS.forge, 1);
  assert.notEqual(MINECRAFT_REQUIRED_EGG_IDS.paper, 1);
});

test("file manager upload accepts safe files and rejects protected files", () => {
  assert.equal(assertUploadFilePath("/plugins/readme.txt", 1024), "/plugins/readme.txt");
  assert.throws(() => assertUploadFilePath("/server.properties", 128), /géré par XNTServers/);
  assert.throws(() => assertUploadFilePath("/plugins/token-store.yml", 128), /géré par XNTServers/);
  assert.throws(() => assertUploadFilePath("/mods/server.jar", 128), /ne peut pas être envoyé/);
});

test("file manager delete and rename protections cover protected config files", () => {
  assert.throws(() => assertNotProtectedServerPath("/GameUserSettings.ini"), /géré par XNTServers/);
  assert.throws(() => assertFileMovePath("/server.cfg"), /géré par XNTServers/);
  assert.equal(assertFileMovePath("/world/level.dat_old"), "/world/level.dat_old");
});

test("file manager download rejects protected files", () => {
  assert.equal(assertDownloadFilePath("/logs/latest.log"), "/logs/latest.log");
  assert.throws(() => assertDownloadFilePath("/.env"), /géré par XNTServers/);
  assert.throws(() => assertDownloadFilePath("/plugins/secret-config.yml"), /géré par XNTServers/);
});
