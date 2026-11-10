# CP025 Completion Log: Published Web Link and Versioning

## Result

- Status: `completed` for standalone implementation; live WhatsApp/Meta crawler card appearance remains a CP028 public-HTTPS deployment verification.
- Summary: Added immutable published HTML snapshots, stable random bearer links, atomic/idempotent publish, permanent revoke/token rotation, version history, and initial-HTML Open Graph metadata plus a token-scoped crawler image endpoint.
- Completed at: 2026-10-07.

## Plan Reference

- Chapter plan: `../plans/cp024-cp025_implementation-plan_preview-publish-and-share-links.md` (§ CP025).
- Dependency: CP024 completion log `cp024_completion-log_draft-preview-and-publish-validation.md`.
- Product decision: PDF rendering/export removed; CP026 is `removed` in `TODOS.md`.

## Changes Made

- Added additive SQLite tables for immutable `published_versions`, publication pointer/epoch, random share tokens, and idempotent publish operations. Snapshot rows store canonical brochure content, HTML/OG image storage keys, hashes, source revision and schema version; writing brief/notes remain private.
- Implemented operation-ID + expected-revision publication with server-side CP024 validation, saved snapshot rendering, self-contained CSS/fonts/assets and OG JPEG creation. UUID staging + atomic rename precede a short SQLite transaction that rechecks draft revision and publication epoch. A failed render/storage/transaction leaves the old version/link intact and removes uncommitted files.
- Republish while active preserves the URL and atomically updates the current version. Unpublish retires the token and increments an epoch; a new publish creates a new token, and replay of a pre-revoke operation cannot reactivate it. Committed history/assets are retained; no expiry/purge job exists.
- Added `/i/{token}` scriptless HTML route and `/i/{token}/og-image` JPEG route. Each request resolves active token → current committed version and verifies the stored artifact hash. Unknown/revoked/missing/corrupt artifact returns 404. Public HTML has no-store/noindex/referrer/nosniff/CSP headers.
- Public HTML initial response contains escaped `og:title`, `og:description`, absolute `og:url`, `og:image`, dimensions/type and `twitter:card`; the image is a 1200×630 JPEG cropped from the owned hero asset or derived from the canonical destination gradient.
- Added owner publication status/history, draft-diff state, Publish/Republish, copy link, Unpublish confirmation and revoked state. Documented `SHARE_ORIGIN` as trusted origin configuration; it is never inferred from request headers.
- Added `test:web-publication` and `verify:web-publication`. No PDF jobs, Chromium PDF rendering, export/download routes, or AWS deployment were added.

## Files Affected

| Artifact | Change |
|---|---|
| `src/server/store.ts`, `src/server/publication.ts`, `src/server/app.ts` | Additive migration, transaction/filesystem lifecycle, owner/public endpoints and recovery. |
| `src/api/client.ts`, `src/editor/main.tsx` | Publication DTOs and lifecycle/history/share-link UI. |
| `tests/web/publication.test.ts`, `scripts/web/verify-publication.ts` | API failure/race/restart/retention/access tests and browser/crawler-like verification. |
| `package.json`, `.env.web.example`, `docs/editor-ai-api-contract.md`, `docs/engine-runtime-contract.md`, `docs/standalone-development.md`, `SPEC.md`, `TODOS.md` | Verification commands, trusted share origin, API/runtime/product contracts and checkpoint evidence. |
| `output/web-publication/` | Redacted verification summary, public page screenshots and synthetic OG image. No bearer token is recorded. |

## Verification Performed

| Verification | Result | Evidence |
|---|---|---|
| Publication API/version/token tests | PASS | `npm run test:web-publication`: 5/5. Covers OG metadata/image dimensions, private brief exclusion, restart and stopped full-root backup restore, same-revision reuse, operation replay/pending, stable active republish, failed validation/SQLite commit preserving old page and cleaning orphan files, revoke, permanent old-token 404, post-revoke token rotation, and a 2-year-old token remaining active until revoke. |
| CP024 preview/API | PASS | `npm run test:web-preview`: 6/6; `npm run test:web-api`: 9/9. |
| Contracts/render/editor/AI | PASS | Schema types check; contracts 22/22, renderer 12/12, editor model 8/8, AI 28/28; app/contracts typechecks pass. |
| Build/package/security | PASS | `npm run build:brochure-css`; `npm run build:web-app`; `npm run validate`; `npm test` 1/1; `npm audit --audit-level=moderate` 0 vulnerabilities; `git diff --check` clean apart from line-ending notices. |
| Preview browser | PASS | `npm run verify:web-preview`: saved revision, separate diagnostics, sandboxed rendered content, phone/desktop, zero external requests or console errors. |
| Publication browser/OG | PASS | `npm run verify:web-publication`: publish from editor, origin HTML title/description/url/image, JPEG MIME and nonempty bytes, active republish preserves link, revoke denies page/image, re-publish rotates token; no private brief, external requests or console errors. Inspected phone/desktop pages and `cp025-og-image.jpg`. |
| Existing browser regressions | PASS | `npm run verify:web-editor` (four modes, 14 days, 60 spots; both viewports); `npm run verify:web-ai-ui` (full manual/AI lifecycle); zero external requests/console errors. |

All tests use temporary local SQLite/filesystem roots and synthetic fixture content. Browser tests confirm crawler-like no-cookie/no-JavaScript initial HTML on localhost. **They do not assert that WhatsApp/Meta displays a live card:** this requires a public HTTPS deployment/origin reachable by external crawlers (CP028). Meta may retain cached cards after republish.

## Acceptance Criteria Results

| Criterion | Result | Evidence |
|---|---|---|
| R25-1 — immutable/idempotent atomic publish | PASS | Same revision reuses one version; different revision commits new snapshot; pending duplicate/replay and injected SQLite insert failure tested. Existing public version remains available after failure. |
| R25-2 — stable token/revoke/rotation and private boundary | PASS | Republish keeps active token; revoke permanently blocks old HTML/image; subsequent publish creates a distinct token; private brief/notes excluded from page. |
| R25-3 — crawler-compatible OG contract | PASS locally | Initial HTML has escaped absolute OG metadata and reachable matching JPEG endpoint; no cookie/JS needed. Internet HTTPS/WhatsApp card appearance is deferred to CP028, and external cache behavior is documented. |
| R25-4 — retention/recovery/visual evidence | PASS | No expiry/purge implementation; a timestamp aged two years still resolves until revoke; process restart and stopped full-root backup restore active URL/image; mobile/desktop HTML and OG image inspected. |

## Remaining Limitations

- The runtime still binds to loopback. A public HTTPS share origin/perimeter with management APIs kept private must be configured and tested in CP028 before sending links to WhatsApp from outside the host.
- WhatsApp/Meta caches cards externally; republish updates the origin page and image but cannot guarantee immediate preview refresh.
- Existing local legacy `scripts/render-pdf.mjs`/print fixtures are historical and not wired into this app's UI/API/deployment. Product PDF export, job, worker and download routes remain removed.

## Revision: 2026-10-07 - Persist Same-Revision Publish Reuse Before Revoke

### Revision Plan

- `../plans/cp025_revision-plan_replay-after-permanent-revoke.md`
- CP027 initially reproduced V27-05 on a temporary real SQLite/filesystem root; sequential CP024 → CP025 revisions were authorized by the user.
- CP024 V27-01 revision completed and was logged first.

### Changes Made

- Same-revision/current-active no-op reuse now writes a completed `publish_operations` mapping transactionally, binding the supplied operation ID to the existing immutable version, active token and publication epoch before returning success.
- If state changes during that reuse decision, the operation is recorded as a failed/conflict outcome instead of leaving an untracked successful ID that can later become a new publish.
- A replay whose recorded fingerprint belongs to a revoked epoch is rejected with conflict; only a distinct explicit operation after revoke may create a new token/version. Existing token tombstones and old version artifacts remain unchanged.
- Added regression steps for no-op ID → revoke → same-ID replay, inactive status after replay, explicit new operation/token, stable active republish, and publication version count.

### Verification Performed

| Verification | Result | Evidence |
|---|---|---|
| Publication API/recovery tests | PASS | `npm run test:web-publication`: 5/5, including same-revision no-op operation replay after revoke and a new operation after revoke. Existing restart, stopped full-root restore, injected SQLite failure, retention, stable republish and concurrent pending tests pass. |
| CP027 diagnostic probe | PASS for V27-05 | `npx tsx scripts/web/probe-cp027-findings.ts`: replay status 409, old token remains denied, publication stays inactive, no replacement URL from replay. V27-01 also remains not reproduced after CP024 revision. |
| Preview/API/types | PASS | `npm run test:web-preview` 7/7; `npm run test:web-api` 9/9; typechecks and generated types pass. |
| Browser regressions | PASS | `npm run verify:web-publication`, `npm run verify:web-editor`, `npm run verify:web-ai-ui`: lifecycle, mobile/desktop and local OG contract pass; zero uncaught console errors/external requests. |
| Build/package/security | PASS | `npm run build:web-app`; `npm run validate`; `npm test` 1/1; `npm audit --audit-level=moderate` 0 vulnerabilities; `git diff --check` clean (line-ending notices only). |

### Acceptance Criteria Results

| Criterion | Result | Evidence |
|---|---|---|
| R25-V27-05 — same-revision reuse after revoke | PASS | Operation B reuse is recorded; after revocation B replay returns 409 and leaves publication inactive/old URL denied. |
| R25-new-intent — deliberate republish after revoke | PASS | Fresh operation creates new token/version; old token remains 404 for HTML/image. |
| R25-race/regression | PASS | Duplicate pending/same-ID one-version behavior, revision check, active republish, SQLite transaction failure and UI share lifecycle remain passing. |
| Revision close | PASS | Executed revision evidence, tests and TODOS revision status are updated; CP027 still needs the full E2E matrix and its own chapter review. |

### Remaining Limitations

- CP027 remains blocked until the full all-mode E2E/recovery/asset/policy matrix is run and chapter review accepts; local WhatsApp card appearance/public HTTPS remains deferred to CP028's future deployment authorization.
- No AWS provisioning, public staging, external Meta/WhatsApp request or new AI inference occurred in this revision.

## Revision: 2026-10-07 - Persist Same-Revision Reuse Across Revoke

### Revision Plan

- `../plans/cp025_revision-plan_replay-after-permanent-revoke.md`
- CP027 V27-05 reproduction and user authorization are recorded in `../plans/cp027-cp028_implementation-plan_standalone-verification-and-deployment-readiness.md` and `TODOS.md`.
- CP024 V27-01 revision was completed/logged first.

### Changes Made

- Same-revision/current-active reuse now commits a `publish_operations` row for the caller's operation ID with the exact existing version, token and epoch.
- The reuse transaction rechecks state before returning. If the publication state changed, the operation is recorded as failed/conflicted rather than left untracked.
- A recorded operation bound to an old epoch returns conflict after revocation. Only an explicitly new operation can create the post-revoke token/version; old token tombstones remain permanent.

### Verification Performed

| Verification | Result | Evidence |
|---|---|---|
| Publication API | PASS | `npm run test:web-publication`: 5/5; same-revision op B → revoke → replay B returns `409`, publication remains inactive, old token stays denied; a new operation creates a distinct URL. Duplicate pending/replay, stable active republish, transaction-failure cleanup, restart and full-root restore pass. |
| CP027 probes | PASS for V27-01/V27-05 | `npx tsx scripts/web/probe-cp027-findings.ts`: V27-01 not reproduced; V27-05 replay returns 409 and leaves `active:false`. |
| Regression/build/browser | PASS | CP024 preview 7/7, API 9/9, both typechecks/generated types, build, publication/editor/AI browser flows pass. |
| Package/security | PASS | `npm run validate`, `npm test` 1/1, audit 0 vulnerabilities and `git diff --check` clean except line-ending notices. |

### Acceptance Criteria Results

| Criterion | Result | Evidence |
|---|---|---|
| R25-V27-05 — operation reuse after revoke | PASS | Reused op is persisted; replay after revoke conflicts and does not activate or create a new URL. |
| R25-new-intent — explicit publish after revoke | PASS | Different operation ID after revoke creates a new token; old token remains 404. |
| R25-race/regression | PASS | Concurrent same-ID pending resolves to one version; same-revision idempotence, active republish, stale epoch and failure cleanup remain passing. |
| Revision close | PASS | Revision plan and this dated section recorded; CP025 returned to completed. |

### Remaining Limitations

- CP027 found a separate same-size, pixel-corrupt asset preview gap (V27-03/CP024) after this CP025 revision passed. It is not in this revision's scope; CP027 is blocked pending the structured revision gate for CP024.
- No AWS provisioning, external HTTPS/WhatsApp request or new AI inference occurred.

## Revision: 2026-10-07 - Recheck Public State After Artifact Read

### Revision Plan

- `../plans/cp025_revision-plan_recheck-publication-after-async-read.md`
- CP027 reproduced V27-04 with a temporary, bounded 32 MiB published artifact and revoke during the asynchronous read. The user authorized this separate CP025 revision.
- CP025 V27-05 revision passed first; this revision preserves its operation/tombstone behavior.

### Changes Made

- `readPublicPage()` and `readPublicOgImage()` retain the initial version ID/key/hash, read and hash-check the file, then query the active token/current version/hash again before returning bytes to the route.
- If unpublish/revoke or republish changes state during the read, the helper returns no artifact and routes return uniform 404 instead of serving retired/stale bytes.
- Added a direct app-factory-only `afterPublicArtifactRead` asynchronous barrier for deterministic race testing. Production `main.ts` never configures it and HTTP/environment inputs cannot control it.
- Added deterministic race tests pausing after HTML/image read, committing revoke, then resuming; added same-token republish during HTML read and verified stale version denial/current version availability.

### Verification Performed

| Verification | Result | Evidence |
|---|---|---|
| Public route race tests | PASS | `npm run test:web-publication`: 6/6; revoke during pending HTML and OG-image reads returns 404; republish during pending old-version read returns 404 and a subsequent GET serves new current content. |
| CP027 probe | PASS for V27-04 | `npx tsx scripts/web/probe-cp027-findings.ts`: page read paused across revoke returned `404`, not prior HTML; V27-01/V27-03/V27-05 also remain not reproduced. |
| API/preview/type regression | PASS | `npm run test:web-preview` 8/8; `npm run test:web-api` 9/9; app/contracts typechecks and generated types pass. |
| Browser/package/security | PASS | Publication/editor/AI browser checks, build, validation, audit and diff checks pass; no external requests/console errors or token evidence. |

### Acceptance Criteria Results

| Criterion | Result | Evidence |
|---|---|---|
| R25-V27-04-html | PASS | Deterministic read barrier holds HTML until after revoke; route returns 404 with no old page. |
| R25-V27-04-image | PASS | Deterministic read barrier holds OG image until after revoke; route returns 404/no image bytes. |
| R25-version-race | PASS | Republish during old snapshot read invalidates pending old response; next response is the new version under the stable active URL. |
| R25-regression | PASS | Existing stable URL, token rotation, operation replay, hash, publication history and UI/browser tests remain passing. |
| Revision close | PASS | Plan, dated revision evidence and TODO status align; CP027 may resume its full matrix. |

### Revision Review: 2026-10-07

- Reviewed the read path: initial token/current-version lookup is followed by async file read/hash and a second active-token/current-version/hash lookup before bytes return. Both HTML and OG-image use the guard; route headers and CSP remain unchanged.
- The programmatic barrier is absent from production `main.ts`, and no public request data controls it. Race, normal read, revoke, rotation and restart tests pass.
- **Disposition: ACCEPT.** CP025 V27-05 and V27-04 revisions are closed. CP027's full E2E and final chapter review remain required before CP028.

### Remaining Limitations

- A response whose bytes have already been handed to the operating system before revoke cannot be recalled; this revision denies responses whose post-read authorization check observes the revoke/republish.
- Public HTTPS/WhatsApp crawler behavior and AWS readiness remain deferred under the readiness-only decision.
- CP027 standalone end-to-end and CP028 deployment readiness remain pending. This log does not claim AWS deployment or production availability.

## Revision: 2026-10-08 — Reuse Pending Publish Operation in UI

### Revision Plan

- `../plans/cp025_revision-plan_reuse-pending-publish-operation.md`
- CP027 browser probe `output/web-e2e/cp027-pending-retry-probe.json` reproduced a new operation ID on a second click after `202 pending`. User explicitly authorized this CP025 revision on 2026-10-08.

### Changes Made

- The editor retains one pending publish intent scoped to the current itinerary and expected saved revision.
- A retry after a server `pending` response or an ambiguous network error reuses the same operation ID. Saving a new revision starts a distinct intent; definitive HTTP success/failure clears the old intent.
- No new endpoint, database schema, public test seam or production provider behavior was added.

### Verification Performed

| Verification | Result | Evidence |
|---|---|---|
| Pending retry browser regression | PASS | `npm run verify:web-publish-retry`: 6 intercepted requests prove same ID across pending/network/HTTP retries, a new ID after revision change and a fresh intent after definitive failure. Summary: `output/web-e2e/cp027-pending-retry-probe.json`. |
| Publication/API/editor | PASS | Publication 6/6; API 9/9; editor 8/8; preview 9/9. |
| Type/build/contracts | PASS | App/contracts typechecks; generated types check; production web build succeeds. |
| Browser/CP027 regression | PASS | Editor, public publication, AI UI and integrated CP027 E2E pass; 0 external requests/console errors. |
| Package/security | PASS | `npm run validate`; `npm test` 1/1; audit 0 vulnerabilities. |

Only synthetic local data and a deterministic provider double were used. No live inference, cloud call, external crawler request or deployment occurred.

### Acceptance Criteria Results

| Criterion | Result | Evidence |
|---|---|---|
| R25-pending-retry | PASS | Two `202 pending` attempts and retries share one operation ID. |
| R25-definitive-result | PASS | New saved revision and post-definitive-error intent receive new IDs; ambiguous network failure retains the same ID. |
| R25-regression | PASS | Publication server races, replay-after-revoke, stable-link and editor/publication/AI browser suites pass. |
| Revision close | PASS | Revision plan, log, TODO and re-review agree. **Disposition: ACCEPT (2026-10-08).** CP025 remains completed with all authorized revisions passed; CP027 resumes in progress; CP028 remains pending until CP027 closes. |

## Revision: 2026-10-08 — Preserve Cross-Workspace Published Artifacts on Recovery (V27-06)

### Revision Plan

- `../plans/cp025_revision-plan_preserve-cross-workspace-publication-recovery.md`
- CP027 probe `output/web-e2e/cp027-recovery-scope-probe.json` reproduced deletion of another workspace's committed HTML/OG files during a same-root application restart. User explicitly authorized this separate CP025 revision on 2026-10-08.

### Changes Made

- Startup recovery now terminalizes pending publish operations in every workspace as `failed/SERVER_RESTARTED` after the single process has stopped.
- The recovery reference set now includes committed HTML and OG-image keys from every workspace. Only unreferenced engine-owned artifacts and staged files are eligible for cleanup.
- Added a real SQLite/filesystem restart regression for a second workspace with active page/image/token/version state and a pending operation.

### Verification Performed

| Verification | Result | Evidence |
|---|---|---|
| Workspace recovery test | PASS | `npm run test:web-publication`: 7/7; foreign HTML and OG remain byte-identical and publicly readable; pointer/token/epoch unchanged; pending operation becomes `SERVER_RESTARTED`. |
| Recovery scope probe | PASS | `npm run probe:web-recovery-scope`: `reproduced:false`, `foreignCommittedHtmlPreserved:true`, `foreignCommittedOgImagePreserved:true`, `pendingOperationTerminalized:true`. |
| Existing regressions | PASS | API 9/9; preview 9/9; editor 8/8; AI 28/28; renderer 12/12; contracts 22/22; app/contracts typechecks and generated types pass. |
| Build/browser | PASS | CSS/frontend production builds; preview/editor/publication/AI UI and integrated E2E/pending-retry browser verifications pass with no external requests or console errors. |
| Package/security | PASS | `npm run validate`; `npm test` 1/1; `npm audit --audit-level=moderate` 0 vulnerabilities. |

Only disposable local synthetic data was used; no live AI, external crawler, cloud or deployment action occurred.

### Acceptance Criteria Results

| Criterion | Result | Evidence |
|---|---|---|
| R25-V27-06-artifacts | PASS | Other workspace's committed HTML and image survive restart unchanged and are still served by public routes. |
| R25-V27-06-operations | PASS | Pending operation becomes failed with `SERVER_RESTARTED`; published pointer, active token and epoch remain unchanged. |
| R25-V27-06-cleanup | PASS | Existing orphan/stage cleanup and stopped full-root restore regressions pass. |
| Revision close | PASS | Revision plan/log/TODO agree. **Disposition: ACCEPT (2026-10-08).** CP025 completed; CP027 resumes in progress, CP028 pending its completion. |

## Revision: 2026-11-10 - Guide-centric schema web-2.0.0 (R4/R6)

### Revision Plan

`plans/cp019-cp025_revision-plan_guide-centric-schema-and-editor.md` (stage R4 publication parts, R6).

### Changes Made

- Publication works on v2 snapshots: agency from the workspace profile, the writing brief is not leaked to the public page, published HTML stays immutable; `publication.test.ts` includes a test with the real renderer.
- R6: `verify-publication.ts` selects the title field by `data-field-path`; `probe-publish-retry.ts`, `probe-recovery-scope.ts`, `probe-cp027-findings.ts`, `verify-e2e.ts` and `tests/web/cp027-fixtures.json` were ported to v2 fixtures and field names (manifest keys: `dayIds`, `firstPlace`, `guidePlaces`; scope labels kept as an independent check against the locale catalog and are matched in the page source, because `innerText` is upper-cased by CSS).
- Commits: `5b0f183`, `73168be`, R6 commit.

### Verification Performed

Run on 2026-11-10: `test:web-publication` 12/12; `verify:web-publication` (stable link on republish, revoked token permanently denied, rotation, OG image 200 `image/jpeg`, private brief absent); `verify:web-publish-retry` and `probe:web-recovery-scope` (`reproduced: false`); `verify:web-e2e` status `passed`: AI apply and save, preview, publish, crash after artifact promotion with `SERVER_RESTARTED` on replay, graceful restart, republish keeping the link, revoke and rotate, four modes, six locales, long copy (3675 code points), owned asset and OG, 14-day and 60-place stress; `build:web-release` and `validate:web-release` (`valid`, 39 files).

### Acceptance Criteria Results

Plan criterion 8 (verify suites, release build/validation, screenshots inspected): PASS. Criterion 9 (tokens, revocation, immutability unchanged): PASS. Joint review: pending.

### Remaining Limitations

- `verify:web-readiness` (Linux container run) was ported to v2 but **not run**: the Docker daemon is not running on this machine. The CP028 evidence file from 2026-10-09 is unchanged.
- `verify:web-systemd` was not run (not part of this stage).
- CP status in `TODOS.md` is not changed by this section; the reviewer decides after the joint review.
