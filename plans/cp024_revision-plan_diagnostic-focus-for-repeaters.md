# CP024 Revision Plan: Diagnostic Focus for Repeater Fields

**Date:** 2026-10-07. **Status:** completed; review ACCEPT 2026-10-08.
**Authority:** `SPEC.md`, `TODOS.md`, `RULES.md`; CP027 browser repro `output/web-preview/verification-summary.json`.
**Sequence:** CP024 V27-02 revision; CP025 remains completed. CP027 stays blocked until this revision and the planned E2E rerun pass.

## Reason for Revision

CP027 extended `verify:web-preview` to create two activities, leave the second activity title blank, preview, and click the required-field diagnostic. The UI focuses the first activity title instead of the invalid second row. `validateForPublish()` returns the registry's generic `schedule[].activities[].title` path, while `focusDiagnostic()` treats omitted indices as zero. This makes the diagnostic action misleading for repeaters/reordered content.

## Clarifications and Decisions

- Structured Ask Question 2026-10-07: user authorized a separate CP024 revision for the repeater diagnostic focus defect.
- Keep CP019 schema/registry and `validateForPublish()` behavior unchanged; translate generic validation findings at the CP024 preview-composition boundary into concrete indexed paths and stable target IDs.
- Return only the missing/invalid repeated leaf diagnostics, not one focus link for every valid item. Preserve canonical order and stable item IDs.
- UI focus must match the indexed path/target ID and actual leaf control; it may not guess the first row when an index or target ID is unavailable. In that case retain visible diagnostic text/path without focusing an unrelated field.
- No content mutation, autosave, schedule repair, diagnostic suppression, PDF work, live AI call, or CP025 behavior change.

## Existing Behavior

- CP019 registry errors may retain generic paths such as `schedule[].activities[].title`.
- `renderSavedDraftPreview()` currently forwards those paths unchanged.
- `focusDiagnostic(path)` falls back to repeater index zero for generic array paths; browser repro shows second blank activity title focuses first activity.
- Existing `verify:web-preview` only checks focus of a direct brochure field, not an invalid repeater after another valid row.

## Required Behavior

- For a draft with first activity title present and second title blank, preview diagnostics identify `schedule[0].activities[1].title` and the second activity's stable ID.
- Clicking that diagnostic focuses the title field for activity ID 2, regardless of list order, and never activity 1. Reordering activities before preview still focuses the same stable item.
- For nested/other repeaters (spots, string/object lists) missing leaf errors are concrete and focus the relevant existing control when a stable ID is available; otherwise show a precise indexed path without an unrelated focus target.
- Existing direct-field focus, schedule warnings, publish readiness, no-content-mutation, localization, accessibility and sandbox behavior remain passing.

## Proposed Changes

1. Mark only CP024 `in_progress (revision)`; CP025 completed and CP027 blocked.
2. Add a minimal path-expansion helper in `src/server/preview.ts` for `PUBLISH_FIELD_REQUIRED` generic `[]` paths. Traverse saved normalized content, locate each actually missing leaf, emit concrete `[index]` paths, and propagate the nearest stable `id` as optional `targetId`. Keep other diagnostics unchanged.
3. Extend `PreviewDto`/diagnostic types with optional `targetId`; the UI uses `targetId` plus canonical leaf key to locate the actual control. Keep concrete path-based targeting as fallback; never fall back to array index zero when the path is generic.
4. Add API tests for first-valid/second-missing activity, spots and primitive/object repeaters as practical; assert concrete path, target ID and publish behavior. Add a browser regression with two activities plus reorder that clicks the second item's error and asserts exact active element.
5. Review how normalization affects indices and confirm target IDs still refer to the saved revision. Edits invalidate preview before target lookup; late focus action is ignored when record/revision/edit generation no longer matches.
6. Run CP024 and editor/browser regressions, inspect screenshots, append a dated revision section to `logs/cp024_completion-log_draft-preview-and-publish-validation.md`, update TODO and re-review CP024 before resuming CP027.

## Impact and Regression Risk

- Repeater errors could multiply; emit only invalid/missing occurrences and keep payload size bounded by existing canonical list/payload caps.
- Indices can shift after reorder; include/use stable target ID so focus tracks the actual item, not stale position. UI must reject diagnostics from an older revision/edit generation.
- Generic paths from CP019 may contain nested arrays. Test missing leaf expansion against actual schema/registry shapes; do not patch CP019 behavior without a separate revision plan.
- A malformed path must safely preserve its original visible diagnostic and produce no focus rather than throwing or focusing the wrong field.

## Verification Plan

```text
npm run test:web-preview
npm run test:web-editor
npm run typecheck:web-app
npm run typecheck:web-contracts
npm run test:web-contracts
npm run build:web-app
npm run verify:web-preview
npm run verify:web-editor
npm run validate
npm test
npm audit --audit-level=moderate
git diff --check
```

The browser repro must assert second-row focus after reorder. E2E summary records case status, field path and masked target identity (never raw share tokens/content). Then `npx tsx scripts/web/probe-cp027-findings.ts` must continue to show V27-01/03/04/05 not reproduced.

## Updated Acceptance Criteria

| ID | Required evidence |
|---|---|
| R24-V27-02-api | Missing repeated field is returned as a precise concrete path plus stable target ID where available. |
| R24-V27-02-ui | Clicking the second invalid item after reorder focuses that exact stable item/control; unrelated row never receives focus. |
| R24-regression | Direct-field diagnostics, incomplete Save/preview, edit invalidation, existing preview/publish tests and editor browser suite pass. |
| Revision close | CP024 completion log has dated revision evidence; TODO/revision plan agree; CP027 can resume only after CP024 re-review. |

## Rollback

Revert only this diagnostic expansion/focus revision if it degrades localization, error accuracy or accessibility. Retain the browser regression/probe and keep CP027 blocked until the correct target is verifiably focused. Do not alter CP019 registry/schema, suppress the diagnostic, or weaken prior acceptance.

## Execution and Revision Review — 2026-10-08

- **Changes:** CP024 preview composition expands generic missing-field repeater findings to concrete indexed paths and stable `targetId`s. The editor resolves the exact canonical control by stable identity and does not guess index zero for unresolved generic paths. API, nested repeater and reordered-browser regressions are covered.
- **Verification:** `npm run test:web-preview` 9/9; `npm run test:web-editor` 8/8; `npm run test:web-contracts` 22/22; `npm run typecheck:web-app`; `npm run typecheck:web-contracts`; `npm run check:web-types`; `npm run build:brochure-css` (27,309 bytes); `npm run build:web-app`; `npm run verify:web-preview` (exact missing activity after reorder, sandbox true, zero external requests/console errors); `npm run verify:web-editor` (four modes, 14-day/60-place stress, phone/desktop, zero external requests/errors); `npm run validate`; `npm test` 1/1; `npm audit --audit-level=moderate` 0 vulnerabilities.
- **CP027 rerun:** `npm run verify:web-e2e` passes full-day AI Generate/Apply/manual Save, publish and OG, process restart, permanent revoke/token rotation, plus half-day/multi-day/destination-guide preview and publish. Summary: `output/web-e2e/cp027-integrated-summary.json`; browser evidence in `output/web-e2e/`; 0 external requests and 0 console errors. This is partial CP027 evidence, not the full CP027 acceptance matrix.
- **Related-defect probe:** `npx tsx scripts/web/probe-cp027-findings.ts` reports V27-01, V27-03, V27-04 and V27-05 `reproduced:false`.
- **Disposition: ACCEPT.** The diagnostic identifies the exact invalid indexed path and stable target and focuses the correct item after reorder. CP024 is completed with V27-01/V27-02/V27-03 revisions closed. CP027 resumes `in_progress`; its remaining acceptance matrix is still required. CP028 remains pending.
- No live AI inference, ledger reset, deployment, external WhatsApp request or PDF feature was used.
