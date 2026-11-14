# CP031 Revision Plan: Mode-Applicable Import Fields

## Reason for Revision
CP032 browser verification found that importing a full-day PDF in destination-guide mode fails validation at `meeting.place`, because merge applies a field that does not apply to the selected mode.

## Clarifications and Decisions
On 2026-11-14 the owner approved fixing CP031 as a CP032 prerequisite: preserve the user-selected mode; do not apply mode-inapplicable facts, and report them for review. Continue mock-only tests, no paid calls, deployment or push; commit only on the separate branch after gates pass.

## Existing Behavior
Merge unconditionally applies parsed meeting fields; canonical field applicability validation rejects destination-guide drafts containing them.

## Required Behavior
The destination-guide import must retain valid applicable facts, leave meeting and start-date fields unfilled, and report every excluded fact. The real PDF regression exposed the date issue after the meeting fix; it has the same registry-defined applicability and is included in this prerequisite. Existing draft data and applicable mode behavior stay unchanged.

## Proposed Changes
Guard parsed meeting fields by mode in merge and add explicit skipped entries in the private report. Cover new and overwrite cases using text and a real PDF, and retain positive tests for modes that support meeting fields.

## Impact and Regression Risk
Over-filtering could omit legitimate meeting fields; only destination-guide mode is affected, consistent with canonical field registry. Regressions must verify half/full/multi/activity behavior and privacy.

## Verification Plan
Review mode applicability against field registry before tests; run targeted API/import, browser E2E, typechecks, schema and diff checks. Use doubles only. Append CP031 log before restoring completed status.

## Updated Acceptance Criteria
Cross-mode import no longer fails due to meeting fields; every excluded field is reported, with no fabricated values. Applicable modes still import them. Existing unrelated CP statuses and routing are unchanged.

## Rollback
Revert only this scoped applicability guard and its tests; do not remove source material or unrelated changes.
