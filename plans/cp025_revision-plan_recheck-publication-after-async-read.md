# CP025 Revision Plan: Recheck Publication After Async Artifact Read

**Date:** 2026-10-07. **Status:** completed and planner-accepted; see revision section in CP025 completion log.
**Authority:** `SPEC.md` W13, `TODOS.md`, `RULES.md`; CP027 V27-04 probe `output/web-e2e/cp027-probe-summary.json`.
**Dependency:** CP025 V27-05 revision completed/logged; CP027 remains blocked until this revision and E2E rerun pass.

## Reason for Revision

CP027 V27-04 probe reproducibly started a public page GET, allowed `readPublicPage()` to resolve an active bearer token/current version and begin async filesystem read, committed unpublish while the file read was pending, and then observed HTTP 200 with the old HTML after revoke. `readPublicPage()` currently checks token/pointer before `await readFile()` and does not recheck after the async boundary. The published file was deliberately enlarged/rehash-updated only in a disposable test root to force a deterministic read window.

## Clarifications and Decisions

- Structured Ask Question 2026-10-07: user authorized a separate CP025 revision to recheck token/version after file read and before serving. This is distinct from the completed V27-05 replay revision.
- Recheck that the same token is still active, not revoked, and still points to the same current version after the async read completes and before returning bytes to the route. Also recheck the current artifact hash.
- If revoke, rotation or republish won while a page/image was being read, discard the in-memory bytes and return uniform `404`; do not expose the now-retired snapshot through a late response path.
- Keep stable active-link republish, immutable retained versions, permanent token revocation, `no-store`, version/hash checks and no auto-expiry. No CDN/browser-cache feature is introduced.
- Use a one-shot, programmatic-only test barrier between artifact read and the final state check to exercise the exact interleaving. It must not be configurable by HTTP/user input or environment in the production entrypoint.
- No AWS/public deployment, TLS/WhatsApp test, PDF change, fresh AI call or data migration beyond CP025 scope.

## Existing Behavior

- `readPublicPage()` and `readPublicOgImage()` join token + active pointer + current version, await `readFile()`, verify the stored SHA-256 and return bytes without querying active publication again.
- `/i/:token` and `/i/:token/og-image` send those bytes after helper resolution. Repro returned `revokeStatus:200` and `pageStatusAfterRevoke:200` for a read already in flight.
- Unpublish correctly revokes token and increments epoch for later requests; the defect is the artifact-read time-of-check/time-of-use gap.

## Required Behavior

- If unpublish commits while HTML or OG-image bytes are being read, the request returns 404 and no artifact bytes are sent.
- If republish changes current version while bytes are read, the late response cannot serve the previous snapshot under the stable token.
- A normal active GET returns the correct current version and matching hash; a post-revoke new GET stays 404. Historical versions remain retained for owner history.
- Corrupt/missing artifact is uniform 404 and does not leak storage keys/paths. No tokens or bearer URLs in test output/logs.
- The race test is deterministic using an awaited test barrier and cleans it up in `finally`; regular production app has no delay or async callback configured.

## Proposed Changes

1. Mark CP025 `in_progress (revision)`; keep CP027 blocked and CP028 pending. Preserve original CP025 completion and V27-05 revision history.
2. Extend public artifact reads to retain initial version ID/hash, await bytes, run SHA-256 verification, then query publication state again and require the same active token, current version ID and hash before returning bytes. Apply to HTML and OG JPEG.
3. Add an optional programmatic test-only async hook to the public-read service/app factory between file read/hash and final active-state check; production startup passes none, environment/HTTP cannot control it. If this seam cannot stay strictly test-only, use an equivalent injected service dependency without widening external configuration.
4. Add an API race test: publish; start HTML read and pause after file read; commit revoke; release read; assert 404, then repeat for OG-image if needed. Add analogous republish/current-version race where feasible. Confirm a request after revoke returns 404 and normal active reads still return hash-matching bytes.
5. Rerun the V27-04 diagnostic probe and confirm no bytes return after revoke. Keep the probe fixture entirely disposable and its summary token-redacted.
6. Review public URL, CSP/no-store and API ownership contracts; re-run CP025 publication suite and CP027-dependent CP024/editor/browser tests. Append this dated revision to the existing CP025 completion log and update `TODOS.md` only after successful evidence.

## Impact and Regression Risk

- An extra SQLite read per public artifact request adds bounded DB work. The app's accepted deployment model is one process per SQLite root; future multi-process behavior needs its own coordination contract.
- Race implementation must compare both active token and current version. Checking only `revoked_at` misses active republish; checking only content hash may allow a revoked token.
- A test barrier left configured in production could stall public requests; expose only a direct app-factory test seam and assert production main never sets it.
- Denying a response read that began before revoke is intentionally conservative. Users already holding downloaded bytes cannot be recalled; don't claim retrospective recall.

## Verification Plan

```text
npm run test:web-publication
npm run test:web-preview
npm run test:web-api
npm run typecheck:web-app
npm run typecheck:web-contracts
npm run build:web-app
npm run verify:web-publication
npm run verify:web-editor
npm run verify:web-ai-ui
npx tsx scripts/web/probe-cp027-findings.ts
npm run validate
npm test
npm audit --audit-level=moderate
git diff --check
```

Required assertions: hook proves the read reached the interleaving point; revoke commits before release; delayed HTML/OG response is `404` with no old bytes; new-token publish remains functional; old token remains 404; normal active OG content/hash and CP025 version count remain correct. Record actual status/order and safe hashes, never raw URL/token.

## Updated Acceptance Criteria

| ID | Required evidence |
|---|---|
| R25-V27-04-html | Revoke during awaited HTML read causes the pending request to return 404, not the old snapshot. |
| R25-V27-04-image | Revoke during awaited OG-image read returns 404/no bytes; active image remains valid before revoke. |
| R25-version-race | Republish during delayed old-version read cannot return the stale snapshot under current active URL. |
| R25-regression | Stable active link, post-revoke token rotation, same-ID replay safety, hash verification, browser share/history/revoke and prior CP025 fault tests all pass. |
| Revision close | CP025 completion log contains this revision; TODO matches; CP027 may resume only after revision review and reprobe. |

## Rollback

Revert only the post-read state check and test seam if behavior regresses; keep the race regression and CP027 blocked. Preserve token tombstones, immutable versions and user data. No restore of unrelated DB state or clearing publication history to make tests pass.
