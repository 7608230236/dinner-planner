// Read-only check of the live/submitted App Store listing metadata (keywords,
// subtitle, promotional text) - the stuff that actually drives App Store
// search ranking, as opposed to check-app-store-status.mjs which only
// reports review state. Writes results to a file since raw Actions logs
// aren't reachable from outside GitHub's own log storage.
import { writeFile } from 'node:fs/promises';
import { SignJWT, importPKCS8 } from 'jose';

const keyId = process.env.APP_STORE_CONNECT_KEY_ID;
const issuerId = process.env.APP_STORE_CONNECT_ISSUER_ID;
const p8 = process.env.APP_STORE_CONNECT_API_KEY_P8;
const bundleId = process.env.BUNDLE_ID || 'com.dinnermadeeasy.app';

const log = [];
const record = (...args) => { const line = args.join(' '); console.log(line); log.push(line); };

async function main() {
  if (!keyId || !issuerId || !p8) throw new Error('Missing required App Store Connect secrets.');

  const privateKey = await importPKCS8(p8, 'ES256');
  const jwt = await new SignJWT({})
    .setProtectedHeader({ alg: 'ES256', kid: keyId, typ: 'JWT' })
    .setIssuer(issuerId)
    .setIssuedAt()
    .setExpirationTime('19m')
    .setAudience('appstoreconnect-v1')
    .sign(privateKey);

  async function callAPI(path) {
    const res = await fetch(`https://api.appstoreconnect.apple.com/v1/${path}`, {
      headers: { Authorization: `Bearer ${jwt}` }
    });
    const text = await res.text();
    const body = text ? JSON.parse(text) : null;
    if (!res.ok) throw new Error(`API error on ${path} (${res.status}): ${JSON.stringify(body)}`);
    return body;
  }

  const appsResp = await callAPI(`apps?filter[bundleId]=${encodeURIComponent(bundleId)}`);
  const app = appsResp.data?.[0];
  if (!app) throw new Error(`No app found for bundle id ${bundleId}`);
  record(`App: ${app.attributes.name} (${app.id})`);

  const versionsResp = await callAPI(`apps/${app.id}/appStoreVersions?limit=20`);
  const sorted = [...versionsResp.data].sort((a, b) => new Date(b.attributes.createdDate) - new Date(a.attributes.createdDate));

  for (const v of sorted.filter(v => v.attributes.platform === 'IOS')) {
    record(`\n=== Version "${v.attributes.versionString}" (state: ${v.attributes.appStoreState}) ===`);
    const locResp = await callAPI(`appStoreVersions/${v.id}/appStoreVersionLocalizations`);
    for (const loc of locResp.data || []) {
      record(`Locale: ${loc.attributes.locale}`);
      record(`  Keywords: ${loc.attributes.keywords || '(none set)'}`);
      record(`  Subtitle: ${loc.attributes.subtitle || '(none set)'}`);
      record(`  Promotional Text: ${loc.attributes.promotionalText || '(none set)'}`);
      record(`  Description (first 150 chars): ${(loc.attributes.description || '').slice(0, 150)}...`);
    }
  }

  // Also check for actual App Store subtitle (a separate field from
  // description/keywords, also a real search-ranking factor) and category.
  const infoResp = await callAPI(`apps/${app.id}/appInfos`);
  for (const info of infoResp.data || []) {
    record(`\nApp Info state: ${info.attributes?.appStoreState}`);
  }
}

let exitCode = 0;
try {
  await main();
} catch (error) {
  record(`\nFAILED: ${error.message}`);
  exitCode = 1;
}
await writeFile(new URL('../aso-check-result.txt', import.meta.url), log.join('\n') + '\n', 'utf8');
process.exit(exitCode);
