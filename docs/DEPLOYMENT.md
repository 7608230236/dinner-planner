# Deployment checklist

## GitHub

- Repository: `7608230236/dinner-planner`
- Recommended visibility: Private
- Default branch: `main`
- Commit all project files, including `.github`, tests, and Netlify Functions.
- Do not commit `.env` or API keys.

## Netlify

- Import the GitHub repository.
- Build command: leave blank.
- Publish directory: `.`
- Functions directory: supplied by `netlify.toml`.
- Add `OPENAI_API_KEY`.
- Optionally add `OPENAI_MODEL` and `GOOGLE_MAPS_API_KEY`.

## Release check

1. Confirm the app visibly says v60.
2. Reload twice and confirm it still says v60.
3. Build this week and confirm five unique dinners.
4. Replace all unlocked dinners and confirm five unique dinners remain.
5. Scan a clear pantry photo.
6. Review medium-confidence items before checking shopping deductions.
7. Add 12 canned tomatoes manually and confirm a two-can canned-tomato requirement is not added to shopping.
8. Tap v60 seven times and confirm Developer Mode opens.
9. Run validation and confirm all checks pass.
10. Download a bug report and verify it can be attached to ChatGPT.
