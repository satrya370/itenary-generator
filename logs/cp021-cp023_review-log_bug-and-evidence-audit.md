# CP021–CP023 Review Log: Bug and Evidence Audit

**Date:** 2026-10-07. **Verdict:** REVISE before chapter acceptance or CP024.
**Scope:** Completion logs, relevant source/tests, stored browser/live summaries, and read-only live ledger.
**Decision:** Structured question answered **“Bug + gap (Recommended)”**: separate CP021 and CP023 revision plans, executed sequentially. This review authorizes planning; revision implementation has not started.

## Evidence Checked

- `RULES.md` §§4, 6–9, 13 and `logs/LOG_TEMPLATE.md`.
- CP021, CP022 and CP023 completion logs and the shared implementation plan.
- Upload route/API tests; AI service/provider/client/editor; live and browser verification harnesses; AI API tests.
- `output/web-ai/verification-summary.json` and `browser-verification-summary.json`.
- Read-only query of `.runtime/ai-live-test/engine.sqlite`: **12 completed operations, 12 total attempts, US$0.001361 total actual cost**, ceiling US$2, committed US$0.0013609999999999944 (floating-point representation). No running/failed/uncertain operations in this ledger snapshot.
- Two in-memory source probes: completed-operation replay shape and stubbed HTTP-200 response without provider usage. Neither probe created a draft, altered a ledger or called an external provider.

No test suite/build/browser run was performed in this planning review. Earlier PASS results are historical execution evidence, not new revision verification.

## Findings

| ID | Owner / priority | Evidence and observed behavior | Required disposition |
|---|---|---|---|
| F21-01 | CP021 / medium | Completion log lines 78–82 records a truncated PNG whose metadata could be read but Sharp re-encode failed with HTTP 500. Current `app.ts:170–172` catches re-encode errors and returns 422. `api.test.ts:99–100` asserts only the status. | Formally document the already-present fix, assert `ASSET_INVALID` and absence of persisted asset/files; rerun before closing revision. |
| F21-02 | CP021 / verification gap | Original plan promises file-write/DB-failure cleanup and pixel-limit fixtures. Current seven API tests cover normal upload, invalid/SVG/oversized bytes, restart/restore and orphan cleanup, but do not inject an upload persistence failure or exercise image dimensions/pixel ceiling. | Add narrowly scoped failure/boundary tests; do not call this a reproduced cleanup defect. Ensure storage failures are not mislabeled invalid image. |
| F23-01 | CP023 / high | Fresh suggestion includes `target` (`service.ts:185`), completed replay does not (`:190`). In-memory replay probe returned `hasTarget:false,replayed:true`. Client DTO and editor `findTarget`/`proposalValid` require `target`. Existing replay tests inspect status/replayed/call count, not full shape. | Preserve target and envelope across fresh/replayed responses, including restart; test overview/activity/spot replay and client handling. |
| F23-02 | CP023 / medium | Routes return HTTP 202 `{operationId,status:'running'}` for duplicate inflight operations (`service.ts:274,282`). `client.ts:19–21,36–37` treats every 2xx body as `AiSuggestionDto`; editor accesses `result.target`. | Distinguish pending from complete suggestions; no TypeError or incorrect Apply; reuse the same operation ID when waiting/rechecking. This is a source-confirmed contract mismatch, not a browser-reproduced failure in this review. |
| F23-03 | CP023 / high | Stubbed HTTP 200 with valid copy but no usage returns `{promptTokens:0,completionTokens:0,costUsd:null}` (`provider.ts:79–80`). `costFromUsage` computes zero and `finish` releases the reservation (`service.ts:35–37,244–245`). | Missing/invalid billing metadata must not make a dispatched request free. Preserve conservative committed cost/uncertainty and never redispatch the same operation because usage is missing. |
| F23-04 | CP023 / medium | `resolveLanguage` captures no edit generation; `markDirty` does not clear the language proposal; `acceptLanguage` checks saved revision only (`main.tsx:140,208–231`). An unsaved brief/notes change can leave an old proposal eligible for confirmation. | Bind proposal to itinerary, revision and edit generation/context; invalidate on edits and late responses; test the user flow. Source finding; browser reproduction remains a revision gate. |
| F23-05 | CP023 / medium | Historical live crash used the wrong target fixture; corrected code is present. Remaining mismatch: harness searches title `CP023 live <locale> <target>` at line 80 but creates `CP023 live <locale>` at line 31. Target arrays are indexed without validation at line 104. Resume rate tracking starts empty and ignores operations before restart. | Use stable fixture identity and validate mode/target before dispatch; honor persisted rate history; checkpoint safe results/failure details so an interruption can be diagnosed without resetting budget. |
| F23-06 | CP023 / evidence gap | Sixteen AI tests pass historically, but current AI API file has no `AI_RATE_LIMIT`, `AI_OPERATION_INTERRUPTED` or pending-202 assertion. The restart test restarts a completed operation, not a dispatched/running one. Provider tests use an `AiProvider` double, not HTTP-adapter parsing/status behavior. | Add real regression evidence for default rate, interrupted recovery, duplicate pending, HTTP adapter and missing billing metadata; retain the existing positive tests. |
| F23-07 | CP023 / evidence gap | Browser harness runs interactions at desktop width; mobile width is set only for final screenshot. It checks selected fields, not a full canonical before/after diff; no spot Apply, language-confirmation or credential-missing scenario. | Verify lifecycle at both sizes, full one-target diff, spot and language flows, pending/replay, unavailable credentials/manual Save. Record assertion-level outcomes. |
| F23-08 | CP023 / documentation | Log lacks five mandatory headings: `Date`, `Plan Reference`, `Files and n8n Workflows Changed`, `Deviations from Plan`, `Known Limitations and Follow-Ups`. Live summary lacks fresh/replay flags. API contract documents `OPERATION_CONFLICT` while implementation emits `AI_OPERATION_CONFLICT`. | Add missing headings without deleting original content; append dated executed-revision evidence only after verification; correct contract/evidence labels and distinguish recorded live inference from replay. |
| F23-09 | CP023 / historical resolved issue | Duplicate sidebar AI panel and Puppeteer `.first()` misuse were corrected during original execution. Current sidebar has one panel and browser click helper uses DOM matching. | Reverify the single panel and working harness; no second replacement implementation is necessary. |

## Completion Log Assessment

- **CP021:** mandatory headings present. PNG follow-up honestly says the fix was made without a formal revision plan; this review now requires formal CP021 revision/reverification. Preserve that chronology.
- **CP022:** mandatory headings present; references CP021 follow-up consistently. No standalone CP022 revision is proposed from this audit. AI changes in the shared editor remain CP023 ownership; run CP022 regressions.
- **CP023:** live matrix count/cost matches stored summary and read-only ledger. These are valid historical results, but they do not prove pending/replay shape, unknown-cost accounting, interrupted recovery or a full mobile lifecycle. Broad PASS/ready statements must not be used as current chapter acceptance until the revision evidence closes these gaps.
- **Historical failures:** missing `RecordDto` import, wrong-mode target crash, Puppeteer API misuse and duplicate panel were fixed in the prior session. Existing logs do not retain all failed command outputs; reconstruct only what the available record supports. Do not invent exact interruption counts or billing attribution per aborted invocation.
- SQLite experimental warnings and Git LF/CRLF notices are not failing assertions; do not create a revision solely to silence them.

## Revision Disposition

1. `plans/cp021_revision-plan_engine-api-and-draft-persistence.md` — formalize and reverify PNG/error/storage invariants.
2. `plans/cp023_revision-plan_field-scoped-ai-writing.md` — fix remaining AI contracts/accounting/context guards and strengthen harness/evidence/logging.
3. Execution order: CP021 revision → CP023 revision → chapter re-review. One `in_progress` CP. CP022 keeps its historical completion; CP024 remains pending.
4. Plans are pending execution. Historical completed statuses/logs remain as original records; they do not mean the revisions passed or the chapter is ACCEPT.
5. No credentials read, no paid calls, no DB reset, no runtime-code changes in this planning task. Original implementation plan remains untouched.

## Disposition After Revision Execution: 2026-10-07

| Finding | Disposition | Executed evidence |
|---|---|---|
| F21-01/F21-02 | Closed | CP021 revision section: malformed image code/files, JPEG/PNG/WebP, axis/pixel limits, injected DB failure cleanup and API/browser regressions pass. |
| F23-01/F23-02 | Closed | CP023 API/provider tests assert target parity and 202 pending→same-ID completion; browser polls with the same operation ID. |
| F23-03 | Closed | Unknown/invalid cost now retains worst-case reservation as `uncertain`; API tests cover absent and negative usage, including restart/replay. |
| F23-04 | Closed | Browser delays language resolution, changes brief, confirms stale result ignored, then verifies fresh French proposal requires confirmation/save without modifying title. |
| F23-05/F23-06 | Closed | Live fixture identity/target/rate-resume changes and partial summaries are verified; default-rate, interrupted recovery, HTTP adapter and no-redispatch tests pass. |
| F23-07 | Closed | Browser snapshots prove full target-only diffs for overview/activity/spot, at 390×844 and 1440×1000; proposal/pending/error visuals inspected; manual Save works while provider is unavailable. |
| F23-08/F23-09 | Closed | CP023 log required headings, API docs and revision record corrected; one sidebar AI panel and browser helper are verified. |

Both revision plans were executed in order and appended to their original CP logs. Runtime/test/build/security gates pass; live matrix was replayed as 12/12 idempotent results with 0 fresh inference and unchanged US$0.001361 committed. **Chapter verdict remains REVISE until planner re-review; CP024 remains pending.**
