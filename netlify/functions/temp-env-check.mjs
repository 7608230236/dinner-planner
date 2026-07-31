export default async () => {
  const siteID = process.env.NETLIFY_BLOBS_SITE_ID || process.env.SITE_ID;
  const token = process.env.NETLIFY_BLOBS_TOKEN;
  return new Response(JSON.stringify({
    hasSiteID: Boolean(siteID),
    siteIDPrefix: siteID ? siteID.slice(0, 8) : null,
    hasToken: Boolean(token),
    tokenPrefix: token ? token.slice(0, 6) : null,
    tokenLength: token ? token.length : 0,
    hasBlobsSiteIdVar: Boolean(process.env.NETLIFY_BLOBS_SITE_ID),
    hasPlainSiteIdVar: Boolean(process.env.SITE_ID),
    context: process.env.CONTEXT || null,
    deployId: process.env.DEPLOY_ID || null
  }, null, 2), { headers: { "Content-Type": "application/json" } });
};
