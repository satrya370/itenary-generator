# CP031 Revision Plan: Private Review Resolution

## Reason for Revision
CP032 hardening requires selectable unresolved candidates, server-side evidence validation and revision-safe resolution. Existing CP031 reports record rejected reason codes but not a resolvable candidate with its proposed value and complete source evidence, and expose no resolution endpoint. Building an interactive UI without this contract would falsely imply safety.

## Clarifications and Decisions
- On 2026-11-14 the owner requested CP032 hardening on a separate branch, accepted mock-only verification, and authorized a local commit only after completion; no push or paid AI calls.
- The owner explicitly authorized reopening CP031 serially for the minimum private review backend necessary for CP032. Preserve all other statuses, including CP032's historical in-progress status; do not claim the earlier CP033–CP036 dependency exception resolves their acceptance.
- Keep source evidence private and tied to workspace/retention. Ambiguous results are not auto-applied. No deploy. Any migration or change to canonical schema needs a separate decision if unavoidable.

## Existing Behavior
`import_operations.report_json` stores accepted evidence and rejection codes but discarded candidates cannot be selected. CP030 parse returns conflicts and source blocks. No candidate-resolution API exists.

## Required Behavior
Store versioned private unresolved candidates with source/target identity and reasons; retain legacy report compatibility. Provide workspace-scoped resolution that re-reads/revalidates source and target against the current source, validates canonical output, honors expected revision atomically, rejects stale requests, and records select/edit/ignore decisions without publishing evidence. Manual edits must never be labeled source-verified. Source deletion must prevent unverified application. Never auto-apply unsafe alternatives.

## Proposed Changes
1. Audit current operation persistence, source-retention, parse conflicts, candidate creation and revision CAS; design additive private report records without altering canonical itinerary schema.
2. Implement bounded source-conflict candidates and private retrieval/resolution; retain bounded rejected-AI proposals only as explicitly unverified diagnostics, with source line refs where available; never make them actionable as source-backed facts. Explicitly report unsupported/omitted inputs when safe candidates cannot be formed.
3. Add deterministic API tests for ambiguous scalar selection, ignored and manual edits, stale revision, tampered IDs/evidence, workspace isolation, missing source, replay, privacy and legacy reports.
4. Review implementation before testing; fix findings and repeat. Update CP031 completion log and status only when all criteria pass, then plan CP032 UI and browser verification separately.

## Impact and Regression Risk
Source leakage, stale writes, unsafe target attribution and retained old reports are high-risk. Fail closed, use existing workspace and CAS patterns, never trust client evidence, and test public outputs for leaks. No paid provider calls or new dependencies.

## Verification Plan
Run focused server tests, complete import/API/publication/AI suites, server typecheck, schema check and diff check. Use only injected deterministic providers. Record exact results and known limitations; do not claim completion if review or a gate fails.

## Updated Acceptance Criteria
- Actionable candidates have server-created stable IDs, bounded original source references and explicit target/status; non-actionable omissions remain review-only.
- Resolve select/edit/ignore is workspace-scoped and expected-revision safe; source references and target values are revalidated server-side, no client-authored evidence is trusted.
- Manual edits carry manual provenance, legacy reports remain readable, and no private evidence appears in published artifacts.
- No regressions in existing model routing, CP030 import, replay and undo. CP032 implementation begins only after CP031 is verified and logged.

## Gate Results (2026-11-14)
- PASS: bounded scalar conflicts use server-issued IDs; server rehashes and reparses source; select/edit/ignore is workspace scoped, CAS protected, and transactionally updates draft/report. Tampered/missing source fails closed.
- PASS: AI guard failures are shown as bounded, unverified diagnostics only; rejected proposals cannot be selected as source evidence. Retention strips proposal text and legacy accepted quotes, including replay snapshots.
- PASS: replay fingerprints bind operation to source hash and request arguments; replay returns original record/report, mismatch fails closed, and draft+operation completion is atomic. Injected completion/undo ledger failures roll back draft state.
- PASS: legacy report, workspace isolation, stale revisions, public output, parser/provider regressions and deterministic E2E gates ran on Windows with doubles.
- Limitations: no Linux execution, paid/live provider, full 40-text/12-layout labeled corpus or mutation-test campaign. These are recorded as verification limitations; no cross-platform/live/universal accuracy claim.

## Rollback
Revert only this revision's additive backend and tests. Preserve prior model-routing/CP030 work and never fall back to unsafe auto-application. Report unresolved candidates without offering misleading selection if resolution is unavailable.
