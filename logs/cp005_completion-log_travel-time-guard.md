# CP005 Completion Log: Travel-Time Guard

## Result

- Status: `completed`
- Summary: Added deterministic per-mode active-time and Bali route checks with a
  bounded repair loop and fail-closed terminal branch.

## Date

- Completed at: `2026-08-28 14:10 CST (Asia/Shanghai)`

## Plan Reference

- Implementation plan: `../plans/cp005_implementation-plan_travel-time-guard.md`
- Revision plan, if applicable: `N/A`

## Changes Made

- Enforced half-day 6h, full-day 11h, and multi-day 11h/day caps.
- Added conservative Bali coordinate/hard-rule checks for Nusa Penida and
  island-hop patterns.
- Added two-attempt repair request/parse/apply loop and distinct failure code.

## Files and n8n Workflows Changed

| Artifact | Change |
|---|---|
| `plans/cp005_implementation-plan_travel-time-guard.md` | CP005 plan |
| n8n `GRuSSwnW38U1HNgK` | Added guard, bounded repair loop, and CP006 handoff |

## Verification Performed

| Verification | Result | Evidence |
|---|---|---|
| Runtime workflow validation | PASS | 34 nodes, 56 valid connections, 0 errors, 0 warnings |
| Reasonable itinerary | PASS | Two-hour Ubud block passed untouched |
| Bali hard rule | PASS | Ubud → Nusa Penida → Uluwatu violation caught |
| Per-mode cap | PASS | 10-hour `half_day` fixture rejected |
| Guide behavior | PASS | Destination guide skipped scheduled active-hour cap |
| Repair loop | PASS | First repair applied; attempt 2 fail-closed path verified |
| State/security | PASS | Workflow inactive; named credential only; retention `all` |

## Acceptance Criteria Results

| Criterion | Result | Evidence |
|---|---|---|
| Per-mode caps and Bali hard rules | PASS | Guard fixture suite |
| Realistic coordinate speed | PASS | 27 km/h road estimate in saved guard source |
| Guide skip and bounded termination | PASS | Guide and exhausted-attempt fixtures |
| Reasonable itinerary untouched | PASS | Guard output `travelTimeGuardOk=true` |

## Deviations from Plan

- None.

## Known Limitations and Follow-Ups

- Coordinates are a conservative Bali seed, not live routing; expand regional
  rules in the recorded follow-up as usage grows.
- Live repair model execution remains deferred while workflow is inactive.

## Revision: 2026-09-04 - Fix repair loop replacing the whole schedule with an unvalidated, wrong-shaped AI response

### Revision Plan

None — direct fix authorized by user after live testing surfaced the defect
(`RULES.md` §5a Working phase; no separate plan document for this pass).

### Reason for Revision

CP002's model-name bug (see that CP's revision log) had blocked every live
execution before this point, so the repair loop had **never actually run
against a real model response** until 2026-09-04. The first time it did
(execution 4517, live web-form submission, `multi_day` trip with a
`routePlan`), it revealed three compounding defects across the repair
sub-pipeline:

1. **`Build Travel-Time Repair Request`** asked the model to "return the
   complete schedule" with no key manifest at all (unlike `Build Skeleton
   Request`, which explicitly enumerates `blockKeys`/`activityKeys`). The
   model returned its own invented shape:
   `{day, activeHours, activities:[{venue, type, durationHours}]}` instead of
   the canonical `{blockNumber, activities:[{timeLabel, type, title,
   description, durationLabel}]}`.
2. **`Parse Travel-Time Repair`** accepted anything where
   `Array.isArray(parsed.schedule)` was true — no shape validation at all —
   so the wrong-shaped response was accepted as `repairOk: true`.
3. **`Apply Travel-Time Repair`** did `schedule: item.repairedSchedule`,
   replacing **the entire schedule (all blocks)**, even though only one block
   had failed the guard and the repair was meant to touch just that block.

Together this meant: any run where the Travel-Time Guard actually triggered a
repair would silently corrupt every activity's `title`/`description`/
`blockNumber` for the *whole trip*, not just the failing block. Downstream,
this was the direct cause of 29 of 34 QA Gate failures in execution 4517
(`INVALID_ACTIVITY_TYPE`, `ACTIVITY_DESCRIPTION_MISSING`) — every activity's
`title` had become `undefined`. It also caused 5 `ROUTE_ANCHOR_WRONG_BLOCK`
failures from CP014's anchor check, as a direct downstream consequence, not a
defect in CP014's matching logic (confirmed by inspecting the pre-repair
schedule, where CP014's anchors were placed correctly, in order, per block).

### Existing Behavior

Repair silently corrupted the whole schedule's shape on any accepted (but
wrong-shaped) response, and could destroy correctly-placed `routePlan`
anchors in blocks that were never even part of the violation.

### Required Behavior

- Repair prompt must specify the exact key manifest, matching CP003.
- Repair prompt must state and preserve any `routePlanOrdered` anchors that
  fall inside the specific block(s) being repaired.
- Parsed repair response must be validated against the manifest before being
  trusted (right block count, right block numbers, every activity has a
  non-empty `title`/`description` and a controlled `type`).
- Only the specific failing block(s) may be replaced in the schedule; every
  other block must be left untouched, byte-for-byte.
- If the repair response fails validation, treat it exactly like a JSON parse
  failure (`repairOk: false`) — do not accept a partially-wrong shape.

### Changes Made

- `Build Travel-Time Repair Request`: now sends only the failing block(s)
  (not the whole schedule), states the exact `blockKeys`/`activityKeys`
  manifest, and — when `routePlanProvided` — states the anchors that fall in
  the block(s) being repaired with an explicit "never drop, reorder, or move
  to a different block" instruction. Also fixed the same wrong model name as
  CP002 (`vertex_ai/openai/gpt-oss-120b-maas`).
- `Parse Travel-Time Repair`: added `validActivity`/`validBlock` checks
  (`blockNumber` numeric, `activities` non-empty, every activity has a
  non-empty string `title` and `description` and a `type` from the
  controlled vocabulary) and confirms the returned block count and block
  numbers exactly match what was requested. Anything that fails validation is
  treated as `repairOk: false` (same failure path as an unparseable response).
- `Apply Travel-Time Repair`: now merges repaired blocks into the existing
  schedule by `blockNumber` (`Map`-based lookup), replacing only the blocks
  that were actually repaired. All other blocks — including their
  `routePlan` anchors — are passed through unchanged.
- Applied via direct n8n REST API (n8n-mcp was disconnected this session);
  workflow activated only for the duration of each live test, deactivated
  immediately after every test.

### Verification Performed

| Verification | Result | Evidence |
|---|---|---|
| Live execution, `multi_day` trip with a genuinely over-budget block (16.5h vs 11h cap) | Repair now returns a shape-valid response; guard correctly fails closed after 2 attempts rather than shipping corrupted data | Execution 4519 — `Handle Travel-Time Guard Failure` with a clean, correctly-typed error payload, not a corrupted schedule |
| Anchor preservation during a repair attempt that *was* shape-valid | PASS — `Tegallalang Rice Terraces` and `Warung lokal Ubud` titles preserved exactly in the repaired block | Execution 4519, `Apply Travel-Time Repair` attempt 1 output |
| Live execution, `half_day` trip (guard passes without needing repair) | Full pipeline completes end to end — QA Gate `qaOk: true`, 0 failures, HTML rendered | Execution 4520/4521 |
| Workflow validation and safety | PASS | 0 structural errors from the API `PUT`; `active:false` confirmed after every test cycle |

### Acceptance Criteria Results

| Criterion | Result | Evidence |
|---|---|---|
| Repair response is shape-validated before being trusted | PASS | Execution 4519, attempt 2 correctly rejected and treated as parse failure |
| Only the failing block(s) are replaced by a repair | PASS | Merge-by-`blockNumber` logic; unaffected blocks byte-identical pre/post |
| Repair failing to fix an over-budget block fails closed rather than corrupting data | PASS | Execution 4519 |
| `routePlanOrdered` anchors inside a repaired block are stated in the repair prompt | PASS (prompt content verified) — not yet proven with a live run where repair *both* succeeds shape-wise *and* changes anchor-bearing activities materially |

### Remaining Limitations

- The repair AI call (effort: low, temperature 0.1, small token budget) is
  still weak at *actually* trimming a heavily over-budget block within 2
  attempts — execution 4519's block was 2.5+ hours over cap and the model's
  edit barely changed total active hours. This is a repair-quality/prompt
  limitation, not a structural bug; fail-closed behavior here is correct per
  `SPEC.md` §9.3 ("fail closed after the cap — never ship an impossible
  schedule"), so no further fix is required by this revision, but a future
  CP could improve repair-prompt effectiveness (e.g. suggesting which
  activities to trim first).
- Anchor preservation during repair has not yet been proven end-to-end with a
  live run where the AI actually rewrites an anchor-bearing block
  successfully — only proven where the repaired block happened not to move
  the anchors. Follow-up: construct a fixture that forces a real rewrite of
  an anchor-bearing block and confirm CP014's QA check still passes.

## Revision: 2026-09-04 (later same day) - Fix duration-string parser inflating every fractional Indonesian duration by ~3x

### Revision Plan

None — direct fix authorized by user after investigating why `multi_day`
consistently exceeded its active-hours cap across every live test this
session (`RULES.md` §5a Working phase).

### Reason for Revision

Across every `multi_day` live test this session, block active-hours came
back wildly over budget (13.5h, 16.5h, 20.5h, 14h/18h against an 11h cap) even
for skeletons that read as perfectly reasonable half-day-per-day plans. This
was wrongly attributed to "the AI overpacks multi_day days" in this log's
own earlier revision. Root cause, found by reproducing `Travel-Time Guard`'s
`duration()` function against real skeleton output in isolation:

```js
const duration=s=>{const m=normalize(s).match(/(\d+(?:\.\d+)?)\s*(?:jam|hours?|hrs?)/);return m?Number(m[1]):1;};
```

This regex only recognises a **period** as a decimal separator. Every
Indonesian-language duration the model naturally writes with a **comma**
(`"Sekitar 1,5 jam"` = "about 1.5 hours") fails to match starting at the "1"
(the `,` breaks `\s*jam` right after it), so the regex engine's next match
attempt starts at the "5" — which *does* find `"5 jam"` and returns `5`
instead of `1.5`. Verified in isolation:

```
duration('Sekitar 1,5 jam') === 5   // should be 1.5
```

A day with two such activities alone adds `+7` hours of pure parsing error.
Separately, durations expressed in minutes (`"Sekitar 30–45 menit"`, common
for short transfers) were never recognised at all (no `menit`/`minutes`
pattern in the regex) and silently fell back to the default of `1` hour —
smaller than the comma bug but still systematically inflationary for any
schedule with several short transfers.

This means the repair loop (fixed earlier the same day, see the revision
above) had been correctly rejecting bad AI *shapes*, but was being asked to
fix schedules that were never actually over budget in the first place — the
guard's own arithmetic was wrong, not the AI's plan.

### Existing Behavior

Any activity duration written as `"X,Y jam"` (X and Y both digits) added `Y`
hours instead of `X.Y` hours to the block's active-hours total. Minute-based
durations always added exactly `1` hour regardless of actual value.

### Required Behavior

`"1,5 jam"` must contribute `1.5` hours. `"30–45 menit"` must contribute
`~0.625` hours (37.5 minutes, midpoint of the range). Hour ranges like
`"1-2 jam"` must contribute their midpoint (`1.5`), matching the existing
range-handling convention already used for minute ranges.

### Changes Made

- `Travel-Time Guard`'s `duration()` function rewritten to: (1) accept both
  `.` and `,` as the decimal separator, converting `,`→`.` before `Number()`;
  (2) accept a `X-Y` / `X–Y` / `X—Y` range for hours (returning the
  midpoint), matching the same convention as the pre-existing minute-range
  handling; (3) add a second pattern recognising `menit`/`min(s)`/`minutes`,
  converting to hours (`/60`), with the same range-midpoint handling. The
  `1`-hour fallback for completely unparseable text (e.g. `"Fleksibel"`) is
  unchanged.

### Verification Performed

| Verification | Result | Evidence |
|---|---|---|
| Unit-level parser check, 7 representative duration strings in isolation | PASS — all match expected values (`"Sekitar 1,5 jam"`→1.5, `"Sekitar 30-45 menit"`→0.625, en-dash variant→0.625, `"Fleksibel"`→1 fallback, `"1-2 jam"`→1.5, `"45 minutes"`→0.75) | Inline Node.js reproduction before deploying |
| Live `multi_day` execution after the fix | PASS — `maxActiveHours: 8`, zero violations, **no repair needed at all** | Execution 4534 |
| Full pipeline completion | PASS — `qaOk: true`, 0 failures, HTML rendered, 0 mojibake, 0 `[object Object]` | Execution 4534; `cp013-multi_day_fixed.{html,pdf,png}` |
| Rendered visual verification | PASS | `itinerary-engine/output/cp013-multi_day_fixed-top.png` |

### Acceptance Criteria Results

| Criterion | Result | Evidence |
|---|---|---|
| Comma-decimal Indonesian durations parsed correctly | PASS | Unit check + live execution 4534 |
| Minute-based durations recognised and converted | PASS | Unit check |
| A realistically-paced `multi_day` skeleton no longer false-triggers the repair loop | PASS | Execution 4534 — first-ever `multi_day` live run to pass the guard on the **first** check, no repair needed |

### Remaining Limitations

- This was the single highest-impact bug found this session — it had been
  silently inflating every Indonesian-language multi-activity block's active
  hours by several hours, for as long as this node has existed, and had
  never been caught because no execution had reached this node with a real
  AI response until CP002's model-name fix earlier the same day. The
  severity of the earlier "AI overpacks `multi_day`" conclusion should be
  discounted accordingly — it may not be a real pattern at all; re-evaluate
  with a larger sample now that the guard measures correctly.
- The `1`-hour fallback for unparseable duration text (e.g. `"Fleksibel"`,
  "flexible") is a coarse default carried over unchanged from before this
  fix. Not addressed here — flagged for awareness only, since it could still
  mildly overcount blocks with several "flexible" activities.

### Addendum 2026-09-04 (same day) — fix was briefly, accidentally reverted

Later the same day, this exact fix (`Parse Travel-Time Repair`'s shape
validation and `Apply Travel-Time Repair`'s per-block merge) was
**silently undone** by an unrelated PUT (the CP006 `routeSummary`/mojibake
fix, built from a workflow snapshot fetched before this fix had landed).
Caught immediately by a live-test regression — a `multi_day` repair
accepted a wrong-shaped `{start,end,venue}` block again — and reapplied from
a freshly-fetched snapshot. Re-verified live: two repair attempts against a
genuinely over-budget block were both correctly rejected
(`repairOk: false`, `TRAVEL_REPAIR_PARSE_FAILED`) and the guard failed closed
rather than shipping corrupted data (execution 4533). Full account in
`cp006_completion-log_final-copy-and-canonical-assembly.md`'s matching
revision entry's "Process note".
