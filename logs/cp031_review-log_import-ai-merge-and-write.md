# CP031 Review Log: AI completion, merge, write, undo, ledger

Reviewer: Claude Haiku 5.5, same session as the executor. Date: 2026-11-11. Commit reviewed: `5ece6e0`.
**Independence caveat:** the separate reviewer (subagent) was blocked by an auto-mode hook that changes the Agent input. This review was done in the same session. The owner may ask for an independent review.

## Verdict

**ACCEPT after two fixes (R1, R2).** Gates green; both fixes tested; one mutation per fix proves the test bites.

## Gate results (run during review)

| Gate | Result |
|---|---|
| typecheck:web-app, -contracts, -contracts-v2, -server, check:web-types | rc 0 |
| test:web-import | 37 pass (intake 10, parser 10, apply 17) |
| test:web-store 12, test:web-contracts 43, test:web-api 13, test:web-ai 28, test:web-render 14, test:web-editor 33, test:web-preview 12, test:web-publication 12, test:web-places 16 | all pass |
| build:web-app and verify:web-editor | rc 0 |
| build:web-release and validate:web-release | valid, 55 files |

## Probes

| Probe | Input | Before fix | After fix |
|---|---|---|---|
| Segments over the limit | 400 unconsumed lines of 90 characters | 181 sent, 219 lines silently left out, no note | same 181 sent, note "219 baris tidak dikirim ke AI ..." added (R1) |
| Duplicate activity title | "Ubud" on day 1 and day 2, model gives a description for "Ubud" | the description was set on both days | dropped as IMPORT_ACTIVITY_AMBIGUOUS, reported, both stay empty (R2) |

## Findings

| ID | Severity | Where | What was wrong | Fix | Test |
|---|---|---|---|---|---|
| R1 | Medium | `service.ts` run | Unconsumed text beyond 20,000 characters went to the model without any note. The guide could not tell that part was not read by AI. | Note with the count of left-out lines. | "text beyond the 20,000 character limit ..." |
| R2 | Medium | `complete.ts` filterCompletion | A model detail with a title that appears on two days was applied to both activities. | Two matches: dropped as ambiguous, with a report line. | "a duplicated activity title on two days ..." (mutation: removing the guard fails 1 test) |

## Checked and fine

- Zero model calls when the parser reads everything (test).
- Quote guard: the mutation (guard forced to true) fails 2 tests (earlier run).
- Replay of the same operationId does not call the model or create a draft (test).
- Busy: a second import while the first waits answers 409 IMPORT_BUSY (test).
- Interrupted run becomes `uncertain` on restart and is not replayable (test).
- Stale revision in overwrite is refused and writes nothing (test).
- Undo works once, and is refused after an edit (test).
- Writing AI ledger (`ai_daily_usage`) identical before and after an import (test).
- No `as any`, `: any`, or ts-ignore in the new code (scan).

## Open items (not blocking, documented in the stage log)

- Restart recovery tested by inserting a running row, not by a real crash.
- `actual_usd` null when the provider returns no cost.
- Prompt quality on real Indonesian documents is unmeasured (CP032 live run).
- Option matching uses only id and en lists.

## Deviations ruling

The deviations listed in the stage log (no `response_format`, narrower AI scope, no provenance table, no partial drop on invalid draft, overwrite keeps hotel/meals/photo, language kept on overwrite, brief rule) are accepted. Each is a product simplification or a stricter rule than the plan, and none weakens a guard.
