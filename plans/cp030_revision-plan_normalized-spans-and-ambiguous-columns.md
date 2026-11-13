# CP030 Revision Plan: Normalized Spans and Ambiguous Columns

## Reason for Revision
Review reproduced invalid spans after leading blank PDF pages and time-led independent columns silently merged into activity titles. Prior completion did not establish these cases.

## Clarifications and Decisions
Owner approved conservative handling through structured question: uncertain layout/entity/sentence relations are not automatically applied; partial overwrite retains the old collection. Execute CP030 then CP031, not CP032. Preserve unrelated model routing/statuses. Existing dependency exception remains, not dependency acceptance.

## Existing Behavior
Offsets are calculated before all source normalization. A time prefix can classify an entire multi-column page as a table.

## Required Behavior
Every block must slice the exact stored normalized text, including blank leading pages and Unicode cleanup. Independent columns must never be joined by a time prefix alone. Unproven multi-column relations remain private unresolved source, excluded from deterministic and AI application.

## Proposed Changes
Build normalized block text and stored source together; require an explicit multi-cell time/activity table header before row joining. Flag other multi-column pages ambiguous; preserve source/bounds and exclude flagged lines from parsing and AI. Wire the same exclusion into dry-run and apply. Add regressions for source normalization and columns plus API protection.

## Impact and Regression Risk
Conservative page exclusion reduces recall; reports must identify source page/lines. Additive metadata only, no migration/dependency/OCR/provider calls.

## Verification Plan
Review source/span/privacy and exclusion flow before tests; run real PDF worker intake tests, full import suite, server typecheck, schema check and diff whitespace check. No commit/push/deploy. Append correction to existing log before completing status.

## Updated Acceptance Criteria
All stored blocks slice exact source. Time-led independent columns are not joined or applied, are reported, and never sent to AI. Existing single-column and explicit table fixtures remain supported. CP032 and other statuses unchanged.

## Rollback
Undo only this revision; keep prior work and conservatively reject unsupported layouts rather than restore unsafe joining.
