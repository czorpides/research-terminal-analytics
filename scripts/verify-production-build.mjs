/**
 * Fail-closed build gate: a successful HTML response is not proof that the
 * browser can load its scripts, styles, or Supabase connection.
 * No network calls and no credentials in the log.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve("dist");
const published = join(root, "assets");
const nitroPublic = join(root, "public", "assets");
const serverEntry = join(root, "server", "index.mjs");
const required = [root, published, nitroPublic, serverEntry, join(root, "favicon.ico")];
for (const target of required) {
  assert.ok(existsSync(target), "Release artifact missing: " + target);
}
const listFiles = (dir) =>
  readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .sort();
const publicFiles = listFiles(nitroPublic);
const releaseFiles = listFiles(published);
assert.ok(publicFiles.length >= 10, "Client bundle unexpectedly small");
assert.deepEqual(
  releaseFiles,
  publicFiles,
  "Public /assets files differ from Nitro output; published page may be blank",
);
assert.ok(publicFiles.some((x) => x.endsWith(".css")), "No published CSS");
assert.ok(publicFiles.some((x) => x.endsWith(".js")), "No published JS");
const hash = (file) =>
  createHash("sha256").update(readFileSync(file)).digest("hex");
for (const filename of publicFiles) {
  assert.equal(
    hash(join(published, filename)),
    hash(join(nitroPublic, filename)),
    "Published asset differs from emitted source: " + filename,
  );
}
assert.ok(statSync(serverEntry).size > 0, "Server entry empty");

function readDotEnv(name) {
  if (!existsSync(".env")) return "";
  const found = readFileSync(".env", "utf8")
    .split(/\r?\n/)
    .find((line) => line.startsWith(name + "="));
  return found?.slice(name.length + 1).trim().replace(/^["']|["']$/g, "") ?? "";
}
const publicUrl = process.env.VITE_SUPABASE_URL || readDotEnv("VITE_SUPABASE_URL");
const publicKey =
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  readDotEnv("VITE_SUPABASE_PUBLISHABLE_KEY");
assert.match(publicUrl, /^https:\/\/[A-Za-z0-9.-]+/, "Public Supabase URL absent from build configuration");
assert.ok(publicKey.length >= 10, "Public Supabase publishable key absent");
const host = new URL(publicUrl).hostname;
const emittedScripts = publicFiles.filter((x) => x.endsWith(".js"));
assert.ok(
  emittedScripts.some((name) => readFileSync(join(published, name), "utf8").includes(host)),
  "Browser JS lacks the public Supabase host; client auth will fail",
);
console.log(
  "Production artifact gate passed: " + publicFiles.length +
    " identical published assets; server, CSS/JS and public Supabase host present.",
);
