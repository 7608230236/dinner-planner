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
| Pantry/fridge/freezer photo scanning | **Live verified with real data** | Spot-checked against the actual debug report (`dinner-planner-support-2026-07-24.json`). Confirmed: correctly distinguished a canned "Tomatoes" item from a separate "Tomato Sauce" (12-can box) item; quantities correctly sourced as `visible` vs. `label`; nothing invented. Confirmed the model fix is holding — every attempt since the fix used `gpt-4.1-mini-2025-04-14`, no reversion to `gpt-5-mini`. **Caveat:** only 1 clean sample since the fix — recommend 2–3 more real scans before calling this fully reliable, since the old `gpt-5-mini` default also "worked" once before failing 8 times in a row. One minor thing to watch, not a bug: one item ("Tuna") was tagged `confidence: high` but its evidence text said "likely tuna" — a small mismatch between the confidence label and the AI's own hedging language, worth keeping an eye on across more scans. |
| Shopping list builder | Code verified | Test: "shopping checklist state is persistent and keyed by store plus ingredient" |
| Permanent household preferences (never-suggest / reduce lists) | Code verified | No fish/tofu/turkey/broccoli/cauliflower/cilantro; less chickpeas/carrots/eggplant/spinach — all present in `js/app.js` |
| Weekly options (kid-friendly, more dairy, more meat, simple week, use pantry first, avoid list) | Code verified | Present in `PREFS`/weekly logic in `js/app.js` |
| Not spicy / no egg-heavy dinners | Code verified | Pattern checks in `js/app.js` |
| Meat = Chabad shechita, Dairy = Cholov Yisroel, no meat/dairy mixing | Code verified | Kosher separation test passes ("known regression handlers are fixed") |
| Lock / Replace / Show recipe per day | Code verified | Dedicated tests pass for lock and replace-unlocked |
| No duplicate recipes (this week or on replace) | Code verified | Test: "the real app script boots... creates five unique dinners"; "replace unlocked preserves locked meals and keeps the plan unique" |
| Jewish calendar (auto Hebrew date, Nine Days, Tisha B'Av, meat restrictions) | **Live verified** | User confirmed the banner is visible on the live site and correctly showing "Tisha B'Av week" today |
| Local kosher grocery + meat store search (Baltimore-area) | Code verified, needs live check | Seed directory (Pikesville, MD) + Google Places integration; sorts by distance. Needs a live search test with a real address |
| Persistent shopping list + pantry subtraction | **Live verified — fixed and confirmed** | User confirmed: closed and reopened the app on phone, shopping list and checkmarks survived. Root cause was `save()` silently swallowing storage errors; now catches, records, and surfaces failures in Developer mode. |
| Mobile planner UI | Not yet audited | User previously flagged "mobile planner issues" — no specifics gathered yet |

---

## Known issues (from original handoff), current status

| Issue | Status |
|---|---|
| Pantry scan failing | **Fixed** — two root causes: (1) corrupted `pantry-ai.mjs` (chat text pasted into source, commit `95de28b`), (2) function defaulted to a non-working model `gpt-5-mini` instead of the known-working `gpt-4.1-mini-2025-04-14` (commit `4fd89ad`). Confirmed live: scan found 7 items. |
| Shopping list persistence | **Fixed and live-confirmed** — root cause was `save()` silently swallowing storage errors. Now catches, records, and surfaces failures in Developer mode. Commit `9ac94dd`. User confirmed working. |
| Calendar disappearing | **Confirmed working live** — banner visible, correctly showing "Tisha B'Av week" |
| Mobile planner issues | Not yet audited — need specifics from user |
| Store lookup problems | Needs live verification — code looks correct, Google Maps key is set |
| Duplicate meals | Needs live verification — code + tests look correct |
| Wrong quantities | Needs live verification — code + tests look correct |

---

## Commercial model

**This app is permanently free. No paid tiers, no premium features, no monetization.** The original commercial brief's tiered/paid concept does not apply — disregard it. This is a free family tool, not a commercial product.

## Trust & safety / halacha audit (2026-07-23)

Reviewed the actual code against the brief's trust principles and your household rules. One nuance worth understanding, otherwise solid.

| Principle | Status | Detail |
|---|---|---|
| Never mix meat and dairy | **Verified in code** | Enforced in recipe library + validation suite; test passes |
| No siyum-based meat override | **Verified in code** | No siyum logic exists anywhere in the codebase — matches your explicit instruction that Chabad doesn't recognize this app's siyum as an override |
| Nine Days (1–9 Av): meat-free | **Verified in code** | `calendarRuleForDate()` correctly restricts to dairy/pareve for Av 1–9 |
| Tisha B'Av: break-fast only, dairy/pareve | **Verified in code** | Also correctly handles the Shabbos-postponement case (fast moves to 10 Av if 9 Av falls on Shabbos) |
| Meat restricted through halachic midday on 10 Av | **Correct by circumstance, worth understanding why** | The code doesn't hard-block meat on 10 Av's *dinner* — but since this app only plans **dinner** (evening meal), and halachic midday is always well before evening, this restriction is functionally moot for dinner planning. It would only matter for a lunch feature, which doesn't exist. The app does still show an informational note about the midday cutoff on the calendar banner. **Not a bug**, but flagging so it's understood rather than assumed correct by luck. |
| Hard exclusions (no fish/tofu/turkey/broccoli/cauliflower/cilantro/egg-forward/spicy) actually filter candidates, not just deprioritize | **Verified in code** | `recipeAllowed()` is a real filter applied at build time and replace time, not a scoring nudge |
| Soft reductions (chickpeas/carrots/spinach/eggplant) are score-based, not hard bans | **Verified in code** | Matches your stated preference — reduce, don't eliminate |
| Manual correction always available | **Verified in code** | Pantry items have edit/remove actions |
| Distinguish certain vs. uncertain pantry detections | **Verified in code** | Confidence badges (high/medium/low); unreviewed medium-confidence items don't suppress shopping (has a passing test) |
| Never claim a store is kosher without reliable basis | **Verified in code** | UI clearly labels results "Directory verified" (your own confirmed list) vs. "Nearby result" (Google Places match, not independently confirmed) |
| API keys never exposed client-side | **Verified in code** | Confirmed no keys in any browser-side file; both external calls happen only in Netlify Functions |

**One item for a Rav, not for code:** the 10 Av / halachic midday logic above is *technically* fine for dinner-only planning, but if you ever want the app to handle other meals (lunch, seudos, etc.) this would need real halachic-midday enforcement, not just an informational note. Worth asking your Rav if there's any scenario specific to your household where this distinction matters even for dinner (e.g., an unusually early Shabbos-adjacent dinner).

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
- **2026-07-24** — Jewish calendar banner confirmed visible and correct on live site ("Tisha B'Av week").
- **2026-07-24** — Found and fixed real cause of "shopping list gone" bug: `save()` had no error handling, so a storage failure (likely quota exceeded from pantry photos) silently dropped all future saves. Fixed with error catching, a visible Developer-mode indicator, and a regression test. Commit `9ac94dd`. User confirmed fix working live.
- **2026-07-24** — Spot-checked pantry scan accuracy against real debug report data. Confirmed canned/sauce distinction, correct quantity sourcing, model fix holding steady. Flagged one minor confidence-label mismatch to watch.
- **2026-07-23** — Full repository audit against original requirements. This file created.

---

## Next steps (priority order)

1. Do 2–3 more real pantry scans to confirm `gpt-4.1-mini-2025-04-14` is reliably stable (not just lucky once, like `gpt-5-mini` was)
2. Verify store search returns real, correctly-sorted results for your address
3. Verify no duplicate meals across a real build + replace cycle
4. Audit mobile planner UI once specifics are gathered
