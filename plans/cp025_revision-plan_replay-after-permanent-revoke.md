# CP025 Revision Plan: Replay After Permanent Revoke

**Date:** 2026-10-07. **Status:** completed and verified; see revision section in CP025 completion log.
**Dependency:** CP024 revision PASS and completion-log update.
**Authority:** `SPEC.md` W13, `TODOS.md`, `RULES.md`; CP027 probe `output/web-e2e/cp027-probe-summary.json`.

## Reason for Revision

CP027 reproduced V27-05. A first publish with operation A creates a version/token. A second request at the same revision with new operation B hits the same-revision/current-active fast return and does not persist B's operation record. After unpublish permanently revokes A's token, replaying B is treated as a new publish and creates a new token/version. An operation that already returned success can therefore reactivate public publication after revoke, contrary to CP025's accepted contract.

## Clarifications and Decisions

- Structured Ask Question 2026-10-07 authorized separate sequential CP024 and CP025 revisions; CP025 begins only after CP024's revision is logged.
- Preserve stable link on active republish, permanent token revocation, fresh token only for a **new post-revoke publish intent**, and idempotent operation replay.
- Same-revision no-op reuse must persist the caller's operation ID with the exact version/token/activation epoch returned. Replaying it after revoke must never publish, mint a token, or change current state. Return a stable revoked/stale result or conflict.
- Keep the expected-revision and publication-epoch checks, existing bearer-token privacy, retained versions, and no-auto-expiry policy. Do not add user authentication, new slugs, or PDF functionality.

## Existing Behavior

- In `src/server/publication.ts`, `publishSavedRevision()` returns early for an active current version with matching source revision before inserting into `publish_operations`.
- `publish_operations.fingerprint` currently binds itinerary/revision/epoch, and a missing record is interpreted as a new intent. After revoke increments epoch, a replayed but unrecorded operation receives a new fingerprint and creates a fresh token.
- CP027 probe verifies: same-revision reuse HTTP 200; revoke HTTP 200; replay HTTP 200; old token remains denied; publication active with a different new URL.

## Required Behavior

- A same-revision no-op publish records operation ID → exact current version and token activation epoch before returning success.
- Replaying that operation during active state returns the original version/result and creates no additional version.
- Replaying that operation after revoke returns a non-activating conflict/revoked outcome and leaves `active:false`, current version, epoch and token rows unchanged.
- A distinct, explicitly new operation after revoke may create a new token/version, but old token stays 404 forever.
- Race concurrent same-revision no-op and unpublish: transaction ordering is deterministic; any request replayed after committed revoke cannot reactivate the token.
- Preserve cross-itinerary operation-ID conflict, pending-operation behavior, renderer/storage failure and active-republish stable URL.

## Proposed Changes

1. After CP024 revision completes and is logged, set only CP025 `in_progress (revision)`; leave CP027 blocked.
2. Persist same-revision reuse as a completed `publish_operations` row transactionally, including fingerprint/epoch, version and token ID. Define replay handling for recorded operations when their token is revoked so it cannot fall through to new intent creation.
3. Ensure distinct new post-revoke operation IDs still create a new token, while reused ID conflicts or returns revoked state. Do not reset epoch or reuse retired token.
4. Add API tests for same-revision operation B→revoke→replay B, op A replay, new operation C after revoke, same-ID cross-itinerary conflict and concurrent publish/unpublish orderings. Assert DB version/token/pointer/epoch counts and public GETs.
5. Add UI/browser test proving revoke state remains revoked after a delayed/duplicate publish response and that a later explicit Publish produces a different link.
6. Append a dated Revision section to `logs/cp025_completion-log_published-web-link-and-versioning.md`; re-run publication, CP024, editor/browser, build/security and local OG checks. Preserve previous completion and CP027 initial probe as historical evidence.

## Impact and Regression Risk

- Operation reuse recording adds DB writes; transaction must not duplicate a version or expose token before publication state is committed.
- A revoked operation replay must not be classified as a new publish due to changed epoch. New operation IDs remain the explicit way to republish after revoke.
- Concurrent operations/unpublish can change state while an operation is rendering. Check state before commit and leave old immutable version/current token intact on a conflict.
- Do not log raw share URL/token in operation results or tests. Keep existing external Meta cache caveat.

## Verification Plan

```text
npm run test:web-publication
npm run test:web-preview
npm run typecheck:web-app
npm run test:web-api
npm run build:web-app
npm run verify:web-publication
npm run verify:web-editor
npm run verify:web-ai-ui
npm run validate
npm test
npm audit --audit-level=moderate
git diff --check
```

Re-run `npx tsx scripts/web/probe-cp027-findings.ts`; V27-05 must no longer be reproduced. Test only synthetic roots; no live HTTPS or cloud deployment in this revision.

## Updated Acceptance Criteria

| ID | Required evidence |
|---|---|
| R25-V27-05 | Replaying any previously successful same-revision operation after revoke cannot activate link or create a fresh token/version. |
| R25-new-intent | New operation after revoke deliberately creates a distinct active token/version; old token remains 404 for HTML and OG image. |
| R25-race | Concurrent same-revision publish/unpublish orderings preserve epoch/token invariant; one committed result per intent. |
| Revision close | Existing CP025 log has dated revision evidence; API/UI/race tests and visual/boundary gates pass; CP027 remains blocked until chapter re-review. |

## Rollback

Revert only CP025 revision code/migration after reviewing the diff. Restore a matching stopped full data root if migration compatibility requires it; never delete revoked token tombstones or published versions. Keep CP027 blocked and preserve the reproduced probe if the invariant cannot be proven.
