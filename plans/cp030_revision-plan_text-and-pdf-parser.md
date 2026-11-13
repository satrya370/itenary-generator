# CP030 Revision Plan: Text and PDF Parser Hardening

## Reason for Revision
- The completed deterministic parser has audited accuracy gaps: CRLF direct-call inconsistency, day markers that can mis-attach activities, duration/time/date edge cases, silent scalar overwrite, lost partial line values, and incomplete layout-aware PDF reconstruction.
- Execution began 2026-11-13 and completed the bounded deterministic/parser/API scope below. This does not complete the larger CP030–CP032 hardening plan; unresolved AI provenance and editor-review work remains for its later CPs.

## Clarifications and Decisions
- Owner selected text-layer PDFs only; no OCR/vision. PDF tables, columns, wrapped rows and page continuation are in scope where layout evidence is sufficient.
- Owner selected explicit review for ambiguous/conflicting values. This CP exposes deterministic candidates/diagnostics in dry-run; applying/review UI is later CP031/CP032 scope and is not changed here.
- Owner explicitly authorized executing CP030 despite CP033–CP036 dependency acceptance, CP032 in-progress status, and incomplete historical CP030/CP031 completion logs. Record this exception; do not alter other CP statuses or claim those gates resolved.
- Preserve current runtime schema and model-routing work. No paid provider calls, OCR, dependency additions, migration, AI merge changes, editor changes, commit, push, or deploy.

## Existing Behavior
- `parseDocument` assumes normalized LF input and uses folded-string offsets against original text.
- Day sequences require the next integer; skipped markers can leave later activity attached to an earlier day.
- Durations parse only one unit; AM/PM range endpoints and ISO dates are not safely handled; repeated scalar keys overwrite silently.
- One structural line can be marked consumed while some facts on it are lost.
- PDF reconstruction groups by fixed Y tolerance and sorts X globally, without robust column/reading-order handling or per-page sparse-text diagnostics.

## Required Behavior
- Parser entry normalizes idempotently and preserves evidence positions.
- Every recognized day marker bounds the following content; skipped/duplicate/out-of-order markers create explicit unresolved diagnostics, never carry activities into an earlier day.
- Time/duration/date parsers handle supported explicit formats and return ambiguity/invalid diagnostics rather than guessing.
- Conflicting repeated scalar values are reported and not resolved by last-write-wins. Preserve a stable primary only if identical; differing values leave the scalar empty for explicit review.
- Partial facts on one line (meeting place + map URL) are both recovered. Unrecognized substantive text remains unconsumed.
- Text-layer PDF reading order separates clear columns and preserves page provenance; ambiguous layouts and sparse/missing text pages are reported. Scanned PDFs remain rejected; no OCR.
- Dry-run parse response remains backward-compatible while adding diagnostics/candidates/coverage and page metadata.

## Proposed Changes
- Harden normalization, line classification and evidence mapping; repair day, time, duration and date readers; add bounded inline/list/section parsing and conflict detection.
- Preserve PDF page/item metadata, reconstruct clear row/column order, retain wrapped cell relationships where supported, detect repeated header/footer candidates and per-page text-layer gaps.
- Extend synthetic fixture generator and tests. PDF fixtures are generated locally because `*.pdf` is gitignored.
- Keep AI completion, quote validation, persistence schema, merge/overwrite, UI and review resolution out of CP030.

## Impact and Regression Risk
- Stricter ambiguity handling may leave more fields blank; report source line and reason rather than selecting a potentially incorrect value.
- PDF heuristics may misorder complex layouts; do not auto-accept unclear reading order. Preserve raw extracted text and report partial coverage.
- Maintain current public API result fields and current parser fixture semantics except where the old behavior silently mis-parsed data.
- Existing local uncommitted model-routing changes are user/session work and must remain untouched.

## Verification Plan
- Add regression tests first for direct CRLF, Unicode spans, day skips/duplicates, AM/PM ranges, compound durations, ISO/invalid/ambiguous dates, scalar conflict, partial meeting URL, inline lists, and overflow.
- Generate and test synthetic text PDFs for clear two-column, table rows, wrapped rows, multi-page continuation, repeated header/footer, rotated page and sparse/mixed pages; test scan rejection.
- Run `test:web-import`, focused parser/PDF tests, relevant typechecks, fixture generation, and `git diff --check` on Node 24. Inspect rendered PDF fixtures/screenshots where produced.
- Review completed diff against this plan before tests; revise all review/test findings and repeat review/test.
- No live AI or paid calls. Do not claim full chapter/release gates or CP031/CP032 completion.

## Updated Acceptance Criteria
- CP030 regressions in this plan pass without weakening existing assertions; no activity is silently assigned to the wrong day, invalid/ambiguous facts are diagnosable, and partially parsed lines retain all supported values.
- PDF text layout fixtures produce expected reading order/coverage; uncertain PDF regions remain explicit diagnostics; scan-only PDFs remain rejected.
- Dry-run exposes source diagnostics and coverage without writing a draft; existing response fields remain compatible.
- `test:web-import`, focused typechecks/tests and diff check pass, or any blocked verification is recorded accurately.
- Completion log records the authorized dependency-gate exception and missing historical logs without fabricating evidence; no other CP status is modified.

## Known Limitations at Completion
- PDF line order uses geometry heuristics (40-point column gap, 3-point row grouping, time-prefix table hint); no guaranteed recognition of arbitrary tables, merged cells, repeated headers/footers, rotation, or cross-page row relations.
- Parse response includes source kind/page count, but not per-line page coordinates or durable source spans. Sparse/mixed text-layer pages are not individually diagnosed.
- Dry-run reports line coverage, unconsumed lines, notes and scalar conflict candidates. It does not resolve candidates or provide review UI; that is outside CP030.
- AI quote/semantic/target guards, batching, overwrite collection safety, and UI resolution are not changed by this CP030 revision.

## Rollback
- Revert only CP030 revision files. Do not remove existing source files, rewrite historical plans/logs, change migration history, or revert local model-routing work. Keep generated local PDF fixtures isolated and remove only those created by this run.
