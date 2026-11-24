# CP035 Revision Plan: Stable Custom Inputs

## Reason for Revision
Owner reports practical-list rows disappear shortly after adding them and asks for common choices plus custom input, including activity category, across all modes.

## Clarifications and Decisions
Structured question answered: common choices default to Indonesian when content language is unresolved, use the selected content language otherwise, and allow custom text. Preserve unrelated ongoing import changes. No paid AI, deployment or push.

## Existing Behavior
Autosave replaces editing state with normalized server data, removing empty new rows. TextList focus incorrectly falls through to its last button. Activity category is a closed enum.

## Required Behavior
Autosave persists canonical normalized content without destroying transient editor rows/focus. All practical lists support presets and arbitrary entries. Category supports existing values plus bounded custom text, saved and rendered safely.

## Proposed Changes
Keep raw editing state on save success; correct TextList focus; default preset UI to Indonesian. Model each practical-list row with editor-local stable identity and explicit `preset`/`custom` kind so equal text cannot switch component identity while typing; serialize only the canonical string array and preserve ordering. Use a datalist for activity category with common and custom options; relax category schema to bounded string and regenerate types. Keep existing enum values compatible.

## Impact and Regression Risk
Raw editing rows must remain local only; server validation remains canonical. Preserve saved revision and dirty-state safety. Category custom labels need escaped rendering and proper field metadata.

## Verification Plan
Review before tests. Add real-browser regression for all five modes with autosave waits, input focus and retained rows, preset/custom persistence and custom category; type/schema/contract/editor tests; rebuild and restart local server. No paid calls.

## Updated Acceptance Criteria
New blank list rows remain editable beyond autosave, typing retains focus, presets visible with unresolved language, custom category survives save/reload, all modes covered.

## Rollback
Revert only these scoped changes; preserve user's unrelated working-tree changes and drafts.
