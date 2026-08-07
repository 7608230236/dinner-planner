import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { getPreviewStores, lookupOrFetchPreview } from "./lib/recipe-preview-lookup.mjs";

// recipes.js is written for the browser (an IIFE that hangs its export off
// `window`), not as a Node module - the test suite already loads it the same
// way (set a bare `window` global, then require it). Reused here rather than
// re-deriving the recipe list some other way, so this can never drift out of
// sync with what the app itself actually ships.
function loadRecipes() {
  const require = createRequire(import.meta.url);
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
  const priorWindow = globalThis.window;
  globalThis.window = {};
  try {
    delete require.cache[require.resolve(resolve(root, "js/recipes.js"))];
    require(resolve(root, "js/recipes.js"));
    return globalThis.window.DinnerRecipes || [];
  } finally {
    globalThis.window = priorWindow;
  }
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};

function json(body, statusCode = 200) {
  return new Response(JSON.stringify(body), {
    status: statusCode,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...CORS_HEADERS }
  });
}

// Unsplash's free/demo tier is 50 requests/hour. Leave real headroom below
// that per run - this function can be called manually multiple times close
// together while testing, other requests share the same hourly budget (every
// real recipe view that doesn't hit cache also counts), and a hard 50 with no
// margin means one extra call anywhere trips the limit for the rest of the
// hour. 40 per run, run hourly, clears the full ~762-recipe library in under
// 20 runs with room to spare either way.
const BATCH_SIZE = 40;

export default async (request) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  try {
    const accessKey = process.env.UNSPLASH_ACCESS_KEY;
    if (!accessKey) {
      return json({ error: "UNSPLASH_ACCESS_KEY is not configured yet - nothing to warm." }, 200);
    }

    const recipes = loadRecipes();
    if (!recipes.length) {
      return json({ error: "Could not load the recipe library." }, 500);
    }

    // Netlify Blobs supports listing keys by prefix - use that to find which
    // recipes are already cached (successful match or a cached "no result"),
    // rather than doing a get() per recipe just to check existence, which
    // would itself burn through a big chunk of a Blobs read quota for no
    // reason on every single warmer run.
    let alreadyCached = new Set();
    try {
      const stores = getPreviewStores();
      for (const store of stores) {
        try {
          const { blobs } = await store.list({ prefix: "preview:" });
          alreadyCached = new Set(blobs.map(b => b.key.slice("preview:".length)));
          break;
        } catch {
          // try the next store in the fallback chain
        }
      }
    } catch (error) {
      return json({ error: `Could not list cached previews: ${error?.message || error}` }, 500);
    }

    const pending = recipes.filter(r => !alreadyCached.has(r.id)).slice(0, BATCH_SIZE);

    const results = { matched: 0, noMatch: 0, failed: 0, details: [] };
    for (const recipe of pending) {
      const outcome = await lookupOrFetchPreview(recipe.id, recipe.title, accessKey);
      if (outcome.error) {
        results.failed++;
        results.details.push({ id: recipe.id, status: "error", error: outcome.error });
      } else if (outcome.image) {
        results.matched++;
        results.details.push({ id: recipe.id, status: "matched" });
      } else {
        results.noMatch++;
        results.details.push({ id: recipe.id, status: "no-match" });
      }
    }

    const remaining = recipes.length - alreadyCached.size - pending.length;
    return json({
      totalRecipes: recipes.length,
      alreadyCachedBeforeThisRun: alreadyCached.size,
      processedThisRun: pending.length,
      remainingAfterThisRun: Math.max(0, remaining),
      ...results
    });
  } catch (error) {
    return json({ error: `Recipe image warmer failed: ${error?.message || error}` }, 500);
  }
};

// Runs automatically once an hour so the whole library fills in on its own -
// see BATCH_SIZE above for why 40/run stays safely under Unsplash's 50/hour
// limit. Can also be triggered manually (e.g. by hitting the function URL
// directly) to warm a batch on demand without waiting for the next tick.
export const config = { schedule: "@hourly" };
