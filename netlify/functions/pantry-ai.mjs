const MAX_IMAGE_CHARACTERS = 8_000_000;
const MAX_ITEMS = 20;
const ALLOWED_UNITS = new Set([
  "lb","oz","package","box","jar","can","bag","bottle","each","cup","container","gallon","clove","bulb","loaf","bunch","unknown"
]);
const ALLOWED_CATEGORIES = new Set(["produce","meat","dairy","frozen","dry goods","canned","condiment","other"]);
const GENERIC = /^(pantry|spices?|various jars?|canned goods?|food|groceries|containers?|produce|vegetables?|fruit|meat|dairy|frozen food)$/i;

const PANTRY_RESPONSE_SCHEMA = {
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
        required: ["name","qty","unit","confidence","category","perishable","evidence","quantityBasis","bbox"],
        properties: {
          name: { type: "string" },
          qty: { anyOf: [{ type: "number" }, { type: "null" }] },
          unit: { type: "string", enum: [...ALLOWED_UNITS] },
          confidence: { type: "string", enum: ["high","medium"] },
          category: { type: "string", enum: [...ALLOWED_CATEGORIES] },
          perishable: { type: "boolean" },
          evidence: { type: "string" },
          quantityBasis: { type: "string", enum: ["visible","label","unknown"] },
          bbox: {
            anyOf: [
              { type: "array", minItems: 4, maxItems: 4, items: { type: "number", minimum: 0, maximum: 1000 } },
              { type: "null" }
            ]
          }
        }
      }
    }
  }
};

export async function handler(event) {
  if (event.httpMethod !== "POST") return json({ error: "Use POST" }, 405);

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return json({ error: "OPENAI_API_KEY is not set in Netlify environment variables." }, 500);

  let body;
  try { body = JSON.parse(event.body || "{}"); }
  catch { return json({ error: "Invalid JSON body." }, 400); }

  const image = body.image;
  const catalog = Array.isArray(body.catalog) ? body.catalog.slice(0, 120) : [];
  const location = typeof body.location === "string" ? body.location.slice(0, 40) : "Kitchen";
  const photoId = typeof body.photoId === "string" ? body.photoId.slice(0, 100) : "";

  if (!image || typeof image !== "string" || !image.startsWith("data:image/")) {
    return json({ error: "Missing image data URL." }, 400);
  }
  if (image.length > MAX_IMAGE_CHARACTERS) return json({ error: "The image is too large. Try a closer photo of one shelf." }, 413);

  const prompt = `
You are inspecting ONE kitchen inventory photo for a kosher family dinner-planning app.
The user labeled this photo: ${location}.

Return ONLY valid JSON in this exact shape:
{
  "items": [
    {
      "name": "specific plain grocery name",
      "qty": number_or_empty_string,
      "unit": "lb|oz|package|box|jar|can|bag|bottle|each|cup|container|gallon|clove|bulb|loaf|bunch|unknown",
      "confidence": "high|medium",
      "category": "produce|meat|dairy|frozen|dry goods|canned|condiment|other",
      "perishable": true_or_false,
      "evidence": "short visible reason, readable label, or package description",
      "quantityBasis": "visible|label|unknown",
      "bbox": [x1,y1,x2,y2] or null
    }
  ]
}

NON-NEGOTIABLE RULES:
- Include only food that is clearly identifiable from visible pixels or a readable label. Omit guesses.
- Return at most ${MAX_ITEMS} items. A shorter accurate list is better than a long list.
- Never return generic items such as pantry, spices, various jars, canned goods, food, groceries, produce, vegetables, or containers.
- Never infer the contents of an opaque or unreadable package.
- Quantity is inventory quantity, not ounces, calories, serving count, a date, barcode, model number, or price.
- quantityBasis="visible" means you counted visible individual items or packages.
- quantityBasis="label" is allowed only when a package clearly prints the contained count. The evidence MUST include that printed count.
- Example: a readable outer case that says "12 cans diced tomatoes" becomes name="canned tomatoes", qty=12, unit="can", quantityBasis="label".
- If the outer case count is not readable, record one visible outer box: qty=1, unit="box", quantityBasis="visible".
- Keep fresh tomatoes, canned tomatoes, tomato sauce, and tomato paste separate. Never substitute one for another.
- Use high confidence only when both identity and quantity are clear. Use medium only when identity is clear but quantity is approximate.
- Do not output low-confidence items.
- bbox coordinates are normalized 0–1000 [left,top,right,bottom]. Use null if a useful box cannot be estimated.
- Ignore dishes, appliances, cleaning products, decorations, medications, and non-food objects.
- Identify visible food even if the family may not want it in recipes; preferences are handled elsewhere.

Catalog hints only. Do not force a match:
${JSON.stringify(catalog)}
`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 28_000);
  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-5-mini",
        input: [{
          role: "user",
          content: [
            { type: "input_text", text: prompt },
            { type: "input_image", image_url: image }
          ]
        }],
        max_output_tokens: 1600,
        store: false,
        text: {
          format: {
            type: "json_schema",
            name: "pantry_inventory",
            description: "Strictly structured grocery inventory detected from one kitchen photo.",
            strict: true,
            schema: PANTRY_RESPONSE_SCHEMA
          }
        }
      })
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) return json({ error: data?.error?.message || "OpenAI API error." }, response.status);

    const text = extractOutputText(data);
    const parsed = parseJson(text);
    if (!parsed || !Array.isArray(parsed.items)) return json({ error: "AI returned an unreadable result." }, 502);

    const rejected = [];
    const items = [];
    for (const raw of parsed.items.slice(0, MAX_ITEMS * 2)) {
      const item = sanitizeItem(raw);
      if (!item.ok) { rejected.push({ name: String(raw?.name || ""), reasons: item.reasons }); continue; }
      items.push(item.value);
      if (items.length >= MAX_ITEMS) break;
    }

    return json({
      items,
      rejectedCount: rejected.length,
      rejectedItems: rejected.slice(0, 20),
      requestId: data.id || "",
      model: process.env.OPENAI_MODEL || "gpt-5-mini",
      photoId
    });
  } catch (err) {
    if (err?.name === "AbortError") return json({ error: "The pantry scan timed out. Try one closer photo." }, 504);
    return json({ error: err?.message || "Unexpected server error." }, 500);
  } finally {
    clearTimeout(timeout);
  }
}

function sanitizeItem(raw) {
  const reasons = [];
  const name = String(raw?.name || "").trim().slice(0, 80);
  if (!name) reasons.push("missing name");
  if (GENERIC.test(name)) reasons.push("generic description");

  let qty = raw?.qty;
  if (qty !== "" && qty !== null && qty !== undefined) {
    qty = Number(qty);
    if (!Number.isFinite(qty) || qty < 0 || qty > 100) reasons.push("implausible quantity");
  } else qty = "";

  const confidence = ["high", "medium"].includes(raw?.confidence) ? raw.confidence : "";
  if (!confidence) reasons.push("invalid confidence");
  const evidence = String(raw?.evidence || "").trim().slice(0, 180);
  if (confidence === "medium" && !evidence) reasons.push("medium confidence without evidence");

  const quantityBasis = ["visible", "label", "unknown"].includes(raw?.quantityBasis) ? raw.quantityBasis : "unknown";
  if (quantityBasis === "label" && typeof qty === "number") {
    const countPattern = new RegExp(`(?:^|\\D)${Math.trunc(qty)}(?:\\D|$)`);
    if (!countPattern.test(evidence)) reasons.push("printed count not present in evidence");
  }

  const unit = ALLOWED_UNITS.has(String(raw?.unit || "").toLowerCase()) ? String(raw.unit).toLowerCase() : "unknown";
  const category = ALLOWED_CATEGORIES.has(raw?.category) ? raw.category : "other";
  let bbox = null;
  if (Array.isArray(raw?.bbox) && raw.bbox.length === 4 && raw.bbox.every(n => Number.isFinite(Number(n)))) {
    const values = raw.bbox.map(n => Math.max(0, Math.min(1000, Number(n))));
    if (values[2] > values[0] && values[3] > values[1]) bbox = values;
    else reasons.push("invalid bounding box");
  }

  return {
    ok: reasons.length === 0,
    reasons,
    value: { name, qty, unit, confidence: confidence || "medium", category, perishable: Boolean(raw?.perishable), evidence, quantityBasis, bbox }
  };
}

function extractOutputText(data) {
  if (typeof data.output_text === "string") return data.output_text;
  const parts = [];
  for (const item of data.output || []) {
    for (const content of item.content || []) {
      if (typeof content.text === "string") parts.push(content.text);
      if (typeof content.output_text === "string") parts.push(content.output_text);
    }
  }
  return parts.join("\n").trim();
}

function parseJson(text) {
  try { return JSON.parse(text); } catch {}
  const match = String(text || "").match(/\{[\s\S]*\}/);
  if (match) { try { return JSON.parse(match[0]); } catch {} }
  return null;
}

function json(obj, statusCode = 200) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff"
    },
    body: JSON.stringify(obj)
  };
}
