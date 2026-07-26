// Runs as part of the Netlify build, and also as part of the native app build
// (scripts/build-www.mjs). Replaces the __BUILD_ID__ placeholder with something
// that changes on every single deploy/build - this is what makes the app reliably
// detect "a new version was deployed" and refresh its cache/service worker,
// instead of relying on someone remembering to bump APP_VERSION.
//
// Netlify sets COMMIT_REF automatically; GitHub Actions sets GITHUB_SHA. Falls
// back to a timestamp for local builds where neither is set.
import { readFile, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const targetDir = process.argv[2] ? resolve(process.argv[2]) : root;
const buildId = (process.env.COMMIT_REF || process.env.GITHUB_SHA || `local-${Date.now()}`).slice(0, 12);

const targets = ["index.html", "service-worker.js", "js/app.js"];

for (const relativePath of targets) {
  const fullPath = resolve(targetDir, relativePath);
  const original = await readFile(fullPath, "utf8");
  const updated = original.replaceAll("__BUILD_ID__", buildId);
  await writeFile(fullPath, updated, "utf8");
}

console.log(`Injected build ID "${buildId}" into ${targets.join(", ")} (in ${targetDir})`);
