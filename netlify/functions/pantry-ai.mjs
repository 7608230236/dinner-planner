const MAX_IMAGE_CHARACTERS = 8_000_000;
const MAX_ITEMS = 20;

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
  "dairy",
  "frozen",
  "dry goods",
  "canned",
  "condiment",
  "other"
]);

const GENERIC =
  /^(pantry|spices?|various jars?|canned goods?|food|groceries|containers?|produce|vegetables?|fruit|meat|dairy|frozen food)$/i;

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
        required: [
          "name",
          "qty",
          "unit",
          "confidence",
          "category",
          "perishable",
          "evidence",
          "quantityBasis",
          "bbox"
        ],
        properties: {
          name: {
            type: "string"
          },
          qty: {
            anyOf: [
              {
                type: "number"
              },
              {
                type: "null"
              }
            ]
          },
          unit: {
            type: "string",
            enum: [...ALLOWED_UNITS]
          },
          confidence: {
            type: "string",
            enum: ["high", "medium"]
          },
          category: {
            type: "string",
            enum: [...ALLOWED_CATEGORIES]
          },
          perishable: {
            type: "boolean"
          },
          evidence: {
            type: "string"
          },
          quantityBasis: {
            type: "string",
            enum: ["visible", "label", "unknown"]
          },
          bbox: {
            anyOf: [
              {
                type: "array",
                minItems: 4,
                maxItems: 4,
                items: {
                  type: "number",
                  minimum: 0,
                  maximum: 1000
                }
              },
              {
                type: "null"
              }
            ]
          }
        }
      }
    }
  }
};

export async function handler(event) {
  if (event.httpMethod !== "POST") {
    return json(
      {
        error: "Use POST"
      },
      405
    );
  }

  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return json(
      {
        error:
          "OPENAI_API_KEY is not set in Netlify environment variables."
      },
      500
    );
  }

  let body;

  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return json(
      {
        error: "Invalid JSON body."
      },
      400
    );
  }

  const image = body.image;
  const catalog = Array.isArray(body.catalog)
    ? body.catalog.slice(0, 120)
    : [];

  const location =
    typeof body.location === "string"
      ? body.location.slice(0, 40)
      : "Kitchen";

  const photoId =
    typeof body.photoId === "string"
      ? body.photoId.slice(0, 100)
      : "";

  if (
    !image ||
    typeof image !== "string" ||
    !image.startsWith("data:image/")
  ) {
    return json(
      {
        error: "Missing image data URL."
      },
      400
    );
  }

  if (image.length > MAX_IMAGE_CHARACTERS) {
    return json(
      {
        error:
          "The image is too large. Try a closer photo of one shelf."
      },
      413
    );
  }

  const prompt = buildPrompt(location, catalog);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 50_000);

  try {
    let result = await requestInventory({
      apiKey,
      image,
      prompt,
      controller
    });

    if (!result.parsed) {
      result = await requestInventory({
        apiKey,
        image,
        prompt:
          `${prompt}\nIMPORTANT: Return the JSON object immediately. ` +
          `Do not add commentary.`,
        controller
      });
    }

    if (!result.parsed || !Array.isArray(result.parsed.items)) {
      const reason = result.incompleteReason
        ? ` (${result.incompleteReason})`
        : "";

      return json(
        {
          error:
            `The photo analysis did not produce usable inventory data${reason}. ` +
            `Tap Retry this photo.`,
          requestId: result.requestId || "",
          model: result.model || ""
        },
        502
      );
    }

    const rejected = [];
    const items = [];

    for (const raw of result.parsed.items.slice(0, MAX_ITEMS * 2)) {
      const item = sanitizeItem(raw);

      if (!item.ok) {
        rejected.push({
          name: String(raw?.name || ""),
          reasons: item.reasons
        });

        continue;
      }

      items.push(item.value);

      if (items.length >= MAX_ITEMS) {
        break;
      }
    }

    return json({
      items,
      rejectedCount: rejected.length,
      rejectedItems: rejected.slice(0, 20),
      requestId: result.requestId || "",
      model:
        result.model ||
        process.env.OPENAI_MODEL ||
        "gpt-5-mini",
      photoId
    });
  } catch (err) {
    if (err?.name === "AbortError") {
      return json(
        {
          error:
            "The pantry scan timed out. Tap Retry this photo."
        },
        504
      );
    }

    return json(
      {
        error:
          err?.message || "Unexpected server error."
      },
      500
    );
  } finally {
    clearTimeout(timeout);
  }
}

async function requestInventory({
  apiKey,
  image,
  prompt,
  controller
}) {
  const model =
    process.env.OPENAI_MODEL || "gpt-5-mini";

  const response = await fetch(
    "https://api.openai.com/v1/responses",
    {
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
              {
                type: "input_text",
                text: prompt
              },
              {
                type: "input_image",
                image_url: image
              }
            ]
          }
        ],
        max_output_tokens: 2200,
        store: false,
        text: {
          format: {
            type: "json_schema",
            name: "pantry_inventory",
            description:
              "Structured grocery inventory detected from one kitchen photo.",
            strict: true,
            schema: PANTRY_RESPONSE_SCHEMA
          }
        }
      })
    }
  );

  const data = await response
    .json()
    .catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      data?.error?.message ||
        `OpenAI API error (${response.status}).`
    );
  }

  const candidate = extractStructuredOutput(data);

  return {
    parsed: candidate,
    requestId: data.id || "",
    model,
    incompleteReason:
      data?.incomplete_details?.reason || ""
  };
}

function buildPrompt(location, catalog) {
  return `You are inspecting ONE kitchen inventory photo for a kosher family dinner-planning app.

The user labeled this photo: ${location}.

Identify only clearly visible food or readable food labels.

Return at most ${MAX_ITEMS} items.

Do not guess opaque packages.

Do not return generic groups such as pantry, food, produce, vegetables, spices, jars, or canned goods.

Quantity means the number of visible items or packages.

Use null when quantity cannot be determined.

Keep fresh tomatoes, canned tomatoes, tomato sauce, and tomato paste separate.

Use high confidence only when identity and quantity are clear.

Use medium confidence only when the identity is clear but some detail is uncertain.

Ignore dishes, appliances, cleaning products, decorations, medications, and non-food objects.

bbox uses normalized 0–1000 coordinates in this order:

[left, top, right, bottom]

Use null for bbox when the location cannot be identified reliably.

Catalog hints are listed below.

Use them only as hints and never force a match:

${JSON.stringify(catalog)}`;
}

function extractStructuredOutput(data) {
  if (
    data &&
    typeof data.output_parsed === "object" &&
    data.output_parsed
  ) {
    return data.output_parsed;
  }

  const candidates = [];

  if (typeof data?.output_text === "string") {
    candidates.push(data.output_text);
  }

  for (const item of data?.output || []) {
    if (
      item &&
      typeof item.parsed === "object" &&
      item.parsed
    ) {
      return item.parsed;
    }

    for (const content of item?.content || []) {
      if (
        content &&
        typeof content.parsed === "object" &&
        content.parsed
      ) {
        return content.parsed;
      }

      if (
        content &&
        typeof content.json === "object" &&
        content.json
      ) {
        return content.json;
      }

      if (typeof content?.text === "string") {
        candidates.push(content.text);
      }

      if (typeof content?.output_text === "string") {
        candidates.push(content.output_text);
      }
    }
  }

  for (const candidate of candidates) {
    const parsed = parseJson(candidate);

    if (parsed) {
      return parsed;
    }
  }

  return null;
}

function sanitizeItem(raw) {
  const reasons = [];

  const name = String(raw?.name || "")
    .trim()
    .slice(0, 80);

  if (!name) {
    reasons.push("missing name");
  }

  if (GENERIC.test(name)) {
    reasons.push("generic description");
  }

  let qty = raw?.qty;

  if (
    qty !== "" &&
    qty !== null &&
    qty !== undefined
  ) {
    qty = Number(qty);

    if (
      !Number.isFinite(qty) ||
      qty < 0 ||
      qty > 100
    ) {
      reasons.push("implausible quantity");
    }
  } else {
    qty = "";
  }

  const confidence = ["high", "medium"].includes(
    raw?.confidence
  )
    ? raw.confidence
    : "";

  if (!confidence) {
    reasons.push("invalid confidence");
  }

  const evidence = String(raw?.evidence || "")
    .trim()
    .slice(0, 180);

  if (
    confidence === "medium" &&
    !evidence
  ) {
    reasons.push(
      "medium confidence without evidence"
    );
  }

  const quantityBasis = [
    "visible",
    "label",
    "unknown"
  ].includes(raw?.quantityBasis)
    ? raw.quantityBasis
    : "unknown";

  if (
    quantityBasis === "label" &&
    typeof qty === "number"
  ) {
    const countPattern = new RegExp(
      `(?:^|\\D)${Math.trunc(qty)}(?:\\D|$)`
    );

    if (!countPattern.test(evidence)) {
      reasons.push(
        "printed count not present in evidence"
      );
    }
  }

  const rawUnit = String(
    raw?.unit || ""
  ).toLowerCase();

  const unit = ALLOWED_UNITS.has(rawUnit)
    ? rawUnit
    : "unknown";

  const category = ALLOWED_CATEGORIES.has(
    raw?.category
  )
    ? raw.category
    : "other";

  let bbox = null;

  if (
    Array.isArray(raw?.bbox) &&
    raw.bbox.length === 4 &&
    raw.bbox.every((number) =>
      Number.isFinite(Number(number))
    )
  ) {
    const values = raw.bbox.map((number) =>
      Math.max(
        0,
        Math.min(1000, Number(number))
      )
    );

    if (
      values[2] > values[0] &&
      values[3] > values[1]
    ) {
      bbox = values;
    } else {
      reasons.push("invalid bounding box");
    }
  }

  return {
    ok: reasons.length === 0,
    reasons,
    value: {
      name,
      qty,
      unit,
      confidence: confidence || "medium",
      category,
      perishable: Boolean(raw?.perishable),
      evidence,
      quantityBasis,
      bbox
    }
  };
}

function parseJson(text) {
  if (text && typeof text === "object") {
    return text;
  }

  const value = String(text || "").trim();

  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value);
  } catch {
    // Continue to the recovery attempts below.
  }

  const fenced = value.match(
    /```(?:json)?\s*([\s\S]*?)```/i
  );

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
      return JSON.parse(
        value.slice(start, end + 1)
      );
    } catch {
      // The response was not usable JSON.
    }
  }

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
