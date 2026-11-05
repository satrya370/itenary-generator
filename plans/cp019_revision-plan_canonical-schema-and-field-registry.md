# CP019 Revision Plan: Canonical Schema and Field Registry

## Reason for Revision

Planner verdict chapter CP018–CP020: **REVISE**. Existing 18 contract tests pass, but they miss malformed JSON shapes and divergent derived display fields. CP019 acceptance R19-1/R19-2 is not fully satisfied.

Confirmed on 2026-10-06 with `npx tsx .runtime/planner-review.ts`:

- `validateDraft` throws rather than returning diagnostics for `schedule: {}`, `spots: {}` and `schedule[0].activities: {}`. `normalizeCanonicalContent` and `collectStableIds` traverse unvalidated arrays (`src/contracts/validator.ts:47–82,87–98`). `validateForPublish` calls the same path.
- A publish-valid document can have `brochure.agencyContact = UNIQUE_BROCHURE_CONTACT`, `closing.agencyContact = ''`, `brochure.themes = ['UNIQUE_BROCHURE_THEME']`, and empty `overview.quickFacts.themes`. Normalization leaves the derived copies stale; CP020 renders the empty copies and loses user data.
- Registry declares `closing.agencyContact` and quick-fact pace/themes as derived but currently does not establish one consistent derivation for those fields. Schema-leaf coverage alone does not prove render behavior.

## Clarifications and Decisions

- Structured Ask Question offered revision of CP019/CP020 including functional findings and visual/evidence gaps. User answered **“buat revision plannya”**. This authorizes revision planning; implementation has not started.
- Keep original CP IDs, schema version unless a genuinely incompatible change is required, and the original completion evidence. Revise CP019 first, then CP020. Only one CP may be in progress.
- `brochure.agencyContact`, `brochure.paceLevel`, and `brochure.themes` are authoritative manual inputs according to the registry; their closing/quick-fact copies are derived. Canonicalization may update derived values on a clone, but must preserve manual text/order/IDs and report stale conflicting values.
- Reject malformed input with structured diagnostics, not implicit coercion to empty arrays or a catch-all success. Schema remains extensible for locale tags; unsupported render capability is CP020.

## Existing Behavior

- Normalization runs before Ajv validation; truthy non-array collections reach `.map`/`.forEach`.
- Duration and scope are derived, while contact, pace and themes copies may diverge.
- Original contract tests pass (18/18); TypeScript check passes. No existing test exercises these confirmed failures.

## Required Behavior

- Both draft and publish validators return `ok: false` and actionable canonical field diagnostics for malformed JSON types, without exceptions or input mutation.
- Wrong types must still fail schema validation even when deriving presentation fields; normalization must not erase an invalid input and make it valid.
- Derived contact/themes/pace match their authoritative brochure sources after normalization, including legitimate empty draft values. Required contact continues to fail publish when missing/blank.
- Registry, adapter conversion behavior, normalized content and future renderer consumption agree on these field sources.

## Proposed Changes

1. Inspect `validator.ts`, schema, registry and adapter before changing completed artifacts. Mark CP019 `in_progress` only when revision execution begins.
2. Add the smallest shape-safe traversal/schema ordering changes so derivation and ID collection never assume an unvalidated array/object. Preserve existing incomplete-draft behavior and diagnostics; do not create a second schema.
3. Derive closing contact and quick-fact themes/pace from valid authoritative brochure fields on cloned input. Use explicit diagnostics when stale derived values conflict; do not replace malformed source types with defaults.
4. Keep registry metadata consistent with chosen derivations; audit other declared derived/rendered fields for the same issue. Do not introduce unrelated policy validation or editor scope.
5. Check adapter contact/theme/pace conversion against existing preservation promises. Do not silently discard distinct legacy text; report any lossy conflict and retain original source for review.
6. Add targeted tests for both `validateDraft` and `validateForPublish`: object/string/number/null collection shapes, null/non-object entries, malformed nested activities, malformed brochure/overview/quickFacts, wrong locale type, conflicting derived values, and non-mutation. Each test must verify rejection/derivation, not merely absence of a throw.
7. Review against SPEC and this plan, run verification, revise until clean. Append factual revision evidence to the existing CP019 log before restoring `completed`.

Affected files: `src/contracts/validator.ts`, `config/web/field-registry.json` if necessary, `src/contracts/legacy-adapter.ts` if preservation needs adjustment, `tests/web/contracts.test.ts`, `tests/web/fixtures.ts` or targeted fixtures, `TODOS.md`, and the existing CP019 log. Regenerate schema-derived types only if schema actually changes.

## Impact and Regression Risk

- Normalization changes can accidentally hide invalid types or override manual values. Test malformed input before/after normalization and verify caller equality.
- Display copies may have been carrying distinct legacy text; report conflicts rather than silently claiming lossless conversion.
- Preserve unknown-but-valid locale acceptance, numeric day coverage, stable IDs, Unicode limits and existing migration cases.
- CP020 re-verification depends on this revision; CP021 remains gated until chapter re-review accepts both revisions.

## Verification Plan

- Reproduce the three currently throwing cases before the fix and show structured rejection afterward through both public validators.
- Demonstrate a publish-valid canonical document with authoritative contact/themes and empty/stale derived copies normalizes consistently without mutating input.
- Run `npm run check:web-types`, `npm run typecheck:web-contracts`, `npm run test:web-contracts`, `npm run test:web-render`, `npm run validate`, `npm test`, and `git diff --check`.
- Record commands, counts and exact regression evidence in the existing CP019 log. CP020 browser/PDF matrix runs after its own changes, using this corrected contract.

## Updated Acceptance Criteria

| Criterion | Required evidence |
|---|---|
| R19-1 revision | Schema/registry/type coverage and authoritative-to-derived mapping tests pass; no manual field silently disappears. |
| R19-2 revision | Every malformed JSON case returns structured draft/publish failure; incomplete valid drafts remain supported. |
| R19-3 regression | Manual text/order/IDs survive normalization and adapters; conflict diagnostics are explicit; caller is unchanged. |
| R19-4–R19-6 regression | Extensible locale, catalog key coverage, migration and type/test gates remain passing. |
| Revision close | Existing log has a dated executed-revision section; TODOS matches it; planner receives evidence, not only a passing test count. |

## Rollback

Revert only intended CP019 revision changes after inspecting the diff; preserve pre-existing user work and original logs. If any finding remains, keep CP019 blocked/in progress and CP020 revision gated. Do not advance CP021 or label chapter accepted.
