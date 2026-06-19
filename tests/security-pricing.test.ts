import assert from "node:assert/strict";
import {
  MINECRAFT_NEST_ID,
  MINECRAFT_REQUIRED_EGG_IDS,
  calculateMinecraftPlayerPricing,
  isMinecraftGame,
  isProxyTemplateLabel,
  normalizeGameKey,
} from "../src/lib/game-config";
import {
  assertEditableFilePath,
  assertNotProtectedServerPath,
  hasBlockedExtension,
  hasForbiddenServerSetting,
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
  for (const key of ["max_players", "max-players", "slots", "slot_count"]) {
    assert.equal(hasForbiddenServerSetting({ [key]: 999 }), key);
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
