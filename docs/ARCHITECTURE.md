# Architecture

## Browser application

`index.html` provides the application shell. `js/app.js` owns user state, weekly planning, Jewish-calendar rules, pantry sessions, store selection, shopping rendering, and support exports.

`js/recipes.js` contains the static 500-recipe library, explicit recipe families, tags, rough cost ranges, ingredients, and instructions.

`js/ingredient-engine.js` is a standalone deterministic module. It normalizes ingredient names and units, protects ingredient-form distinctions, validates detected items, converts compatible quantities, and calculates pantry deductions. It works in both the browser and Node tests.

`js/developer.js` is isolated from ordinary app behavior. It reads a controlled bridge exposed by `app.js`, displays internal diagnostics, and creates complete debug reports.

## Serverless functions

`pantry-ai.mjs` keeps the AI key off the client. It sends one compressed photo at a time, requires specific visible evidence, validates the returned JSON, and rejects generic, malformed, or unsupported detections before returning them to the browser.

`store-locator.mjs` combines a small verified starter directory with optional live Google Places results. Live results must explicitly look kosher, are deduplicated, and are ordered by distance.

## Persistence

The browser uses the existing `dinnerPlannerV51:` key prefix so earlier user data migrates instead of disappearing. `normalizeState` upgrades legacy records into the v60 shape.

A version key triggers old cache cleanup. The service worker uses a v60 cache and network-first behavior with offline fallback.

## Trust boundaries

- API keys exist only in Netlify environment variables.
- Medium-confidence AI items must be reviewed before they can reduce shopping quantities.
- Pantry deductions require exact canonical ingredient matches and compatible units.
- Tomato forms are deliberately separate.
- A support report may include compressed photo previews only when the user explicitly creates the full file.
