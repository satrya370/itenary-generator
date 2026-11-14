# CP032 Implementation Plan: Import Review Hardening

## Objective
Complete CP032's existing import UI with explicit, safe review of conflicts and omissions using the CP031 private-resolution prerequisite, without pretending unsupported AI/layout candidates are selectable.

## Clarifications and Decisions
- Owner chose the existing UI hardening scope, mock-only tests, and a local commit on branch `cp032/import-review-hardening`; no push or paid AI. Owner authorized the CP031 prerequisite, completed/logged before CP032 work.
- Existing CP032 in-progress status and all unrelated checkpoint statuses are preserved until its acceptance gates pass. No OCR, deployment, dependency installation or canonical schema change.

## Scope
Private import preview/report conflict, source-location and omission presentation; safe candidate select/edit/ignore against expected revision; legacy reports; cost/batch honesty; browser verification and completion log.

## Out of Scope
New public provenance badges, provider calls, auto-resolution of unsupported layout/AI outputs, further checkpoints.

## Current-State Findings
The historical UI only shows notes and unconsumed counts, incorrectly implies all unconsumed text will be read by AI, and displays unknown tokens as zero. CP031 now exposes revalidated scalar conflict resolution; other omissions and AI rejections remain non-actionable.

## Proposed Changes
Extend typed API and report UI for conflict IDs, line/source details, current value, select/edit/ignore and stale/error responses. Expose dry-run PDF diagnostics/ambiguity and omissions without claiming they were processed. Handle reports predating evidence. Refresh editor record and report on successful resolution, preserving unsaved-edit safety. Add targeted tests, browser flow and docs.

## Data Flow or Control Flow
Private parse supplies conflict/source references; persisted report supplies candidate IDs; UI retrieves source/parse, renders only matching candidates, and sends candidate ID/line/action plus current expected revision. Server revalidates all evidence and CAS before returning updated record/report. Unknown candidates and missing sources remain unresolved.

## Files and n8n Workflows Affected
`src/editor/import/*`, editor integration, `src/api/client.ts`, import browser/test scripts and documentation. No n8n workflows.

## Security and Failure Handling
Do not put private evidence in canonical/public output or telemetry; do not infer candidate values from untrusted UI; prevent resolution when there are unsaved local changes, handle missing source, legacy reports and stale revisions explicitly. Costs with unknown usage remain unknown.

## Verification Plan
Review before test. Run import/editor/AI/API/publication tests, app/server typechecks and schema check; run real browser mock-provider E2E for text/PDF, review, overwrite/undo/reload, stale conflict, and public privacy. Inspect mobile 390px and desktop 1280px screenshots. No live provider calls. Revisit any unmet broader-plan requirement rather than silently claiming it passed.

## Acceptance Criteria
Recognized conflicts can be examined with original source lines and resolved or ignored only against a fresh revision. Unresolved layout/AI omissions remain visible and never falsely actionable. Existing reports and source-retention failures render safely; unknown cost/token usage is not called zero. Browser and regression gates pass; completion log exists before status change.

## Risks and Rollback
Stale state and source leakage are mitigated by server CAS/revalidation and private endpoints. If UI integration is unsafe, retain existing editor and diagnostics; do not alter or delete user data. Roll back only CP032 changes, preserving CP031/CP030.

## Gate Results (2026-11-14)
- PASS: conflict alternatives with page/line, manual edit/ignore, unsupported omissions, rejected AI proposals explicitly marked unverified, stale revision handling, legacy reports, unknown cost/token display, reload/reopen and public-output privacy.
- PASS: deterministic browser E2E across five runtime modes and text/PDF intake, review, overwrite/undo, stale conflict, scan rejection, public privacy; 390px/1280px screenshots inspected.
- PASS: the shared parser fixture campaign now includes 40 individually asserted text cases, 12 generated layout PDFs, and five killed safety mutations (negation/span, target binding, day boundaries, partial collection, replay fingerprint).
- PASS: Windows app/server/contracts checks, schema drift check, regression suite and standalone release build/validation.
- Limitation: WSL/Linux is unavailable in this environment; `wsl --status` confirms it is not installed. No live/paid AI request was made. E2E mock provider made zero external requests.
