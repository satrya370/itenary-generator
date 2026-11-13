# CP031 Revision Plan: Entity Context and Collection Overflow

## Reason for Revision
Review reproduced cross-place description attribution, a dropped next-line exception, and destructive overwrite of 31 activities after fitting to 30. Previous completion claims did not cover these failures.

## Clarifications and Decisions
Owner selected conservative behavior in the shared structured revision discussion: uncertain entity/sentence/layout relations are review-only, partial overwrite preserves the old collection. CP030 correction completed and logged before this implementation. CP032/statuses and model routing remain unchanged. No live AI/migration/dependency changes. Owner subsequently authorized commit/push to main after successful verification.

## Existing Behavior
Places validate each field globally; one visual line counts as a complete sentence; overflow is clipped only after collection replacement.

## Required Behavior
Place name, area and description must refer to the same provable entity context. Incomplete prose and next-line qualifiers cannot become accepted shortened claims. Overwrite collections that exceed canonical caps or require destructive fitting retain old data entirely and report why.

## Proposed Changes
Bind place evidence to the name source unit plus explicit bounded entity context; ambiguous adjacent places stay separate. Validate sentence-level source boundaries conservatively, including adjacent qualifier lines. Preflight incoming collection limits before merge/fitting, propagate layout ambiguity and omissions to retention gates, and report retained reasons. Add adversarial and positive API regressions for all three findings and boundary counts.

## Impact and Regression Risk
Stricter quote units reduce recall; keep dropped reasons and source line refs visible privately. No canonical contract/schema migration. Preserve successful replay/undo, source isolation and model routing.

## Verification Plan
Review entity/quote/overwrite paths before tests. Execute focused apply, all import, AI, API and publication suites with doubles, typecheck server, canonical type check, and diff check. Append corrected completion log before status completion. Commit/push only after gates pass; no secrets or unrelated work.

## Updated Acceptance Criteria
Wrong-place quote is rejected while source-local facts pass. The review's split exception example and wrapped qualifiers are not accepted partially. Overflow/partial collections never replace old collections, complete in-limit imports still work. All five review reproductions are regression-covered across CP030/CP031; CP032 is not implemented.

## Rollback
Revert only this correction; retain conservative rejection/collection preservation if broader coverage requires follow-up. Never restore global quote attribution as a workaround.
