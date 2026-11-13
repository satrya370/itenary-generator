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
