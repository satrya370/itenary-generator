# CP023 Completion Log: Field-Scoped AI Writing

## Result

- Status: `completed`; implementation and evidence are ready for the chapter planner evaluation.
- Summary: Added local language resolution and server-side OpenRouter suggestions for overview/activity/spot descriptions. Suggestions stay separate from canonical drafts until the guide explicitly applies one field and manually saves.
- Completed at: `2026-10-07` (local time).

## Date

- Completed at: `2026-10-07` (local time).

## Plan Reference

- Implementation plan: `../plans/cp021-cp023_implementation-plan_persistent-editor-and-field-ai.md` (§ CP023).
- Revision plan: `../plans/cp023_revision-plan_field-scoped-ai-writing.md` (execution evidence is appended below).

## Changes Made

- Added OpenRouter credential resolution (injected environment value first, optional server-only credential file), safe capability reporting and preflight for the exact `openai/gpt-6-luna` model. Credential values/provider response bodies are not exposed to browser or logs.
- Added local `franc` language detection over saved brief/factual notes, ISO-to-BCP-47 mapping, confidence/mixed-language handling, and explicit guide confirmation. Short/ambiguous inputs and unproven Chinese script return unresolved; explicit locale selection remains supported.
- Added persistent SQLite operations/daily-usage/live-budget ledgers; daily accepted-operation limit, rate and inflight guards, atomic reservation, operation fingerprint/idempotent replay, bounded retries for definite provider rejections, uncertain-dispatch handling and post-provider revision/target checks.
- Added `/language/resolve`, `/ai/overview`, and `/ai/description` routes. Requests cannot supply a model, arbitrary field path or arbitrary context. Context is assembled from the saved draft and scoped to the requested field; output validation rejects malformed JSON, locale/script mismatch, invalid lengths, prices and unsupported opening-hour claims.
- Added editor Generate/Apply/Discard lifecycle. Generation requires a saved draft and resolved locale; stale responses and local edits during generation are rejected. Apply changes only the selected local field and still requires explicit Save. Manual editing remains available when AI is unavailable or limited.
- Added deterministic API/provider tests and `scripts/web/verify-ai-ui.ts`, a production-shell browser verification against temporary SQLite and a deterministic provider double. It covers discard, apply-without-save, manual Save, activity description and local edit during generation at mobile/desktop widths.
- Fixed live harness target fixtures to distinguish scheduled activity and destination-guide spot drafts while reusing stable operation IDs and persistent ledger entries across interrupted runs. Added `--preflight-only` for non-generative credential/model/pricing checks.

## Files and n8n Workflows Changed

| Artifact | Change |
|---|---|
| `src/server/ai/credentials.ts`, `provider.ts`, `language.ts`, `validation.ts`, `schema.ts`, `service.ts`, `src/server/app.ts` | CP023 credential handling, OpenRouter requests/preflight, detection/validation, SQLite operations/usage/budget ledger, routes and guards. |
| `src/api/client.ts`, `src/editor/main.tsx` | AI DTOs, language resolution, suggestion lifecycle, stale-response protection, editor fields. |
| `tests/web/ai*.test.ts`, `scripts/web/verify-ai.ts`, `scripts/web/verify-ai-ui.ts` | Provider/API regression tests; bounded opt-in live test and deterministic browser verification. |
| `package.json`, `docs/editor-ai-api-contract.md`, `docs/standalone-development.md` | AI browser test script and documented runtime/API/live-test behavior. |
| `output/web-ai/` | Ignored live and browser summaries plus desktop/mobile screenshots; no secret or raw prompt evidence. |
| `TODOS.md`, this log | CP023 checklist/status and completion/review history. |
| n8n workflows / Laravel repository | None changed. |

## Verification Performed

| Verification | Result | Evidence |
|---|---|---|
| Exact-model preflight | PASS | Live preflight authenticated `openai/gpt-6-luna`, confirmed catalog listing, `max_tokens` support and current prices (prompt `$0.0000001/token`, completion `$0.0000005/token`, web search `$0.01`). No inference was dispatched by preflight. |
| Live inference matrix | PASS | `npm run verify:web-ai -- --live --budget-usd=2`: 12/12 successful operations, one overview and one description each for `la`, `fr`, `en`, `id`, `ja`, `zh-Hans`. Description targets cover activity (`la`, `en`, `ja`) and spot (`fr`, `id`, `zh-Hans`). Final persisted ledger usage: `$0.001361` of `$2`, leaving `$1.998639`; no budget reset. See `../output/web-ai/verification-summary.json` for operation IDs, statuses, token/cost metadata and lengths. |
| Live-copy review | PASS | Read-only review of all 12 persisted suggestions: output matched the requested language/script and target; concrete guidance (quiet entrance, pace, morning visit, shoes, 90 minutes) was supplied by guide notes or canonical target context. No price/opening-hour or unsupported venue claim observed. No prompt or credential was recorded in the completion evidence. |
| AI API/provider tests | PASS | `npm run test:web-ai`: 16 tests; malformed/wrong-locale/policy output, credentials, language thresholds, quota/budget, restart/idempotency, retry/timeout, stale/deleted targets and inflight guards all pass. |
| Browser AI lifecycle | PASS | `npm run verify:web-ai-ui`: Generate does not mutate canonical content; Discard preserves it; Apply remains unsaved until explicit Save; a local edit during generation invalidates the result; provider failure and daily-limit state are visible; manual edit/save still works after provider failure; no console errors or external requests. Desktop `1440×1000` and mobile `390×844` have no horizontal overflow. Evidence: `../output/web-ai/browser-verification-summary.json`, `../output/web-ai/cp023-ai-desktop.png`, `../output/web-ai/cp023-ai-mobile.png`. |
| Foundation and editor regressions | PASS | `npm run check:web-types`; typechecks for contracts/app; tests: contracts 22, renderer 12, API 7, editor 8. `npm run verify:web-editor` covers all four modes, 14 days, 60 places, save/reopen and both viewport sizes with zero console errors/external requests. `npm run verify:web-render`: 11 fixtures, no overflow/console/external requests. |
| Build/package/security | PASS | `npm run build:web-app`, `npm run validate`, `npm test` (1), `npm audit --audit-level=moderate` (0 vulnerabilities), and `git diff --check` (line-ending notices only). |

## Acceptance Criteria Results

| Criterion | Result | Evidence |
|---|---|---|
| R23-1 — exact-model live success for six locales within US$2 | PASS | Authenticated preflight plus 12 live operations; Japanese and Simplified Chinese inference both succeeded; persistent ledger records `$0.001361` total. |
| R23-2 — explicit suggestion lifecycle and one-field change | PASS | API snapshots prove Generate does not write the draft; browser flow proves Discard is inert, Apply changes only local field state, and Save is required for persistence. |
| R23-3 — language, context and secret boundaries | PASS | Explicit/automatic/unresolved language tests, local detector fixtures, provider output checks and source review; key stays server-only and context comes only from saved guide data. |
| R23-4 — durable limits, idempotency, retry and budget | PASS | Deterministic tests cover quota/rate/concurrency, restart, operation replay/conflict, retry and ambiguous timeout. Live ceiling remained persistent through interrupted invocations and final settlement. |
| R23-5 — manual editing and planner handoff | PASS | Manual editing/save remain usable independent of provider state; logs, API/browser/live evidence and chapter acceptance matrix are complete. CP024 remains pending until planner evaluation accepts the chapter. |

## Deviations from Plan

- The first live harness run exposed that a spot-description fixture had been created in scheduled mode. The fixture selection was corrected and the same stable operation IDs/ledger were resumed. Two invocations were interrupted before completion; already settled calls remained recorded, were not repeated as new operations, and the final 12-case run stayed far below the approved ceiling.
- The UI verification uses the deterministic provider double; actual provider inference is separately verified by the 12-operation live matrix.
- Screenshot review exposed a duplicate AI-status panel in the sidebar; the redundant panel was removed and production build, browser verification, and app typecheck passed again.
- No n8n workflows, credentials, Laravel repo or production deployment were changed.

## Known Limitations and Follow-Ups

- CP021 truncated-PNG finding is recorded in `cp021_completion-log_engine-api-and-draft-persistence.md`; the 2026-10-07 chapter audit created a formal CP021 revision plan. See that executed revision section and `../plans/cp021_revision-plan_engine-api-and-draft-persistence.md`.
- CP023 browser lifecycle uses a deterministic provider double. The 12-operation actual provider matrix is separate evidence; the revision replay uses those same operation IDs and makes no fresh inference calls.
- The chapter remains unaccepted until CP023 revision passes and the planner re-reviews the whole chapter. CP024 remains pending.

## Planner Handoff

CP021, CP022 and CP023 implementation/evidence are complete. Stop before CP024 and evaluate the chapter against the plan. The CP021 PNG follow-up is explicitly surfaced for the reviewer's revision-plan decision.

## Review Addendum: 2026-10-07 — REVISE, Plans Pending Execution

- Review: `cp021-cp023_review-log_bug-and-evidence-audit.md`; user selected **Bug + gap** through structured Ask Question.
- New evidence: completed replay omits `target`; HTTP-200 copy without usage is treated as zero-cost. Pending-response and language-proposal guards also have source-confirmed gaps. Existing passing tests do not cover all promised rate/recovery/browser invariants.
- Read-only ledger audit confirms the historical live result: 12 completed operations/12 attempts, US$0.001361 actual cost. This remains valid inference evidence, not proof that the newly found contracts/accounting gaps pass.
- Plan: `../plans/cp023_revision-plan_field-scoped-ai-writing.md`, after CP021 revision. No runtime fix, test-suite rerun, paid call or executed revision occurred during this planning review.
- The earlier PASS/ready statements describe original verification. Current chapter verdict is **REVISE** and CP024 is held. Log format/evidence corrections and a dated executed-revision section are required at revision closure; this addendum does not claim that closure.

## Revision: 2026-10-07 - AI Replay, Billing Safety and Evidence Closure

### Revision Plan

- `../plans/cp023_revision-plan_field-scoped-ai-writing.md`
- CP021 dependency revision passed first; see the executed revision section in `cp021_completion-log_engine-api-and-draft-persistence.md`.

### Changes Made

- Completed-operation replay now reconstructs and returns its original overview/activity/spot target. The typed API distinguishes `AiPendingDto` from `AiSuggestionDto`; pending responses include retry guidance. The editor polls the exact same request and operation ID within a bounded 45-second window, validates response IDs, and never treats pending as Apply-ready content.
- OpenRouter adapter uses injectable fetch for deterministic HTTP tests, maps malformed catalog JSON to controlled `invalid_catalog` preflight state, and preserves absent/invalid token counts as unknown rather than coercing them to zero.
- Cost reconciliation accepts a finite, nonnegative provider cost (including measured zero), or estimates from catalog prices only when both token counts are valid. Missing/invalid billing after dispatch returns `503 PROVIDER_USAGE_UNKNOWN`, retains the full worst-case reservation as uncertain, and blocks redispatch across restart/replay.
- Language proposals are bound to itinerary, saved revision and edit generation; local brief/draft changes invalidate them and late responses cannot be confirmed.
- Live harness fixture names now match creation/lookup, mode and target identity is checked before dispatch, rate scheduling starts from persistent operation history, and summaries checkpoint each safe result and distinguish fresh/replayed operations. A focused unit test covers restart-window wait calculation. Existing operation IDs and the persistent budget ledger were preserved.
- Expanded API/provider/browser coverage for default rate limiting, pending/replay target parity, restart/interrupted recovery, missing/negative usage, HTTP/catalog parsing, instruction-like notes, delayed language resolution, complete canonical target-only diffs, activity/spot Apply, pending polling, missing credentials and manual Save.
- Corrected API documentation to `AI_OPERATION_CONFLICT` and documented replay/pending/unknown-usage semantics. Completion-log sections now match `LOG_TEMPLATE.md`; original completion and planning-review entries remain historical records.

### Verification Performed

| Verification | Result | Evidence |
|---|---|---|
| AI API/provider/harness regressions | PASS | `npm run test:web-ai`: 28 tests, 28 pass. Includes default two/minute limit and persisted-window wait calculation, concurrent duplicate pending→completed replay, overview/activity/spot target parity, interrupted-running recovery, restart-persistent unknown billing, negative cost, HTTP 401/429/503, malformed catalog/completion, instruction-like notes, retries/timeouts, language and policy cases. |
| AI browser lifecycle | PASS | `npm run verify:web-ai-ui`: full canonical snapshots prove Generate/Discard/stale are inert and Apply changes exactly the requested overview/activity/spot description; Save is required. Same ID is polled after pending; language proposal is invalidated on edit and requires confirmation; provider failure/limit/missing credentials preserve manual editing and Save. Keyboard Enter activates Generate and Apply. |
| Responsive visual/browser review | PASS | 390×844 and 1440×1000 document widths equal viewport; zero console errors/external requests. Sidebar contains exactly one AI status panel. Proposal desktop, pending mobile and error desktop screenshots were opened and inspected. Evidence: `../output/web-ai/browser-verification-summary.json`, `cp023-ai-proposal-desktop.png`, `cp023-ai-pending-mobile.png`, `cp023-ai-error-desktop.png`, `cp023-ai-desktop.png`, `cp023-ai-mobile.png`. |
| CP021 and chapter regressions | PASS | CP021 upload suite 9/9 including malformed image/error envelope/files, dimensions/pixel limits, cleanup after DB failure and successful JPEG/PNG/WebP round trips; contracts 22/22; renderer 12/12; editor model 8/8; `npm run verify:web-editor` covers four modes, 14 days, 60 places, both widths and zero console/external requests. |
| Live ledger and operation replay | PASS | Fresh preflight authenticated exact `openai/gpt-6-luna`. Revision harness replayed the existing matrix: **12 successes, 0 fresh inference, 12 replayed, 0 failures**. Budget stayed `$0.001361 / $2` committed (`$1.998639` remaining). `../output/web-ai/verification-summary-revision.json`. No reset or new generation request. |
| Build/type/package/security | PASS | `npm run build:web-app`; `npm run check:web-types`; both typechecks; `npm run validate`; `npm test` (1); `npm audit --audit-level=moderate` (0 vulnerabilities); `git diff --check` (line-ending notices only). |

### Acceptance Criteria Results

| Criterion | Result | Evidence |
|---|---|---|
| R23-1 revision — live matrix and ceiling preserved | PASS | Original 12 inference successes remain historical; revision replay is separately marked 12/12 replayed and 0 fresh; ledger remains `$0.001361` under the original `$2` ceiling. |
| R23-2a — complete/pending response contract | PASS | Fresh/replay/restart response target parity; live server duplicate returns 202 then complete target on same ID; browser pending polling preserves same ID and safely rejects invalid/mismatched bodies. |
| R23-2b — field lifecycle and exact diffs | PASS | Full canonical baseline comparisons at both widths; Generate/Discard/stale do not persist; Apply changes exactly one field; overview/activity/spot covered; manual Save required. |
| R23-3 revision — language/context boundary | PASS | Delayed stale detection is rejected; subsequent French detection requires confirm/save and preserves title; instruction-like notes stay user data; no prompt/key in evidence. |
| R23-4a — billing and recovery | PASS | Missing/negative usage retains the reservation as uncertain through restart; same-ID replay does not dispatch again; valid zero/provider cost and token-estimated paths remain distinct. |
| R23-4b — quota/retry/pending | PASS | Default two/minute, daily quota, one inflight, duplicate pending, interrupted recovery, Retry-After and retry tests demonstrate bounded/no duplicate dispatch and accounting. |
| R23-5 revision — manual editing while unavailable | PASS | Browser test observes provider error, daily limit, missing-auth preflight and successful manual edit/Save afterward. |
| Harness/log/process close | PASS | Fixture lookup/create identity and target guards pass; persistent rate history is honored; partial summaries are safe; fresh/replay distinction, docs/log sections and TODO status are updated. CP024 remains pending planner re-review. |

### Remaining Limitations

- No fresh paid inference was used to test missing usage; deterministic HTTP/provider/API doubles verify that branch. The original 12 live outputs remain separate inspected evidence.
- Future per-request fees/tools require updating the preflight reservation upper bound before enabling them. No web-search/tool request is sent; without usable usage or token pricing the reservation stays uncertain.
- The browser provider is a deterministic double. The actual live matrix is the earlier inference run; this revision's provider run intentionally verifies replay only, not a second inference.

## Revision: 2026-11-10 - Guide-centric schema web-2.0.0 (AI paths and UI)

### Revision Plan

`plans/cp019-cp025_revision-plan_guide-centric-schema-and-editor.md` (R2 "AI paths v2", R5 and R6).

### Changes Made

- AI targets use v2 paths: overview writes `summary`, activity descriptions are found under `days[].activities[]`, places under `places[]`; the target kind is `place`.
- Editor: the AI button is now "Buat dengan AI" per field (summary, each activity, each place); the provider check, usage and notes moved into a collapsed "Bantuan AI" panel at the end of the form; the old sidebar box was removed.
- R6: `verify-ai.ts` (live harness) ported to v2 names and types; `verify-ai-ui.ts` ported to the new UI; `tests/web/ai.test.ts` type fix only (`'spot'` -> `'place'`).
- Commits: `86ad1f4`, round-1 fixes `ee2462c`..`e260e92`, `73168be`; R6 commit in the R6 stage log.

### Verification Performed

Run on 2026-11-10: `test:web-ai` 28/28; `verify:web-ai-ui` exit 0 (generate does not change the draft, apply is local until Save, discard keeps the draft, stale results are rejected, pending response polled with the same operation ID, daily-limit and auth error paths); `verify:web-e2e` AI apply-and-save steps. `verify:web-ai` runs only with `--live` (paid provider); it was type-checked but **not run**.

### Acceptance Criteria Results

Plan criterion 9 (US$2 ledger, daily quota unchanged): PASS by the unchanged AI server code and tests. One assertion of `verify-ai-ui.ts` changed on purpose: the old check that the sidebar "Penulisan AI" box exists now asserts that it is gone and that "Bantuan AI" exists in the form.

### Remaining Limitations

- No live provider run after the schema change.
- CP status in `TODOS.md` is not changed by this section; the reviewer decides after the joint review.
