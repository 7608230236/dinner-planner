import test from 'node:test';
import assert from 'node:assert/strict';
import { handler as pantryHandler } from '../netlify/functions/pantry-ai.mjs';
import { handler as storeHandler } from '../netlify/functions/store-locator.mjs';

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
  assert.equal(requestBody.model, 'gpt-5-mini');
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
