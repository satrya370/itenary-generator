# CP032 Completion Log: Import Review Hardening

## Result
- Status: `completed`
- Summary: Hardened the existing private import report/review flow; safe scalar-conflict resolution, visible omissions and rejected AI proposals, replay/retention safety, and deterministic browser verification are in place.

## Date
- Completed at: `2026-11-14` (local Windows environment; exact wall-clock time not recorded).

## Plan Reference
- Implementation plan: `../plans/cp032_implementation-plan_import-review-hardening.md`
- Revision plan: `../plans/cp031_revision-plan_private-review-resolution.md` and `../plans/cp031_revision-plan_mode-applicability.md` (authorized prerequisite).

## Changes Made
- Added source-line/page conflict review with select/edit/ignore and stale-revision protection; unsaved draft/language/writing changes are preserved.
- Displayed omissions, layout diagnostics, unknown token/cost values, and bounded rejected-AI proposals explicitly labeled unverified and non-actionable.
- Hardened operation replay, source tamper checks, apply/resolve/undo transaction boundaries, mode applicability, and source-retention cleanup.
- Updated import API docs and SPEC §12.15 for five runtime modes, text/PDF only, no OCR, and explicit private review.

## Files and n8n Workflows Changed
| Artifact | Change |
|---|---|
| `src/server/import/*` | Import safety, evidence, replay, retention and mode-merge fixes. |
| `src/editor/import/*`, `src/editor/main.tsx`, `src/api/client.ts` | Review UI, safe refresh and honest diagnostics. |
| `tests/web/*`, `scripts/web/verify-import.ts`, `scripts/web/make-import-fixtures.ts` | Regression, fixtures and deterministic browser E2E. |
| `SPEC.md`, `TODOS.md`, `docs/import-api-cp030-cp032.md`, plans/logs | Scope, API and completion evidence. |
| n8n workflows | None. |

## Verification Performed
| Verification | Result | Evidence |
|---|---|---|
| Import suite | PASS, 133 tests | `npm run test:web-import` (Node 24 via npm.cmd), including the 40 case nested text corpus and 12-PDF layout intake case. |
| Contracts/API/store/AI/editor/preview/publication/places/render | PASS, 194 tests combined | Individual `test:web-*` commands; see stage log and session evidence. |
| Typechecks + schema drift | PASS | `typecheck:web-app`, `typecheck:web-server`, `typecheck:web-contracts-v2`, `check:web-types`. |
| Browser E2E | PASS | `verify:web-import`: five modes, text/PDF, review, overwrite/undo/reload, scan rejection, public privacy; zero external requests/errors. |
| Visual inspection | PASS | Opened 390px and 1280px conflict/rejected-AI screenshots in `output/web-import/`. |
| Release | PASS | `build:web-release`; `validate:web-release` status `valid`, 58 files, 11 dependencies, not installed. |
| Corpus and mutation campaign | PASS | 40 independently asserted text cases; 12 generated layout PDFs; `verify:web-import-mutations` killed all 5 safety mutations. |
| Diff hygiene | PASS | `git diff --check`. |

## Acceptance Criteria Results
| Criterion | Result | Evidence |
|---|---|---|
| Conflict source lines and revision-safe decisions | PASS | Import apply tests and browser flow. |
| Omissions/rejected AI visible without false actions | PASS | UI test and browser test; rejected model proposal does not enter draft. |
| Legacy reports, retention and unknown usage safe | PASS | Editor/import retention tests. |
| Public output remains private | PASS | Publication tests and browser E2E. |
| Regression/release gates | PASS on Windows | Commands above. |

## Deviations from Plan
- Linux execution and live AI were not run; WSL is not installed and live calls were prohibited. No cross-platform or live-provider claim is made.
- CP031 prerequisite is logged separately; dependency exception for historical prior checkpoints is unchanged.

## Known Limitations and Follow-Ups
- No Linux-runner evidence or paid/live-provider verification.
- No universal PDF/parsing accuracy claim; unsupported layout and rejected AI output remain manual-review diagnostics.
- Broader shared corpus/mutation gates remain explicitly outside this CP032 revision's verified scope.

## Reopen Notice: 2026-11-20
- The 2026-11-14 completion record remains factual for the scope then tested. Subsequent review reproduced late-response attachment (F05) and false conflict from normalized transient rows (F06); the CP031 last-success API is not yet displayed by the editor (F07 UI).
- CP032 was reopened to `in_progress`. These UI fixes belong to phase 5, which the owner has not yet requested. No assertion that the new findings are fixed; no push/deployment in this phase.
- This is the contemporaneous reopen state. The owner subsequently authorized phases 5–6; the completed resolution is recorded in the following revision entry.

## Revision: 2026-11-20 - Async Report and Review State Safety

### Revision Plan
- `../plans/cp030-cp032-cp035_revision-plan_review-findings-gpt-luna.md` (phases 5–6, owner-authorized).

### Changes Made
- Draft-open generations guard delayed draft-specific GET/publication/latest-import responses; latest-import loading no longer blocks switching records.
- Review compares normalized local content to its saved base. Transient empty rows survive a successful resolution; actual content/language/writing edits are preserved through the conflict path.
- Editor reads `lastSuccessfulOperation` and separately presents latest failed/uncertain/running/undone attempt status. Expired source review displays a redacted-state notice without actionable source controls.
- Added repeatable `verify:web-import-review-races` for F05/F06/F07 plus source-expiry UI; `verify:web-stable-inputs` covers custom rows across five modes.

### Verification Performed
- All final regression suites on Windows Node 24: import 192, API 13, AI 30, store 12, preview 12, publication 12, contracts 52, editor 34, render 15, places 16; all passed.
- `verify:web-import`, `verify:web-import-review-races`, `verify:web-stable-inputs`: PASS; browser race E2E zero external requests; screenshots at 390px/1280px inspected.
- App/server/contracts typechecks and `check:web-types` passed. `build:web-release` / `validate:web-release` valid (build `eec9a3d69791`).
- No provider inference, migration, dependency installation, commit, push or deployment.

### Acceptance Criteria Results
- PASS: F05 stale A→B responses ignored; F06 false conflict avoided while real local draft/language/brief edits remain intact; F07 last successful report and newer failed attempt both visible, undone report not actionable; F03 expired-source UI has no source values or actions.

### Remaining Limitations
- Linux unavailable (WSL not installed); no cross-platform claim. CP029 remains deferred. CP035's pre-existing home-view/screenshot follow-ups remain open; the scoped stable-input revision itself passes.


## Revision: Mode-specific hybrid import templates (2026-11-23)

**Plan:** `../plans/cp032_revision-plan_mode-specific-hybrid-import-templates.md`

### Result
- Completed. The import format panel now offers exactly three labeled examples for every itinerary mode in Indonesian and English (30 templates total).
- Half-day, full-day and multi-day examples use distinct schedules and content; destination-guide and activity each have three structures matched to their mode (bulleted/numbered/place cards; labeled details/facts plus steps/compact profile).
- Examples use only syntax the deterministic parser recognizes: recognized headings, known table columns, known activity labels and list/place structure. Any intended AI-assisted prose has explicit section or activity-owner context so CP031 guards can bound it.
- `ImportFormats.tsx` displays each template's localized name instead of a shared global name. Long example lines wrap, so the pane has no horizontal scroll on phones.

### Verification
- `test:web-import`: 213 pass (includes the new corpus test for all 30 examples through deterministic parse + mocked CP031 apply, asserting canonical fields, heading-bounded summary, zero pending/rejected/omitted units and source-backed place/activity prose).
- `test:web-editor`: 34 pass. `test:web-preview`: 12 pass.
- `typecheck:web-app`, `typecheck:web-server`: 0 errors. `check:web-types`: generated declarations match the canonical schema.
- Browser inspection in an isolated data directory and temporary ports: each mode showed three distinct example labels at 390px and 1280px; zero horizontal overflow in the example pane and page; content matched the selected mode. Temporary servers and data were removed.
- No live provider dispatch, schema change, dependency, migration, commit, push or deployment.

### Claim Boundary
- “100%” applies to mapping completeness of the synthetic labeled 30-template corpus through the mocked hybrid contract. It is not a universal accuracy guarantee for arbitrary real documents; ambiguous or unsupported input still requires review.
