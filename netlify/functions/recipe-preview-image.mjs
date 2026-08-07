import { lookupOrFetchPreview, cleanRecipeQuery, buildAttribution } from "./lib/recipe-preview-lookup.mjs";

// Re-exported so the existing tests importing these directly from this file
// keep working unchanged.
export { cleanRecipeQuery, buildAttribution };

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

    const accessKey = process.env.UNSPLASH_ACCESS_KEY;
    const result = await lookupOrFetchPreview(recipeId, title, accessKey);

    if (result.error) {
      const status = /Blobs store unreachable/.test(result.error) ? 500 : 502;
      return json({ image: null, error: `Recipe preview image lookup failed: ${result.error}` }, status);
    }

    return json({ image: result.image, cached: result.cached, configured: result.configured });
  } catch (error) {
    return json({ error: `Recipe preview image lookup failed: ${error?.message || error}` }, 500);
  }
};
