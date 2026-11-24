# CP030–CP032 / CP035 Revision Review: Seven Findings

## Date and scope
2026-11-20. Owner-authorized serial phases 1–6 in `../plans/cp030-cp032-cp035_revision-plan_review-findings-gpt-luna.md`. Self-review by the implementation session; no independent reviewer available.

## Verdict
**ACCEPT for the seven reviewed findings.** F01–F07 have reproduction evidence and fixes/tests. CP035 remains in progress for its separate historical home-view/screenshot work. This does not mark the separate real-world-text-coverage revision, CP033/CP034/CP036, or CP029 complete.

## Finding disposition
| ID | Area | Result | Evidence |
|---|---|---|---|
| F01 | PDF layout evidence / CP030 | PASS | Missing/corrupt sidecars fail parse/apply/resolve with stable 409; stale sidecar remains fully unresolved; valid/legacy reconstruction passes. |
| F02 | AI usage / CP031 | PASS | Usage reserved before each provider call and checkpointed after each outcome; CAS/finalization failure preserves known cost/tokens; checkpoint write failure marks uncertain and blocks replay. |
| F03 | Retention / CP031–032 | PASS | Current/replay reports redact label values, proposals, source quotes, dynamic title paths and source-derived notes; explicit expired-source UI disables review. Canonical drafts/replay snapshots remain. |
| F04 | Custom lists/category / CP035 | PASS | Stable editor-only row identities preserve typing through exact preset matches; order, focus, autosave/reload, preset toggles and custom bounded category are verified. |
| F05 | Async draft response / CP032 | PASS | Delayed report for draft A cannot attach to active draft B; publication/report reads are generation-bound. |
| F06 | Normalization false conflict / CP032 | PASS | Empty transient rows and edit-then-revert do not cause a conflict. Concurrent title/language/brief edits remain local while review result remains on server. |
| F07 | Latest failure + last success / CP031–032 | PASS | API returns latest attempt plus last successful non-undone result; UI shows both; undone report is not actionable. |

## Verification
- Windows Node 24 suites: import 192, API 13, AI 30, store 12, preview 12, publication 12, contracts 52, editor 34, render 15, places 16; all pass.
- Browser: `verify:web-import`, `verify:web-import-review-races` (F05/F06/F07 and source expiry; zero external requests), `verify:web-stable-inputs` (all five modes) pass.
- Type/schema: app/server/contracts typechecks and `check:web-types` pass.
- Release: `build:web-release` and `validate:web-release` pass; final build ID `eec9a3d69791`.
- Visual: opened/inspected mobile 390px practical-list and expired-report screenshots, plus 390px/1280px activity-category screenshots.
- No paid/live AI, migration, new dependency, commit, push or deployment.

## Limitations and status disposition
- Linux not verified (WSL unavailable); no cross-platform claim.
- CP030, CP031 and CP032 are completed for the reviewed revision scope. CP035 remains `in_progress` for its pre-existing home-view and broader screenshot follow-ups. Other checkpoint statuses and the separate real-world-text-coverage revision are unchanged.
