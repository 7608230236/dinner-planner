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

  // Subtitle lives on appInfoLocalizations (app-level metadata), not
  // appStoreVersionLocalizations (version-level metadata like description/
  // keywords/promotional text) - confirmed via Apple's own WWDC20 API
  // documentation after the first attempt hit a 409 targeting the wrong
  // resource. There are typically two appInfos entries (one READY_FOR_SALE
  // matching what's live, one PREPARE_FOR_SUBMISSION which is the editable
  // one) - target the editable one.
  const infoResp = await callAPI(`apps/${app.id}/appInfos`);
  const editableInfo = infoResp.data.find(i => i.attributes?.appStoreState === 'PREPARE_FOR_SUBMISSION') || infoResp.data[0];
  if (!editableInfo) throw new Error('No appInfo found.');
  record(`Using appInfo: id=${editableInfo.id}, state=${editableInfo.attributes?.appStoreState}`);

  const infoLocResp = await callAPI(`appInfos/${editableInfo.id}/appInfoLocalizations`);
  const infoLoc = infoLocResp.data.find(l => l.attributes.locale === 'en-US');
  if (!infoLoc) throw new Error('No en-US appInfoLocalization found.');
  record(`Current subtitle: "${infoLoc.attributes.subtitle || '(none set)'}"`);

  await callAPI(`appInfoLocalizations/${infoLoc.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ data: { type: 'appInfoLocalizations', id: infoLoc.id, attributes: { subtitle: newSubtitle } } })
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
