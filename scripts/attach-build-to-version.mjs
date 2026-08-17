// One-off, narrowly-scoped fix: attach an already-uploaded build to an
// unsubmitted app store version via the App Store Connect API directly,
// bypassing the App Store Connect website's Build picker (which has been
// showing an empty state for this account despite the build being confirmed
// "Ready to Submit" in TestFlight - a real, reproducible glitch, not a
// misunderstanding of the UI).
//
// This does ONE thing: PATCH the appStoreVersion's build relationship.
// It does NOT submit for review, release, or touch the already-live 1.0.
// Requires APP_STORE_CONNECT_KEY_ID, APP_STORE_CONNECT_ISSUER_ID,
// APP_STORE_CONNECT_API_KEY_P8 (same secrets check-app-store-status.mjs uses).
//
// Writes its full log (including any error) to attach-build-result.txt so
// the outcome can be reviewed even though raw Actions logs aren't reachable
// from outside GitHub's own log storage.
import { writeFile } from 'node:fs/promises';
import { SignJWT, importPKCS8 } from 'jose';

const keyId = process.env.APP_STORE_CONNECT_KEY_ID;
const issuerId = process.env.APP_STORE_CONNECT_ISSUER_ID;
const p8 = process.env.APP_STORE_CONNECT_API_KEY_P8;
const bundleId = process.env.BUNDLE_ID || 'com.dinnermadeeasy.app';
const targetVersionString = process.env.TARGET_VERSION_STRING || '1.0.1';
const targetBuildNumber = process.env.TARGET_BUILD_NUMBER || '55';

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

  async function callAPI(path, options = {}) {
    const res = await fetch(`https://api.appstoreconnect.apple.com/v1/${path}`, {
      ...options,
      headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json', ...(options.headers || {}) }
    });
    const text = await res.text();
    const body = text ? JSON.parse(text) : null;
    if (!res.ok) throw new Error(`API error on ${options.method || 'GET'} ${path} (${res.status}): ${JSON.stringify(body)}`);
    return body;
  }

  const appsResp = await callAPI(`apps?filter[bundleId]=${encodeURIComponent(bundleId)}`);
  const app = appsResp.data?.[0];
  if (!app) throw new Error(`No app found for bundle id ${bundleId}`);
  record(`App: ${app.attributes.name} (${app.id})`);

  const versionsResp = await callAPI(`apps/${app.id}/appStoreVersions?limit=20&sort=-createdDate`);
  const version = versionsResp.data.find(v => v.attributes.versionString === targetVersionString && v.attributes.platform === 'IOS');
  if (!version) {
    record(`No IOS appStoreVersion found matching "${targetVersionString}". Available versions:`);
    versionsResp.data.forEach(v => record(`  - ${v.attributes.versionString} (${v.attributes.platform}) state=${v.attributes.appStoreState}`));
    throw new Error(`Version "${targetVersionString}" not found.`);
  }
  record(`Found version ${targetVersionString}: id=${version.id}, state=${version.attributes.appStoreState}`);

  const buildsResp = await callAPI(`builds?filter[app]=${app.id}&filter[version]=${encodeURIComponent(targetBuildNumber)}&limit=5`);
  const build = buildsResp.data?.[0];
  if (!build) throw new Error(`No build found with version/build number "${targetBuildNumber}".`);
  record(`Found build ${targetBuildNumber}: id=${build.id}, processingState=${build.attributes.processingState}`);

  await callAPI(`appStoreVersions/${version.id}/relationships/build`, {
    method: 'PATCH',
    body: JSON.stringify({ data: { type: 'builds', id: build.id } })
  });
  record('\nSUCCESS: Build attached to version via the API.');
  record('This did NOT submit for review or release anything - go back to App Store Connect and confirm the build now shows, then submit for review manually as usual.');
}

let exitCode = 0;
try {
  await main();
} catch (error) {
  record(`\nFAILED: ${error.message}`);
  exitCode = 1;
}
await writeFile(new URL('../attach-build-result.txt', import.meta.url), log.join('\n') + '\n', 'utf8');
process.exit(exitCode);
