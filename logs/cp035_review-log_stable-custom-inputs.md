# CP035 Review/Test: Stable Custom Inputs

## Result
Requested input-reset fix and editable activity-category choices implemented; CP035's unrelated historical acceptance status is unchanged.

## Date and Plan
2026-11-20 · `plans/cp035_revision-plan_stable-custom-inputs.md`.

## Root Cause and Changes
- Autosave installed the normalized server snapshot into local editing state, removing newly added empty list rows. Save now updates the persisted record/revision without discarding transient editing state.
- TextList incorrectly used `focus() ?? fallback.focus()`. Since focus returns undefined, focus always fell through to the add button. It now uses an explicit branch.
- Practical/policy presets default to Indonesian while content language is unresolved; explicit supported language still chooses its catalog. Free text remains available.
- Activity category has 12 suggestions plus custom text (max 120 characters); legacy category values remain compatible. Schema/type declaration updated together, no migration or draft deletion.

## Review
Confirmed shared components affect all five modes. Empty editing rows remain local only; persisted content is still normalized and validated. Category is rendered through the existing escaped text path. Other working-tree import/schema/render changes were present before this task and were preserved.

## Verification
- `scripts/web/verify-stable-inputs.ts`: PASS across activity, half_day, full_day, multi_day and destination_guide. Each tests six lists after >1s autosave delay, continuous typing/focus, persisted text after reload, preset selection, and open closing panel. Activity tests custom category persistence after autosave and reload.
- `test:web-editor`: 34 passed; `test:web-contracts`: 52 passed including new bounded custom-category test; `test:web-api`: 13 passed; `test:web-render`: 15 passed.
- App typecheck, schema drift check and frontend build passed. Provider disabled, no paid calls.
- Screenshots under `output/stable-inputs` opened and inspected for mobile practical list and desktop custom category.

## Runtime and Scope
Local server rebuilt/restarted on `http://127.0.0.1:3000`, AI disabled for this test session. No commit or push was requested for this revision; no unrelated data changes or branch reset.

## Revision follow-up: preset/custom row identity (2026-11-20)
- Reworked practical option rows with editor-only stable IDs and explicit preset/custom kinds; exact text equality no longer changes the textarea into a checkbox. Toggling a preset that matches a custom row converts it intentionally rather than creating a duplicate. Custom row order survives move operations and external record changes reset local identity safely.
- `verify-stable-inputs.ts` passes five modes: six practical lists, add blank row, type exact preset `Air mineral`, wait through autosave, continue typing, focus retention, persisted values after reload; preset checkbox and closing disclosure remain usable. Activity mode additionally verifies custom category save/reload and custom list row reorder while the selected preset remains saved.
- `test:web-editor` 34/34; `test:web-contracts` 52/52 (bounded category custom text + XSS-safe render); `test:web-render` 15/15; app typecheck and canonical schema type check pass.
- Screenshots at `output/stable-inputs/*390.png` and category `1280.png` opened and inspected. Stable user-facing controls render without clipping; custom activity category is visible and editable on phone and desktop.
- CP035 remains `in_progress` because the original home-view and broader per-mode/per-step screenshot follow-ups are not closed by this scoped revision.

## Phase 4 final integrated verification (2026-11-20)
- `verify-stable-inputs.ts` PASS: all six practical lists across all five modes remain editable after autosave; test pauses at exact preset text `Air mineral`, continues typing, verifies focus, save/reload, selected preset, and custom row reorder. Activity custom category saves and reloads.
- Full suites: import 192, editor 34, contracts 52, render 15; API 13, AI 30, store 12, preview 12, publication 12, places 16 all pass. App/server/contracts/schema typechecks pass.
- `verify:web-import` PASS; release build/validation valid; mobile list and mobile/desktop custom-category screenshots inspected.
- No live AI, commit, push or deployment. CP035 remains `in_progress` for earlier home view and broader screenshots; no unrelated CP statuses changed.

## Phase 4 review disposition (2026-11-20)
- Re-reviewed row identity, reordering and save normalization: local row IDs/kinds stay in the editor only and never enter the canonical itinerary or database schema. `included` remains a plain canonical string array; a matching custom value is not silently toggled into a preset while typing.
- Full browser harness PASS across all five modes, with wait longer than autosave debounce, exact-preset-intermediate text, continued typing, focus, reload, selected preset and reordering; activity category custom text also survives reload.
- Build and app typecheck pass. Visual screenshots inspected. No paid AI or migration.
- CP035 overall remains `in_progress`: this focused input revision does not close original home-view, owner review or broader screenshot follow-ups.
