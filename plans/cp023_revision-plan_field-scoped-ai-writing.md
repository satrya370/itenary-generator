# CP023 Revision Plan: Field-Scoped AI Writing

**Date:** 2026-10-07. **Status:** completed; executed and verified 2026-10-07 (see appended CP023 revision log).
**Depends on:** CP021 revision completed and logged; CP022 historical completion.
**Authority:** `SPEC.md`, `RULES.md`, `TODOS.md`; review `../logs/cp021-cp023_review-log_bug-and-evidence-audit.md`.

## Reason for Revision

Chapter review is **REVISE**. Historical live results are real: 12 completed operations/12 attempts for six locales cost US$0.001361. However, success-count tests and selected-field browser assertions miss contract/accounting/context defects, while the completion log overstates some verification coverage.

- F23-01: completed-operation replay omits required `target` (in-memory probe confirmed).
- F23-02: HTTP-202 pending is cast to a complete suggestion by the client, while the editor dereferences `target`.
- F23-03: HTTP-200 output without usage becomes zero tokens/unknown cost, then is settled as free (stubbed HTTP probe confirmed).
- F23-04: language proposal eligibility checks saved revision but not intervening unsaved edits.
- F23-05: harness fixture title lookup/create mismatch, unsafe target indexing, restart-rate history and incomplete interruption evidence.
- F23-06/07: default rate, interrupted-running recovery, HTTP adapter, full canonical field-diff, mobile interactions, spot Apply, language confirmation and credential-missing tests/evidence are incomplete.
- F23-08/09: mandatory log headings missing; conflict-code documentation differs from code; fresh vs replay results are indistinguishable. Already-fixed panel/harness failures need regression evidence, not speculative reimplementation.

## Clarifications and Decisions

- Structured Ask Question 2026-10-07: user selected **“Bug + gap (Recommended)”**. Create separate CP021/CP023 plans; execute sequentially, no parallel CPs.
- This request authorizes planning. Do not start implementation, change runtime source or claim a completed revision in this task.
- Keep exact model `openai/gpt-6-luna`, daily default 30, rate two new operations/minute, one inflight, manual Apply/Save and total live-test ceiling US$2.
- Use deterministic provider/HTTP doubles for failure/race cases. Reuse existing live ledger/operation IDs for replay verification; do not reset budget or make a fresh paid 12-case matrix by default.
- Distinguish complete/pending/error responses explicitly. Waiting/rechecking an operation must not create a new operation ID or a second provider dispatch.
- Missing/invalid usage is unknown billing, not evidence of zero cost. Conservatively keep reserved committed cost; known provider-reported zero cost remains distinguishable from absent usage.
- Original implementation plan and completion history remain untouched. Current chapter is not ACCEPT until revised evidence passes re-review.

## Existing Behavior

- `service.ts:185,190`: fresh success contains target; replay contains text/locale/usage/replayed but lacks target. Both replay paths (early lookup and transactional race) use the same helper.
- `service.ts:191,274,282`: duplicate inflight request returns 202; `client.ts:14–21,36–37` casts it as `AiSuggestionDto`. Editor at `main.tsx:242` assumes a target exists.
- `provider.ts:79–80` defaults absent counts to zero; `service.ts:35–37,244–245` settles the resulting zero and removes reserved cost. Model request-fee/other billing components are not represented by current pricing shape; this is an upper-bound verification gap, not evidence of extra charges in the recorded matrix.
- `main.tsx:140,208–231`: language proposals do not capture edit generation and are not cleared by brief/note edits.
- Live fixture search uses a title different from create. Results are written only after the loop; startup scheduling does not consider prior rate-window history. Result summary does not record replay status.
- Browser harness executes at desktop width, takes a final mobile screenshot and checks selected strings, not whole-document target-only changes. AI API tests restart a settled operation; they do not demonstrate interrupted-running recovery or default two/minute rate enforcement.
- CP023 log lacks five required headings; API docs use `OPERATION_CONFLICT`, actual service uses `AI_OPERATION_CONFLICT`.

## Required Behavior

- Fresh, replayed and restart-replayed complete responses have the same required identity/revision/locale/target/text/usage contract. Pending is never rendered/applied as a suggestion.
- Idempotent duplicate/pending/replay/uncertain requests do not dispatch again or increment daily usage twice. Fingerprint mismatch remains an explicit conflict.
- Dispatched requests with unavailable billing metadata retain conservative budget commitment across restart/replay. Cost/token parsing rejects non-finite/negative/invalid values; absence is distinct from measured zero. Known actual costs reconcile once.
- Language proposals are bound to itinerary/revision/local edit generation; brief/notes/locale changes or late responses invalidate them.
- Harness fixture reuse and target selection are deterministic; malformed fixtures fail with a safe diagnostic before provider dispatch, not a TypeError. Resume respects persistent rate limits and preserves partial evidence.
- Full canonical snapshots prove Generate/Discard/stale are inert and Apply changes exactly the requested string, with manual Save required. Both mobile and desktop interactions, activity/spot and language confirmation are exercised.
- Logs use mandatory headings, separate historical/live/double/replay evidence, and record only executed tests. No chapter ACCEPT is implied by a historical completion log.

## Proposed Changes

### 1. AI response contract and operation lifecycle

1. After CP021 revision closes, mark only CP023 `in_progress`. Reproduce the current replay and pending contract gaps with API/HTTP doubles before fixing.
2. Include stored operation kind/target kind/target ID in the replay result (extend the row type minimally). Share response construction if that is the smallest way to keep fresh/replay parity. Keep post-generation revision/target checks and fingerprint conflicts.
3. Model 202 pending separately in client types/control flow. Display a pending state; if rechecking is needed, use the same saved request/operation ID with bounded waiting, not a new Generate operation. Malformed 2xx bodies produce an actionable safe error rather than a target dereference.
4. Verify concurrent same-ID requests through both replay paths: one provider call, pending while running, complete after settlement, stable target and cost; test overview/activity/spot and restart replay.

### 2. Billing, provider and recovery invariants

5. Validate provider cost/token presence and values. Carry an explicit unknown-usage state rather than coercing missing counts into measured zero. For dispatched requests with unknown cost, preserve the conservative reservation and uncertainty; whether copy can still be offered must be explicit in the response/log, without treating billing as settled or permitting redispatch.
6. Verify the worst-case reservation covers the enabled request, maximum input/output/reasoning usage and any applicable request fee. Web search/tools remain disabled. If a relevant fee or upper bound cannot be established, stop before paid dispatch; do not assume a missing catalog price is zero. Preserve the US$2 ledger and model choice.
7. HTTP-adapter fixtures cover successful output with measured usage, missing/invalid usage, malformed catalog/body, 401/429/503, Retry-After and ambiguous disconnect/timeout. Ensure preflight parsing failures produce controlled unavailable state, not raw exceptions/secrets.
8. Test interrupted-running recovery against copied/temporary databases with both operation and live-budget entries reserved. Restart must mark uncertainty once, retain cost/usage invariants and never replay inference. Test default rate ceiling and quota concurrently, using bounded clock/test seams or seeded timestamps, not a paid run.

### 3. Editor guards and meaningful browser evidence

9. Bind language proposals to current itinerary/revision/edit generation; invalidate on relevant edits and ignore late responses after local changes. Confirmation never translates existing manual fields.
10. Verify Generate/Apply/Discard, pending/replay, malformed response, language-confirmation races and credential-missing/manual Save at 390×844 and 1440×1000. Include spot description as well as activity and overview. Replace timing-only race assumptions with an explicit controllable provider gate.
11. Compare full canonical snapshots: no changes before Apply or after Discard/stale; after Apply only requested field differs; after Save allow only documented normalization/record metadata differences. Assert names, IDs, times, duration and route explicitly.
12. Assert one AI-status panel, keyboard-accessible actions and no horizontal overflow/uncaught page errors. Count expected failed HTTP responses separately from uncaught application errors. Inspect screenshots in proposal/loading/error states, not just at the end.

### 4. Harness, documentation and evidence closure

13. Give fixtures consistent identity on lookup/create and validate mode/target presence. Keep existing operation IDs and bind replay to its persisted itinerary/target; do not mutate a completed live fixture to force a pass. Check ledger status and history on resume; failed/uncertain operations are recorded rather than automatically rerun with new IDs.
14. Honor the persisted rolling rate window or bounded Retry-After. Save partial/final safe summaries even on validation failure/interruption; record fresh/replayed/pending status and provider-call counts where observable. No credential/raw prompt fields.
15. Add required headings to CP023 log while preserving all original statements as dated history; append the dated executed-revision section per `LOG_TEMPLATE.md`. Correct broad coverage claims with explicit test IDs/assertions and clarify earlier harness errors without inventing failed-run cost attribution. Correct documentation to `AI_OPERATION_CONFLICT`, pending and unknown-usage behavior.
16. Review → test → revise until all findings close. Restore CP023 `completed` only after updated log and acceptance pass; hand chapter back for re-review before CP024.

Affected artifacts: `src/server/ai/service.ts`, `provider.ts`, `schema.ts` only if durable uncertainty needs a minimal migration; `src/api/client.ts`; CP023 sections of `src/editor/main.tsx`; `tests/web/ai*.test.ts`; `scripts/web/verify-ai.ts`, `verify-ai-ui.ts` and targeted harness tests; API/development docs; `package.json` only for necessary verification scripts; existing CP023 log and `TODOS.md`. Preserve Tailwind v4 and current UI patterns. No n8n/Laravel/publish/renderer feature work.

## Impact and Regression Risk

- Shared editor/client changes may regress CP022 Save/conflict/repeater behavior; run its tests/browser verification. Do not introduce autosave or broad refactoring.
- A pending handler can accidentally generate a fresh ID and double-charge; assert dispatch count and daily/ledger deltas, not only HTTP status.
- Conservative unknown billing can retain more allowance than actual spend; label it uncertain, not provider-reported actual. Reconcile only with evidence, once; do not shrink it after restart.
- Recovery tests must isolate data. Read the live ledger only; if a schema migration is necessary, verify a stopped full-root copy first and preserve original ledger/operation IDs.
- Detector results remain heuristic; this plan does not lower thresholds, expand catalog support or claim universal fact checking.
- Twelve historical live successes remain evidence of inference, not proof of today's catalog/pricing or every failure path. Revision checks should reuse results without creating avoidable charges.

## Verification Plan

1. Targeted regression failures before fixes: replay missing target, pending-as-complete, missing-usage zero settlement, stale language proposal and fixture identity/target failure. Source-only findings need executable reproduction before being labeled a reproduced failure.
2. Deterministic API/provider tests: same-ID inflight/replay/fingerprint conflict, all target kinds, restart/interrupted recovery, default rate/quota, missing/invalid billing, malformed HTTP payloads, bounded retries and no new dispatch on ambiguous results.
3. Real Fastify/SQLite/built-editor browser at both viewports: full canonical one-field diff, language confirmation/stale edits, activity/spot, pending/replay, error/limit/unavailable/manual Save, keyboard actions and inspected screenshots.
4. Audit/replay the existing live matrix and compare before/after ledger totals. Historical baseline: 12 settled operations, US$0.001361, US$1.998639 remaining at review. Record replay separately; no fresh paid matrix is required for this revision. If a genuine new inference is needed, document why, preflight current price/capability, reserve within the remaining original US$2 ceiling and stop if that cannot be guaranteed.

```text
npm run check:web-types
npm run typecheck:web-contracts
npm run typecheck:web-app
npm run test:web-contracts
npm run test:web-render
npm run test:web-api
npm run test:web-editor
npm run test:web-ai
npm run build:web-app
npm run verify:web-editor
npm run verify:web-ai-ui
npm run validate
npm test
npm audit --audit-level=moderate
git diff --check
```

The worker must record actual counts and assertion-level evidence, not expected PASS. Run renderer visual/PDF gates only if renderer behavior/artifacts change; such changes require their own scope gate.

## Updated Acceptance Criteria

| ID | Required evidence |
|---|---|
| R23-1 revision | Existing live matrix/ledger is preserved and audited; fresh versus replay clearly identified; fixed model and original US$2 ceiling maintained. |
| R23-2a | Complete response target/revision/locale parity holds for fresh/replay/restart; pending/malformed result cannot be Applied or cause an uncaught error. |
| R23-2b | Full canonical comparisons at both viewports prove Generate/Discard/stale inert; Apply changes one target string only and Save remains explicit, including spot. |
| R23-3 revision | Saved/local language context changes invalidate stale proposals; confirmation/override preserves manual copy; provider/context/errors contain no secret. |
| R23-4a | Missing/invalid billing never releases a dispatched reservation as zero; known usage reconciles once; uncertainty survives restart and replay. |
| R23-4b | Default rate/quota/inflight, duplicate pending, interrupted recovery and bounded HTTP retries have executed tests proving no double dispatch/accounting. |
| R23-5 revision | Unavailable/limited/pending AI leaves manual edit/Save usable; browser lifecycle and visual evidence cover both sizes. |
| Harness close | Correct fixture identity/target guards, resumable safe summaries and persisted-rate handling are verified without resetting live data. |
| Log/process close | Mandatory headings and dated executed revision present; historical omissions are explicit; TODOS/logs agree; chapter re-review required before CP024. |

## Rollback

Revert only intended revision changes after diff inspection; retain original source/user work and logs. If storage migration is needed, stop the engine and back up the full data root first; rollback uses the matching full root, never a DB-only copy or zeroed budget. Never discard committed/uncertain live costs to recover test allowance. Keep revision `in_progress`/`blocked` while any required finding is unresolved, and hold CP024 until chapter re-review accepts.

## Execution Outcome: 2026-10-07

- User requested execution of all revision plans after the audit. CP023 began after CP021's revision log was complete and passed its planned API/provider, browser, rate/recovery, type/build and package/security gates.
- Evidence is appended under `Revision: 2026-10-07 - AI Replay, Billing Safety and Evidence Closure` in `../logs/cp023_completion-log_field-scoped-ai-writing.md`.
- The existing 12 live operation IDs were replayed idempotently: 12/12 replayed, zero fresh inference and unchanged US$0.001361 budget ledger. Chapter re-review is still required before CP024.
