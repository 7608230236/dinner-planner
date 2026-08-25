// One-off, narrowly-scoped: set the App Store subtitle for the live version's
// en-US localization. Subtitle is empty right now, which is a real gap since
// it's one of the top search-ranking factors on the App Store, right after
// the app name itself. This does ONE thing - PATCH the subtitle field - and
// nothing else (doesn't touch keywords, description, or submit anything).
import { writeFile } from 'node:fs/promises';
import { SignJWT, importPKCS8 } from 'jose';

const keyId = process.env.APP_STORE_CONNECT_KEY_ID;
const issuerId = process.env.APP_STORE_CONNECT_ISSUER_ID;
const p8 = process.env.APP_STORE_CONNECT_API_KEY_P8;
const bundleId = process.env.BUNDLE_ID || 'com.dinnermadeeasy.app';
const targetVersionString = (process.env.TARGET_VERSION_STRING || '1.0.1').trim();
const newSubtitle = process.env.NEW_SUBTITLE || 'Kosher Family Meal Planner';

const log = [];
const record = (...args) => { const line = args.join(' '); console.log(line); log.push(line); };

async function main() {
  if (!keyId || !issuerId || !p8) throw new Error('Missing required App Store Connect secrets.');
  if (newSubtitle.length > 30) throw new Error(`Subtitle "${newSubtitle}" is ${newSubtitle.length} chars, over Apple's 30-char limit.`);

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

  const versionsResp = await callAPI(`apps/${app.id}/appStoreVersions?limit=20`);
  const version = versionsResp.data.find(v => v.attributes.versionString.trim() === targetVersionString && v.attributes.platform === 'IOS');
  if (!version) throw new Error(`Version "${targetVersionString}" not found.`);
  record(`Found version ${targetVersionString}: id=${version.id}, state=${version.attributes.appStoreState}`);

  const locResp = await callAPI(`appStoreVersions/${version.id}/appStoreVersionLocalizations`);
  const loc = locResp.data.find(l => l.attributes.locale === 'en-US');
  if (!loc) throw new Error('No en-US localization found.');
  record(`Current subtitle: "${loc.attributes.subtitle || '(none set)'}"`);

  await callAPI(`appStoreVersionLocalizations/${loc.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ data: { type: 'appStoreVersionLocalizations', id: loc.id, attributes: { subtitle: newSubtitle } } })
  });
  record(`\nSUCCESS: Subtitle set to "${newSubtitle}".`);
}

let exitCode = 0;
try {
  await main();
} catch (error) {
  record(`\nFAILED: ${error.message}`);
  exitCode = 1;
}
await writeFile(new URL('../set-subtitle-result.txt', import.meta.url), log.join('\n') + '\n', 'utf8');
process.exit(exitCode);
