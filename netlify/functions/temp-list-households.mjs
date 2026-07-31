import { getStore } from "@netlify/blobs";

// TEMPORARY diagnostic endpoint - lists household codes so the user can
// recover access after a local-storage origin change wiped their saved
// code. Safe for now since this app has only ever had one real household
// (the developer's own). Remove after use.
export default async () => {
  const siteID = process.env.NETLIFY_BLOBS_SITE_ID || process.env.SITE_ID;
  const token = process.env.NETLIFY_BLOBS_TOKEN;
  const diag = {
    hasSiteID: Boolean(siteID),
    hasToken: Boolean(token),
    siteIDPrefix: siteID ? siteID.slice(0, 6) : null
  };

  async function tryList(store, label) {
    try {
      const { blobs } = await store.list();
      const results = [];
      for (const b of blobs) {
        const data = await store.get(b.key, { type: "json" }).catch(() => null);
        results.push({
          code: b.key,
          updatedBy: data?.updatedBy || "",
          updatedAt: data?.updatedAt || "",
          hasWeek: Boolean(data?.state?.week),
          hasHave: Array.isArray(data?.state?.have) ? data.state.have.length : 0
        });
      }
      return { ok: true, source: label, households: results };
    } catch (error) {
      return { ok: false, source: label, error: error?.message || String(error), status: error?.status || null };
    }
  }

  const attempts = [];
  if (siteID && token) {
    attempts.push(await tryList(getStore({ name: "households", siteID, token }), "explicit-credentials"));
  }
  attempts.push(await tryList(getStore("households"), "automatic-context"));

  const success = attempts.find(a => a.ok);
  return new Response(JSON.stringify({ diag, attempts, result: success || null }, null, 2), {
    status: success ? 200 : 500,
    headers: { "Content-Type": "application/json" }
  });
};
