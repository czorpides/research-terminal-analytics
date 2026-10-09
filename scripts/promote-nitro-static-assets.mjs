// Nitro writes static client files to dist/public, while Lovable's
// published static asset root is dist. Keep Nitro's original public
// folder for the Worker/Node server and also expose root-level /assets.
import { cpSync, existsSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";

const distDir = resolve("dist");
const publicDir = join(distDir, "public");
const sourceAssets = join(publicDir, "assets");

if (!existsSync(sourceAssets)) {
  throw new Error("Missing Nitro client output: dist/public/assets");
}
for (const entry of readdirSync(publicDir, { withFileTypes: true })) {
  cpSync(join(publicDir, entry.name), join(distDir, entry.name), {
    recursive: true,
    force: true,
  });
}
const emitted = readdirSync(join(distDir, "assets"));
if (!emitted.some((file) => file.endsWith(".js")) ||
    !emitted.some((file) => file.endsWith(".css"))) {
  throw new Error("Published dist/assets must contain JS and CSS bundles");
}
console.log(`Promoted ${emitted.length} client assets to dist/assets (Lovable static root)`);
