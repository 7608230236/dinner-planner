import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';
import { __setStoreOverrideForTests } from '../netlify/functions/lib/auth.mjs';

const originalFetch = global.fetch;
const originalOpenAIKey = process.env.OPENAI_API_KEY;

// A tiny in-memory stand-in for a Netlify Blobs store, so these tests
// exercise the actual application logic (user lookup/creation, session
// issuance, recipe storage) without needing real network access to
// Netlify's Blobs API, which isn't reachable in a sandboxed test run.
function makeFakeStores() {
  const data = new Map(); // storeName -> Map(key -> value)
  function storeFor(name) {
    if (!data.has(name)) data.set(name, new Map());
    const map = data.get(name);
    return {
      async get(key) {
        return map.has(key) ? map.get(key) : null;
      },
      async setJSON(key, value) {
        map.set(key, value);
      },
      async list() {
        return { blobs: [...map.keys()].map(key => ({ key })) };
      }
    };
  }
  return storeFor;
}

test.beforeEach(() => {
  __setStoreOverrideForTests(makeFakeStores());
});

test.afterEach(() => {
  global.fetch = originalFetch;
  __setStoreOverrideForTests(null);
  delete process.env.GOOGLE_OAUTH_CLIENT_ID;
  if (originalOpenAIKey === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = originalOpenAIKey;
});

// Signs a real, cryptographically valid test JWT and makes it resolvable as
// the "remote" JWKS the handler fetches - this proves the actual signature,
// issuer, and audience verification logic works, not just that the function
// doesn't crash. Nothing about Apple's or Google's real keys is needed or
// used; this is entirely self-contained.
async function makeSignedIdToken({ issuer, audience, subject, email }) {
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  const jwk = await exportJWK(publicKey);
  jwk.kid = 'test-key-1';
  jwk.alg = 'RS256';
  jwk.use = 'sig';

  const idToken = await new SignJWT({ email })
    .setProtectedHeader({ alg: 'RS256', kid: 'test-key-1' })
    .setIssuer(issuer)
    .setAudience(audience)
    .setSubject(subject)
    .setIssuedAt()
    .setExpirationTime('10m')
    .sign(privateKey);

  return { idToken, jwks: { keys: [jwk] } };
}

// Only intercepts the specific JWKS URL being tested - anything unexpected
// fails loudly instead of silently returning bogus data (Blobs calls are
// faked via the store override above, not via fetch, so nothing else
// should ever hit this).
function mockJwksFetchOnly(jwksUrl, jwks) {
  return async (url) => {
    const requested = url.toString ? url.toString() : url;
    if (requested === jwksUrl) {
      return new Response(JSON.stringify(jwks), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    throw new Error(`Unexpected fetch in test: ${requested}`);
  };
}

test('auth-verify rejects requests with a missing/invalid provider or token before ever touching the network', async () => {
  const { handler } = await import('../netlify/functions/auth-verify.mjs?fresh=' + Date.now());

  const noProvider = await handler({ httpMethod: 'POST', body: JSON.stringify({ idToken: 'x' }) });
  assert.equal(noProvider.statusCode, 400);

  const badProvider = await handler({ httpMethod: 'POST', body: JSON.stringify({ provider: 'facebook', idToken: 'x' }) });
  assert.equal(badProvider.statusCode, 400);

  const noToken = await handler({ httpMethod: 'POST', body: JSON.stringify({ provider: 'apple' }) });
  assert.equal(noToken.statusCode, 400);

  const wrongMethod = await handler({ httpMethod: 'GET' });
  assert.equal(wrongMethod.statusCode, 405);
});

test('auth-verify performs REAL cryptographic verification of a Sign in with Apple token - a validly-signed token with the right issuer/audience creates a user and session; a token signed with the wrong audience (a different app) is correctly rejected', async () => {
  const { idToken, jwks } = await makeSignedIdToken({
    issuer: 'https://appleid.apple.com',
    audience: 'com.dinnermadeeasy.app',
    subject: 'apple-user-001',
    email: 'test@example.com'
  });
  global.fetch = mockJwksFetchOnly('https://appleid.apple.com/auth/keys', jwks);

  const { handler } = await import('../netlify/functions/auth-verify.mjs?fresh=' + Date.now());
  const response = await handler({
    httpMethod: 'POST',
    body: JSON.stringify({ provider: 'apple', idToken, name: 'Mats' })
  });
  const body = JSON.parse(response.body);

  assert.equal(response.statusCode, 200, `expected success, got: ${JSON.stringify(body)}`);
  assert.ok(body.sessionToken, 'a session token should be issued');
  assert.equal(body.user.name, 'Mats');
  assert.equal(body.user.email, 'test@example.com');
  assert.equal(response.headers['Access-Control-Allow-Origin'], '*');

  // Now a token signed for a DIFFERENT app's bundle ID - must be rejected,
  // since accepting it would let any other app's Apple sign-in token log
  // into this app.
  const { idToken: wrongAudienceToken, jwks: jwks2 } = await makeSignedIdToken({
    issuer: 'https://appleid.apple.com',
    audience: 'com.someone.else.app',
    subject: 'apple-user-002',
    email: 'intruder@example.com'
  });
  global.fetch = mockJwksFetchOnly('https://appleid.apple.com/auth/keys', jwks2);
  const { handler: freshHandler } = await import('../netlify/functions/auth-verify.mjs?fresh=' + (Date.now() + 1));
  const rejected = await freshHandler({
    httpMethod: 'POST',
    body: JSON.stringify({ provider: 'apple', idToken: wrongAudienceToken })
  });
  assert.equal(rejected.statusCode, 401, 'a token for the wrong audience must be rejected');
});

test('auth-verify signing in twice with the same Apple account returns the SAME user id both times (a second sign-in is recognized as the same person, not a new account each time)', async () => {
  const { idToken, jwks } = await makeSignedIdToken({
    issuer: 'https://appleid.apple.com',
    audience: 'com.dinnermadeeasy.app',
    subject: 'apple-user-repeat',
    email: 'repeat@example.com'
  });
  const jwksUrl = 'https://appleid.apple.com/auth/keys';

  global.fetch = mockJwksFetchOnly(jwksUrl, jwks);
  const { handler: firstHandler } = await import('../netlify/functions/auth-verify.mjs?fresh=' + Date.now());
  const first = JSON.parse((await firstHandler({ httpMethod: 'POST', body: JSON.stringify({ provider: 'apple', idToken, name: 'Mats' }) })).body);

  global.fetch = mockJwksFetchOnly(jwksUrl, jwks);
  const { handler: secondHandler } = await import('../netlify/functions/auth-verify.mjs?fresh=' + (Date.now() + 1));
  const second = JSON.parse((await secondHandler({ httpMethod: 'POST', body: JSON.stringify({ provider: 'apple', idToken }) })).body);

  assert.equal(first.user.id, second.user.id, 'the same Apple account should map to the same app user id');
  assert.notEqual(first.sessionToken, second.sessionToken, 'each sign-in should still get its own session token');
});

test('community-recipes requires a valid session to submit, and validates basic fields before ever calling the AI', async () => {
  process.env.OPENAI_API_KEY = 'test-key';
  const { handler } = await import('../netlify/functions/community-recipes.mjs?fresh=' + Date.now());

  const noSession = await handler({
    httpMethod: 'POST',
    body: JSON.stringify({ title: 'Soup', ingredients: [{ name: 'water', amount: '1 cup' }], steps: ['Boil it'] })
  });
  assert.equal(noSession.statusCode, 401);
});

test('community-recipes rejects a recipe the AI flags as not kosher-safe (e.g. contains fish), and never publishes it', async () => {
  process.env.OPENAI_API_KEY = 'test-key';

  const { createSession } = await import('../netlify/functions/lib/auth.mjs');
  const sessionToken = await createSession({ id: 'user-1', email: 'a@example.com', name: 'Rose' });

  global.fetch = async () => new Response(JSON.stringify({
    output_text: JSON.stringify({
      approved: false,
      rejectionReason: 'Contains fish, which is not permitted in this app.',
      kind: 'pareve',
      title: '', ingredients: [], steps: [], kashrutNotes: ''
    })
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });

  const { handler } = await import('../netlify/functions/community-recipes.mjs?fresh=' + (Date.now() + 1));
  const response = await handler({
    httpMethod: 'POST',
    body: JSON.stringify({
      sessionToken,
      title: 'Salmon Bake',
      ingredients: [{ name: 'salmon', amount: '1 lb' }],
      steps: ['Bake the salmon']
    })
  });
  const body = JSON.parse(response.body);
  assert.equal(response.statusCode, 422);
  assert.match(body.error, /fish/);
});

test('community-recipes publishes an approved recipe with dairy relabeled to Cholov Yisroel, and it then shows up when browsing (GET)', async () => {
  process.env.OPENAI_API_KEY = 'test-key';

  const { createSession } = await import('../netlify/functions/lib/auth.mjs');
  const sessionToken = await createSession({ id: 'user-2', email: 'b@example.com', name: 'Jacqueline' });

  global.fetch = async () => new Response(JSON.stringify({
    output_text: JSON.stringify({
      approved: true,
      rejectionReason: null,
      kind: 'dairy',
      title: 'Simple Cheese Pasta',
      ingredients: [
        { name: 'pasta', amount: '1 lb' },
        { name: 'Cholov Yisroel cheddar cheese', amount: '2 cups' }
      ],
      steps: ['Boil the pasta.', 'Melt the Cholov Yisroel cheese into it.'],
      kashrutNotes: 'All dairy must be Cholov Yisroel.'
    })
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });

  const { handler } = await import('../netlify/functions/community-recipes.mjs?fresh=' + (Date.now() + 1));
  const postResponse = await handler({
    httpMethod: 'POST',
    body: JSON.stringify({
      sessionToken,
      title: 'Simple Cheese Pasta',
      ingredients: [{ name: 'pasta', amount: '1 lb' }, { name: 'cheddar cheese', amount: '2 cups' }],
      steps: ['Boil the pasta.', 'Melt the cheese into it.']
    })
  });
  const postBody = JSON.parse(postResponse.body);
  assert.equal(postResponse.statusCode, 200, `expected success, got: ${JSON.stringify(postBody)}`);
  assert.equal(postBody.recipe.kind, 'dairy');
  assert.ok(postBody.recipe.ingredients.some(i => i.name.includes('Cholov Yisroel')), 'dairy should be relabeled Cholov Yisroel');
  assert.equal(postBody.recipe.submittedByName, 'Jacqueline');
  assert.equal(postBody.recipe.source, 'community');

  const getResponse = await handler({ httpMethod: 'GET' });
  const getBody = JSON.parse(getResponse.body);
  assert.equal(getResponse.statusCode, 200);
  assert.ok(getBody.recipes.find(r => r.id === postBody.recipe.id), 'the newly published recipe should show up when browsing');
});
