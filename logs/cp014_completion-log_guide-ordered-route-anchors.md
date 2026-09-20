# CP014 Completion Log: Guide-Ordered Route Anchors

## Result

- Status: `completed`
- Summary: The guide's `routePlan` field is parsed deterministically into
  ordered anchors, injected into the CP003 skeleton prompt and the CP005
  repair prompt as a fixed spine, and enforced by a normalised (not
  exact-string) subsequence check at the CP008 QA Gate. Proven end-to-end
  against a real live execution on 2026-09-04.

## Date

- Completed at: 2026-09-04 (session-local)

## Plan Reference

- Implementation plan: `../plans/cp014_implementation-plan_guide-ordered-route-anchors.md`
- Revision plan, if applicable: N/A

## Changes Made

See the plan's "Execution Status" section for the full build record (Working
phase, 2026-09-03): new `Parse Route Plan` node, `Build Skeleton Request`
anchor instructions, and QA Gate anchor-subsequence check.

This log closes the one item that plan left open: live end-to-end proof
against a real AI-generated schedule. That was blocked by an external,
pre-existing CP002 bug (invalid AI model name) — fixed 2026-09-04, see
CP002's revision log. Once unblocked, CP005's repair loop was found to have
its own separate pre-existing defect that could corrupt anchors during a
repair; also fixed 2026-09-04, see CP005's revision log. `Build Travel-Time
Repair Request` was additionally updated, as part of the CP005 fix, to state
and preserve any anchors inside a block it repairs — closing a gap this
plan's own Risks table had flagged but left as a follow-up.

## Files and n8n Workflows Changed

No new changes from this log beyond what CP005's and CP002's revision logs
already record. This log is the closing verification record for CP014.

## Verification Performed

| Verification | Result | Evidence |
|---|---|---|
| Live web form submission (real browser, real webhook, real AI calls) | PASS | Execution 4521 |
| `routePlan` parsed from real form input | PASS — `routePlanProvided: true`, `routePlanOrdered: [{"blockNumber":1,"anchors":["Tegallalang Rice Terraces"]}]` | Execution 4521, `QA Gate` node input |
| Anchor reproduced in the final schedule, correct block, correct order | PASS | Execution 4521 rendered HTML contains "Tegallalang Rice Terraces"; visually confirmed in `webtest-final-render2-top.png` |
| QA Gate anchor check (`ROUTE_ANCHOR_MISSING`/`_OUT_OF_ORDER`/`_WRONG_BLOCK`) | PASS — zero anchor-related failures | Execution 4521, `qaOk: true`, `qaFailures: []` |
| Deterministic fixtures (parsing, anchor-matching, prompt injection) | PASS — 24/24, from CP014's Working phase | `itinerary-engine/output/cp014-test-*.{js,cjs}` |
| Anchor preservation through a CP005 repair attempt | PASS (partial — see CP005's revision log's Remaining Limitations for the one open edge case) | Execution 4519 |

## Acceptance Criteria Results

| Criterion (from the implementation plan) | Result | Evidence |
|---|---|---|
| 1. Labelled `routePlan` parsed correctly, ID/EN day markers | PASS | Fixture tests + live |
| 2. Every parse-validation rule fires its own code, fail-closed | PASS | Fixture tests |
| 3. **A completed run reproduces the guide's anchor order exactly, per block** | **PASS — closed by this log** | Execution 4521 |
| 4. Anchor violations rejected by QA gate with matching code | PASS | Fixture tests |
| 5. Translated/reworded anchor accepted (regression guard) | PASS | Fixture test 10 |
| 6. Empty `routePlan` reproduces prior behaviour | PASS | Fixture test 14 |
| 7. CP005 remains authoritative on feasibility; no anchor reordering | PASS | Execution 4519 — guard correctly failed closed rather than shipping an impossible schedule or silently reordering anchors |
| 8. Workflow validates 0 errors/0 warnings, stays inactive | PASS | `active: false` confirmed after every test cycle this session |
| 9. `SPEC.md`, `config/`, `TODOS.md` reflect the new field and codes | PASS | Done during the Working phase |

## Deviations from Plan

None beyond what is already recorded in the plan's own "Execution Status"
section (the `itinerary-schema.json` scope correction and the reused
`ok:false` error-cascade pattern instead of a dedicated failure-handler node).

## Known Limitations and Follow-Ups

- Carried over from CP005's revision log: anchor preservation has not yet
  been proven live for a case where the repair AI *successfully rewrites* an
  anchor-bearing block's activities (only proven where the repair barely
  changed the block). Follow-up fixture recommended in CP005's log.
- Carried over from CP009/CP010's revision logs: a `destination_guide` live
  run (spots[] anchor ordering) has not been exercised this session — only
  scheduled-mode (`half_day`) anchors were proven live. The deterministic
  fixtures cover `destination_guide` anchor matching, but not a live
  real-model run.
