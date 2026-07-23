const test = require('node:test');
const assert = require('node:assert/strict');
const engine = require('../js/ingredient-engine.js');

function recipe(name, qty, store = 'supermarket') {
  return [{ title: 'Test recipe', store, ingredients: [[name, qty]] }];
}

test('tomato forms remain distinct', () => {
  const forms = [
    engine.canonicalIngredient('fresh tomatoes'),
    engine.canonicalIngredient('canned tomatoes'),
    engine.canonicalIngredient('frozen tomatoes'),
    engine.canonicalIngredient('tomato sauce'),
    engine.canonicalIngredient('tomato paste')
  ];
  assert.equal(new Set(forms).size, 5);
});

test('12 canned tomatoes cover a two-can recipe requirement', () => {
  const inventory = [{ id: 'tomatoes', item: 'canned tomatoes', qty: 12, unit: 'can', confidence: 'high' }];
  const result = engine.buildShopping(recipe('canned tomatoes', '2 cans'), inventory, 5);
  assert.deepEqual(result.shopping, []);
  assert.equal(result.diagnostics[0].used, 2);
  assert.equal(result.diagnostics[0].remaining, 0);
});

test('fresh tomatoes do not cover canned tomatoes', () => {
  const inventory = [{ id: 'fresh', item: 'fresh tomatoes', qty: 12, unit: 'each', confidence: 'high' }];
  const result = engine.buildShopping(recipe('canned tomatoes', '2 cans'), inventory, 5);
  assert.equal(result.shopping.length, 1);
  assert.equal(result.shopping[0].canonical, 'canned tomato');
});

test('pounds and ounces convert before pantry deduction', () => {
  const inventory = [{ id: 'beef', item: 'ground beef', qty: 32, unit: 'oz', confidence: 'high' }];
  const result = engine.buildShopping(recipe('ground beef', '2 lb', 'meat'), inventory, 5);
  assert.deepEqual(result.shopping, []);
});

test('unreviewed medium-confidence scan does not suppress shopping', () => {
  const inventory = [{ id: 'rice', item: 'rice', qty: 4, unit: 'cup', confidence: 'medium', reviewed: false }];
  const result = engine.buildShopping(recipe('rice', '2 cups'), inventory, 5);
  assert.equal(result.shopping.length, 1);
});

test('reviewed medium-confidence item is trusted', () => {
  const inventory = [{ id: 'rice', item: 'rice', qty: 4, unit: 'cup', confidence: 'medium', reviewed: true }];
  const result = engine.buildShopping(recipe('rice', '2 cups'), inventory, 5);
  assert.deepEqual(result.shopping, []);
});

test('optional ingredients are skipped', () => {
  const result = engine.buildShopping(recipe('parsley', 'optional'), [], 5);
  assert.deepEqual(result.shopping, []);
});

test('shopping never creates a negative quantity', () => {
  const inventory = [{ id: 'rice', item: 'rice', qty: 50, unit: 'cup', confidence: 'high' }];
  const result = engine.buildShopping(recipe('rice', '2 cups'), inventory, 5);
  assert.equal(result.diagnostics[0].remaining, 0);
  assert.deepEqual(result.shopping, []);
});
