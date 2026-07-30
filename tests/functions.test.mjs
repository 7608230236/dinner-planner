import test from 'node:test';
import assert from 'node:assert/strict';
import { handler as pantryHandler } from '../netlify/functions/pantry-ai.mjs';
import { handler as storeHandler } from '../netlify/functions/store-locator.mjs';
import { handler as receiptHandler } from '../netlify/functions/receipt-scan.mjs';

const originalFetch = global.fetch;
const originalOpenAIKey = process.env.OPENAI_API_KEY;
const originalMapsKey = process.env.GOOGLE_MAPS_API_KEY;

test.afterEach(() => {
  global.fetch = originalFetch;
  if (originalOpenAIKey === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = originalOpenAIKey;
  if (originalMapsKey === undefined) delete process.env.GOOGLE_MAPS_API_KEY;
  else process.env.GOOGLE_MAPS_API_KEY = originalMapsKey;
});

test('pantry AI rejects generic and malformed detections but keeps a supported case count', async () => {
  process.env.OPENAI_API_KEY = 'test-key';
  let requestBody;
  global.fetch = async (_url, options) => {
    requestBody = JSON.parse(options.body);
    return new Response(JSON.stringify({
      id: 'resp_test',
      output_text: JSON.stringify({
        items: [
          { name: 'canned tomatoes', qty: 12, unit: 'can', confidence: 'high', category: 'canned', perishable: false, evidence: 'case label says 12 cans', quantityBasis: 'label', bbox: [100,100,800,800] },
          { name: 'pantry', qty: 1, unit: 'each', confidence: 'high', category: 'other', perishable: false, evidence: 'shelf', quantityBasis: 'visible', bbox: null },
          { name: 'rice', qty: 1, unit: 'bag', confidence: 'medium', category: 'dry goods', perishable: false, evidence: 'visible rice bag', quantityBasis: 'visible', bbox: [800,800,100,100] }
        ]
      })
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };

  const response = await pantryHandler({
    httpMethod: 'POST',
    body: JSON.stringify({ image: 'data:image/jpeg;base64,abc', location: 'Pantry', photoId: 'photo-1' })
  });
  const body = JSON.parse(response.body);

  assert.equal(response.statusCode, 200);
  assert.equal(body.items.length, 1);
  assert.equal(body.items[0].name, 'canned tomatoes');
  assert.equal(body.items[0].qty, 12);
  assert.equal(body.rejectedCount, 2);
  assert.equal(body.rejectedItems.length, 2);
  assert.equal(requestBody.store, false);
  assert.equal(requestBody.model, 'gpt-4.1-mini-2025-04-14');
  assert.equal(requestBody.text?.format?.type, 'json_schema');
  assert.equal(requestBody.text?.format?.strict, true);
});

test('store locator returns local directory stores without a Google key', async () => {
  delete process.env.GOOGLE_MAPS_API_KEY;
  const response = await storeHandler({
    httpMethod: 'POST',
    body: JSON.stringify({ lat: 39.3658, lng: -76.7169, scope: 'supermarket' })
  });
  const body = JSON.parse(response.body);
  assert.equal(response.statusCode, 200);
  assert.ok(body.stores.length >= 2);
  assert.equal(body.stores[0].name, 'Seven Mile Market');
  assert.ok(body.stores.every(store => /Market Maven|Seven Mile Market/.test(store.name)));
});

test('store locator places a closer explicitly kosher result before farther directory entries', async () => {
  process.env.GOOGLE_MAPS_API_KEY = 'test-key';
  global.fetch = async () => new Response(JSON.stringify({
    places: [{
      id: 'nearby-kosher',
      displayName: { text: 'Nearby Kosher Market' },
      formattedAddress: '1 Test Street',
      googleMapsUri: 'https://maps.example/nearby',
      websiteUri: 'https://nearby.example',
      location: { latitude: 39.3660, longitude: -76.7168 }
    }]
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });

  const response = await storeHandler({
    httpMethod: 'POST',
    body: JSON.stringify({ lat: 39.3660, lng: -76.7168, scope: 'supermarket' })
  });
  const body = JSON.parse(response.body);
  assert.equal(body.stores[0].name, 'Nearby Kosher Market');
});

test('every function includes CORS headers on every response (the actual bug: the native iOS/Android app calls these cross-origin, unlike the website, and was being silently blocked without these headers)', async () => {
  const { handler: householdHandler } = await import('../netlify/functions/household-sync.mjs');

  for (const [name, handler, method] of [
    ['pantry-ai', pantryHandler, 'OPTIONS'],
    ['pantry-ai', pantryHandler, 'POST'],
    ['receipt-scan', receiptHandler, 'OPTIONS'],
    ['receipt-scan', receiptHandler, 'POST'],
    ['store-locator', storeHandler, 'OPTIONS'],
    ['store-locator', storeHandler, 'POST'],
    ['household-sync', householdHandler, 'OPTIONS'],
    ['household-sync', householdHandler, 'GET'],
  ]) {
    const event = method === 'OPTIONS'
      ? { httpMethod: 'OPTIONS' }
      : method === 'GET'
        ? { httpMethod: 'GET', queryStringParameters: { code: 'BADCODE' } }
        : { httpMethod: 'POST', body: JSON.stringify({}) };
    const response = await handler(event);
    assert.equal(
      response.headers?.['Access-Control-Allow-Origin'],
      '*',
      `${name} (${method}) is missing Access-Control-Allow-Origin - the native app would be silently blocked`
    );
  }
});

test('household-sync surfaces a proper JSON error (not a crash) when the Blobs store is unavailable - this is a real production risk: if Netlify\'s automatic Blobs context injection fails (a documented platform issue) and NETLIFY_BLOBS_SITE_ID/NETLIFY_BLOBS_TOKEN are not set as a fallback, every sync/join attempt fails this way', async () => {
  const { handler } = await import('../netlify/functions/household-sync.mjs');
  delete process.env.NETLIFY_BLOBS_SITE_ID;
  delete process.env.SITE_ID;
  delete process.env.NETLIFY_BLOBS_TOKEN;

  const response = await handler({ httpMethod: 'GET', queryStringParameters: { code: 'ABCDEFGH' } });
  const body = JSON.parse(response.body);
  assert.equal(response.statusCode, 500);
  assert.match(body.error, /Blobs store unavailable/);
  assert.equal(response.headers?.['Access-Control-Allow-Origin'], '*');
});

test('household-sync validates codes and payloads correctly once the Blobs store is available', async () => {
  process.env.NETLIFY_BLOBS_SITE_ID = 'test-site-id';
  process.env.NETLIFY_BLOBS_TOKEN = 'test-token';
  const { handler } = await import('../netlify/functions/household-sync.mjs?fresh=' + Date.now());

  const badGet = await handler({ httpMethod: 'GET', queryStringParameters: { code: 'nope' } });
  assert.equal(badGet.statusCode, 400);
  assert.match(JSON.parse(badGet.body).error, /Invalid household code/);

  const badPost = await handler({ httpMethod: 'POST', body: JSON.stringify({ code: 'ABCDEFGH' }) });
  assert.equal(badPost.statusCode, 400);
  assert.match(JSON.parse(badPost.body).error, /Missing state/);

  const badMethod = await handler({ httpMethod: 'DELETE' });
  assert.equal(badMethod.statusCode, 405);

  delete process.env.NETLIFY_BLOBS_SITE_ID;
  delete process.env.NETLIFY_BLOBS_TOKEN;
});

test('receipt scan extracts grocery items, computes an expiration date from the estimated shelf life, and rejects non-grocery lines (tax/total/etc)', async () => {
  process.env.OPENAI_API_KEY = 'test-key';
  global.fetch = async () => new Response(JSON.stringify({
    id: 'resp_test',
    output_text: JSON.stringify({
      items: [
        { name: 'Whole milk', rawText: 'GV WHL MLK GAL', qty: 1, unit: 'gallon', category: 'dairy', estimatedShelfLifeDays: 10, confidence: 'high' },
        { name: 'Canned black beans', rawText: 'BLK BEANS 15OZ', qty: 3, unit: 'can', category: 'canned', estimatedShelfLifeDays: 365, confidence: 'high' },
        { name: 'Tax', rawText: 'SALES TAX', qty: 1, unit: 'unknown', category: 'other', estimatedShelfLifeDays: null, confidence: 'high' },
        { name: 'Total', rawText: 'TOTAL', qty: 1, unit: 'unknown', category: 'other', estimatedShelfLifeDays: null, confidence: 'high' }
      ]
    })
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });

  const response = await receiptHandler({
    httpMethod: 'POST',
    body: JSON.stringify({ image: 'data:image/jpeg;base64,abc', purchaseDate: '2026-01-01', photoId: 'receipt-1' })
  });
  const body = JSON.parse(response.body);

  assert.equal(response.statusCode, 200);
  assert.equal(body.items.length, 2, 'tax/total lines should be rejected, not treated as groceries');
  assert.equal(body.rejectedCount, 2);

  const milk = body.items.find(i => i.name === 'Whole milk');
  assert.equal(milk.expiresOn, '2026-01-11', 'purchase date + 10 day shelf life');

  const beans = body.items.find(i => i.name === 'Canned black beans');
  assert.equal(beans.qty, 3);
  assert.equal(beans.expiresOn, '2027-01-01', 'purchase date + 365 day shelf life');
});

test('receipt scan requires a real image and handles OpenAI errors gracefully', async () => {
  process.env.OPENAI_API_KEY = 'test-key';

  const noImage = await receiptHandler({ httpMethod: 'POST', body: JSON.stringify({}) });
  assert.equal(noImage.statusCode, 400);

  global.fetch = async () => new Response(JSON.stringify({ error: { message: 'bad request' } }), { status: 400 });
  const apiError = await receiptHandler({
    httpMethod: 'POST',
    body: JSON.stringify({ image: 'data:image/jpeg;base64,abc' })
  });
  assert.equal(apiError.statusCode, 500);
  assert.match(JSON.parse(apiError.body).error, /bad request/);
});
