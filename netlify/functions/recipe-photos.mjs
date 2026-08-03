import { getStore } from "@netlify/blobs";

// Same store-fallback pattern as household-sync.mjs - see that file for why
// both explicit credentials and the automatic-context store are tried.
function getPhotoStores() {
  const siteID = process.env.NETLIFY_BLOBS_SITE_ID || process.env.SITE_ID;
  const token = process.env.NETLIFY_BLOBS_TOKEN;
  const stores = [];
  if (siteID && token) stores.push(getStore({ name: "recipe-photos", siteID, token }));
  stores.push(getStore("recipe-photos"));
  return stores;
}

async function withPhotoStore(operation) {
  const stores = getPhotoStores();
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
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};

function json(body, statusCode = 200) {
  return new Response(JSON.stringify(body), {
    status: statusCode,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      ...CORS_HEADERS
    }
  });
}

// A household could in principle photograph a lot of dishes - keep a sane
// per-recipe cap so one recipe's gallery can't grow unbounded.
const MAX_PHOTOS_PER_RECIPE = 12;
const MAX_IMAGE_CHARACTERS = 2_000_000;
const RECIPE_ID_PATTERN = /^[a-zA-Z0-9_-]{1,80}$/;

function photoId() {
  return `p${Date.now()}${Math.random().toString(36).slice(2, 8)}`;
}

async function loadIndex(store, recipeId) {
  const index = await store.get(`index:${recipeId}`, { type: "json" });
  return Array.isArray(index) ? index : [];
}

const PHOTO_CHECK_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["approved", "reason"],
  properties: {
    approved: { type: "boolean" },
    reason: { type: "string" }
  }
};

async function verifyDishPhoto(apiKey, image, recipeTitle) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-4.1-mini-2025-04-14",
        input: [
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: `This photo was uploaded to a family recipe app (with children as users) as a photo of the finished dish "${recipeTitle}". Check two things: (1) is this a real, appropriate photo with nothing unsafe, violent, sexual, or otherwise inappropriate for a family app with children, and (2) does it show actual food that could plausibly be this dish or a reasonable home-cooked version of it. Home cooking varies a lot in presentation, so be generous - only reject the food-match on approved:false if it is clearly not food at all, or obviously unrelated to this dish (e.g. a screenshot, a person's face, a random object, or a completely different category of food like a picture of a car or a cat). If either check fails, set approved to false and give a short, friendly reason a home cook would understand.`
              },
              { type: "input_image", image_url: image }
            ]
          }
        ],
        max_output_tokens: 300,
        store: false,
        text: {
          format: {
            type: "json_schema",
            name: "photo_check",
            strict: true,
            schema: PHOTO_CHECK_SCHEMA
          }
        }
      })
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data?.error?.message || `OpenAI API error (${response.status}).`);
    }

    const parsed = extractPhotoCheckOutput(data);

    if (!parsed || typeof parsed.approved !== "boolean") {
      throw new Error("Could not read the photo check result.");
    }

    return { approved: parsed.approved, reason: typeof parsed.reason === "string" ? parsed.reason.slice(0, 200) : "" };
  } finally {
    clearTimeout(timeout);
  }
}

function extractPhotoCheckOutput(data) {
  if (data && typeof data.output_parsed === "object" && data.output_parsed) {
    return data.output_parsed;
  }

  const candidates = [];

  if (typeof data?.output_text === "string") candidates.push(data.output_text);

  for (const item of Array.isArray(data?.output) ? data.output : []) {
    for (const piece of Array.isArray(item?.content) ? item.content : []) {
      if (typeof piece?.text === "string") candidates.push(piece.text);
    }
  }

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      // try the next candidate
    }
  }

  return null;
}

export default async (request) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  try {
    if (request.method === "GET") {
      const url = new URL(request.url);
      const recipeId = String(url.searchParams.get("recipeId") || "");

      if (!RECIPE_ID_PATTERN.test(recipeId)) {
        return json({ error: "Invalid recipe id." }, 400);
      }

      const index = await withPhotoStore(store => loadIndex(store, recipeId));

      const photos = await withPhotoStore(async store => {
        const results = [];
        for (const entry of index) {
          const image = await store.get(`photo:${recipeId}:${entry.id}`);
          if (image) results.push({ ...entry, image });
        }
        return results;
      });

      return json({ photos });
    }

    if (request.method === "POST") {
      let body;

      try {
        body = await request.json();
      } catch {
        return json({ error: "Invalid JSON body." }, 400);
      }

      const recipeId = String(body.recipeId || "");

      if (!RECIPE_ID_PATTERN.test(recipeId)) {
        return json({ error: "Invalid recipe id." }, 400);
      }

      const action = body.action === "favorite" || body.action === "delete" ? body.action : "add";

      if (action === "add") {
        const image = typeof body.image === "string" ? body.image : "";

        if (!image.startsWith("data:image/")) {
          return json({ error: "Invalid image data." }, 400);
        }

        if (image.length > MAX_IMAGE_CHARACTERS) {
          return json({ error: "That photo is too large. Try a closer, single photo of the dish." }, 413);
        }

        const recipeTitle = typeof body.recipeTitle === "string" ? body.recipeTitle.slice(0, 120) : "this dish";
        const apiKey = process.env.OPENAI_API_KEY;

        if (!apiKey) {
          return json({ error: "Photo checking is not configured (OPENAI_API_KEY missing)." }, 500);
        }

        let verification;
        try {
          verification = await verifyDishPhoto(apiKey, image, recipeTitle);
        } catch (error) {
          // Fail closed, not open: if the safety check itself can't run, reject
          // the upload rather than silently let an unchecked photo through.
          return json({ error: "Couldn't verify that photo right now - try again in a moment." }, 503);
        }

        if (!verification.approved) {
          return json({ error: verification.reason || "That photo doesn't look like it shows this dish. Try a clear photo of the finished food." }, 422);
        }

        const uploadedBy = typeof body.uploadedBy === "string" ? body.uploadedBy.slice(0, 60) : "";

        const result = await withPhotoStore(async store => {
          const index = await loadIndex(store, recipeId);

          if (index.length >= MAX_PHOTOS_PER_RECIPE) {
            return { tooMany: true };
          }

          const id = photoId();
          const entry = { id, uploadedBy, uploadedAt: Date.now(), isFavorite: index.length === 0 };
          index.push(entry);

          await store.set(`photo:${recipeId}:${id}`, image);
          await store.setJSON(`index:${recipeId}`, index);

          return { entry };
        });

        if (result.tooMany) {
          return json({ error: `This recipe already has ${MAX_PHOTOS_PER_RECIPE} photos - remove one before adding another.` }, 413);
        }

        return json({ ok: true, photo: { ...result.entry, image } });
      }

      if (action === "favorite") {
        const photoIdToFavorite = String(body.photoId || "");

        const updated = await withPhotoStore(async store => {
          const index = await loadIndex(store, recipeId);
          let found = false;
          const next = index.map(entry => {
            if (entry.id === photoIdToFavorite) {
              found = true;
              return { ...entry, isFavorite: true };
            }
            return { ...entry, isFavorite: false };
          });
          if (found) await store.setJSON(`index:${recipeId}`, next);
          return found;
        });

        if (!updated) return json({ error: "Photo not found." }, 404);
        return json({ ok: true });
      }

      if (action === "delete") {
        const photoIdToDelete = String(body.photoId || "");

        await withPhotoStore(async store => {
          const index = await loadIndex(store, recipeId);
          const remaining = index.filter(entry => entry.id !== photoIdToDelete);
          if (remaining.length > 0 && !remaining.some(entry => entry.isFavorite)) {
            remaining[0].isFavorite = true;
          }
          await store.setJSON(`index:${recipeId}`, remaining);
          await store.delete(`photo:${recipeId}:${photoIdToDelete}`);
        });

        return json({ ok: true });
      }
    }

    return json({ error: "Use GET or POST" }, 405);
  } catch (error) {
    return json({ error: `Recipe photo storage failed: ${error?.message || error}` }, 500);
  }
};
