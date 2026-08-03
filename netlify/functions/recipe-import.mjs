// Parses recipe text (extracted client-side from an uploaded .docx/.pdf/.txt
// file) into structured recipe data: a title, ingredients with quantities,
// and numbered steps. Follows the same request/response pattern as
// pantry-ai.mjs so it shares the same OpenAI key/model configuration.

const MAX_TEXT_CHARACTERS = 60_000;
const MAX_IMAGE_CHARACTERS = 8_000_000;
const MAX_INGREDIENTS = 40;
const MAX_STEPS = 20;

const RECIPE_RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["title", "ingredients", "steps"],
  properties: {
    title: {
      type: "string"
    },
    ingredients: {
      type: "array",
      maxItems: MAX_INGREDIENTS,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "amount"],
        properties: {
          name: {
            type: "string"
          },
          amount: {
            type: "string"
          }
        }
      }
    },
    steps: {
      type: "array",
      maxItems: MAX_STEPS,
      items: {
        type: "string"
      }
    }
  }
};

export async function handler(event) {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: CORS_HEADERS, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return json({ error: "Use POST" }, 405);
  }

  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return json(
      { error: "OPENAI_API_KEY is not set in Netlify environment variables." },
      500
    );
  }

  let body;

  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return json({ error: "Invalid JSON body." }, 400);
  }

  const text = typeof body.text === "string" ? body.text.trim() : "";
  const image = typeof body.image === "string" ? body.image : "";

  if (!text && !image) {
    return json({ error: "Missing document text or photo." }, 400);
  }

  if (text.length > MAX_TEXT_CHARACTERS) {
    return json(
      {
        error:
          "That document is too long to read at once. Try a shorter file, or paste just the one recipe you want."
      },
      413
    );
  }

  if (image) {
    if (!image.startsWith("data:image/")) {
      return json({ error: "Invalid image data URL." }, 400);
    }
    if (image.length > MAX_IMAGE_CHARACTERS) {
      return json(
        { error: "That photo is too large. Try a closer, single photo of the recipe." },
        413
      );
    }
  }

  const content = image
    ? [
        { type: "input_text", text: buildImagePrompt() },
        { type: "input_image", image_url: image }
      ]
    : [{ type: "input_text", text: buildPrompt(text) }];

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 50_000);

  try {
    const result = await requestRecipe({ apiKey, content, controller });

    if (!result.parsed || typeof result.parsed.title !== "string") {
      return json(
        {
          error: image
            ? "Could not read a recipe from that photo. Try a clearer, closer photo, or type it in by hand."
            : "Could not find a usable recipe in that document. Try a file with just one recipe, or type it in by hand.",
          requestId: result.requestId || "",
          model: result.model || ""
        },
        502
      );
    }

    const sanitized = sanitizeRecipe(result.parsed, image ? "photo" : "document");

    if (!sanitized.ok) {
      return json(
        {
          error: sanitized.reason,
          requestId: result.requestId || "",
          model: result.model || ""
        },
        502
      );
    }

    return json({
      recipe: sanitized.value,
      requestId: result.requestId || "",
      model: result.model || process.env.OPENAI_MODEL || "gpt-4.1-mini-2025-04-14"
    });
  } catch (err) {
    if (err?.name === "AbortError") {
      return json(
        { error: "The document import timed out. Try again, or type the recipe in by hand." },
        504
      );
    }

    return json({ error: err?.message || "Unexpected server error." }, 500);
  } finally {
    clearTimeout(timeout);
  }
}

async function requestRecipe({ apiKey, content, controller }) {
  const model = process.env.OPENAI_MODEL || "gpt-4.1-mini-2025-04-14";

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    signal: controller.signal,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      input: [
        {
          role: "user",
          content
        }
      ],
      max_output_tokens: 2000,
      store: false,
      text: {
        format: {
          type: "json_schema",
          name: "recipe_import",
          description: "One structured recipe extracted from an uploaded document or photo.",
          strict: true,
          schema: RECIPE_RESPONSE_SCHEMA
        }
      }
    })
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data?.error?.message || `OpenAI API error (${response.status}).`);
  }

  const candidate = extractStructuredOutput(data);

  return { parsed: candidate, requestId: data.id || "", model };
}

function buildImagePrompt() {
  return `You are reading ONE recipe from a photo for a kosher family dinner-planning app.

The photo may show a recipe card, a cookbook page, or handwritten notes. It may
contain one recipe, or several - if it contains more than one, extract only
the first complete recipe.

Return:
- title: the recipe's name, as written or lightly cleaned up.
- ingredients: each as {name, amount}. Keep the amount as written (e.g. "2 tbsp", "1 lb", "to taste"). If no amount is given, use an empty string.
- steps: the cooking instructions as a numbered list of clear, complete sentences. Do not invent steps that are not visible in the photo. If the photo is blurry or a word is unreadable, make your best reasonable reading rather than guessing wildly.

Do not translate or Americanize units. Do not add ingredients that are not visible in the photo.`;
}

function buildPrompt(text) {
  return `You are extracting ONE recipe from a document for a kosher family dinner-planning app.

The document text follows below. It may contain one recipe, or several - if it
contains more than one, extract only the first complete recipe.

Return:
- title: the recipe's name, as written or lightly cleaned up.
- ingredients: each as {name, amount}. Keep the amount as written (e.g. "2 tbsp", "1 lb", "to taste"). If no amount is given, use an empty string.
- steps: the cooking instructions as a numbered list of clear, complete sentences. Do not invent steps that are not in the document. If the steps in the document are just a list of loose notes, turn them into clear complete sentences without inventing new techniques or times not implied by the text.

Do not translate or Americanize units. Do not add ingredients that are not written in the document.

Document text:
"""
${text}
"""`;
}

function extractStructuredOutput(data) {
  if (data && typeof data.output_parsed === "object" && data.output_parsed) {
    return data.output_parsed;
  }

  const candidates = [];

  if (typeof data?.output_text === "string") {
    candidates.push(data.output_text);
  }

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

function sanitizeRecipe(raw, sourceLabel = "document") {
  const title = String(raw.title || "").trim().slice(0, 120);

  if (!title) {
    return { ok: false, reason: `The ${sourceLabel} didn't include a clear recipe title.` };
  }

  const ingredients = (Array.isArray(raw.ingredients) ? raw.ingredients : [])
    .map(ing => [
      String(ing?.name || "").trim().slice(0, 80),
      String(ing?.amount || "").trim().slice(0, 40)
    ])
    .filter(([name]) => name)
    .slice(0, MAX_INGREDIENTS);

  if (!ingredients.length) {
    return { ok: false, reason: `No ingredients could be found in that ${sourceLabel}.` };
  }

  const steps = (Array.isArray(raw.steps) ? raw.steps : [])
    .map(step => String(step || "").trim())
    .filter(Boolean)
    .slice(0, MAX_STEPS);

  return { ok: true, value: { title, ingredients, steps } };
}

// See pantry-ai.mjs for why these CORS headers exist even though this app is
// same-origin - a native app WebView loading the live site can, depending on
// the device, still send cross-origin-shaped requests to Netlify Functions.
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};

function json(obj, statusCode = 200) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...CORS_HEADERS
    },
    body: JSON.stringify(obj)
  };
}
