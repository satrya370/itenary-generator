# CP025 Revision Plan: Reuse Pending Publish Operation

**Date:** 2026-10-08. **Status:** completed; review ACCEPT 2026-10-08.
**Authority:** `SPEC.md`, `TODOS.md`, `RULES.md`, CP027 plan and the user's explicit revision authorization 2026-10-08.
**Dependency:** CP024 V27-02 revision ACCEPT and CP025 prior V27-04/V27-05 revisions remain intact.

## Finding

`npm run probe:web-publish-retry` creates a valid synthetic itinerary, returns an HTTP `202 pending` to the editor's first Publish request, and returns `202 pending` again after the guide retries. The browser sends a different `operationId` on the second request. `publishSaved()` currently calls `crypto.randomUUID()` for every click and drops the pending ID, so an ambiguous client retry can become a second publish intent rather than an idempotent status retry.

The server already recognizes an in-flight operation ID and returns `pending`; this revision is specifically the editor's retry-intent lifecycle. No fresh operation is permitted for a retry of the same itinerary/revision. A later explicit publish after a completed/revoked operation remains a new intent.

## Clarifications and Decisions

- User explicitly authorized this CP025 revision after the CP027 finding on 2026-10-08.
- Keep the original CP025 accepted contract and V27-04/V27-05 revision history unchanged; append evidence to the existing CP025 completion log.
- Scope pending intent to `(itineraryId, expectedRevision)`. A different itinerary or saved revision must not reuse it.
- Keep the operation ID while server response is `pending` or the request fails without an HTTP response (ambiguous outcome). Clear it after a definitive HTTP response, success, or a different itinerary/revision intent.
- Do not expose IDs/tokens in UI or logs. No new API endpoint, production provider seam, schema change, live AI call, PDF feature or deployment.

## Changes

1. Add a small editor-held publish intent `{ itineraryId, expectedRevision, operationId }`.
2. `publishSaved()` reuses that intent for a retry of the same record/revision; creates a new ID only for a new intent; clears only after definitive completion/error.
3. Preserve the existing user-facing pending status and allow the guide to retry explicitly. An ambiguous transport failure retains the intent.
4. Keep `probe:web-publish-retry` as a deterministic browser regression, now requiring both intercepted `202 pending` attempts to carry the same operation ID. Existing publication service tests continue to prove same-ID pending/replay semantics.
5. Run CP025 API/publication, editor and AI UI regression, typechecks, production build, browser preview/publication and package/security checks; append results and review disposition to the CP025 completion log and update TODO.

## Acceptance

| Criterion | Required evidence |
|---|---|
| R25-pending-retry | Two browser retry attempts after `202 pending` use the same operation ID; different itinerary/revision starts a new intent. |
| R25-definitive-result | Completed operation or definitive HTTP error clears pending intent; a later explicit post-revoke publish can use a distinct ID and new token. |
| R25-regression | Existing duplicate-inflight, replay-after-revoke, stable-link, revocation, publication and editor browser suites pass. |
| Revision close | CP025 log, this plan, TODO and review agree; CP027 can resume after gate closure. |

## Rollback

Revert only the editor pending-intent lifecycle and its regression if retries can be misbound to another itinerary/revision or a completed intent remains sticky. Preserve the failed probe and keep CP027/CP028 blocked until corrected evidence passes.

## Execution and Revision Review — 2026-10-08

- `publishSaved()` now retains a pending intent scoped to itinerary ID and saved revision. Retries after `202 pending` and network failures reuse the same operation ID; a different saved revision starts a fresh ID; definitive HTTP results clear the intent.
- `npm run verify:web-publish-retry` passes six intercepted browser attempts: same ID on pending retry; new ID after Save increments the revision; same ID after network and definitive HTTP failure retries; next intent uses a new ID after definitive failure. No operation IDs are written to evidence.
- Regression gates pass: publication 6/6, API 9/9, preview 9/9, editor 8/8, app/contracts typechecks, generated types, production build, editor/publication/AI UI browser flows, integrated CP027 E2E, package validation, root test 1/1 and audit 0 vulnerabilities. Browser checks report zero external requests/console errors.
- **Disposition: ACCEPT.** CP025 V27-05 pending retry UI behavior is closed. CP027 resumes `in_progress`; its remaining local acceptance matrix and chapter review still gate CP028. No live inference, cloud action or public deployment occurred.
