import { execFileSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = new URL("../", import.meta.url).pathname;
const targets = [];

function walk(directory) {
  for (const name of readdirSync(directory)) {
    if ([".git", "node_modules"].includes(name)) continue;
    const full = join(directory, name);
    const stat = statSync(full);
    if (stat.isDirectory()) walk(full);
    else if (/\.(?:js|mjs)$/.test(name)) targets.push(full);
  }
}

walk(root);
for (const file of targets) {
  execFileSync(process.execPath, ["--check", file], { stdio: "inherit" });
  console.log(`checked ${relative(root, file)}`);
}
