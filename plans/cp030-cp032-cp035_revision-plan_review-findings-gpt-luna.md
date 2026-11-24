# CP030–CP032 / CP035 Revision Plan: Review Findings for GPT Luna

## Reason for Revision

Code review of the current working tree found four reproduced bugs and three additional hypotheses across the editor, import API and SQLite persistence. Passing historical tests and completion statuses do not establish that these scenarios work. This plan addresses the seven findings without rewriting previous completion evidence.

Date: 2026-11-20. Status: **completed for all seven reviewed findings; phases 1–6 executed in the owner's serial requests**. Executor: GPT-6 Luna. No automatic commit or push.

## Clarifications and Decisions

- Owner requested a revision plan for GPT Luna after asking for review only, not fixes.
- Structured clarification: **all seven findings**. F01–F04 require fixes and regression tests. F05–F07 require reproduction first; do not change behavior merely because a hypothesis sounds plausible.
- Use deterministic provider doubles; no paid/live AI requests, external provider checks, deployment, dependency installation, automatic push or unrelated refactoring.
- Local project: `C:\Users\Asus\itenary-generator`; branch at review: `cp032/import-review-hardening`. Recheck branch and working tree before execution. Do not reset or overwrite existing local work.
- Preserve model routing, canonical content, saved drafts and publication artifacts. Do not solve evidence/usage problems by weakening validation or deleting audit records.
- This is a grouped revision plan reusing CP030, CP031, CP032 and CP035, not a new checkpoint. Execute phases serially; historical in-progress checkpoints and dependency exceptions are not accepted or closed by this plan.

## Existing Behavior

| ID | Owner CP | Severity | Evidence and affected code |
|---|---|---|---|
| F01 | CP030; CP031 consumption | High | `src/server/import/intake.ts`, `readSourceLayoutOrNull()` catches missing/corrupt layout as null; `layoutExcludedLines(null, text)` excludes nothing. With `layout-case-08-independent-time-columns.pdf`, dry-run went from 0 accepted activities/4 ambiguous lines to 4 activities/0 ambiguous lines after deleting the layout sidecar. |
| F02 | CP031 | High | `src/server/import/service.ts`, `run()`: usage lives in memory until completion. Mock returned 123 input tokens, 10 output tokens and US$0.02, then draft CAS failed: HTTP 409, DB `status=failed`, `ai_used=0`, token/cost columns null. |
| F03 | CP031 / CP030 retention | High | `service.ts` saves `review.unknownLabels` into current and replay reports; `retention.ts` strips rejected proposals/accepted quotes only. After expiry sweep, synthetic `SECRET_AUDIT_123` remained in `report_json`. |
| F04 | CP035 | Medium | `src/editor/sections/OptionList.tsx` derives custom rows by filtering values equal to presets on every render. Browser: type `Air mineral` in a custom included row; textarea disappears as soon as it matches the preset. |
| F05 | CP032 | Medium, hypothesis | `src/editor/main.tsx`, `open()`: late `latestImport(id)` installs a report without checking current draft ID/request generation. Related fire-and-forget publication reads need the same review. |
| F06 | CP032 / CP035 integration | Medium, hypothesis | `save()` retains raw editing state but stores a normalized snapshot; review callback compares raw objects using JSON.stringify. Empty local rows can be mistaken for concurrent edits after autosave clears dirty. |
| F07 | CP031 / CP032 | Medium, hypothesis | `ImportService.latest()` selects newest operation regardless of status; frontend discards non-completed results. A failed overwrite can hide the last successful import report on reopen. |

Line numbers from chat are navigation hints only: files are changing. Locate the named functions and confirm the current behavior.

### Working-tree baseline

There is existing uncommitted work on real-world import parsing, unknown-label resolution, templates, overnight schedule handling, custom categories, autosave and focus. Relevant existing plans/logs include:

- `plans/cp030-cp032_revision-plan_real-world-text-coverage.md`
- `plans/cp035_revision-plan_stable-custom-inputs.md`
- `logs/cp030-cp032_stage-log_real-world-text-coverage.md`
- `logs/cp035_review-log_stable-custom-inputs.md`

Read these alongside `RULES.md`, `SPEC.md`, `TODOS.md`, and applicable `AGENTS.md` instructions. Record `git status`, HEAD and scoped diffs before editing. Do not assume all dirty files belong to this revision or include them in a commit.

## Required Behavior

### F01 — Missing evidence must fail closed

- Text sources may legitimately lack PDF layout. PDF sources must not be treated as ordinary text when their required layout evidence is missing, malformed or incompatible.
- Apply the same decision consistently to dry-run parse, import apply and review resolution.
- Use a stable, actionable error such as `IMPORT_SOURCE_LAYOUT_UNAVAILABLE` with a re-upload message; do not dispatch AI or write a draft when PDF safety metadata is unavailable. Alternatively, preserve a fully unresolved diagnostic result where the existing API contract supports it, but never accept facts from the unverified layout.
- Keep supported legacy-sidecar reconstruction. Do not blanket-reject valid legacy sources merely to pass the missing-layout case.
- Do not confuse missing source text with missing layout. Preserve workspace isolation and safe error messages.

### F02 — Usage survives finalization failures

- Persist cumulative attempted-call usage independently of the draft-write transaction. Do not reset known usage when marking failed/uncertain.
- Record usage immediately after each provider outcome, before merge/validation/CAS. Success must not double-count those totals.
- Unknown cost/token values remain unknown, never zero. An interrupted external call may be uncertain; do not invent exact billing or retry it automatically.
- Replay/fingerprint refusal and repeated reads must not dispatch a second provider call.
- Exercise validation failure, stale revision, operation-completion DB failure and restart recovery. SQLite rollback of draft state must not erase already committed usage accounting.
- Prefer additive use of existing ledger columns. If a schema migration becomes necessary, stop for the required migration decision rather than editing applied migrations.

### F03 — Retention includes all private evidence copies

- Inventory source-derived raw fields in current reports and `_replay.report`, including unknown label names/values, rejected proposals, legacy quotes and any diagnostics embedding source text.
- At expiry remove private raw evidence from each persisted copy; retain safe identifiers, paths, status, decisions, reason codes and accounting where useful.
- Retain canonical itinerary content and necessary original-result/undo snapshots according to their existing draft policies; do not erase legitimate user draft data as a shortcut.
- UI must display an explicit source-expired state without throwing or showing `undefined`. Source-backed resolution must remain unavailable without retained evidence.
- Cleanup is idempotent, workspace-scoped and respects retention=0. Cover partially old/new report shapes and replay responses.

### F04 — Stable custom inputs and preset selection

- A custom row must keep its identity while typing, even if its value equals a preset or a prefix of the desired final value.
- User can type `Air mineral tambahan` continuously, pause at `Air mineral`, backspace, move/delete rows and change presets without losing focus or text.
- Preserve intended ordering and do not move presets to the front merely because a custom row is edited.
- Keep default Indonesian suggestions when language is unresolved, selected-language presets, existing list limits, and canonical array payloads.
- If stable editor-only row IDs/local state are introduced, reconcile intentional record/reload/language changes explicitly; do not sync props on each keystroke in a way that resets the buffer. Do not add UI-only IDs to the canonical schema.

### F05 — Late responses must stay bound to the initiating draft

- Reproduce by delaying A's report request, opening B, then releasing A's response. Assert visible title/report/source/undo belong to B.
- If confirmed, guard response installation using current record identity and request generation or cancellation. A captured `record` variable alone is not a current-state check.
- Audit `finishImport()` publication fetch and closely related asynchronous draft-specific response setters. Limit fixes to demonstrated stale-response behavior.

### F06 — Compare meaningful edits, not normalization differences

- Reproduce: unresolved import conflict → add empty practical row → autosave → resolve conflict. Check whether a revision-conflict banner appears despite no concurrent semantic edit.
- If confirmed, use a request-start edit-generation/snapshot guard or consistent semantic comparison. Preserve the transient empty editing rows while updating actual resolved values.
- Test genuine edits during resolution, including language and writing notes; those must still be preserved. Do not fix false conflicts by unconditionally installing the response.
- Include edit-then-revert and switching records so request-generation checks are intentional.

### F07 — Last successful report remains reachable

- Reproduce: successful import A → failed overwrite B → reopen draft → inspect report/history.
- If confirmed, provide both the last successful applicable report and the latest attempt's failure state, or expose a documented history selector. Do not silently hide the failed attempt to retrieve A.
- Keep undo tied to actual current revision and operation state. Do not resurrect an undone report as actionable. Use deterministic ordering for equal timestamps.
- If the current UI already offers equivalent history/recovery, document the reproduction and close as not reproduced instead of changing the API unnecessarily.

## Proposed Changes

### Serial execution and checkpoints

1. **Entry/reproduction:** verify baseline, dependency/log exceptions, source files and local changes; create focused failing regressions in isolated fixtures. Record F05–F07 as reproduced/not reproduced with actual evidence.
2. **CP030:** implement F01, review and run parser/intake/source-removal gates; append its revision log before proceeding.
3. **CP031:** implement F02/F03 and backend part of F07 if confirmed; review transaction boundaries, restart and retention; append its revision evidence.
4. **CP035:** implement F04 without undoing the previous autosave/focus fix; browser-test all five modes and append stage/revision evidence.
5. **CP032:** implement F05/F06 and UI for F03/F07 as necessary; test actual delayed-response behavior and source expiry.
6. **Chapter review:** inspect final diffs against every acceptance item, run integrated gates, inspect screenshots, reconcile logs/statuses. Do not close unrelated CP033/CP034/CP036 findings.

Use Discuss → Planning → Working → Reviewing → Test → Revising. The scope clarification above is already answered; do not ask again unless a genuine new behavior/migration decision arises. At execution start reopen only the completed CP being revised; preserve unrelated statuses and any explicitly authorized historical exceptions. Do not mark anything in progress just because this plan was written.

### Execution boundary for the current owner request

- Execute phases 1–2 only: baseline/reproduction, then CP030 F01 implementation, review, tests and revision loop.
- Do not start CP031, CP032 or CP035 findings F02–F07 in this session unless the owner separately requests them.
- CP030 is temporarily reopened while F01 is under revision; CP031/CP032/CP035 and other checkpoint statuses stay unchanged.

### Likely files

- BE: `src/server/import/{intake,routes,service,retention}.ts`; inspect `schema.ts` and `src/server/store.ts` but do not assume a migration is required.
- FE: `src/editor/sections/OptionList.tsx`, `src/editor/fields.tsx`, `src/editor/main.tsx`, `src/editor/import/ImportReport.tsx`, `src/api/client.ts`.
- Tests: `tests/web/import-{intake,apply,retention,source-removed}.test.ts`, editor tests, browser harnesses `scripts/web/verify-import.ts` / `verify-stable-inputs.ts` or a dedicated focused harness.
- Docs: API contract, existing CP completion/revision logs and TODO statuses only where supported by evidence.
- No n8n workflows, production data or credentials are involved.

## Impact and Regression Risk

| Change | Risk | Required protection |
|---|---|---|
| PDF missing-layout rejection | Break valid text/legacy imports | Positive fixtures alongside missing/corrupt sidecars. |
| Incremental usage writes | Double counting or swallowed DB errors | Exact totals per attempt, known/unknown cases, injected persistence faults and restart. |
| Evidence redaction | Destroy canonical data or break old reports | Source-only redaction, current/replay report checks, idempotence and legacy fixtures. |
| Stable custom rows | Duplicate state, reorder loss or stale props | Real keystrokes, preset-prefix case, reload/switch/language tests. |
| Async response guards | Suppress valid replies or lose local edits | Delayed A/B responses and positive same-record paths. |
| Latest-report selection | Hide failed attempts or offer wrong undo | Display both states and verify revision/undone constraints. |

Use temporary data roots and injected failures. Do not reproduce against `.runtime` or delete evidence belonging to the owner. Keep the owner's local server/data intact; run browser tests on a separate free loopback port. Avoid running fixture regeneration concurrently with browser tests reading those files.

## Verification Plan

### Baseline and review

- Recheck `git status --short --branch`, scoped diffs and requirements; create a seven-row findings checklist.
- Review the completed change **before** testing: check fail-closed behavior, transaction/rollback semantics, report copies, stale response guards and raw-versus-normalized state.
- Add actual regressions; do not substitute mock helper assertions for API/database/browser behavior.
- Temporary review probes existed at `C:\Users\Asus\AppData\Local\Temp\opencode\audit-engine.mts` and `audit-ui.mts`. They are optional references, not durable tests or a required dependency. Reproduce in committed test fixtures.

### Test matrix

| Finding | Required negative cases | Required positive cases |
|---|---|---|
| F01 | Delete/corrupt/invalidate PDF layout; no accepted facts/provider/draft write | Normal text; valid PDF; compatible legacy PDF layout |
| F02 | CAS conflict after mock billed call; validation/finalization failure; interrupted run | Success totals, multi-attempt sum, unknown usage, replay zero calls |
| F03 | Expired marker absent from DB current/replay report and API responses | Canonical draft preserved; recent source retained; retention=0; other workspace unchanged |
| F04 | Type through exact preset; pause beyond autosave; delete/reorder | Presets and custom entries save/reload in all five modes; locale switch |
| F05 | Delayed A report/publication after B opens | Valid latest response attaches to its own draft |
| F06 | Blank raw row versus normalized saved row creates no false conflict | Actual concurrent content/language/writing edits preserved |
| F07 | Failed attempt after success; equal timestamps; undone report | Last successful report reachable, failed attempt visible, correct undo availability |

### Commands

Use Node >=24. On Windows, follow the existing `npm.cmd exec --yes --package=node@24 -- node "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" run <script>` pattern or an already installed Node 24 executable. Do not change global Node/execution policy.

1. Focused new regression tests, then `test:web-import`, `test:web-editor`.
2. `test:web-store`, `test:web-api`, `test:web-ai`, `test:web-preview`, `test:web-publication`, `test:web-contracts`, `test:web-render` as affected by the changes.
3. `check:web-types`, `typecheck:web-app`, `typecheck:web-server`, `typecheck:web-contracts-v2`.
4. `build:brochure-css`, `build:web-app`, then `verify:web-import` and stable-input/delayed-response browser harnesses with deterministic doubles.
5. Open and inspect screenshots at 390px and 1280px showing the actual affected inputs, reports and expiry/failure states—not just page headers.
6. `build:web-release`, `validate:web-release`, `git diff --check` once integrated changes pass.
7. Record actual commands/results. Linux unavailable is **not verified**, not PASS. No live-AI gate without new explicit authorization.

Do not inflate coverage claims: 12 PDFs retaining one anchor is not proof of complete field/order correctness; repeated-name variations are not independent semantic coverage; a mutation run must fail on the intended assertion, not merely a compiler error or timeout. Historical claims do not replace regression evidence for these seven findings.

## Updated Acceptance Criteria

1. F01–F04 each have a failing-before/passing-after regression with real API/DB/browser evidence and their required positive controls.
2. Each of F05–F07 has a documented disposition: reproduced and fixed, or not reproduced with a specific test and explanation. No invented reproduction or blanket dismissal.
3. PDF evidence loss never promotes ambiguous content into accepted facts.
4. Known attempted AI usage survives failed draft finalization; unknown usage remains unknown; replay never double-dispatches.
5. Expired private raw evidence is absent from all applicable report copies; canonical drafts/undo state and accounting remain intact.
6. Custom inputs retain focus/identity across preset matches and autosave in all five modes; completed values survive reload.
7. A late response cannot attach draft-specific reports/publication state to another draft. Genuine concurrent edits remain safe.
8. Relevant regression/type/build/browser gates pass; visual evidence is inspected and limitations are explicitly recorded.
9. Per-CP revision/stage logs reflect actual findings and results. Only the revised scope can be accepted; unrelated incomplete checkpoints stay unchanged.
10. No automatic commit/push, paid calls or deployment. Present final changed-file summary, finding-by-finding outcome and verification results to owner.

## Rollback

- Keep each fix narrowly scoped and separable from the pre-existing working tree.
- Use scoped patches to revert this revision if needed; no hard reset, clean, broad deletion, migration downgrade or restoration over owner data.
- Do not re-enable permissive PDF behavior to make a failing test pass; report blocked evidence instead.
- If usage or retention persistence fails, preserve diagnosis and canonical data rather than fabricating success.
- Logs preserve original completion history and append corrections; do not rewrite historical PASS claims as if the defects never existed.

## Handoff Prompt for GPT Luna

> Baca `RULES.md`, `SPEC.md`, `TODOS.md` dan `plans/cp030-cp032-cp035_revision-plan_review-findings-gpt-luna.md`. Jalankan revisi tujuh temuan sesuai plan secara serial. Scope sudah dijawab owner: empat bug terkonfirmasi diperbaiki; tiga dugaan direproduksi dahulu. Jangan menimpa perubahan lokal yang sudah ada. Gunakan database sementara dan provider double; jangan memakai AI berbayar, commit/push otomatis atau mengubah data `.runtime` owner. Ikuti Working → Reviewing → Test → Revising sampai seluruh acceptance scope terpenuhi, dengan bukti nyata dan laporan per temuan. Bila muncul blocker, cari solusi dalam scope; tanyakan hanya keputusan material baru yang memang membutuhkan owner. Jangan mengklaim selesai hanya karena test historis hijau.

## Execution Record: Owner-Authorized Phases 1–4 (2026-11-20)

### Phase 1 — Baseline and Reproduction
- Branch/HEAD at start: `cp032/import-review-hardening`, `5c30616`; working tree had pre-existing unrelated edits and untracked files, all preserved.
- F01 reproduced with real generated PDF `layout-case-08-independent-time-columns.pdf`: with sidecar, parse had 0 activities and 4 ambiguous lines; after sidecar deletion, parse accepted 4 activities and no ambiguous lines. Apply returned 201 and wrote the four column entries into the draft.
- F05 reproduced in isolated browser/server: delay A's `latestImport`; open B; deliver B's null response first then A's completed report. UI title stayed `Trip Async B` while A's “Hasil import” report appeared.
- F06 reproduced in isolated browser/server: after empty practical row autosave, the server had normalized `included=[]`; resolving an import conflict advanced revision 2→3 but UI showed `Draft berubah di server` and “local draft changed” despite no semantic user edit.
- F07 reproduced in isolated SQLite/browser: successful import followed by failed overwrite (source expired before apply); latest API result became failed with no report and reopened UI showed no prior successful report.
- All reproduction probes used temporary data roots, local loopback and deterministic/no provider calls; no owner `.runtime` draft was accessed or modified.

### Phase 2 — CP030 F01 Work / Review / Test / Revise
- Added stable `IMPORT_SOURCE_LAYOUT_UNAVAILABLE` (HTTP 409) handling to PDF dry-run, apply, and review resolution when the private layout sidecar is missing, malformed, or incompatible. Apply marks the operation failed and stops before provider dispatch/draft write.
- Valid stale sidecars remain available as diagnostics but exclude every source line from parsing/apply; this conservative behavior is retained.
- Regression tests were first run red (3 failing assertions reproduced the missing-sidecar behavior), then passed after the implementation. Added missing + corrupt dry-run, missing + corrupt apply, resolve refusal, and actual stale-layout parse/apply coverage; verified no provider call or source facts in new draft.
- Review of final F01 diff: source-kind gated, workspace-scoped through existing source rows, safe with text source and valid/legacy PDF sidecars; malformed sidecar maps to stable error; stale sidecar stays fully unresolved. No schema migration or canonical change.
- Verification: `test:web-import` 188/188; `typecheck:web-server` 0 errors; `verify:web-import` PASS for five modes/text/PDF/review/scan/public privacy, 0 external requests, 0 console errors; `git diff --check` PASS.
- Scope boundary: F05/F06/F07 are reproduced and documented only, not fixed in phases 1–2. F02/F03/F04 were not worked in this authorized slice. They remain open for later phases.

### Phase 3 — CP031 F02/F03 and Backend F07 Work / Review / Test / Revise
- F02: persists usage before dispatch as unknown/in-flight and checkpoints immediately after each provider outcome. A final CAS conflict preserves known token/cost totals; a database checkpoint failure leaves the operation `uncertain`, preserves `ai_used`, and blocks redispatch. A multi-batch test verifies cumulative totals, and an unknown retry usage remains null in SQLite.
- F03: retention marks report/replay copies `sourceExpired`, removes unknown-label values, rejected proposal values/quotes, accepted evidence quotes and dynamic activity-title paths; unstructured report prose is cleared as it may embed source text. New repeated-margin layout diagnostics no longer inline the copied text. UI displays an expiry notice and disables source-based decisions when evidence was redacted. Canonical drafts and replay itinerary snapshots are retained.
- F07 backend: `latest` still returns the newest attempt and additionally returns the latest completed, non-undone `lastSuccessfulOperation`, with deterministic createdAt/operationId ordering. Empty failed-attempt reports are null; undone reports are not offered as actionable last-successful data. UI consumption remains phase 5.
- Focused red regressions were added for CAS-loss usage, per-attempt checkpoint failure, retention of all identified private report copies, UI expired report, failed-latest+last-success response, and undone reports.

### Phase 4 — CP035 F04 Work / Review / Test / Revise
- Practical options now use editor-only row IDs/kinds, retain ordering, and do not infer a row's kind from its current text. A custom row remains editable while passing through an exact preset match. Preset selection remains separate; duplicates are not auto-created when explicitly selecting a matching custom value.
- List state reconciles on record/remote changes and language preset changes; serialized data remains canonical string arrays, with no UI IDs or DB migration. Activity category choices remain and arbitrary bounded custom text is accepted/rendered with escaping.
- Browser harness waited through autosave, typed `Air mineral` exactly then continued, checked retained focus, reload, presets, and custom row reordering across activity, half_day, full_day, multi_day and destination_guide.

### Combined Review / Test Evidence for Phases 3–4
- Review confirmed provider accounting checkpoint occurs before draft finalization and after each result, uncertain errors are not changed to failed by outer catch, retention handles current and replay report objects, and last successful response is workspace/itinerary scoped.
- Windows Node 24 tests: import 192, API 13, AI 30, store 12, preview 12, publication 12, contracts 52, editor 34, renderer 15, places 16; all passed. Server/app/contracts typechecks and schema check passed.
- `verify-stable-inputs.ts`: PASS across all five modes. `verify:web-import`: PASS; five modes, text/PDF/review/privacy, zero external requests and console errors. Release build/validation valid; visual screenshots inspected.
- CP031 phase 3 backend scope may close. F07 editor display, F05 stale callback and F06 normalized-versus-local guard remain CP032 phase 5; F01–F07 grouped plan is not wholly complete. CP035 stable-input revision tests pass, but its original home-view and broad screenshot follow-ups remain open; CP035 status is preserved as in progress.

### Final integrated gates (2026-11-20)
- `test:web-import`: 192/192.
- `test:web-api`: 13/13; `test:web-ai`: 30/30; `test:web-store`: 12/12; `test:web-preview`: 12/12; `test:web-publication`: 12/12; `test:web-contracts`: 52/52; `test:web-editor`: 34/34; `test:web-render`: 15/15; `test:web-places`: 16/16.
- Type/schema: `typecheck:web-contracts-v2`, `typecheck:web-app`, `typecheck:web-server`, `check:web-types` PASS.
- Browser: `verify:web-import` PASS (5 modes; zero external requests/errors); `verify-stable-inputs.ts` PASS (5 modes; list autosave/focus/reload, exact-preset text continuation, order, category save/reload).
- Release: `build:web-release`, `validate:web-release` status valid. `git diff --check` PASS. No paid AI, commit, push or deployment.
- Visual: opened screenshots for custom practical list at 390px and activity category at 390px/1280px; no input clipping observed.
- Linux was not run; WSL unavailable.

### Phase 3–4 implementation disposition
- F02 now reserves unknown usage before dispatch, persists each provider attempt result, preserves totals through CAS/finalization errors, and marks uncertain/no-replay when post-call accounting cannot be persisted.
- F03 retention removes source-derived label/value/proposal/evidence/path/free-prose from current and replay reports, marks source expiry, and the UI explicitly disables review actions against redacted source. Canonical/replay itinerary content remains intact.
- F07 backend returns newest attempt plus last successful non-undone result separately. CP032 UI has not yet been updated to consume both.
- F04 list rows carry editor-only stable row identity/kind; exact preset match does not remove an in-progress textarea; order/reload/preset selection are tested. Custom category remains bounded and escaped.
- Phase 3 CP031 and phase 4 CP035 scoped changes are verified. CP035 remains `in_progress` for pre-existing home-view/screenshot follow-ups. CP032 is reopened for F05/F06 and F07 UI phase 5.

## Phase 5 boundary after earlier owner request (superseded)
- F05, F06 and the F07 **UI** remain unresolved and are not part of the current request. CP032 is reopened/in progress. F07 API backend is ready via `lastSuccessfulOperation`; the editor still needs to show it and latest failed-attempt state.
- CP031 phase 3 is closed. CP035 phase 4 behavior is tested, but CP035 remains in progress for its prior home-view/screenshot follow-ups.

## Phase 5 — CP032 UI Work / Review / Test / Revise (2026-11-20)
- F05: `open()` now uses a draft-load generation guard before installing GET/publication/version/latest-import responses; latest-import loading is non-blocking so the user may switch records while it is pending. The `finishImport()` publication callback is similarly bound to active record/generation.
- F06: review response compares `normalizeBlanks(localDraft)` to the saved base plus language/writing metadata. If the only difference is transient blanks, server review deltas overlay onto raw local state and preserve those inputs. Genuine content/language/writing edits trigger the conflict-preservation path.
- F07: when opening, editor chooses `lastSuccessfulOperation` for the review report and stores `operation` as `latestAttempt`. A notice identifies newer failed/uncertain/running/undone attempts. When no success exists, a standalone status notice is displayed. Closed reports remain dismissible.
- Browser race harness `scripts/web/verify-import-review-races.ts` now asserts delayed A report never appears on B, normalized blank row causes no false conflict, real title/language/brief edits survive while resolve/autosave race, and a failed newer attempt displays with the previous successful report. It additionally runs source retention and confirms the expired UI has no raw value or active source-choice button. Result: PASS, 0 external requests.

## Phase 6 — Final Chapter Review / Test / Revising (2026-11-20)
- Re-reviewed async generation guards, semantic-vs-raw merge, SQL usage checkpoint sequencing, report/replay privacy, undone/latest-success semantics, stable custom input identity/order, category bounds/escaping, and scope/status logs.
- Final tests after implementation: import 192, API 13, AI 30, store 12, preview 12, publication 12, contracts 52, editor 34, render 15, places 16; all pass. Types/schema/build/release validation pass.
- Final browser: `verify:web-import`, `verify:web-import-review-races` (F05/F06/F07/F03 expiry), and `verify:web-stable-inputs` all pass. 390px and 1280px screenshots were opened and inspected.
- All seven findings F01–F07 have a code/test disposition in this revision. No paid/live provider, migration, dependency install, commit, push or deploy.
- Status: CP030/CP031/CP032 revision findings are closed and may be marked completed. CP035 stays `in_progress` for its pre-existing home-view/screenshot follow-ups; CP033/CP034/CP036 and the separate real-world-coverage revision remain unchanged. Linux not run (WSL unavailable); no cross-platform claim.
