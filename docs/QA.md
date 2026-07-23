# QA record for v60

Release QA was completed on **2026-07-23** with:

```bash
npm run qa
```

Result: **26 tests passed, 0 failed**.

## Automated coverage

- JavaScript, service-worker, test, and Netlify Function syntax.
- Consistent v60 metadata, visible badge, application constant, package version, and cache identifiers.
- Presence of every developer-mode panel and diagnostic action.
- Existence of all local static assets referenced by the HTML.
- Service-worker coverage of the app shell and JavaScript modules.
- No duplicate HTML IDs and no CSS parse errors.
- Real `app.js` boot in a controlled runtime.
- Building five unique Sunday-through-Thursday dinners.
- Replacing unlocked dinners while preserving locked meals and plan uniqueness.
- Whole-week lock and unlock behavior.
- Calendar-compliant meal generation.
- 2026 Nine Days, Tisha B'Av break-fast, and 10 Av dinner handling.
- All agreed household preferences enabled by default.
- A 500-recipe library with unique IDs, complete recipe fields, required category mix, kosher separation, ingredient restrictions, time limits, and break-fast choices.
- Persistent shopping checklist state keyed by store and ingredient.
- Tomato-form separation.
- Twelve canned tomatoes satisfying a two-can recipe requirement.
- Fresh tomatoes not satisfying canned-tomato requirements.
- Pound/ounce conversion before pantry deduction.
- Confidence gating for shopping deductions.
- Optional ingredient exclusion.
- Non-negative shopping calculations.
- Pantry AI server validation, sanitization, and rejection reporting.
- Distance-first kosher-store sorting and fallback directory behavior.
- Known regression handlers, including the former undefined recipe-button handler.

## Additional release checks

- Every local static route returned HTTP 200 from a local server.
- The HTML contains no duplicate IDs.
- The stylesheet parses without errors.
- All local HTML asset references exist.
- No production API key pattern was found in the project.
- The packaged ZIP was extracted into a clean directory and the full QA command was run again before release.

## Manual deployment checks still required

The following require a real Netlify deployment and credentials and therefore are not asserted by the local suite:

- Live pantry-image analysis through the configured OpenAI key.
- Live Google nearby-store search through the optional Maps key.
- iPhone camera permissions, Home Screen installation, and offline behavior on the production domain.
- Netlify environment-variable configuration.
