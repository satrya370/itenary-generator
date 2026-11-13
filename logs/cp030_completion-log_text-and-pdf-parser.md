# CP030 Completion Log: Text and PDF Parser Hardening

## Result
- Status: completed for the bounded CP030 deterministic intake/parser revision. Limitations are listed below; this is not completion of CP031 or CP032.

## Date
- Completed at: 2026-11-13 (time not recorded)

## Plan Reference
- Revision plan: `../plans/cp030_revision-plan_text-and-pdf-parser.md`
- Broader chapter plan: `../plans/cp030-cp032_revision-plan_text-and-pdf-parser-hardening.md`

## Changes Made
- Parser normalizes direct CRLF/Unicode input before classification.
- Day markers with gaps are retained as separate day boundaries; repeated, backwards, and out-of-range markers no longer cause following activity to be silently assigned to a previous day. Diagnostics identify skipped/invalid day structure.
- Time parser slices normalized source text rather than folded offsets, handles AM/PM ranges, 1h30m/1 jam 30 menit compound durations, and leaves overnight duration unresolved.
- Date parser accepts ISO dates and reports invalid, missing-year, and ambiguous numeric dates instead of silently selecting day/month order.
- Conflicting repeated scalar values are cleared and returned as explicit candidate values; repeated identical values remain stable. Meeting place and URL on the same line are both extracted.
- Inline/unbulleted practical lists are recognized where section structure is clear.
- PDF row reconstruction separates clear column gaps and uses column-major order for prose columns, while preserving row-wise order for time-led tabular rows. Added a `--pdf-only` fixture-generation option that reads existing text fixtures without rewriting them.
- Dry-run response preserves existing fields and adds source kind/page count, line coverage, diagnostics, and scalar conflicts.
- No AI/prompt/merge/UI behavior, database migration, dependency, OCR, credential, commit, push or deploy change was made for this CP030 revision.

## Files and n8n Workflows Changed

| Artifact | Change |
|---|---|
| `src/server/import/parse/{extract,lines,time}.ts` | Normalization, day handling, conflicts, list parsing, time/duration fixes. |
| `src/server/import/normalize.ts` | ISO, invalid and ambiguous date handling. |
| `src/server/import/intake.ts` | Clear-column PDF reading-order heuristic. |
| `src/server/import/routes.ts` | Additive dry-run diagnostics, conflicts, coverage and source metadata. |
| `scripts/web/make-import-fixtures.ts` | `--pdf-only` mode. |
| `tests/web/import-{parser,intake}.test.ts` | Edge-case regressions. |
| `TODOS.md` | CP030 revision status and authorized exception recorded; CP032/other statuses untouched. |
| n8n workflows | None. |

PDF fixtures generated locally under the gitignored `tests/fixtures/web/import/`; tracked text fixtures were not rewritten (`git diff --numstat` showed no fixture changes).

## Verification Performed

| Verification | Result | Evidence |
|---|---|---|
| Review before test | PASS | Re-read final parser/intake/routes diff and verified scope, backward-compatible response fields, fixture isolation, and preservation of model-routing work. |
| PDF fixture generation | PASS | `npm.cmd exec --yes --package=node@24 -- node --import tsx scripts/web/make-import-fixtures.ts --pdf-only` |
| `test:web-import` | PASS | 65 tests passed, 0 failed, including actual text-layer PDF extraction, scan rejection, page cap, timeout, clear two-column/table ordering, parser edge cases and API dry-run. |
| `typecheck:web-server` | PASS | 0 errors in server/contracts/API scope. |
| `check:web-types` | PASS | Generated TypeScript declarations match canonical schema. |
| `git diff --check` | PASS | No whitespace errors; Git emitted only existing LF-to-CRLF normalization warnings. |
| PDF visual/content inspection | PASS, limited | Opened generated `id-full-day-tidy.pdf`; extracted page content matched source fixture. No rendered screenshots were produced for complex layout PDFs. |

## Acceptance Criteria Results

| Criterion | Result | Evidence |
|---|---|---|
| Direct CRLF, day skip/repeat, time/duration/date, scalar conflict and partial meeting URL regressions | PASS | Added unit tests in `tests/web/import-parser.test.ts`; suite passed. |
| Inline and unbulleted list parsing | PASS for covered forms | Focused regression test passed; not a universal prose/list classifier. |
| Clear PDF columns and time-led rows preserve tested reading order | PASS for synthetic geometry cases | Added `pageToLines` tests; actual existing text-layer PDF API test passed. |
| Dry-run exposes coverage/diagnostics/conflict candidates without writing a draft | PASS | Extended dry-run API assertion; existing dry-run still creates no itinerary. |
| No paid AI calls, no OCR, no migration, and no changes to other checkpoint statuses | PASS | No live provider test was run; diff review confirms these boundaries. |

## Deviations from Plan
- The broader shared plan requested per-line page-coordinate provenance, sparse/mixed-page diagnostics, arbitrary table/wrapped-cell/page-continuation handling, and 40 text/12 PDF golden fixtures. Those are not complete in this bounded CP030 revision. The implemented PDF algorithm is a heuristic for clear columns and time-led rows only; limitations are recorded in the revision plan and not claimed as general PDF accuracy.
- Review UI and server-side AI quote/semantic/target validation are CP031/CP032 scope and were not changed.
- The owner explicitly authorized bypassing the repository's dependency acceptance gate. CP033–CP036, CP032 and CP031 statuses were not changed. Historical CP030/CP031 completion-log gaps were not reconstructed; this log covers only this revision.
- Live AI tests and release/browser-wide gates were not in the CP030 scope and were not run.

## Known Limitations and Follow-Ups
- PDF layout uses fixed geometric heuristics. Merged tables, arbitrary multi-column order, repeated headers/footers, rotation and rows continuing across pages need additional fixtures and work.
- PDF source evidence has source page count, not line-to-page coordinates/spans. Sparse/mixed text pages are not independently diagnosed; scan rejection still uses existing whole-document text density.
- Ambiguous candidates are surfaced in dry-run diagnostics; user selection/review UI and application are not implemented here.
- The three API-level issues from the audit—quote negation/evidence scope, internal AI marker validation, and activity-description target attribution—belong to CP031 and remain unresolved by this CP030 change.
- Earlier missing historical CP030/CP031 logs and pending dependency acceptance are recorded, not silently treated as resolved.

## Revision: 2026-11-13 - Layout-Aware PDF and Source Coverage

### Revision Plan
- `../plans/cp030_revision-plan_layout-aware-pdf-and-source-coverage.md`

### Changes Made
- Verified installed `unpdf` output and retained per-page dimensions/rotation plus text item coordinates, extents, font size, and line-break metadata in a versioned private layout sidecar. Coordinates are raw PDF.js page coordinates (origin bottom-left); no rotation normalization is claimed.
- Built page-aware source blocks with stable IDs, reading order, UTF-16 offsets into normalized extracted text, and geometric bounds where available. Dry-run returns blocks and page-specific diagnostic/coverage status additively.
- Added sparse-page, empty-or-non-text-page, and repeated-margin-text review diagnostics. Repeated margin text is preserved, not auto-deleted; empty versus image-backed pages cannot be distinguished with the verified adapter.
- Added atomic sidecar writes, cleanup on source-row write failure, and deletion with retention. Original PDF bytes remain unstored.
- Added generated multi-page, two-column/table/wrapped-line, repeated-margin, mixed sparse/image fixture paths and regression checks. PDF-only generator mode did not rewrite tracked text fixtures.
- The tested geometry/layout coverage remains intentionally bounded: ambiguous wrapped cells remain separate, no general table-grid or rotation-normalized reconstruction is claimed.

### Verification Performed
| Verification | Result | Evidence |
|---|---|---|
| Review before test | PASS | Reviewed CP030 scope, source spans/offsets, raw coordinate convention, privacy/retention, sidecar cleanup, and preservation of unrelated CP31 artifacts. |
| PDF-only fixture generation | PASS | `npm.cmd exec --yes --package=node@24 -- node --import tsx scripts/web/make-import-fixtures.ts --pdf-only` |
| `test:web-import` | PASS | 68 tests passed, 0 failed, including actual `unpdf` worker/API use, multi-page page mapping, sparse/mixed diagnostics, table/column order and retention. |
| `typecheck:web-server` | PASS | 0 errors in server/contracts/API scope. |
| `check:web-types` | PASS | Generated TypeScript declarations match canonical JSON Schema. |
| `git diff --check` | PASS | No whitespace errors; only LF-to-CRLF normalization warnings. |
| Tracked fixture isolation | PASS | `git diff --numstat -- tests/fixtures/web/import` returned no changes. |

### Acceptance Criteria Results
| Criterion | Result | Evidence |
|---|---|---|
| Page-aware source spans/bounds and source-page diagnostics in private dry-run | PASS | PDF intake/API tests assert spans slice exact stored source text, bounds exist, page numbers persist, and sparse page 2 is diagnosed. |
| Mixed/sparse content not accepted as fully covered from average density alone | PASS, bounded | Substantive sparse page is retained and marked `sparse`; empty/no-text is separately marked `empty-or-non-text`. The adapter cannot distinguish a blank decorative page from a graphic-only page. |
| Tested columns and time-led tables keep deterministic order | PASS for fixtures | Clear two-column prose, row-preserving time-led table, and multi-page/day fixture tests pass. |
| Repeated margin content is detected without silently deleting legitimate content | PASS | Synthetic PDF asserts repeated margin review diagnostic; source content is preserved. |
| Sidecar is private, versioned, atomically written, and retention-linked | PASS | Source route and retention tests; no DB migration or original PDF storage. |
| Existing text parser/API behavior and no other CP scope change | PASS | 68-test import suite, typecheck and schema check pass; CP031/CP032 code untouched in this revision. |

### Remaining Limitations
- Arbitrary tables/merged cells, general wrapped-cell association, rotation-normalized bounds, repeated header/footer exclusion, and precise image-vs-blank page classification are not solved; uncertain text is preserved and surfaced rather than guessed.
- No OCR, live AI/provider call, migration, dependency change, commit, push, or deploy was performed.
- Dependency exception remains owner-authorized; CP033–CP036 acceptance and CP032 status are unchanged. CP031 work begins only after this log/status reconciliation.

## Revision: 2026-11-13 - Review Corrections: Spans and Columns
- Plan: `../plans/cp030_revision-plan_normalized-spans-and-ambiguous-columns.md`.
- Corrects the earlier completion's overstatement: leading empty pages and normalization could invalidate spans, and a clock prefix could join unrelated columns.
- Stored normalized source and blocks now share one builder; UTF-16 spans are measured after NFC/invisible-character/whitespace normalization. Leading/trailing blank pages cannot shift offsets.
- Automatic table joining is bounded to an explicit two-cell time/activity header and complete time-led rows. Other multi-column/mixed layouts are preserved as separate blocks, flagged ambiguous and excluded from deterministic parsing and AI. Dry-run reports ambiguous page status; apply carries layout diagnostics.
- Review covered source/normalization equality and both dry-run/apply exclusion paths before tests.
- Verification before CP031: full `test:web-import` 76/76; focused intake after final coverage status change 19/19; server typecheck 0 errors; generated types and `git diff --check` pass (line-ending warnings only).
- Combined correction verification: 81 import tests pass, including API apply proving ambiguous page content never reaches AI/draft facts and legacy sidecar reconstruction/stale-source exclusion. PDF fixtures are regenerated in PDF-only mode by the import pretest hook, not committed as ignored artifacts.
- Regression evidence includes real PDF worker extraction after a blank page, Unicode/invisible cleanup, independent time-led columns, explicit bounded table, and mixed-page API diagnostics.
- Conservative limitation: unsupported tables/wrapped/independent columns are review-only, not claimed as reconstructed. No OCR, live AI, migration or dependency change. Owner authorized commit/push after gates; no deployment. Existing dependency exception and other CP statuses unchanged.
