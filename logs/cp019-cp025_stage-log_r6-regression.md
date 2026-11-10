# CP019-CP025 Stage Log: R6 Regression, End-to-End, Logs and Docs

Executor: Claude Sonnet 5.5. Date: 2026-11-10. Plan: `plans/cp019-cp025_revision-plan_guide-centric-schema-and-editor.md` (R6, "R5/R6 execution plan", "R5 completion and R6 plan", H10). Starting point: R5 commit `73168be`.

## What changed in R6

| File | Change |
|---|---|
| `scripts/web/verify-ai.ts` | Live harness ported to v2 names (`trip`, `days`, `places`, target kind `place`); type-checked only (see "Not run"). |
| `scripts/web/verify-ai-ui.ts` | Ported to the new UI: mode cards, "Buat dengan AI" per section, "Deteksi otomatis", v2 draft paths. |
| `scripts/web/probe-publish-retry.ts`, `probe-recovery-scope.ts`, `probe-cp027-findings.ts` | v2 fixtures (`fixtures-v2.ts`), `web-2.0.0` rows, `trip.title` selector, v2 content for the 7 h half-day finding and the corrupt-raster finding. |
| `scripts/web/verify-e2e.ts`, `tests/web/cp027-fixtures.json` | v2 content for every case; manifest keys `blockIds` -> `dayIds`, `firstSpot` -> `firstPlace`, `guideSpots` -> `guidePlaces`, item IDs recomputed from `fixtures-v2.ts`; the agency logo is set through the workspace profile. |
| `scripts/web/verify-readiness.ts`, `readiness-runtime-probe.mjs` | v2 fixtures and cover photo; not run. |
| `scripts/web/verify-preview.ts` | Waits for the Preview button to be enabled before clicking (race fix, see Deviations). |
| `tests/web/ai.test.ts`, `tests/web/store-migration.test.ts` | Type fixes only (`'spot'` -> `'place'`; a row type for the snapshot). No assertion changed. |
| `logs/cp019..cp025_completion-log_*.md` | Seven revision sections appended; history untouched. |
| `docs/engine-runtime-contract.md`, `docs/editor-ai-api-contract.md`, `docs/standalone-development.md` | v2 content shape, migration note, list ordering, PATCH body, diagnostics shape with `targetId`, AI target kind `place`, build-before-verify note. |
| `plans/cp030-cp032_...` | Dated note: revise to `web-2.0.0` before CP030 starts. |

`tests/web/fixtures.ts` stays v1 on purpose (input of the `upgradeV1ToV2` tests); no script imports it any more.

## Gate (run in this session; `npm run build:web-app` and `build:brochure-css` first)

| Command | Result |
|---|---|
| `check:web-types` | declaration matches the schema |
| `typecheck:web-contracts`, `typecheck:web-contracts-v2`, `typecheck:web-app` (full, no scope) | 0 errors each |
| `typecheck:web-server` | 0 errors, 0 outside the scope |
| `test:web-contracts` / `store` / `api` / `ai` / `render` / `editor` / `preview` / `publication` | 42 / 11 / 12 / 28 / 14 / 25 / 12 / 12 pass, 0 fail |
| `npm test` (legacy `tests/*.test.mjs`) | 1 pass |
| `verify:web-editor` | exit 0 |
| `verify:web-preview` | exit 0; 6 consecutive passes after the race fix (it failed 1 run in 3 before) |
| `verify:web-publication` | exit 0 |
| `verify:web-publish-retry` | exit 0, `reproduced: false`, 6 attempts |
| `probe:web-recovery-scope` | exit 0, `reproduced: false` |
| `probe-cp027-findings.ts` (run once with `npx tsx`) | V27-01, V27-03, V27-04, V27-05 all `reproduced: false`; V27-01 now blocked by `DURATION_CAP_EXCEEDED` |
| `verify:web-ai-ui` | exit 0 |
| `verify:web-render` | exit 0 (13 fixtures) |
| `verify:web-e2e` | exit 0, status `passed`: AI apply/save, preview, publish, crash after artifact promotion (`SERVER_RESTARTED` on replay), graceful restart, republish keeps link, revoke and rotate, four modes, six locales, long copy (3675 code points), owned asset and OG, 14-day and 60-place stress; 0 console errors, 0 external requests |
| `build:web-release` | exit 0, 39 files, build ID `7eeeb1476821` |
| `validate:web-release` | `valid`, 39 files, 10 dependencies |

## Not run (skipped, not passed)

- `verify:web-ai`: runs only with `--live` (paid provider, US$2 ledger). The default run prints "Live provider calls require --live; no request was sent." and exits 1 by design. The harness was ported and type-checked.
- `verify:web-readiness`: needs a running Docker daemon (Linux containers) plus network for `npm ci`; `docker version` reports the engine pipe is missing. Not started, because a failed run would overwrite `output/web-readiness/readiness-summary.json`, the CP028 evidence from 2026-10-09. The code was ported and type-checked.
- `verify:web-systemd`: out of scope for this stage.

## Visual check (RULES 11a)

Published pages from `verify:web-e2e` (`output/web-e2e/`), opened and read:

- `cp027-mode-multi_day-desktop.png` (1440 wide): French locale; hero with "2 JOURS" pill; info strip (start and end date, meeting point and time, guide name and phone); day chips; day cards with timeline, durations ("1 h 30 min"), meals, hotel box, transfer note; practical cards; closing.
- `cp027-mode-half_day-desktop.png` (1440): "DEMI-JOURNÉE", start/end time range, no meals/hotel, practical and closing blocks.
- `cp027-mode-destination_guide-mobile.png` (390): single column, group heading "Central Ubud", numbered place cards, no timeline.

Only checked by the automated no-overflow assertions (images not opened): full_day desktop/mobile, half_day and multi_day mobile, destination_guide desktop, and the six locale shots (the CJK glyph check ran in `verify:web-render`). The e2e desktop width is 1440, not 1280; 1280 was inspected in R3 and R5.

## Deviations

1. `verify-ai-ui.ts`: the first assertion (sidebar box "Penulisan AI" exists once) is now "it is gone, and 'Bantuan AI' exists in the form", because the plan removes that box. All other assertions kept.
2. `verify-e2e.ts`: scope labels from the manifest are matched in the page source, not `innerText`, because `innerText` is upper-cased by CSS (the pill reads "DEMI-JOURNÉE"). The check is case-sensitive, so it is not weaker.
3. `verify-preview.ts`: added a wait for the Preview button to be enabled. The status text "Tersimpan · revisi" appears before `busy` is cleared, so the click sometimes hit a disabled button. `verify-e2e.ts` already waited this way.
4. The agency logo and name in `verify-e2e.ts` are written to the workspace profile (`PATCH /api/v1/itinerary-engine/profile`) because the draft no longer carries agency data.
5. The manifest keeps `scopeLabel` as an independent expected value; the renderer derives the same strings from the locale catalogs (`la`, `fr`, `en`, `id`, `ja`, `zh-Hans` verified).

## Open questions for the reviewer

- Joint reviews still pending: R1+R2 (CP019/CP021/CP023), R3+R4 (CP020/CP024/CP025, including deviations E1-E4), and R5/R6 (CP022).
- R1-S1: the schema lacks `places.maxItems: 60`.
- Run `verify:web-readiness` once Docker Desktop is running, and `verify:web-ai --live` if a live check after the schema change is wanted.
- No CP status or R1-R6 checkbox was changed; the reviewer does that.
