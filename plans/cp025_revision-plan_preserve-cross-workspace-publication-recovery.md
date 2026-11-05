# CP025 Revision Plan: Preserve Cross-Workspace Publication Artifacts on Recovery

**Date:** 2026-10-08. **Status:** completed; review ACCEPT 2026-10-08.
**Authority:** `SPEC.md`, `TODOS.md`, CP027–CP028 plan, and the user's explicit V27-06 revision authorization 2026-10-08.
**Dependency:** CP024 V27-01/V27-02/V27-03 and prior CP025 V27-04/V27-05 revisions remain intact.

## Finding

`npm run probe:web-recovery-scope` writes a committed published version and HTML/OG files under a second workspace in a disposable real SQLite/filesystem root, closes the app, then reopens it. Startup recovery preserves only the current workspace's referenced filenames and deletes the other workspace's committed files. The probe reports `reproduced:true` for both HTML and OG image.

Startup recovery also marks pending publish operations only for the active workspace. Since the one-process data root and SQLite file may contain rows for multiple workspaces, every pending operation must be terminalized after process restart, and every committed artifact referenced by any workspace must be preserved.

## Clarifications and Decisions

- User explicitly authorized a separate CP025 revision on 2026-10-08.
- Keep the original CP025 acceptance and previous revision history unchanged; append evidence to the existing CP025 completion log.
- A stopped single-process data root is the only supported recovery model. Do not permit concurrent startup recovery on a live root.
- Recovery may delete unreferenced engine-owned published files/stage files, but must preserve every key referenced by `published_versions` in any workspace.
- Mark pending publish operations across all workspaces as failed with `SERVER_RESTARTED`; do not reactivate tokens, remove tombstones, or alter committed publication pointers.
- No multi-process mode, schema migration, API endpoint, PDF feature, live AI call, cloud action or deployment.

## Changes

1. Make `recoverPublication()` enumerate all pending operations and all committed HTML/OG artifact keys across the shared SQLite data root.
2. On restart, terminalize pending operations in their owning workspace and clean only unreferenced engine-owned artifacts/stages.
3. Add a regression that commits a second workspace's published HTML/image/token/version and a pending operation, restarts the app, and verifies the foreign public page/image/hash and operation state survive correctly.
4. Keep the existing V27-06 probe as executable verification and add a safe summary showing foreign HTML/image preserved and pending operation terminalized.
5. Run API/publication/recovery/editor/E2E, type/build/package/security checks; append results and ACCEPT review to the CP025 log and synchronize TODO before resuming CP027.

## Acceptance

| Criterion | Required evidence |
|---|---|
| R25-V27-06-artifacts | Another workspace's committed HTML and OG image remain byte-identical and publicly readable after restart. |
| R25-V27-06-operations | Pending operation rows across workspaces become failed with `SERVER_RESTARTED`; no token/version pointer is changed. |
| R25-V27-06-cleanup | Existing narrow orphan/stage cleanup and same-root stopped restore tests still pass. |
| Revision close | CP025 log, this plan, TODO, probes and review agree; CP027 resumes only after this gate passes. |

## Rollback

Revert only the recovery query/cleanup behavior and regression if it preserves unreferenced artifacts or fails to terminalize interrupted operations. Keep CP027/CP028 blocked until correct workspace-safe evidence passes.

## Execution and Revision Review — 2026-10-08

- `recoverPublication()` now marks pending publication operations failed with `SERVER_RESTARTED` across every workspace in the stopped data root. Its cleanup reference set includes every committed published HTML and OG key across the database, so another workspace's artifacts are preserved. Unreferenced engine-owned artifacts and staged files retain narrow cleanup.
- Added a real-app restart regression with a second workspace containing committed HTML/OG/token/version state plus a pending operation. After restart both public resources remain byte-identical/readable, the current version/token/epoch stay unchanged, and the interrupted operation becomes terminally failed.
- **Verification:** publication 7/7; API 9/9; preview 9/9; editor 8/8; AI 28/28; renderer 12/12; contracts 22/22; app/contracts typechecks; generated types; CSS/frontend build; preview/editor/publication/AI/E2E/retry browser gates; recovery-scope probe reports `reproduced:false`, with both artifacts preserved and pending operation terminalized; package validation; root test 1/1; audit 0 vulnerabilities.
- **Disposition: ACCEPT.** V27-06 is closed. CP027 resumes `in_progress`; full local acceptance matrix and its chapter review still gate CP028.
- Synthetic local state only; no live AI call, cloud action, external crawler request or deployment.
