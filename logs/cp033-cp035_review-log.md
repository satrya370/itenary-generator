# CP033-CP035 Review Log

Reviewer: Claude Sonnet 5.5. Date: 2026-11-11. Reviewed: disk state at `7d0ea5e` against `plans/cp033-cp036_implementation-plan_editor-usability-setup-and-places.md` and the owner's 11 findings. Fixes were applied in the same pass (commit below).

## Independently reproduced at HEAD (before fixes)

Build, `typecheck:web-app`, `typecheck:web-contracts-v2`, `typecheck:web-server`, `check:web-types` rc 0; contracts 43, store 12, api 13, ai 28, render 14, editor 31, preview 12, publication 12 pass; `verify:web-editor`, `-preview`, `-publication`, `-ai-ui`, `-e2e`, `-publish-retry`, `-render` rc 0. **But `typecheck:web-contracts` failed (rc 2).**

## Findings and fixes

| ID | Severity | Finding | Fix |
|---|---|---|---|
| V1 | Medium | `typecheck:web-contracts` failed at HEAD: the editor test stub `onUploadAsset: noop` no longer matched the new `Promise<AssetDto \| null>` type (tests ran because tsx does not type-check; the CP034 completion pass did not rerun the typecheck). | Stub returns `async () => null`. |
| V2 | High (UX) | Desktop step list was nine stacked pills above the form and `sticky top-0`, so it covered the top of the page while scrolling the form. Plan asked for a side list on desktop. | Two-column layout on desktop (step list left, form right); phones keep the horizontal sticky bar. |
| V3 | High (owner request 10) | Required fields were not marked red on the field itself; only a list of messages per step existed. | `IssuesContext`/`ItemScope` (`src/editor/issues.tsx`): text, area, time, number, select and language fields get red border, light red background, `aria-invalid` and the message below them; keys are scoped to the stable activity/day/place id so only the right item is flagged. A field turns red after it is left empty (blur) or after Lanjut / opening the publish step. "Tunjukkan" button added next to the publish lock text. |
| V4 | Medium | First version of V3 added `border-red-600` next to the base `border-slate-300`; the base won, so the border stayed grey (message red only). Found by looking at the screenshot. | `fieldClass(invalid)` swaps the border class; `verify-editor` now asserts that an invalid field's computed border colour differs from a valid one. |
| V5 | Medium | The save-error panel ("Periksa field berikut") was rendered below the form, behind the sticky bottom bar; clicking its buttons could hit the bar (`verify-editor` "save error focuses the exact activity" failed after the layout change). | Panel moved above the form, next to the missing-field list. |

## Checked and fine

- Publish issue messages for blank drafts of all four modes: Indonesian text and the right step for every path (probe over `publishIssues`).
- No code reads a stored snapshot's shape (publication writes snapshots and serves stored HTML); the owner's data holds no published versions, so migration 4 cannot break served pages.
- Real-data migration was tried on a copy in CP035 S1 (14 drafts to web-2.1.0, backup written).

## Tests added in this pass

- Editor test 5h: flagged fields get `aria-invalid` and the message, scoped to the right activity; without a provider nothing is flagged (mutation: ignoring issues fails it).
- `verify-editor`: field turns red on blur, red border differs from a valid field, red clears once filled.

## Gate after fixes

Build, `typecheck:web-app`, `-contracts`, `-contracts-v2`, `-server`, `check:web-types` rc 0; contracts 43, store 12, api 13, ai 28, render 14, editor 32, preview 12, publication 12; `verify:web-editor`, `-preview`, `-publication`, `-ai-ui`, `-e2e`, `-publish-retry`, `-render` rc 0; `build:web-release` and `validate:web-release` valid (40 files).

## Still open

- CP035 plan S3: the draft list and mode cards are still a left sidebar on desktop (hidden on phones while a draft is open); a separate home view is not built.
- CP035 gate screenshots per mode and step (Info trip, Jadwal, Info praktis, Preview & publish at 390 and 1280) are incomplete; reviewed screenshots: setup/settings (390, 1280), practical and closing (390), red fields (390), editor (1280).
- `verify:web-publication` once failed on a timing race in its own script ("Publish ulang" right after save); passed in every rerun since.
- `verify:web-readiness` (needs Docker) and `verify:web-ai --live` (paid) not run.
- CP036 not started.
- The running server is old code; migration 4 runs on the next start (back up `.runtime/` first).

## Verdict

CP033: ACCEPT. CP034: ACCEPT (sidebar panels removed in the completion pass). CP035: ACCEPT with the open items above recorded; S3 home view and the screenshot set remain follow-ups, not blockers for CP036.
