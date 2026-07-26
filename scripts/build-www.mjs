// Assembles the static web assets Capacitor packages into the native app.
// This app has no build step for the web (plain HTML/CSS/JS), so this just
// copies the exact files the app needs into www/, leaving out dev-only
// files (tests, docs, node_modules, netlify functions source, etc.)
import { cp, rm, mkdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const wwwDir = resolve(root, "www");

const filesAndDirs = [
  "index.html",
  "privacy.html",
  "manifest.json",
  "service-worker.js",
  "icon-192.png",
  "icon-512.png",
  "hero-family-kitchen.jpg",
  "css",
  "js"
];

await rm(wwwDir, { recursive: true, force: true });
await mkdir(wwwDir, { recursive: true });

for (const entry of filesAndDirs) {
  await cp(resolve(root, entry), resolve(wwwDir, entry), { recursive: true });
}

console.log(`Built www/ with ${filesAndDirs.length} entries.`);

// Give this native build its own unique build ID too, same reason as the
// Netlify web deploy - so the app can tell "this is a fresh install" apart
// from "the exact same build reopened."
execFileSync(process.execPath, [resolve(root, "scripts/inject-build-id.mjs"), wwwDir], { stdio: "inherit" });
