# CP024–CP025 Implementation Plan: Preview, Publish and Share Links

**Date:** 2026-10-07. **Status:** CP024 and CP025 implemented, verified and planner-accepted; see separate completion logs and `logs/cp024-cp025_planner-review_2026-10-07.md`.
**Authority:** `SPEC.md`, `TODOS.md`, `RULES.md`, canonical `web-1.0.0`.
**Execution:** CP024 → CP025; one CP `in_progress`, separate completion logs, then planner chapter evaluation. CP026 (PDF export) is removed from the standalone product roadmap; CP027 now follows CP025.
**Entry gate:** CP021–CP023 revision logs exist, but chapter planner re-review is pending. **Do not execute CP024 until a recorded ACCEPT exists.** This plan does not confer acceptance.

## Objective

Deliver a safe saved-draft preview and actionable publish validation, then immutable published HTML versions at stable, revocable share links. Public HTML includes Open Graph metadata and a crawler-readable preview image so WhatsApp can generate a link card. Preserve guide copy, manual Save, workspace boundaries and standalone engine. There is no PDF rendering, export, job, UI or download route in this scope.

| CP | Independently verifiable result | Gate |
|---|---|---|
| CP024 | Safe preview of saved drafts plus publish-readiness diagnostics. | CP023 logged and prior chapter ACCEPT. |
| CP025 | Atomic publication, immutable HTML snapshots, stable/revocable share link and WhatsApp-compatible OG metadata/image. | CP024 completed/logged. |

## Clarifications and Decisions

Structured decisions from 2026-10-07:

| ID | Decision | Consequence |
|---|---|---|
| D24-1 | One chapter. | Shared plan; CP024 and CP025 execute in order with separate completion logs. |
| D24-2 | Preview + diagnostics. | Structurally safe incomplete draft may render; publish errors/warnings shown separately. |
| D24-3 | Warn explicitly on ambiguous schedules. | Never invent time/duration. Provable overlap/cap violation remains blocking. |
| D25-1 | Retain + rotate. | Active republish preserves token; revoke permanently retires it; post-revoke publish creates a new token. Retain snapshots without automatic expiry/deletion. |
| D25-2 | Web share card replaces PDF deliverable. | Open Graph metadata and public preview image are part of CP025. PDF rendering/export is removed from the planned product scope. |

Technical defaults:

- Node 24/Fastify/SQLite, React/Vite/Tailwind v4; additive implementation, no opportunistic refactor.
- Manual Save precedes preview/publish; use `{expectedRevision}` and server-held saved content. No implicit Save, paid AI generation or automated itinerary repair.
- Management stays loopback/private. `SHARE_ORIGIN` is trusted configuration; never derive public URLs from `Host`/forwarded headers. Internet deployment/perimeter work remains CP028.
- No automatic retention/deletion: committed canonical snapshots, HTML and embedded assets remain until a separately approved deletion policy. Link availability ≥12 months depends on origin/storage reachability. Revoke blocks public access but does not remove owner history.
- Preview/render bounds: 20 MiB total distinct raster assets, 64 MiB final inline HTML, 30-second deadline and one active HTML render per workspace; enforce server-side.
- WhatsApp crawler needs a reachable public HTTPS page and image URL without login/cookies. Use absolute `og:url` and `og:image` from configured origin; recommended preview image 1200×630 JPEG/PNG, bounded size, served by token-scoped public route from the committed version. Never use `data:` as the OG image URL.
- Open Graph data derives only from published canonical fields (safe title, concise description, configured public URL, hero/gradient card). Escape/encode metadata and image response. Keep scriptless restrictive CSP on the published page.
- WhatsApp/Meta may cache cards independently; do not promise instant refresh of a stable URL after republish. Republish updates the origin response; test the current HTML/image directly and document external cache limitation.
- No PDF export, PDF rendering, Chromium/Puppeteer worker, PDF status, PDF storage, PDF public/private endpoint or PDF test gate is added. Existing CP020 print/pagination evidence remains historical renderer evidence, not a product export commitment.
- No empty completion logs during planning. Proposed commands below are targets, not claims of existing scripts/evidence.

## Scope

- CP020 renderer orchestration for saved-draft preview; safe asset resolution, diagnostics and sandboxed responsive preview UI.
- Publish-readiness rules composed with CP019 validators, schedule/content diagnostics and locale/resource capability.
- SQLite publication/version/share-token/operation metadata; immutable self-contained HTML snapshots; atomic revision-safe pointer update, idempotent publish and revoke.
- Stable token HTML route and public token-scoped preview image route; Open Graph metadata, owner version/status UI and share-link copy.
- Restart/failure recovery, private/public boundary, retained versions and stopped full-root backup/restore.
- Real browser/API verification of preview, publishing, OG HTML/image and WhatsApp crawler prerequisites. Do not claim WhatsApp card appearance solely from localhost tests.

## Out of Scope

- CP026 PDF export (removed from product scope), durable PDF job queue/worker, Chromium PDF print, downloadable PDF or PDF routes.
- CP027 full release E2E, CP028 public AWS deployment/packaging/cutover and CP029 Laravel identity/tenant/billing integration.
- n8n changes, paid AI calls, venue search, geocoding/live traffic, arbitrary URL fetching, stock-photo integration or invented travel durations.
- Autosave, editable published snapshots, collaboration, public JSON/draft APIs, expiry timers, destructive retention cleanup or link analytics.
- Canonical schema/renderer rewrites or changes to completed CP contracts; stop for their revision gate if required.

## Current-State Findings

1. CP021/CP023 revision logs record passing gates, but chapter planner re-review is still required before CP024 execution.
2. `src/contracts/validator.ts` provides draft normalization and `validateForPublish` for required fields, IDs, modes, day ranges and some attribution; schedule/content policy gaps need additive CP024 validation.
3. `src/render/render.ts` exports `renderItineraryHtml(content, options)`, escapes text, validates resources, inlines styles/assets and supports structurally safe incomplete drafts.
4. `src/render/resources.ts` loads local CSS/fonts/catalog/palette; absent resources must fail clearly, not produce a partial/English-fallback preview.
5. `src/server/store.ts` owns workspace, drafts and assets with CAS save; it lacks publication pointers, immutable versions, tokens and publish operations.
6. `src/server/main.ts` rejects non-loopback binds. Local tests cannot prove external WhatsApp crawler reachability; that needs CP028/staging with HTTPS.
7. Existing PDF CLI/CP020 print fixtures are not a durable PDF export product. Do not port or extend them in CP024–CP025.
8. Content has human-readable time/duration labels and no coordinates; ambiguous schedules/travel feasibility must remain warnings, not guessed values.
9. Share-token retention/post-revoke behavior is clarified here: stable while active, permanent revocation, token rotation after revoke, no auto-delete.

## Proposed Changes

### CP024 — Draft Preview and Publish Validation

1. Verify prior chapter ACCEPT and dependency logs; only then mark CP024 `in_progress`. Inspect/preserve existing workspace changes and AI ledger.
2. Add pure validation composition returning `{errors,warnings,scheduleVerification}` with stable code, canonical field path, optional target ID and actionable Indonesian message. Do not mutate canonical schema/content.
3. Separate render safety from publish readiness. Render requires structurally valid draft, resolved supported locale, CSS/fonts/catalog and safe owned assets. Publish additionally requires `validateForPublish`, language context, photo credit, visible-copy policy and schedule checks. Preview success never implies publish permission.
4. Parse only fully anchored 24-hour `HH:mm`, explicit ranges and durations with known units. Validate conflicts and boundaries; never extract a number from unrelated prose or infer duration from adjacent events.
5. Detect overlap and provable duration cap violations (360 minutes half-day, 660 full/multi-day). Missing/ambiguous schedule/duration becomes explicit partial-verification warning. Condensed multi-day data is not redistributed across days. No route feasibility claim without evidence.
6. Pattern-based visible-copy checks cover actual currency amounts, opening-hour, booking/rating/scarcity claims and unresolved placeholders; exclude brief/notes/IDs/assets/internal metadata. Include legitimate-context fixtures in six baseline locales; no broad word blacklist or CJK whitespace word-count rule.
7. Resolve assets only through workspace-owned IDs/storage keys; validate bytes, MIME and size; inline allowed images/fonts/styles. Respect CP020's documented decorative-image fallback with explicit warning only where supported; never persist fallback into draft. No arbitrary URL fetch or truncation.
8. Use the same CP020 renderer/resources as published output. Bound size/time and clean temporary resources. Recheck revision on return; concurrent Save produces stale/conflict result, not a misleading preview.
9. UI: manual-save notice, Preview action, phone/desktop viewport, separate publish errors/warnings and field links. Render in sandboxed `iframe srcdoc` with no scripts/same-origin; local edits invalidate results, including in-flight responses. Preserve entered data on every error.
10. Review/test/revise. Write `logs/cp024_completion-log_draft-preview-and-publish-validation.md` from executed evidence before marking complete and starting CP025.

### CP025 — Published Web Link, Versioning and WhatsApp Preview

1. Add transactional persistence for `published_versions` (canonical snapshot/source revision/schema-render version/resource hashes/HTML key/hash), current publication pointer + epoch, random share-token digest/revocation state, and idempotent publish operations. Exclude writing brief/notes/account/billing/AI ledger from public snapshot.
2. Publish request `{operationId,expectedRevision}` validates ownership, current saved revision and CP024 readiness. Same operation/request replays outcome; changed request conflicts. Same revision/current epoch returns existing version rather than cloning.
3. Render exact saved canonical snapshot outside long DB transaction. Resolve/embed CSS, fonts and owned image bytes; include token-specific absolute OG URLs in HTML. Write via UUID staging + atomic rename; store hashes. Final transaction rechecks revision/epoch and commits version, operation, token and current pointer atomically. Failure leaves prior version/link/draft intact and staged files unservable.
4. Active republish keeps stable token and moves current pointer to new immutable version. Unpublish increments epoch and permanently revokes token. Old publish-op replay cannot reactivate it. New publish after revoke creates a fresh cryptographically random token (≥128 bits; recommended 32 bytes base64url), even for same revision.
5. `GET /i/{token}` resolves active token to current committed HTML; unknown/revoked returns uniform 404. Send no-store, noindex/nofollow, no-referrer, nosniff and restrictive scriptless CSP. Deep reload works; no management/private data or raw filesystem path is exposed.
6. Add `og:title`, concise `og:description`, `og:type=website`, absolute `og:url` and absolute `og:image` in published HTML `<head>`, based only on published brochure fields and configured `SHARE_ORIGIN`. Include matching `twitter:card=summary_large_image` metadata where useful. Escape text/attribute values and use correct HTML/URL encoding.
7. Add public `GET /i/{token}/og-image` (or equivalent opaque route) that checks active token and streams the **current committed version's** self-contained hero/gradient preview image as a supported image MIME, with bounded bytes and no private asset URL dependency. Use route URLs from configured origin. Revoke blocks image as well as page. No user-provided remote URL or arbitrary file path.
8. Ensure crawler response is server HTML with OG tags on initial GET (not client-side JS injection), no cookie/auth challenge, redirect loop or robots blocking. Test with crawler-like no-JS/no-cookie HTTP requests and inspect metadata/image bytes. Production card appearance requires a reachable HTTPS staging/public origin and Meta/WhatsApp fetch; localhost evidence is explicitly insufficient.
9. Stable token means republish updates response, but external Meta/WhatsApp caches may retain old card. Do not promise cache purge; test origin's current response and document cache limitation. Keep OG image URL stable per token unless a later explicit design decision permits versioned cache-busting URLs.
10. Owner UI: publication status/version and draft-diff notice, Publish/Republish, copy web link, Unpublish confirmation and revoked state. Save first; edits during request invalidate current UI readiness. Failure retains prior public page. Copy fallback remains accessible.
11. Retain committed snapshots/HTML/embedded assets with no auto-expiry or purge; revoke only changes public access. Verify with injected clock >25 hours and >12 months and stopped full-root backup/restore on copied data.
12. Review/test/revise. Record real API/browser/OG evidence in `logs/cp025_completion-log_published-web-link-and-versioning.md`; submit chapter for planner evaluation. Stop before CP027.

## Chapter API Contract

Extend existing route family and document DTO/error shapes in `docs/editor-ai-api-contract.md` before UI wiring.

| Method/path | Contract |
|---|---|
| `POST .../itineraries/{id}/preview` | `{expectedRevision}` → HTML, revision, readiness diagnostics; unsafe/resource failure structured 422/503. No persistent mutation. |
| `POST .../itineraries/{id}/publish` | `{operationId,expectedRevision}` → committed version and active share URL, or explicit pending result; stale/id mismatch 409, invalid 422, render/storage failure 503. |
| `GET .../itineraries/{id}/publication` | Owner-only current/revoked status, epoch, source revision and active link. |
| `GET .../itineraries/{id}/versions` | Owner-only cursor-paginated version metadata. |
| `POST .../itineraries/{id}/unpublish` | `{expectedPublicationEpoch}` → revoked epoch; idempotent if already revoked, stale epoch conflicts. |
| `GET /i/{shareToken}` | Active current committed HTML; absent/revoked 404. |
| `GET /i/{shareToken}/og-image` | Active current version's supported preview image; absent/revoked 404. |

Management writes retain Origin + `X-Engine-Request` and server-selected workspace. Errors include stable code/request ID, no secrets or internal paths. No PDF endpoints or PDF fields/statuses.

## Data Flow or Control Flow

```text
CP024: manual Save → saved revision → render safety + publish diagnostics
         → owned assets + CP020 renderer → sandboxed preview
         → local edit invalidates result; saved draft unchanged

CP025: Publish(operation, revision) → validate → snapshot + token-specific OG URLs
         → render/embed → stage immutable HTML + image → CAS transaction
         → committed version + current pointer + active token
         → /i/{token} serves OG HTML; /i/{token}/og-image serves matching image
       Republish swaps current version under active token; revoke retires token

After CP025: chapter planner evaluation; CP026 PDF export omitted; CP027 pending
```

## Files and n8n Workflows Affected

| Path | Intended ownership |
|---|---|
| `src/server/preview.ts`, `publish-validation.ts`, `render-service.ts` | CP024 render/readiness orchestration and diagnostics. |
| `src/server/publication.ts`, migration/repository | CP025 immutable versions, idempotency, pointer/token/epoch, public HTML/image routes. |
| `src/server/app.ts`, `main.ts`, `store.ts` | Additive lifecycle/routes/config/migrations; preserve draft/AI behavior. |
| `src/api/client.ts`, `src/editor/main.tsx` and small preview/publication panels | Typed API, preview sandbox, readiness states, share UI; Tailwind CSS v4. |
| `src/render/`, `config/web/`, `config/palettes.json` | Reuse renderer/resources; any completed renderer behavior change requires revision gate. |
| `tests/web/preview*.test.ts`, `publication*.test.ts`, synthetic fixtures | Policy/schedule, DB/filesystem failure, API, OG and access tests. |
| `scripts/web/verify-preview.ts`, `verify-publication.ts` | Browser, OG metadata/image and safe evidence summaries. |
| `package.json`, `.env.web.example`, docs | Preview/publication scripts and documented `SHARE_ORIGIN`; no PDF worker/config. |
| `SPEC.md`, `TODOS.md`, two completion logs | Product decision, CP status and factual evidence. |
| `.runtime/published`, `.runtime/tmp`, `output/web-{preview,publication}/` | UUID staging/runtime/evidence; no `.runtime/pdf` or PDF output. |

No n8n/Laravel changes, new AI calls or AI ledger reset.

## Security and Failure Handling

- Public snapshot DTO is an allowlist; omit private brief/notes/provider/workspace/operation metadata. Public agency contact intentionally in brochure remains visible.
- HTML is escaped, images/styles/fonts self-contained, preview iframe sandboxed and published page scriptless. OG image is token-scoped, bounded and served from owned committed bytes. Never fetch arbitrary URLs or expose storage roots.
- Publish files use UUID staging + short transaction + compensating cleanup. Uncommitted artifact never serves; failure preserves previous committed pointer/version and draft.
- Publication epoch blocks stale publish after revoke. Check active token on HTML/image, including conditional requests; no stale caching resurrects revoked links.
- Use stopped full-root backup before migrations; restore copied root and verify active/revoked links. Never auto-delete committed versions or personal data.
- Do not claim a WhatsApp preview is deployed until public HTTPS origin is reachable to crawler. Management API remains private while share/image routes are public at deployment boundary (CP028).

## Verification Plan

Shared gates: generated types, both typechecks, contracts/render/API/editor/AI tests, app build, existing editor/AI-browser regressions, `npm run validate`, `npm test`, `npm audit --audit-level=moderate`, and `git diff --check`. No live AI calls required.

| Target command | Gate |
|---|---|
| `npm run test:web-preview`, `npm run verify:web-preview` | CP024 policy/schedule/render isolation and saved-draft browser preview. |
| `npm run test:web-publication`, `npm run verify:web-publication` | CP025 atomicity/tokens/retention, real public/owner routes and OG metadata/image. |
| `npm run build:brochure-css`, `npm run verify:web-render` | Renderer baseline/screenshot comparison; not PDF-export verification. |

### CP024 matrix

- Structurally safe incomplete drafts preview with errors; saved canonical content and metadata remain identical. Unsupported locale, missing CSS/font, corrupt/foreign asset, stale revision, size/deadline and in-flight edit produce safe result and preserve input.
- Positive/negative overlap and 6h/11h boundaries; explicit interval/duration, adjacency, missing/ambiguous duration, condensed ranges and provable lower-bound violations. No inferred route feasibility or mutation.
- Six-locale positive/negative content fixtures: actual currency/opening-hour/rating/booking claims versus legitimate price-not-listed/history/guide visit-time and CJK text.
- Compare preview to CP020 baseline at 390×844 and 1440×1000, four modes, logo/hero/credits/emergency, long copy/14 days/60 spots. Inspect images; sandbox cannot access editor/API; no external runtime requests or console errors.

### CP025 matrix

- Publish/replay/restart gives one immutable version per revision/epoch; later edits do not change stored snapshot. Copy/deep-link displays correct page.
- Race Save/publish/republish/unpublish, duplicate operations, renderer/storage/DB failure and process termination before/after rename/commit. Old pointer remains correct; staged content never serves; draft intact.
- Revoke/replay old operation/new token, active republish stable link, old token forever 404, and private/public access separation. Test HTML/image route and conditional request/cache behavior.
- Parse initial HTML without JS/cookies: correct absolute `og:title`, `og:description`, `og:type`, `og:url`, `og:image`; image URL returns matching bounded JPEG/PNG bytes with correct type. No login redirect, robots block, private metadata, arbitrary remote resource or editor route.
- Test >25h and >12-month clock while origin/storage persist; token remains active unless revoked. Backup/restore preserves versions, token state and revoked tombstones.
- Real WhatsApp/Meta scraper test only on reachable HTTPS staging/deployment; local tests report prerequisites, not card appearance. Note external card cache may lag republish.
- Inspect four-mode public page mobile/desktop and OG image; no stale page/image, notes/pricing claims or cache resurrection.

## Acceptance Criteria

| ID | PASS requires |
|---|---|
| R24-1 | Saved safe incomplete draft previews through backend/CP020; diagnostics independently show readiness; no draft write or editor script access. |
| R24-2 | Structural/locale/asset/content/provable schedule issues block publish action with exact paths; ambiguity is warning, never invented PASS. |
| R24-3 | Manual copy/order/IDs unchanged, local edits invalidate result, failures preserve form and responsive visuals/gate evidence pass. |
| R25-1 | Immutable snapshot, idempotent revision/epoch-safe publish and failure atomicity; previous page remains intact on failure. |
| R25-2 | Stable active link, permanent revoke, post-revoke token rotation, no public draft/internal leakage or stale-cache resurrection. |
| R25-3 | Public initial HTML has correct OG metadata and accessible matching preview image; HTTPS crawler prerequisite is verified where deployed, with cache caveat documented. |
| R25-4 | No automatic expiry/purge; >12-month clock test and stopped restore preserve retention; owner/public visuals and two completion logs exist. |
| Chapter close | CP024 and CP025 logs, TODO status/evidence, planner submission; CP027 not started before next approved gate. No PDF export capability is claimed. |

## Risks and Rollback

- False policy positives: anchored rules and legitimate-context fixtures; uncertainty warns, manual copy is never rewritten.
- Snapshot/token races: immutable artifacts + revision/epoch CAS; stale operations cannot reactivate revoked URLs.
- Filesystem/SQLite mismatch: copied-root migrations, staged-only reconciliation; preserve committed versions and AI ledger.
- OG cache/reachability: localhost cannot validate WhatsApp scraping; require HTTPS staging to assert card appearance, and treat Meta cache as external behavior.
- Avoid unnecessary Chromium runtime/cost: this chapter does not add a PDF worker or PDF browser launch; CP020 HTML renderer still uses its required browser verification only where existing tests require it.
- Roll back only intended chapter changes after inspecting diff. Restore a matching stopped data-root backup when needed; preserve token tombstones and record unresolved findings.
