import { getStore } from "@netlify/blobs";

// Same store-fallback pattern as household-sync.mjs / recipe-photos.mjs - see
// those files for why both explicit credentials and the automatic-context
// store are tried.
function getPreviewStores() {
  const siteID = process.env.NETLIFY_BLOBS_SITE_ID || process.env.SITE_ID;
  const token = process.env.NETLIFY_BLOBS_TOKEN;
  const stores = [];
  if (siteID && token) stores.push(getStore({ name: "recipe-preview-images", siteID, token }));
  stores.push(getStore("recipe-preview-images"));
  return stores;
}

async function withPreviewStore(operation) {
  const stores = getPreviewStores();
  let lastError;
  for (const store of stores) {
    try {
      return await operation(store);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};

function json(body, statusCode = 200) {
  return new Response(JSON.stringify(body), {
    status: statusCode,
    headers: {
      "Content-Type": "application/json",
      // These results almost never change once cached, and the client also
      // caches them - but a short cache still saves a Blobs read on rapid
      // repeat views (e.g. flipping back and forth in the weekly plan).
      "Cache-Control": "public, max-age=3600",
      ...CORS_HEADERS
    }
  });
}

const RECIPE_ID_PATTERN = /^[a-zA-Z0-9_-]{1,80}$/;

// Recipe titles are written for a person reading a meal plan, not for an
// image search engine - "Korean-Style Cheesy Rice Bowl — with Crusty Bread"
// searched verbatim returns a photo of plain bread as often as the actual
// dish, since the tacked-on side dominates the query. Strip the parts that
// only make sense to a human (the side-dish suffix, kosher-specific words
// like "Shabbos", filler words like "Classic"/"Mild") and search on the core
// dish concept instead. Verified against real library titles before this
// shipped - see the conversation this was built in for the before/after
// examples that justified each rule below.
export function cleanRecipeQuery(title) {
  const cleaned = String(title || "")
    .replace(/\s*—\s*(with|Classic|Simple Family Style).*/i, "")
    .replace(/\bMild\b\s*/gi, "")
    .replace(/\bShabbos\b\s*/gi, "")
    .replace(/-Style\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  return `${cleaned} dinner food`;
}

// Unsplash's API guidelines (required, not optional, to keep API access):
// attribution must link to both the photographer's profile and Unsplash
// itself, each tagged with utm_source/utm_medium so Unsplash can see the
// referral - a plain-text name and a bare unsplash.com link don't count.
export function buildAttribution(photographerProfileUrl) {
  const attributionParams = "utm_source=dinner_made_easy&utm_medium=referral";
  return {
    creditUrl: photographerProfileUrl ? `${photographerProfileUrl}?${attributionParams}` : "",
    unsplashUrl: `https://unsplash.com/?${attributionParams}`
  };
}

async function searchUnsplash(query, accessKey) {
  const url = new URL("https://api.unsplash.com/search/photos");
  url.searchParams.set("query", query);
  url.searchParams.set("per_page", "1");
  url.searchParams.set("orientation", "landscape");
  url.searchParams.set("content_filter", "high");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Authorization: `Client-ID ${accessKey}` }
    });
    if (!response.ok) throw new Error(`Unsplash API error (${response.status}).`);
    const data = await response.json();
    const first = data?.results?.[0];
    if (!first) return null;
    const { creditUrl, unsplashUrl } = buildAttribution(first.user?.links?.html);
    return {
      url: first.urls?.regular || first.urls?.small || null,
      credit: first.user?.name || "",
      creditUrl,
      unsplashUrl,
      // Required separately from attribution: Unsplash's guidelines say every
      // photo actually used by an app must ping this endpoint once, so they
      // can pay photographers based on real usage - not just when someone
      // browses the photo, but when the app actually puts it to use.
      downloadLocation: first.links?.download_location || null
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function triggerDownloadEvent(downloadLocation, accessKey) {
  if (!downloadLocation) return;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);
  try {
    await fetch(downloadLocation, { signal: controller.signal, headers: { Authorization: `Client-ID ${accessKey}` } });
  } catch {
    // Best-effort - a failed tracking ping shouldn't break the actual feature.
  } finally {
    clearTimeout(timeout);
  }
}

export default async (request) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (request.method !== "GET") {
    return json({ error: "Use GET" }, 405);
  }

  try {
    const url = new URL(request.url);
    const recipeId = String(url.searchParams.get("recipeId") || "");
    const title = String(url.searchParams.get("title") || "");

    if (!RECIPE_ID_PATTERN.test(recipeId)) {
      return json({ error: "Invalid recipe id." }, 400);
    }
    if (!title.trim()) {
      return json({ error: "Missing title." }, 400);
    }

    const cached = await withPreviewStore(store => store.get(`preview:${recipeId}`, { type: "json" }));
    if (cached) {
      return json({ image: cached, cached: true });
    }

    const accessKey = process.env.UNSPLASH_ACCESS_KEY;
    if (!accessKey) {
      // Not configured yet - fail quietly so the app just shows no preview
      // image rather than an error, until the key is added.
      return json({ image: null, configured: false });
    }

    const query = cleanRecipeQuery(title);
    let result;
    try {
      result = await searchUnsplash(query, accessKey);
    } catch (error) {
      return json({ image: null, error: `Image search failed: ${error?.message || error}` }, 502);
    }

    if (!result || !result.url) {
      // Cache the "no result" outcome too (as null), so a recipe with no
      // good match doesn't re-hit the Unsplash API on every single view.
      await withPreviewStore(store => store.setJSON(`preview:${recipeId}`, null));
      return json({ image: null });
    }

    // Fire the required usage ping exactly once, right here at the moment
    // this app first actually puts the photo to use for this recipe - not
    // on every cache hit afterward. Netlify Functions can terminate as soon
    // as a response is sent, so an un-awaited "fire and forget" call here
    // isn't reliable - await it (it has its own internal timeout/catch, so a
    // slow ping still can't hang the whole request for long).
    await triggerDownloadEvent(result.downloadLocation, accessKey);

    // downloadLocation was only needed for the ping above - no reason to
    // keep re-serving it to the client on every cached read afterward.
    const { downloadLocation, ...cacheable } = result;
    await withPreviewStore(store => store.setJSON(`preview:${recipeId}`, cacheable));
    return json({ image: cacheable, cached: false });
  } catch (error) {
    return json({ error: `Recipe preview image lookup failed: ${error?.message || error}` }, 500);
  }
};
