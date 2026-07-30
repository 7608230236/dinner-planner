import { createRemoteJWKSet, jwtVerify } from "jose";
import { randomUUID } from "node:crypto";
import { getUsersStore, createSession } from "./lib/auth.mjs";

// See pantry-ai.mjs for why these are needed (native app calls this cross-origin).
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
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

const APPLE_JWKS = createRemoteJWKSet(new URL("https://appleid.apple.com/auth/keys"));
const GOOGLE_JWKS = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));

// Native "Sign in with Apple" issues a token whose audience is the app's own
// bundle ID. Google's audience is the OAuth client ID created for this app.
const APPLE_BUNDLE_ID = "com.dinnermadeeasy.app";

async function verifyAppleToken(idToken) {
  const { payload } = await jwtVerify(idToken, APPLE_JWKS, {
    issuer: "https://appleid.apple.com",
    audience: APPLE_BUNDLE_ID
  });
  return payload;
}

async function verifyGoogleToken(idToken) {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  if (!clientId) {
    throw new Error("GOOGLE_OAUTH_CLIENT_ID is not set in Netlify environment variables.");
  }
  const { payload } = await jwtVerify(idToken, GOOGLE_JWKS, {
    issuer: ["https://accounts.google.com", "accounts.google.com"],
    audience: clientId
  });
  return payload;
}

export async function handler(event) {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: CORS_HEADERS, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return json({ error: "Use POST" }, 405);
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return json({ error: "Invalid JSON body." }, 400);
  }

  const provider = body.provider === "apple" || body.provider === "google" ? body.provider : null;
  const idToken = typeof body.idToken === "string" ? body.idToken : "";

  if (!provider) return json({ error: "provider must be 'apple' or 'google'." }, 400);
  if (!idToken) return json({ error: "Missing idToken." }, 400);

  let payload;
  try {
    payload = provider === "apple" ? await verifyAppleToken(idToken) : await verifyGoogleToken(idToken);
  } catch (error) {
    return json({ error: `Could not verify sign-in: ${error?.message || error}` }, 401);
  }

  const providerId = String(payload.sub || "");
  if (!providerId) return json({ error: "Sign-in token did not include a user id." }, 401);

  // Apple's ID token often does NOT include a name (Apple only sends the
  // person's name once, directly to the client, on their very first sign-in
  // ever) - accept it separately from the client for that first-time case.
  const suppliedName = typeof body.name === "string" ? body.name.trim().slice(0, 80) : "";
  const email = typeof payload.email === "string" ? payload.email : "";

  let store;
  try {
    store = getUsersStore();
  } catch (error) {
    return json({ error: `User store unavailable: ${error?.message || error}` }, 500);
  }

  const userKey = `${provider}:${providerId}`;

  try {
    let user = await store.get(userKey, { type: "json" });

    if (!user) {
      user = {
        id: randomUUID(),
        provider,
        providerId,
        email,
        name: suppliedName || (email ? email.split("@")[0] : "Cook"),
        createdAt: Date.now()
      };
      await store.setJSON(userKey, user);
    } else if (suppliedName && !user.name) {
      user.name = suppliedName;
      await store.setJSON(userKey, user);
    }

    const sessionToken = await createSession(user);

    return json({
      sessionToken,
      user: { id: user.id, name: user.name, email: user.email }
    });
  } catch (error) {
    return json({ error: `Sign-in failed: ${error?.message || error}` }, 500);
  }
}
