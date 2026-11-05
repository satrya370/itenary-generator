# CP027 Completion Log: Standalone End-to-End Verification

## Result

- Status: `completed` — local acceptance matrix passed; public HTTPS/WhatsApp crawler verification remains explicitly deferred by W15.
- Summary: Verified the standalone editor and real Node/Fastify + SQLite/filesystem workflow across all four modes, six baseline locales, long-copy and asset fixtures, deterministic AI lifecycle, publication/revoke, child crash recovery and cross-workspace restore safety.
- Completed at: 2026-10-09.
- CP028 is now eligible to begin as a separate local-only readiness checkpoint. No AWS target, public domain, staging or deployment is selected or authorized.

## Plan and Entry Gates

- Chapter plan: `../plans/cp027-cp028_implementation-plan_standalone-verification-and-deployment-readiness.md` (§ CP027).
- CP024: completed/logged, including V27-01/V27-02/V27-03 revisions.
- CP025: completed/logged, including V27-04/V27-05/V27-06 and pending-publish-retry revisions.
- Prior CP021–CP023 and CP024–CP025 planner ACCEPT history is preserved. All reproduced completed-CP findings closed through their original checkpoint revision plans and reviews.
- AWS decision remains **target undecided; readiness only**. Public HTTPS/WhatsApp crawler appearance is not claimed.

## Implemented CP027 Verification Artifacts

- `scripts/web/verify-e2e.ts` starts the real app as a child process on loopback, uses temporary storage and the test-only deterministic provider, writes safe pass/failure summaries, and exercises full canonical data comparisons, crash/restart, all-mode publication, locale, long-copy and asset cases.
- `scripts/web/e2e-server.ts` exposes provider injection only behind the test-runner environment guard; no production route or live-provider fallback was added.
- `tests/web/cp027-fixtures.json` records independent mode IDs/order/text, locale labels/copy, long-copy length and asset-credit expectations.
- `scripts/web/probe-publish-retry.ts` (command `npm run verify:web-publish-retry`) proves pending retry operation-ID behavior.
- `scripts/web/probe-recovery-scope.ts` (command `npm run probe:web-recovery-scope`) proves cross-workspace committed artifact survival and restart operation terminalization.
- `scripts/web/probe-cp027-findings.ts` continues to verify V27-01/V27-03/V27-04/V27-05.

## Acceptance Matrix — SPEC.md §12

| SPEC criterion | Result | Executed evidence |
|---|---|---|
| 1. Standalone operator/editor/API/storage without Laravel or n8n | PASS | `verify:web-e2e` launches the real local app child and uses real SQLite/filesystem; no Laravel/n8n dependency. |
| 2. Workspace boundary, private management and public-only published data | PASS | `test:web-api` 9/9; `test:web-publication` 7/7; E2E checks writing brief/notes absent from anonymous share HTML; foreign workspace paths remain hidden; PDF/download route absent. |
| 3. Four modes create/save/reopen/edit/preview/publish | PASS | `verify:web-editor` verifies UI create/fill/save/reopen/reorder for all modes. `verify:web-e2e` previews/publishes all four through real server/editor and verifies public copy/OG. |
| 4. Registry/schema/output mapping | PASS | `test:web-contracts` 22/22; registry coverage test covers every schema leaf; generated types match canonical schema. |
| 5. AI Apply changes only requested fields; canonical identity/order preserved | PASS | `verify:web-e2e` compares complete canonical snapshots after Generate/Apply/Save; `verify:web-ai-ui` and `test:web-ai` 28/28 verify Apply/Discard/stale-target behavior. Deterministic results are labeled as doubles. |
| 6. AI timeout/limit/revision conflict and renderer failure preserve work | PASS | AI tests cover timeout/uncertain replay, quota and stale revision; `verify:web-editor` covers Save conflict; `test:web-preview` 9/9 covers unavailable renderer resources and draft preservation. |
| 7. Draft changes do not change published page; atomic republish | PASS | `verify:web-e2e` edits and republishes while keeping the active URL; `test:web-publication` covers failed render/storage and stable current version. |
| 8. No short expiry; revoke blocks HTML/OG; old token never revives | PASS | Publication tests backdate a token by two years, verify permanent revocation, old HTML/OG 404 and rotation. Browser publication flow also passes. |
| 9. OG metadata/image fetched anonymously | PASS — local contract | E2E performs direct HTTP fetches with no cookies or page JavaScript, checks OG metadata and 1200×630 JPEG. External HTTPS/WhatsApp/Meta crawler behavior is **DEFERRED — readiness-only decision**, not PASS. |
| 10. Phone/desktop visual checks for modes and stress | PASS | `verify:web-editor`: four editor modes at 390×844/1440×1000, 14-day and 60-place stress. Integrated E2E saves published page screenshots for four modes, six locales, 3,675-code-point copy, owned-image/OG; viewport overflow assertions pass. Inspected `output/web-e2e/cp027-mode-*`, `cp027-locale-*`, `cp027-stress-*`, `cp027-long-copy-*` and `cp027-owned-asset-og.png`. |
| 11. Locale/output and content-policy consistency | PASS | Integrated public renders for `la`, `fr`, `en`, `id`, `ja`, `zh-Hans`; expected labels/manual text, Japanese/SC font CSS, copy and viewport assertions. `test:web-preview` covers localized price/opening/booking false-positive and true-positive cases; AI language tests cover mixed/uncertain/override. |
| 12. Credentials excluded from browser/source artifacts | PASS | `verify:web-ai-ui` verifies credential-missing manual use and no browser key exposure; package validation/audit pass. No secret values or live operation IDs were written to logs. |
| 13. Draft/profile/assets/active and revoked publication survive restart/restore | PASS | API full-root copy restores draft/profile/assets; publication full-root copy restores active HTML/OG and revoked-token tombstones; E2E child restart and crash-after-promotion recovery preserve the old pointer and reject same-ID replay. Cross-workspace recovery regression preserves committed HTML/OG and terminalizes pending operations. |
| 14. Documented API/adapter boundary, standalone without SaaS | PASS | `docs/editor-ai-api-contract.md`, `docs/engine-runtime-contract.md`; web/API/contract suites pass. Actual Laravel integration remains CP029, not claimed. |

## Additional Revision and Provider Evidence

- V27-01/V27-02/V27-03 CP024 probes/revisions: `npx tsx scripts/web/probe-cp027-findings.ts` and `npm run verify:web-preview`; exact repeater focus after reorder; all observed findings not reproduced.
- V27-04/V27-05/V27-06 CP025 revisions: `test:web-publication` 7/7, `verify:web-publish-retry`, and `probe:web-recovery-scope`; all findings not reproduced.
- Historical live budget checked read-only before/after this CP: ceiling US$2.00; committed US$0.001361; 12 settled entries; no fresh inference or reset. Current end-to-end uses a deterministic test double and temporary engine roots.
- No AWS/cloud call, public staging/DNS, production mutation or external WhatsApp request occurred.

## Verification Summary

| Command | Result |
|---|---|
| `npm run test:web-contracts` | PASS 22/22 |
| `npm run test:web-api` | PASS 9/9 |
| `npm run test:web-preview` | PASS 9/9 |
| `npm run test:web-editor` | PASS 8/8 |
| `npm run test:web-ai` | PASS 28/28 |
| `npm run test:web-render` | PASS 12/12 |
| `npm run test:web-publication` | PASS 7/7 |
| `npm run typecheck:web-app`, `npm run typecheck:web-contracts`, `npm run check:web-types` | PASS |
| `npm run build:brochure-css`, `npm run build:web-app` | PASS |
| `npm run verify:web-preview`, `verify:web-editor`, `verify:web-publication`, `verify:web-ai-ui` | PASS; no browser external requests/console errors |
| `npm run verify:web-e2e` | PASS; four modes, six locales, long copy, owned assets/OG, crash/restart/revoke, zero external requests/console errors |
| `npm run verify:web-publish-retry`, `npm run probe:web-recovery-scope`, `npx tsx scripts/web/probe-cp027-findings.ts` | PASS; all named findings report not reproduced |
| `npm run validate`, `npm test` | PASS; root test 1/1 |
| `npm audit --audit-level=moderate` | PASS; 0 vulnerabilities |
| `git diff --check` | PASS; informational line-ending conversion notices only |

## Acceptance Criteria

| Criterion | Result |
|---|---|
| R27-1 — real four-mode workflows and canonical identity/order | PASS |
| R27-2 — six locales/stress/resources/policy and V27-01…06 gates | PASS |
| R27-3 — child crash/restart and stopped full-root restore | PASS |
| R27-4 — inspected responsive/OG evidence and local SPEC matrix | PASS; public HTTPS/WhatsApp external check explicitly deferred |
| CP027 close | PASS. **Disposition: ACCEPT (2026-10-09).** CP027 completed; CP028 may start. CP026 remains removed; CP029 remains pending. |

## Remaining Boundary

CP028 must verify clean Linux x64 runtime packaging, local trusted TLS/share-only proxy, restart/backup/restore/rollback and measured resources. This completion log does not claim local TLS or deployment readiness before those CP028 tests, and does not claim public internet/WhatsApp behavior.
