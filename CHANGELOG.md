# Changelog

## v60.0.0 — Complete diagnostics and pantry reliability

### Added
- Hidden developer mode.
- Bug-report, debug-report, and scan-support exports.
- AI inspector, pantry diagnostics, shopping diagnostics, validation engine, error timeline, cache manager, service-worker manager, and storage inspector.
- Automated syntax, static-contract, pantry/shopping, pantry-function, and store-locator tests.
- GitHub Actions continuous integration and bug-report issue template.
- A validated 500-recipe library with rough per-portion cost ranges.
- Persistent checkable shopping lists for current, next, and combined weeks.
- Whole-week Lock/Unlock controls for current and next week.
- Current-week and next-week planning with five unique dinners per plan.

### Fixed
- Visible version and cached version mismatch.
- Missing developer panel markup.
- Broken pantry suggestion recipe button.
- Incorrect AI bounding-box crop interpretation.
- Stale pantry observations after deleting, relocating, or rescanning a photo.
- Shopping list not recalculating after pantry edits.
- Fresh/canned/frozen/sauce/paste tomato matching.
- Nearby store ordering.
- Hero asset path from the CSS directory.
- Service-worker app shell missing JavaScript and CSS modules.
- Pantry quantities failing to suppress covered shopping items, including the 12-canned-tomatoes regression.
- iPhone support instructions that incorrectly assumed ChatGPT would appear in the Share sheet.

### Changed
- “Use what I have first” is automatic whenever pantry inventory exists.
- Soft preferences for chickpeas, carrots, spinach, and eggplant affect recipe scoring rather than acting as absolute bans.
- Unreviewed medium-confidence AI detections do not suppress shopping purchases.
