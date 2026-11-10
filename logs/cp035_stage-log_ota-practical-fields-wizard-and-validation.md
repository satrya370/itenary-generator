# CP035 Stage Log: OTA Practical Fields, Wizard and Validation

Executor: Claude Haiku 5.5. Date: 2026-11-10. Plan: `plans/cp033-cp036_implementation-plan_editor-usability-setup-and-places.md`, CP035. Base: `d037508`.

## Stage S1 — schema web-2.1.0 (done)

| Item | Change | Where |
|---|---|---|
| Schema | `schemaVersion` const `web-2.1.0`; `notSuitableFor[]` and `notAllowed[]` added (same shape and limits as `included`); `healthSafety[]` removed | `config/web/itinerary.schema.json` |
| Types | Regenerated (`generate-types.mjs --print` checked, then written; `--check` matches) | `src/contracts/itinerary.generated.d.ts`, `types.ts` (`SCHEMA_VERSION`, `PREVIOUS_SCHEMA_VERSION` = web-2.0.0) |
| Upgrade | v1 upgrade writes 2.1 directly: `healthSafety` folded into `localTips` (deduped), new empty lists. New `upgradeV20ToV21` (same merge, adds `HEALTH_SAFETY_MERGED` warning). | `src/contracts/upgrade-v1.ts` |
| Migration 4 | Backup `pre-migration-4.sqlite` by `VACUUM INTO` (only when web-2.0.0 drafts exist, never overwritten), then every web-2.0.0 draft upgraded in one transaction; revision unchanged; a draft that fails validation aborts the whole migration with the itinerary id and codes. | `src/server/store.ts` |
| Registry | 74 fields: `notSuitableFor[]` and `notAllowed[]` added (repeater, all modes, not required); `healthSafety[]` removed; `localTips[]` label `knowBeforeYouGo`; `registryVersion` web-2.1.0 | `config/web/field-registry.json` |
| Labels | Six locale catalogs: `notSuitableFor`, `notAllowed`, `knowBeforeYouGo` (ID/EN/FR/JA/ZH-Hans/LA); `healthSafety` removed | `config/web/locales/*.json`, `src/editor/labels.ts` |
| Renderer | Practical groups in plan order: included, notIncluded, whatToBring, notSuitableFor, notAllowed, localTips (label knowBeforeYouGo), emergency contacts; blank entries dropped (closes follow-up F-R3-2) | `src/render/render.ts` |
| Draft / preview / editor | `draft.ts` emits the new lists; `preview.ts` content paths for them; editor shows "Tidak cocok untuk" and "Tidak diperbolehkan" lists; `normalizeBlanks` keeps them clean | `src/server/draft.ts`, `src/server/preview.ts`, `src/editor/sections/Practical.tsx`, `src/editor/model.ts` |
| Test fixtures | `fixtures-v2.ts` at web-2.1.0 with new lists; contract expectations moved to web-2.1.0; contract test for v1 `healthSafety` → `localTips` (mutation check: removing the dedupe fails it); store test for migration 4 (healthSafety merged, revision kept, backup written); version expectations moved to `[1,2,3,4]` and web-2.1.0 across api, publication, store and the recovery probe | `tests/web/*`, `scripts/web/probe-recovery-scope.ts` |

Deviation from plan S1 step 2: the plan asked for a new module `src/contracts/upgrade-v2.ts`. The 2.1 upgrade lives in `upgrade-v1.ts` instead, next to the v1 path it extends, to avoid two upgrade entry points. `upgradeV20ToV21` is exported from there.

### Gate S1

| Command | Result |
|---|---|
| `npm run build:web-app` | rc 0 |
| `typecheck:web-app`, `typecheck:web-contracts`, `typecheck:web-contracts-v2`, `typecheck:web-server`, `check:web-types` | rc 0 each |
| `test:web-contracts` / `store` / `api` / `ai` / `render` / `editor` / `preview` / `publication` | 43 / 12 / 13 / 28 / 14 / 28 / 12 / 12, 0 fail |
| `verify:web-editor`, `-preview`, `-publication`, `-ai-ui`, `-e2e`, `-publish-retry`, `-render` | rc 0 each |
| `probe:web-recovery-scope` | rc 0 |
| Migration on a **copy** of `.runtime/engine.sqlite` (temporary folder) | versions `[1,2,3,4]`; 14 drafts now `web-2.1.0`; `backups/pre-migration-4.sqlite` written. The owner's data root was not touched. |

Mutation checks: (1) migration-test dedupe removed → `upgrade` contract test fails; restored.

### Open questions for the reviewer (S1)

- `itinerary.schema.v1.json` still lists `healthSafety`; intentionally kept (v1 is only read by the upgrade).
- The copy migration reported 14 drafts; the owner's actual data root may differ after further edits. Migration 4 runs automatically on the next server start: back up `.runtime/` before starting the server with this build.

## Stages S2–S4

Not started in this log entry; see the next section when added.

## Stage S2 — OTA option lists (done)

| Item | Change | Where |
|---|---|---|
| Option lists | `config/web/practical-options.json` version 1, `id` and `en` (15/11/16/12/11/10/9 items; parity checked by test 5e) | `config/web/practical-options.json` |
| Preview-guard check | Every option (168 texts) run through the three guard patterns copied from `preview.ts`: 0 matches, so no option removed | test 5e |
| Editor lists | `OptionList`: preset checkboxes (checked = exact string in the list) plus typed custom rows; hint "Pilih bahasa konten untuk melihat pilihan umum." when language unset. Duplicate legend hidden inside (`TextList hideLegend`). | `src/editor/sections/OptionList.tsx`, `src/editor/fields.tsx`, `src/editor/practicalOptions.ts` |
| Terms & conditions | `PolicyOptions`: checking adds the exact line to `policies`, unchecking removes it; the textarea stays editable. | `src/editor/sections/PolicyOptions.tsx`, `Closing.tsx` |

Tests: 5e (parity and guard safety), 5f (policy line handling). Editor 30/30.

Gate S2: build rc 0; typecheck-app rc 0; contracts 43, store 12, api 13, ai 28, render 14, editor 30, preview 12, publication 12 (0 fail); `verify:web-editor`, `-preview`, `-publication`, `-ai-ui`, `-e2e`, `-publish-retry`, `-render` all rc 0.

Screenshots opened (390 px, full_day, language en): `output/web-editor/cp035-s2-practical-390.png` (chips for each group, custom rows, no overflow) and `cp035-s2-closing-390.png` (terms & conditions picker above the textarea).
