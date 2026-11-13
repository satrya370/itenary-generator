# CP031 Revision Plan: Evidence Guards and Safe Import Merge

## Reason for Revision
- Adverse tests showed three CP031 failures: section hints created by the engine could be treated as source evidence; sentence/description values could be accepted without proving the quote was a complete source unit (including negation/qualifiers); and valid text from one activity could be attached to a different activity by title/global substring matching.
- `segmentsOf()` stops at the first line that would exceed 20,000 characters, so later short lines are silently withheld. Overwrite merge replaces whole days/lists based only on non-empty parse output, even when source coverage/overflow is incomplete.
- CP031's current completion record is explicitly limited to the model-routing revision. This is a new CP031 revision; do not rewrite that record.

## Clarifications and Decisions
- User requested CP030 completion followed by CP031 using Planning → Working → Reviewing → Revising. CP030 is now completed and logged.
- Existing structured decisions remain: import is source transcription only; unverified/ambiguous evidence is omitted and reported; PDF is text-layer only/no OCR; no arbitrary facts; user chooses mode; private source evidence never reaches public output.
- Preserve the separate model-routing changes already recorded in `plans/cp031_revision-plan_split-import-model.md` and its completion log.
- No paid/live provider calls and no database migrations for this revision. Use deterministic tests and injected provider doubles only. Persist additional report evidence in the existing `import_operations.report_json` column; do not add schema columns.
- CP031 backend only. Review UI, manual resolution UX, and browser/E2E review flow remain CP032. Do not change CP032 or any other checkpoint status.
- Owner-authorized dependency-gate exception is recorded for the import hardening sequence; it does not mean CP033–CP036 acceptance is complete.

## Existing Behavior
- `service.ts` sends `segmentsOf(parse).sent` (which includes `[section]` markers) to `filterCompletion()` as the source text; `plainSegments` is computed but unused. A model echo can therefore cite an engine-created marker.
- `quoteHolds(..., 'whole')` checks equality between model value and quote plus global substring presence. This proves neither source-unit boundaries nor that nearby negation/qualifiers were retained.
- `activityDetails` identifies its target only by title; its description/place/tip quote is searched globally in all unconsumed text. A quote from another activity can pass.
- `segmentsOf()` breaks at the first line that exceeds its 20,000-character budget and drops all later lines from AI without preserving a per-line omission list.
- `mergeContent()` replaces days and practical lists when any parsed values exist. It does not require complete collection evidence before replacing an existing draft's collection.
- Operation reports already persist in `report_json`, allowing an additive private evidence/omission record without migration. Existing import usage accounting and undo snapshot fields are separate and must remain intact.

## Required Behavior
- The quote/evidence validator must only inspect document-authored source spans; engine hints, prompt framing, stable IDs and instructions are never evidence.
- Text-valued candidate acceptance must verify exact quote/span provenance and complete source-unit boundaries. Negation, exception, age/date conditions and adjacent qualifier text must not be dropped. If source-unit boundaries are unclear, reject to a structured skipped/review result; do not attempt semantic guessing.
- Activity candidates must target one stable deterministic activity/source ID and their quote must come from that target's bounded source context. A globally valid quote or duplicate title is insufficient.
- Preserve accepted deterministic values; AI cannot overwrite them. Wrong target, unknown/duplicate target, unsupported source reference, marker echo and partial/ambiguous quote are rejected with stable reason codes.
- Chunk eligible unresolved input in source order without prefix-only loss. Every omitted span/line is recorded. Bound calls and retry behavior; no unbounded repair. Existing actual-cost unknown semantics and ledger accounting remain intact.
- Overwrite must preserve existing days/lists when the incoming collection is incomplete, ambiguous, capped, or structurally uncertain. New drafts may use safe partial deterministic facts but must report omitted material. Do not combine old and new schedule rows automatically.
- Store private accepted/dropped evidence references, reason codes, and omitted spans in the existing operation report JSON. Do not persist source quote text in public itinerary content beyond accepted canonical fields, and do not expose report/source data on public routes.
- Keep current request/response and migration compatibility; no schema migration, paid/live AI, UI, OCR, dependency, or model-routing change.

## Proposed Changes
1. Extend CP031 completion input shape and prompt with explicit target/source IDs derived deterministically from the parser's line/day/activity structure. Validate IDs against the current parse result; no title-only target fallback for a structured activity detail.
2. Separate prompt display text from evidence spans. Pass `plain` source blocks and source IDs to quote validation; treat bracketed section labels and any engine marker patterns as non-source metadata.
3. Replace global substring `quoteHolds` for whole text with span-bound validation against exact unconsumed source units (whole source line/paragraph or explicitly bounded sentence). Preserve source offsets and reject any value that is not the full unit; for part values require same source block/entity and no negation/qualifier loss.
4. Build target-specific activity contexts from deterministic activity line IDs and only contiguous unresolved lines that precede the next recognized activity/day/section boundary. The candidate must reference the target ID and quote a unit inside that context.
5. Replace first-overflow `break` with source-ordered bounded chunks. Keep each source block atomic where possible; record oversized/unsent blocks individually. Cap at 8 sequential batches and 2 attempts per batch, aggregate usage/cost including every attempt, and stop beginning calls at the configured overall deadline. Keep injected extractor seam testable; do not invoke a live provider.
6. Add an overwrite completeness gate for days/practical collections. If structure/coverage/overflow/conflict indicates partial collection input, retain the old collection and report the affected path and source IDs; new imports retain only supported parsed facts and omissions.
7. Store private provenance/status/omission/reason records in `report_json` using an additive report version. Preserve legacy report reading and operation replay/undo; no migration.
8. Add deterministic adversarial tests for negation and qualifiers, internal markers, wrong/duplicate/unknown targets, same-title activities, chunk overflow with later short lines, usage accumulation/retry caps, partial overwrite preservation, replay, undo, and public-route non-disclosure.
9. Append a dated CP031 revision section to `logs/cp031_completion-log_split-import-model.md` only after verification. Preserve prior model-routing log facts. Update `TODOS.md` CP031 status only after the log exists.

## Impact and Regression Risk
| Area | Risk | Mitigation |
|---|---|---|
| Stricter evidence | Fewer AI fields accepted | Report precise dropped reasons; preserve deterministic facts; test legitimate complete-source examples. |
| Target relation | Context window may omit valid descriptions | Use explicit deterministic source IDs and bounded adjacent spans; uncertainty remains manual rather than cross-target assignment. |
| Batching | More calls/cost/latency | No paid live tests; enforce 8-batch/2-attempt caps, exact usage aggregation, deadlines, and deterministic mocks. |
| Overwrite | Safe gate may retain old values users expected to replace | Report collection retained/why; never silently mix old/new data. |
| Report compatibility | Existing reports may lack evidence fields | Version additive JSON; legacy reads remain valid; no migration. |
| Privacy | Evidence may leak to public/telemetry | Keep report on private operation routes; add negative public-route assertions; do not log source quotes. |

## Verification Plan
- Review first against `SPEC.md` §7a, this plan, and broader CP031 E–G. Inspect all report/public routes, source spans, token/cost accounting, overwrite/undo and unrelated model-routing changes before tests.
- Run targeted `tests/web/import-apply.test.ts`, all `test:web-import`, AI regression suites that use doubles, and relevant API/publication privacy tests.
- Run `typecheck:web-server`, `check:web-types`, and `git diff --check`.
- Use only injected deterministic doubles. Assert zero live extractor/provider requests; do not run opt-in live scripts.
- No migration, dependency install, commit, push, or deploy.

## Updated Acceptance Criteria
- All three adverse findings are rejected before persistence: no engine-marker evidence, no partial/negation-losing whole-source candidate, and no cross-activity source attribution.
- Every accepted AI value has a validated source-unit reference and, for activity details, a validated target ID/context. Rejected/ambiguous items and omitted chunks appear in private report diagnostics.
- Later short source blocks are not lost when an earlier block exceeds a chunk limit; all AI work remains within explicit batch/attempt/deadline caps and accounting is aggregated accurately.
- Partial/ambiguous collection results cannot replace existing overwrite days/lists; deterministic new-import behavior remains valid.
- Replay, undo, legacy reports, public routes, API contracts and model routing remain compatible; no migration or paid/live call occurs.
- Required tests/typechecks pass and the CP031 revision log is appended before CP031 returns to `completed`.

## Rollback
- Revert only changes from this CP031 revision, preserving the prior model-routing revision and CP030 work.
- If strict source-unit/target matching reduces recall unexpectedly, keep rejecting uncertain candidates and improve deterministic source grouping in a follow-up; never restore global substring acceptance.
- If additive report versioning breaks a legacy consumer, omit new metadata from that response while retaining existing report JSON shape; no database rollback is needed.
