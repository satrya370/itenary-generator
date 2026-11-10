# CP022 Review Log: R5 Editor WIP (OpenCode, uncommitted)

Reviewer: Claude Opus 5.5. Date: 2026-11-10. Reviewed: the working tree on top of commit `306e209` (files changed after `23d88e9`, never committed). Verdict: **REVISE: keep most of it, fix the listed defects, finish the missing parts.** The instructions are in the plan section "R5 completion and R6 plan (planner review 2026-11-10, executor: Claude Haiku)" in `plans/cp019-cp025_revision-plan_guide-centric-schema-and-editor.md`. The finding IDs below match the fix IDs there.

## State found on disk

| File | State | Verdict |
|---|---|---|
| `src/editor/schema-meta.ts` | `appliesTo`, `templatePath`, `fieldMeta`, schema limit walk | Keep. One type error (S1). |
| `src/editor/labels.ts` | All v2 label tables, mode cards verbatim, status copy | Keep. One string differs from the plan (L1). |
| `src/editor/model.ts` | v2 factories, `changeMode`, `hasModeLoss`, photo/hotel/meal helpers | Keep the structure. Fix M1–M7. |
| `src/editor/fields.tsx` | Text, number, time, toggle, select, list, asset and theme controls | Keep. Delete `ObjectList` (F2). |
| `src/editor/sections/TripInfo.tsx` (390 lines) | Almost the whole form: `EditorForm`, all sections, `PhotoField`, `LocaleField`, `ModePicker`, `DraftList` | Good content in the wrong file. Split it (H4) and fix F1–F9. |
| `src/editor/main.tsx` | Unchanged v1 (85 type errors) | Not started. |
| `src/editor/coverage.ts` | Still present | Delete. |
| `tests/web/editor.test.ts` | Unchanged v1; the whole file fails to load (0 pass) | Not started. |
| `scripts/web/verify-*.ts` | Unchanged | Not started. |
| `logs/cp022_stage-log_r5-editor-v2.md` | Step 0 orientation and baseline only | Keep and continue. |
| `TODOS.md` | CP022 set to `in_progress (R5 - editor v2)` | Keep. |

## Findings

| ID | File | Finding |
|---|---|---|
| S1 | schema-meta.ts:40 | `$defs` is typed `unknown` (TS2571). |
| L1 | labels.ts | `languageUnresolved` uses curly quotes; the plan's text uses straight quotes `'Deteksi otomatis'`. |
| M1 | model.ts | `changeMode` ends with `validateDraft(next).value`, which hides errors and pulls the validator into the editor model. |
| M2 | model.ts | Meals: `normalizeMeals` returns `null` when all are false, but `createBlankDraft` creates `{false,false,false}` for full/multi. Inconsistent. |
| M3 | model.ts | `setPhotoCredit(null, …)` creates a photo with `assetId: ''`, which fails the schema. |
| M4 | model.ts | `hasModeLoss` counts blank days (every `kind` is a non-empty string, so every day "has text"); half/full → multi does not report the cleared start/end time. |
| M5 | model.ts:157 | Redundant `mode !== 'destination_guide'` comparison (TS2367). |
| M6 | model.ts | No save-time normalisation of blank nullable strings; many inputs can still store `''` where the schema expects `null` or a format. |
| F1 | TripInfo.tsx `PhotoField` | Credit fields reuse the photo's meta, so all three are labelled "Foto sampul"/"Foto hari" and carry the wrong required/limit data. The empty text "Belum ada foto sampul…" is also shown for day and place photos. |
| F2 | TripInfo.tsx practical | Emergency contacts have no remove/move buttons; limit hard-coded to 30. `ObjectList` in fields.tsx uses `any` and is unused. |
| F3 | TripInfo.tsx AI panel | Empty `AiAssistProbe` component; the brief's label comes after its textarea. |
| F4 | TripInfo.tsx places | Group shown in both legend and heading; heading is inside the card; delete has no confirmation; limit hard-coded. |
| F5 | TripInfo.tsx days | Day move buttons are never disabled at the ends; delete has no confirmation. |
| F6 | TripInfo.tsx `LocaleField` | "Bahasa belum dipilih…" help is shown even when the language is resolved. |
| F7 | TripInfo.tsx `ModePicker` | Mode title printed twice (badge and heading). |
| F8 | TripInfo.tsx | `LocaleField` input must carry `data-field-path="trip.language"`; not verified in the WIP. |
| R1-S1 | config/web/itinerary.schema.json | **For the R1 reviewer:** the R1 amendment requires `places.maxItems: 60`; the schema has no `maxItems` on `places`. R5 must not edit the schema; the editor uses a temporary constant (PR-15). |
| P1 | plan (planner defect) | The previous R5 gate typechecks `tests/web/editor.test.ts` with `tsconfig.web.json`, which has no `jsx` setting, so it cannot pass once the test imports `.tsx`. Fixed by PR-16. |

## Not a finding

- The stage log's baseline line "tsconfig.app.json: 1 error in labels.ts" was correct at that moment: commit `23d88e9` (written by the previous executor, not OpenCode) left `labels.ts` syntactically broken; OpenCode repaired it.
- Commit `23d88e9` (earlier Haiku run, `git add -A`) also committed 66 unrelated files: `.playwright-mcp/` (38), `e2e-pdf-results/` (16), `dist/` (3), `.codebase-memory/` (3), four `cp02x-*.png` screenshots and `.claude/settings.json`. Never pushed. The reviewer untracked them in a separate commit; the files stay on disk.
- A stray copy of an early stage log exists at `D:\Micro Saas\itinerary-engine\logs\` (outside the repo, written by an earlier Haiku run). It is not used; the owner can delete that folder.
