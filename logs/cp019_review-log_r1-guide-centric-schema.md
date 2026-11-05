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
