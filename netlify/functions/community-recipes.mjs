import { randomUUID } from "node:crypto";
import { verifySession, getRecipesStore } from "./lib/auth.mjs";

// See pantry-ai.mjs for why these are needed (native app calls this cross-origin).
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};

function json(body, statusCode = 200) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      ...CORS_HEADERS
    },
    body: JSON.stringify(body)
  };
}

const MAX_RECIPES_LISTED = 200;
const MAX_TITLE = 100;
const MAX_INGREDIENTS = 40;
const MAX_STEPS = 20;

const ADAPT_RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["approved", "rejectionReason", "kind", "title", "ingredients", "steps", "kashrutNotes"],
  properties: {
    approved: { type: "boolean" },
    rejectionReason: { anyOf: [{ type: "string" }, { type: "null" }] },
    kind: { type: "string", enum: ["meat", "dairy", "pareve"] },
    title: { type: "string" },
    ingredients: {
      type: "array",
      maxItems: MAX_INGREDIENTS,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "amount"],
        properties: { name: { type: "string" }, amount: { type: "string" } }
      }
    },
    steps: { type: "array", maxItems: MAX_STEPS, items: { type: "string" } },
    kashrutNotes: { type: "string" }
  }
};

function buildPrompt(raw) {
  return `You are reviewing a home cook's recipe submission for a Chabad kosher family dinner app. Every recipe shown in this app - whether from the app's own library or submitted by another user - must read at the same strict Chabad kosher standard, regardless of what the original submitter personally keeps.

Do the following:

1. REJECT (approved: false, with a clear rejectionReason) if the recipe contains: fish, shellfish, pork, tofu, turkey, or any dish that mixes meat and dairy together. Also reject if it is not a real food recipe.

2. Otherwise APPROVE it and rewrite the recipe:
   - Determine "kind": "meat", "dairy", or "pareve" based on the actual ingredients.
   - Every dairy ingredient (milk, cheese, butter, cream, yogurt, etc.) must be rewritten to explicitly say "Cholov Yisroel" (e.g. "cheese" becomes "Cholov Yisroel cheese").
   - Do not add meat/dairy language to a pareve recipe - leave pareve ingredients as-is.
   - Keep the recipe's actual content (title, ingredient amounts, steps) as close to the original submission as possible - you are relabeling for kashrut clarity, not rewriting the dish.
   - Set "kashrutNotes" to a short, single sentence appropriate to the kind - for a meat recipe: "Meat must be from Chabad-approved shechita." For dairy: "All dairy must be Cholov Yisroel." For pareve: "Pareve - contains no meat or dairy, but check that any packaged ingredients are kosher certified."

Original submission:
Title: ${raw.title}
Ingredients:
${raw.ingredients.map(i => `- ${i.amount ? i.amount + " " : ""}${i.name}`).join("\n")}
Steps:
${raw.steps.map((s, i) => `${i + 1}. ${s}`).join("\n")}`;
}

async function adaptRecipeToChabadStandard(raw, apiKey) {
  const model = process.env.OPENAI_MODEL || "gpt-4.1-mini-2025-04-14";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 50_000);

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      signal: controller.signal,
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        input: [{ role: "user", content: [{ type: "input_text", text: buildPrompt(raw) }] }],
        max_output_tokens: 1800,
        store: false,
        text: {
          format: {
            type: "json_schema",
            name: "recipe_adaptation",
            description: "A community recipe reviewed and rewritten to Chabad kosher standard.",
            strict: true,
            schema: ADAPT_RESPONSE_SCHEMA
          }
        }
      })
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data?.error?.message || `OpenAI API error (${response.status}).`);
    }

    if (data && typeof data.output_parsed === "object" && data.output_parsed) {
      return data.output_parsed;
    }
    if (typeof data.output_text === "string") {
      try {
        return JSON.parse(data.output_text);
      } catch {
        // fall through to the other extraction attempts below
      }
    }
    for (const item of data?.output || []) {
      for (const content of item?.content || []) {
        if (content?.parsed) return content.parsed;
        if (content?.json) return content.json;
        if (typeof content?.text === "string") {
          try {
            return JSON.parse(content.text);
          } catch {
            // try the next candidate
          }
        }
      }
    }
    throw new Error("The recipe review did not produce a usable result. Please try again.");
  } finally {
    clearTimeout(timeout);
  }
}

export async function handler(event) {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: CORS_HEADERS, body: "" };
  }

  let store;
  try {
    store = getRecipesStore();
  } catch (error) {
    return json({ error: `Recipe store unavailable: ${error?.message || error}` }, 500);
  }

  if (event.httpMethod === "GET") {
    try {
      const { blobs } = await store.list();
      const recipes = [];
      for (const blob of blobs.slice(0, MAX_RECIPES_LISTED)) {
        const recipe = await store.get(blob.key, { type: "json" });
        if (recipe) recipes.push(recipe);
      }
      recipes.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      return json({ recipes });
    } catch (error) {
      return json({ error: `Could not load community recipes: ${error?.message || error}` }, 500);
    }
  }

  if (event.httpMethod === "POST") {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return json({ error: "OPENAI_API_KEY is not set in Netlify environment variables." }, 500);
    }

    let body;
    try {
      body = JSON.parse(event.body || "{}");
    } catch {
      return json({ error: "Invalid JSON body." }, 400);
    }

    const session = await verifySession(body.sessionToken);
    if (!session) {
      return json({ error: "Please sign in to share a recipe." }, 401);
    }

    const title = String(body.title || "").trim().slice(0, MAX_TITLE);
    const ingredients = Array.isArray(body.ingredients)
      ? body.ingredients.slice(0, MAX_INGREDIENTS).map(i => ({
          name: String(i?.name || "").trim().slice(0, 80),
          amount: String(i?.amount || "").trim().slice(0, 40)
        })).filter(i => i.name)
      : [];
    const steps = Array.isArray(body.steps)
      ? body.steps.slice(0, MAX_STEPS).map(s => String(s || "").trim().slice(0, 300)).filter(Boolean)
      : [];

    if (!title) return json({ error: "Please add a title." }, 400);
    if (!ingredients.length) return json({ error: "Please add at least one ingredient." }, 400);
    if (!steps.length) return json({ error: "Please add at least one step." }, 400);

    let adapted;
    try {
      adapted = await adaptRecipeToChabadStandard({ title, ingredients, steps }, apiKey);
    } catch (error) {
      if (error?.name === "AbortError") {
        return json({ error: "The recipe review timed out. Please try again." }, 504);
      }
      return json({ error: error?.message || "Unexpected server error." }, 500);
    }

    if (!adapted.approved) {
      return json({ error: adapted.rejectionReason || "This recipe could not be approved." }, 422);
    }

    const recipeId = randomUUID();
    const record = {
      id: recipeId,
      title: adapted.title || title,
      kind: adapted.kind,
      ingredients: Array.isArray(adapted.ingredients) ? adapted.ingredients : ingredients,
      steps: Array.isArray(adapted.steps) ? adapted.steps : steps,
      kashrutNotes: adapted.kashrutNotes || "",
      submittedByName: session.name || "A community cook",
      submittedByUserId: session.userId,
      createdAt: Date.now(),
      source: "community"
    };

    try {
      await store.setJSON(recipeId, record);
    } catch (error) {
      return json({ error: `Could not save the recipe: ${error?.message || error}` }, 500);
    }

    return json({ recipe: record });
  }

  return json({ error: "Use GET or POST" }, 405);
}
