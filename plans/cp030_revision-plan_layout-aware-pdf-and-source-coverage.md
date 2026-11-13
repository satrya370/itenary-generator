# CP030 Revision Plan: Layout-Aware PDF and Source Coverage

## Reason for Revision
- The earlier CP030 revision closed only bounded text-parser and basic PDF heuristics. The completion log explicitly left page-level PDF provenance, sparse/mixed-page diagnosis, wrapped/table/page-continuation handling, and robust layout fixtures incomplete.
- Current `readPdfPages()` drops all page metadata except text/X/Y/width; intake persists normalized text only. `assertTextLayer()` checks document-average density, so a sparse page may pass when another page is dense. The fixed-Y/column-start heuristic cannot reliably identify row/cell structure or repeated headers.
- The owner requested completing CP030's parser/PDF scope before starting CP031. The owner selected text-layer PDFs only (no OCR), explicit reporting/review for ambiguity, and authorized the dependency-gate exception for subsequent CP031 without changing other CP statuses.

## Clarifications and Decisions
- Follow the prior structured decisions in `plans/cp030-cp032_revision-plan_text-and-pdf-parser-hardening.md`: PDF text layer only; no OCR/vision; no guessing when layout is ambiguous; report incomplete coverage and candidate/source evidence.
- Execute CP030 alone. Do not implement AI evidence guards, merge safety, review UI, database migration, model routing, or CP032 behavior in this revision.
- Preserve the existing canonical itinerary schema and API compatibility. Add private source-layout metadata without persisting original PDF bytes; metadata is versioned and deleted with source text under the existing retention policy.
- Use only the installed `unpdf`/pdf.js capabilities verified from local package types/runtime; do not add dependencies.
- Existing working-tree model-routing and CP031 artifacts are user work and remain untouched.
- Dependency gate exception: CP033–CP036 acceptance remains pending; owner authorizes this CP030 revision and the later CP031 revision despite that gate. CP032 remains `in_progress`; do not alter any other checkpoint status. CP031 does not start until CP030 verification and its revision-log update are complete.

## Existing Behavior
- PDF extraction returns `PdfItem { str, x, y, width }[][]`, losing page dimensions, rotation, item height/font and normalized source location.
- Extracted PDF text is stored in `<dataDir>/imports/<id>.txt`; no sidecar retains page/block mapping.
- Dry-run reports aggregate line counts and scalar conflicts, but cannot map a parsed/unconsumed line back to a PDF page or region.
- `assertTextLayer()` rejects by average non-space chars per page only; blank pages and sparse pages are not distinguished individually.
- `pageToLines()` groups by a fixed 3-point Y tolerance and splits at fixed 40-point X gaps; reading order is heuristically row-major or column-major with a time-prefix clue.
- Existing tests cover synthetic clear columns, one text PDF, image-only rejection, page limit, and timeout. They do not establish row-wrapped tables, repeated header/footer handling, mixed sparse pages, rotation, or cross-page continuation.

## Required Behavior
- Preserve per-page metadata supported by the installed PDF library, including page number, page bounds/rotation and each text item's coordinates/extent. Coordinates are explicitly the raw PDF.js/unpdf page coordinate space (origin bottom-left, page units), not rotation-normalized; retain rotation so a consumer does not mistake them for screen coordinates.
- Produce deterministic page-aware blocks/lines with stable IDs, reading order, raw text spans, and diagnostics. Maintain a reversible/traceable mapping to normalized extracted source text; do not slice text with offsets from a differently normalized representation.
- Report page-level usable-text coverage. Empty decorative pages may be distinguished from pages containing image/graphics but no usable text; a document with substantive sparse/mixed pages must not be declared fully readable based only on aggregate density. Preserve existing whole-scan rejection behavior and provide actionable page numbers for incomplete text-layer coverage.
- Reconstruct only layouts supported by strong geometric evidence. Handle tested clear columns and time-led table rows; keep page boundaries and explicit day headings intact. Wrapped rows or continuation relations that cannot be proven stay separate and visible as unresolved text rather than being concatenated into apparently certain content.
- Detect repeated text near page margins only as a review diagnostic; do not remove it automatically, since repeated itinerary content cannot safely be distinguished from a header/footer by repetition alone.
- Keep text extraction only: no OCR, image interpretation, or invention of missing table cells.
- Make page/block provenance available in the CP030 private dry-run/source response additively. Do not leak source excerpts or layout metadata into public itinerary/published output.
- Ensure source-layout sidecar writes are atomic/recovery-safe, source-ID/workspace scoped, and removed alongside source text during retention/deletion. Original PDF bytes remain unstored.
- Preserve text-input behavior and current CP030 deterministic parser fixes.

## Proposed Changes
1. Confirm `unpdf`/pdf.js metadata types and actual output with representative fixtures; add a narrow typed adapter that serializes only supported fields from the PDF worker.
2. Introduce a versioned private layout representation (`sourceId`, source hash, page metadata, blocks, source spans, bounds, reading order, diagnostics). Keep the extracted text as the existing compatibility source; write sidecar atomically and remove it on DB insert failure and retention sweep.
3. Replace aggregate-only text-layer check with page-level classification using text item count/characters and geometric evidence. Return structured diagnostics for sparse/substantive pages while allowing truly blank pages; reject full scans and flag partial/mixed coverage without falsely claiming full extraction.
4. Replace the fixed-order heuristic with geometry-derived row/column regions and explicit confidence-by-rule statuses (not probabilistic confidence). Add table row/cell association and conservative wrapped-line joining; repeated header/footer exclusion requires positional and repeated-text evidence and must retain legitimate repeated itinerary content.
5. Extend dry-run response with page/block mapping, line/span provenance, layout diagnostics, and coverage categories while retaining existing response fields. Ambiguous layout lines remain unconsumed/unresolved.
6. Add synthetic and generated text-layer PDFs for one/two-column prose, table rows, wrapped cells, repeated headers/footers, multi-page continuation, blank and sparse substantive pages, rotated page metadata if supported, mixed text/image pages, and existing invalid/scan/limit cases. Generator option must not rewrite tracked text fixtures in PDF-only mode.
7. Update `cp030_completion-log_text-and-pdf-parser.md` by appending a dated Revision section only after all required gates pass; preserve its original bounded completion record. Update `TODOS.md` CP030 status only after log exists. Do not begin CP031 in this revision.

## Impact and Regression Risk
| Area | Risk | Mitigation |
|---|---|---|
| PDF library metadata | Unsupported or unstable metadata assumptions | Inspect installed declarations and runtime fixture output; adapter treats unavailable optional metadata explicitly. |
| Reading order | New layout logic reorders content or over-joins cells | Golden block-order fixtures, ambiguity diagnostics, and conservative no-join behavior. |
| Sparse pages | False rejection of decorative blank pages or false success of mixed scans | Separate blank from sparse substantive pages and assert per-page outcomes. |
| Source sidecar | Orphaned/stale private evidence or retention mismatch | Atomic writes, DB-failure cleanup, retention/delete tests, and source/workspace scoping. |
| API response | Consumers break on added provenance | Additive fields only; assert existing fields remain stable and run import/API suites. |
| CP scope | Accidental implementation of CP031/CP032 | No changes to AI service/merge/UI/migrations; review touched-file list before testing. |

## Verification Plan
- Review first, before tests: compare implementation against `SPEC.md` §7a, this plan, and the broader plan's CP030 A–D; audit privacy, retention, span normalization, fixture isolation, status boundaries, and preservation of unrelated model-routing changes.
- Run actual PDF fixture generation in PDF-only mode and verify tracked text fixtures unchanged.
- Run `test:web-import` including generated PDFs through the real `unpdf` worker and API dry-run; assert pages, blocks, reading order, spans, diagnostics, mixed/sparse handling, source deletion/retention, scan rejection, invalid/PDF page/size/deadline paths.
- Run `typecheck:web-server`, `check:web-types`, relevant API/import tests, and `git diff --check`.
- Inspect extracted text/layout output for representative generated PDFs. Do not claim arbitrary PDF support from synthetic cases.
- No live AI/provider calls, migrations, dependency changes, commits, pushes, or deploys.

## Updated Acceptance Criteria
- Every PDF-derived line/block in dry-run maps to its source page and UTF-16 source span; available bounds are returned in raw PDF page coordinates with dimensions and rotation. Missing geometry is explicitly marked rather than fabricated.
- Page-level coverage distinguishes usable, blank/decorative, and sparse/unreadable pages. Mixed/sparse substantive pages are identified by page number; full-scan PDF is still rejected; no document is labeled fully covered by aggregate average alone.
- Clear columns, supported time-led tables, and explicit multi-page/day continuation fixtures reconstruct in expected order. Wrapped text remains source-addressable; repeated margin text is flagged and preserved. Uncertain relations remain unresolved with diagnostics.
- Private sidecar lifecycle matches source text lifecycle and retention; no original PDF bytes or source evidence appear in public output.
- Existing text parser behavior and additive dry-run contract remain green; no CP031/CP032 scope or other checkpoint status changes.
- Required tests/typechecks pass and completion log revision is appended before CP031 starts.

## Rollback
- Revert only this revision's parser/PDF/layout sidecar/API/test changes; preserve earlier CP030 revision history and unrelated worktree changes.
- If sidecar format proves unsafe, remove its reader/writer and return to text-only source storage; do not delete source rows or alter applied migrations. Keep page-coverage rejection conservative and explicitly report remaining limitation.
