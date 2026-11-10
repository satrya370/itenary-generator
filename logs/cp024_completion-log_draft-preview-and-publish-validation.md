# CP024 Completion Log: Draft Preview and Publish Validation

## Result

- Status: `completed`.
- Summary: Added a saved-revision preview endpoint using CP020's self-contained renderer, separate publish diagnostics, explicit schedule verification/warnings and a sandboxed responsive preview UI. Preview does not mutate the draft.
- Completed at: 2026-10-07.

## Plan Reference

- Chapter plan: `../plans/cp024-cp025_implementation-plan_preview-publish-and-share-links.md` (§ CP024).
- Entry gate: planner ACCEPT for CP021–CP023, `cp021-cp023_planner-review_2026-10-07.md`.

## Changes Made

- Added `POST /api/v1/itineraries/{id}/preview` accepting only `{expectedRevision}`. The server loads the owned saved record, validates that revision before and after rendering, resolves owned assets, loads bundled renderer resources and invokes CP020's `renderItineraryHtml`.
- Response includes saved itinerary/revision, HTML, publish readiness, stable field diagnostics, warnings and `scheduleVerification`. Safe incomplete drafts return preview HTML even when publish errors remain; unsafe structure/locale/credit/assets and unavailable renderer resources fail closed.
- Added schedule diagnostics for anchored clock labels/durations, explicit interval overlaps, contradictory/zero/negative durations and proven per-mode duration/span caps. Missing/ambiguous labels and condensed multi-day ranges produce partial-verification warnings; no values or travel feasibility are inferred. Unquantified required time is a warning rather than a publish blocker by itself.
- Added narrow visible-copy pattern checks for currency amounts, opening-hours, booking/rating/scarcity claims and unresolved placeholders, with benign-context fixtures across `la`, `fr`, `en`, `id`, `ja` and `zh-Hans`. Brief, notes and internal metadata are excluded.
- Added typed preview DTO/client action, manual-Save gate, edit invalidation, publish errors/warnings panel with focus actions, and responsive phone/desktop iframe preview using `sandbox=""`.
- Documented the CP024 route/response and setup in `docs/editor-ai-api-contract.md`. Added `test:web-preview` and `verify:web-preview` commands.

## Files Affected

| Artifact | Change |
|---|---|
| `src/server/preview.ts`, `src/server/app.ts` | Schedule/content diagnostics, bounded asset/resource resolution and saved-revision preview route. |
| `src/api/client.ts`, `src/editor/main.tsx` | Typed API, diagnostics, saved-only action, focused errors and sandboxed viewport preview. |
| `tests/web/preview.test.ts`, `scripts/web/verify-preview.ts` | API/policy/resource failure and production-shell visual verification. |
| `package.json`, `docs/editor-ai-api-contract.md`, `TODOS.md` | Verification commands, route contract and CP status. |
| `output/web-preview/` | Safe summary and mobile/desktop/iframe screenshots; synthetic fixture only. |

## Verification Performed

| Verification | Result | Evidence |
|---|---|---|
| Preview/policy integration | PASS | `npm run test:web-preview`: 6/6. Covers incomplete saved draft without mutation, ambiguous/missing-time warnings, explicit overlap and half-day cap blockers, stale/unresolved locale, benign price/time copy, currency claims across six locale fixtures and missing stylesheet failure preserving draft. |
| Existing API/editor/AI regression | PASS | `npm run test:web-api` 9/9; `npm run test:web-editor` 8/8; `npm run test:web-ai` 28/28. |
| Contracts/renderer | PASS | `npm run check:web-types`; `npm run test:web-contracts` 22/22; `npm run test:web-render` 12/12. |
| Type/build | PASS | `npm run typecheck:web-app`; `npm run build:brochure-css` (27,125 bytes); `npm run build:web-app`. |
| Preview browser/visual | PASS | `npm run verify:web-preview`: saved revision only, publishReady false diagnostics visible, iframe sandbox verified, rendered text non-empty, no external requests or console errors; 390×844 and 1440×1000 checked. Inspected `output/web-preview/cp024-preview-frame.png`, `cp024-preview-phone.png`, `cp024-preview-desktop.png`. |
| Existing browser regressions | PASS | `npm run verify:web-editor` (four modes, 14-day/60-place, both widths, zero external requests/errors); `npm run verify:web-ai-ui` (mobile/desktop lifecycle, zero external requests/errors). |
| Package/security | PASS | `npm run validate`; `npm test` 1/1; `npm audit --audit-level=moderate` 0 vulnerabilities; final `git diff --check` clean (Git line-ending notices are informational). |

All browser tests used temporary SQLite/filesystem roots and synthetic content. No provider request, budget-ledger change, deployment, publish route or PDF export was involved.

## Acceptance Criteria Results

| Criterion | Result | Evidence |
|---|---|---|
| R24-1 — safe saved-draft preview | PASS | API and browser verify exact saved revision, incomplete copy still renders, iframe sandbox blocks scripts/same-origin and preview leaves canonical draft/metadata unchanged. |
| R24-2 — publish readiness/schedule | PASS | Required/policy errors are separate from HTML preview; ambiguous/missing time warns, provable overlap/duration limits block; no inferred itinerary values. |
| R24-3 — preserve guide work and responsive UI | PASS | Stale revision rejected, edit invalidation/manual Save enforced, renderer-resource failure preserves input; mobile/desktop screenshots inspected. |

## Remaining Limitations

- CP024 supplies readiness diagnostics and preview only; atomic publish, immutable snapshots, stable share links and WhatsApp Open Graph routes are CP025 and have not started until this log/status gate is committed.
- WhatsApp/Meta crawler appearance cannot be verified on localhost; it requires the HTTPS origin deployment/staging gate in CP028.
- The current renderer/legacy local PDF helper is not wired into CP024. PDF export remains removed from the product roadmap.

## Revision: 2026-10-07 - Enforce Known Duration Caps with Unknown Start

### Revision Plan

- `../plans/cp024_revision-plan_schedule-cap-with-unknown-start.md`
- CP027 reproduced V27-01 on temporary real SQLite/filesystem state. The user authorized sequential revisions CP024 → CP025.

### Changes Made

- A recognized positive duration now contributes to the known per-day total even when the start label is absent or unparseable. A known total above 360 minutes for `half_day` or 660 minutes for a non-condensed day blocks publish.
- Condensed multi-day blocks remain partial/warning; an individual known activity above 660 minutes blocks without summing durations across days or inferring a day allocation.
- Preserved warnings for unknown start/duration, interval overlap logic for recognized times, exact field diagnostics and the no-inferred-values contract.
- Added regressions for missing-start 7h half-day, 12h full-day and condensed activity, exact 6h/11h boundaries and +1-minute over-cap, and missing time/no duration remaining warning-only.

### Verification Performed

| Verification | Result | Evidence |
|---|---|---|
| Schedule/preview integration | PASS | `npm run test:web-preview`: 7/7, including V27-01 and boundary/condensed cases. |
| Contract/API/renderer regression | PASS | `npm run test:web-contracts` 22/22; `npm run test:web-api` 9/9; `npm run test:web-render` 12/12. |
| Types/build/browser | PASS | `npm run check:web-types`; `npm run typecheck:web-app`; `npm run build:web-app`; `npm run verify:web-preview` (390×844/1440×1000, sandboxed content and zero external/console errors). |
| CP027 finding probe | PASS for V27-01 | `npx tsx scripts/web/probe-cp027-findings.ts`: missing-start 7h half-day now has `publishReady:false`, `SCHEDULE_DURATION_CAP`, publish `422`. V27-05 still reproduces and remains CP025's active revision. |
| Package/security | PASS | `npm run validate`; `npm test` 1/1; `npm audit --audit-level=moderate` 0 vulnerabilities; `git diff --check` clean apart from line-ending notices. |

### Acceptance Criteria Results

| Criterion | Result | Evidence |
|---|---|---|
| R24-V27-01 — known cap with unknown start | PASS | Probe and API regression show 7h half-day is blocked despite empty start. |
| R24-condensed — no inferred day assignment | PASS | Single 12h activity is blocked; block remains `SCHEDULE_DAYS_NOT_FULLY_VERIFIED`; no cross-day total is inferred. |
| R24-regression — edge boundaries and uncertainty | PASS | 360/660 minutes are allowed, 361/661 fail; absent duration/start with no provable violation remains warning-only. |
| Revision close | PASS | Revision plan, dated log evidence, TODO state and tests agree. CP025 revision begins next; CP027 remains blocked. |

### Remaining Limitations

- CP027 remains blocked by V27-05 in CP025. This revision changes no publication/token state.
- No live AI call, budget reset, AWS access, public deployment or WhatsApp crawler request occurred.

## Revision: 2026-10-07 - Full Pixel Decode Before Preview

### Revision Plan

- `../plans/cp024_revision-plan_full-raster-decode-before-preview.md`
- CP027 reproduced V27-03 after the V27-01 revision using same-size PNG bytes with corrupt compressed pixels; the user authorized this separate CP024 revision.

### Changes Made

- Preview now runs a bounded Sharp full-raster `stats()` decode using existing 16 MP/fail-on-error limits before metadata checks or embedding owned image bytes.
- Decode failures return `422 PREVIEW_BLOCKED` with `ASSET_INVALID` at the canonical asset field (e.g. `hero.assetId`); no corrupted image HTML is returned and preview does not alter the saved draft or source asset bytes.
- Publish calls the same preview service. After a new draft revision references corrupt bytes, publish is rejected before snapshot commit and the previous public version/link remains served.
- Added a fixture that first proves valid PNG preview, then overwrites IDAT payload with same-length corrupt data while PNG metadata remains readable; it asserts preview/publish failure and existing published version preservation.

### Verification Performed

| Verification | Result | Evidence |
|---|---|---|
| Preview/raster API suite | PASS | `npm run test:web-preview`: 8/8. Valid PNG passes; same-size corrupt IDAT remains 8×8 metadata-readable but returns 422 `ASSET_INVALID`, no inline image, unchanged draft/asset bytes; corrupt republish leaves old page intact. |
| CP027 diagnostic probe | PASS for CP024 findings | `npx tsx scripts/web/probe-cp027-findings.ts`: V27-01 and V27-03 not reproduced. V27-05 not reproduced after the CP025 revision. |
| Contract/API/publication/renderer | PASS | Contracts 22/22; API 9/9; publication 5/5; renderer 12/12. Typechecks and generated type check pass. |
| Browser/package/security | PASS | Build and preview/publication/editor/AI browser gates pass; 0 external requests/console errors. `npm run validate`, `npm test` 1/1, `npm audit --audit-level=moderate` 0 vulnerabilities, `git diff --check` clean except line-ending notices. |

### Acceptance Criteria Results

| Criterion | Result | Evidence |
|---|---|---|
| R24-V27-03 — corrupt pixels fail closed | PASS | Same-length compressed-data corruption is rejected before inline preview; structured path points to `hero.assetId`. |
| R24-raster-positive/limits | PASS | Valid synthetic PNG still renders; existing JPEG/PNG/WebP upload and size/pixel tests pass. |
| R24-publish-propagation | PASS | Corrupt asset on a changed revision cannot replace current published HTML/image/token. |
| Revision close | PASS | This revision plan/log/tests/TODO status align; initial ACCEPT/history remains preserved. |

### Revision Review: 2026-10-07

- Reviewed changed decode path against V27-03, existing asset limits and CP020 resource contract. Decoder runs before data-URI embedding, does not return raw pixels, and file/database values are unchanged on rejection.
- Valid raster and corrupted-compression fixtures were both executed; full CP024 regression/browser gates pass.
- **Disposition: ACCEPT.** CP024 V27-01 and V27-03 revisions are closed. This does not accept CP027's full E2E matrix or authorize CP028.

### Remaining Limitations

- CP027's full all-mode fault/recovery/local-TLS matrix remains pending; external HTTPS/WhatsApp behavior and AWS readiness are not claimed here.
- No provider request, AI ledger reset, AWS/cloud call or production data was used.

## Revision: 2026-10-08 — Exact Repeater Diagnostic Focus (V27-02)

### Revision Plan

- `../plans/cp024_revision-plan_diagnostic-focus-for-repeaters.md`
- CP027 browser repro found that a missing title on a later activity focused the first activity. User authorized this CP024 revision; CP027 resumed only after the revision and integrated E2E rerun passed.

### Changes Made

- CP024 preview composition expands generic required-field paths into concrete indexed diagnostics and includes the nearest stable repeater `targetId` when available. It does not change the CP019 registry/validator contract.
- The editor resolves supported activity, schedule-block and spot targets by stable ID, then focuses the actual leaf input. It does not guess index zero for a generic or unresolved path.
- Added API coverage for a later missing activity title and browser coverage that reorders activities before clicking the diagnostic, asserting focus on the exact missing item's stable-ID control.

### Verification Performed

| Verification | Result | Evidence |
|---|---|---|
| Preview and repeater API | PASS | `npm run test:web-preview`: 9/9, including concrete path plus stable target ID. |
| Editor/contracts | PASS | `npm run test:web-editor`: 8/8; `npm run test:web-contracts`: 22/22; both web app and contracts typechecks pass; generated canonical types match. |
| Build | PASS | `npm run build:brochure-css`: 27,309 bytes; `npm run build:web-app` succeeds. |
| Browser regression | PASS | `npm run verify:web-preview`: exact missing activity focused after reorder; sandbox verified, 0 external requests/console errors. `npm run verify:web-editor`: four modes, 14-day/60-place stress, phone/desktop, 0 external requests/console errors. |
| CP027 integrated rerun | PASS for executed cases | `npm run verify:web-e2e`: full-day deterministic AI Generate/Apply/manual Save, preview/publish/OG, process restart, draft edit + republish with stable link, revoke/rotation, and half-day/multi-day/destination-guide preview/publish. Exact canonical diffs and private brief/note exclusion asserted. Summary: `output/web-e2e/cp027-integrated-summary.json`; 0 external requests/console errors. This does not satisfy the still-open full CP027 matrix. |
| Prior CP findings | PASS | `npx tsx scripts/web/probe-cp027-findings.ts`: V27-01/V27-03/V27-04/V27-05 all `reproduced:false`. |
| Package/security | PASS | `npm run validate`; `npm test` 1/1; `npm audit --audit-level=moderate`: 0 vulnerabilities. |

All runs used synthetic fixtures and temporary local storage. No live AI inference, ledger reset, AWS/cloud call, external WhatsApp request, deployment or PDF feature was involved.

### Acceptance Criteria Results

| Criterion | Result | Evidence |
|---|---|---|
| R24-V27-02-api | PASS | Missing repeated title returns a concrete indexed path and stable `targetId`. |
| R24-V27-02-ui | PASS | Reordered browser case focuses the exact missing activity control by stable ID. |
| R24-regression | PASS | Preview/editor/contracts suites, typechecks, build and browser regressions pass. |
| Revision close | PASS | Revision plan, completion log, TODO and this review agree. **Disposition: ACCEPT (2026-10-08).** CP024 is completed with V27-01/V27-02/V27-03 revisions passed. CP027 resumes in progress; CP028 remains pending. |

## Revision: 2026-11-10 - Guide-centric schema web-2.0.0 (R4)

### Revision Plan

`plans/cp019-cp025_revision-plan_guide-centric-schema-and-editor.md` (stage R4, "R3/R4 execution plan" and "R4 amendment"). Stage log: `logs/cp024_stage-log_r4-preview-v2.md`.

### Changes Made

- `src/server/preview.ts` rewritten for v2: span caps 360/720/960 minutes with warnings only for unknown times, overlap detection against the latest measured end, hotel-name warning (multi-day), meeting-point warning when no pickup, locale resolution errors, policy-guard patterns on the v2 field paths (pattern-based, not word lists, per RULES 11c), full raster decode, and `targetId` on diagnostics for editor focusing. `preview.ts` is no longer excluded from `typecheck:web-server`.
- R6: `verify-preview.ts` now waits for the Preview button to be enabled before clicking. The previous version failed about one run in three because the status text appears before `busy` is cleared.
- Commits: `6b23be7`, `d02bec9`, `9e2da43`, `5b0f183`, `73168be` (selector changes), R6 commit.

### Verification Performed

Run on 2026-11-10: `test:web-preview` 12/12; `verify:web-preview` 6 consecutive passes after the fix (focus lands on the exact empty activity after a reorder; sandboxed preview; no overflow); `probe-cp027-findings.ts`: V27-01 (7 h half day) now blocked with `DURATION_CAP_EXCEEDED`, V27-03 (corrupt raster) fails closed, all findings `reproduced: false`.

### Acceptance Criteria Results

Plan criterion 7 (mode change cannot leave hidden rendered data; caps; diagnostics focus): PASS. Negative checks from the Verification Plan (guide `startDate` -> `FIELD_NOT_APPLICABLE`, half day 5 h OK / 7 h error / unknown warning only, half-day meals error, "harga" without a number accepted): covered by `contracts.test.ts` (`FIELD_NOT_APPLICABLE`, half-day meals, caps with unknown times) and `preview.test.ts` / `ai.test.ts` (benign wording such as "prices are not listed" is accepted). Joint R3+R4 review: pending.

### Remaining Limitations

- Deviations E1-E4 of the R4 amendment still need the reviewer's decision.
- CP status in `TODOS.md` is not changed by this section; the reviewer decides after the joint review.
