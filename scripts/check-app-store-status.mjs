// Checks the real App Store Connect review status for the app.
// Requires APP_STORE_CONNECT_KEY_ID, APP_STORE_CONNECT_ISSUER_ID,
// APP_STORE_CONNECT_API_KEY_P8 env vars (already used for TestFlight upload).
import { SignJWT, importPKCS8 } from 'jose';

const keyId = process.env.APP_STORE_CONNECT_KEY_ID;
const issuerId = process.env.APP_STORE_CONNECT_ISSUER_ID;
const p8 = process.env.APP_STORE_CONNECT_API_KEY_P8;
const bundleId = process.env.BUNDLE_ID || 'com.dinnermadeeasy.app';

if (!keyId || !issuerId || !p8) {
  console.error('Missing required App Store Connect secrets.');
  process.exit(1);
}

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
  const body = await res.json();
  if (!res.ok) {
    console.error(`API error on ${path}:`, JSON.stringify(body));
    process.exit(1);
  }
  return body;
}

const appsResp = await callAPI(`apps?filter[bundleId]=${encodeURIComponent(bundleId)}`);
const app = appsResp.data?.[0];
if (!app) {
  console.error(`No app found for bundle id ${bundleId}`);
  process.exit(1);
}
console.log(`App found: ${app.attributes.name} (id ${app.id})`);

const versionsResp = await callAPI(
  `apps/${app.id}/appStoreVersions?limit=5&sort=-createdDate`
);

for (const v of versionsResp.data || []) {
  const a = v.attributes;
  console.log(`--- Version ${a.versionString} ---`);
  console.log(`App Store state: ${a.appStoreState}`);
  console.log(`Created: ${a.createdDate}`);
  if (a.reviewType) console.log(`Review type: ${a.reviewType}`);
}

// Also surface any review submission info, if present.
const submissionsResp = await callAPI(
  `apps/${app.id}/reviewSubmissions?limit=5&sort=-id&include=items`
).catch(() => null);
if (submissionsResp?.data?.length) {
  console.log('\n--- Review submissions ---');
  for (const s of submissionsResp.data) {
    console.log(`State: ${s.attributes.state}, submitted: ${s.attributes.submittedDate || 'n/a'}`);
  }
}
