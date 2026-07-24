# Project Status

Single source of truth for what works, what's broken, and what changed.
Update this file every time a fix is made or verified — don't rely on chat history.

Last updated: 2026-07-23 by Claude

---

## How to read this file

- **Code verified** — logic exists and has a passing automated test (`npm run qa`).
- **Live verified** — confirmed working on the actual deployed site by the user.
- **Needs live check** — code looks right and/or has a passing test, but hasn't been confirmed on production yet.
- **Broken** — known not to work.
- **Not yet audited** — no real review done yet.

---

## Requirements inventory

| Feature | Status | Notes |
|---|---|---|
| Sunday–Thursday weekly planning | Code verified | Tests: build week, unique meals, replace/lock behavior |
| Pantry/fridge/freezer photo scanning | Live verified (basic) | Scan just found 7 items successfully. Accuracy (correct quantities, canned vs. fresh distinction, no invented items) not yet spot-checked against a real photo |
| Shopping list builder | Code verified | Test: "shopping checklist state is persistent and keyed by store plus ingredient" |
| Permanent household preferences (never-suggest / reduce lists) | Code verified | No fish/tofu/turkey/broccoli/cauliflower/cilantro; less chickpeas/carrots/eggplant/spinach — all present in `js/app.js` |
| Weekly options (kid-friendly, more dairy, more meat, simple week, use pantry first, avoid list) | Code verified | Present in `PREFS`/weekly logic in `js/app.js` |
| Not spicy / no egg-heavy dinners | Code verified | Pattern checks in `js/app.js` |
| Meat = Chabad shechita, Dairy = Cholov Yisroel, no meat/dairy mixing | Code verified | Kosher separation test passes ("known regression handlers are fixed") |
| Lock / Replace / Show recipe per day | Code verified | Dedicated tests pass for lock and replace-unlocked |
| No duplicate recipes (this week or on replace) | Code verified | Test: "the real app script boots... creates five unique dinners"; "replace unlocked preserves locked meals and keeps the plan unique" |
| Jewish calendar (auto Hebrew date, Nine Days, Tisha B'Av, meat restrictions) | Code verified, needs live visual check | Logic + tests pass. This is the feature that "disappeared" in a past build — needs to be confirmed visible on the live site, not just logically correct |
| Local kosher grocery + meat store search (Baltimore-area) | Code verified, needs live check | Seed directory (Pikesville, MD) + Google Places integration; sorts by distance. Needs a live search test with a real address |
| Persistent shopping list + pantry subtraction | Code verified | Tomato-form distinction, unit conversion, and negative-quantity guard all have passing tests |
| Mobile planner UI | Not yet audited | User previously flagged "mobile planner issues" — no specifics gathered yet |

---

## Known issues (from original handoff), current status

| Issue | Status |
|---|---|
| Pantry scan failing | **Fixed** — two root causes: (1) corrupted `pantry-ai.mjs` (chat text pasted into source, commit `95de28b`), (2) function defaulted to a non-working model `gpt-5-mini` instead of the known-working `gpt-4.1-mini-2025-04-14` (commit `4fd89ad`). Confirmed live: scan found 7 items. |
| Shopping list persistence | Needs live verification — code + test look correct |
| Calendar disappearing | Needs live visual verification — code + test look correct |
| Mobile planner issues | Not yet audited — need specifics from user |
| Store lookup problems | Needs live verification — code looks correct, Google Maps key is set |
| Duplicate meals | Needs live verification — code + tests look correct |
| Wrong quantities | Needs live verification — code + tests look correct |

---

## Deployment

- Repo: `https://github.com/7608230236/dinner-planner`
- Live site: `https://cheerful-conkies-96998f.netlify.app/`
- **As of 2026-07-23: Netlify is linked to GitHub for continuous deployment on `main`.** Every push auto-deploys. (Previously the live site was on a disconnected manual "Netlify Drop" deploy — this was the source of a lot of confusion, since GitHub fixes weren't reaching production.)
- Env vars required on Netlify: `OPENAI_API_KEY`, `OPENAI_MODEL` (`gpt-4.1-mini-2025-04-14`), `GOOGLE_MAPS_API_KEY` (optional — Baltimore-area directory fallback works without it)

---

## Change log

- **2026-07-23** — Fixed `pantry-ai.mjs` syntax corruption (chat text embedded in source). Commit `95de28b`.
- **2026-07-23** — Linked Netlify to GitHub for continuous deployment (was previously disconnected manual deploys).
- **2026-07-23** — Fixed default OpenAI model (`gpt-5-mini` → `gpt-4.1-mini-2025-04-14`) causing pantry scans to hang and time out after 50s. Commit `4fd89ad`. Updated matching test and README.
- **2026-07-23** — Full repository audit against original requirements. This file created.

---

## Next steps (priority order)

1. Spot-check pantry scan accuracy against a real photo (quantities, canned vs. fresh, no invented items)
2. Verify shopping list persists across a page reload / browser close
3. Verify Jewish calendar banner is actually visible on the live site (not just logically correct)
4. Verify store search returns real, correctly-sorted results for your address
5. Verify no duplicate meals across a real build + replace cycle
6. Audit mobile planner UI once specifics are gathered
