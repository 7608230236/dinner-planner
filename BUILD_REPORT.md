# Dinner Planner v60 build report

**Build date:** 2026-07-23  
**Release:** 60.0.0  
**Status:** Release package completed

## Included

- Phone-first Sunday-through-Thursday planner.
- 500 validated meat/chicken, dairy, and pareve recipes.
- Household preference defaults and kosher separation safeguards.
- Jewish-calendar dinner restrictions.
- Pantry photo workflow with per-photo location, validation, review state, and stale-observation cleanup.
- Shopping deduction with ingredient-form separation and compatible unit conversion.
- Persistent checkable shopping list.
- Current-week and next-week planning, meal lock/replace, and whole-week locking.
- Nearby kosher-store selection with Baltimore fallbacks.
- Hidden developer mode, validation, AI/pantry/shopping inspectors, logs, cache controls, and downloadable support reports.
- PWA manifest, service worker, Netlify Functions, deployment documentation, GitHub Actions CI, and issue template.

## Regression fixed

A pantry quantity of **12 canned tomatoes** now covers a recipe requirement of **2 cans**. Fresh tomatoes, canned tomatoes, frozen tomatoes, tomato sauce, and tomato paste remain distinct.

## QA result

```text
Tests: 26
Passed: 26
Failed: 0
```

The release was also checked for duplicate HTML IDs, CSS parsing errors, missing local assets, static HTTP failures, stale version identifiers, and embedded production secrets.

## Deployment status

This package is GitHub-ready and Netlify-ready. It has **not** been pushed to GitHub or deployed because the ChatGPT GitHub connector did not obtain repository access. No claim of live deployment is made.
