# CP028 Completion Log: Standalone Deployment Readiness

## Result

- Status: `completed` — **standalone-ready / not deployed** for the verified Linux x64 reference profile.
- Completed at: 2026-10-09.
- AWS account/region/architecture/host budget and public hostname remain undecided. No AWS, DNS, public staging, production host or certificate authority was contacted.
- Public HTTPS/WhatsApp/Meta internet crawler appearance is deferred under W15; local TLS proves only local proxy/server behavior.

## Plan and Entry Gates

- Chapter plan: `../plans/cp027-cp028_implementation-plan_standalone-verification-and-deployment-readiness.md` (§ CP028).
- CP027 passed its local matrix and is completed/logged at `cp027_completion-log_standalone-end-to-end-verification.md`.
- CP024 V27-01…03 and CP025 V27-04…06 findings are closed through original-checkpoint revisions.

## Release Artifacts

- Build command: `npm run build:web-release`.
- Artifact: `output/releases/standalone/`.
- Build ID: `b9ca76804607`; application package version `1.0.0`.
- Integrity manifest: `output/releases/standalone/release-manifest.json` (37 file records; 626,121 payload bytes, excluding installed dependencies).
- Runtime dependency manifest/lock are derived from the source `package-lock.json` and include only Fastify, multipart/static, AJV, franc, Sharp and the three local font packages. No Vite, Tailwind compiler, TypeScript, Puppeteer/Chromium, tests, PDF helper or live AI test ledger is in the runtime manifest.
- Production frontend/CSS, canonical web schema/registry/locale catalogs, palettes, service/Caddy/environment templates and compiled ESM server are included.

## Executed Readiness

### Linux x64 clean install and app

- `npm run verify:web-readiness` used `node:24-bookworm-slim` on `linux/amd64`, executed `npm ci --omit=dev`, validated the installed runtime tree and launched the packaged app from the release directory with no source tree or dev dependencies mounted.
- Installed dependency tree: 70,355,982 bytes. Native Sharp upload, preview and 1200×630 OG image generation passed on Linux.
- Real API/storage smoke created, saved, previewed, published, reopened and shared all four modes; exercised Japanese/Chinese resources, a guide-owned raster/logo, missing credentials/manual authoring, a 14-day itinerary and a 60-place destination guide.
- Management API remained on loopback. Local anonymous direct page and image fetches succeeded; retired HTML/OG URLs remained 404 after token rotation.

### Local TLS and proxy boundary

- `deploy/Caddyfile.example` was exercised with Caddy `tls internal`, a disposable local CA and `localhost`; client TLS verification succeeded using only that test CA.
- Only exact share HTML/image GET/HEAD routes were forwarded. Root/editor, `/api/*`, arbitrary assets, POST, unknown/revoked tokens and encoded path bypass attempts were denied. An attacker-supplied `X-Forwarded-Host` did not change trusted OG origin.
- Caddy local CA was not installed on the host and no public DNS/ACME request was made. This does not claim public internet reachability or WhatsApp behavior.

### systemd, restore, rollback

- `deploy/itinerary-engine.service` was executed in a disposable Debian Bookworm/systemd 252 container with a dedicated unprivileged service account and separate persistent data volume. `MainPID` ran as `itinerary-engine`; loopback health worked before and after `systemctl stop/start`.
- Stopped full-root backup and restore preserved workspace/profile, draft IDs/revisions, asset, active share pages/images, operation/version state and revoked-token tombstones.
- A second immutable release directory using the same compatible build was started at the same configured origin/root; IDs, active links and page/image hashes matched. The original release path was then restored and parity rechecked. This is a same-build release-path/rollback rehearsal, not a schema migration test.

## Evidence and Resource Report

Detailed machine-readable evidence: `output/web-readiness/readiness-summary.json`, `output/web-readiness/systemd-summary.json`.

| Measurement | Observed |
|---|---:|
| Clean runtime install | 16.4 s |
| Local app + Caddy TLS cold readiness | 7.6 s |
| Runtime payload / installed dependencies | 626,121 B / 70,355,982 B |
| Node container idle RSS sample | 49.4 MiB |
| Sampled maximum during workflow/stress render | 324.2 MiB; instantaneous Docker CPU sample 64% |
| Post-burst Node container RSS / CPU sample | 222.3 MiB / 0.01% |
| Data root after four modes, 14-day/60-place stress, assets and publications | 31,250,086 B |
| Published HTML / OG bytes, fixture set | 30,278,143 B / 33,517 B |
| Public GET burst | 24 requests / 883 ms |
| systemd service start / stop-start | 356 ms / 6.6 s |

The measurements are from Docker Desktop's local Linux x64 reference environment, not a cloud instance or capacity promise. The Docker CPU values are sampled, not sustained throughput benchmarks; optional proxy RSS was not separately measured. Resource report lists one Node process, local SQLite/filesystem, optional Caddy proxy, and no PDF worker/browser/managed DB. Potential future AWS charges (compute, disk, public IPv4, transfer, backup) are unpriced until target/account/region selection.

## Documentation and Operations

- Operator runbook: `../docs/standalone-deployment-readiness.md`.
- Runtime/API contract: `../docs/engine-runtime-contract.md` and `../docs/editor-ai-api-contract.md`.
- Deployment examples: `../deploy/runtime.env.example`, `../deploy/itinerary-engine.service`, `../deploy/Caddyfile.example`.
- Backups require the service stopped and the complete data root; do not run concurrent recovery against one data root.
- Future deployment requires an explicit request and selected target/region/architecture/budget, domain/origin/DNS owner, admin access boundary and backup owner.

## Verification Summary

| Command | Result |
|---|---|
| `npm run build:web-release` | PASS; Linux-target runtime release + SHA-256 manifest |
| `npm run validate:web-release` | PASS; runtime-only dependency closure and manifest |
| `node scripts/web/validate-release.mjs output/releases/standalone --installed` | PASS; clean Linux dependency install, no forbidden dev/browser/PDF tooling |
| `npm run verify:web-readiness` | PASS; clean Linux app, all four modes, CJK/assets, local TLS share-only proxy, restore/upgrade-path/rollback and metrics |
| `npm run verify:web-systemd` | PASS; actual systemd 252 unit start/stop/restart and unprivileged Node process |
| CP027 unit/browser/E2E gates | PASS; see CP027 completion log |
| `npm run validate`, `npm test` | PASS; root test 1/1 |
| `npm audit --audit-level=moderate` | PASS; 0 vulnerabilities |

## Acceptance Criteria

| Criterion | Result |
|---|---|
| R28-1 — runtime-only package and clean Linux install | PASS |
| R28-2 — trusted local TLS proxy, share-only public access, loopback/private API | PASS |
| R28-3 — one-process restart, full-root backup/restore, compatible same-build path switch and rollback | PASS |
| R28-4 — measured report, runbook and unresolved host/domain/budget gate | PASS |
| Chapter close | **ACCEPT (2026-10-09): standalone-ready / not deployed.** CP026 remains removed; CP029 remains pending; no staging/production/AWS claim. |
