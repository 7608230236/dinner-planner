import { getStore } from "@netlify/blobs";

function getHouseholdStore() {
  const siteID = process.env.NETLIFY_BLOBS_SITE_ID || process.env.SITE_ID;
  const token = process.env.NETLIFY_BLOBS_TOKEN;
  if (siteID && token) {
    return getStore({ name: "households", siteID, token });
  }
  return getStore("households");
}

// TEMPORARY diagnostic endpoint - lists household codes so the user can
// recover access after a local-storage origin change wiped their saved
// code. Safe for now since this app has only ever had one real household
// (the developer's own). Remove after use.
export default async () => {
  try {
    const store = getHouseholdStore();
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
    return new Response(JSON.stringify({ households: results }, null, 2), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error?.message || String(error) }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
};
