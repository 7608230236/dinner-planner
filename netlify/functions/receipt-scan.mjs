const MAX_ITEMS = 40;
const MAX_IMAGE_CHARACTERS = 8_000_000;

const ALLOWED_UNITS = new Set([
  "lb",
  "oz",
  "package",
  "box",
  "jar",
  "can",
  "bag",
  "bottle",
  "each",
  "cup",
  "container",
  "gallon",
  "clove",
  "bulb",
  "loaf",
  "bunch",
  "unknown"
]);

const ALLOWED_CATEGORIES = new Set([
  "produce",
  "meat",
  "fish",
  "dairy",
  "eggs",
  "frozen",
  "dry goods",
  "canned",
  "condiment",
  "other"
]);

// Non-grocery receipt lines we should never treat as pantry items even if the
// model mislabels them - tax, totals, loyalty program noise, etc.
const NON_ITEM = /^(sub ?total|total|tax|change|cash|card|debit|credit|balance|savings|coupon|discount|loyalty|rewards|thank you|order|receipt|store|cashier|register|visa|mastercard|amex|tender|payment)/i;

const RECEIPT_RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["items"],
  properties: {
    items: {
      type: "array",
      maxItems: MAX_ITEMS,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "name",
          "rawText",
          "qty",
          "unit",
          "category",
          "estimatedShelfLifeDays",
          "confidence"
        ],
        properties: {
          name: { type: "string" },
          rawText: { type: "string" },
          qty: {
            anyOf: [{ type: "number" }, { type: "null" }]
          },
          unit: { type: "string", enum: [...ALLOWED_UNITS] },
          category: { type: "string", enum: [...ALLOWED_CATEGORIES] },
          estimatedShelfLifeDays: {
            anyOf: [{ type: "number" }, { type: "null" }]
          },
          confidence: { type: "string", enum: ["high", "medium"] }
        }
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

  const image = body.image;
  const photoId = typeof body.photoId === "string" ? body.photoId.slice(0, 100) : "";
  const purchaseDate =
    typeof body.purchaseDate === "string" && !Number.isNaN(Date.parse(body.purchaseDate))
      ? body.purchaseDate
      : new Date().toISOString().slice(0, 10);

  if (!image || typeof image !== "string" || !image.startsWith("data:image/")) {
    return json({ error: "Missing image data URL." }, 400);
  }

  if (image.length > MAX_IMAGE_CHARACTERS) {
    return json(
      { error: "The photo is too large. Try a clearer, closer photo of the receipt." },
      413
    );
  }

  const prompt = buildPrompt();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 50_000);

  try {
    let result = await requestReceipt({ apiKey, image, prompt, controller });

    if (!result.parsed) {
      result = await requestReceipt({
        apiKey,
        image,
        prompt: `${prompt}\nIMPORTANT: Return the JSON object immediately. Do not add commentary.`,
        controller
      });
    }

    if (!result.parsed || !Array.isArray(result.parsed.items)) {
      const reason = result.incompleteReason ? ` (${result.incompleteReason})` : "";
      return json(
        {
          error: `The receipt could not be read${reason}. Try a clearer, flatter photo.`,
          requestId: result.requestId || "",
          model: result.model || ""
        },
        502
      );
    }

    const rejected = [];
    const items = [];

    for (const raw of result.parsed.items.slice(0, MAX_ITEMS * 2)) {
      const item = sanitizeItem(raw, purchaseDate);
      if (!item.ok) {
        rejected.push({ name: String(raw?.name || raw?.rawText || ""), reasons: item.reasons });
        continue;
      }
      items.push(item.value);
      if (items.length >= MAX_ITEMS) break;
    }

    return json({
      items,
      rejectedCount: rejected.length,
      rejectedItems: rejected.slice(0, 20),
      requestId: result.requestId || "",
      model: result.model || process.env.OPENAI_MODEL || "gpt-4.1-mini-2025-04-14",
      photoId
    });
  } catch (err) {
    if (err?.name === "AbortError") {
      return json({ error: "The receipt scan timed out. Please try again." }, 504);
    }
    return json({ error: err?.message || "Unexpected server error." }, 500);
  } finally {
    clearTimeout(timeout);
  }
}

async function requestReceipt({ apiKey, image, prompt, controller }) {
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
          content: [
            { type: "input_text", text: prompt },
            { type: "input_image", image_url: image }
          ]
        }
      ],
      max_output_tokens: 2600,
      store: false,
      text: {
        format: {
          type: "json_schema",
          name: "receipt_items",
          description: "Structured grocery items detected from a photo of a store receipt.",
          strict: true,
          schema: RECEIPT_RESPONSE_SCHEMA
        }
      }
    })
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error?.message || `OpenAI API error (${response.status}).`);
  }

  const candidate = extractStructuredOutput(data);
  return {
    parsed: candidate,
    requestId: data.id || "",
    model,
    incompleteReason: data?.incomplete_details?.reason || ""
  };
}

function buildPrompt() {
  return `You are reading a photo of a grocery store receipt for a kosher family dinner-planning app.

Extract each purchased grocery line item. Ignore store name/address, cashier/register info, subtotal, tax, total, payment method, change, coupons, loyalty program text, and any promotional lines.

Receipt text is often abbreviated (e.g. "GV WHL MLK GAL"). For each item, provide:
- rawText: the line exactly as printed on the receipt
- name: your best plain-English guess of the actual product (e.g. "Whole milk")
- qty: the number of units purchased (use null if genuinely unclear)
- unit: your best guess of the unit
- category: one of produce, meat, fish, dairy, eggs, frozen, dry goods, canned, condiment, other
- estimatedShelfLifeDays: a typical, reasonable number of days from purchase until this item is no longer good, based on common food-safety knowledge for that category (for example: fresh milk about 7-10 days, fresh produce about 5-7 days, bread about 5-7 days, eggs about 21-28 days, canned or dry goods about 365 days, frozen items about 90 days). Use null only if you cannot reasonably estimate a category at all.
- confidence: "high" if the item and quantity are clearly identifiable from the text, otherwise "medium"

Return at most ${MAX_ITEMS} items. Do not invent items that are not on the receipt.`;
}

function extractStructuredOutput(data) {
  if (data && typeof data.output_parsed === "object" && data.output_parsed) {
    return data.output_parsed;
  }

  const candidates = [];
  if (typeof data?.output_text === "string") {
    candidates.push(data.output_text);
  }

  for (const item of data?.output || []) {
    if (item && typeof item.parsed === "object" && item.parsed) {
      return item.parsed;
    }
    for (const content of item?.content || []) {
      if (content && typeof content.parsed === "object" && content.parsed) {
        return content.parsed;
      }
      if (content && typeof content.json === "object" && content.json) {
        return content.json;
      }
      if (typeof content?.text === "string") candidates.push(content.text);
      if (typeof content?.output_text === "string") candidates.push(content.output_text);
    }
  }

  for (const candidate of candidates) {
    const parsed = parseJson(candidate);
    if (parsed) return parsed;
  }

  return null;
}

function sanitizeItem(raw, purchaseDate) {
  const reasons = [];

  const rawText = String(raw?.rawText || "").trim().slice(0, 120);
  const name = String(raw?.name || "").trim().slice(0, 80);

  if (!name) reasons.push("missing name");
  if (NON_ITEM.test(name) || NON_ITEM.test(rawText)) reasons.push("not a grocery item");

  let qty = raw?.qty;
  if (qty !== "" && qty !== null && qty !== undefined) {
    qty = Number(qty);
    if (!Number.isFinite(qty) || qty <= 0 || qty > 100) reasons.push("implausible quantity");
  } else {
    qty = 1;
  }

  const confidence = ["high", "medium"].includes(raw?.confidence) ? raw.confidence : "";
  if (!confidence) reasons.push("invalid confidence");

  const rawUnit = String(raw?.unit || "").toLowerCase();
  const unit = ALLOWED_UNITS.has(rawUnit) ? rawUnit : "unknown";
  const category = ALLOWED_CATEGORIES.has(raw?.category) ? raw.category : "other";

  let shelfLifeDays = raw?.estimatedShelfLifeDays;
  if (shelfLifeDays !== "" && shelfLifeDays !== null && shelfLifeDays !== undefined) {
    shelfLifeDays = Math.round(Number(shelfLifeDays));
    if (!Number.isFinite(shelfLifeDays) || shelfLifeDays <= 0 || shelfLifeDays > 1095) {
      reasons.push("implausible shelf life");
    }
  } else {
    shelfLifeDays = null;
  }

  let expiresOn = null;
  if (Number.isFinite(shelfLifeDays)) {
    const purchased = new Date(`${purchaseDate}T00:00:00Z`);
    purchased.setUTCDate(purchased.getUTCDate() + shelfLifeDays);
    expiresOn = purchased.toISOString().slice(0, 10);
  }

  return {
    ok: reasons.length === 0,
    reasons,
    value: {
      name,
      rawText,
      qty,
      unit,
      category,
      confidence: confidence || "medium",
      estimatedShelfLifeDays: shelfLifeDays,
      expiresOn
    }
  };
}

function parseJson(text) {
  if (text && typeof text === "object") return text;
  const value = String(text || "").trim();
  if (!value) return null;

  try {
    return JSON.parse(value);
  } catch {
    // Continue to recovery attempts below.
  }

  const fenced = value.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) {
    try {
      return JSON.parse(fenced[1].trim());
    } catch {
      // Continue to the next recovery attempt.
    }
  }

  const start = value.indexOf("{");
  const end = value.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(value.slice(start, end + 1));
    } catch {
      // The response was not usable JSON.
    }
  }

  return null;
}

// See pantry-ai.mjs for why these are needed (native app calls this cross-origin).
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
