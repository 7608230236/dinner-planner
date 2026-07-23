import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const text = path => readFile(resolve(root, path), 'utf8');

test('all visible and cached versions are v60', async () => {
  const files = await Promise.all([
    text('index.html'),
    text('js/app.js'),
    text('service-worker.js'),
    text('package.json')
  ]);
  assert.match(files[0], /dinner-planner-version" content="60"/);
  assert.match(files[0], />v60<\/button>/);
  assert.match(files[1], /APP_VERSION="60"/);
  assert.match(files[2], /APP_VERSION = "60"/);
  assert.doesNotMatch(files.join('\n'), /v58|content="58"|APP_VERSION="58"/);
});

test('developer mode contains every diagnostic panel', async () => {
  const html = await text('index.html');
  for (const id of [
    'developerPanel','developerSummary','developerValidation','developerPantry',
    'developerAi','developerShopping','developerTimeline','developerErrors','developerStorage',
    'reportBugBtn','copyDebugBtn','downloadDebugBtn','clearCacheBtn','unregisterWorkerBtn'
  ]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
});

test('all local static assets referenced by index exist', async () => {
  const html = await text('index.html');
  const references = [...html.matchAll(/(?:src|href)="(\/(?!\.netlify)[^"?#]+)(?:\?[^\"]*)?"/g)].map(match => match[1]);
  for (const reference of references) {
    const local = reference === '/' ? 'index.html' : reference.slice(1);
    await access(resolve(root, local));
  }
});

test('service worker caches every app module', async () => {
  const worker = await text('service-worker.js');
  for (const asset of [
    '/css/styles.css?v=60',
    '/js/ingredient-engine.js?v=60',
    '/js/app.js?v=60',
    '/js/developer.js?v=60'
  ]) assert.ok(worker.includes(asset), `missing ${asset}`);
});

test('known regression handlers are fixed', async () => {
  const app = await text('js/app.js');
  assert.doesNotMatch(app, /openRecipe\(/);
  assert.match(app, /showRecipe\(btn\.dataset\.pantryRecipe\)/);
  assert.match(app, /removePhotoObservations\(picture\.id\)/);
  assert.match(app, /Twelve canned tomatoes prevent an unnecessary two-can purchase/);
});
