import { getStore } from "@netlify/blobs";

export default async () => {
  const siteID = process.env.NETLIFY_BLOBS_SITE_ID || process.env.SITE_ID;
  const token = process.env.NETLIFY_BLOBS_TOKEN;
  const out = {
    hasSiteID: Boolean(siteID),
    siteIDPrefix: siteID ? siteID.slice(0, 8) : null,
    hasToken: Boolean(token),
    tokenPrefix: token ? token.slice(0, 6) : null,
    tokenLength: token ? token.length : 0,
    context: process.env.CONTEXT || null,
    deployId: process.env.DEPLOY_ID || null
  };

  try {
    const store = getStore({ name: "households", siteID, token });
    const result = await store.get("ANGZWU83", { type: "json" });
    out.liveTest = { ok: true, found: Boolean(result) };
  } catch (error) {
    out.liveTest = { ok: false, message: error?.message || String(error), name: error?.name || null };
  }

  return new Response(JSON.stringify(out, null, 2), { headers: { "Content-Type": "application/json" } });
};
