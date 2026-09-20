# CP003 Completion Log: Body Skeleton

## Result

- Status: `completed`
- Summary: Added one dynamic, mode-aware skeleton stage that emits exactly one
  scheduled or guide body and fails closed on structural/content violations.

## Date

- Completed at: `2026-08-28 12:50 CST (Asia/Shanghai)`

## Plan Reference

- Implementation plan: `../plans/cp003_implementation-plan_body-skeleton.md`
- Revision plan, if applicable: `N/A`

## Changes Made

- Added dynamic request construction for scheduled and guide body families.
- Added one bounded AI call, robust response parser, validity branch, distinct
  failure result, and CP004 handoff.
- Enforced exclusive body arrays, activity enums, day coverage/condensing,
  grouped guides, quality-floor fields, and pattern-based money rejection.

## Files and n8n Workflows Changed

| Artifact | Change |
|---|---|
| `plans/cp003_implementation-plan_body-skeleton.md` | CP003 implementation plan |
| n8n `GRuSSwnW38U1HNgK` | Added CP003 Stage B nodes and connections |

## Verification Performed

| Verification | Result | Evidence |
|---|---|---|
| Runtime workflow validation | PASS | 17 nodes, 26 valid connections, 0 errors, 0 warnings |
| Scheduled-mode fixtures | PASS | Half-day/full-day one-block shapes and 14-day coverage |
| D6 condensing fixture | PASS | Days 1–7 individual plus condensed day 8–14 range |
| Guide grouping fixture | PASS | 12 full-depth spots with non-empty group labels |
| Exclusive body-shape fixture | PASS | Both arrays populated was rejected |
| Guide clock-time fixture | PASS | `09:00` was rejected |
| Controlled activity enum fixture | PASS | Unsupported `shopping` type was rejected |
| Money guard fixture | PASS | `Rp 50.000` rejected; “harga” without a figure accepted |
| Failure branch and state | PASS | `SKELETON_GENERATION_FAILED`; workflow inactive; retention `all` |

## Acceptance Criteria Results

| Criterion | Result | Evidence |
|---|---|---|
| Scheduled modes populate only `schedule[]` | PASS | Half/full/multi fixtures |
| Guide populates only `spots[]` | PASS | 12-spot fixture |
| Multi-day coverage and condensing | PASS | 14-day fixture |
| Guide no-clock-time and 9+ grouping | PASS | Negative clock fixture and grouped guide fixture |
| Prompt enumerates applicable keys/rules | PASS | Exact saved builder source inspection/execution |
| Parser uses §9.1 patterns and fails closed | PASS | Final-message/fenced/brace execution and negative fixtures |
| No bare-word money guard regression | PASS | “harga” prose fixture accepted |
| Inactive and no CP004+ behavior | PASS | Workflow state and graph inspection |

## Deviations from Plan

- None. The first clock-time test attempt used a malformed fixture that did not
  actually contain a clock value; the fixture was corrected and the unchanged
  implementation passed the complete rerun.

## Known Limitations and Follow-Ups

- Live model execution remains deferred while the workflow is intentionally
  inactive. Exact saved request/parser/handoff sources were exercised with
  representative Responses-format fixtures.

## Revision: 2026-09-06 - Localise Hardcoded English Accommodation Fallback

### Revision Plan

Covered by `plans/cp006-cp009-cp010_revision-plan_output-completeness-and-render-contract.md`
(Group D, item D-1), discovered while investigating why the rendered brochure
looked incomplete. That plan's scope line named CP006/CP009/CP010; this fix
turned out to belong to CP003, since `Parse Skeleton Result` — not the CP006
assembly node as first assumed — is where the fallback text originates. Logged
here for the CP it actually affects, per `RULES.md` §7/§8.

### Reason for Revision

`schedule[].accommodation.note` contained the hardcoded English string
*"Choose an overnight base near this day's location."* whenever the AI didn't
supply its own note (which was every block in the observed `multi_day` runs).
This leaked an English sentence into an otherwise fully Indonesian brochure,
inside the accommodation card a guest actually reads. Confirmed live in
`exec_multi_day_light_final.json`, both schedule blocks.

### Changes Made

In `Parse Skeleton Result`'s `normalizeBlock()`, the two hardcoded occurrences
of the English fallback string were replaced with a `defaultAccommodationNote`
constant resolved from `source.outputLanguage` (already available on the
`Build Skeleton Request` item): the existing English sentence when
`outputLanguage === 'en'`, and *"Pilih akomodasi yang dekat dengan lokasi hari
ini."* otherwise.

### Verification Performed

| Verification | Result | Evidence |
|---|---|---|
| Syntax check of patched node | PASS | `new Function(...)` on patched source |
| All prior-session fixes still present after deploy | PASS | String-contains check across 7 nodes before live test |
| Live `multi_day` run (execution 4933) | PASS | Rendered HTML shows *"Pilih akomodasi yang dekat dengan lokasi hari ini."* for both days, no English string present |

### Acceptance Criteria Results

| Criterion | Result |
|---|---|
| No hardcoded English string reaches an Indonesian brochure from this fallback | PASS, confirmed live |
| English-language runs unaffected | Not separately re-verified live in this pass; low risk, single ternary branch, unchanged for `outputLanguage === 'en'` |

### Remaining Limitations

- Not re-verified with a live `outputLanguage: 'en'` run in this pass; the
  `en` branch code path is unchanged from before the fix (same string, same
  condition), so risk is assessed as low rather than covered by a fresh
  execution.
