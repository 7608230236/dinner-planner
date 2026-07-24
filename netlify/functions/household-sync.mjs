import { getStore } from "@netlify/blobs";

// Netlify's automatic Blobs context injection is documented to sometimes fail in
// production even when everything is set up correctly (a known platform issue,
// not specific to this app). Falling back to explicit siteID/token avoids that.
function getHouseholdStore() {
  const siteID = process.env.NETLIFY_BLOBS_SITE_ID || process.env.SITE_ID;
  const token = process.env.NETLIFY_BLOBS_TOKEN;

  if (siteID && token) {
    return getStore({ name: "households", siteID, token });
  }

  return getStore("households");
}

function json(body, statusCode = 200) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store"
    },
    body: JSON.stringify(body)
  };
}

// 6-10 uppercase letters/digits, excluding easily-confused characters (0/O, 1/I/L).
const CODE_PATTERN = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6,10}$/;

// Households are a shared, unauthenticated-by-design concept (anyone with the
// code can read/write it, like a private link) - keep payload size sane so one
// bad client can't fill storage or make every sync slow.
const MAX_PAYLOAD_CHARACTERS = 2_000_000;

export async function handler(event) {
  let store;

  try {
    store = getHouseholdStore();
  } catch (error) {
    return json({ error: `Blobs store unavailable: ${error?.message || error}` }, 500);
  }

  try {
    if (event.httpMethod === "GET") {
      const code = String(event.queryStringParameters?.code || "").toUpperCase();

      if (!CODE_PATTERN.test(code)) {
        return json({ error: "Invalid household code." }, 400);
      }

      const data = await store.get(code, { type: "json" });

      if (!data) {
        return json({ found: false });
      }

      return json({ found: true, state: data.state, updatedAt: data.updatedAt, updatedBy: data.updatedBy || "" });
    }

    if (event.httpMethod === "POST") {
      let body;

      try {
        body = JSON.parse(event.body || "{}");
      } catch {
        return json({ error: "Invalid JSON body." }, 400);
      }

      const code = String(body.code || "").toUpperCase();

      if (!CODE_PATTERN.test(code)) {
        return json({ error: "Invalid household code." }, 400);
      }

      if (body.state === undefined || body.state === null) {
        return json({ error: "Missing state." }, 400);
      }

      const serialized = JSON.stringify(body.state);

      if (serialized.length > MAX_PAYLOAD_CHARACTERS) {
        return json(
          { error: "Household data is too large to sync. Photos are not synced, but pantry/plan/shopping data has grown too big." },
          413
        );
      }

      const payload = {
        state: body.state,
        updatedAt: Date.now(),
        updatedBy: typeof body.deviceName === "string" ? body.deviceName.slice(0, 60) : ""
      };

      await store.setJSON(code, payload);

      return json({ ok: true, updatedAt: payload.updatedAt });
    }

    return json({ error: "Use GET or POST" }, 405);
  } catch (error) {
    return json({ error: `Household sync failed: ${error?.message || error}` }, 500);
  }
}
