# CP020 Revision Plan: Portable HTML Renderer

## Reason for Revision

Planner verdict chapter CP018–CP020: **REVISE**. Worker tests (8/8) pass but omit confirmed field, order and locale-capability failures. Acceptance R20-1/R20-2/R20-4/R20-5 requires further work/evidence.

Confirmed source/probe findings on 2026-10-06:

| ID | Finding and evidence | Impact |
|---|---|---|
| F20-1 | Publish-valid brochure contact/themes can be absent from output (`render.ts:219–237`); renderer consumes divergent copies. Probe prints `contact:false`, `themes:false`. | Required agency contact/manual themes silently lost. Coordinate with CP019 derivation revision. |
| F20-2 | Renderer accepts `zh-Hant` with explicit `zh-Hans` catalog because it compares only `.language` (`render.ts:205`). `getLocaleCatalog('zh-Hans-CN')` returns null even though font loader recognizes that family. | Unsupported Traditional Chinese silently gets Simplified labels; supported-region policy inconsistent. |
| F20-3 | Input guide spots with groups `A,B,A` render in order `0,2,1` (`render.ts:173–185`). Diagnostic paths then use grouped display index rather than original spot index. Grouping copies the whole accumulated array per insertion. | User order changes, error points at wrong item, grouping is quadratic within a group despite Map use. |
| F20-4 | Valid content with `hero.gradientOnly:true` and a resolved asset still renders `hero-image` (`render.ts:215–217`). | Explicit fallback flag ignored; unused/missing asset credits are also collected by reference rather than actual use. |
| F20-5 | Current matrix has no practical/emergency values, schedule image, or several optional mapped fields. CJK/Latin/French samples inherit English `90 minutes`. Six locales get mobile screenshots but only English gets desktop screenshots. `document.fonts.check` alone cannot prove glyph coverage. | Existing test/visual claims exceed exercised scenarios. |
| F20-6 | Opened PDFs show half-day day heading stranded on page 1 while first activity starts page 2; 14-day PDF has similar separated headers. Section-title `break-inside` does not keep heading with following content. | Incoherent heading pagination even though content is not clipped. Long-card/page-break images need targeted evidence beyond first PDF pages. |
| F20-7 | `assets/fonts/` contains only `FONT-LICENSES.md`; actual binaries/LICENSE are loaded from pinned Fontsource packages in `node_modules`. CP020 log describes font binaries/license files there, and claims full-day screenshot includes emergency value though that fixture has none. | Completion evidence must be corrected to describe actual packaging/verification. |

## Clarifications and Decisions

- Structured Ask Question proposed CP019/CP020 revisions covering functional and visual/evidence gaps. User answered **“buat revision plannya”**. This is planning only; no functional revision has been applied.
- CP019 revision must complete first. Keep scope within portable renderer/fixture/resources; CP021 endpoints, production PDF jobs, live AI, Laravel and n8n assets are not included.
- Preserve canonical spot array order. Render contiguous group runs (repeat a group heading if its label reappears) rather than silently regrouping separated items. Original source index must remain the diagnostic identity.
- Supported locale catalog/font must agree on language **and script**; region fallback is allowed only within the documented supported family. `zh-Hans-*` can use Simplified catalog/font, `zh-Hant` must fail until appropriate resources exist. Schema stays extensible.
- `hero.gradientOnly` determines whether the hero photo is used. Only images actually rendered contribute inferred credits; explicit valid closing credits remain content. Do not add arbitrary URL fetching.
- Existing Fontsource packaging is acceptable if reproducibly installed and correctly documented; do not duplicate binaries just to match an inaccurate log.

## Existing Behavior

- Renderer is pure and inline/offline; existing safety tests, four-mode harness and CJK PDFs are useful evidence.
- Current fixture harness reports 11 outputs with zero failures, external requests, console errors and mobile overflow. That does not test the missing/mismatched field cases above.
- 14-day PDF is 8 pages; 60-place guide is 32 pages. First available rendered pages show colors/CJK glyphs and intact sample place cards, but do not establish every later-page break.
- `RenderPalette` exposes surface/textMuted/gradientStops, but output uses only primary/secondary/accent/textDark. Review/document which palette inputs are intentionally supported; do not claim all values are mapped without proof.

## Required Behavior

- All promised canonical manual values survive normalized render and stale derived-copy scenarios; render disposition agrees with registry.
- Locale capability rejects incompatible scripts/incomplete labels and consistently supports documented region fallbacks, without English/key-name fallback.
- Guide order is unchanged, diagnostic paths use original indexes, and grouping does not repeatedly copy group arrays.
- Hero fallback is respected and used-image attribution is correct.
- Page headings stay with the first following block where it fits; oversized text may flow across pages without loss, overlap or clipping.
- Verification matrix and logs truthfully identify exercised fields, viewport/locale coverage, browser version, size limits and font packaging.

## Proposed Changes

1. After CP019 revision log/status is complete, mark CP020 revision `in_progress`; re-read registry and normalize/render seam.
2. Correct field consumption in `src/render/render.ts` where needed and add sentinel-based mapping tests for promised manual fields. Avoid an exhaustive test for every internal metadata leaf; those must have explicit non-render reasons.
3. Centralize supported locale-family resolution at the contract/catalog/resource seam. Validate script-aware catalog match and required label coverage before rendering; produce actionable `LOCALE_UNSUPPORTED`/resource diagnostics rather than silently returning keys. Keep supported `fr-*`, `en-*`, `id-*`, `ja-*`, `la` and `zh-Hans-*` behavior explicit and tested.
4. Render contiguous guide group runs in a single pass with preserved original indexes; avoid accumulator spreading. Verify `A,B,A`, ungrouped items, and large single-group input.
5. Honor `gradientOnly`; distinguish referenced from rendered photo credits. Test missing assets, gradient-only with retained asset, used images and incomplete attribution. Keep raster assets/pre-resolved trusted CSS/fonts boundary.
6. Add minimum print heading/first-block keep-with-next rules without making whole multi-day/guide sections unbreakable. Keep long activity/spot descriptions able to paginate naturally.
7. Extend `scripts/web/render-fixture.ts` and fixtures: all six locale desktop/mobile checks; localized manual duration labels; mapped practical/emergency fields, schedule image, tips/meals/transport/accommodation and separate authoritative/derived sentinels; interleaved guide groups and gradient-only case. Assert DOM counts/order/values and output completeness, not just nonzero PDF.
8. Wait explicitly for fonts and image readiness before PDF. Record fixture-level metrics and browser version in summary, including desktop overflow and measured font/HTML sizes. Preserve offline request interception and deterministic filenames. Remove duplicate print emulation call.
9. Capture/open targeted rendered PDF pages around the long activity continuation, later guide group transitions, footer credits and short-mode heading boundary. Use a PDF viewer/rasterization tool available in the environment; document the exact page evidence. Source CSS and PDF text extraction alone do not constitute visual confirmation.
10. Correct CP020 log claims without erasing original evidence: fonts come from pinned Fontsource packages, not binaries under `assets/fonts/`; explicitly retract the emergency screenshot claim and replace it with a verified fixture. Record script naming deviations (`typecheck:web-contracts` actually includes renderer/harness; separate contract/render tests replace proposed `test:web-core`).
11. Review → test → revise. Append dated executed revision evidence and restore completed only after all findings pass. Submit chapter to planner re-evaluation.

Affected files: `src/render/render.ts`, `src/render/resources.ts`, `src/render/styles.css`, `src/contracts/locale-catalogs.ts` if shared resolver changes, `tests/web/render.test.ts`, fixtures/harness, `assets/fonts/FONT-LICENSES.md` only if documentation needs correction, `TODOS.md`, and existing CP020 log. Changes to completed CP019-owned locale helpers require coordination with its revision scope/log, not unrecorded edits.

## Impact and Regression Risk

- Order-preserving group runs intentionally repeat headings when the same group occurs later. This matches canonical order and avoids changing manual route intent.
- Region fallback must not expand support to unknown scripts or unsupported Chinese variants. Unit tests must cover `zh-Hans-CN`, `zh-Hant`, `zh-Hant-TW` and invalid/mismatched supplied catalogs.
- Print keep-with-next can cause large whitespace if over-applied. Inspect short mode plus long activity and many-place PDFs, and allow oversized blocks to split.
- Normalizer/renderer changes must not mutate inputs, lose manual copy or alter stable IDs.
- Fonts must remain offline/licensed and total output within CP018 limits. Logs must distinguish current facts from historical worker claims.

## Verification Plan

1. Before fixes, reproduce F20-1–F20-4 with `npx tsx .runtime/planner-review.ts` (ignored diagnostic artifact; promote meaningful cases into regression tests). Verify corrected behavior afterward.
2. Run `npm run check:web-types`, `npm run typecheck:web-contracts`, `npm run test:web-contracts`, `npm run test:web-render`, `npm run build:brochure-css`, `npm run verify:web-render`, `npm run validate`, `npm test`, `npm audit --audit-level=moderate`, and `git diff --check`.
3. Review all six locales at 390×844 and 1440×1000, with actual loaded glyphs and localized sample values. Review all four modes, positive/negative photo paths, logo/practical values and interleaved spot order.
4. Inspect PDF output with `printBackground:true`: heading/first-activity stays coherent, long description continues fully, all 14 days/60 places remain present, CJK glyphs and background colors remain visible, credit links match used assets. Record page screenshots/paths for later-page breaks and transitions.
5. Reconcile acceptance matrix and existing logs with factual evidence. Do not infer planner acceptance from worker test PASS alone.

## Updated Acceptance Criteria

| Criterion | Required evidence |
|---|---|
| R20-1 revision | Valid authoritative contact/themes are present; all promised renderable fields mapped; source spot order/index preserved and no private metadata emitted. |
| R20-2 revision | Inline Tailwind/resources remain offline; supported locale/script/region resolution and all six actual glyph samples pass; font packaging accurately documented. |
| R20-3 regression | Escaping and safe CSS/assets/credits pass; missing mandatory used-photo attribution fails; gradient-only never embeds retained photo; incompatible catalogs/scripts fail closed. |
| R20-4 revision | Six locales at both viewports, all modes, practical fields and explicit DOM order/content assertions; zero external resource requests/errors/overflow. |
| R20-5 revision | Opened targeted PDF page evidence confirms coherent headings, card breaks, full oversized text and no clipping/overlap; background/glyphs preserved. |
| R20-6 revision | CP019 revision complete; original evidence preserved with corrections and dated revision results; no CP021/n8n/Laravel implementation. |

## Rollback

Revert only intended revision changes after diff review; retain original completion records and regenerated evidence for comparison. If any finding remains, keep CP020 blocked/in progress and chapter REVISE. CP021 stays pending until explicit planner acceptance.
