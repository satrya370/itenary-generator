# CP002 Completion Log: Brief Interpretation and Mode Resolution

## Result

- Status: `completed`
- Summary: Added fail-closed AI Stage A brief interpretation while preserving
  the normalized mode and deterministically refreshing the destination palette.

## Date

- Completed at: `2026-08-28 12:30 CST (Asia/Shanghai)`

## Plan Reference

- Implementation plan: `../plans/cp002_implementation-plan_brief-interpretation-and-mode-resolution.md`
- Revision plan, if applicable: `N/A`

## Changes Made

- Added request, HTTP, parser, validity branch, failure, palette refresh, and
  CP003 handoff nodes.
- Implemented all applicable `SPEC.md` §9.1 response parsing patterns.
- Preserved authoritative mode/duration even when model confirmation conflicts.

## Files and n8n Workflows Changed

| Artifact | Change |
|---|---|
| `plans/cp002_implementation-plan_brief-interpretation-and-mode-resolution.md` | CP002 plan |
| n8n `GRuSSwnW38U1HNgK` | Added CP002 Stage A nodes and connections |

## Verification Performed

| Verification | Result | Evidence |
|---|---|---|
| Runtime workflow validation | PASS | 11 nodes, 16 valid connections, 0 errors, 0 warnings |
| Parser fixtures | PASS | Last-message, fence-strip, brace-scan, invalid-enum, and failure-code fixtures |
| Mode authority fixture | PASS | Model `multi_day` confirmation could not override normalized `half_day`/null duration |
| Palette refresh fixture | PASS | Accepted `cultural` type selected `cultural` palette |
| Security/state check | PASS | Named credential reference only; workflow inactive; success retention `all` |

## Acceptance Criteria Results

| Criterion | Result | Evidence |
|---|---|---|
| Required Stage A keys and enums | PASS | Prompt enumeration and parser fixtures |
| Mode/duration cannot be overridden | PASS | Conflict fixture |
| Reliability parsing patterns | PASS | Saved-source fixture execution |
| Distinct failure code | PASS | `BRIEF_INTERPRETATION_FAILED` fixture |
| Deterministic palette refresh | PASS | Palette fixture; no additional AI call |
| No CP003 behavior and inactive workflow | PASS | Workflow graph/state inspection |

## Deviations from Plan

- None.

## Known Limitations and Follow-Ups

- Live model execution remains unavailable while the workflow is intentionally
  inactive; CP002 parsing and control flow were tested from the exact saved node
  sources with representative response fixtures.

## Revision: 2026-09-04 - Fix invalid model name blocking every live execution

### Revision Plan

None — direct fix authorized by user, executed immediately (`RULES.md` §5a
Working phase; no separate Ask Question round for this one-line config fix).

### Changes Made

- `AI Brief - GPT OSS 120B` (KobiLLM provider, `api.koboillm.com/v1`) was
  called with `model: 'openai/gpt-oss-120b'`, which the provider rejected on
  every single execution: `Invalid model name passed in
  model=openai/gpt-oss-120b`. This had silently blocked **every live run of
  the entire pipeline since CP002 was written** — nothing downstream of CP002
  had ever executed against a real model until this fix.
- Corrected to `vertex_ai/openai/gpt-oss-120b-maas`, the exact model string
  recorded for this credential in `Credential_information.md` (user-owned
  reference file, read-only from this session).
- Same wrong string existed in `Build Travel-Time Repair Request` (CP005) and
  was fixed in the same pass — see CP005's revision log entry.
- Applied via direct n8n REST API `PUT /api/v1/workflows/:id` (n8n-mcp was
  disconnected this session); workflow was activated only for the duration of
  each live test and deactivated immediately after.

### Verification Performed

| Verification | Result | Evidence |
|---|---|---|
| Live form submission (real browser, real webhook) | PASS — brief call succeeds | Execution 4516, `AI Brief` node returns a real response instead of the 400 error |
| Workflow left inactive after test | PASS | `GET /api/v1/workflows/:id` → `active:false` confirmed after each test cycle |

### Acceptance Criteria Results

| Criterion | Result | Evidence |
|---|---|---|
| CP002's AI Brief call succeeds against the real provider | PASS | Execution 4516 onward |

### Remaining Limitations

- None for CP002 specifically. This fix unblocked discovery of a separate,
  larger pre-existing bug in CP005 (see that log) that had never been
  reachable before because CP002 always failed first.

