# Project Status

Single source of truth for what works, what's broken, and what changed.
Update this file every time a fix is made or verified — don't rely on chat history.

Last updated: 2026-08-03 by Claude (recipe photo gallery in progress + important test-environment finding)

---

## Important finding: the "4 pre-existing test failures" all session were just a missing `npm install`

Every session this project has been worked on, `tests/community.test.mjs`, the CORS-header test, and both `household-sync` Blobs tests have failed with what looked like environment-only issues (`@netlify/blobs` module not found). They were treated as pre-existing and unrelated to whatever was being worked on - correctly, in that they were consistently reproducible and never caused by anything in-session. But the actual root cause was simpler than assumed: **`node_modules` was never installed in the sandbox.** Running `npm install` (dependencies are already correctly declared in `package.json`) resolves all of them - the full suite goes from 4 failing to 0 failing. **Any future session should run `npm install` before trusting a "these failures are pre-existing" assumption.**

---


## Shabbos Menu build list - complete (2026-08-03, same day as the overnight session above)

User did a red-team review of the Shabbos Menu feature with Claude, went through every finding one by one, then had Claude build the entire fix list. All items below are done, tested, and pushed:

**Visual redesign** (previously only existed as mockup screenshots, never actually built - caught by the user):
- Kiddush and Challah pulled out of the course model entirely into a "Table Basics" section (wine/grape juice tracking + Challah with bake-first ordering, since baking is a mitzvah - buying is the secondary option)
- Real dish editor modal (`dishEditorDialog`) replacing every `prompt()` popup that used to exist in the Shabbos flow
- Two-button pattern ("+ DmE special" / "+ Add your own") replacing the old three-button row; Add your own opens a Write/Scan/Upload sub-panel that correctly replaces (not just supplements) the two top-level buttons while open
- Course cards redesigned with icons and chip-style dishes, matching the app's existing visual language
- Short intro copy, aria-labels on icon-only buttons

**Durable lock/restore**, per the user's exact requirement: "once it is locked it is locked and needs to be able to be restored irrespective of what you are working on":
- New `durableLocks` for the weekly plan and `shabbosDurableBackup` for the Shabbos menu - both separate from the existing single-step "Restore previous plan" undo, and survive any number of subsequent actions
- New "🔒 Restore locked items" buttons (weekly plan x2, Shabbos menu x1)
- `cloudConflictsWithLocalLocks` extended to check both durable stores, not just live lock flags - closes the exact class of bug (silent sync overwrite) that this whole Shabbos feature grew out of

**Challah ↔ pantry tie-in**: `inventoryMatchesIngredient("challah")` check refreshes live via `refreshPantryDependencies`, so scanning a receipt with challah on it updates the Table Basics status immediately, not just on the next unrelated re-render.

**Document upload**: PDF support added (pdf.js) alongside the existing docx/txt (mammoth.js).

**Scan**: `recipe-import.mjs` now accepts either document text or a photo (OpenAI vision input), with source-aware error messages throughout. Client captures via a dedicated camera input, compressed at 1600px/.82 quality (higher than pantry photos, since recipe text needs to stay legible).

**Loading state**: the Add-your-own sub-panel shows "Reading your file…" / "Reading your photo…" while Upload/Scan is in flight, replacing the buttons rather than leaving them clickable with no feedback.

**Community share bridge**: after saving a custom dish via Write/Scan/Upload, if it has real cooking steps, offers to share it to Community with one confirm. Found and fixed a real gap while building this - custom Shabbos dishes never captured steps at all (only title+ingredients) until now; the dish editor has a new optional Instructions textarea, and Scan/Upload pass through whatever steps the AI found.

**Two real mistakes made and caught during this session, worth remembering:**
1. Misdiagnosed a "duplicate setState key" as dead code and deleted the wrong one - actually two different objects (`__dinnerPlannerBridge` vs `__dinnerPlannerTest`) each legitimately have their own `setState`. Broke 18 unrelated tests, caught immediately by running the full suite, reverted both to original.
2. A test asserted `dishEditorDialog.open === false`, but this test harness's FakeElement defaults `.open` to `undefined`, not `false`, until `showModal()` is ever called. Minor, but the pattern (assuming a specific falsy value instead of just checking falsy-ness) is worth watching for in future tests.

**Recurring tool-level gotcha, not a code bug**: `str_replace` has repeatedly dropped the `test(...)` declaration line when inserting a new test immediately before an existing one in `runtime-smoke.test.mjs`. Always run `node --check` immediately after inserting a test near existing ones, and look for "Unexpected token '}'" a few lines below the insertion point.

---


## Overnight session summary (2026-08-03): Shabbos Menu built out, recipes added, one real kashrus gap found and fixed

User gave a 5-hour unsupervised window to (1) build out real variety in the Shabbos Menu categories and (2) design a document-upload feature for "Write your own" recipes. Progress on each:

### Done: Shabbos Menu structural fixes + variety
- Split the combined "Fish & Salads" course into two separate courses (Fish, Salads), per explicit user request.
- Fixed a dead-reference bug: `noodle-kugel-01` was listed in the Main Course specials mapping but didn't exist in the recipe library at all - clicking it showed "Recipe not found." Replaced with real kugel recipes.
- Added real category depth: Cholent now has 4 styles (classic, with kishke, Hungarian, sweet-with-prunes). Kugel has 2 (savory potato, pareve sweet noodle). Fish has 7 (5 salmon + gefilte fish + herring). Salads (previously empty) has 6 (Israeli salad, pomegranate/greens, roasted vegetable, hummus, matbucha, potato salad). Dessert (previously empty) has 4, all pareve (chocolate cake, fruit compote, apple crumble, sorbet).
- Added 26 recipes transcribed from two docx files the user uploaded (salmon recipes, London Broil marinades, chimichurri, chicken recipes) - salmon went to Shabbos-only (fish is a weekday-only ban per the user), the rest went into the regular weekday meat library.

### Real bug found and fixed: dairy recipes in a meat-meal course pool
Two salmon recipes used real Cholov Yisroel butter and were marked `kind:"dairy"`, but were being offered in the Fish course - the same course pool as meat mains - at Friday night/Shabbos day, which are meat meals in Chabad practice. This is a real "mixing meat and dairy at the same meal" risk, not just a data nitpick. **I flagged this to myself mid-session but didn't actually fix it until later in the same session - worth noting since it shows the risk of flagging-without-fixing during a long autonomous run.** Fixed: both recipes converted to pareve (margarine instead of butter). Added a permanent automated test (`no Shabbos-tagged recipe is ever dairy`) so this class of bug cannot silently regress again, regardless of who adds future Shabbos recipes.

### Not done yet (ran out of session time)
- **Document upload feature** for "Write your own" (Shabbos custom dishes + Community recipe submission) - not started. This needs a new AI-backed Netlify function (same pattern as pantry photo scanning / receipt scanning) to parse an uploaded docx/PDF/text file into structured recipe data. Should reuse whatever AI provider config the existing `pantry-ai.mjs` / `receipt-scan.mjs` functions already use.
- Kishke was built as a simplified modern stovetop/oven matzah-meal log (no animal casing) per an assumption stated to the user, not yet confirmed correct.
- Community "add recipe to database" bridge (offer to share a custom Shabbos write-in to the Community list with one tap) - discussed, not built.

### Total recipe library: 802 recipes (up from 750 at start of this project)
Meat: 403, Dairy: 225, Pareve: 174. 31 recipes tagged `shabbos`.

**Testing discipline maintained throughout**, including the 4-hour unsupervised stretch: every batch was checked against the recipe-library test suite (kashrus/banned-ingredient rules, hands-on time caps, honest time-vs-steps, no vague instructions) before being committed, and the full `npm run qa` suite was run before every push. No untested code was pushed.

**A recurring str_replace bug** (a tool-level pattern-matching quirk, not a code bug) dropped the `test(...)` declaration line several times when inserting new tests adjacent to existing ones in `runtime-smoke.test.mjs` - each instance was caught by the immediate syntax check and fixed before proceeding. If tests start failing with "Unexpected token '}'" after an edit, check for a dropped `test('...', async () => {` line right above the error.

**A separate tool-level gotcha hit repeatedly:** the test harness runs `js/app.js` and `js/recipes.js` inside a Node `vm` context, so any array returned from `__dinnerPlannerTest` functions is a different-realm array. `assert.deepEqual`/`deepStrictEqual` from `node:assert/strict` fails on cross-realm arrays even when contents are identical - wrap with `Array.from(...)` before comparing. Hit this three times this session before it became reflexive.

---


## Real bug fixed today: main Build button silently wiped locked meals

User accidentally tapped "Build this week's dinners" (not "Replace unlocked") while locked meals existed. The main Build button never checked for locks at all — `buildPlanForWeek` unconditionally clears `state[lockedField]` when `replaceUnlocked` is false, and generates a fresh plan ignoring the old one entirely. No warning, no confirm, meals just gone.

**Fixed:** `runBuild` now checks for locked meals before calling the main build path and shows a `confirm()` prompt ("You have X locked dinners... Continue?") if any exist. Declining leaves the plan and locks untouched. Two new regression tests cover both the decline path and the "no locks, no prompt" path.

**Data was not recoverable.** `household-sync.mjs` overwrites the household's state in place with no version history — there is no backup of the plan before it was wiped. Recommended the user check other household members' phones for a stale (unsynced) copy before giving up. Real gap worth considering: **household sync currently has zero history/versioning.** If this comes up again, a lightweight "keep last N states" approach in the Blobs store would make this recoverable next time — not built, just flagging it as a real product gap.

**Also fixed today (audit requested by user, "search any eventualities"):**
- Replace button now refuses to touch a locked day (same bug class as Build).
- Joining a household now checks for conflicts with local locked meals instead of silently overwriting.
- New "Restore previous plan" button: every Build/Replace/sync-apply/household-join snapshots the week beforehand; the button appears whenever there's something to undo. This is the direct safety net requested after today's incident.
- Note on the v1/v2 recovery attempts for household ANGZWU83 earlier today: the v1 guess (Lemon Herb Chicken / Grilled Cheese and Tomato Soup / Beef Burger Night / Loaded Baked Potatoes / Mild Beef Tacos) was WRONG - the user said their actual week had a Korean rice dish and a chicken dish, details unconfirmed. v2 removed the incorrect locks. Do not re-guess this again; if it comes up, ask the user directly rather than inferring from old screenshots in the conversation.

---

## ⚠️ DO NOT DO THIS — read before touching GitHub Actions or App Store status

There is a `check-app-store-status.yml` workflow in this repo, meant to let Claude check Apple's review status on demand without a code push. **It does not work — the token cannot trigger on-demand workflow dispatches (only push-triggered ones), and attempts to fix this via token permissions did not resolve it either.** This is a minor, optional convenience, not a real feature. A previous session spent 20 minutes going in circles on this and it genuinely upset the user.

**If App Store review status ever comes up again: tell the user to check appstoreconnect.apple.com directly. Do not attempt to debug, fix, or re-investigate the token/workflow permission issue unless the user explicitly asks for it by name.**

---

## READ THIS FIRST — current state as of 2026-07-31

**App Store:** Full submission is in with Apple, status "Waiting for Review" as of last check, set to **Manually release** (won't go public automatically even after approval — user must tap release themselves). Screenshots, description, keywords, privacy policy, age rating (4+) all completed together with the user.

**TestFlight:** External testing group "Friends and Family" exists with a **public join link** (saved to memory: `https://testflight.apple.com/join/nDKKYqfG`). Marketing flyer (PNG + PDF) already created for recruiting testers.

**⚠️ Architecture changed tonight — read this before touching build/deploy anything:**
The native app no longer bundles web assets. `capacitor.config.json` now has `server.url` pointing at the live Netlify site (`https://cheerful-conkies-96998f.netlify.app`). This means:
- **JS/CSS/HTML/Netlify-function changes deploy via a normal `git push` to Netlify — no Xcode build, no TestFlight upload, no new App Store review needed.** Live within ~30-60 seconds.
- **A new native (iOS) build is ONLY needed for:** new permissions, new Capacitor plugins, app icon/splash changes, `capacitor.config.json` changes, or other `ios/**` changes.
- The iOS GitHub Actions workflow (`.github/workflows/ios-build.yml`) trigger paths were deliberately narrowed to match this — it no longer fires on `js/**`/`css/**`/`index.html` pushes. **Don't widen these paths back without good reason** — doing so was directly costing the user money in wasted macOS build minutes.
- One real gotcha this caused: switching to `server.url` changes the app's storage origin, which **wiped the locally-remembered household code** on the user's device (their actual cloud data was never lost, just the local pointer to it). If this comes up again, the household code can be recovered by having someone with Netlify dashboard access temporarily deploy a diagnostic function that lists `households` Blobs store keys — ask before doing this, it's a real (if small) privacy consideration.

**Household sync — real root cause found and fixed:** `household-sync.mjs` was written in the classic Netlify Functions v1 format (`export async function handler(event)`). For reasons not fully understood, this format was NOT reliably seeing the `NETLIFY_BLOBS_TOKEN`/`NETLIFY_BLOBS_SITE_ID` env vars, while newer v2-format functions (`export default async (request) => {}`) consistently did, even from the same deploy. Converted `household-sync.mjs` to v2 format. **If any other Netlify function starts behaving strangely with env vars, check whether it's still on the old v1 format** — that's the prime suspect now, not the credentials themselves.

**Netlify usage:** The site was briefly paused tonight for hitting usage limits (very likely caused by an unusually high volume of rapid diagnostic deploys during live debugging, not normal steady-state app usage). User added billing credit and it's resolved. Worth being more disciplined about batching test/diagnostic deploys going forward rather than firing off many in quick succession.

**Pantry item icons — rebuilt tonight, now stable:** Icon selection is fully deterministic (`NAME_ICON_RULES` array in `js/app.js`, ~50 keyword-to-icon rules checked against the item's raw name). **AI-guessed icons were tried and explicitly rejected by the user** — don't reintroduce that approach without discussing it again first. Most entries are plain emoji; 3 specific foods (hummus, hot sauce, yogurt) use hand-built custom SVG icons because no single emoji represented them well — see the icon rules block in `js/app.js` for the actual markup. **Process note the user cares about:** for any further icon/visual changes, render an actual preview (a real screenshot at true app card size/colors, or a chat-visualized mockup) and get explicit sign-off *before* pushing to production — this was explicitly requested twice tonight after a change went out without one.

**Known real gaps, not fixed on purpose:**
- "Natural Pasture Shabbos Meat" (a real pantry item) doesn't match any recipe ingredient — too generic a name to safely guess which cut it is without risking a wrong suggestion. Left alone deliberately.
- Android release signing (Play Store) — not started.
- Cook-to-pantry deduction feature — not built.

**Test suite:** 77 tests passing (`npm run qa`) as of the last push. Always run this + `node scripts/check-syntax.mjs` before pushing anything, and never claim something is fixed without it actually passing.

---

## For a new Claude chat picking this up

- **Reuse the existing GitHub token — do not ask the user to generate a new one every time.** A fine-grained personal access token already exists, scoped to this repo with Contents + Workflows read/write, expiring **2026-08-22**. The user has it saved. Ask them to paste it in; only request a brand new one if this one turns out to be revoked or expired.
- Read this whole file before making changes — it's the actual current state, not a chat's memory.
- The user is not a developer by trade. Keep explanations plain, and don't send them on manual dashboard hunts for things already documented here.

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
| No duplicate recipes (this week or on replace) | **Live verified** | Tests pass; user confirmed live, including after multiple "Replace unlocked" cycles |
| Jewish calendar (auto Hebrew date, Nine Days, Tisha B'Av, meat restrictions) | **Live verified** | User confirmed the banner is visible on the live site and correctly showing "Tisha B'Av week" today |
| Local kosher grocery + meat store search (Baltimore-area) | **Live verified** | User confirmed store search works on the live site |
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
| Store lookup problems | **Confirmed working live** by user |
| Duplicate meals | **Confirmed working live** by user |
| Wrong quantities | Needs live verification — code + tests look correct |

---

## App name

**Decided: "Dinner Made Easy."** This was already the tagline used throughout the mockups/renderings — now confirmed as the actual app name.

**Renamed everywhere that matters for the user:**
- `manifest.json` `name`/`short_name` — this is what shows on the phone home screen after "Add to Home Screen", which is what prompted this fix
- Page `<title>`
- Mobile top-bar brand text
- `package.json` name/description
- `README.md` heading

**Deliberately left alone** (internal, not user-facing): the service worker cache name already said `dinner-made-easy-*` (was already correct), and internal downloaded-file names like `dinner-planner-support-*.json` — these are just file-naming conventions for debug exports, not branding.

## Desktop layout (2026-07-24)

Rebuilt the desktop (≥960px) layout to match the reference mockup style:
- Added a persistent left sidebar: brand, nav links (Home, Weekly Plan, Recipes, Pantry, Shopping Lists, Stores, Jewish Calendar, Settings — all scroll to existing sections, no new pages), and a "Free. Private. No ads." card.
- Hero is now two-column on desktop (text + actions on left, kitchen photo on right); stays single-column stacked on mobile exactly as before.
- Added a 4-item feature row below the hero (Use what you have / Smart shopping / Kid-friendly / Less stress).
- Old mobile top-bar (brand + hamburger + version badge) is untouched and still drives Developer Mode's 7-tap entry — it's just hidden on desktop where the sidebar takes over.
- Verified by actually rendering the page with Playwright and screenshotting both desktop (1440px) and mobile (390px) before shipping — not just reading the CSS.
- All 27 automated tests still pass; no functional IDs were changed, only presentation.

**Done:** hero photo updated to the full family (parents + two kids) matching the same warm kitchen style. Also caught and fixed a real bug while checking it: the photo container was being stretched to match the text column's height on desktop, cropping the sides of the photo and cutting off part of the family. Fixed by sizing the photo box to its actual aspect ratio instead. Verified via screenshot before and after the fix — confirmed the whole family is visible now.

**Upgraded further (same day):** user wanted this fully automatic, not just a warning requiring a manual tap. Changed `renderWeekSection` to auto-rebuild a stale plan on render (using `replaceUnlocked: true`, so any locked meal moves to its matching new date instead of being wiped). The orange warning now only appears in the rare fallback case where auto-rebuild itself fails (e.g. exclusions filter out every recipe). Verified in a real browser: locked a meal, simulated a week passing, confirmed the plan silently rebuilt itself with correct current dates while the locked meal survived, and no warning was shown. All three CI workflows (QA, Android, iOS) pass clean on this change.

## Bug: recipe variety only tracked dish type, not protein (2026-07-24)

User reported getting three different ground-beef dishes in one week (Beef Burgers, Beef Tacos, Mini Meatloaves).

**Root cause:** the recipe library already tags each recipe's actual protein (`beef`, `chicken`) correctly, but the variety logic only tracked `family` (a dish-type label like `beef-burgers`, `beef-tacos`, `mini-meatloaf`) to avoid repeats. Since these are three genuinely different families, the family check never caught that they're all ground beef — nothing was tracking protein at all.

**Fix:** added `recipeProtein()` and `usedProteins` tracking alongside the existing family tracking, in `buildPlanForWeek`, `chooseUniqueRecipe`, and `replaceDay`. A repeat protein now takes a moderate scoring penalty (not a hard ban — with only two protein tags in the library, chicken/beef inevitably repeat some across a 5-day week, especially with 3 meat nights; the goal is discouraging over-concentration, not eliminating all repeats).

**Verified statistically, not just once:** since this is score-weighted rather than a hard rule, a single test run proves little. Built 25 random plans and confirmed no more than 2 of the same protein ever land in one 5-day week across all of them.

## Root cause fix: "app not updating" (2026-07-24)

After the calendar auto-refresh fix, user reported the app still wasn't updating. Dug in properly instead of suggesting another cache-clear, and found the actual root cause — not a browser quirk, a real gap in our own code.

**The bug:** `prepareCurrentAppVersion()` — the function responsible for clearing old caches and nudging the service worker to update — only ran its logic `if (previous !== APP_VERSION)`. But `APP_VERSION` has been `"60"` for this *entire session*, through dozens of real deploys. So that check has been silently doing nothing, all day, every deploy. Every "stale" report today (photo not loading, household sync, calendar) likely traced back to this same gap, not separate one-off caching flukes.

**The fix:** added `BUILD_ID`, a value that changes automatically on every single deploy (injected from the git commit — Netlify's `COMMIT_REF` for the web deploy, GitHub's `GITHUB_SHA` for native app builds, a timestamp as a local-dev fallback). Update-detection now keys off `BUILD_ID` instead of `APP_VERSION`, so it fires on every real deploy regardless of whether the feature-facing version number changes. `APP_VERSION` ("v60") stays as the stable, user-visible feature version — unrelated concern, unchanged.

Also updated the service worker's own cache name and all asset cache-busting query strings to include `BUILD_ID`, so the browser can tell every deploy apart, not just ones where we remembered to bump a number.

**Verified for real:** ran the injection script against actual copies of `index.html`, `service-worker.js`, and `js/app.js` and confirmed the same build ID lands consistently in all three and that the files remain valid. Also ran it through the native-app build path (`build-www.mjs`) and confirmed the same. All three CI workflows (QA, Android, iOS) passed on GitHub's own servers with this change included.

**What this means going forward:** this class of "why isn't my change showing up" issue should now be rare — every deploy automatically busts its own cache. The in-app "Reload latest app" button still exists as a manual backstop, but shouldn't be needed as a matter of routine anymore.

## Bug: stale Tisha B'Av info after a week passed (2026-07-24)

User reported the app still showed Tisha B'Av restrictions/dishes after the calendar week had genuinely moved on (this surfaced right after Shabbos — a real day-boundary crossing while the app sat unused).

**Two distinct real bugs found, both fixed:**

1. **Calendar banner never re-checked itself.** `renderCalendar()` only ran at initial page load. If the app/tab stayed open (or was just backgrounded) across a day boundary, the banner kept showing whatever was true when it last rendered — it had no way to notice the date had changed underneath it. Fixed: added a day-change check on `visibilitychange` (when you return to the app) and a 60-second interval as a backstop, so the banner self-corrects without needing a manual reload.

2. **The plan itself had zero tracking of which week it was built for.** Each day's plan entry already stored its own `date`, but nothing ever compared that to today's actual computed dates. This meant: build a plan, then don't rebuild for a week or more, and the app would silently keep pairing old (possibly Tisha-B'Av-specific) recipes with whatever the current date range happened to be — no warning, nothing. Fixed: added `isPlanStale()`, which compares the plan's stored dates against today's actual week. When they don't match, a clear orange warning now appears above the plan: *"This plan is from a previous week... tap Build this week's dinners to refresh it."* Deliberately does **not** auto-rebuild silently — that could overwrite someone's locked/chosen meals without asking.

**Strengthened (same day):** the first fix used only `visibilitychange`, which is known to be unreliable specifically in iOS Safari's "Add to Home Screen" standalone mode — exactly how this app is meant to be used. Added `focus` and `pageshow` listeners as well, shortened the backstop interval to 15s, and made the day-change check also refresh both week sections (so the stale-plan warning appears proactively too, not just the calendar text). **Verified with a real headless-browser test using Playwright's clock API** — loaded the real page on a simulated Tisha B'Av date, fast-forwarded 3 days with no page reload, fired the same events a phone would fire on resume, and confirmed the banner genuinely updated itself. Also added a permanent lightweight regression test (no browser needed) that checks the actual re-render happens on a detected day change, and that it correctly does *not* re-render again without a real day change (avoiding wasted work).

## Privacy policy (2026-07-24)

Added `privacy.html` — a plain-language privacy policy required for App Store / Play Store submission. Reflects actual data practices, not filler boilerplate:
- Local-only storage by default
- Household sync explained (optional, code-based, photos excluded)
- OpenAI photo analysis and Google Places store search disclosed as the only third parties involved
- No ads, no accounts, no tracking, no paid tiers
- A children's-information section, since the app may be used by kids under parent guidance

Linked from the app's Settings section. Included in native Android/iOS builds too.

**Not legal advice — this is a good-faith draft.** Worth a quick real review before actual store submission, especially given it touches children's data indirectly.

## Native iOS app (2026-07-24, signing completed 2026-07-28)

Same approach as Android — Capacitor wraps the existing web app.

- Repo now has `ios/` (native Xcode project), same `capacitor.config.json`/`resources/`/`scripts/build-www.mjs` as Android reuse.
- **Builds via GitHub Actions on `macos-latest` runners — no Mac needed on the user's end**, since GitHub's macOS runners include Xcode.
- Hit and fixed a real issue: `xcodebuild -derivedDataPath` requires a scheme (not just a target), but Capacitor's generated project doesn't include a shared scheme by default (Xcode only creates one on first interactive open, which never happens in CI). Fixed by hand-authoring a proper shared `.xcscheme` file. This also matters for later: a real signed archive build (`xcodebuild archive`) requires a scheme too, so this was needed eventually regardless.
- **Code signing is done and verified working.** User has an Apple Developer account (Team ID H38376B6RX). Walked through, together in real time: registering the App ID (`com.dinnermadeeasy.app`), generating a CSR without any local terminal (via a one-click GitHub Actions workflow - `ios-generate-csr.yml` - that generates the key+CSR on GitHub's own macOS runner so the user never has to install or run anything locally), creating an Apple Distribution Certificate, and creating an App Store provisioning profile. The certificate (`ios/signing/distribution.cer`) and provisioning profile (`ios/signing/Dinner_Made_Easy.mobileprovision`, valid through July 2027) are committed to the private repo - low risk on their own since neither is usable without the private key, which is instead stored only as the `IOS_PRIVATE_KEY_PEM` repository secret.
- `ios-build.yml` now has a second job (`signed-build`) that imports the cert+key into a temporary keychain, installs the provisioning profile, runs a real `xcodebuild archive` (Release, manual signing) and `xcodebuild -exportArchive`, and uploads the resulting signed `.ipa` as a build artifact. The temporary keychain is deleted at the end of every run regardless of outcome.
- Hit and fixed two real bugs along the way, both confirmed via actual failed run logs (not guessed): (1) `PlistBuddy` can't reliably read a piped/stdin plist - fixed by writing to a real temp file first; (2) `security import` failed with a misleading "MAC verification failed (wrong password?)" error - actual cause was GitHub's macOS runner using OpenSSL 3.x, which defaults to AES-256/SHA-256 PKCS12 encryption that Apple's Security framework can't parse. Fixed with `-legacy` on `openssl pkcs12 -export`.
- **Verified: a full signed build succeeded end to end** - every step (archive, export, upload) completed, and a real, non-empty (1.26 MB) signed `.ipa` was produced. Confirmed via the GitHub Actions API, not assumed.

**Not yet done:**
- App Store listing (screenshots, description) - reference doc already prepared with pre-filled text for most fields
- Actually testing the TestFlight build on a real device
- Eventually submitting for App Store review (currently only reaches TestFlight, not the public App Store)

**TestFlight upload: done and verified.** Set up an App Store Connect API key (Key ID + Issuer ID + .p8 private key, stored as GitHub secrets `APP_STORE_CONNECT_KEY_ID`/`APP_STORE_CONNECT_ISSUER_ID`/`APP_STORE_CONNECT_API_KEY_P8`). Added an `xcrun altool --upload-app` step to `ios-build.yml` that runs automatically after every successful signed build. Hit and fixed a real bug: the `.p8` secret got saved without its `-----BEGIN/END PRIVATE KEY-----` header/footer lines (a copy-paste mishap), causing `altool` to report "does not contain a valid authentication key." Diagnosed via the actual failure log (not guessed), fixed by re-pasting the complete key. **Confirmed via the GitHub Actions API: the "Upload to TestFlight" step now completes successfully on every push to main.**

## Dish ratings (2026-07-24)

Thumbs up / neutral / thumbs down on any dish — from its meal card in the weekly plan, or from the recipe detail modal.

- **Rating lives on the recipe, not the day.** If "Hungarian Goulash" gets a thumbs down, it stays deprioritized the next time it would come up, not just that one week.
- **Not a hard ban.** A downvoted recipe is heavily deprioritized in scoring, not permanently excluded — tastes change, and this avoids painting the app into a corner if variety runs thin.
- **Syncs across the household** — same as plan/pantry/shopping, so the whole family's opinion feeds into future planning, not just whoever tapped the button.
- **Verified with a real browser test** (not just unit-level): built a plan, clicked the actual thumbs-up button, confirmed the DOM updated correctly — plus separate tests confirming the score math (up increases score, down decreases it, neutral clears the rating).

## Family account / household sync (2026-07-24)

Lets your spouse (and kids, if you want) see and edit the same plan/pantry/shopping list from their own phone.

**How it works:**
- One device creates a household → gets a short code (e.g. `KJ8P2XQR`)
- Other devices enter that code to join
- After that, both devices share: plan, pantry inventory (names/qty/confidence — not photos), shopping list + checkmarks, preferences, stores
- Sync happens automatically ~1.5s after any change, plus every 45s and whenever the app comes back to the foreground (not true instant real-time — a reasonable tradeoff for a family meal-planning app, not a live-collab document)

**Deliberately excluded from sync, and why:**
- Pantry/fridge photos stay on the device that took them — syncing full images would make every small edit slow and heavy. Only the AI's structured reading of the photo (item name, quantity, confidence) syncs.
- Debug logs, error timeline, AI request history — device-specific diagnostics, not meaningful to share.

**Backend:** a new Netlify Function (`household-sync.mjs`) using Netlify Blobs for storage — no new account/database signup needed, fits the "always free" model. No authentication beyond knowing the code (like a private link) — appropriate for a family tool, not bank-grade security. Worth knowing: anyone with the code has full read/write access.

**Tested:** real automated test simulates two separate devices — one creates a household and adds a pantry item with a photo thumbnail, the other joins and receives the plan and pantry item, but confirms the photo thumbnail does NOT transfer. This is a genuine two-device simulation, not just "doesn't crash."

**Live-verified (2026-07-24):** user confirmed household sync works end-to-end after adding `NETLIFY_BLOBS_SITE_ID` and `NETLIFY_BLOBS_TOKEN` environment variables and redeploying. Root cause was a documented Netlify platform issue (`MissingBlobsEnvironmentError` — automatic Blobs context injection failing intermittently in production), worked around with explicit siteID/token configuration.

**Critical bug found and fixed (2026-07-24):** the household sync had an infinite loop. Logging a successful/failed sync via `logEvent()` triggered another `save()`, which (since a household was active) scheduled another cloud push, which logged its own result, which triggered another save, forever — hammering the sync endpoint continuously every ~1.5s indefinitely. This is almost certainly why the user's first attempt to create a household "failed." Root cause: `logEvent()`'s internal save call wasn't excluded from triggering cloud sync, even though debug logs were never part of the synced payload in the first place. Fixed by having `logEvent()` skip cloud push. Caught by the automated test suite hanging/timing out — a real, valuable catch, not just a theoretical test artifact.

**Also added:** household sync status (code, device name, last sync state) is now included in downloadable debug/support reports, and a "Share code" button using the native phone share sheet (works with Messages, WhatsApp, email, contacts — whatever the phone offers), addressing the user's request to make sharing the household code easier than manually copying it.

## Native Android app (2026-07-24)

Set up via Capacitor — wraps the existing web app into a real Android app shell.

- Repo now has `android/` (native project), `capacitor.config.json`, `resources/` (icon/splash source), `scripts/build-www.mjs` (assembles the web bundle Capacitor packages).
- Fixed a real issue while setting this up: the app's two API calls (`pantry-ai`, `store-locator`) used relative `/.netlify/functions/...` paths, which only work when served from the Netlify site itself. A packaged native app has no local server at that path. Added an `API_ORIGIN` constant in `js/app.js` that points those calls at the real deployed site when running inside Capacitor (`window.Capacitor` present), while staying relative (unchanged behavior) on the web.
- **GitHub Actions builds the Android APK automatically** — no local Android SDK needed by anyone. Two workflows:
  - `qa.yml` — runs the full test suite on every push
  - `android-build.yml` — builds a debug APK on GitHub's runners (which include Android SDK + Xcode-equivalent tooling built in) and uploads it as a downloadable artifact
- Hit and fixed a real CI bug: Capacitor CLI 8.x requires Node ≥22; workflow was set to Node 20 and failed immediately. Fixed by bumping the Android workflow to Node 22 (left the QA workflow at Node 20 intentionally, since that matches the app's documented minimum supported Node version).
- **First successful build confirmed** — debug APK built and uploaded as a GitHub Actions artifact.

**Not yet done:**
- Release signing (needed for real Play Store submission — currently only a debug build, which can be installed for testing but not published)
- Play Store listing (screenshots, description, privacy policy)
- iOS project (not started — same Capacitor approach will apply; GitHub's macOS runners provide Xcode without needing a physical Mac)
- Auto-publish to Play Store from CI (possible via Google Play Developer API + service account key, deliberately not set up yet — signing/publishing credentials should be added directly by the user as GitHub secrets, not routed through chat)

## Known resolved issues log

- **Mobile "unstyled long list" / photo not loading (2026-07-24):** After the desktop redesign + hero photo change, user's phone showed an unstyled page (raw list of text/buttons, no photo). Root cause: stale PWA cache/service worker holding old assets. Fixed by using the in-app "Reload latest app" button (clears cache + service worker). Confirmed resolved via debug report: v60, iPhone Safari, zero runtime errors. **This pattern recurred a second time** after the household sync deploy (photo not loading again) — same fix (reload latest app) resolved it again. **Lesson for future changes:** any time CSS/HTML/JS changes ship, proactively remind the user to reload/clear cache rather than waiting for them to report a "broken" page — this is expected PWA caching behavior, not a new bug each time.

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

- **2026-07-30 (custom icons, previewed and approved before shipping)** — For the 3 foods that still looked wrong/approximate even with a curated emoji (hummus, hot sauce, yogurt), built real custom SVG icons instead, per direct user request. Rendered an actual local screenshot at the real app's card size and colors before writing any deployment code, per the user's explicit "show me before deploying" instruction - caught and fixed a real overflow bug this way (yogurt's text was too large for the container outline) before it ever reached production. Final icons: hot sauce = bottle outline with a chili mark, hummus = a plate with an olive-oil swirl and paprika dots (not tracing back to chickpeas), yogurt = a cup outline with "yogurt" lettering sized to fit inside. The other ~40 entries in the existing name-based dictionary were left as emoji, since they already work well and didn't need replacing.

- **2026-07-30 (final resolution, per direct discussion)** — After discussing tradeoffs directly with the user (AI-guessed icons vs. a deterministic curated table vs. a product-image lookup API), settled on the deterministic table - the user correctly reasoned it doesn't require "another interface" since it's just code, not a separate admin tool. Removed the AI icon-guessing approach entirely (schema field, prompt guidance, validation, and client-side priority) from both pantry-ai.mjs and receipt-scan.mjs. Discovered mid-fix that a comprehensive NAME_ICON_RULES table already existed in the codebase from earlier in the session - avoided building a duplicate parallel system and fixed the real existing bugs instead: (1) hummus was grouped with the generic bean/chickpea/lentil rule, tracing back to raw ingredient origin - exactly what the user objected to directly; separated it to represent the prepared dip itself. (2) Hot sauce items whose name doesn't literally contain "hot sauce" or "buffalo" (e.g. "Frank's RedHot Original Cayenne Pepper Sauce") were falling through past the hot-sauce exception and matching the generic "(bell )?pepper" produce rule instead - broadened the hot-sauce pattern to catch pepper-sauce naming before the generic produce rule ever sees it. 76 tests pass, including a broad-coverage test across ~40 common grocery items and a dedicated plural-handling test.

- **2026-07-31 (full icon system rebuild)** — Per explicit user feedback that relying on the AI to freshly guess a good icon on every scan was fundamentally unreliable (it's still just a per-request AI guess), rebuilt icon selection around a fixed, deterministic, testable dictionary of ~50 keyword-to-emoji rules checked against the item's own name text - the same result every time, with no dependency on AI accuracy for this specific sub-task. The AI-provided icon (from the earlier attempt) is kept only as a lower-priority fallback for items the dictionary doesn't recognize. Caught and fixed a real bug during development via a broad coverage test: several patterns used a trailing word-boundary that blocked natural plurals from matching (e.g. "Roasted Almonds" fell through to the generic fallback icon because the pattern required "almond" to be immediately followed by a boundary, and the plural "s" broke that). Fixed by removing trailing boundaries throughout while keeping leading ones (to still prevent mid-word false starts like "unicorn" matching "corn"). Verified with 76 total tests including broad coverage across ~40 common grocery items, explicit plural-form cases, and exception-ordering cases (black pepper the spice vs. bell pepper the vegetable; peanut butter vs. peanuts).

- **2026-07-30 (real fix, not another patch)** — The user correctly called out that patching one wrong food icon at a time (eggs, fish, hummus) was whack-a-mole and wasn't going to hold up - there are certainly more foods with the same problem not yet discovered. Instead of adding another individual fix, changed the underlying architecture: the AI now picks a specific, accurate emoji per item directly (new `icon` field in both pantry-ai.mjs and receipt-scan.mjs), rather than being forced into 9 broad category buckets with no guidance and silently defaulting to something like "dairy" when uncertain. This is a much better fit for what vision models are actually good at. The existing name-based fallbacks (eggs/fish/hummus) stay in place as a safety net for items scanned before this change. Verified with a test using "guacamole" - a food that never had a specific patch written for it - to confirm the new approach handles previously-undiscovered cases without needing one.

- **2026-07-30 (proactive update detection)** — Added an "update available" banner so staleness like what happened with Jacqueline's phone can't silently persist. The app now actively checks the deployed build ID (via a lightweight fetch of service-worker.js) when resumed from background, on focus, and every 10 minutes - if a newer build is live than the one currently running, a banner appears with a one-tap refresh, rather than requiring the person to notice something looks wrong and guess to force-quit/reopen. Deliberately does NOT auto-reload silently, since that could interrupt someone mid-task (e.g. filling out a form) - the person stays in control of when to refresh. Fails silently on network errors so a transient connectivity issue never interrupts normal use. Verified with tests covering: banner stays hidden when build matches, banner appears when build differs, and the check never throws on a network failure.

- **2026-07-30 (build cost fix)** — Noticed the iOS build workflow was still triggering a full, expensive macOS build on every js/**, css/**, and index.html push, even though the architecture change earlier tonight means those now deploy via Netlify alone and never need a native rebuild. This directly worked against the user's explicit request to reduce build costs - confirmed a completely unnecessary build (#51) had just been triggered by a JS-only fix. Narrowed the trigger paths to only genuinely native-relevant changes: ios/**, manifest.json, capacitor.config.json, resources/**, and package.json/package-lock.json (dependency changes, e.g. new Capacitor plugins, do need a real rebuild). This was itself a one-time necessary build to validate the new workflow; going forward, JS/CSS/content fixes should no longer trigger the macOS build at all.

- **2026-07-30 (overnight, unattended)** — Addressed two issues raised right before the user went to sleep, with explicit instruction to keep working and have fixes deployed by morning:
  1. **Pantry suggestions redesigned to match actual intent.** The user clarified the real goal: "help someone come up with a dish of what they have at home," not just rank recipes by raw ingredient-overlap count. The old scoring (`matched*4-missing`) could let a recipe needing 4 more ingredients outrank one that was nearly complete. Redesigned to require at least 50% ingredient coverage before a recipe counts as a real suggestion, sorted by coverage ratio first (falling back to the best partial matches only if nothing clears that bar, so the list is never empty).
  2. **"Pargiyot" (a standard kosher-butcher term for boneless chicken thigh cutlets) now matches "chicken thighs."** This was silently excluding every chicken-thigh recipe from suggestions for real pantry items using this common term (the user's own "Baby Chicken Pargiyot Family" item, confirmed from their screenshots). This directly addresses the "doesn't take into account all the meat I bought" complaint - at least for this specific real item.
  - **Not fixed, and shouldn't be guessed at:** "Natural Pasture Shabbos Meat" is too generic a marketing name to safely map to one specific cut (could be brisket, chuck, stew meat, etc.) - forcing a guess here risks suggesting a recipe using meat they don't actually have in that form. Flagged for the user to review in the morning rather than silently assumed.
  - **Jacqueline's phone still showing the old hummus icon:** the underlying fix is live and verified via automated tests, but if her device is on an older TestFlight build (before the remote-loading switch) or has a stale cached page open, no server-side fix would reach it without her updating/reopening the app. Flagged for the user to check her build number in the morning rather than assumed fixed.
  - All work verified with the automated test suite (70 tests) before being pushed - no user confirmation was available overnight, so extra care was taken to test thoroughly rather than assume correctness.

- **2026-07-30 (root cause found)** — After the token regeneration and cache-clear deploy still didn't fix household-sync, found the real root cause via the app's own debug report: household-sync.mjs was written in the classic Netlify Functions v1 format (`export async function handler(event)`), while temporary diagnostic functions written in the newer v2 format (`export default async (request) => {}`) consistently saw the environment variables that household-sync.mjs did not, even from the same deploy. Converted household-sync.mjs to the v2 Request/Response format to match. Along the way, the v2 conversion caught a real spec-compliance bug of its own: the standard Response constructor forbids a body on a 204 status, which the test suite caught immediately. Updated tests/functions.test.mjs to match the new calling convention.

- **2026-07-30 (critical fix)** — Found and fixed the real cause of "I rejoined my household code and everything is still empty": household-sync.mjs's explicit Netlify Blobs credentials (NETLIFY_BLOBS_TOKEN) had gone invalid again, and every operation was silently returning a 401 with no fallback - meaning join/push/pull had been broken for real use, not just a UI display issue. Discovered via a temporary diagnostic function that proved the automatic-context store still worked fine even though the explicit-credential store didn't. Fixed by making household-sync.mjs try explicit credentials first (normally more reliable) but automatically retry with the automatic-context store if that fails, instead of just erroring. Also used the same diagnostic to recover the user's actual household code (ANGZWU83, 42 pantry items) after it was lost to a local-storage origin change from switching to remote-URL loading.

- **2026-07-30 (architecture)** — Switched the native iOS app to load from the live Netlify site (`server.url` in capacitor.config.json) instead of bundling web assets into the binary at build time. This was a deliberate cost/speed tradeoff requested by the user: going forward, JS/CSS/content fixes ship via a normal `git push` to Netlify and are live within seconds - no Xcode build, no TestFlight upload, no new App Store review needed for that class of change. A new native build is still required only for genuinely native changes (new permissions, new plugins, icon/splash changes, Info.plist settings). One honest tradeoff: the app now needs network connectivity to load fresh content, same as any live website - the existing service worker still caches previously-loaded content for some offline resilience, but this is a different guarantee than the fully bundled offline-first behavior before this change. This was done while a full App Store submission was already pending review (on the old bundled architecture) - deliberately accepted the risk of restarting that review clock, per explicit user instruction, given the ongoing cost of full rebuilds for every fix was the more pressing concern.

- **2026-07-30 (full pass)** — After being asked to do a complete check rather than stopping at the first issue found, went back through all 10 of the user's pantry screenshots systematically. Found and fixed a real structural bug: `mergePantryItem` required an *exact* unit match before combining two entries, so the same product scanned once as "1 package" and again as "1 bag" (e.g. shredded cheese) stayed as two permanent separate cards even though the name matched. Added `unitMatchGroup()` so generic packaging words (package/bag/box/container/pack) are treated as equivalent for merge-matching purposes, while true measurement units and shape-specific containers (jar/can/bottle/loaf/etc.) stay distinct. Confirmed the shopping-list deduction logic was NOT affected by this bug, since it already matches by name alone and converts units rather than requiring an exact match. Also found and fixed a second instance of the eggs-category gap: fish had no category of its own either, so salmon was showing a steak icon (categorized as "meat"). Added a real "fish" category alongside the "eggs" one, plus a name-based fallback for already-scanned items. One remaining item from the screenshots is NOT a code bug: a generic "hummus container" (qty 4) sitting alongside more specific "Sabra Classic/Garlic Hummus" entries - this is a blurry-photo limitation (the AI genuinely couldn't read the brand on the first pass), not a naming bug, and isn't safe to auto-merge without risk of wrongly combining different items - flagged for the user to manually remove once confirmed it's the same hummus.

- **2026-07-30** — Fixed another real bug the user caught from their pantry screenshots: eggs were showing a milk glass icon instead of an egg icon. Root cause: the AI's category schema had no "eggs" option at all (only produce/meat/dairy/frozen/dry goods/canned/condiment/other), so it was forced to guess "dairy" for anything egg-related - inaccurate visually, and also inaccurate for kashrus purposes since eggs are pareve, not dairy. Added a real "eggs" category to both pantry-ai.mjs and receipt-scan.mjs (they each define their own copy of the category list). Also added a name-based fallback client-side so pantry items already miscategorized as dairy from before this fix show correctly without needing a rescan.

- **2026-07-30** — Fixed a real duplicate the user caught by sharing 10 screenshots of their actual pantry: "Chi-Chi's Salsa Medium/Hot" and "Chili's Medium/Hot Salsa" were 4 separate pantry entries for 2 real jars, since the AI read the brand name slightly differently across two different photos. Fixed by canonicalizing salsa by heat level (medium/hot/mild) rather than exact brand spelling, since that's what actually matters for pantry tracking. Hit the same "size-word stripping" bug as the earlier Buffalo sauce fix (the existing cleanup that strips words like "medium" from things like "medium onion" was removing it before the new check could see it) - fixed the same way, by checking the raw unstripped text. Verified with a test using the exact real-world names from the user's screenshots. Also clarified for the user: the earlier Buffalo Wing Sauce / Frank's RedHot fix is working for new scans, but that specific existing duplicate needs a one-time manual removal, since both copies were already individually "Confirmed by you" before the fix shipped, and confirmed items are intentionally protected from being auto-merged by a rescan.

- **2026-07-30** — Fixed the "what you can make" pantry suggestions showing several near-identical variants of the same dish (the user's real example: 5 different "Loaded Baked Potatoes" versions crowding out every other suggestion) instead of real variety. Root cause: no family-diversity filtering at all - since variants of the same dish share almost the same ingredients, they score almost identically and can sweep the whole top-5 list. Reused the same family-diversity approach already proven for weekly plan building. Verified with a test asserting every suggestion comes from a genuinely different recipe family, using real recipe data (not a simplified stand-in). **Note: this was written earlier in the session but never actually committed/pushed until now** - a real gap worth flagging honestly.

- **2026-07-30** — Sign in with Google fully wired up: created a Web OAuth client (used server-side for token verification, and as iOSServerClientId) and an iOS OAuth client in the same Google Cloud project already used for Maps. Google sign-in button now performs a real sign-in instead of showing a placeholder message. `GOOGLE_OAUTH_CLIENT_ID` added to Netlify so auth-verify.mjs can verify Google tokens the same way it already verifies Apple ones. Android's own OAuth client (needs package name + signing SHA-1) is still outstanding for when Android testing resumes.

- **2026-07-30** — Build 41 confirmed successful (archived, signed, exported, uploaded to TestFlight) after fixing the SPM provisioning-profile build failure above. Sign in with Apple is now fully live end to end: capability enabled on the App ID, entitlements wired up, provisioning profile updated, native plugin integrated, build succeeds with all the third-party SDK packages the plugin pulls in (Google Sign-In, Facebook SDK, Alamofire, etc. - only Google and Apple are actually enabled/used per capacitor.config.json, but the plugin's dependency graph includes all of them regardless).

- **2026-07-30** — Community recipes feature is now fully wired up end to end: new "Community" page (browsing is open to everyone, sharing needs sign-in), Sign in with Apple button using the `@capgo/capacitor-social-login` plugin, submission form, and recipe list. Enabled the "Sign In with Apple" capability on the App ID together with the user (live), added the entitlements file and Xcode project wiring, and regenerated the provisioning profile to include it. Google sign-in button is present but shows a "being set up" message for now - needs a Google Cloud OAuth client before it can go live. 62 tests pass.

- **2026-07-30** — Built the backend foundation for the new community recipe-sharing feature (user requested this, with a specific safeguard: every community recipe must read at the same Chabad kosher standard as the app's own library, regardless of what the submitter personally keeps). Added `auth-verify.mjs` (verifies real Sign in with Apple / Sign in with Google identity tokens using proper JWT signature + issuer + audience verification via `jose`, creates/looks up a user, issues a session) and `community-recipes.mjs` (submission goes through an AI review step that rejects anything not kosher-safe - fish, shellfish, pork, tofu, turkey, meat+dairy mixing - and otherwise rewrites the recipe so every dairy ingredient is explicitly labeled Cholov Yisroel before it's published; browsing is public, submitting requires a valid session). Verified with real cryptographic tests - not mocked-away crypto - including confirming a token signed for the wrong app is correctly rejected, and that the same Apple account maps to the same user on a second sign-in. Found and fixed 2 real bugs along the way: the AI response extraction never actually checked `output_text` (only nested formats), and a test-only Blobs store override needed a proper injection point since Netlify Blobs isn't reachable from this sandboxed environment. 62 tests pass.

**Not yet done:** frontend (sign-in UI, submission form, browse view), the actual Apple/Google portal configuration (Sign in with Apple capability + Google OAuth client ID), and native Capacitor plugins for the sign-in buttons themselves.

- **2026-07-30** — Decided against the real-photo web image search for pantry item icons (would have needed a new API key and ongoing cost) in favor of improving the existing generic icon system instead. Icons now factor in container type (bottle, jar, can, box, bag) as well as food category, so a bottle of ketchup and a jar of jam no longer look identical - both used to just show the same generic condiment icon.

- **2026-07-30** — Added a single end-of-batch prompt offering to delete kitchen photos once they've been scanned, since a growing pile of stored photos was contributing to the pantry page feeling too big (confirmed the receipt scan photo was never an issue - it was never saved to begin with). Deliberately one prompt for the whole batch rather than one per photo, since asking after every single photo in a 12-photo batch would be disruptive. Each pantry item's thumbnail is already a standalone saved crop, not a live reference to the source photo, so deleting the photo doesn't affect the item. Verified with a test that declining keeps everything, and accepting removes only the specified photos while leaving pantry items and their thumbnails untouched.

- **2026-07-30** — Fixed two real bugs the user caught after using the receipt scanner in practice: (1) receipt items required confirming twice - once in the receipt review screen, then again in the main pantry list - since they were merged in with AI-level confidence instead of user-confirmed; checking an item off in the receipt review IS the confirmation, so it's now marked `confidence:"user"` directly. (2) **Real page navigation**, not just scroll-to-anchor: the sidebar/hamburger menu looked like real navigation between pages but was actually just smooth-scrolling within one giant continuously-scrolling page - as the pantry section grew (photos + inventory + receipt scanner), it dragged the entire app down with it, and on the user's actual iPhone the hamburger menu didn't even open a menu (it just scrolled to Settings), since the real sidebar is desktop-only (960px+). Built a proper `showView()` system: each nav destination (Home, Weekly Plan, Pantry, Shopping, Stores, Family Account, Settings) now shows only its own sections and hides everything else, plus a real mobile nav drawer behind the hamburger button. Verified with a regression test covering view-switching and mobile-menu-closes-on-navigate. 55 tests pass.

- **2026-07-30** — Fixed real bug the user caught after re-scanning: "Frank's RedHot" and "Buffalo Wing Sauce" showed up as two separate pantry items when it's literally the same bottle - Frank's RedHot bottles are printed with both names on the label ("The Original Buffalo Wing Sauce" alongside the brand name), so the AI read them as two products. Merged these name variants into one canonical ingredient. Also found and fixed a real conflict while writing this: the existing color-word stripping (meant for things like "red pepper" -> "pepper") was silently removing "Red" from "Red Hot" before the new check could even run - fixed by checking the raw, unstripped text instead. Verified with a test confirming all four real-world name variants now merge into one item. 54 tests pass. Re-scanning existing photos will also clean up the user's already-existing duplicate.

- **2026-07-30** — Added "Re-scan existing photos" button so the user doesn't need to retake pantry photos after a scan-quality fix ships (like the printed-count bug above) - it re-runs the AI on photos already saved on the device, correctly clearing out old AI-detected results first while never touching anything the user manually confirmed.

- **2026-07-30** — Fixed the real bug behind the pantry scan complaint ("can't identify loose products, ignores half of it"), found by reading the user's actual support file rather than guessing. Every single rejected item across 12 real scanned photos had the exact same reason: "printed count not present in evidence" - and it was rejecting completely normal items (vanilla yogurt, sour cream, grated Parmesan, Margarine, Whipped Cream Cheese...). Root cause: a validation check meant to catch the AI hallucinating a printed multi-count (like "case of 12") was instead firing on ordinary single-item detections (qty=1), since a natural description like "a tub of margarine on the shelf" has no reason to literally contain the digit "1". This exact bug was duplicated in two places - server-side (`pantry-ai.mjs`) and client-side (`ingredient-engine.js`) - both fixed by only requiring the printed-count check for genuine multi-count claims (qty>1), which is what the safeguard was actually meant to catch. Verified with new regression tests on both sides: qty-1 items are now accepted, while unsupported multi-count claims are still correctly rejected. 53 tests pass.
- Also: fixed the actual download bug the user hit while trying to get this diagnostic file in the first place - the app's own support-file export used a browser download technique that doesn't work in the native app; now uses the native Share Sheet (see below).

- **2026-07-29** — Fixed real CI bug the user caught by sharing a failed QA run log: the QA workflow (`qa.yml`) never ran `npm install`/`npm ci` at all - it jumped straight to running tests. This worked by pure accident for a long time since no test needed an actually-installed npm package, until the `@netlify/blobs`-dependent household-sync tests were added. Added `npm ci` as a proper step (the iOS/Android build workflows already had this correctly). Verified locally with a genuinely clean `node_modules` (`rm -rf` + `npm ci`) and confirmed the actual GitHub Actions QA run now succeeds.

- **2026-07-29** — Fixed real bug the user caught while trying to diagnose the pantry scan issue: "Download support file" (and the developer mode debug report, and the bug report button) said "downloaded" but nothing was ever actually accessible on the phone. Root cause: they used a plain Blob + `<a download>` link, which doesn't work inside the native app's WebView (no download manager is registered there) - the separate "Use phone Share menu" button already correctly used the native Share Sheet instead and worked fine. Fixed `downloadJson` to try the Share Sheet first everywhere, falling back to the classic browser download link only when sharing truly isn't available (i.e. the website, where it already worked). Added a permanent regression test covering all three outcomes (shared / cancelled / downloaded).

- **2026-07-29** — New feature: scan a grocery receipt after shopping and have items go straight into the pantry. Added `receipt-scan.mjs` (reads a receipt photo, extracts grocery line items while ignoring tax/total/payment noise, and estimates a "best by" date per item based on category). Added a review screen (checkboxes + editable name/qty) rather than auto-adding, since receipt text is more error-prone than a photo of the actual item and mis-categorized items could quietly affect kashrut-sensitive shopping suggestions - matches the same "flag uncertain, let the user confirm" philosophy already used for pantry photo scanning. Reuses the existing `mergePantryItem` merge logic so receipt-added items behave identically to photo-scanned ones (same dedup, same shopping-list integration). Added a new `expiresOn` field carried through the merge and displayed on pantry item cards. Verified: 49 tests pass, including a full end-to-end test that checked items land in the pantry with the right expiration date and unchecked items are correctly skipped.

- **2026-07-29** — **Both originally reported bugs now fully resolved and confirmed by the user on a real device.** Household sync: the real cause was an invalid `NETLIFY_BLOBS_TOKEN` (401 from Netlify Blobs) - found via the browser's Network tab response body, not guessed. User generated a fresh token and confirmed sync now works. Store finder: found and fixed a second, deeper bug beyond the earlier Info.plist permission string - the Capacitor Geolocation plugin was never installed, so `navigator.geolocation` doesn't properly bridge to real device location inside Capacitor's WebView (no permission prompt ever appeared, hung forever on "Finding your location"). Installed `@capacitor/geolocation`, synced into iOS and Android, and updated the frontend to use the native plugin's permission/position API in the app while keeping the plain web API for the website. Verified via the GitHub Actions API: build 31 (with the new native plugin) compiled, signed, and uploaded to TestFlight successfully. Also confirmed along the way that TestFlight build-to-testing-group processing has a real, sometimes lengthy Apple-side delay unrelated to anything in this project's pipeline (build 29 eventually became available on its own after build 30 was pushed).

- **2026-07-29** — Found and fixed the real, likely root cause of both reported bugs (store finder and family setup failing) at once: **none of the three Netlify functions (pantry-ai, store-locator, household-sync) sent CORS headers.** The website never noticed because same-origin requests don't need them, but the native iOS/Android app calls these functions cross-origin (Capacitor's internal WebView origin vs. the Netlify domain) - without CORS headers, the browser silently blocks the response before the app's JavaScript ever sees it, surfacing as a generic "could not sync"/"could not load" error with no useful detail. Added `Access-Control-Allow-Origin` (and OPTIONS preflight handling) to all three functions. Added the first-ever tests for household-sync (previously completely untested) plus CORS regression tests for all three functions - 46 tests total now, up from 43. **Separately confirmed via local testing:** `household-sync.mjs`'s Netlify Blobs store throws immediately if `NETLIFY_BLOBS_SITE_ID`/`NETLIFY_BLOBS_TOKEN` aren't set as env vars and the automatic context injection fails (a documented Netlify platform issue the code already anticipated) - **the user should verify these are actually set in Netlify's site settings**, since this is a second plausible contributor to the household sync error specifically.

- **2026-07-29** — User requested a full functionality review after reporting the store finder and family/household setup didn't work. Found and fixed 3 real bugs on the iOS/Android side: (1) missing `NSLocationWhenInUseUsageDescription` in iOS Info.plist - store finder's geolocation call was silently blocked without it, same class of bug as the earlier missing camera permission; (2) Android manifest only declared `INTERNET` - added missing camera and location permissions; (3) on iPhones with a Dynamic Island/notch, header content (including the version badge used to reach Developer Mode) was rendering underneath the physical cutout - added `viewport-fit=cover` and `env(safe-area-inset-*)` padding. **Household/family sync error is still under investigation** - couldn't reproduce directly (no live network access from this environment; `netlify dev` also isn't usable here since it needs to download an Edge Functions runtime blocked by network restrictions). Leading hypothesis, not yet confirmed: `household-sync.mjs`'s Netlify Blobs store may not be configured correctly in production (the function already has a fallback path for a documented Netlify platform issue, using `NETLIFY_BLOBS_SITE_ID`/`NETLIFY_BLOBS_TOKEN` env vars if set - worth checking whether those are actually set in Netlify's site settings, or whether the automatic Blobs context is failing for another reason). Next step: get the actual error text/debug report from a live reproduction.

- **2026-07-29** — **Milestone: the app is confirmed installed and running on the user's actual iPhone via TestFlight.** External/review-required testing was the wrong path (build sat "Waiting for Review"); switched to Internal Testing, which skips Apple review entirely for the account owner. User confirmed the app is now on their phone. This closes out the full iOS pipeline end to end: code signing, automated builds, TestFlight upload, and now confirmed real-device installation. Also designed and applied a final app icon (a cooking pot with a "D / rotated-m / E" wordmark) across iOS, Android, and the web/PWA build.

- **2026-07-29** — Fixed two real bugs the user caught while checking TestFlight on their phone: (1) build showed "Missing Compliance" - added `ITSAppUsesNonExemptEncryption=false` to Info.plist (app only uses standard HTTPS, no custom encryption) so this is declared automatically on every future build; (2) re-upload was then rejected with "bundle version must be higher than the previously uploaded version" since the build number was hardcoded to 1 - fixed by auto-incrementing it from GitHub's own run number at archive time. Verified via the GitHub Actions API: full pipeline (sign, archive, export, upload to TestFlight) now succeeds end to end with no manual intervention needed.

- **2026-07-29** — Automated TestFlight upload, verified working end to end. Set up an App Store Connect API key together with the user (live, step by step). Fixed a real bug found via the actual failure log: the API key secret was pasted without its PEM header/footer lines, causing altool to reject it as invalid. Re-run after the fix confirmed the "Upload to TestFlight" step completes successfully via the GitHub Actions API - every push to main now produces a signed build that lands in TestFlight automatically.

- **2026-07-28** — iOS code signing completed and verified end to end. Walked through the Apple Developer Portal live with the user (App ID, distribution certificate via a no-terminal-needed GitHub Actions CSR generator, App Store provisioning profile). Fixed two real signing bugs found via actual failed build logs (PlistBuddy/stdin, OpenSSL 3.x PKCS12 compatibility). Confirmed via the GitHub Actions API: full signed archive + export succeeded, producing a real 1.26 MB signed .ipa.

- **2026-07-26** — Addressed a real gap the user caught: ingredient quantities already scale with the Portions control (up to 4x at 20 portions), but displayed cook time never did, even though stovetop-batch-limited dishes (breaded cutlets, pan-fried patties, crepes, searing in one pan) genuinely take longer for a bigger household - you can only fit so much in one pan at a time. Casseroles, braises, and one-pot dishes don't have this problem, so they're deliberately left untouched. Tagged the 50 genuinely batch-limited recipes, added explicit batching guidance to their steps (e.g. "fry in 2 batches"), gave cheese-wraps a full-batch oven alternative instead, and added a `displayedTime()` function that adds realistic time for extra batches only on tagged recipes. Verified: non-batch-limited dishes show the exact same time at any portion count; batch-limited dishes scale up correctly (e.g. potato latkes: 35 min at 5 portions -> 59 min at 20). Added a permanent regression test.

- **2026-07-26** — Fixed real bug the user caught: 2 of the recently-rewritten recipes declared a total time that didn't match their own instructions - "Beef Birria-Style Tacos" said 90 min but its own step said to braise 2.5-3 hours, and "BBQ Beef Brisket" said 180 min but its step said 3-3.5 hours. Corrected both declared times to honestly reflect the braise (180 min and 210 min). Added a permanent regression test that cross-checks every recipe's declared time against every time mentioned in its own steps.

- **2026-07-26** — Rewrote cooking instructions across the entire 750-recipe library. Previously 730 of 750 recipes had zero time, temperature, or doneness cue in any step (just "cook until fully cooked"), and 2 recipes had a literal duplicate step (e.g. "Season gently and serve." twice). Every recipe now has real cook times, oven temperatures, and doneness/safety cues (165°F for chicken, 160°F for ground beef/lamb, "fork-tender" for braises, etc.). Verified: 0 duplicate steps, 0 recipes without a concrete number in any step, 0 kosher/ingredient rule violations, all existing counts unchanged. Added a permanent regression test.

- **2026-07-26** — Per user request: Replace no longer forces the day to stay the same kind (meat/dairy/pareve). That day-by-day pattern (e.g. "Monday is a meat night") was only ever an internal habit used to balance variety when auto-building a whole week — not a rule the user set. Replace now only respects things the user actually controls: permanent household rules, this week's settings, and the Jewish calendar (Nine Days/Tisha B'Av still correctly restrict to dairy/pareve). Verified with a real simulation (30 taps went from meat-only to a realistic meat/dairy/pareve mix) and a permanent regression test.

- **2026-07-26** — Fixed real bug (the deeper cause of the meat/dairy/pareve "only a few options" complaint): Replace never reshuffled its scoring randomness (`planNonce`), only a full week rebuild did. So repeatedly tapping Replace on one day replayed the exact same math every time and ping-ponged between just 2 dishes for that day's kind, no matter how large the library is — confirmed by simulation: 20 taps produced only 2 distinct dishes before the fix, 15 after. Replace now reshuffles on every tap. Added a permanent regression test asserting at least 8 distinct dishes across 20 taps on the same day.

- **2026-07-26** — Expanded the recipe library from 50 base dishes (500 recipes = 50 dishes × 10 side variants) to 100 base dishes (750 recipes = 100 dishes × 5 side variants), per user request for more real variety. Added 50 new families spread evenly across cuisines and kept the same meat/dairy/pareve ratio (375/225/150). All new recipes generated and validated against every household kosher rule (no fish/tofu/turkey/broccoli/cauliflower/cilantro, no dairy in any meat recipe, "Cholov Yisroel" present on every dairy recipe, not spicy, hands ≤20 min, total time ≤35 min unless oven/bbq). Also extended protein tracking to recognize lamb (previously only beef/chicken) since new lamb dishes were added. Verified: 0 validation errors across all 250 new recipes, 0 id/title/family collisions with the existing 500, all 38 tests pass.

- **2026-07-26** — Fixed real bug: Replace on a single day could swap the current dish for a same-family variant (e.g. "Lemon Herb Chicken — with Rice" → "Lemon Herb Chicken — with Potatoes") — which looks like only the side/condiment changed instead of getting a genuinely different meal. Root cause: the recipe library is built from a small number of base dishes each repeated with several side-dish variants, and `chooseUniqueRecipe` only excluded the exact recipe id being replaced, not its whole family. Fixed by excluding the current dish's family first, falling back to same-family only if nothing else fits that day's restrictions. Verified with a permanent regression test across 40 random plans × every day of the week — confirmed Replace never repeats the same family.

- **2026-07-24** — Fixed real bug: recipe variety only tracked dish family (e.g. burger vs. taco vs. meatloaf), not protein, so three different-family ground-beef dishes could stack in one week undetected (the exact bug the user hit). Added protein-level tracking using existing recipe tag data. Verified across 25 random plan builds, not just one.

- **2026-07-24** — Stale weekly plans now rebuild themselves automatically instead of just showing a warning, per user request. Locked meals survive (moved to the new matching date). Verified in a real browser and via CI on GitHub.

- **2026-07-24** — Found and fixed the real root cause of every "app not updating" report today: the cache/service-worker update check only fired when `APP_VERSION` changed, but that stayed at "60" through dozens of real deploys this session, so it silently did nothing all day. Added `BUILD_ID`, auto-injected from the git commit on every deploy (web and native), so update detection now fires every time regardless. Verified for real against actual file copies, and confirmed passing on GitHub's own CI servers across all three workflows (QA, Android, iOS).

- **2026-07-24** — Strengthened the calendar auto-refresh: user reported it still required a manual refresh. Added focus/pageshow listeners (iOS home-screen PWA mode is unreliable with visibilitychange alone), shortened the backstop interval, and extended it to refresh the plan sections too. Verified with a real Playwright clock-fast-forward test plus a permanent lightweight regression test.
- **2026-07-24** — Fixed real bug: stale Tisha B'Av calendar/plan info after a week passed (surfaced right after Shabbos). Two root causes: calendar banner never re-checked itself over time, and the plan had no tracking of which week it was built for. Both fixed; verified with a real Playwright test simulating a week rollover plus an actual page reload.

- **2026-07-23** — Fixed `pantry-ai.mjs` syntax corruption (chat text embedded in source). Commit `95de28b`.
- **2026-07-23** — Linked Netlify to GitHub for continuous deployment (was previously disconnected manual deploys).
- **2026-07-23** — Fixed default OpenAI model (`gpt-5-mini` → `gpt-4.1-mini-2025-04-14`) causing pantry scans to hang and time out after 50s. Commit `4fd89ad`. Updated matching test and README.
- **2026-07-24** — Native iOS app set up via Capacitor. Builds successfully on GitHub's macOS runners (no Mac needed). Fixed a real CI issue: Capacitor doesn't generate a shared Xcode scheme by default, which `xcodebuild` needs — hand-authored one, which will also be needed for the eventual signed archive build.
- **2026-07-24** — Added thumbs up/down/neutral dish ratings. Lives on the recipe (persists across weeks), influences future scoring, syncs across the household. Verified with a real browser click test, not just unit logic.
- **2026-07-24** — Household sync confirmed working live end-to-end. Root cause of the 502 was `MissingBlobsEnvironmentError`, a documented Netlify platform issue with automatic Blobs context injection. Fixed with explicit `NETLIFY_BLOBS_SITE_ID`/`NETLIFY_BLOBS_TOKEN` env vars.
- **2026-07-24** — Fixed critical household sync infinite loop bug (logging a sync result was re-triggering another sync, forever). This is almost certainly why the user's first attempt failed. Also added household status to debug reports and a native share-sheet button for the household code.
- **2026-07-24** — Added family account / household sync: shared plan, pantry, shopping list, and preferences across devices via a household code, backed by Netlify Blobs. Photos deliberately stay device-local. Real two-device test added. Not yet live-verified.
- **2026-07-24** — Native Android app set up via Capacitor. Fixed relative API paths that would've broken in a packaged app. GitHub Actions now builds the debug APK automatically (no local Android SDK needed) — first build confirmed successful after fixing a Node version mismatch (Capacitor CLI needs Node ≥22).
- **2026-07-24** — Finished the "Dinner Made Easy" rename across manifest (home screen name), title, mobile top bar, package.json, README. This is what fixes the "still says Dinner Planner on mobile" issue.
- **2026-07-24** — Hero photo updated to family (parents + kids). Caught and fixed a real cropping bug in the process: the photo box was stretching to the text column's height, cutting off the sides of the family photo. Fixed with a proper aspect-ratio. Verified via screenshots before/after.
- **2026-07-24** — Rebuilt desktop layout with a sidebar nav, two-column hero, and feature row to match the reference mockup. Verified via actual Playwright screenshots before shipping. All 27 tests still pass.
- **2026-07-24** — App name decided: "Dinner Made Easy" (was already the mockup tagline, now the official name). Not yet applied everywhere in the codebase — future task.
- **2026-07-24** — No-duplicate-meals confirmed working live by user, including after multiple "Replace unlocked" cycles.
- **2026-07-24** — Store search confirmed working live by user.
- **2026-07-24** — Jewish calendar banner confirmed visible and correct on live site ("Tisha B'Av week").
- **2026-07-24** — Found and fixed real cause of "shopping list gone" bug: `save()` had no error handling, so a storage failure (likely quota exceeded from pantry photos) silently dropped all future saves. Fixed with error catching, a visible Developer-mode indicator, and a regression test. Commit `9ac94dd`. User confirmed fix working live.
- **2026-07-24** — Spot-checked pantry scan accuracy against real debug report data. Confirmed canned/sauce distinction, correct quantity sourcing, model fix holding steady. Flagged one minor confidence-label mismatch to watch.
- **2026-07-23** — Full repository audit against original requirements. This file created.

---

## Next steps (priority order)

1. Wait for Apple's App Store review decision, handle whatever it comes back with
2. Recruit testers via the TestFlight public link / marketing flyer, gather real feedback
3. Confirm with the user whether hummus/hot-sauce/yogurt icons and pantry suggestions look right after the overnight fixes
4. Android release signing (Play Store) — not started
5. Cook-to-pantry deduction feature — not built
6. Mobile UI audit — pending specifics from the user
