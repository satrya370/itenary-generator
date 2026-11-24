# CP030 Revision Plan: Source spans and inline activity details

**Status:** completed (focused parser scope; follow-up AI target binding remains CP031).

## Objective

Fix CP030 deterministic parsing so a timed line does not silently absorb explanatory text into the activity title or mark that text fully consumed. Provide a safe, traceable source span for details that CP031 can optionally extract. If the boundary is uncertain, preserve the text unresolved for review.

## Clarifications and Decisions

- Owner authorized executing the focused CP030 revision despite CP033–CP036 still being recorded `in_progress` in `TODOS.md`; do not change their statuses. Record this dependency exception. No unrelated CP or CP031/CP032 implementation is authorized here.
- For one-line schedule entries containing time, title and explanation, use a conservative deterministic split only at an explicit, unambiguous sentence boundary. Lowercase sentence boundaries and long prose-like tails without a safe split are retained as unresolved candidates; do not guess a title/detail boundary. Short punctuation-free text remains intact as a title because the parser cannot infer that it contains a description.
- Keep source evidence verbatim and zero-based line indexes compatible with existing APIs. Do not add a schema migration or change the canonical itinerary.
- No live AI call, deployment, commit, or push in this CP.

## Scope

- Reproduce inline activity detail loss with deterministic regression tests.
- Adjust CP030 parser/source-unit output so obvious title + sentence detail are separated, and unresolved remainder remains available to the AI/review stage rather than disappearing under `consumedLines`.
- Preserve timed activity title, time, duration, kind, order, and source line.
- Test repeated punctuation, abbreviations, long prose without punctuation, lowercase sentence boundaries, bullets, and following activity boundaries; ambiguous prose candidates fail closed.
- Keep text and equivalent PDF extraction behavior semantically aligned insofar as their extracted lines are the same.

## Out of Scope

- CP031 field ownership, AI payload redesign, completion validation, mapping ledger, overwrite safety, model diagnostics.
- CP032 UI for pending source spans, review decisions, and end-to-end preview.
- OCR, new dependencies, PDF layout redesign, canonical schema changes, migration, credentials, live provider calls.
- CP035 follow-up or changes to pre-existing unrelated work.

## Current-State Findings

- `parse/extract.ts` currently uses the full `reading.rest` as activity title and consumes that entire line.
- Its paragraph parser only runs for lines longer than 160 characters; shorter explanatory text is kept unresolved, but inline explanations on timed lines are not.
- `segmentsOf()` receives only `parse.unconsumed`; therefore a detail absorbed into a consumed title is never sent to AI.
- Reproduction in `AppData/Local/Temp/opencode/review-hybrid-repro.mts`: `09.00–10.30 — Tur Keraton. Peserta mengenal sejarah dan budaya bersama pemandu.` becomes one title, no unresolved lines and no AI units.
- Existing local worktree has many user/local modifications. Preserve all; inspect and patch only owned parser/test/CP030 documentation changes.

## Proposed Changes

1. Add a typed parsed activity detail/source-unit representation only if it can be consumed without changing CP031; otherwise retain exact unresolved line fragments in the existing `unconsumed` contract and add a focused CP031 follow-up note.
2. Add conservative boundary recognition for an explicit first sentence after a timed activity title. Do not split on abbreviation periods, decimal numbers, or punctuation without a clear following sentence boundary. Retain lowercase sentence-boundary and long prose-like ambiguous tails for review. Short text with no structural detail signal remains intact as title.
3. Keep activity title as the prefix; place detail candidate text into unresolved source text with the original line index and current section/day context. Preserve existing source indexes and avoid counting a partially consumed line as fully consumed.
4. Add regression coverage for timed line + sentence, periodless continuation, abbreviations, multiple sentences, duration range, bullets, following activity, and identical text/PDF lines.
5. If CP031 contracts cannot yet safely carry the source-unit/day ownership without an out-of-scope change, fail closed and document the limitation rather than introducing an unvalidated interface.

## Data Flow or Control Flow

Extracted normalized lines → deterministic timed-activity parse → split only when a safe sentence boundary is evident → activity fields plus unresolved detail span → existing CP030 parse response. AI/application behavior is not changed in this CP.

## Files and n8n Workflows Affected

- Likely: `src/server/import/parse/extract.ts`, `src/server/import/parse/lines.ts` (only if needed), `tests/web/import-parser.test.ts`, `tests/web/import-realistic.test.ts`.
- `TODOS.md`, this plan, the grouped hybrid-accuracy plan and a CP030 revision completion log are updated with factual status/results.
- No n8n workflows.

## Security and Failure Handling

- Never synthesize detail or treat prompts/instructions in source text as control input.
- Preserve full punctuation, negation and qualifier text. Ambiguous split remains unresolved.
- Do not expose private source content through public preview/render or logs.
- No source deletion, user draft overwrite, or provider request as part of parser tests.

## Verification Plan

- Run focused parser/realistic tests under Node 24.
- Run the full `npm run test:web-import` gate (generates PDF fixtures via existing script) and `npm run typecheck:web-server`.
- Review source diff against CP030 scope and `SPEC.md` import guarantees before tests.
- Test an equivalent text/PDF extracted line through parser fixtures; no live AI call.
- Record actual commands, counts, skipped gates, and any unresolved CP031 dependency in the completion log. Do not claim the CP030-to-CP032 semantic issues are all fixed.

## Acceptance Criteria

- Inline explanation is not silently merged into the activity title when a clear sentence boundary exists.
- Original activity time, duration, title, kind, and ordering remain intact.
- Detail has a source reference and remains available to the existing unresolved/completion path; no evidence is lost due solely to consumed-line accounting.
- Long periodless prose, lowercase sentence boundaries, and abbreviation cases do not create a guessed detail split; ambiguous prose is retained as unresolved and short punctuation-free text remains intact as title.
- Existing parser fixtures and full import gate pass; no live AI, migration, deploy, commit, or push occurs.

## Risks and Rollback

- False sentence splitting can corrupt venue names and abbreviations; use a narrow rule and negative fixtures. If fixture results show ambiguity, revert only the parser change and leave it unresolved.
- Existing downstream line-consumption assumptions may reject partial-line mappings. Prefer the existing `unconsumed` contract until an API-compatible approach is proven.
- Roll back only the CP030-owned hunks if tests fail; preserve pre-existing local edits and unrelated user changes.
