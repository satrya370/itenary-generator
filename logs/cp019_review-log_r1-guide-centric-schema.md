# CP019 Review Log: R1 Guide-Centric Schema (web-2.0.0)

**Date:** 2026-11-05. **Reviewer:** Claude Opus 5.5 (planner). **Executor reviewed:** Claude Haiku 4.5.
**Plan:** `plans/cp019-cp025_revision-plan_guide-centric-schema-and-editor.md` § R1.
**Verdict:** **REVISE.** The executor's work is incomplete and leaves a broken file. The plan also has defects that make the R1 gate impossible to pass as written. The plan is amended (§ "R1 amendment 2026-11-05" in the plan); the executor redoes R1 against the amended plan.

## State found on disk

| Item | Finding |
|---|---|
| `TODOS.md` | CP019 marked `in_progress (R1 — schema v2)`. Correct. |
| `config/web/itinerary.schema.v1.backup.json` | Byte copy of the v1 schema. **It is the only copy of v1:** `config/` is not tracked by git (see B1). Keep it, but rename it per the amendment. |
| `config/web/itinerary.schema.json` | **Broken hybrid.** `schemaVersion`/`properties` are v2 and reference `$defs` `trip, guide, meeting, pickup, photo, day, place, emergencyContact`, but `$defs` is still v1 (`brochure, hero, …`). The full rewrite via a bash heredoc failed to parse (quote in `'SCHEMA_EOF'` content), so nothing was written. Any process that imports `validator.ts` now throws at load. The running server still works only because it loaded v1 before the edit. Do not restart it. |
| Other 7 R1 files | Not started. |
| Gate commands | Not run. |
| Handoff message | Accurate about what was done. It described the schema as "prepared (not yet written)", but the file *was* partially written. |

## Blocker (not an executor fault)

- **B1 — The web engine is not under version control.** `git ls-files` returns 46 tracked files, all from the n8n era. `src/`, `config/`, `tests/web/`, `scripts/web/`, `plans/` (CP018+), `logs/` (CP018+) and `docs/` are all untracked. The plan's rollback ("revert the commits per stage") and the executor rule "commit after each stage" are impossible, and a bad edit has no recovery path. **A baseline commit of the current CP028-accepted state (excluding generated/runtime/screenshot artifacts) is required before R1 continues.** This needs the owner's approval.

## Plan defects (planner fault): fixed in the amendment

- **P1 — R1 gate cannot pass.** `typecheck:web-contracts` uses `tsconfig.web.json`, which includes `src/render/**`, `scripts/web/**` and all of `tests/web/**`. These still use v1 paths until R3/R5/R6. Fix: add `tsconfig.contracts.json` scoped to the contracts layer and its tests for the R1 gate. The full `typecheck:web-contracts` becomes an R6 gate.
- **P2 — Locale catalogs vs. the key-parity test.** `tests/web/contracts.test.ts:26-35` requires every catalog's keys to equal exactly the registry `labelKey`s ∪ `displayLabelKeys`. The plan said "remove keys for deleted fields" in R1, which would break the v1 renderer used until R3. Fix: R1 only **adds** keys. v1 keys that are no longer field labels move into a new registry array `legacyLabelKeys`, which the parity test includes. R3 deletes `legacyLabelKeys` and those catalog entries.
- **P3 — v1 types disappear.** Regenerating `itinerary.generated.d.ts` from the v2 schema removes the v1 types that `upgradeV1ToV2`, the legacy adapter and the v1 fixtures need. Fix: freeze the v1 schema as `config/web/itinerary.schema.v1.json` and the current declaration as `src/contracts/itinerary-v1.generated.d.ts` (copied before regeneration). Export `ItineraryV1` from it.
- **P4 — "`trip.language` mirror" in `validateDraft` is impossible.** `validateDraft(content)` never sees `languageContext`. Fix: the validator only validates `trip.language` as a BCP 47 tag. The `languageContext.outputLanguage === trip.language` check stays in `app.ts` (`validLanguage`), updated in R2.
- **P5 — Mapping omissions that would lose data or make migration fail:**
  - The plan never says stable IDs are **preserved**. `writingContext.notes[].targetId`, AI operations and diagnostics depend on them.
  - With `activities` `minItems: 1` in the schema, a v1 day with zero activities (allowed in v1 drafts) fails the upgrade. Migration 3 is all-or-nothing, so the app would refuse to start. Draft structure must allow 0 activities; "≥1" is a publish rule.
  - v1 `schedule[].date` with a null `startDate` should seed `trip.startDate`.
  - A collapsed day range shrinks the trip's day count. The warning must say so.

## Schema defects in the executor's draft (for the redo)

1. `photo`, `day.hotel` and `day.meals` objects have no `required` list, so `{}` validates. Every object must list all its keys in `required` (same convention as v1).
2. `trip.region` is missing from `trip.required`.
3. The "https only" rule is not enforced on `meeting.mapsUrl` and `photoCredit.url`. Add `"pattern": "^https://"`.
4. `days` has no `maxItems: 14` and `places` has no `maxItems: 60`.
5. `day.activities` has `minItems: 1`; remove it (P5).
6. No sibling keywords next to `$ref`. This is the cause of the old `X & X1` intersection types. The draft complies; keep it that way.
7. The `colorTheme` `default` keyword is harmless but unused by AJV here. Remove it; `createBlankDraft` sets `'mixed'`.

## Answers to the executor's questions

1. **Schema approach:** the structure matches the plan, with the defects above.
2. **Migration edge cases:** P5 covers them. Also: a v1 photo with a null `assetId` but a non-empty attribution → `null` photo + warning `PHOTO_CREDIT_WITHOUT_PHOTO`.
3. **Intersection types:** caused by `$ref` with sibling keywords (e.g. v1 `agencyLogoAssetId: { $ref, maxLength }`). With no siblings, `json-schema-to-typescript` emits `Photo = {…} | null`, and `field-coverage.ts` (which only dereferences a direct `$ref`) keeps working. Do **not** switch to `anyOf` nullable refs: coverage cannot traverse `anyOf`.
4. **Locale keys:** 24 new keys as listed in the plan, added to all six catalogs (P2). For `la`, follow the existing catalog's register. For `ja`/`zh-Hans`, use short UI-label style.
5. **Sequencing:** after the amended R1 gate passes, R2 follows. Between R1 and R5 the running app is intentionally not runnable against v2 (the server, renderer and editor are still v1). Stop the dev servers before R1 resumes, and do not restart them until R2.

## Required before R1 resumes

1. Owner approves and the baseline commit is made (B1).
2. Stop the running dev servers (ports 3000 and 5173).
3. The executor redoes R1 per the amended plan, writing files with the Write tool (not bash heredocs), then runs the amended gate and records the output.
4. Return to the reviewer (Opus) with the gate output before CP019 is marked completed.

---

## Executor re-submission 2026-11-05 (Claude Sonnet 5.5) — R1 redone per the amendment, awaiting re-review

### Gate output (amended gate, run after the final edit)

| Command | Result |
|---|---|
| `npm run check:web-types` | "Generated TypeScript declaration matches the canonical JSON Schema." |
| `npm run typecheck:web-contracts-v2` | exit 0, no diagnostics |
| `npm run test:web-contracts` | 37 tests, 37 pass, 0 fail |

Not a gate (expected until later stages): `tsc -p tsconfig.web.json` reports 77 errors in `src/render/render.ts`, 62 in `src/server/preview.ts`, 28 in `scripts/web/verify-editor.ts`, 14 in `scripts/web/verify-ai.ts`, 10 each in `tests/web/editor.test.ts` and `src/editor/model.ts`, 5 in `tests/web/ai-api.test.ts`, 4 in `src/server/app.ts` (+79 in `src/editor/main.tsx` via `tsconfig.app.json`). No errors appeared in any file not scheduled for R2–R6.

### Files

Added: `config/web/itinerary.schema.v1.json` (frozen v1, byte-identical to the committed v1), `src/contracts/itinerary-v1.generated.d.ts` (frozen), `src/contracts/upgrade-v1.ts`, `tests/web/fixtures-v2.ts`, `tsconfig.contracts.json`.
Rewritten: `config/web/itinerary.schema.json` (web-2.0.0), `config/web/field-registry.json` (73 paths + `legacyLabelKeys` 31), `src/contracts/validator.ts`, `src/contracts/types.ts`, `src/server/draft.ts`, `tests/web/contracts.test.ts`, `src/contracts/itinerary.generated.d.ts` (regenerated, no `&` intersections).
Edited: `src/contracts/field-coverage.ts` (anyOf-aware), `config/web/locales/*.json` (25 keys added per catalog, none removed), `package.json` (+`typecheck:web-contracts-v2`).
Not touched: renderer, preview, publication, store, AI service, editor, v1 legacy adapter, v1 fixtures.

### Deviations from the plan/amendment (each needs the reviewer's decision)

| ID | Deviation | Reason |
|---|---|---|
| D1 | v2 size limits are **not** the plan's smaller numbers where v1 allowed more: lists 50 items × 500 chars (plan 40 × 300), `localTips` 50 × 1200, `emergencyContacts` 30 with value 240 (plan 10), place description 6000 (plan 4000), place tips 20 × 1000 (plan 10 × 600), `suggestedDuration` 120, `bestTime` 240, `nearby` 500, activity `tip` 4000, `transferNote` 2100. | Migration 3 is all-or-nothing. A valid v1 draft above the plan's limits would make the app refuse to start. A test (`v1 maximum field sizes carry over…`) pins this. |
| D2 | `places` has **no** `maxItems` (plan: 1–60). Publish still requires ≥ 1 for a guide. | v1 had no cap and a test asserted 120 spots valid ("not silently capped"). A cap would also fail migration of any larger draft. Request size is already bounded by the 2 MB JSON limit. |
| D3 | A v1 block whose accommodation has no name but has area/note upgrades to `hotel: { name: '', area, note }` + warning `HOTEL_NAME_EMPTY` (plan: `null`). | The standard v1 multi-day fixture has `name: null, area: 'Ubud'`; `null` would silently lose area and note. |
| D4 | Nullable objects are a plain object def + `anyOf: [{$ref}, {type: "null"}]` at the six use sites; `collectSchemaLeafPaths` now follows `anyOf`. | Amendment items 2 and 3 conflict: `type: ["object","null"]` defs made the generator emit `{…} & ({…} | null)`, which silently drops `null` from the TypeScript type. |
| D5 | New optional registry key `requiredModes`; `days[].title` applies to all scheduled modes and is publish-required for `multi_day` only. | The plan says "publish-required for multi_day only", but a single `modes` array cannot express "optional elsewhere"; v1 fixtures fill the title in every mode. |
| D6 | 25 new locale keys (plan: 24): extra `meetingNote`. `hotel` and `meals` are in `displayLabelKeys` (section headings), not field keys. | `meeting.note` needs its own label. |
| D7 | Registry introduces control types `time` and `toggle`. | `HH:MM` fields and boolean flags needed a control. R5's editor must render both. |
| D8 | Photo `assetId` has `minLength: 1`. At publish a used photo needs a non-blank **photographer** in its credit (`PHOTO_ATTRIBUTION_REQUIRED`). | Mirrors v1's "used photo needs attribution" rule and RULES §11b. |
| D9 | `trip.startTime`/`endTime` ordering is a **publish** error (`TIME_RANGE_INVALID`), not a draft error. | Drafts stay saveable (W12). |

### Behaviour worth a second look

- Span cap: error if the sum of known `durationMinutes` in a day exceeds the cap (provable even with unknown start times), or if the span from the first timed activity to the end of the last timed one exceeds it, or if `startTime→endTime` exceeds it. Unknown times only produce `SCHEDULE_TIME_UNKNOWN` warnings. Overlap between activities is **not** checked in R1 (v1 did that in `preview.ts`; left for R4).
- `FIELD_NOT_APPLICABLE` is registry-driven (non-empty value at a path whose `modes` exclude the current mode) plus explicit object rules for `hotel`/`meals`, `pickup` details without an offer, and `days`/`places` in the wrong mode.
- `upgradeV1ToV2` never throws (tested on garbage input) and preserves every stable ID. It truncates only as a last resort (`VALUE_TRUNCATED`), which no test case triggers.
- Scratch generators `D:\Temp\build-registry-v2.mjs` and `D:\Temp\add-locale-keys.mjs` produced the registry and catalog additions. They are not committed; the JSON files are now the source of truth.

### Requested from the reviewer

1. Accept or reject D1–D9. D2 (no place cap) and D3 (hotel name) change what the plan fixed.
2. Confirm the Indonesian prefix `Hari {a}–{b}: ` for collapsed day ranges and the `Waktu:`/`Durasi:`/`Kategori:` tip prefixes (hard-coded Indonesian per the plan mapping; they appear in published text unless the guide edits them).
3. If accepted: append the CP019 revision section to `logs/cp019_completion-log_canonical-schema-and-field-registry.md`, set CP019 back to `completed`, and release R2.

---

## Executor submission 2026-11-05 — R2 (CP021/CP023 paths), executed without waiting for R1 review, awaiting joint R1+R2 review

Authorization: the owner asked for R2 to start immediately and for the reviewer to review R1 and R2 together. This is the only reason CP019, CP021 and CP023 are all marked in progress (RULES §9).

### Gate output (amended gate; see "R2 amendment" in the plan)

| Command | Result |
|---|---|
| `npm run check:web-types` | matches |
| `npm run typecheck:web-contracts-v2` | exit 0 |
| `npm run typecheck:web-server` | 0 errors in `src/server` (except `preview.ts`), `src/contracts`, `src/api`; 273 outside scope ignored |
| `npm run test:web-contracts` | 37 / 37 |
| `npm run test:web-store` (new) | 6 / 6 |
| `npm run test:web-api` | 12 / 12 |
| `npm run test:web-publication` | 10 / 10 |
| `npm run test:web-ai` | 28 / 28 |

Negative control: the old publication behaviour was re-injected temporarily (mkdir outside the try, no terminalization, unhandled insert conflict). The two new publication tests failed (8 pass, 2 fail), and passed again after restoring the code (10 / 10).

### Real-data run (copy of `.runtime/`, original not touched)

`ENGINE_DATA_DIR=<copy> PORT=3100 npm run`-equivalent start against 6 real v1 drafts. 33 checks passed: every draft opens as `web-2.0.0` and passes `validateDraft`; revision and `updatedAt` unchanged; all stable IDs preserved in order; language and writing contexts byte-identical; titles carried over; a warning entry exists per draft; `backups/pre-migration-3.sqlite` exists and still holds all drafts as v1; migrations 1, 2, 3 recorded; the AI ledger and operations equal the original. The original `.runtime/engine.sqlite` is still at migrations 1, 2 with 6 v1 drafts and no backups directory. **It will migrate the next time the app starts against it** (a backup is taken first).

Warning codes seen on real data: `b25d1f08` (the CP022 multi-day fixture) `AGENCY_VALUE_DROPPED, DAY_DATE_DROPPED, DAY_RANGE_COLLAPSED, FIELD_DROPPED`; `afb91652` `PLACE_CATEGORY_DROPPED`; the other four none.

### Files

Added: `scripts/web/typecheck-scope.mjs`, `tests/web/store-migration.test.ts`, `tests/web/test-renderer.ts`.
Rewritten: `src/server/store.ts` (migration runner, migration 3, ordered list), `tests/web/api.test.ts`, `tests/web/publication.test.ts`, `tests/web/ai-api.test.ts` (v2 paths plus new cases).
Edited: `src/server/app.ts`, `src/server/publication.ts`, `src/server/ai/{service,schema,validation,provider}.ts`, `src/api/client.ts`, `package.json` (+`typecheck:web-server`, `test:web-store`).
Not touched: `preview.ts` (R4), `render.ts` (R3), the editor (R5), docs (R6).

### Deviations and decisions needing the reviewer (E1-E6 in the plan's R2 amendment)

E1 operation-ID finding re-diagnosed; E2 `VACUUM INTO` backup; E3 AI schema split; E4 legacy `spot` ledger rows left as they are; E5 `INVALID_CURSOR` and `limit + 1` paging; E6 AI context shape change with **no live provider call made**.

### Things I could not verify

- The real layout renderer, preview checks and editor against v2: none exist yet (R3-R5). Until then the running app cannot preview, and the editor cannot load a v2 draft correctly. Do not start the dev servers for acceptance.
- AI suggestion quality with the new context shape (E6). A bounded live check belongs in R6.
- Migration of a v1 draft with more than 14 day blocks fails closed by design (the app refuses to start and names the draft); no such draft exists in the real data.

### Requested from the reviewer

1. Accept or reject R1 D1-D9 and R2 E1-E6.
2. Confirm that the amended R2 gate (renderer double, scoped typecheck) is an acceptable substitute, and that R4 must re-run publication with the real renderer.
3. Decide whether the user-facing Indonesian migration prefixes (R1 question 2) stay.
