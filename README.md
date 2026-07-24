# Dinner Planner v60

Phone-first kosher family dinner planner with a 500-recipe library for Sunday through Thursday. The app builds unique weekly plans, applies household preferences and Jewish-calendar restrictions, remembers pantry inventory, subtracts trusted pantry quantities from shopping, finds nearby kosher stores, and exports a complete diagnostic report when something goes wrong.

## What v60 fixes

- One consistent version everywhere: HTML, visible badge, JavaScript, service worker, cache, and package metadata all use **v60**.
- Developer mode with validation, pantry diagnostics, AI history, shopping calculations, error timeline, local-storage details, cache inspection, and service-worker controls.
- One-click bug report and scan support JSON files that can be attached in ChatGPT with the `+` button.
- Pantry scan validation that rejects generic or unsupported detections.
- Correct item crops from AI bounding boxes.
- Duplicate scan observations are merged without double-counting the same shelf or location.
- Removing or rescanning a photo also removes its stale scan observations.
- Fresh tomatoes, canned tomatoes, frozen tomatoes, tomato sauce, and tomato paste never substitute for one another.
- Pantry quantities are deducted from shopping with compatible unit conversion.
- The known “12 canned tomatoes but buy more canned tomatoes” regression is covered by automated tests.
- Local kosher stores sort by distance first. Directory verification is shown separately.
- A 500-recipe meat, dairy, and pareve library with recipe-family variety protection and rough per-portion cost ranges.
- Jewish-calendar restrictions remain part of the weekly planning engine, including the Nine Days and observed Tisha B’Av break-fast handling.

## Deploy on Netlify

1. Put this project in the private GitHub repository `7608230236/dinner-planner`.
2. In Netlify, create a site from that repository.
3. Use the repository root as the publish directory. No build command is required.
4. Add these environment variables in Netlify:
   - `OPENAI_API_KEY` — required for pantry photo analysis.
   - `OPENAI_MODEL` — optional; defaults to `gpt-4.1-mini-2025-04-14`.
   - `GOOGLE_MAPS_API_KEY` — optional; enables live nearby kosher-store results. The Baltimore directory fallback still works without it.
5. Deploy.

API keys are used only inside Netlify Functions. They are not stored in browser JavaScript or exported in support files.

## Developer mode

Open it in either of these ways:

- Tap the **v60** badge seven times within 2.5 seconds.
- Add `?dev=1` to the app URL.
- On a desktop keyboard, press `Ctrl+Shift+D`.

The **Report bug** button downloads one JSON file containing the build, validation results, scan history, AI results, shopping diagnostics, errors, and runtime information. Photo previews are included only in the full downloaded bug report.

## Local checks

Node 20 or newer is recommended.

```bash
npm run qa
```

This performs syntax checks and the full automated test suite. The packaged v60 release passed **26 of 26 tests** on 2026-07-23. See `BUILD_REPORT.md` and `docs/QA.md`.

To serve the static app locally:

```bash
npm run serve
```

Then open `http://localhost:8888`. Pantry AI and live store search require Netlify Functions, so those two network features should be tested on a Netlify deploy.

## Project layout

```text
index.html
css/styles.css
js/app.js
js/ingredient-engine.js
js/recipes.js
js/developer.js
netlify/functions/pantry-ai.mjs
netlify/functions/store-locator.mjs
service-worker.js
manifest.json
tests/
docs/
.github/
```

## Data model and privacy

Plans, preferences, stores, pantry items, scan history, and debug logs are stored in the browser’s `localStorage`. Compressed kitchen photos are kept on the device until the user requests AI analysis. An analyzed photo is sent to the pantry Netlify Function and then to the configured AI service. The support exporter never includes an API key.
