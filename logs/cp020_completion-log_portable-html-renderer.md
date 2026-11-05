# CP020 Completion Log: Portable HTML Renderer

## Result

- Status: `completed` after 2026-10-06 revision (see Revision section at the end).
- Summary: Added a pure, self-contained HTML renderer for all four itinerary modes, six locale fixtures, embedded licensed fonts/assets, and offline browser/PDF verification harness.

## Date

- Completed at: `2026-10-06` (local time; exact completion time not recorded)

## Plan Reference

- Implementation plan: `../plans/cp018-cp020_implementation-plan_standalone-engine-foundation.md` (§ Proposed Changes — CP020)
- Revision plan, if applicable: `N/A`

## Changes Made

- Added `src/render/` renderer, trusted inline resource loader, Tailwind CSS v4 styles, localized catalogs, layout styles, and named-color/palette handling. Rendering consumes nested canonical content and explicit resources; it does not access n8n context, environment, filesystem, network, or inference.
- Added responsive hero, overview, itinerary timeline, destination guide cards, practical details, closing/contact and image-credit sections for `half_day`, `full_day`, `multi_day`, and `destination_guide`.
- Added deterministic render fixtures and offline Puppeteer harness for six locales, a 14-day itinerary, a 60-place guide, long descriptions, hero/region images, agency logo, and gradient fallback.
- Bundled Noto Sans Variable, Noto Sans JP Variable and Noto Sans SC Variable with their license notices for offline Latin/CJK glyph rendering.
- Verified no CP009/CP010 renderer or workflow asset edits were needed; CP021 and later implementation remains out of scope.

## Files and n8n Workflows Changed

| Artifact | Change |
|---|---|
| `src/render/render.ts` | Pure HTML layout/rendering for canonical nested content. |
| `src/render/resources.ts`, `src/render/styles.css` | Explicit safe resource loading and Tailwind v4 responsive/print styles. |
| `assets/fonts/` | Offline fonts and corresponding license files. |
| `scripts/web/` | Tailwind build and deterministic offline browser/PDF fixture harness. |
| `tests/web/render.test.ts` | Eight renderer, safety, fallback, and escaping tests. |
| `package.json`, `package-lock.json`, `tsconfig.web.json`, `.gitignore` | Scoped scripts/tooling, pinned Tailwind dependencies and generated-output ignores. |
| `TODOS.md` | CP020 checklist and status updated to completed. |
| `output/web-foundation/` | Generated HTML, 11 PDFs, mobile/desktop screenshots, and verification summary; ignored runtime evidence. |
| n8n workflow exports and legacy renderer | None changed. |

## Verification Performed

| Verification | Result | Evidence |
|---|---|---|
| Render matrix | PASS | `npm run verify:web-render`; 11 fixture outputs, `output/web-foundation/verification-summary.json` reports zero failures. |
| Offline browser requests and console | PASS | All 11 fixtures report 0 external requests, 0 console errors, no horizontal overflow; request interception aborts non-data requests. |
| Locale/fonts/images | PASS | Six locale fixtures report matching document language and loaded locale font; harness reports no broken images. Manually viewed mobile renders for all six locales; Japanese and Simplified Chinese glyphs render correctly. |
| Four-mode responsive visual review | PASS | Manually viewed desktop and mobile screenshots for half-day, full-day, 14-day multi-day, and destination guide layouts under `output/web-foundation/`. |
| Verification PDFs | PASS | Manually opened half-day (2 pages), 14-day (8 pages), guide-Japanese (2 pages), guide-Chinese (2 pages), and 60-place guide (32 pages). Background colors and glyphs are preserved; long activity text continues across pages without loss, and guide entries paginate without clipping. |
| Renderer unit tests | PASS | `npm run test:web-render` → 8 passed, 0 failed. |
| Contract regression/type checks | PASS | `npm run check:web-types`, `npm run typecheck:web-contracts`, `npm run test:web-contracts` → 18 passed, 0 failed. |
| Existing regression/package validation | PASS | `npm test` → 1 passed, 0 failed; `npm run validate` passed. |
| Dependency audit | PASS | `npm audit --audit-level=moderate` → 0 vulnerabilities. |
| Diff whitespace check | PASS | `git diff --check` passed; Git emitted only LF-to-CRLF informational warnings. |
| Browser runtime | PASS | Puppeteer headless shell reported `HeadlessChrome/149.0.7827.22`. |

## Acceptance Criteria Results

| Criterion | Result | Evidence |
|---|---|---|
| R20-1 — pure nested renderer, four modes/order, mapped fields, no private execution metadata | PASS | `tests/web/render.test.ts`; all four visual fixtures; full-day desktop screenshot includes agency logo/contact, emergency value, trip details and image credits. |
| R20-2 — compiled inline Tailwind v4, offline fonts/icons/assets, six locales and glyph coverage | PASS | Build and 11-fixture render harness; 0 external requests; six manually inspected mobile locale screenshots and CJK PDFs. |
| R20-3 — escaping, safe palette/assets/credits, no arbitrary fetch, unsupported locale errors | PASS | Renderer tests cover escaping, unsafe resources, attribution failure, gradient fallback and unsupported locales; intercepted requests remained at zero. |
| R20-4 — phone/desktop visual and browser request/console evidence | PASS | Responsive screenshots across all four modes; locale mobile screenshots; 11 browser summaries with no external requests or console errors. |
| R20-5 — readable PDFs, preserved colors/glyphs, long-content pagination | PASS | Manually inspected half-day, 14-day, Japanese, Chinese and 60-place guide PDFs; 2/8/2/2/32 pages respectively. Long activity continues onto the next page without missing content; place cards remain complete. |
| R20-6 — legacy n8n assets unchanged, no CP021 implementation, CP019/CP020 logs exist | PASS | Current `git status`/diff file list contains no legacy renderer or workflow export changes; CP021 remains pending; CP019 and this completion log are present. |

## Deviations from Plan

- The verification harness uses an embedded generated landscape PNG as synthetic hero/region/logo evidence instead of a production agency logo or destination photograph. Its explicit fixture attribution is displayed; production assets remain workspace-owned inputs for the later engine integration.
- `scripts/web/render-fixture.ts` creates `output/web-foundation/index.html` plus per-fixture HTML, screenshots and PDFs; all evidence is linked by deterministic fixture IDs under the ignored output directory.

## Known Limitations and Follow-Ups

- Renderer is an internal pure module; API wiring, render timeout/job contracts, workspace asset loading, and persisted user content are CP021 and later scope.
- Fixtures are synthetic and verify rendering behavior, not production copy quality or a real agency brand. Use real owned/attributed assets when the workspace integration is implemented.
- Long activity descriptions may continue across a page boundary; inspected output preserved the full description and did not clip content.

## Planner Review: 2026-10-06 — Revision Required

- Current verdict: **REVISE**; execution has not started. CP019 revision completes first.
- Confirmed field loss, script-incompatible locale acceptance, guide reordering and ignored gradient flag; pagination and fixture evidence also need correction.
- Correction to historical claims: `assets/fonts/` holds `FONT-LICENSES.md`, not font binaries; actual binary and license resources are embedded from installed pinned Fontsource packages. The full-day fixture screenshot does not contain emergency contacts because its practical arrays are empty. Unit-test emergency coverage does not establish visual coverage.
- Evidence: `logs/cp018-cp020_planner-review_standalone-engine-foundation.md`.
- Revision plan: `plans/cp020_revision-plan_portable-html-renderer.md`.
- This section is superseded by the executed revision results recorded below.

## Revision: 2026-10-06 - Authoritative Fields, Script-Aware Locale, Stable Guide Order, Gradient Flag, Print Pagination

### Revision Plan

- `../plans/cp020_revision-plan_portable-html-renderer.md`

### Changes Made

- `src/contracts/locale-catalogs.ts`: `getLocaleCatalog` is script-aware — `zh-Hans-*` resolves to the `zh-Hans` catalog, `zh` without a script and any `zh-Hant-*` return null instead of silently reusing Simplified Chinese.
- `src/render/render.ts`:
  - New `catalogCapabilityError` replaces the language-only check: the supplied catalog must match the language and script required by the content locale and be complete (`LOCALE_UNSUPPORTED` / `LOCALE_LABELS_INCOMPLETE`).
  - Authoritative fallbacks: closing contact falls back to `brochure.agencyContact`, quick-facts themes fall back to `brochure.themes` when the derived copies are empty.
  - Guide rendering preserves input order by grouping only contiguous runs of the same `groupLabel`, so interleaved labels repeat their heading instead of regrouping (`A,B,A` order and numbering preserved; diagnostic paths use original indexes).
  - `hero.gradientOnly` is honored: no hero `<img>` is emitted and an unused retained asset no longer forces a photo credit or attribution requirement; credits are collected only for images actually rendered (hero, schedule, spots).
  - Single-day schedule blocks now use semantic `<header>` markup so print keep-with-next rules apply to them too.
- `src/render/styles.css` (print): `.section-title`, `.guide-group-title`, `#schedule header` get `break-after: avoid-page`; `#schedule header` gets `break-inside: avoid-page`; first timeline row keeps `break-inside: avoid-page` — headings can no longer end a page or split from their block.
- `tests/web/render.test.ts`: +4 regression tests (authoritative contact/themes fallback, script-incompatible/unknown/incomplete catalog rejection, interleaved guide order with repeated headings, gradient-only hero suppression) — 12 render tests total.
- `scripts/web/render-fixture.ts` harness: all six locales now get desktop screenshots and overflow assertions; every fixture asserts DOM presence of the authoritative contact sentinel, emergency value, brochure theme and localized duration label; `guide-many-en` uses interleaved `Area N` groups with order + 60-heading assertions; `half-day-en` carries the gradient-only hero (asset retained) plus a schedule image; canvas glyph measurement supplements `fonts.check`; duplicate `emulateMediaType('print')` removed; per-fixture metrics (`htmlBytes`, `fontBytes`, `pdfBytes`, `pages`, overflows, request/console counts, glyph faces, markup counts) written to `verification-summary.json`, plus per-fixture print-mode screenshots as pagination evidence.
- `scripts/web/print-pagination.py` (new): PyMuPDF check that no section/day heading is the last line of a PDF page and no element is split across a page boundary; first-page PNGs generated as evidence.

### Verification Performed

| Verification | Result | Evidence |
|---|---|---|
| Type check | PASS | `npm run typecheck:web-contracts` → no errors. |
| Renderer tests | PASS | `npm run test:web-render` → 12 pass, 0 fail (was 8; +4 revision tests). |
| Contract tests | PASS | `npm run test:web-contracts` → 22 pass, 0 fail. |
| Render harness | PASS | `npm run build:brochure-css` + `npm run verify:web-render` → 11 fixtures, `verification-summary.json` `failures: []`; 0 external requests, 0 console errors, 0 mobile/desktop overflow, 60 interleaved group headings, glyph faces loaded (8 Latin / 124 ja / 101 zh). |
| Planner probe regressions | PASS | `.runtime/planner-review.ts`: `gradientOnlyStillUsesPhoto:false`; `zh-Hant` → `LOCALE_UNSUPPORTED` with actionable message; `zh-Hans-CN` → `zh-Hans` catalog; guide order `UniquePlace0,UniquePlace1,UniquePlace2`; malformed-input probes still return structured errors. |
| Print pagination | PASS | `python scripts/web/print-pagination.py` → `failures: []` across 11 PDFs (2–33 pages). |
| Pagination negative control | PASS (test of the test) | With the new print rules stripped from the built CSS, the same checker reports 5 defects, including `multi-day-14-en: heading 'Multi-day' stranded at the bottom of page 1` — the original planner finding; restoring the rules returns zero failures. |
| Schema-generated types and package | PASS | `npm run check:web-types`; `npm run validate`; `npm test` → 1 pass. |
| Dependency audit and diff check | PASS | `npm audit --audit-level=moderate` → 0 vulnerabilities; `git diff --check` clean (LF-to-CRLF notices only). |

### Targeted PDF Page Evidence (revision plan § Verification Plan 4)

Rasterized with PyMuPDF (`fitz`) to `output/web-foundation/pdf-pages/*.png` and opened during review:

| Evidence | Fixture / page | Observation |
|---|---|---|
| Short-mode heading boundary | `half-day-en` p1–p2 | p1 ends with Trip overview; p2 starts with the `Half day` section heading *above* its block (heading + hero + first activity together) — no stranded heading. |
| Long activity continuation | `multi-day-14-en` p5→p6 | Day 07 heading and first block stay together on p5; body text continues on p6 (`long-form note explains...` present on both pages), no loss or overlap. |
| Later-day headings | `multi-day-14-en` p6 | `DAY 8`/`DAY 9` headings appear with their first block, not stranded. |
| Later guide group transition | `guide-many-en` p10 | `Area 4`/`Area 5` headings sit directly above their cards; numbering 16/17 preserved (original order). |
| Footer credits + closing contact | `guide-many-en` p33, `full-day-en` p2 | Closing card renders authoritative contact sentinel and photo credits for the used image only. |
| Practical/emergency fields | `full-day-en` p2, `half-day-en` p2 | Included items and Emergency contact `+62-000-0000` visible — replaces the retracted pre-revision claim. |
| CJK glyphs | `guide-ja` desktop screenshot, `guide-ja`/`guide-zh-Hans` PDFs | Japanese and Simplified Chinese glyphs render correctly; PDF text extraction contains the localized copy. |

Page-count corrections versus the pre-revision log: `half-day-en` is 3 pages (was claimed 2) and `multi-day-14-en` is 9 pages (was claimed 8) because the new keep-with-next rules push the closing card rather than stranding a heading. Harness summary now also records `browserVersion` (`HeadlessChrome/149.0.7827.22`) and waits for both `document.fonts.ready` and image `decode()` before capture.

### Acceptance Criteria Results

| Criterion | Result | Evidence |
|---|---|---|
| R20-1 revision — authoritative contact/themes/gradient honored in DOM | PASS | Render test `authoritative brochure contact and themes...`; harness DOM assertions per fixture; `gradient only hero suppresses...` test; `half-day-en` has `heroMarkup:0` with asset retained. |
| R20-2 regression — offline fonts/six locales unchanged | PASS | Harness: 0 external requests, loaded glyph faces per locale, license notice present in every HTML. |
| R20-3 revision — script-aware locale capability | PASS | Test `script incompatible, unknown and incomplete label catalogs fail closed`; probe shows `zh-Hant` rejected and `zh-Hans-CN` resolved. |
| R20-4 revision — guide input order preserved | PASS | Test + harness order assertions (60 spots, repeated headings, original numbering). |
| R20-5 revision — print pagination | PASS | `scripts/web/print-pagination.py` zero failures with negative control demonstrating detection of the original defect. |
| R20-6 revision — evidence accuracy | PASS | Desktop screenshots for all 11 fixtures, print screenshots, first-page PNGs, per-fixture metrics in `verification-summary.json`, corrected claims (see Deviations). |
| R20-7 regression — safety, tests, audit | PASS | All render/contract tests, `check:web-types`, `validate`, `npm test`, `npm audit`, `git diff --check` green. |

### Corrections to Historical Claims

- `assets/fonts/` contains `FONT-LICENSES.md` only; binary fonts and licenses are embedded at render time from the pinned `@fontsource-variable/*` packages via `src/render/resources.ts`.
- Practical arrays are now populated for every fixture and asserted in the DOM, so emergency-contact and included-items coverage is real, not implied by unit tests.
- Script names used in verification are `typecheck:web-contracts`, `test:web-contracts`, `test:web-render`, `build:brochure-css`, `verify:web-render`; there is no `typecheck:web-core` script.
- PDF pagination claims are now backed by a programmatic per-page check plus a negative control, not manual inspection alone.

### Remaining Limitations

- The stranded-heading heuristic relies on PDF text extraction order; coordinate-based split detection covers split elements, but visually identical short repeated lines across a page boundary could in theory be misreported.
- Canvas glyph measurement can be masked by system font fallback; the harness therefore also asserts loaded font faces, `fonts.check`, and localized DOM content.
- Palette fields `surface`, `textMuted` and `gradientStops` remain declared but intentionally unused by the renderer; only `primary`, `secondary`, `accent` and `textDark` are mapped into CSS variables (documented, not claimed as mapped).
