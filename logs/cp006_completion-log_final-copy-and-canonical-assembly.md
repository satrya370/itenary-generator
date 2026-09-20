# CP006 Completion Log: Final Copy and Canonical Assembly

## Result

- Status: `completed`
- Summary: Added mode-aware final copy generation and deterministic assembly of
  the `canonicalItinerary` contract, ready for photo acquisition.

## Date

- Completed at: `2026-08-28 15:20 CST (Asia/Shanghai)`

## Plan Reference

- Implementation plan: `../plans/cp006_implementation-plan_final-copy-and-canonical-assembly.md`
- Revision plan, if applicable: `N/A`

## Changes Made

- Added final-copy request, AI call, parser, validity branch, failure handler,
  canonical assembly, and CP007 handoff.
- Final copy is restricted to overview/practical/closing; reconciled safe
  schedule/spots remain the structural source.
- Canonical hero starts gradient-only with empty photo credits for CP007.

## Files and n8n Workflows Changed

| Artifact | Change |
|---|---|
| `plans/cp006_implementation-plan_final-copy-and-canonical-assembly.md` | CP006 plan |
| n8n `GRuSSwnW38U1HNgK` | Added CP006 final-copy and assembly path |

## Verification Performed

| Verification | Result | Evidence |
|---|---|---|
| Runtime workflow validation | PASS | 41 nodes, 68 valid connections, 0 errors, 0 warnings |
| Final-copy key manifest | PASS | Overview, practical, and closing keys enumerated and parsed |
| Canonical scheduled assembly | PASS | Safe schedule retained; gradient-only hero and empty credits |
| Canonical guide assembly | PASS | Spots retained and schedule remains empty |
| Forbidden-content guards | PASS | Money, opening-hour claim, and unverified venue fixtures rejected |
| Parser/failure paths | PASS | Brace/final-message parse, missing-key rejection, distinct failure code |
| State/security | PASS | Workflow inactive; named credential only; retention `all` |

## Acceptance Criteria Results

| Criterion | Result | Evidence |
|---|---|---|
| Mode-aware overview/practical/closing | PASS | Builder manifest and valid-copy fixture |
| Canonical merges safe schedule/spots | PASS | Scheduled and guide assembly fixtures |
| No money, hours, tickets, or unverified names | PASS | Three negative guard fixtures |
| Canonical ready for CP007 without photo claim | PASS | `hero.gradientOnly=true`, `photoCredits=[]` |

## Deviations from Plan

- None.

## Known Limitations and Follow-Ups

- Live model execution remains deferred while workflow is inactive; exact saved
  node sources were exercised with representative response fixtures.
- Photo fields and attribution are intentionally empty until CP007.

## Revision: 2026-09-04 - Fix `[object Object]` leaking into rendered output via `overview.routeSummary`

### Revision Plan

None — direct fix authorized by user, found during a 4-mode live test sweep
(`RULES.md` §5a Working phase).

### Reason for Revision

A live `multi_day` execution (real web form, real AI) rendered
`Route [object Object] · [object Object]` visibly in the "Trip overview"
section. Root cause: `Build Final Copy Request`'s prompt listed
`overview exactly has summary, quickFacts, routeSummary, highlights` without
ever stating `routeSummary`'s item type. `SPEC.md` §11 (and
`itinerary-schema.json`) define it as `array of string`, but nothing told the
model that, and nothing validated it — so the AI returned an array of
`{day, title, note}` objects instead, matching the neighbouring `highlights`
shape by analogy. `Parse Final Copy` only checked that `overview` /
`practical` / `closing` existed as objects, not the shape of anything inside
them. `Assemble canonicalItinerary` passed the objects through unchanged (it
has no reason to reshape `overview`). `QA Gate` never saw the literal string
`[object Object]` because it checks `JSON.stringify(canonical)`, which
renders an object as `{"day":...}`, not as `"[object Object]"` — that string
only appears once the **renderer** string-coerces the value. This is the same
lesson as CP005's revision: prompt wording alone does not constrain model
output; only an explicit manifest *plus* a validator that actually checks
shape does.

### Existing Behavior

`overview.routeSummary` could be an array of objects; nothing caught this
before it reached the renderer, where it stringified to `[object Object]`.

### Required Behavior

`overview.routeSummary` must be an array of plain strings. If the model
returns anything else, this must be rejected the same way an unparseable
response is rejected (fail the Final Copy step, do not pass corrupted data
downstream) — and the renderer must degrade gracefully even if a stray object
slips through, rather than printing `[object Object]`.

### Changes Made

- `Build Final Copy Request`: prompt now explicitly states
  `routeSummary is an array of 2-6 short plain text strings ... — never
  objects, never {day,title,note} pairs`.
- `Parse Final Copy`: added a `routeSummaryOk` check
  (`!Array.isArray(...) || every item is typeof 'string'`) to the existing
  `required` gate. A response that fails this is now rejected with a new,
  distinct reason code `FINAL_COPY_ROUTESUMMARY_SHAPE_INVALID` (existing
  `FINAL_COPY_KEYS_MISSING` reserved for the original missing-keys case).
- `render-itinerary-html.js` (and both n8n copies, `Render HTML` and
  `Guide Layout`, which embed the same function): `renderOverview`'s
  route-stop rendering now extracts `stop.note || stop.title || stop.day ||
  stop.label || stop.value` when a stop is an object, instead of directly
  `esc()`-ing it — defense in depth, matching the existing `textList()`
  helper's pattern for the same class of problem elsewhere in the same file,
  which this line had inconsistently not used.

### Verification Performed

| Verification | Result | Evidence |
|---|---|---|
| Live `multi_day` execution after the prompt fix | `routeSummary` returned as `["Hari pertama berfokus pada...", "Hari kedua bergerak menuju..."]` — plain strings | Execution 4532, `Parse Final Copy` output |
| Renderer defensive fix present in both nodes | PASS | Direct source inspection post-deploy |

### Acceptance Criteria Results

| Criterion | Result | Evidence |
|---|---|---|
| No `[object Object]` can reach rendered HTML from this field | PASS (renderer defensive fix) + PASS (prompt/validation fix observed live) | See above |

### Remaining Limitations

- The validator has not yet been exercised against a live response that
  *fails* it (every live run since the fix produced correctly-shaped
  `routeSummary`) — only the acceptance path is proven live. The rejection
  path (`FINAL_COPY_ROUTESUMMARY_SHAPE_INVALID`) is proven by code inspection
  only. Low risk given it mirrors the already-live-tested `required` gate
  pattern, but worth a deliberate negative fixture later.
- `highlights` (`{icon,title,note}`) is not similarly hardened against a
  wrong shape — it happened to render correctly in every live test this
  session because `highlight.title||''` / `highlight.note||''` already
  degrade safely (empty string, not `[object Object]`) even if the model
  sends something unexpected, unlike the route-stop line before this fix. No
  change required, noted for awareness only.

### Process note (for the audit trail, not a product defect)

A separate CP005 fix (unvalidated repair-loop shape checking, see CP005's
revision log) was **accidentally reverted** partway through this same
session: it was built from a workflow snapshot fetched *before* that fix had
been applied, then written back via a full-workflow `PUT`, silently undoing
it. Caught by a live test regression (`multi_day` accepting a wrong-shaped
repair again) and reapplied from a freshly-fetched snapshot, then verified
node-by-node that every fix from this session was present simultaneously
before testing again. Lesson: when making several sequential `PUT`s against
the same workflow via direct REST API (without n8n-mcp's transactional
`update_workflow` operations), always re-fetch immediately before building
the next payload — never reuse an earlier in-memory/on-disk snapshot.

## Revision: 2026-09-06 - Close `routeSummary` Validator Hole and Restate Icon/Shape Contract

### Revision Plan

`plans/cp006-cp009-cp010_revision-plan_output-completeness-and-render-contract.md`

### Reason for Revision

User reported the rendered brochure looked thin. Investigation of real
execution data (not a claim from reading source) showed the AI output was
actually rich and complete, but `overview.routeSummary` arrived as a bare
**string** in the `full_day` run (`exec_full_day_final.json`) while arriving as
a proper array in the `multi_day` run — and `Parse Final Copy`'s own validator
had a logic hole that let the string through silently:

```
const routeSummaryOk=!parsed||!parsed.overview||!Array.isArray(parsed.overview.routeSummary)||parsed.overview.routeSummary.every((s)=>typeof s==='string');
```

`!Array.isArray(string)` evaluates to `true`, which short-circuits the whole
`||` chain to `true` regardless of the `.every(...)` clause — so a string
`routeSummary` was always accepted as valid. Downstream, `renderOverview`'s
`Array.isArray(...) ? ... : []` guard then silently dropped the entire Route
line for the `full_day` brochure. Separately, `overview.highlights[].icon`
returned emoji (`🌾`, `🍽️`, `🚶`, `🏛️`, `🎨`) instead of one of the 7 controlled
values the renderer's `ICONS` map understands, so every highlight fell back to
the same generic icon — confirmed by inspecting the icon arrays in both
`exec_full_day_final.json` and `exec_multi_day_light_final.json`.

### Changes Made

- `Parse Final Copy`: `routeSummaryOk` rewritten to
  `!(parsed&&parsed.overview)||(Array.isArray(parsed.overview.routeSummary)&&parsed.overview.routeSummary.length>0&&parsed.overview.routeSummary.every((s)=>typeof s==='string'))`,
  closing the hole — a non-array now fails this check and is rejected with the
  existing `FINAL_COPY_ROUTESUMMARY_SHAPE_INVALID` code instead of passing
  silently.
- `Build Final Copy Request`: `routeSummary` instruction extended to state
  explicitly it must never be *"a single combined string or paragraph"* and
  that each stage is its own array element; `highlight.icon` instruction
  extended to state the 7 allowed controlled values explicitly and forbid
  emoji.
- Renderer defence in depth (CP009/CP010, same revision): `renderOverview`
  now splits a string `routeSummary` into sentence-boundary stages instead of
  dropping it, and `icon()` gained an emoji-to-controlled-key map plus a
  keyword fallback, so even a non-compliant response degrades gracefully
  instead of losing the section or collapsing every icon to one.

### Verification Performed

| Verification | Result | Evidence |
|---|---|---|
| Regex/logic fix unit-verified before deploy | PASS | Hand-traced truth table for the new expression against string/array/absent cases |
| All prior fixes present simultaneously before live test | PASS | String-contains check across `Render HTML`, `Guide Layout`, `Parse Final Copy`, `Build Final Copy Request`, `Parse Skeleton Result`, `QA Gate`, `Travel-Time Guard` |
| Live run, all 4 modes | PASS | Executions 4931 (full_day), 4932 (half_day), 4933 (multi_day), 4936 (destination_guide) — `qaOk: true` in all four |
| Route line renders for every mode | PASS | Rendered HTML/screenshots for all 4 modes show a populated Route line |
| Highlight icons visually differentiate | PASS | `exec4931`/`exec4933`/`exec4936` screenshots show distinct icons (car, star, fork/knife, compass, bed) per highlight, not one repeated icon |

### Acceptance Criteria Results

| Criterion | Result |
|---|---|
| A string `routeSummary` is rejected by `Parse Final Copy` | PASS (logic verified; not yet observed live rejecting an actual live string response post-fix, since post-fix live responses all returned arrays — see Remaining Limitations) |
| Route line renders whether the model returns an array or (pre-rejection) a string | PASS, renderer-side tolerance confirmed |
| Highlight icons differentiate | PASS |

### Remaining Limitations

- Same limitation class as the prior revision: the rejection path
  (`FINAL_COPY_ROUTESUMMARY_SHAPE_INVALID` actually firing on a live string
  response after the fix) has not been observed live, because every live run
  after deploying the prompt clarification returned a compliant array. The
  acceptance path is proven live; the rejection path is proven by direct logic
  verification only.
