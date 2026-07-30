import { getStore } from "@netlify/blobs";
import { randomUUID } from "node:crypto";

// Test-only: lets tests substitute an in-memory store instead of making
// real network calls to Netlify's Blobs API (which isn't reachable in a
// sandboxed test environment, and shouldn't need to be for testing this
// code's own logic).
let storeOverride = null;
export function __setStoreOverrideForTests(factory) {
  storeOverride = factory;
}

// See household-sync.mjs for why the explicit siteID/token fallback exists.
function getBlobsStore(name) {
  if (storeOverride) return storeOverride(name);

  const siteID = process.env.NETLIFY_BLOBS_SITE_ID || process.env.SITE_ID;
  const token = process.env.NETLIFY_BLOBS_TOKEN;

  if (siteID && token) {
    return getStore({ name, siteID, token });
  }

  return getStore(name);
}

export function getUsersStore() {
  return getBlobsStore("community-users");
}

export function getSessionsStore() {
  return getBlobsStore("community-sessions");
}

export function getRecipesStore() {
  return getBlobsStore("community-recipes");
}

const SESSION_TTL_MS = 90 * 24 * 60 * 60 * 1000; // 90 days

export async function createSession(user) {
  const sessionToken = randomUUID();
  const sessionsStore = getSessionsStore();

  await sessionsStore.setJSON(sessionToken, {
    userId: user.id,
    email: user.email,
    name: user.name,
    createdAt: Date.now(),
    expiresAt: Date.now() + SESSION_TTL_MS
  });

  return sessionToken;
}

// Returns the session record if the token is valid and not expired, else null.
export async function verifySession(sessionToken) {
  if (!sessionToken || typeof sessionToken !== "string") return null;

  const sessionsStore = getSessionsStore();
  const session = await sessionsStore.get(sessionToken, { type: "json" });

  if (!session) return null;
  if (session.expiresAt && session.expiresAt < Date.now()) return null;

  return session;
}
