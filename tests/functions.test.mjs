import test from 'node:test';
import assert from 'node:assert/strict';
import { handler as pantryHandler } from '../netlify/functions/pantry-ai.mjs';
import { handler as storeHandler } from '../netlify/functions/store-locator.mjs';
import { handler as receiptHandler } from '../netlify/functions/receipt-scan.mjs';
import { handler as recipeImportHandler } from '../netlify/functions/recipe-import.mjs';

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

test('pantry AI does not wrongly reject a single visible item (qty 1) just because its evidence text does not literally spell out the digit 1 - the actual bug found via a real scan where normal items like yogurt, sour cream, and margarine were all rejected this way', async () => {
  process.env.OPENAI_API_KEY = 'test-key';
  global.fetch = async () => new Response(JSON.stringify({
    id: 'resp_test',
    output_text: JSON.stringify({
      items: [
        { name: 'Margarine', qty: 1, unit: 'container', confidence: 'medium', category: 'dairy', perishable: true, evidence: 'a tub of margarine visible on the shelf', quantityBasis: 'label', bbox: null },
        { name: 'canned beans', qty: 12, unit: 'can', confidence: 'high', category: 'canned', perishable: false, evidence: 'a stack of cans on the shelf', quantityBasis: 'label', bbox: null }
      ]
    })
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });

  const response = await pantryHandler({
    httpMethod: 'POST',
    body: JSON.stringify({ image: 'data:image/jpeg;base64,abc', location: 'Fridge', photoId: 'photo-1' })
  });
  const body = JSON.parse(response.body);

  assert.equal(response.statusCode, 200);
  assert.ok(body.items.find(i => i.name === 'Margarine'), 'the qty-1 item should be accepted');
  assert.equal(body.rejectedCount, 1, 'only the unsupported multi-count claim should be rejected');
  assert.equal(body.rejectedItems[0].name, 'canned beans');
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
  const { default: householdHandler } = await import('../netlify/functions/household-sync.mjs');

  for (const [name, handler, method] of [
    ['pantry-ai', pantryHandler, 'OPTIONS'],
    ['pantry-ai', pantryHandler, 'POST'],
    ['receipt-scan', receiptHandler, 'OPTIONS'],
    ['receipt-scan', receiptHandler, 'POST'],
    ['store-locator', storeHandler, 'OPTIONS'],
    ['store-locator', storeHandler, 'POST'],
    ['recipe-import', recipeImportHandler, 'OPTIONS'],
    ['recipe-import', recipeImportHandler, 'POST'],
  ]) {
    const event = method === 'OPTIONS'
      ? { httpMethod: 'OPTIONS' }
      : { httpMethod: 'POST', body: JSON.stringify({}) };
    const response = await handler(event);
    assert.equal(
      response.headers?.['Access-Control-Allow-Origin'],
      '*',
      `${name} (${method}) is missing Access-Control-Allow-Origin - the native app would be silently blocked`
    );
  }

  // household-sync and recipe-photos are v2 (Request/Response) functions, tested separately.
  const optionsResponse = await householdHandler(new Request('https://x.test/household-sync', { method: 'OPTIONS' }));
  assert.equal(optionsResponse.headers.get('Access-Control-Allow-Origin'), '*', 'household-sync (OPTIONS) is missing CORS header');
  const getResponse = await householdHandler(new Request('https://x.test/household-sync?code=BADCODE'));
  assert.equal(getResponse.headers.get('Access-Control-Allow-Origin'), '*', 'household-sync (GET) is missing CORS header');

  const { default: photosHandler } = await import('../netlify/functions/recipe-photos.mjs');
  const photosOptions = await photosHandler(new Request('https://x.test/recipe-photos', { method: 'OPTIONS' }));
  assert.equal(photosOptions.headers.get('Access-Control-Allow-Origin'), '*', 'recipe-photos (OPTIONS) is missing CORS header');
  const photosGet = await photosHandler(new Request('https://x.test/recipe-photos?recipeId=bad id'));
  assert.equal(photosGet.headers.get('Access-Control-Allow-Origin'), '*', 'recipe-photos (GET) is missing CORS header');

  const { default: previewHandler } = await import('../netlify/functions/recipe-preview-image.mjs');
  const previewOptions = await previewHandler(new Request('https://x.test/recipe-preview-image', { method: 'OPTIONS' }));
  assert.equal(previewOptions.headers.get('Access-Control-Allow-Origin'), '*', 'recipe-preview-image (OPTIONS) is missing CORS header');
  const previewGet = await previewHandler(new Request('https://x.test/recipe-preview-image?recipeId=bad id&title=Test'));
  assert.equal(previewGet.headers.get('Access-Control-Allow-Origin'), '*', 'recipe-preview-image (GET) is missing CORS header');
});

test('household-sync surfaces a proper JSON error (not a crash) when no Blobs store is reachable at all - this is a real production risk: if both the explicit-credential store AND the automatic-context store fail (as actually happened in production - the explicit credentials went stale and every operation returned a 401), every sync/join attempt needs to fail loudly with a real message rather than crash or silently do nothing', async () => {
  const { default: handler } = await import('../netlify/functions/household-sync.mjs');
  delete process.env.NETLIFY_BLOBS_SITE_ID;
  delete process.env.SITE_ID;
  delete process.env.NETLIFY_BLOBS_TOKEN;

  const response = await handler(new Request('https://x.test/household-sync?code=ABCDEFGH'));
  const body = await response.json();
  assert.equal(response.status, 500);
  assert.match(body.error, /Household sync failed/);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), '*');
});

test('household-sync validates codes and payloads correctly once the Blobs store is available', async () => {
  process.env.NETLIFY_BLOBS_SITE_ID = 'test-site-id';
  process.env.NETLIFY_BLOBS_TOKEN = 'test-token';
  const { default: handler } = await import('../netlify/functions/household-sync.mjs?fresh=' + Date.now());

  const badGet = await handler(new Request('https://x.test/household-sync?code=nope'));
  assert.equal(badGet.status, 400);
  assert.match((await badGet.json()).error, /Invalid household code/);

  const badPost = await handler(new Request('https://x.test/household-sync', { method: 'POST', body: JSON.stringify({ code: 'ABCDEFGH' }) }));
  assert.equal(badPost.status, 400);
  assert.match((await badPost.json()).error, /Missing state/);

  const badMethod = await handler(new Request('https://x.test/household-sync', { method: 'DELETE' }));
  assert.equal(badMethod.status, 405);

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

test('recipe scan requires a real image and handles OpenAI errors gracefully', async () => {
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

test('recipe-import extracts a structured recipe (title, ingredients, steps) from uploaded document text, so someone can upload a document instead of retyping it by hand into the app', async () => {
  process.env.OPENAI_API_KEY = 'test-key';
  global.fetch = async () => new Response(JSON.stringify({
    id: 'resp_test',
    output_text: JSON.stringify({
      title: "Grandma's Cholent",
      ingredients: [
        { name: 'beef stew meat', amount: '2 lb' },
        { name: 'potatoes', amount: '3 lb' },
        { name: 'barley', amount: '1 cup' }
      ],
      steps: [
        'Layer the potatoes, beef, and barley in a slow cooker.',
        'Add water to cover and season with paprika and salt.',
        'Cook on low overnight before Shabbos begins.'
      ]
    })
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });

  const response = await recipeImportHandler({
    httpMethod: 'POST',
    body: JSON.stringify({ text: 'Grandma\'s Cholent recipe... 2 lb beef, 3 lb potatoes, 1 cup barley...' })
  });
  const body = JSON.parse(response.body);

  assert.equal(response.statusCode, 200);
  assert.equal(body.recipe.title, "Grandma's Cholent");
  assert.equal(body.recipe.ingredients.length, 3);
  assert.deepEqual(body.recipe.ingredients[0], ['beef stew meat', '2 lb']);
  assert.equal(body.recipe.steps.length, 3);
});

test('recipe-import requires real document text and handles OpenAI errors gracefully, same as the other AI-backed functions', async () => {
  process.env.OPENAI_API_KEY = 'test-key';

  const noText = await recipeImportHandler({ httpMethod: 'POST', body: JSON.stringify({}) });
  assert.equal(noText.statusCode, 400);

  const blankText = await recipeImportHandler({ httpMethod: 'POST', body: JSON.stringify({ text: '   ' }) });
  assert.equal(blankText.statusCode, 400);

  global.fetch = async () => new Response(JSON.stringify({ error: { message: 'bad request' } }), { status: 400 });
  const apiError = await recipeImportHandler({
    httpMethod: 'POST',
    body: JSON.stringify({ text: 'Some recipe text here' })
  });
  assert.equal(apiError.statusCode, 500);
  assert.match(JSON.parse(apiError.body).error, /bad request/);
});

test('recipe-import rejects a document with no findable recipe instead of returning a broken/empty result', async () => {
  process.env.OPENAI_API_KEY = 'test-key';
  global.fetch = async () => new Response(JSON.stringify({
    id: 'resp_test',
    output_text: JSON.stringify({ title: '', ingredients: [], steps: [] })
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });

  const response = await recipeImportHandler({
    httpMethod: 'POST',
    body: JSON.stringify({ text: 'This document does not actually contain a recipe.' })
  });
  assert.equal(response.statusCode, 502);
  assert.match(JSON.parse(response.body).error, /didn't include a clear recipe title|title/i);
});

test('recipe-import also extracts a structured recipe from a photo (Scan), not just document text - the actual feature request was Write/Scan/Upload as parallel options', async () => {
  process.env.OPENAI_API_KEY = 'test-key';
  global.fetch = async () => new Response(JSON.stringify({
    id: 'resp_test',
    output_text: JSON.stringify({
      title: 'Roast Chicken',
      ingredients: [{ name: 'whole chicken', amount: '4 lb' }],
      steps: ['Roast at 425°F for 75 minutes.']
    })
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });

  const response = await recipeImportHandler({
    httpMethod: 'POST',
    body: JSON.stringify({ image: 'data:image/jpeg;base64,abc123' })
  });
  const body = JSON.parse(response.body);
  assert.equal(response.statusCode, 200);
  assert.equal(body.recipe.title, 'Roast Chicken');
});

test('recipe-import rejects a scan with no image data and a malformed image data URL, mirroring the same validation pantry-ai.mjs already does for photos', async () => {
  process.env.OPENAI_API_KEY = 'test-key';

  const noImageNoText = await recipeImportHandler({ httpMethod: 'POST', body: JSON.stringify({}) });
  assert.equal(noImageNoText.statusCode, 400);

  const badImage = await recipeImportHandler({
    httpMethod: 'POST',
    body: JSON.stringify({ image: 'not-a-data-url' })
  });
  assert.equal(badImage.statusCode, 400);
  assert.match(JSON.parse(badImage.body).error, /Invalid image/);
});

test('recipe-import gives a photo-specific error message when nothing readable is found in a scan, distinct from the document-upload message', async () => {
  process.env.OPENAI_API_KEY = 'test-key';
  global.fetch = async () => new Response(JSON.stringify({
    id: 'resp_test',
    output_text: JSON.stringify({ title: '', ingredients: [], steps: [] })
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });

  const response = await recipeImportHandler({
    httpMethod: 'POST',
    body: JSON.stringify({ image: 'data:image/jpeg;base64,abc123' })
  });
  assert.equal(response.statusCode, 502);
  assert.match(JSON.parse(response.body).error, /photo/i);
});

test('recipe-photos surfaces a proper JSON error (not a crash) when no Blobs store is reachable at all, same as household-sync', async () => {
  const { default: handler } = await import('../netlify/functions/recipe-photos.mjs');
  delete process.env.NETLIFY_BLOBS_SITE_ID;
  delete process.env.SITE_ID;
  delete process.env.NETLIFY_BLOBS_TOKEN;

  const response = await handler(new Request('https://x.test/recipe-photos?recipeId=beef-tacos-01'));
  const body = await response.json();
  assert.equal(response.status, 500);
  assert.match(body.error, /Recipe photo storage failed/);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), '*');
});

test('recipe-photos validates recipe ids, image data, and actions before ever touching storage', async () => {
  process.env.NETLIFY_BLOBS_SITE_ID = 'test-site-id';
  process.env.NETLIFY_BLOBS_TOKEN = 'test-token';
  const { default: handler } = await import('../netlify/functions/recipe-photos.mjs?fresh=' + Date.now());

  const badRecipeId = await handler(new Request('https://x.test/recipe-photos?recipeId=' + encodeURIComponent('bad id!')));
  assert.equal(badRecipeId.status, 400);
  assert.match((await badRecipeId.json()).error, /Invalid recipe id/);

  const missingImage = await handler(new Request('https://x.test/recipe-photos', {
    method: 'POST',
    body: JSON.stringify({ recipeId: 'beef-tacos-01' })
  }));
  assert.equal(missingImage.status, 400);
  assert.match((await missingImage.json()).error, /Invalid image data/);

  const badImageFormat = await handler(new Request('https://x.test/recipe-photos', {
    method: 'POST',
    body: JSON.stringify({ recipeId: 'beef-tacos-01', image: 'not-a-data-url' })
  }));
  assert.equal(badImageFormat.status, 400);

  const badMethod = await handler(new Request('https://x.test/recipe-photos', { method: 'DELETE' }));
  assert.equal(badMethod.status, 405);

  const badFavoriteRecipeId = await handler(new Request('https://x.test/recipe-photos', {
    method: 'POST',
    body: JSON.stringify({ recipeId: 'nope nope', action: 'favorite', photoId: 'p1' })
  }));
  assert.equal(badFavoriteRecipeId.status, 400);

  delete process.env.NETLIFY_BLOBS_SITE_ID;
  delete process.env.NETLIFY_BLOBS_TOKEN;
});

test('recipe-photos rejects an upload the AI check flags as unsafe or unrelated to the dish, instead of storing anything unchecked (the actual guardrail: this is a household app with children, and a photo gallery with zero content checking is a real risk)', async () => {
  process.env.NETLIFY_BLOBS_SITE_ID = 'test-site-id';
  process.env.NETLIFY_BLOBS_TOKEN = 'test-token';
  process.env.OPENAI_API_KEY = 'test-key';
  const { default: handler } = await import('../netlify/functions/recipe-photos.mjs?fresh=' + Date.now());

  global.fetch = async () => new Response(JSON.stringify({
    id: 'resp_test',
    output_text: JSON.stringify({ approved: false, reason: "That doesn't look like a photo of this dish." })
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });

  const response = await handler(new Request('https://x.test/recipe-photos', {
    method: 'POST',
    body: JSON.stringify({ recipeId: 'beef-tacos-01', image: 'data:image/jpeg;base64,abc', recipeTitle: 'Mild Beef Tacos' })
  }));
  assert.equal(response.status, 422);
  const body = await response.json();
  assert.match(body.error, /doesn't look like/);

  delete process.env.NETLIFY_BLOBS_SITE_ID;
  delete process.env.NETLIFY_BLOBS_TOKEN;
  delete process.env.OPENAI_API_KEY;
});

test('recipe-photos fails closed, not open, when the safety check itself cannot run (network error, API down) - rejects the upload rather than silently letting an unchecked photo through', async () => {
  process.env.NETLIFY_BLOBS_SITE_ID = 'test-site-id';
  process.env.NETLIFY_BLOBS_TOKEN = 'test-token';
  process.env.OPENAI_API_KEY = 'test-key';
  const { default: handler } = await import('../netlify/functions/recipe-photos.mjs?fresh=' + Date.now());

  global.fetch = async () => { throw new Error('network down'); };

  const response = await handler(new Request('https://x.test/recipe-photos', {
    method: 'POST',
    body: JSON.stringify({ recipeId: 'beef-tacos-01', image: 'data:image/jpeg;base64,abc', recipeTitle: 'Mild Beef Tacos' })
  }));
  assert.equal(response.status, 503);
  assert.match((await response.json()).error, /verify/i);

  delete process.env.NETLIFY_BLOBS_SITE_ID;
  delete process.env.NETLIFY_BLOBS_TOKEN;
  delete process.env.OPENAI_API_KEY;
});

test('recipe-photos requires OPENAI_API_KEY to be configured before accepting any upload, rather than silently skipping the safety check', async () => {
  process.env.NETLIFY_BLOBS_SITE_ID = 'test-site-id';
  process.env.NETLIFY_BLOBS_TOKEN = 'test-token';
  delete process.env.OPENAI_API_KEY;
  const { default: handler } = await import('../netlify/functions/recipe-photos.mjs?fresh=' + Date.now());

  const response = await handler(new Request('https://x.test/recipe-photos', {
    method: 'POST',
    body: JSON.stringify({ recipeId: 'beef-tacos-01', image: 'data:image/jpeg;base64,abc', recipeTitle: 'Mild Beef Tacos' })
  }));
  assert.equal(response.status, 500);
  assert.match((await response.json()).error, /not configured/i);

  delete process.env.NETLIFY_BLOBS_SITE_ID;
  delete process.env.NETLIFY_BLOBS_TOKEN;
});

test('recipe-preview-image cleans a recipe title into a search query an image search engine can actually match - the real bug this fixes: searching the raw title "Korean-Style Cheesy Rice Bowl — with Crusty Bread" verbatim returns photos of plain bread as often as the actual dish, because the tacked-on side dish dominates the query', async () => {
  const { cleanRecipeQuery } = await import('../netlify/functions/recipe-preview-image.mjs');
  assert.equal(cleanRecipeQuery('Lemon Herb Chicken — with Pita and Salad'), 'Lemon Herb Chicken dinner food');
  assert.equal(cleanRecipeQuery('Korean-Style Cheesy Rice Bowl — with Crusty Bread'), 'Korean Cheesy Rice Bowl dinner food');
  assert.equal(cleanRecipeQuery('Classic Shabbos Roast Chicken — with Roasted Potatoes'), 'Classic Roast Chicken dinner food');
  assert.equal(cleanRecipeQuery('Vegetable Pad Thai-Style Noodles'), 'Vegetable Pad Thai Noodles dinner food');
  assert.equal(cleanRecipeQuery('Chicken Lo Mein-Style Noodles — Classic'), 'Chicken Lo Mein Noodles dinner food');
  assert.equal(cleanRecipeQuery('Moroccan Beef Tagine — with Couscous'), 'Moroccan Beef Tagine dinner food');
  // No side-suffix or special words to strip - should pass through mostly unchanged.
  assert.equal(cleanRecipeQuery('Tex-Mex Beef Stuffed Peppers'), 'Tex-Mex Beef Stuffed Peppers dinner food');
});

test('recipe-preview-image rejects an invalid recipe id and a missing title before ever calling Unsplash', async () => {
  const { default: handler } = await import('../netlify/functions/recipe-preview-image.mjs');
  const badId = await handler(new Request('https://x.test/recipe-preview-image?recipeId=bad id&title=Test'));
  assert.equal(badId.status, 400);
  assert.match((await badId.json()).error, /Invalid recipe id/);

  const missingTitle = await handler(new Request('https://x.test/recipe-preview-image?recipeId=valid-id-01'));
  assert.equal(missingTitle.status, 400);
  assert.match((await missingTitle.json()).error, /Missing title/);
});

test('recipe-preview-image builds Unsplash-compliant attribution links (required by their API terms) - a plain-text credit or a bare unsplash.com link is not sufficient, both must link to the actual photographer profile and Unsplash itself, tagged with utm_source/utm_medium so Unsplash can see the referral', async () => {
  const { buildAttribution } = await import('../netlify/functions/recipe-preview-image.mjs');
  const { creditUrl, unsplashUrl } = buildAttribution('https://unsplash.com/@janedoe');
  assert.equal(creditUrl, 'https://unsplash.com/@janedoe?utm_source=dinner_made_easy&utm_medium=referral');
  assert.equal(unsplashUrl, 'https://unsplash.com/?utm_source=dinner_made_easy&utm_medium=referral');
  // No profile URL from Unsplash - don't fabricate a broken link.
  assert.equal(buildAttribution('').creditUrl, '');
  assert.equal(buildAttribution(null).creditUrl, '');
});

test('recipe-preview-image surfaces a proper JSON error (not a crash) when no Blobs store is reachable at all, same as recipe-photos and household-sync', async () => {
  const { default: handler } = await import('../netlify/functions/recipe-preview-image.mjs?fresh=' + Date.now());
  delete process.env.NETLIFY_BLOBS_SITE_ID;
  delete process.env.SITE_ID;
  delete process.env.NETLIFY_BLOBS_TOKEN;

  const response = await handler(new Request('https://x.test/recipe-preview-image?recipeId=beef-tacos-01&title=Beef+Tacos'));
  const body = await response.json();
  assert.equal(response.status, 500);
  assert.match(body.error, /Recipe preview image lookup failed/);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), '*');
});



