import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const assetsDir = join(process.cwd(), "dist", "client", "assets");
const formatKb = (bytes) => `${(bytes / 1024).toFixed(1)} kB`;

function readAssets() {
  try {
    return readdirSync(assetsDir).map((name) => ({
      name,
      size: statSync(join(assetsDir, name)).size,
    }));
  } catch (error) {
    console.warn(`[build-report] Unable to read ${assetsDir}: ${error.message}`);
    return [];
  }
}

const assets = readAssets();
const js = assets.filter((asset) => asset.name.endsWith(".js"));
const css = assets.filter((asset) => asset.name.endsWith(".css"));
const sum = (items) => items.reduce((total, item) => total + item.size, 0);
const largestJs = [...js].sort((a, b) => b.size - a.size).slice(0, 10);
const largestCss = [...css].sort((a, b) => b.size - a.size).slice(0, 5);
const warningChunks = js.filter((asset) => asset.size > 500 * 1024);

console.log("\nBuild asset report");
console.log("==================");
console.log(`JS chunks: ${js.length} · total ${formatKb(sum(js))}`);
console.log(`CSS chunks: ${css.length} · total ${formatKb(sum(css))}`);
console.log(`JS chunks > 500 kB: ${warningChunks.length}`);

console.log("\nLargest JS chunks:");
for (const asset of largestJs) console.log(`- ${asset.name}: ${formatKb(asset.size)}`);

if (largestCss.length > 0) {
  console.log("\nLargest CSS chunks:");
  for (const asset of largestCss) console.log(`- ${asset.name}: ${formatKb(asset.size)}`);
}
