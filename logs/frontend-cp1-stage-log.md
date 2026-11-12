# Frontend redesign CP1 — stage log

Status: implemented, pending owner review. CP037 changes were already present and remain pending their own review.

## Scope

- Home and editor are separate at all viewport sizes; returning home keeps the current draft in memory.
- Create-flow mode selection is a short single-column list. It remains behind the existing CP037 “Buat itinerary baru” entry to preserve its create flow.
- Home shows five recent drafts, loads five more per action, follows the API cursor, preserves the visible count on refresh, and handles load failure with retry.
- Drafts are displayed as simple rows with mode and relative update time. Empty and loading states are provided.

## Checks actually run

- `npm run typecheck:web-app`: passed; repeated after revision, passed.
- `npm run test:web-editor`: 33 passed, 0 failed.
- `npm run build:web-app`: passed; repeated after revision, passed. Vite reports the existing >500 kB chunk warning.
- `npm run verify:web-create`: passed; manual, text, PDF, Back/Forward, preserved text, slow request, and mobile overflow checks reported successful; zero console errors and external requests.
- `npm run verify:web-editor`: passed; all four modes, mobile and desktop viewport checks, zero console errors and external requests.
- Ad hoc Puppeteer browser check with 56 temporary drafts: initial 5, then 10, finally 56 with no load-more button; returning home retained 56. Document widths at 320, 360, 390, 768 and 1280 were equal to viewport widths.
- Ad hoc Puppeteer retry check with 51 temporary drafts: a failed cursor request retained 50 existing rows; retry loaded the 51st.
- Inspected `output/web-create/cp037-step1-390.png` after the build and create verification.

## Limitations

- No real-phone keyboard or screen-reader test was run. No user usability study was run.
- Browser regression checks preceded the final retry-only revision; the retry branch was separately exercised after rebuilding.
- No release gate was run; this is an incremental editor stage, not a release.
- No local commit was created: CP037 has extensive pre-existing uncommitted changes in shared files, and a commit was not explicitly requested.
