// Runs as part of the Netlify build, and also as part of the native app build
// (scripts/build-www.mjs). Replaces the __BUILD_ID__ placeholder with something
// that changes on every single deploy/build - this is what makes the app reliably
// detect "a new version was deployed" and refresh its cache/service worker,
// instead of relying on someone remembering to bump APP_VERSION.
//
// Netlify sets COMMIT_REF automatically; GitHub Actions sets GITHUB_SHA. Falls
// back to a timestamp for local builds where neither is set.
//
// Also replaces __DEPLOY_NUMBER__ with a simple auto-incrementing count (total
// git commits on this branch) - shown right in the version badge, so the user
// can tell at a glance whether a given push actually went live, without
// anyone needing to remember to bump a version number by hand.
import { readFile, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const targetDir = process.argv[2] ? resolve(process.argv[2]) : root;
const buildId = (process.env.COMMIT_REF || process.env.GITHUB_SHA || `local-${Date.now()}`).slice(0, 12);

let deployNumber;
try {
  deployNumber = execSync("git rev-list --count HEAD", { cwd: root, encoding: "utf8" }).trim();
  if (!/^\d+$/.test(deployNumber)) throw new Error("unexpected git output");
} catch {
  deployNumber = String(Date.now()).slice(-6); // fallback: still unique, just not a clean small count
}

const targets = ["index.html", "service-worker.js", "js/app.js"];

for (const relativePath of targets) {
  const fullPath = resolve(targetDir, relativePath);
  const original = await readFile(fullPath, "utf8");
  const updated = original.replaceAll("__BUILD_ID__", buildId).replaceAll("__DEPLOY_NUMBER__", deployNumber);
  await writeFile(fullPath, updated, "utf8");
}

console.log(`Injected build ID "${buildId}" and deploy number "${deployNumber}" into ${targets.join(", ")} (in ${targetDir})`);
