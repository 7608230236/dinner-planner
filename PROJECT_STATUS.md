# Project Status

Single source of truth for what works, what's broken, and what changed.
Update this file every time a fix is made or verified — don't rely on chat history.

Last updated: 2026-07-29 by Claude

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

1. User to live-test dish ratings on the deployed site
2. Do 2–3 more real pantry scans to confirm `gpt-4.1-mini-2025-04-14` is reliably stable (not just lucky once, like `gpt-5-mini` was)
2. Audit mobile planner UI once specifics are gathered
