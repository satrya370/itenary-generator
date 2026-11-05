# CP027–CP028 Implementation Plan: Standalone Verification and Deployment Readiness

**Date:** 2026-10-07. **Status:** CP027 and CP028 completed 2026-10-09. Chapter review ACCEPTs `standalone-ready / not deployed` for the tested local Linux x64 profile; public HTTPS/WhatsApp crawler appearance remains DEFERRED per W15. AWS target remains undecided; no cloud deployment is authorized.
**Authority:** `SPEC.md` v3.2, `TODOS.md`, `RULES.md`, canonical `web-1.0.0`.
**Chapter:** CP027 → CP028, one CP `in_progress`, separate completion logs, chapter review after CP028. No CP029 execution.
**Entry gate:** CP025 is completed/logged and `logs/cp024-cp025_planner-review_2026-10-07.md` records ACCEPT. Verify these artifacts and any newer revisions at execution time; acceptance is evidence to review, not a substitute for this chapter's tests.

## Objective

Prove the complete standalone guide workflow against real Node/Fastify, SQLite and filesystem storage, then deliver a reproducible, lightweight deployment package with tested restart, restore, rollback and public/private routing. Prepare for AWS trial without provisioning resources or spending cloud credit. Output remains web links with Open Graph preview; no PDF renderer/export service.

| CP | Deliverable | Entry gate / completion boundary |
|---|---|---|
| CP027 | Executed E2E acceptance matrix, responsive visual evidence, failure/race coverage and honest live-AI evidence attribution. | CP025/log/ACCEPT; all local acceptance gates pass or CP027 stays blocked/in-progress. |
| CP028 | Clean-install runtime package, local Linux readiness verification, reverse-proxy template, resource measurements and restore/rollback runbook. | CP027 completed/logged; status is **standalone-ready**, never staging-ready/production-live. |

## Clarifications and Decisions

User answered the structured question gate on 2026-10-07:

| ID | Decision | Consequence |
|---|---|---|
| D27-1 | **Target belum diputuskan.** | AWS instance, region, architecture, domain and monthly budget are not selected. Package is single-host portable; cloud selection is a later gate. |
| D28-1 | **Readiness saja.** | Verify on isolated local environments. No server changes, staging, provisioning, DNS, certificate issuance on public domains or production cutover. |

Chapter/default verification decisions:

- One shared plan, ordered CP execution and separate logs. Planning creates no acceptance or completion logs.
- Reference runtime for packaging tests: Node 24 on local Linux x64 with glibc; this selects a test platform, not an EC2 SKU or AWS account. A future ARM64 host needs its own native-Sharp/install test before deploy.
- One Node process per data root, host-local SQLite and one persistent data directory. No autoscaling/rolling overlap on shared SQLite; never run startup recovery from a second process against the active root.
- Private operator editor/API on loopback; future public proxy allowlists only published HTML and OG image. Operator access remains local/SSH tunnel; no new login system or Laravel dependency.
- Public HTTPS crawler/card verification is explicitly **deferred to a separately authorized deployment**, because user selected readiness only. Verify OG behavior through a local TLS proxy; do not label localhost or crawler-like requests as real WhatsApp results.
- Local E2E covers deterministic AI lifecycle/errors with an injected provider double and actual storage/server/browser. Existing CP023 live inference is a separate provenance source; replay existing operations if available. Do not reset the US$2 ledger, clone it into a fresh paid allowance or run fresh paid inference by default. Historical committed cost is US$0.001361; re-read safely at execution, never assume that value is still current.
- Credentials-missing mode must support manual completion of all four modes. Current model stays `openai/gpt-6-luna`; actual provider verification, if needed, requires current preflight and explicit fresh-call approval within the remaining original ceiling.
- Chromium/Puppeteer is for development QA only. Release package contains neither browser binaries, Puppeteer, Vite dev server, TypeScript test runner nor PDF helper. Existing historical renderer/print evidence is retained, not rerun as a PDF feature gate.
- No minimum AWS instance size, price or free-tier eligibility claim until account/region/resource measurements are available. Report resource measurements, not a promise of zero cloud cost.

## Scope

- Full create/edit/AI Apply/Save/reopen/preview/publish/share/republish/revoke/rotate flow for four modes with six baseline locales and stress fixtures.
- Actual process restart, stopped full-root copy/restore, corrupt/missing resources, publish concurrency, operation replay and public cache/revocation behavior.
- Acceptance audit of existing source/test claims; targeted tests that can expose implementation gaps before release. Findings in completed CPs follow their own revision gates.
- A backend build and release packager, runtime-only dependency installation, bundled frontend/styles/fonts/catalogs, artifact manifest/hashes and local Linux launch without development tools.
- Local single-process supervision and public-proxy configuration templates; TLS/access checks against isolated local endpoints, with the management listener still on loopback.
- Clean setup, readiness smoke, resource observations, backup/restore/rollback and operator runbook. Safe evidence and phase-specific completion logs.

## Out of Scope

- Any AWS resource/account access, provisioning, remote mutation, staging/production deploy, real DNS changes or public ACME certificate requests.
- Live WhatsApp card appearance; local TLS proves server/proxy behavior, not internet crawler reachability or Meta cache behavior.
- PDF render/export/jobs/download routes and CP026. No Redis, RDS, Kubernetes, ALB, CDN, S3 pipeline or distributed queue introduced.
- CP029 identity/tenant/billing integration, new authentication system, public editor exposure, n8n workflow/credential changes, existing-service cutover.
- Broad refactor, schema/renderer redesign, new locales, nice slugs, template builder, venue search, tracking/analytics or automatic retention cleanup.

## Current-State Findings

1. CP018–CP025 are marked completed, CP026 removed, CP027/CP028 pending. Prior chapter ACCEPT and individual logs exist; source/evidence gaps below still require verification.
2. Existing suites test contracts/render/API/editor/AI/preview/publication separately. `verify-editor.ts` covers four-mode editor, 14-day and 60-place stress; `verify-ai-ui.ts` uses a provider double. `verify-publication.ts` currently exercises one full-day publish flow. This is not a single all-mode release E2E.
3. Published versions and OG JPEGs are persisted with hashes, random tokens, an epoch and idempotent operation state. Restart tests and a stopped-root restore test exist. Retention test backdates a token rather than advancing the runtime clock; CP027 must distinguish that evidence.
4. `src/server/preview.ts` composes CP019 validators but omits known-duration cap checks when start time is unknown and skips all activities in condensed blocks. It reads asset metadata without forcing full pixel decode. These are source-observed verification targets, not claimed reproduced failures.
5. Renderer bounds include asset/HTML size limits, but preview orchestration has no explicit deadline or workspace-render busy guard despite the CP024 plan. Policy scans select fields; opening-hours matching can flag bare phrases and diagnostic focus mapping covers only some controls. Verify behavior instead of treating earlier PASS rows as proof.
6. Public HTML/image resolve token/version before async file read; no post-read revocation check is visible. Publish has same-ID replay but same-revision early return does not record the newly supplied operation ID; editor generates a fresh ID per Publish click and leaves `202` as a status message. Verify races/retry semantics and UI state binding before release.
7. `src/server/main.ts` restricts bind to `127.0.0.1`/`::1`. GET management routes are protected by that network boundary, not authenticated identity. Public reverse proxy must allowlist share routes, not forward all requests to this listener.
8. `npm run start:web-app` requires `tsx`, a devDependency. Plain `npm ci --omit=dev` followed by the existing start command is not a deployable runtime. Package also declares Puppeteer as a production dependency; legacy `validate-package.mjs` requires the PDF helper and pinned Puppeteer.
9. Renderer font/style loaders and static frontend use working-directory-relative paths. The production release must explicitly include resources and set working directory/`ENGINE_RENDER_CSS`; moving the entrypoint alone will not work.
10. No Dockerfile/Compose artifact was found in the current project scan. Existing AWS/n8n plans are historical scope, not standalone packaging evidence.
11. `SHARE_ORIGIN` is trusted configuration and embedded in immutable published OG HTML. Changing it later does not rewrite stored `og:url`/`og:image`; root/origin migration cannot be claimed to preserve cards automatically.
12. `SPEC.md` §12 currently mentions reachable HTTPS. The user's readiness-only decision splits local TLS contract acceptance from the future real internet/WhatsApp gate; record this explicitly in SPEC/TODOS, not as a fabricated live PASS.

## Proposed Changes

### CP027 — Standalone End-to-End Verification

1. Recheck dependency logs/review and working tree; mark only CP027 `in_progress` when execution starts. Use new temporary data roots and synthetic content, never cleanup/reset the normal workspace or live AI ledger.
2. Build a minimal combined browser/API E2E harness (target `scripts/web/verify-e2e.ts`) that starts the real app as a child process on loopback, uses a test-only deterministic provider fixture, and always writes a safe partial summary even if a case fails. **Implemented and executed**; success/failure summary contains only safe flags/counts/error type. Do not add a production endpoint for provider injection.
3. Author `tests/web/cp027-fixtures.json` with independent mode/order/locale/long-copy/asset expectations. **Implemented:** four mode publishes, six locale render cases, 3,675-code-point copy, hero/logo/schedule image + credits + OG, editor 14-day/60-spot stress, and existing condensed/missing-time tests. Shared fixture constructors provide inputs; expectations remain in the independent manifest.
4. Exercise UI creation, field filling, repeaters/reorder, locale resolution/confirmation/override, Generate/Discard/Apply, manual Save/reopen, preview, publish, public initial GET, image, editor draft changes, republish, revoke and post-revoke new link. Compare full canonical snapshots: only Apply changes its requested local string, Save changes only documented normalization/metadata, and publication does not change draft facts.
5. Test local edits/draft switch during delayed preview, detection, Save and publish; diagnostics and late responses must bind to itinerary/revision/edit generation. Error focus must reach the actual faulty item after reorder rather than the first item or a no-op. UI shows current public version/link even after failed republish.
6. Prove renderer and asset safety: unresolved/unsupported locale, missing CSS/font, foreign asset ID, full decode failure after readable metadata, size limits, malicious escaped copy and installed resources. Decorative fallback is accepted only as permitted by the existing resource contract; corrupt bytes cannot silently become valid output. Do not make every missing resource a fallback to obtain green results.
7. Add targeted tests for the source-observed backlog below **before proposing runtime fixes**. Keep each result tied to code/expected rule, not a blanket security verdict. If any completed contract fails, mark CP027 blocked with a named finding and use structured Ask Question → original CP revision plan → revision log → re-review → rerun affected E2E. CP027 is verification ownership, not permission to disguise completed-feature fixes.
8. Process tests: terminate/restart the child during publication after staging/promote and before commit using a bounded test seam, then inspect prior pointer, orphan cleanup and same-ID response. Also stop cleanly, copy the complete root, restore it into a separate process and check active/revoked URLs, OG bytes, drafts, profile, assets and operation state.
9. Provider evidence: compare existing CP023 live manifest/ledger safely and label it historical; run existing IDs as replay only where available, confirm zero fresh inference and no budget delta. Deterministic browser provider results must be labeled doubles. Missing live evidence is an explicit gate/decision, not replacement with a double labeled live. A new paid run needs separate approval, not a changed operation ID.
10. Visual inspection: 390×844 and 1440×1000 for four modes and stress/language cases; inspect screenshots of iframe, published page, diagnostics and OG image. **Implemented:** integrated E2E saves both widths for each published mode, locale, and long-copy case; CJK glyph/font-family assertions pass, OG JPEG screenshot is saved, dimensions/overflow are asserted, and public initial HTML/image are fetched directly without JavaScript/cookies. No private writing context or external browser requests observed.
11. Build an acceptance matrix mapping every local SPEC §12 row to executed command/case, safe summary and artifact path. Mark the public HTTPS/WhatsApp portion `DEFERRED — readiness-only decision`, not PASS. Release-local acceptance is blocked by any unmet local criterion; date/test counts and known limitations must be factual.
12. Review → Test → Revise until local checks pass. Write `logs/cp027_completion-log_standalone-end-to-end-verification.md`, update CP027 completed and then start CP028. No completion from source inspection alone.

#### CP027 verification backlog from source inspection

| ID | Test target / expected invariant | Owning completed CP if failed |
|---|---|---|
| V27-01 | Known single-activity duration above 6h/11h is rejected even with unknown start or condensed days; no daily-distribution inference. Nested/late-ended intervals retain provable caps/overlap. | CP024 |
| V27-02 | Bare price/opening-hours/history wording versus actual factual claims in six locales; all printed field contexts, no guide visit-time false positives. Focus action points to concrete invalid row/field. | CP024; CP019 only if canonical diagnostics need a behavior revision |
| V27-03 | Resource pixel-decode corruption, input/output bounds, timeout/busy behavior and leak-free repeated render. Explicit limits match plan/docs/capabilities. | CP024; CP020 only if renderer itself fails |
| V27-04 | Revoke or republish during async artifact read; requests authorized after state change cannot serve retired/wrong-current content. Conditional GET does not bypass active token validation. | CP025 |
| V27-05 | Same operation ID after same-revision reuse/failure/restart, cross-itinerary collision, duplicate/concurrent publish, Save/revoke while pending; single committed version/result, no duplicate work/reactivation. UI retries pending with the same ID and rejects stale output. | CP025 |
| V27-06 | Startup recovery does not remove other-workspace committed artifacts; UUID cleanup is narrow; token/HTML/image state persists after restore. No multi-process same-root startup permitted. | CP025 |

These began as test requirements, not assumed failures. CP027 reproduced V27-01, V27-03, V27-04 and V27-05; all four are closed through original CP024/CP025 revision gates and executed logs. Preserve prior ACCEPT/history and append findings honestly.

### CP028 — Standalone Deployment Readiness (Local Only)

1. Verify CP027 completion/log and resolved revision gates. Mark only CP028 `in_progress`. Prepare packaging in an isolated output/release root; never run migration/startup recovery on normal/production data for a test.
2. Add a dedicated backend build target that emits executable ESM JavaScript for Node 24, preserves canonical JSON import/resource paths and uses a tested `node` entrypoint. Do not require `tsx`, Vite or source tests to run the packaged application. Browser assets are prebuilt and self-contained via Tailwind v4.
3. Produce a minimal release with backend JS, relevant canonical configs/locales/palette, `dist/`, compiled brochure CSS, runtime font packages/licenses and runtime dependency manifest/lockfile. Derive resolved package versions from source lock data; do not hand-pin a second unsynchronized dependency list. Validate closure against actual server imports, including Sharp native support.
4. Keep build/QA tooling in development, excluded from the release. Runtime install must not include Puppeteer/Chromium, PDF helper/test/workflows, n8n legacy renderer, TS/Vite build tooling, screenshots, normal `.runtime`, credentials or live test budget files. Historical source tooling stays available for maintenance. Add a dedicated standalone release validator; legacy `npm run validate` alone cannot certify this package.
5. Keep runtime CSS inside the immutable release and persistent mutable data outside it (example `/opt/itinerary/releases/<release-id>` and `/var/lib/itinerary-engine`). Explicit `WorkingDirectory`, absolute `ENGINE_DATA_DIR`, absolute `ENGINE_RENDER_CSS`, `PUBLIC_ORIGIN` and `SHARE_ORIGIN`; verify after process restart and release-path change. Never store required CSS only in disposable tmp or an unmounted build directory.
6. Add a small systemd service template for Linux reference host: unprivileged dedicated user, one Node process, graceful signal/stop timeout, explicit private environment-file path, bounded restart/log policy and writable data root. Test the equivalent lifecycle locally; if actual systemd template cannot be executed on available Linux test host, record that gate as incomplete instead of claiming verified supervision. No cluster/multi-instance mode or concurrent recovery.
7. Add one future public reverse-proxy template (reference Caddy, separately installed by operator). Proxy GET/HEAD only for exact share HTML/OG-image route families to loopback; deny editor root, `/api/*`, raw `/assets`, data dirs, arbitrary prefixes and SPA fallthrough. Private operator access stays via localhost/SSH tunnel, not public basic auth added inside the app. Test URL decoding, path normalization, methods, redirects and unknown/revoked tokens; forwarded headers cannot alter trusted origin.
8. Run local TLS proxy tests with a disposable test certificate/CA and reserved local hostname, checking both TLS trust and HTTP results. Set configured origins before fixture publication. Public proxy reads HTML/OG without login/cookies; private editor/backend read/write cannot be reached through it. Local hostname/cert testing must not invoke AWS, public DNS or ACME.
9. Clean-room install on Linux x64: copy only release files, install runtime locked dependencies, boot with no source tree/dev dependencies/browser binaries, then create/save/preview/publish/share all four modes. Test CJK resources, raster upload, retained OG image, deep reload, schema validation and manual operation when credentials missing. Use CP027's double only in isolated verification, never included/enabled as production fallback.
10. Restart/upgrade/rollback rehearsal: first release creates records/active and revoked tokens; stop it; create and verify full-root backup with manifest/hashes; launch a new compatible release at same origin/root; verify IDs/hashes/links/tombstones; stop and roll code back. If a migration is not backward compatible, restore matching stopped backup and state that post-backup writes would be lost; never promise data preservation from a DB-only backup or older code against incompatible schema.
11. Record release SHA/build ID, dependency lock/runtime versions, archive size and dependency contents. Measure startup time, idle/peak RSS/CPU, disk before/after 4-mode and CJK/stress fixtures, HTML/image sizes and durations; run a small fixed burst of public GETs plus one publish on the reference environment. Note render memory and retained snapshot growth; do not silently lower asset limits or purge snapshots to fit a hypothetical small instance.
12. Resource report lists one Node process, SQLite/data disk and optional public proxy, no PDF worker/browser/managed DB. Include potential later AWS charges (compute, persistent disk, public IPv4, transfer, backup), marked unpriced until target/account chosen. Builds/QA run off the future small server when possible. No paid cloud performance test is required.
13. Write runbook: clean setup, manual editing, injected OpenRouter secret, publishing, copy/revoke, trusted origin, backup/restore/rollback, health/readiness interpretation, resource metrics, and future deploy gate. `/api/health` currently returns only `ok`; local readiness script must also prove DB/resource/runtime functionality without claiming deep health from that endpoint alone.
14. Future deployment gate requires operator-selected AWS target/region/architecture/host budget, admin-access approach, domain/origin and DNS owner, existing-service impact, backup owner and explicit action request. On future public HTTPS, test anonymous crawler HTML/image, page/image revoke and Meta/WhatsApp card/cache. Until then label `standalone-ready`, `public-HTTPS verification deferred`, and `not deployed`.
15. Review → Test → Revise. Write `logs/cp028_completion-log_standalone-deployment-readiness.md`, submit chapter review with local-only status, update TODO and stop before CP029. Failed clean-room/restore/proxy tests keep CP028 incomplete; no partial packaging labeled ready.

## Data Flow or Control Flow

```text
CP025 log + ACCEPT → CP027 verify actual UI/API/DB/filesystem
  → local failure? record → original-CP revision gate → re-review → rerun affected cases
  → local acceptance + historical/replay AI provenance + inspected evidence
  → CP027 log/completed

CP028 build source → JS backend + dist + CSS/fonts/config + runtime-only lock
  → clean local Linux install → one loopback Node process + persistent data root
  → local TLS share-only proxy → anonymous OG HTML/image + private API denial
  → stop/backup/restart/upgrade/rollback + resource measurements
  → CP028 log + chapter evaluation → standalone-ready (not deployed)

Future explicit deployment request + selected host/domain/budget
  → public HTTPS/crawler/WhatsApp verification (deferred, tracked separately)
CP029 Laravel integration remains pending after readiness and SaaS availability
```

## Files and n8n Workflows Affected

Target names below are proposed artifacts, not existing commands/files or executed evidence.

| Path | Ownership |
|---|---|
| `scripts/web/verify-e2e.ts`, `tests/web/e2e*.test.ts`, synthetic fixture manifest | CP027 combined workflow, real-process/failure assertions and safe evidence. |
| `tests/web/preview.test.ts`, `publication.test.ts`, existing verification harnesses | Targeted missing evidence; runtime defects require original CP revision plan. |
| `tsconfig.runtime.json`, `scripts/web/build-release.mjs`, `verify-release.*`, `validate-release.mjs` | CP028 backend build, packaging/import closure, clean-room launch and release validation. |
| `deploy/itinerary-engine.service`, `deploy/Caddyfile.example` | CP028 single-host supervision and share-only proxy templates, local verification. |
| `scripts/web/verify-readiness.*`, `verify-restore.*` | CP028 local TLS/access, stopped backup/restore/rollback and metrics. |
| `package.json`, `package-lock.json`, `.env.web.example` | Necessary build/verification scripts and packaging config; resolved versions preserved, no secrets. |
| `docs/standalone-deployment-readiness.md`, runtime/API/development docs | Operator runbook, measured requirements, capability/deployment boundary and unresolved cloud gate. |
| `SPEC.md`, `TODOS.md`, this plan | Approved scope, correct references and factual progress. |
| `output/web-e2e/`, `output/web-readiness/`, `output/releases/` | Ignored synthetic evidence/release artifacts; not normal runtime or live data. |
| Two completion logs and chapter review in `logs/` | Created only after corresponding executed verification. |

No n8n workflow/credential/API or TourFlow change. No new production route/authentication feature is implemented incidentally by these verification/packaging CPs.

## Security and Failure Handling

- Use private environment injection, synthetic screenshots/fixtures, redacted tokens and safe ID/hash/count summaries. Do not print credentials, raw prompts/notes, DB copies or operational URLs containing bearer tokens.
- Backups contain token values/operator data and must stay private. Release package excludes them; tests use disposable roots. Existing live ledger is read-only except an explicitly authorized same-ID replay through its own safe lifecycle.
- Loopback binding and exact proxy allowlist are defense boundaries for unauthenticated GET management routes. Origin/`X-Engine-Request` checks alone are not authentication; never publicly forward the full listener.
- Bound child lifetime and test waits; cancel own processes in `finally`, including failed tests. Do not kill shared browser/server processes, write fixtures over user data, change hosts files globally or run public cloud commands to make local gates pass.
- Preserve published HTML/image hashes and token tombstones through restore. Same-host SQLite must not run concurrent process recovery. No rolling multi-replica deployment template.
- Source-observed defect → executable repro → completed-CP revision gate. No test suppression, weakened assertions, silent manual itinerary repair, fabricated acceptance or retroactive rewrite of historical logs.

## Verification Plan

### Existing gates (actual counts/results recorded at execution)

`npm run check:web-types`, `npm run typecheck:web-contracts`, `npm run typecheck:web-app`, `npm run test:web-contracts`, `npm run test:web-render`, `npm run test:web-api`, `npm run test:web-editor`, `npm run test:web-ai`, `npm run test:web-preview`, `npm run test:web-publication`, `npm run build:brochure-css`, `npm run build:web-app`, `npm run verify:web-editor`, `npm run verify:web-ai-ui`, `npm run verify:web-preview`, `npm run verify:web-publication`, `npm run validate`, `npm test`, `npm audit --audit-level=moderate`, `git diff --check`.

Root legacy checks may continue as regression evidence; PDF helper/print artifacts are not release requirements or runtime dependencies. Avoid `verify:web-render`'s PDF generation as this chapter's release gate; use HTML/screenshots in combined E2E. No fresh live-provider matrix by default.

| Proposed target | Purpose |
|---|---|
| `npm run test:web-e2e` / `npm run verify:web-e2e` | CP027 actual combined all-mode lifecycle, failure/races and local acceptance manifest. |
| `npm run build:web-release` / `npm run validate:web-release` | CP028 compile/pack/import/resource closure and no-browser/runtime-only validation. |
| `npm run verify:web-readiness` | CP028 clean local Linux boot, share-only local TLS/access, shutdown/restart and resources. |
| `npm run verify:web-restore` | CP028 stopped full-root backup/restore/upgrade/rollback parity, including revoked tokens. |

### Evidence matrix

| Area | Required positive / negative checks |
|---|---|
| Four modes | All UI facts/order/IDs survive Save/reopen and publish; wrong-mode/required-content failures actionable, incomplete draft Save allowed. |
| Locale | Six baseline label/fonts/script fixtures; auto/confirmation/mixed/unsupported; manual copy unchanged, CJK visible. |
| AI | Generate/Discard/stale inert; Apply one field then manual Save; pending same ID, quota/timeout/missing credentials; historical live vs replay vs double distinguished. |
| Schedule/content | Exact cap boundaries, known duration without start, condensed ranges, nested overlap; legitimate price/book/history/visit-time and actual policy violations. |
| Resources/render | Safe incomplete preview; full image decode and MIME/size ownership, missing resources/fallback, deadline/busy/cleanup; no external active content. |
| Publication | Same-ID/race/replay/failure/epoch checks, same-revision reuse, retained old snapshot, permanently revoked page/image, token rotation and cached conditional requests. |
| Persistence | Child-process interruption/restart and stopped full-root restore; ID/hash parity, private metadata/ledger retained, no foreign artifact deletion. |
| Release | Clean runtime without TS/Vite/Puppeteer/browser/PDF helper; packaged CSS/fonts/config load on Linux x64, Sharp raster/OG works; one process/data root. |
| Access/TLS | Local trusted certificate, initial OG response without JS/cookies, only exact share GET/HEAD public; denied API/editor/files/methods/path bypasses. Not real internet scraping. |
| Readiness/rollback | Cold/idle/peak metrics; stopped consistent backup; compatible upgrade/rollback origin/link/hash parity; failed boot retains data. |

For each case record case ID, expectation, actual assertion, command/exit code, revision/build, fixture/runtime versions, viewport, artifact hashes/paths, error code and evidence category. Write summary on failure; do not copy raw bearer URLs/credentials into logs.

## Acceptance Criteria

| ID | Completion requires |
|---|---|
| R27-1 | Four mode workflows run end-to-end through real editor/API/SQLite/filesystem, with full canonical identity/order and exact Apply-change comparisons. |
| R27-2 | Six locale/stress/resource/policy and V27-01…06 cases executed; local criteria all PASS and any confirmed original-CP defect formally revised/re-reviewed before release acceptance. |
| R27-3 | Real child-process restart/crash and restore prove retained draft/published/image/token state; no double dispatch/reset/new paid matrix. |
| R27-4 | Responsive screenshots/OG/glyphs inspected; local SPEC matrix complete; public HTTPS/WhatsApp portion explicitly deferred, no live deployment claim. CP027 log exists. |
| R28-1 | Reproducible artifact/lock/manifest with complete runtime resources, no PDF/browser/QA runtime; clean local Linux x64 install starts using Node and succeeds in four modes. |
| R28-2 | Local TLS proxy passes exact share-only anonymous access and management denial; listener remains loopback; secret-free config/runbook ready. |
| R28-3 | Single-process stop/restart, stopped full-root backup/restore and compatible upgrade/rollback preserve IDs, active links, immutable content and revocation tombstones. |
| R28-4 | Measured resource report, manual-use/deployment runbook and unresolved host/domain/budget gate recorded. No AWS spend/provisioning, staging-ready or production-live claim. |
| Chapter close | Separate factual CP027/CP028 logs, correct TODO state, chapter review; CP026 stays removed and CP029 pending. Status is standalone-ready only if all local release gates pass. |

**Completion restriction:** absent Linux test environment or failed local TLS/clean install/restore gate means partial evidence and CP028 blocked/in-progress, not a completed AWS-ready claim. Internet/card gate can be deferred under the user's explicit readiness-only decision; local functional failures cannot.

## Risks and Rollback

- Prior PASS can conceal untested races/limits: use explicit backlog and exact assertions; original-CP revision gates prevent silent scope drift.
- Native dependencies and relative paths can pass on Windows but fail in Linux release: verify clean glibc x64 runtime and complete resource paths; record platform limitations honestly.
- No Chromium in release does not guarantee tiny memory usage: CJK fonts, Sharp image work, inline HTML and retained snapshots require real measurements before choosing instance/disk size.
- Origin change can invalidate embedded OG references in historical versions: preserve configured origin during local migration tests; future origin migration/republish is a separate explicit decision.
- Global TLS/proxy/service configuration can affect unrelated software: use isolated local resources and uninstalled templates until readiness execution; no public port or remote host changes in this chapter.
- Rollback code only when schema-compatible. Otherwise restore a matching stopped full-root backup with known recovery point; never zero usage ledger, remove token tombstones or discard later writes without an explicit decision.
- Retention has no auto-purge; document storage growth, backup custody and future capacity gate. AWS trial selection remains unresolved, not silently converted to a new paid server.

## Execution Checkpoint: 2026-10-07 — Original-CP Findings Closed; E2E Continues

Diagnostic probe `npx tsx scripts/web/probe-cp027-findings.ts` initially reproduced two plan-listed failures against temporary real SQLite/filesystem roots:

- **V27-01 / CP024 — CLOSED:** 7-hour half-day activity with no recognized start initially returned preview `publishReady:true` and publish HTTP 200. CP024 revision now returns `publishReady:false`, `SCHEDULE_DURATION_CAP` and publish 422; see the dated revision section in its completion log.
- **V27-05 / CP025 — CLOSED:** a same-revision no-op publish initially failed to record its operation ID; after revoke, replay minted a new token. CP025 revision now records the no-op operation/version/token/epoch mapping transactionally; same-ID replay after revoke returns 409 and leaves publication inactive. A new explicit operation can still create the rotated link.
- **V27-03 / CP024 — CLOSED:** a same-size PNG with corrupted compressed pixels initially passed metadata parsing. CP024's second revision now fully decodes the raster before embedding and returns `ASSET_INVALID`; saved asset/draft and old published page remain intact.

Redacted result is in `output/web-e2e/cp027-probe-summary.json`; subsequent probe reports V27-01/V27-03/V27-04/V27-05 not reproduced. These findings were closed through original-CP revision logs. No normal data, production state, cloud resource or AI budget was used.

## Execution Checkpoint: 2026-10-07 — Public Read/Revoke Race Closed

The next CP027 concurrency probe rewrote only a disposable published fixture to a bounded 32 MiB file/hash, started `GET /i/{token}`, committed unpublish while asynchronous file read was pending, and awaited the response. **V27-04 reproduced:** the page request returned HTTP 200 after revoke committed because token state was checked before the asynchronous read and not rechecked before send. Redacted summary is in `output/web-e2e/cp027-probe-summary.json`; the temporary app/root was closed and removed.

This was a new CP025 defect outside V27-05. User authorized a separate revision, `plans/cp025_revision-plan_recheck-publication-after-async-read.md`. Public HTML and OG-image reads now recheck active token, current version and hash after the async file read, before returning bytes. A deterministic test barrier verifies revoke during each read returns `404`; republish during a pending old-version read also returns `404`, then the next request serves the new current version. `npm run test:web-publication` and the redacted probe pass; V27-04 no longer reproduces. No production/public data was used. CP027 may resume remaining E2E matrix; CP028 remains pending and no CP027 completion log exists.

## Execution Checkpoint: 2026-10-07 — Diagnostic Focus Target Reproduced

`npm run verify:web-preview` was extended to create two activities, leave the second title blank, and activate its generic registry diagnostic. The UI focuses the first activity title instead of the invalid second row. This is V27-02/CP024 and is recorded without modifying CP024 implementation. Safe summary: `output/web-preview/verification-summary.json` (`activityDiagnosticFocus: wrong-activity-target`). CP027 is blocked pending a separate structured decision/revision plan for CP024. No CP028 start and no CP027 completion log.
