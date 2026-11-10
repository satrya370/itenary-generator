# CP019 Completion Log: Canonical Schema and Field Registry

## Result

- Status: `completed` after 2026-10-06 revision (see Revision section at the end).
- Summary: Added the versioned web canonical contract, 89-entry field registry, six locale catalogs, draft/publish structural validation and diagnostic legacy adapters for nested, wrapped and flat render input.

## Date

- Completed at: `2026-10-06 14:56 +08:00`

## Plan Reference

- Implementation plan: `../plans/cp018-cp020_implementation-plan_standalone-engine-foundation.md` (§ Proposed Changes — CP019)
- Revision plan, if applicable: `N/A`

## Changes Made

- Added `web-1.0.0` JSON Schema Draft 2020-12 under `config/web/`; preserved the v2 n8n schema unchanged.
- Added stable UUID fields for day blocks, activities, and guide spots; numeric `dayStart/dayEnd`; derived `durationDays` and locale-specific `scopeLabel`.
- Added an 89-field registry covering every schema leaf exactly once. It declares labels, controls, mode visibility, source/requiredness, render target or non-render reason, and uses the JSON Schema as the single limits source.
- Added locale catalogs/fixtures for Latin (`la`), French (`fr`), English (`en`), Indonesian (`id`), Japanese (`ja`), and Simplified Chinese (`zh-Hans`). Valid BCP 47 tags beyond these remain schema-valid; catalog capability is a separate CP020 concern.
- Added normalization, draft/publish validators, field/schema coverage check, safe locale canonicalization, stable-ID checks, day-range and mode-shape checks, and explicit AI-assisted field scope.
- Added diagnostics-based legacy conversion for canonical-root, n8n `canonicalItinerary` wrapper, and flat renderer shapes. Manual text/order/contacts are preserved; external photo URLs are not fetched, private metadata is excluded, and unmapped legacy values produce diagnostics.
- Generated TypeScript declarations from the JSON Schema with AST-normalized drift verification.
- Pinned Ajv `8.20.0`, `ajv-formats` `3.0.1`, TypeScript `5.8.3`, `tsx` `4.20.6`, and `json-schema-to-typescript` `15.0.4`; npm audit reports no vulnerabilities.
- Added 18 targeted tests, including four modes, six locales, unknown valid locale acceptance, 14-day condensation, many spots, Unicode text, legacy adapters, stable reorder/round-trip, and unsafe attribution URL rejection.

## Files and n8n Workflows Changed

| Artifact | Change |
|---|---|
| `config/web/itinerary.schema.json` | New versioned canonical web schema. |
| `config/web/field-registry.json` | Complete field-to-editor/render/source registry. |
| `config/web/locales/*.json` | Six complete localized label catalogs. |
| `src/contracts/types.ts` | Generated schema type aliases and language context metadata. |
| `src/contracts/itinerary.generated.d.ts` | Schema-generated TypeScript declaration. |
| `src/contracts/field-coverage.ts` | Schema/registry leaf coverage check. |
| `src/contracts/locale-catalogs.ts` | Locale capability catalog lookup. |
| `src/contracts/validator.ts` | Normalization and draft/publish structural validation. |
| `src/contracts/legacy-adapter.ts` | Deterministic legacy conversion and diagnostics. |
| `scripts/web/generate-types.mjs` | Generated declaration drift check/print utility. |
| `tests/fixtures/web/*` | Synthetic multilingual and migration fixtures. |
| `tests/web/*` | CP019 contract and adapter tests. |
| `package.json`, `package-lock.json`, `tsconfig.web.json` | Pinned validation/type tooling and scripts. |
| `SPEC.md` | Pointed web contract to new versioned schema. |
| n8n workflows and `config/itinerary-schema.json` | None changed. |

## Verification Performed

| Verification | Result | Evidence |
|---|---|---|
| Package validation | PASS | `npm run validate` → package validation passed. |
| Existing regression suite | PASS | `npm test` → 1 pass, 0 fail. |
| Schema-generated types in sync | PASS | `npm run check:web-types`. |
| TypeScript contracts/tests | PASS | `npm run typecheck:web-contracts`. |
| Web contract and migration tests | PASS | `npm run test:web-contracts` → 18 pass, 0 fail. |
| Dependency security audit | PASS | `npm audit --audit-level=moderate` → 0 vulnerabilities. |
| JSON/schema/locale field coverage | PASS | Targeted tests: 89 registry entries, no missing/extra/duplicate schema leaf; identical keys across six catalogs. |
| Workspace diff whitespace | PASS | `git diff --check`; only Git's LF-to-CRLF informational notices for existing text files. |

## Acceptance Criteria Results

| Criterion | Result | Evidence |
|---|---|---|
| R19-1 — nested/versioned schema, generated type sync, every field mapped | PASS | `check:web-types`; field coverage test. |
| R19-2 — draft incomplete vs publish structural validation, four-mode exclusivity, numeric multi-day coverage | PASS | Draft/publish, mode and 14-day contract tests. |
| R19-3 — stable IDs, order and manual text survive conversion/serialization | PASS | Legacy conversion and reorder/round-trip tests. |
| R19-4 — extensible locale tag schema and complete six catalogs | PASS | `es-MX` schema test; unresolved language publish failure; catalog key coverage. |
| R19-5 — diagnostics for lossy legacy fields and private metadata excluded | PASS | External photo/unknown field/wrapper conversion tests. |
| R19-6 — targeted typing/contracts pass and CP018 gate satisfied | PASS | Typecheck, 18 tests, and CP018 completion log present. |

## Deviations from Plan

- Used `json-schema-to-typescript` code generation with compiler-AST drift comparison because JSON-module imports widen literal types and made `json-schema-to-ts` unsuitable as a direct source type. Schema remains the single source of truth.
- Pinned Ajv `8.20.0` rather than the initially considered `8.17.1` after `npm audit` identified a moderate ReDoS advisory affecting versions below `8.18.0`; subsequent audit is clean.
- `scopeLabel` and `durationDays` are recalculated on cloned content during normalization, with warnings on stale duration values. Caller input remains unchanged.

## Known Limitations and Follow-Ups

- The field registry/catalogs are contract resources, not the visual editor; dynamic UI remains CP022.
- Live automatic language detection and AI writing remain CP023. CP019 accepts a valid locale outside the six fixture catalogs; CP020 must reject unsupported render capabilities before output.
- Full content-quality, monetary-content, travel-time and opening-hours policy checks remain CP024.
- Legacy external photos are intentionally not fetched/imported; diagnostics tell the guide to upload them through the workspace asset flow.
- Legacy adapters generate stable IDs when imported. Persist generated IDs on first save; do not re-run migration as a means of editing records.

## Planner Review: 2026-10-06 — Revision Required

- Current verdict: **REVISE**; at that time execution had not started.
- Malformed collection types can throw before schema validation; derived contact/themes/pace mapping is incomplete. Passing original tests did not exercise these findings.
- Evidence: `logs/cp018-cp020_planner-review_standalone-engine-foundation.md`.
- Revision plan: `plans/cp019_revision-plan_canonical-schema-and-field-registry.md`.
- This section is superseded by the executed revision results recorded below.

## Revision: 2026-10-06 - Malformed Input Diagnostics and Derived Field Sync

### Revision Plan

- `../plans/cp019_revision-plan_canonical-schema-and-field-registry.md`

### Changes Made

- `src/contracts/validator.ts`: normalization now requires a record brochure and array schedule before deriving; stable-ID collection skips non-record entries and non-array activities/spots. Malformed JSON reaches Ajv and returns structured diagnostics instead of throwing.
- Added derived synchronization on cloned input: `closing.agencyContact` ← `brochure.agencyContact`, `overview.quickFacts.pace` ← `brochure.paceLevel`, `overview.quickFacts.themes[]` ← `brochure.themes[]`, each with a `DERIVED_FIELD_UPDATED` warning when a stale non-empty value was replaced. Invalid derived types are left untouched so schema validation still reports them.
- `src/contracts/legacy-adapter.ts`: added `LEGACY_CONTACT_CONFLICT` and `LEGACY_THEME_CONFLICT` diagnostics when legacy closing/quick-fact values differ from their authoritative brochure counterparts; no legacy text is silently discarded.
- `config/web/field-registry.json`: unchanged after review — it already declared these manual/derived sources correctly, so no registry edit was needed.

### Verification Performed

| Verification | Result | Evidence |
|---|---|---|
| Type check | PASS | `npm run typecheck:web-contracts` → no errors. |
| Contract tests | PASS | `npm run test:web-contracts` → 22 pass, 0 fail (was 18; +4 revision tests). |
| Renderer regression | PASS | `npm run test:web-render` → 8 pass, 0 fail. |
| Planner probe regressions | PASS | `.runtime/planner-review.ts`: schedule/spots/activities/brochure/quickFacts malformed cases all `{"ok":false,"errors":N}` with no throw; derived sync case now `contact:true`, `themes:true`. |
| Schema-generated types | PASS | `npm run check:web-types` matches; schema itself unchanged. |
| Package validation and legacy tests | PASS | `npm run validate`; `npm test` → 1 pass. |
| Dependency audit | PASS | `npm audit --audit-level=moderate` → 0 vulnerabilities. |
| Diff whitespace | PASS | `git diff --check`; only Git LF-to-CRLF informational notices. |

### Acceptance Criteria Results

| Criterion | Result | Evidence |
|---|---|---|
| R19-1 revision — registry/schema coverage and manual-to-derived mapping | PASS | Existing coverage test + new authoritative/derived sync test. |
| R19-2 revision — malformed JSON returns structured draft/publish failure; valid incomplete drafts still pass | PASS | 10 malformed cases × both validators; existing incomplete-draft test unchanged and passing. |
| R19-3 regression — manual text/order/IDs survive; conflicts reported; caller unchanged | PASS | `assert.deepEqual(content, before)` in sync test; legacy conflict diagnostics test; reorder/round-trip tests still pass. |
| R19-4–R19-6 regression — extensible locale, catalogs, migration, type/test gates | PASS | Locale/catalog/legacy tests all passing; `check:web-types` clean. |
| Revision close | PASS | This dated section exists; TODOS CP019 restored to `completed`. |

### Remaining Limitations

- Derived sync only replaces values whose existing type is already valid; malformed derived types remain visible as schema errors by design.
- Renderer consumption of authoritative sources (fallback when called without normalization) belongs to the CP020 revision scope.
- Revision does not add content-quality, money or schedule policy checks; those remain CP024.

## Revision: 2026-11-10 - Guide-centric schema web-2.0.0 (R1)

### Revision Plan

`plans/cp019-cp025_revision-plan_guide-centric-schema-and-editor.md` (stage R1 and its amendment/round-1 sections). Review: `logs/cp019_review-log_r1-guide-centric-schema.md`.

### Changes Made

- Canonical schema rewritten as `web-2.0.0` (`trip`, `guide`, `meeting`, `pickup`, `cover`, `summary`, `days[]`, `places[]`, practical lists, `policies`, `closingNote`, `disclaimer`); generated types regenerated; registry v2 (73 fields: path, control, modes, `requiredOnPublish`); validator per mode (`validateDraft`, `validateForPublish`, span caps 360/720/960 minutes); `upgradeV1ToV2` for existing drafts; label catalogs for the six locales; `createBlankDraft` v2.
- Commits: `9e14312` (R1), review `a97ca9f`, round-1 fixes `ee2462c`, `65ff9df`, `ee10278`, `e260e92`.
- R5 consumes the registry: `src/editor/schema-meta.ts` reads labels' keys, modes, required flags and the schema limits; `coverage.ts` (hand-written path list) was deleted in favour of a registry-driven DOM coverage test.

### Verification Performed

Run on 2026-11-10 (full output in `logs/cp019-cp025_stage-log_r6-regression.md`): `npm run check:web-types` (declaration matches the schema), `typecheck:web-contracts` and `typecheck:web-contracts-v2` (0 errors), `test:web-contracts` 42/42, `test:web-editor` test 1 (every applicable registry path renders in each mode, no non-applicable path renders).

### Acceptance Criteria Results

Plan criteria 1 (schema, registry and types agree; DOM coverage per mode): PASS. 4 (new fields stored and validated): PASS. 5 (guide places need name, area, description): PASS (validator and editor required markers). 6 (v1 drafts upgrade with warnings): covered by the `upgradeV1ToV2` tests; real-data migration is CP021. Joint R1+R2 review: pending.

### Remaining Limitations

- `config/web/itinerary.schema.json` has no `maxItems` on `places` although the R1 amendment requires 60 (finding R1-S1). The editor enforces 60 with a constant; the schema should get the limit in an R1 follow-up.
- CP status in `TODOS.md` is not changed by this section; the reviewer decides after the joint review.
