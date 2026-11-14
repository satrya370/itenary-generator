# CP031 Completion Log: Split Import Model

## Result
- Status: completed for the 2026-11-13 model-routing revision only. Historical implementation evidence remains in the existing CP031 stage/review logs; it was not re-executed in full.

## Date
- 2026-11-13

## Plan Reference
- `../plans/cp031_revision-plan_split-import-model.md`

## Changes Made
- Writing model reads OPENROUTER_MODEL; extraction reads OPENROUTER_IMPORT_MODEL, falling back to writing.
- Server loads private local environment before importing provider-dependent modules.
- Local private configuration uses anthropic/claude-haiku-5.5 for parsing and openai/gpt-oss-120b for writing, sharing the owner-provided credential. No credential value is recorded here.
- Added isolated model-routing regression tests and a five-case opt-in live text harness.

## Files and n8n Workflows Changed
- `src/server/ai/provider.ts`, `src/server/main.ts`, `.env.web.example`, private ignored `.env.web`.
- `tests/web/ai-model-routing.test.ts`, `scripts/web/verify-import-five-live.ts`, revision plan, this log, and TODOS revision note. No n8n changes.

## Verification Performed
- Reviewed routing, environment-load order, compatibility fallbacks, and private-data cleanup before tests.
- Node 24: `node --import tsx --test tests/web/ai*.test.ts tests/web/import-apply.test.ts`: 56 passed, 0 failed.
- Opt-in live harness: five actual OpenRouter extraction requests, each HTTP 200 using anthropic/claude-haiku-5.5. Each import API returned 201, summary matched source verbatim, deterministic facts passed checks, and drafts were read back from storage.
- Formats: Indonesian CRLF full-day; messy English half-day with emoji and 12-hour clock; WhatsApp-style two-day; destination guide with place bullets; activity with highlights and ordered steps.
- Total usage: 2,660 prompt tokens and 3,125 completion tokens; recorded cost US$0.0018285. One extraction call per case, no retry.
- `output/hybrid-text-five-live.json` contains detailed evidence, inputs are in the harness. Runtime test database was removed by the harness.
- `git check-ignore .env.web` confirmed ignore; `git diff --check` passed (line-ending warnings only).

## Acceptance Criteria Results
- Separate model routing: PASS (mock regression requests plus actual import request model capture).
- Five live hybrid text imports: PASS (5/5).
- Credential outside tracked source: PASS.
- Default model compatibility: PASS.

## Deviations from Plan
- Existing repository has CP031 stage/review logs but no original completion log. This completion record is narrowly for the verified revision, not a reconstructed historical completion claim.

## Known Limitations and Follow-Ups
- Writing model authentication and catalog listing passed preflight; paid writing generation was not requested or executed. Its routing was checked with a simulated request.
- Some provider replies included keys inapplicable to the chosen mode or already-filled highlights; merge guards skipped them correctly. No extra repair calls were needed.
- Missing source descriptions stay empty and appear as required fields in the report. Full-day, half-day, multi-day and destination guide need manual completion before publication. Activity had no missing required fields.
- Earlier CRLF direct-parser failures and missing PDF test fixtures are unchanged and outside this revision. Browser UI and publishing were not tested.

## Revision: 2026-11-13 - Evidence Guards and Safe Merge

### Revision Plan
- `../plans/cp031_revision-plan-evidence-guards-and-safe-merge.md`

### Changes Made
- Completion validation now checks source-authored complete line/contiguous-line units, not generated section markers or global substrings. Sentence-level values must equal their complete quote, preserving negation and qualifiers; private reports retain accepted source line references and rejected reason codes.
- Activity details require an allowed stable source target ID and a complete quote from the contiguous unconsumed context immediately following that activity. Merge applies details only to that ID, never by matching title globally.
- AI input now packs source units into up to eight ordered batches, skips only individually oversized lines, and records omitted line indexes/batch status. Each batch is limited to two attempts with a shared 180-second operation deadline.
- Token/cost usage becomes unknown if any attempt may have been billed without returning usage metadata; retries are counted separately and no failure is treated as free.
- Overwrite retains existing day/list collections when parser diagnostics or unresolved/omitted input indicate incomplete coverage. It does not auto-mix schedules. Report metadata is additive in the existing private operation JSON; no schema migration.
- Added deterministic regressions for marker/negation, explicit and wrong activity targets, partial overwrite preservation, later lines after overflow, oversized-line isolation, retries/unknown usage, replay and existing undo behavior.
- Reviewing found and corrected a quote-boundary weakness: partial source-line quotes for entity fields are now rejected too; values may still be a part of an exact source unit where the schema allows it.

### Verification Performed
| Verification | Result | Evidence |
|---|---|---|
| `test:web-import` | PASS | 73 tests passed, 0 failed (includes 31 import-apply cases). Deterministic provider doubles only. |
| `test:web-ai` | PASS | 30 tests passed, 0 failed; includes model routing regression. |
| `test:web-publication` | PASS | 12 tests passed, 0 failed. |
| `typecheck:web-server` | PASS | 0 errors in server/contracts/API scope. |
| `check:web-types` | PASS | Generated declarations match canonical schema. |
| `git diff --check` | PASS | No whitespace errors; line-ending normalization warnings only. |
| Paid/live provider calls in this revision | NONE | All CP031 revision tests use injected deterministic doubles; no opt-in live harness was run. |
| Migration/dependency/commit/push/deploy | NONE | No schema or dependency change; no release actions. |

### Acceptance Criteria Results
| Criterion | Result | Evidence |
|---|---|---|
| Engine hints cannot be accepted as evidence; whole-source sentence quote preserves negation | PASS | Adversarial marker/negation test plus exact source-unit matching. |
| Activity attribution requires validated target and target-local quote | PASS | Correct-target and cross-activity quote regression tests. |
| Later short lines survive an earlier oversized line; bounded batching/retry accounting | PASS | Multi-batch, oversized-line isolation, retry/unknown-usage tests; caps are enforced in code. |
| Incomplete overwrite collections are retained rather than replaced/mixed | PASS | Partial overwrite regression verifies existing schedule preservation and report flag. |
| Replay/undo and external contracts remain compatible | PASS | Import suite replay/undo tests, AI suite, publication suite, typecheck and canonical schema checks. |
| No live paid calls or migration | PASS | Verification commands were test/typecheck-only; no migration command executed. |

### Deviations and Limitations
- Evidence validation intentionally favors precision over recall: quotes crossing uncertain or non-contiguous source lines are rejected for manual review. UI resolution remains CP032.
- The owner-authorized dependency-gate exception remains an exception; CP033–CP036 acceptance is not claimed. No other checkpoint status was changed.

## Revision: 2026-11-13 - Review Corrections: Entity Context, Qualifiers and Overflow

### Revision Plan
- `../plans/cp031_revision-plan_entity-context-and-collection-overflow.md`; shared conservative decision recorded by structured question before implementation. CP030 correction was completed/logged first.

### Changes Made
- Corrects the preceding completion's overstatement: a complete visual line was insufficient to prove sentence completeness, place fields still validated globally, and post-merge clipping could destroy an existing collection.
- Place area/description must quote the same explicit name unit or its bounded, adjacent bullet-entity context. New bullets/sections/gaps close that context; duplicated name units are not guessed. Wrong-entity evidence receives a structured rejection.
- Sentence evidence requires provable terminal boundaries; an unfinished adjacent sentence or qualifier/exception continuation prevents a shortened claim from being accepted. The complete multiline sentence/exception can pass. This is conservative rule validation, not a claim of universal semantic understanding.
- Collection replacement now preflights day/activity counts and text limits, practical lists, contacts, place limits and activity highlights/steps before fitting. Overwrite retains the entire old collection with a structured overflow/incomplete reason; safe in-limit collections still replace normally.
- Layout ambiguity/stale PDF sources propagate into omitted evidence and overwrite collection protection. Legacy sidecars are reconstructed in memory against stored normalized source; incompatible historic text/order is review-only rather than exposed with invented offsets.
- Added end-to-end wrong-place/local-place, split qualifier/full qualifier, 30-vs-31 activity, 50-vs-51 item and overlong-item regressions. PDF API apply test verifies ambiguous page text is neither sent to AI nor persisted as schedule facts.
- Oversized-block regression now places the later valid summary in a separate paragraph: an unfinished source line cannot be silently separated from its continuation merely because it exceeded a batch cap.
- Import pretest regenerates ignored PDF fixtures in PDF-only mode for reproducible test execution, without rewriting tracked text fixtures.

### Verification Performed
| Verification | Result |
|---|---|
| `npm run test:web-import` (Node 24; includes fixture pretest) | PASS: 81/81 |
| `npm run test:web-ai` | PASS: 30/30, including model routing |
| `npm run test:web-api` | PASS: 13/13 |
| `npm run test:web-publication` | PASS: 12/12 |
| `npm run typecheck:web-server` | PASS: 0 errors |
| `npm run check:web-types` | PASS |
| `git diff --check` | PASS, line-ending normalization warnings only |
| `.env.web` ignore check / tracked text fixture diff | PASS: private environment ignored; no tracked text fixture changes |

### Acceptance Criteria Results
- All five reviewed reproductions are addressed with regressions across CP030/CP031. Wrong-place evidence and shortened exception fail before persistence; the complete local/qualified source passes.
- Overflow preserves original IDs/content for the whole overwrite schedule/list; exact canonical boundary counts still replace safely.
- Blank-page PDF spans slice exact stored source; independent time-led columns are unresolved rather than joined. Old incompatible layouts cannot supply stale evidence.
- Model routing, replay, undo, type/schema/API and publication regressions pass. CP032 and all other checkpoint statuses remain untouched.

### Remaining Limitations
- Unsupported PDF layouts and uncertain entity/sentence relationships deliberately require review; this closes the five reviewed findings, not every requirement of the broader CP030–CP032 hardening plan. No OCR or CP032 UI work.
- No live/paid AI, migration, dependency install or deployment. Owner authorized commit and push to main only after successful gates. Dependency exception remains recorded, not resolved acceptance.

## Revision: 2026-11-14 - Private Conflict Review Prerequisite

### Revision Plan
- `../plans/cp031_revision-plan_private-review-resolution.md`. Owner authorized this serial prerequisite for CP032 and mock-only verification.

### Changes Made
- Parser preserves the source line for every occurrence of a conflicting scalar; private report version 1 stores conflict IDs, target paths, source-line references and a source-text hash. AI rejections and omissions without safe targets are counted as unsupported, not presented as selectable facts.
- Added workspace-scoped resolve API for recognized scalar conflicts: selection re-parses the retained source and validates the candidate, source hash, target and canonical draft; manual editing is marked manual; ignore makes no claim of source provenance. An expected-revision check and draft/report transaction guard against stale writes. Removed or changed source fails closed.
- Existing reports without this additive metadata remain readable. No evidence is inserted into canonical published content, and no migration or paid provider call was performed.

### Verification Performed
- `test:web-import`: 86 passed before the final added workspace-isolation case; focused `import-apply` after that case: 40 passed. Parser tests: 21 passed.
- `test:web-api`: 13 passed; `test:web-ai`: 30 passed; `test:web-publication`: 12 passed; server typecheck and canonical type check passed.
- Injected doubles only. Tests cover select/edit/ignore, forged request fields, stale revision, source changed/removed, unknown operation and workspace isolation.

### Acceptance Criteria Results
- PASS for deterministically parsed scalar conflicts: candidate IDs, line references and source hashes are checked again on the server; transactional CAS prevents stale edits; manual decisions are distinct.
- PASS for legacy report compatibility and existing model-routing/replay/undo regression suites. Unsupported/omitted data remains review-only instead of being promoted to a selectable candidate.

### Remaining Limitations
- Selectable candidates are currently limited to recognized scalar conflicts. Rejected AI proposals and layout omissions remain non-actionable diagnostics; source deletion makes resolution unavailable. CP032 UI and browser verification are not part of this backend prerequisite.
- No deploy, live provider call, migration, push or commit during this revision. CP032 and other checkpoint statuses were preserved; dependency exception remains an exception.

## Revision: 2026-11-14 - Mode Applicability in Import Merge

### Revision Plan
- `../plans/cp031_revision-plan_mode-applicability.md`, explicitly approved as a CP032 prerequisite after a browser regression.

### Changes Made
- Destination-guide imports no longer apply meeting place/time/maps URL or trip start date, which the canonical registry excludes from that mode. Every present excluded fact receives a private report note; applicable modes retain their prior behavior.
- Mode-inapplicable date/meeting conflicts are marked unsupported rather than presented as actionable choices. The browser maps remaining candidates by their source IDs, not by filtered list position.

### Verification Performed
- `test:web-import`: 88/88 passed, including new/overwrite inapplicable-field regression and prior applicable-mode tests.
- `verify:web-import`: PASS with actual text-layer full-day PDF imported in destination-guide mode; excluded facts displayed as notes. Five text/PDF modes, scan, stale review, undo and public privacy also passed with a deterministic extractor.
- Server/app typechecks and schema check passed; no live provider, migration or deploy.

### Acceptance Criteria Results
- PASS for the observed cross-mode meeting/date failures and preservation/reporting of applicable facts. Broader non-scalar review coverage is not claimed here.

### Remaining Limitations
- Unsupported AI/layout material remains manual review, not a selectable verified candidate. Dependency exception remains recorded, not dependency acceptance.

## Review correction: prerequisite acceptance remains open

The preceding revision sections describe narrower passing tests, not acceptance of the full CP030–CP032 hardening plan. The earlier restoration of CP031 to completed was premature and is superseded: CP031 remains in progress. In particular, completed-operation replay currently returns the current draft without checking the complete request fingerprint or recovering the original result revision, and rejected AI/layout material is not preserved as the reviewable candidate/evidence model required by the plan. The import draft write and operation completion also require further atomicity/recovery review. No claim is made that the broader acceptance, privacy/retention matrix, corpus or mutation gates have passed.

The subsequent review added an in-transaction check that the operation and report have not changed while source evidence was being read, and guarded local language/writing edits during a review response. On Windows, `test:web-import` passed 88, `test:web-editor` 34, `test:web-store` 12, `test:web-preview` 12, app/server/contracts typechecks passed, and the rebuilt `verify:web-import` passed using the deterministic provider double (zero external requests and console errors). These do not replace dedicated concurrency tests or the missing acceptance gates. No paid provider call, push or commit was made.

Subsequent work binds new operation IDs to request parameters and stored source hash, retains the original result for replay, and writes the draft and completed operation together. A simulated operation-completion failure rolls the draft write back. Legacy operations without replay metadata fail closed rather than claiming the current draft is the original result. On Windows, `test:web-import` passed 89, API 13, AI 30, publication 12, and mock browser E2E passed. This supersedes the replay observation above for newly created operations only; broader candidate/evidence, concurrency and verification acceptance remains open. Undo transaction changes require their own regression rerun.

Further work makes undo's ledger and draft write transactional; an injected ledger failure confirms rollback. Selected AI guard rejections now retain bounded, explicitly unverified proposals for manual review; they are not resolvable source-backed candidates. Source retention strips their value/quote and removes legacy accepted-evidence quotes, including from replay reports. A combined focused editor/import/retention run passed 79 tests and mock E2E passed including reopening a resolved review and displaying a rejected proposal. Windows `build:web-release` and `validate:web-release` passed; this is not Linux, live-provider, golden-corpus or full candidate-model verification. CP031 and CP032 remain in progress.

## Revision: 2026-11-14 - Replay, Evidence Retention, and Review Prerequisite Gate

### Revision Plan
- `../plans/cp031_revision-plan_private-review-resolution.md` and `../plans/cp031_revision-plan_mode-applicability.md`.

### Changes Made
- Bound operation IDs to a request/source-hash fingerprint; matching replay returns the original immutable record/report, mismatches fail closed. Draft+operation completion and undo+ledger updates are transactional.
- Text source tampering is detected before provider dispatch. Retention strips legacy accepted quotes and new rejected-proposal text from reports/replay snapshots.
- Bounded model guard rejections are visible as expressly unverified private diagnostics; they are not source-backed selectable candidates. Scalar conflicts support revision-safe select/edit/ignore. Mode-inapplicable destination-guide meeting/date facts are reported and excluded.

### Verification Performed
- Windows Node 24: `test:web-import` 91/91; `test:web-api` 13/13; `test:web-ai` 30/30; `test:web-publication` 12/12; focused undo/retention/editor tests passed.
- Server, app and contracts typechecks; generated schema drift check; standalone release build and validation passed.
- Deterministic browser E2E passed with 0 external requests and 0 console errors. Screenshots at 390px/1280px inspected. No paid/live provider request.

### Acceptance Criteria Results
- PASS for the active private-resolution prerequisite: bounded source conflicts, explicit non-actionable rejected-AI diagnostics, source hash/target revalidation, workspace isolation, stale CAS, legacy report handling, privacy, retention, replay, transaction, undo and mode applicability.
- Scope boundary: this does not claim the full shared CP030–CP032 corpus campaign (40 labeled text cases, 12 labeled PDF layout cases, mutation campaign) or Linux verification. No universal parser accuracy claim is made.

### Remaining Limitations
- Full cross-platform and corpus/mutation acceptance remains follow-up to the broader shared hardening plan; no live AI call was authorized. Dependency exception for preceding CPs remains recorded.

### Follow-up verification: corpus and mutation gates (2026-11-14)
- Added and ran 40 independently asserted date/conflict/time/unresolved-span text cases and 12 generated PDF layout intake/dry-run cases; all passed (`test:web-import` 133/133 total).
- Added `verify:web-import-mutations`; all five planned safety mutants were killed: sentence qualifier/span guard, activity-source target context, day boundary, partial schedule overwrite, and replay fingerprint.
- Linux gate remains unavailable: `wsl.exe --status` reported WSL is not installed. No dependency/environment installation was authorized. No live provider call.
- This closes the recorded corpus/mutation gap for the active CP031/CP032 revision; does not claim cross-platform verification or universal parser accuracy.
