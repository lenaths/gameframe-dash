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

test("Minecraft Iron player pricing uses included-player delta formula", () => {
  const iron = { name: "Iron", ram_mb: 4096, price_monthly_cents: 499 };
  assert.equal(calculateMinecraftPlayerPricing(iron, 3).total_price_cents, 394);
  assert.equal(calculateMinecraftPlayerPricing(iron, 10).total_price_cents, 499);
  assert.equal(calculateMinecraftPlayerPricing(iron, 20).total_price_cents, 649);
  assert.equal(calculateMinecraftPlayerPricing(iron, 30).total_price_cents, 799);
});

test("Minecraft pricing clamps minimum and maximum player counts server-side", () => {
  const iron = { name: "Iron", ram_mb: 4096, price_monthly_cents: 499 };
  assert.equal(calculateMinecraftPlayerPricing(iron, -50).selected_players, 1);
  assert.equal(calculateMinecraftPlayerPricing(iron, -50).total_price_cents, 364);
  assert.equal(calculateMinecraftPlayerPricing(iron, 500).selected_players, 30);
  assert.equal(calculateMinecraftPlayerPricing(iron, 500).total_price_cents, 799);

  const cheapIron = { name: "Iron", ram_mb: 4096, price_monthly_cents: 350 };
  assert.equal(calculateMinecraftPlayerPricing(cheapIron, 1).total_price_cents, 299);
});

test("player capacity pricing covers ARK, Conan and Garry's Mod", () => {
  const ark = { game: "ARK", name: "Survivor", ram_mb: 8192, price_monthly_cents: 1499 };
  const conan = { game: "Conan Exiles", name: "Warlord", ram_mb: 8192, price_monthly_cents: 1299 };
  const gmod = { game: "Garry's Mod", name: "Roleplay", ram_mb: 4096, price_monthly_cents: 999 };

  assert.equal(calculatePlayerCapacityPricing(ark, 20).total_price_cents, 1699);
  assert.equal(calculatePlayerCapacityPricing(ark, 999).selected_players, 30);
  assert.equal(calculatePlayerCapacityPricing(conan, 20).total_price_cents, 1499);
  assert.equal(calculatePlayerCapacityPricing(conan, 999).selected_players, 70);
  assert.equal(calculatePlayerCapacityPricing(gmod, 20).total_price_cents, 1149);
  assert.equal(calculatePlayerCapacityPricing(gmod, 999).selected_players, 64);
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
