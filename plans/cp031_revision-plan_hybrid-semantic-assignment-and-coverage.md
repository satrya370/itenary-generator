# CP031 Revision Plan: Hybrid semantic assignment and extraction coverage

**Status:** completed for CP031 backend revision; CP032 UI follow-up remains separate. CP033–CP036 deferred and unchanged.

## Reason for Revision

The 2026-11-23 hybrid review found that evidence existence is not enough to prove a field's meaning or owner. Live smoke results showed source-backed instructions could be assigned to the wrong global field, AI-ignored lines could disappear from review accounting, and text/PDF completions were inconsistent. CP030's focused revision now retains inline activity detail but deliberately leaves same-line target binding to CP031. Existing CP031 guards and safe-merge behavior must be strengthened rather than replaced.

Reference review: `logs/cp030-cp032_review_hybrid-parsing-accuracy_2026-11-23.md` (H01–H03, H05–H07).

## Clarifications and Decisions

- Owner approved **review when global ownership is ambiguous**: summary, closing note, or policy text may be auto-assigned only when its source heading/section or equally strong, validated context supports that destination. An unheaded local rule or activity-specific instruction must not silently become global; if the destination is ambiguous, preserve it as unresolved for review.
- Owner authorized a bounded live Haiku 5.5 smoke test after deterministic mock gates pass. Use synthetic data and an isolated data directory, cap live requests to the smallest useful number (at most two imports: text and PDF), record actual model/provenance when available, tokens and cost, and do not repeat calls just to obtain a preferred answer. No user draft/data.
- CP030 was completed under its focused revision plan. It exposes inline activity details as unresolved text at the same source line; CP031 must bind that span to its source activity only after checking exact source and target ownership.
- CP033–CP036 are deferred for later discussion. This CP031 work is serial; no edits to their code or status.
- The owner's later CP032 request is recorded as a follow-up, not implemented here: show three correct import-format examples. Recommended placement is **below the text input / text-vs-PDF selector**, in a collapsible “Contoh format” section; this keeps examples close to where guides need them and avoids a narrow side column on phones. CP032 should choose and test the final layout.
- Do not commit, push, deploy, add migrations/dependencies, change canonical schema, or change credential files.

## Existing Behavior

- `filterCompletion` verifies JSON shape and literal quotes, but `summary`, `closingNote`, and `policies` share a global quote validator without checking the source's section or semantic scope (H01).
- Activity detail matching uses line ranges after the activity; it cannot safely target an unresolved inline detail on the activity's own line (CP030 follow-up/H06).
- A batch is marked completed when it returns a parseable completion, even if some source units are never applied or rejected. `unsupported` is based on dropped/omitted proposals rather than post-merge source coverage (H02).
- `wholeUnit` requires sentence-terminal punctuation for many facts, even when source structure proves the activity/paragraph boundary (H03).
- Overwrite safety observes pre-AI `parse.unconsumed`; it can retain an old collection or discard accepted activity details even when AI resolved all its units (H05).
- Provider status/preflight reports the writing model; import uses a separate model ID, and extraction usage lacks reliable actual model identity (H07).
- Existing retry/deadline/ledger/replay/undo/evidence-retention protections are present and must remain intact.

## Required Behavior

1. Field/path, source unit and entity/day/activity owner must be validated together. A literal quote alone never authorizes cross-scope assignment.
2. Only source units whose header/structure permits a global path may fill global summary/closing/policy fields. Ambiguous units remain visible for CP032/manual review.
3. Source units with stable IDs, exact text and source line/span are sent to the model with read-only context and explicit allowed destinations. Evidence must cite source unit IDs/quotes; inline same-line detail may attach only to its actual activity.
4. Every substantive unresolved unit receives a final disposition after merge and fitting: applied, pending review, rejected, unsupported, or omitted, with source reference and reason. Provider success and mapping completeness are separate statuses.
5. A sentence without final punctuation can be accepted only when structural boundaries prove the complete unit; never sever negation, condition, exception, date or qualifier.
6. Overwrite preserves old collections only when final source coverage remains incomplete/ambiguous. Completed units must not be treated as unresolved just because they were unresolved before AI; incomplete units must not erase/mix old collections.
7. Preflight and reporting distinguish import model from writing model, credential state from authentication/model availability, requested model from actual response model where available.
8. Existing usage charging uncertainty, retry cap, deadline, batch cap, privacy/retention, idempotency, transaction/recovery, review resolution, revision guard and undo remain correct.

## Proposed Changes

### CP031 implementation scope

- Define a private versioned source-unit/candidate representation at the CP031 boundary, retaining existing API compatibility where possible. Link parser units to deterministic fields and owner IDs. Support CP030 same-line detail only if the unit is an exact suffix/fragment of that activity's own source line and does not overlap accepted title/time evidence.
- Include source IDs, line spans, section, owner/allowed paths, and clearly separated read-only context in model requests. Model output references source IDs, target ID/path, value and quote; server validates the complete relation.
- Add section/owner policy for global text fields. Explicit matching section is accepted; local context cannot be promoted to global fields. Unsupported/ambiguous candidates are recorded without applying them.
- Rework completion validation for structural unit boundaries, qualifier adjacency, quote completeness, duplicate/overlapping evidence and no-double-assignment. Keep conservative rejection when boundary or owner cannot be established.
- Compute final coverage by comparing all substantive source units with the persisted/fit result. Derive batch provider status separately from mapping status; include ignored AI units in the unresolved report.
- Derive overwrite collection safety from final coverage by collection/day and resolved candidates. Preserve old fields only for unresolved/omitted/ambiguous source; retain transaction, revision and undo protections.
- Add import-specific preflight/status and sanitized requested/actual model metadata. Do not claim Haiku from the writing-model preflight. Preserve current import-model routing.
- Keep CP032 presentation changes out of this CP. The three-format-example UI request is only recorded for CP032.

## Impact and Regression Risk

| Risk | Mitigation |
|---|---|
| Strict scope checks lower extraction recall | Keep unresolved candidates visible; measure precision and coverage separately; do not force a destination. |
| Same-line ownership mistaken for a neighboring activity | Bind source IDs from exact CP030 spans and activity source line; reject duplicate titles/overlap/unsupported boundary. |
| Coverage accounting destabilizes old reports | Version/adapter for additive report fields; legacy records remain readable; do not fabricate past evidence. |
| Overwrite deletes user data or retains too much | New/overwrite complete/partial regressions; expectedRevision, transaction, replay and undo gates. |
| Paid live output varies | Mock tests are acceptance authority; at most two isolated live smoke calls as owner-authorized observational evidence. |
| User worktree contains unrelated modifications | Inspect diffs before each edit; change only CP031 files/tests/logs/TODO; never restore/reset broad paths. |

## Verification Plan

1. Reproduce H01/H02/H03/H05/H06/H07 deterministically before implementation; add failing tests without a live provider.
2. Run focused backend/import test files after each implementation slice.
3. Review final code against this plan and SPEC import guarantees **before** full testing.
4. Run full `test:web-import`, `test:web-ai`, `test:web-store`, `test:web-api`, `test:web-publication`, and relevant type/schema gates under Node 24. Add mutation/negative assertions for wrong-path acceptance, dropped-unit accounting, owner binding and unsafe overwrite.
5. Run at most two live synthetic imports (one text, one equivalent text-layer PDF) on Haiku 5.5 in isolated temporary storage. Record requested/actual model, source-to-field assignment, unresolved units, usage/cost, API outcomes; no user data. Stop on first contract or semantic failure and report it; do not rerun to chase a pass.
6. Verify no call occurs for deterministic-only inputs or after safety/deadline caps. Check private report redaction/retention, replay/no-duplicate-call, transaction rollback, resolve/revision guard and undo.
7. Append the revision result to existing `logs/cp031_completion-log_split-import-model.md`; update `TODOS.md` only after gates pass. Keep CP032 future UI and CP033–CP036 statuses/scope unchanged.

## Updated Acceptance Criteria

- H01: wrong global/local assignment with a valid quote is rejected or pending, never silently applied.
- H02: every sent but unused unit appears in final coverage/review even if the provider returns valid JSON and the batch is technically complete.
- H03: structurally complete no-period detail can be accepted; incomplete negation/qualifier cannot.
- H05: all-resolved overwrite applies safe data; partial/ambiguous overwrite retains affected old collections with explicit reason; new-draft, edit, conflict and undo paths remain safe.
- H06: exact source-line/target ownership handles same-line detail, duplicate activity names, batch boundaries and global closing prose without cross-assignment.
- H07: import preflight shows Haiku routing/status separately from writing-model readiness; secrets remain private.
- Text/PDF equivalence holds for semantic source mapping and final disposition on labeled synthetic fixtures.
- Mock gates pass, bounded live smoke is truthfully recorded (success or failure), and no H01–H07 P1/P2 finding is silently claimed fixed without a regression.

## Rollback

- Revert only CP031-owned implementation hunks if review/tests expose regressions; preserve pre-existing working-tree changes and CP030 revision.
- If private report compatibility needs a migration or destructive rewrite, stop and ask before implementing it. Do not run migrations on `.runtime`.
- Restore no user data from scratch; use only isolated test data. No deploy/commit/push in this revision.

## Execution Record — 2026-11-23

- H01: global fields now require matching source section; local unheaded prose cannot populate summary/policies/closing note. Ambiguous units remain pending.
- H02: private source-unit IDs and final mapping dispositions distinguish provider batch completion from persisted coverage. Ignored/unmapped units appear in `review.pendingUnits`; applied/rejected/omitted counts are recorded. Source text remains outside the report.
- H03: complete structurally bounded activity detail may omit terminal punctuation; qualifier/continuation and adjacency guards remain.
- H05/H06: overwrite day safety uses resolved source-unit ownership; inline suffix units and contiguous between-event prose get target IDs only with safe boundaries. Blank-separated or final unowned prose does not get attached to an activity. Source-unit IDs cannot be reused across different field assignments.
- H07: import-specific preflight/status reports the configured import model; extraction responses report requested and provider-reported model/generation identity. OpenRouter extraction requests now request JSON Schema structured output while server AJV validation remains authoritative.
- Owner's CP032 UI example guidance was recorded in `TODOS.md`: three correct example formats, preferably under the text/PDF controls in a collapsible mobile-friendly section. No CP032 UI code was changed.

### Verification Results

| Gate | Result |
|---|---|
| `test:web-import` | PASS — 204/204 |
| `test:web-ai` | PASS — 32/32 |
| `test:web-store` | PASS — 12/12 |
| `test:web-api` | PASS — 13/13 |
| `test:web-publication` | PASS — 12/12 |
| `typecheck:web-server` | PASS — 0 errors |
| `check:web-types` | PASS |
| Live Haiku 5.5 bounded text smoke after structured-output change | PASS — exactly one provider dispatch; schema valid; description and tip map to the correct Keraton activity; unheaded final summary remains pending. Requested/actual model matched. Usage: 1,929 prompt + 705 completion tokens; cost US$0.0005454. Generation ID retained in the temporary test output only. |

### Live-Test Accounting and Deviation

- Before structured output was added, the initial isolated text and PDF smoke imports each exhausted two attempts on invalid response shape. They applied no AI fields and left all three units pending; costs were US$0.0009806 (text) and US$0.0011951 (PDF).
- A subsequent authorized one-dispatch harness mistakenly statically imported the provider before loading `.env.web`, so it used the writing model `openai/gpt-6-luna`, not Haiku. It applied two correct local fields and left the unheaded global sentence pending; cost US$0.0002445. This error is disclosed, not counted as Haiku verification. The temporary data was removed.
- The owner then authorized one correctly guarded Haiku dispatch; the corrected harness checks model ID, authentication and catalog listing **before** dispatch and performs no retry. That one dispatch passed the bounded smoke above.
- Total observed provider cost across all smoke attempts: approximately **US$0.0029656**. No further live calls were made. The post-fix Haiku live smoke was text-only; PDF mapping parity remains verified by deterministic intake/import tests, not a post-fix paid PDF call.

### Remaining Limitations

- Three example-format UI cards and presentation placement are reserved for CP032. CP032 review-resolution UI and browser preview tests were not run as part of CP031.
- No migrations, canonical schema changes, commit, push or deployment. No Linux gate was run. CP033–CP036 statuses/code remain untouched for later discussion.
