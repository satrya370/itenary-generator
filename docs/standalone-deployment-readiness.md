# Standalone Deployment Readiness (CP028)

**Status:** `standalone-ready` for the tested local Linux x64 profile; **not deployed**. AWS account/region/instance/domain/budget have not been selected. Public HTTPS/WhatsApp/Meta crawler appearance remains deferred until a separately authorized deployment.

## Verified release

- Build ID: `b9ca76804607`; application version `1.0.0`.
- Artifact: `output/releases/standalone/`; integrity list: `release-manifest.json`.
- Runtime profile: Node.js 24 on Debian Bookworm slim, Linux x64/glibc. Runtime manifest/lock are generated from the source lock and exclude development dependencies, Puppeteer/Chromium, Vite, TypeScript, tests and PDF tooling.
- Browser assets: prebuilt `dist/`; render stylesheet: `runtime/brochure.css`; locale catalogs/palettes and font packages are included/locked. Runtime data is stored outside the release directory.
- Runtime dependencies are installed with `npm ci --omit=dev`; clean install and the native Sharp image/OG flow passed in the Linux container.

## Clean setup

1. Copy the release artifact to a versioned immutable directory. Create a separate writable data root, for example `/var/lib/itinerary-engine`; do not put the database/assets in the release directory.
2. Install a supported Node 24 Linux x64/glibc runtime, then run `npm ci --omit=dev` in the release directory.
3. Copy `runtime.env.example` to `/etc/itinerary-engine/runtime.env`, replace `SHARE_ORIGIN` and absolute paths for the selected deployment, keep `HOST=127.0.0.1`, and inject `OPENROUTER_API_KEY` through a protected secret mechanism. Do not place a key in the artifact, browser bundle, shell history or source control.
4. Copy `itinerary-engine.service` into systemd's unit directory, create the unprivileged `itinerary-engine` user/group, grant it write access only to the data root, then `systemctl daemon-reload && systemctl enable --now itinerary-engine.service`.
5. Verify `/api/health` plus an operator-side create/save/preview/publish check. `/api/health` returns only `ok`; it is a liveness check, not a deep health assertion.

The bundled service listens on loopback only and supervises one Node process per data root. Do not run multiple instances or concurrent startup recovery against the same SQLite/filesystem root.

## Public proxy boundary

`Caddyfile.example` is a **local TLS test template** (`tls internal`, `localhost:8443`). Its allowlist forwards only `GET`/`HEAD` for exact `/i/{shareToken}` and `/i/{shareToken}/og-image` paths. It denies the editor shell, `/api/*`, arbitrary assets, other methods and path traversal; it has no SPA fallback. The Node listener remains loopback-only and trusts `SHARE_ORIGIN` from configuration, not forwarded host headers.

For a future internet deployment, an operator must select the hostname and replace the local TLS configuration with an authorized public TLS configuration. Keep the same exact share-route allowlist. Do not expose the editor/management API. Public HTTPS, DNS, certificate issuance, Meta/WhatsApp crawler retrieval and card-cache appearance were **not tested** in CP028.

## Backup, restore, upgrade and rollback

- Stop the service first. Back up the **entire data root** as one consistent set: `engine.sqlite`, `assets/`, `published/` and the associated runtime data. Database-only or live filesystem copies are not supported.
- Verify a backup manifest/checksum, then restore the whole root before starting the service. Startup recovery treats pending publication operations as failed and preserves every committed artifact referenced by any workspace.
- Install the next immutable release at a new path, update the `current` pointer/service path, and start one process. Verify workspace/profile, draft IDs/revisions, asset references, active page/image hashes, revoked-token 404s and operation state.
- For compatible code rollback, stop the service and point `current` back to the prior release. If a schema change is not backward compatible, restore the matching stopped full-root backup; writes after that backup are outside the recovery point.

CP028 rehearsed a full-root backup/restore with active and revoked links, then switched between two paths containing the same verified build and rolled back. This validates the path/lifecycle/retention contract, **not** compatibility with a future schema migration or a different application build.

## Measured reference run

Evidence: `output/web-readiness/readiness-summary.json` and `output/web-readiness/systemd-summary.json`.

| Measurement | Observed result |
|---|---:|
| Release payload (without installed `node_modules`) | 626,121 bytes |
| Runtime-only Linux install | 16.4 s; installed dependency tree 70,355,982 bytes |
| App + local Caddy TLS readiness | 7.6 s |
| Node container idle sample | 49.4 MiB RSS; 0.00% sampled CPU |
| Node container sampled maximum during preview/publish/render stress | 324.2 MiB RSS; 64% instantaneous CPU sample |
| Node container post-burst sample | 222.3 MiB RSS; 0.01% sampled CPU |
| Data root after four modes, 14-day/60-place stress, assets and publications | 31,250,086 bytes |
| Committed HTML/OG snapshots in the measured fixture set | 30,278,143 / 33,517 bytes total |
| Preview/publish duration | half-day 60/172 ms; full-day 75/208 ms; multi-day 1,158/1,141 ms; guide 756/834 ms |
| Additional stress preview/publish | 14-day 1,041/1,121 ms; 60-place guide 832/947 ms |
| 24 concurrent public GETs | 883 ms |
| systemd service stop/start | 6.6 s; user `itinerary-engine`; one Node `MainPID` |

These are measurements from a local Docker Desktop Linux/amd64 container, not an AWS instance or capacity promise. CPU figures are instantaneous Docker samples collected during the runtime workload, not a sustained saturation benchmark; Caddy's resource usage was not separately sampled. Likely later cloud cost categories include compute, persistent disk, public IPv4, transfer and backups; amounts remain unpriced until target/account/region and resource sizing are chosen.

## Verification and boundaries

- Runtime release validator: `npm run validate:web-release`; installed-package check: `node scripts/web/validate-release.mjs output/releases/standalone --installed`.
- Local clean install, all four modes, CJK fonts, raster upload, anonymous OG HTML/image, TLS trust, share-only proxy, denied management routes, backup/restore/rollback and systemd lifecycle passed.
- AI manual authoring and publish work without credentials; CP027's deterministic provider double was not included or enabled in the release. Historical live ledger was read-only checked at US$0.001361 of US$2 with 12 settled entries; no new inference or reset occurred.
- No AWS resources, public DNS, staging or production hosts were mutated. Status is **standalone-ready / not deployed**, not staging-ready or production-live.
