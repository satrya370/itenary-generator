# CP032 Review Log: Import UI, report panel, browser E2E

Reviewer: Claude Haiku 5.5, same session as the executor. Date: 2026-11-11. Commit reviewed: `26e3baf`.
**Independence caveat:** a separate reviewer could not be run (subagent blocked by the auto-mode hook). This is a self-review.

## Verdict

**ACCEPT pending owner acceptance.** One real defect was found by the live run and fixed earlier in this stage (prompt did not name the reply keys). The UI and the E2E were checked by screenshot and by assertions.

## Checks made

| Check | How | Result |
|---|---|---|
| Import screen on a phone | Screenshot at 390 | Was below the sidebar; fixed (sidebar hidden while importing). Re-checked: first on screen. |
| Report panel on desktop | Screenshot at 1280 | Filled count, missing fields as clickable paths, "Tanpa AI" correct, source toggle and undo present. |
| Publish lock | E2E asserts the button is disabled while required fields are empty | Passes. |
| Overwrite confirmation | E2E asserts the alertdialog text, then the replacement | Passes. |
| Undo | E2E clicks "Batalkan import" and checks the title is restored | Passes. |
| Unsaved changes block import | E2E asserts the header button is disabled | Passes. |
| Public page has no source text | E2E fetches the share URL and checks for "Jam kumpul:" and "Titik kumpul:" | Passes. |
| Scanned PDF | E2E checks the plain message and that nothing is created | Passes. |
| Live model output | Six live imports, then inspection of three against sources | Found the missing-keys defect (fixed); after the fix, outputs match the sources. |
| Forbidden patterns | Scan of new UI, scripts and import code | Clean. |

## Findings

| ID | Severity | What | Fix |
|---|---|---|---|
| U1 | Medium | On a phone the import screen was below the draft list, so the entry point led to a screen the user had to scroll to find. | Sidebar hidden while importing. |
| U2 | High (found by live run, earlier in stage) | Extraction prompt did not name the reply keys; destination guide places were rejected by schema. | Prompt lists the exact keys; unit test added. |
| U3 | Low | The import screen's AI note reads the writing-AI credential, not the extraction double; only visible in the E2E. | Documented in the stage log; production uses one credential. |

## Open items (not blocking)

- Multi-day live imports: no model reply inspected against the source.
- The report panel on a phone was not screenshotted separately.
- Restart during an import is not tested in the browser (covered by the server tests).
- Copy lives in `src/editor/import/copy.ts`, not `labels.ts` (deviation recorded).

## Revision review: 2026-11-14

The hardening revision was re-reviewed against `plans/cp032_implementation-plan_import-review-hardening.md` and the shared CP030–CP032 safety requirements.

| Check | Result |
|---|---|
| Conflict choices and stale revision | PASS; source revalidated server-side, CAS conflict leaves canonical draft unchanged. |
| Rejected AI output | PASS; visibly marked unverified, non-actionable, escaped, and never applied to the draft. |
| Evidence retention | PASS; legacy quotes and rejected proposal text are removed when the associated source ages out. |
| Replay/undo atomicity | PASS; request mismatch rejected; original result preserved; injected ledger failures roll back writes. |
| Browser modes, text/PDF, scan, overwrite/undo/reload, public privacy | PASS with deterministic provider; no external requests or console errors. |
| Visual 390px/1280px | PASS; `cp032-review-*` and `cp032-rejected-ai-*` screenshots opened and inspected. |
| Release and types | PASS on Windows Node 24; release validation reports valid. |

Verdict: ACCEPT for CP032's active revision plan. Not an acceptance of Linux, live-provider, 40/12 golden-corpus or mutation-test gates in the broader shared hardening plan; those limitations remain explicit and no universal accuracy claim is made.

### Follow-up corpus gate
- 40 labeled text assertions and 12 generated layout-PDF intake/dry-run cases passed on Windows.
- Five safety mutations were run and killed through `verify:web-import-mutations`.
- Linux remains unavailable (`wsl --status`: not installed); no live provider call was made.
- CP032 revision verdict remains ACCEPT; no universal accuracy/cross-platform claim.
