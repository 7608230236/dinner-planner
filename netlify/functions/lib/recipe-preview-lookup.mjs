import { getStore } from "@netlify/blobs";

// Same store-fallback pattern as household-sync.mjs / recipe-photos.mjs - see
// those files for why both explicit credentials and the automatic-context
// store are tried.
export function getPreviewStores() {
  const siteID = process.env.NETLIFY_BLOBS_SITE_ID || process.env.SITE_ID;
  const token = process.env.NETLIFY_BLOBS_TOKEN;
  const stores = [];
  if (siteID && token) stores.push(getStore({ name: "recipe-preview-images", siteID, token }));
  stores.push(getStore("recipe-preview-images"));
  return stores;
}

export async function withPreviewStore(operation) {
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

export async function searchUnsplash(query, accessKey) {
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

export async function triggerDownloadEvent(downloadLocation, accessKey) {
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

// The one shared "look up (or fetch+cache) a preview image for this recipe"
// operation - used by the on-demand per-recipe function (recipe-preview-image.mjs)
// when a person opens a recipe with no cached image yet, AND by the batch
// warmer (recipe-image-warmer.mjs) that pre-fills the cache for the whole
// library ahead of time. Both need the exact same cache-check -> search ->
// download-ping -> cache-write sequence, so it lives here once instead of
// being duplicated (and risking drifting out of sync) in two places.
//
// Returns { image, cached, configured, error } - never throws; the caller
// decides what to do with a failure.
export async function lookupOrFetchPreview(recipeId, title, accessKey) {
  let cached;
  try {
    cached = await withPreviewStore(store => store.get(`preview:${recipeId}`, { type: "json" }));
  } catch (error) {
    return { image: null, cached: false, configured: Boolean(accessKey), error: `Blobs store unreachable: ${error?.message || error}` };
  }
  if (cached) {
    return { image: cached, cached: true, configured: Boolean(accessKey), error: null };
  }

  if (!accessKey) {
    return { image: null, cached: false, configured: false, error: null };
  }

  const query = cleanRecipeQuery(title);
  let result;
  try {
    result = await searchUnsplash(query, accessKey);
  } catch (error) {
    return { image: null, cached: false, configured: true, error: `Image search failed: ${error?.message || error}` };
  }

  if (!result || !result.url) {
    // Cache the "no result" outcome too (as null), so a recipe with no good
    // match doesn't re-hit the Unsplash API on every single view/warm pass.
    await withPreviewStore(store => store.setJSON(`preview:${recipeId}`, null)).catch(() => {});
    return { image: null, cached: false, configured: true, error: null };
  }

  await triggerDownloadEvent(result.downloadLocation, accessKey);

  const { downloadLocation, ...cacheable } = result;
  await withPreviewStore(store => store.setJSON(`preview:${recipeId}`, cacheable));
  return { image: cacheable, cached: false, configured: true, error: null };
}
