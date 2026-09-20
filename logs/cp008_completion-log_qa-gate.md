# CP008 Completion Log: QA Gate

## Result

- Status: `completed`
- Summary: Added deterministic, mode-aware, fail-closed QA with aggregated
  failure codes and a clean CP009 handoff.

## Decision

- Ask Question option 1 selected: collect all failures in `qaFailures` rather
  than stopping at the first issue.

## Files and Workflow Changed

| Artifact | Change |
|---|---|
| `plans/cp008_implementation-plan_qa-gate.md` | CP008 plan |
| n8n `GRuSSwnW38U1HNgK` | Added QA Gate, validity branch, failure handler, CP009 handoff |

## Verification

| Fixture/check | Result |
|---|---|
| All four modes valid | PASS |
| `Rp 500.000` rejected | PASS (`MONEY_VALUE_FORBIDDEN`) |
| Word `harga` without figure accepted | PASS |
| Ratings/review count rejected | PASS |
| One-line spot description rejected | PASS |
| Guide time `10:00` rejected | PASS |
| Both schedule and spots rejected | PASS |
| Aggregate failure list | PASS (multiple codes retained) |
| Runtime workflow validation | PASS: 54 nodes, 91 connections, 0 errors, 0 warnings |
| Security/state | PASS: inactive; no new secret or credential |

## Known Limitation

Live form/model execution remains deferred while the workflow is intentionally
inactive; deterministic Code-node fixtures cover the new behavior.


## Revision: 2026-09-06 - Fix Actionable-Tip Guard Over-Blocking Legitimate Indonesian Tips

### Revision Plan

`plans/cp008_revision-plan_actionable-tip-guard-over-blocking.md`

### Reason for Revision

Found mid-execution of the CP006/CP009/CP010 output-completeness revision:
`destination_guide` failed QA Gate twice in a row with
`SPOT_ACTIONABLE_TIP_MISSING` on the same spot, even though the tip was
demonstrably actionable ("Simpan kacamata... jangan menyentuh atau memberi
makan monyet, serta ikuti arahan petugas..."). The check is a bare word list
missing several common Indonesian action verbs actually used by the model
("simpan", "ikuti"), matching the exact over-blocking pattern `RULES.md` §11c
warns about by name.

### Changes Made

Extended the word list in `QA Gate`'s `SPOT_ACTIONABLE_TIP_MISSING` regex with
`simpan|ikuti|jaga|waspada|hati-hati|perhatikan|periksa|cek|jangan|pastikan|
tanya|konfirmasi|tunjukkan` and English `check|ensure`.

### Verification Performed

| Verification | Result | Evidence |
|---|---|---|
| Real previously-rejected tip now matches | PASS | Direct regex test |
| Purely descriptive sentence with no instruction still rejected | PASS | Negative fixture per `RULES.md` §11c |
| Previously-passing tip still matches | PASS | Direct regex test |
| Live `destination_guide` re-run after fix | PASS | Execution 4936, `qaOk: true` |

### Acceptance Criteria Results

| Criterion | Result |
|---|---|
| Legitimate Indonesian actionable tips accepted | PASS |
| Non-actionable tips still rejected | PASS |
| No regression on previously-accepted tips | PASS |

### Remaining Limitations

- The word list, while broadened, is still a word list rather than a semantic
  check — another actionable Indonesian phrasing outside this set could in
  principle still be rejected. Lower risk than before, not eliminated by
  construction.

## Revision: 2026-09-20 - Narrow Hours and Ticket Claim Detection

### Revision Plan

plans/cp008_revision-plan_qa-claim-pattern.md

### Changes Made

Replaced the broad HOURS_OR_TICKET_CLAIM regex in the live QA Gate with
separate precise hours and ticket patterns. Limitation phrases containing
“tiket ... tidak dinyatakan ... termasuk” are no longer treated as factual
ticket claims. Explicit clock claims and ticket price/free claims remain
blocked.

### Verification Performed

| Check | Result | Evidence |
|---|---|---|
| Observed limitation phrase accepted | PASS | Direct guard evaluation |
| “buka pukul 08:00” rejected | PASS | Direct guard evaluation |
| “tiket masuk Rp 50.000” rejected | PASS | Direct guard evaluation |
| Workflow graph/settings preserved | PASS | Live workflow 60 nodes; active; settings retained |
| Half-day form submission | PASS | Execution 5413; success; qaOk true; HTML length 23,880 |

### Acceptance Criteria Results

| Criterion | Result |
|---|---|
| False-positive limitation no longer fails QA | PASS |
| Real opening-hour and ticket-price claims fail closed | PASS |
| No credential or external dependency change | PASS |

### Remaining Limitations

- PDF generation, publish-link, and Gmail delivery remain CP011/CP012 scope.
