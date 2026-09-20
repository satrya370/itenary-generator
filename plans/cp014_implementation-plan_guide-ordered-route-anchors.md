# CP014 Implementation Plan: Guide-Ordered Route Anchors

## Objective

Let the guide — who already knows the real route on the ground — dictate the
visiting order per day at input time, and make the pipeline honour that order
deterministically instead of trusting the model's geographic intuition.

This closes the "itinerary doubles back on itself" problem without adding any
external geodata API, by treating the guide's input as the route's ground truth
and enforcing it with a deterministic check rather than a prompt request.

## Clarifications and Decisions

Ask Question gate completed 2026-09-03. Decisions:

| Decision | Answer | Consequence |
|---|---|---|
| Input format | **Day-labelled** (`Hari 1: A, B`) | Guide controls day boundaries too, not just order; block mapping is deterministic and reconcilable against `durationDays` |
| Execution timing | **Plan only, do not execute** | CP014 stays `pending`; no workflow mutation from this plan yet |

Decisions taken inside this plan (recorded here rather than left implicit):

- **New field, not an overload of `mustInclude`.** `SPEC.md` §12 defines
  `mustInclude` as "places the client specifically asked for" — a client
  wishlist, unordered and usually partial. The guide's route is a different
  thing: complete, ordered, and authored by the operator. Overloading one
  field with two meanings would make both unverifiable. New field: `routePlan`.
- **CP014 is a new CP, not three revisions.** The work touches nodes first
  created in CP001, CP003, and CP008, but it delivers one new independently
  verifiable capability (`RULES.md` §2), so it gets one CP ID and one plan.
  Splitting it into three revision plans would fragment a single feature across
  three logs and make the acceptance criteria untestable in isolation.
- **The guide's order wins on sequence; CP005 still wins on feasibility.** If a
  guide-specified order is physically impossible, the travel-time guard must
  still fail it. CP014 must **not** silently reorder the guide's anchors to
  satisfy CP005 — that would defeat the whole point of the field.
- **Enforcement is fail-closed at the QA gate**, matching CP008's existing
  design. A bounded model-repair loop for anchor violations is recorded as a
  follow-up rather than built here.

## Scope

1. New `routePlan` form field on the existing Form Trigger, with a `LIMITS` cap.
2. New deterministic `Parse Route Plan` node producing `routePlanOrdered`.
3. `Build Skeleton Request` (CP003) instructed to treat anchors as a fixed
   ordered spine it may only fill between.
4. New deterministic anchor-order checks in the CP008 QA Gate, with distinct
   failure codes.
5. `SPEC.md` §12 and §9 updated for the new field, parsing contract, and checks.
6. `config/config.json` `LIMITS.routePlan`; `config/itinerary-schema.json`
   extended with `routePlanOrdered`.

## Out of Scope

- Any geocoding / Places / Nominatim integration. Explicitly rejected for this
  CP: the guide's input replaces the need for coordinates in the common case.
  Coordinate-based backtrack detection remains a `TODOS.md` follow-up for the
  "guide left `routePlan` empty" case.
- The public web form that would generate this field with per-day inputs — that
  is the CP015–CP016 chapter.
- Bounded model-repair loop for anchor violations (follow-up).
- Reordering or "fixing" a guide's route. The system reports, it does not
  overrule.

## Current-State Findings

Verified against the repository, not assumed:

- `config/itinerary-schema.json` and `SPEC.md` contain **no** coordinate fields
  (`lat`/`lng`) anywhere. There is no geographic ground truth in the pipeline
  today.
- Route order today comes entirely from the model in CP003
  (`Build Skeleton Request` → `Parse Skeleton Result`). Nothing downstream
  checks whether the order is geographically sensible.
- The only existing route sanity mechanism is CP005's travel-time guard, which
  reads hard rules from `config/travel-rules.json`. That file is a hand-seeded
  list of known-bad pairings (Bali only per `TODOS.md`), so it catches
  *previously enumerated* impossibilities, not arbitrary backtracking.
- `config/config.json` has a flat `limits` map; `mustInclude` / `mustAvoid` are
  capped at 3000 chars. `routePlan` must follow the same pattern.
- CP008's QA Gate already aggregates all failures into `qaFailures` with
  distinct codes (per its completion log) rather than stopping at the first —
  new codes plug into that existing shape.
- `TODOS.md` currently lists CP001–CP013; the highest ID in use is CP013, so
  CP014 is free.

## Proposed Changes

### 1. Form Trigger — new field

| Property | Value |
|---|---|
| `fieldName` | `routePlan` |
| `fieldType` | `textarea` |
| `fieldLabel` | "Urutan destinasi per hari (opsional)" |
| `placeholder` | `Hari 1: Tegallalang Rice Terraces, Warung lokal Ubud`<br>`Hari 2: Uluwatu Temple, Pantai Padang-Padang` |
| `requiredField` | `false` |

Optional by design: leaving it empty must preserve today's behaviour exactly.

`config/config.json` → `limits.routePlan: 4000`.

### 2. New node `Parse Route Plan` (deterministic, no AI)

Placed after `Validate and Normalize Input` / mode resolution, before
`Build Brief Request`. A separate node rather than more logic inside CP001's
validator, so it can be verified and revised independently.

Day-marker grammar (accepts Indonesian and English, per D10):

```
/^\s*(?:hari|day)\s*(\d{1,2})\s*[:.\-–]\s*(.+)$/i
```

Parsing rules:

1. Split on newlines; trim; drop blank lines.
2. Split each line's payload on commas into anchor names; trim; drop empties.
3. Collapse internal whitespace; preserve the guide's original casing for
   display, but store a normalised form for matching (see §4).
4. Emit:

```js
{
  routePlanProvided: true,
  routePlanBlockCount: 2,
  routePlanOrdered: [
    { blockNumber: 1, anchors: ['Tegallalang Rice Terraces', 'Warung lokal Ubud'] },
    { blockNumber: 2, anchors: ['Uluwatu Temple', 'Pantai Padang-Padang'] }
  ]
}
```

Mode-aware acceptance:

| Mode | Day labels present | Day labels absent |
|---|---|---|
| `half_day`, `full_day` | Accept only `Hari 1` | Accept — whole input becomes block 1 |
| `multi_day` | Accept | **Reject** `ROUTE_PLAN_MISSING_DAY_LABELS` |
| `destination_guide` | **Reject** `ROUTE_PLAN_DAY_LABELS_NOT_APPLICABLE` | Accept — sets `spots[]` order |

Validation failures (each a distinct code, fail-closed):

| Code | Trigger |
|---|---|
| `ROUTE_PLAN_MISSING_DAY_LABELS` | `multi_day` with no `Hari N:` marker |
| `ROUTE_PLAN_DAY_LABELS_NOT_APPLICABLE` | `destination_guide` with day markers |
| `ROUTE_PLAN_DAY_SEQUENCE_INVALID` | Day numbers not 1..N contiguous, or duplicated |
| `ROUTE_PLAN_EXCEEDS_DURATION` | `routePlanBlockCount > durationDays` |
| `ROUTE_PLAN_TOO_MANY_ANCHORS` | > 12 anchors in one day, or > 60 total |
| `ROUTE_PLAN_EMPTY_AFTER_PARSE` | Field non-empty but yields zero anchors |

`routePlanBlockCount < durationDays` is **allowed**: the guide planned the first
N days and the model fills the rest freely. This must be stated in the CP003
prompt so the model does not treat the short plan as the whole trip.

### 3. CP003 `Build Skeleton Request` — anchors as a fixed spine

When `routePlanProvided`, inject the ordered anchors and instruct, explicitly:

- The anchors are a **fixed order**. Reproduce them in `schedule[]` in exactly
  that sequence, each inside the block number given.
- You **may** insert filler activities (transport, meals, short stops) *between*
  anchors.
- You **may not** reorder anchors, move an anchor to another block, or omit one.
- Blocks beyond `routePlanBlockCount` are yours to plan freely.
- Keep each anchor's name recognisably the same entity. If `outputLanguage` is
  `id` and the anchor was given in English, a natural Indonesian rendering is
  acceptable — do not replace it with a different place.

That last clause is deliberate and interacts with §4 below.

### 4. CP008 QA Gate — deterministic anchor enforcement

For each block with anchors, extract the ordered activity titles from the final
`schedule[]` and assert the anchors appear as an **ordered subsequence**.

New codes: `ROUTE_ANCHOR_MISSING`, `ROUTE_ANCHOR_OUT_OF_ORDER`,
`ROUTE_ANCHOR_WRONG_BLOCK` — aggregated into the existing `qaFailures` array.

**Matching must be normalised, not exact-string.** This is the single highest
risk in the CP and the reason `RULES.md` §11c exists:

- Normalise both sides: lowercase, strip diacritics, strip punctuation, collapse
  whitespace, drop generic locality words (`pantai`, `beach`, `temple`, `pura`,
  `warung`, `rice terraces`/`terasering`, …) into a stopword set.
- Match on token overlap against a threshold, plus bidirectional containment as
  a fast path — **not** equality.
- Rationale: a legitimate run with `outputLanguage: id` can render the anchor
  "Tegallalang Rice Terraces" as "Terasering Tegallalang". An exact match would
  fail a perfectly correct itinerary, and because the gate is fail-closed it
  would block nearly every valid submission — exactly the over-blocking bug
  that shipped in `web-scoping-engine` before it was caught. The verification
  plan below therefore requires a *translated-anchor fixture that is accepted*,
  not merely a violation fixture that is rejected.

For `destination_guide`, apply the same subsequence check to `spots[]`. Where
§4.4 grouping is active, grouping is applied *after* ordering and must preserve
relative anchor order within each group.

## Data Flow or Control Flow

```
Form Trigger (+ routePlan)
  └─ Validate and Normalize Input        (LIMITS, tripScope → mode)
       └─ Derive Palette
            └─ Parse Route Plan          ← NEW, deterministic, fail-closed
                 ├─ invalid → Handle Route Plan Failure (distinct code)
                 └─ valid   → routePlanOrdered / routePlanProvided / …
                      └─ CP002 Build Brief Request
                           └─ CP003 Build Skeleton Request
                                        ← anchors injected as fixed spine
                                └─ CP004 verification → CP005 travel-time guard
                                     (may still fail a guide's impossible day;
                                      must NOT reorder anchors to pass)
                                     └─ CP006 canonical assembly
                                          └─ CP007 photos
                                               └─ CP008 QA Gate
                                                  ← anchor subsequence check
                                                    (normalised matching)
                                                    └─ CP009+ render
```

`routePlanOrdered` must survive every CP handoff that spreads `...item`, and be
present unchanged at the QA gate — the gate compares against the *original*
guide input, never against a model-restated version of it.

## Files and n8n Workflows Affected

| Artifact | Change |
|---|---|
| n8n `GRuSSwnW38U1HNgK` | Form Trigger field; new `Parse Route Plan` + failure branch; `Build Skeleton Request` prompt; `QA Gate` checks |
| `config/config.json` | `limits.routePlan: 4000` |
| `config/itinerary-schema.json` | `routePlanOrdered`, `routePlanProvided`, `routePlanBlockCount` |
| `SPEC.md` | §12 new field; §9 parsing contract + new failure codes; §9.4 new QA rules |
| `TODOS.md` | CP014 row and checklist; move the coordinate follow-up note to reference CP014 |
| `plans/`, `logs/` | This plan; completion log on completion |

No other product directory in this repo is touched.

## Security and Failure Handling

- `routePlan` is free text that reaches an AI prompt, so it is a prompt-injection
  surface. Mitigations: hard 4000-char cap enforced before use; anchors are only
  ever *compared* deterministically downstream, never trusted as instructions;
  and the QA gate's verdict is computed in code, not by the model — a prompt
  injection cannot talk its way past a deterministic subsequence check.
- Anchor names flow into rendered HTML. Confirm the renderer HTML-escapes them
  (the existing renderer path must be checked, not assumed) before shipping.
- All new failures are fail-closed with distinct codes and route to a handler
  that retains generated artifacts; none may mark the run successful.
- No new credential, API key, or external endpoint is introduced by this CP.
- Per-day anchor caps bound both prompt size and QA work; there is no unbounded
  loop introduced.

## Verification Plan

Deterministic Code-node fixtures for parsing and QA, plus at least one live
execution. Fixtures must include the accept-cases, not only reject-cases.

| # | Fixture | Expected |
|---|---|---|
| 1 | `multi_day` 3 days, labelled `routePlan` | Anchors appear in exact given order, in the right blocks |
| 2 | `half_day`, bare list, no day label | Accepted as block 1 |
| 3 | `multi_day`, bare list, no day label | Rejected `ROUTE_PLAN_MISSING_DAY_LABELS` |
| 4 | `routePlan` 5 days, `durationDays: 3` | Rejected `ROUTE_PLAN_EXCEEDS_DURATION` |
| 5 | `routePlan` days 1,2,4 | Rejected `ROUTE_PLAN_DAY_SEQUENCE_INVALID` |
| 6 | `routePlan` 2 days, `durationDays: 5` | Accepted; days 3–5 model-planned |
| 7 | Hand-edited schedule with anchors swapped | Rejected `ROUTE_ANCHOR_OUT_OF_ORDER` |
| 8 | Hand-edited schedule with an anchor deleted | Rejected `ROUTE_ANCHOR_MISSING` |
| 9 | Anchor moved to a different day | Rejected `ROUTE_ANCHOR_WRONG_BLOCK` |
| 10 | **`outputLanguage: id`, anchor rendered "Terasering Tegallalang" for input "Tegallalang Rice Terraces"** | **ACCEPTED** — §11c regression guard |
| 11 | Anchor with different punctuation/casing/extra whitespace | Accepted |
| 12 | `destination_guide` + ordered list | `spots[]` follows the given order |
| 13 | `destination_guide` + `Hari 1:` label | Rejected `ROUTE_PLAN_DAY_LABELS_NOT_APPLICABLE` |
| 14 | `routePlan` empty | Byte-for-byte prior behaviour; no new failure |
| 15 | Guide-ordered day that is physically impossible | CP005 still fails it; anchors not reordered |
| 16 | Live execution, `multi_day` with `routePlan` | Final PDF/HTML shows the guide's order |

Fixtures 10, 11, 14 are the ones that catch the failure mode that has actually
shipped before in this repo; a run that skips them is not verified.

Workflow validation must report 0 errors and 0 warnings, and the workflow must
be left inactive.

## Acceptance Criteria

1. A labelled `routePlan` is parsed into `routePlanOrdered` with correct block
   mapping, for both Indonesian and English day markers.
2. Every parse-validation rule in §2 fires its own distinct code, fail-closed.
3. A completed run reproduces the guide's anchor order exactly, per block.
4. A schedule that violates anchor order, membership, or block placement is
   rejected by the QA gate with the matching code.
5. **A valid run whose anchor names were legitimately translated or lightly
   reworded is accepted** (fixture 10) — the guard does not over-block.
6. `routePlan` left empty reproduces current behaviour with no new failure path.
7. CP005 remains authoritative on feasibility and no code path reorders a
   guide's anchors.
8. Workflow validates 0 errors / 0 warnings and stays inactive.
9. `SPEC.md`, `config/`, and `TODOS.md` reflect the new field and codes.

## Risks and Rollback

| Risk | Mitigation |
|---|---|
| **Over-blocking via exact-match anchors** (the `web-scoping-engine` bug repeated) | Normalised token matching; fixtures 10–11 must pass *before* the CP can be called complete |
| Guide's own route is wrong or impossible | CP005 unchanged and still fail-closed; the system reports rather than silently "fixing" it |
| Prompt bloat on long multi-day plans | Per-day (12) and total (60) anchor caps |
| Model renames an anchor into a genuinely different venue | CP004 verification still genericises unverified names; QA `ROUTE_ANCHOR_MISSING` catches the drop |
| `routePlanOrdered` lost in a `...item` handoff | Fixture 16 asserts presence at the QA gate; add an explicit presence assertion in the gate |
| Guides ignore the field | Field is optional and behaviour is unchanged when empty; the CP015–CP016 web form is what actually makes per-day entry pleasant |

Rollback: remove the `Parse Route Plan` node and its failure branch, revert the
CP003 prompt block and the CP008 anchor checks, and drop the form field. Because
the field is optional and every new check is additive and gated on
`routePlanProvided`, reverting restores pre-CP014 behaviour without touching
CP001–CP013 outputs.

## Execution Status (2026-09-03, closed 2026-09-04)

**Working, Review, and Test phases executed per `RULES.md` §5a. Final result: `completed` — see `logs/cp014_completion-log_guide-ordered-route-anchors.md`.**

**Update 2026-09-04:** the blocker below was an external CP002 bug (invalid
AI model name), fixed the same day — see CP002's revision log. Once
unblocked, live testing surfaced a further pre-existing CP005 defect (repair
loop could corrupt the whole schedule shape, including anchors) — fixed the
same day, see CP005's revision log, including an update to the repair prompt
to state and preserve in-block anchors, closing this plan's own
previously-flagged follow-up. A live execution (4521) then proved this CP's
acceptance criterion 3 with a real AI-generated schedule, `qaOk: true`, zero
`ROUTE_ANCHOR_*` failures. The section below is preserved as-written for the
historical record of the 2026-09-03 blocker.

### What was built (all deployed to `GRuSSwnW38U1HNgK`, workflow inactive throughout)

- Form Trigger field `routePlan` (textarea, optional) — deployed.
- New node `Parse Route Plan` between `Derive Palette` and `Build Brief Request`,
  wired with an error output to `Handle Foundation Error`. Deterministic,
  no AI, matches the day-marker grammar, mode-aware acceptance table, and all
  six failure codes from §Proposed Changes.
- `Build Skeleton Request` updated to inject a `ROUTE ANCHORS` instruction
  block and `routePlanOrdered` into the model prompt when `routePlanProvided`.
- `QA Gate` updated with the anchor-subsequence check (normalised matching,
  `ROUTE_ANCHOR_MISSING` / `_OUT_OF_ORDER` / `_WRONG_BLOCK`, plus a
  `ROUTE_PLAN_DATA_LOST` guard for handoff loss).
- `config/config.json`: `limits.routePlan: 4000`.
- `SPEC.md`: new §12.1 and §9.2a, plus a new §9.4 integrity bullet.

### Two deliberate deviations from this plan (recorded, not silent)

1. **`config/itinerary-schema.json` was not changed.** Re-reading it during
   execution showed it is the `canonicalItinerary` **rendering** schema
   (`additionalProperties: false`), not an intake-state schema.
   `routePlanOrdered` is never rendered — it is consumed by CP003's prompt and
   CP008's QA check only. Adding it to the render schema would be scope creep
   with no consumer. The "Current-State Findings" section above did not catch
   this distinction before the plan was written.
2. **No separate "Handle Route Plan Failure" node was added.** Tracing the
   actual wiring around `Validate and Normalize Input` showed CP001's own
   validation failures use no dedicated handler either — they return
   `{ok:false, errorCode}` and cascade through the existing
   `if (item.ok !== true) return [{json:item}])` guards already present in
   every downstream Code node. `Parse Route Plan` follows the same convention
   for consistency, rather than introducing a second error-handling shape
   found nowhere else in this workflow.

### Verification performed

| # | Method | Result |
|---|---|---|
| Fixtures 1–6, 12–14 + 2 extra | Local deterministic replay of the deployed `Parse Route Plan` code (`output/cp014-test-parse-route-plan.js`) | 11/11 PASS |
| Fixtures 7–11 + 3 extra | Local deterministic replay of the deployed QA Gate anchor-check logic (`output/cp014-test-qa-anchor-check.js`) | 8/8 PASS — **including fixture 10, the translated-anchor accept case** |
| CP003 prompt injection | Local deterministic replay of the deployed `Build Skeleton Request` code (`output/cp014-test-build-skeleton-prompt.cjs`) | 5/5 PASS |
| Live execution 4476 | Real form submission through the actual n8n workflow (`executionMode: manual`) | `Parse Route Plan` node output confirmed correct: `routePlanProvided: true`, `routePlanBlockCount: 3`, anchors matching the 3-day input exactly |
| Workflow validation | `update_workflow` response after every operation | `validationWarnings: []` throughout; 60 nodes; `active: false` confirmed via `get_workflow_details` both before and after |

### The blocker

Execution 4476 stopped at `Handle Brief Call Failure` — CP002's
`AI Brief - GPT OSS 120B` node returned:
`Invalid model name passed in model=openai/gpt-oss-120b. Call /v1/models to
view available models for your key.`

This is a **pre-existing configuration problem in CP002, unrelated to CP014**.
It was not introduced by this CP and its fix is out of this CP's scope
(`RULES.md` §10 — do not opportunistically expand into another CP's territory).
It does, however, block the one acceptance criterion that needs a real
AI-generated schedule to prove: criterion 3, "a completed run reproduces the
guide's anchor order exactly." Everything upstream of the AI call
(`Parse Route Plan`) and everything that can be verified without a live AI
response (the QA Gate check, the prompt injection) is proven; the link
between them — does a real model actually respect the anchors when
generating — is not yet proven live.

### Next decision

CP014 stays `blocked`, not `completed`, per `RULES.md` §9. To close it:
1. Fix the CP002 model-name configuration (separate, pre-existing issue —
   raise as its own follow-up or CP if not already tracked).
2. Re-run a live execution with the same `multi_day` + `routePlan` payload
   used here.
3. Confirm the final `canonicalItinerary.schedule[]` reproduces the anchors,
   and that `QA Gate` reports `qaOk: true` with no `ROUTE_ANCHOR_*` failures.
4. Only then write the completion log and mark CP014 `completed`.

## Follow-Ups (not part of this CP)

- Bounded model-repair loop for anchor violations instead of fail-closed only.
- Coordinate-based backtrack detection for the `routePlan`-empty case
  (Nominatim first — free, no key, 1 req/s is ample at one lookup per block;
  Google Places only as a paid fallback where OSM coverage is thin).
- Seed `config/travel-rules.json` beyond Bali.
