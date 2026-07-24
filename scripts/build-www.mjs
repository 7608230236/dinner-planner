// Assembles the static web assets Capacitor packages into the native app.
// This app has no build step for the web (plain HTML/CSS/JS), so this just
// copies the exact files the app needs into www/, leaving out dev-only
// files (tests, docs, node_modules, netlify functions source, etc.)
import { cp, rm, mkdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const wwwDir = resolve(root, "www");

const filesAndDirs = [
  "index.html",
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
