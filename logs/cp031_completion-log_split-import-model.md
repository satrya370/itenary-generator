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

## Revision: 2026-11-20 - Usage Checkpointing, Retention Redaction, and Last-Success API

### Revision Plan
- `../plans/cp030-cp032-cp035_revision-plan_review-findings-gpt-luna.md`, owner-authorized phase 3.

### Changes Made
- Usage is reserved as unknown before each provider dispatch, then durably accumulated immediately after each response, including retries/batches. CAS/finalization failures preserve known totals. If post-dispatch usage persistence fails, the operation becomes `uncertain` with unknown values and cannot replay. Outer failure handling no longer overwrites an uncertain state.
- Retention marks current/replay reports source-expired and redacts unknown label values/names, rejected proposal text, evidence quotes, dynamic activity-title paths and all unstructured source-derived prose notes. Safe path/reason/status/accounting data and canonical/replay draft contents remain. Newly generated repeated-margin diagnostics no longer inline copied text. UI displays expiry and disables source-based actions.
- Latest import API still returns the most recent attempt and now additionally returns the newest completed, non-undone `lastSuccessfulOperation`; failed attempts expose `errorCode`, empty failed report is null, ties sort deterministically, and undone results are not offered as successful/actionable.

### Verification Performed
- `test:web-import`: 192/192; includes stale CAS usage preservation, multi-batch totals, null usage, injected checkpoint failure→uncertain/no replay, finalization rollback, retention current/replay redaction, and latest-success after failed/undone attempts.
- `test:web-api`: 13/13; `test:web-ai`: 30/30; `test:web-store`: 12/12; `test:web-publication`: 12/12; editor 34/34; typechecks/schema/build gates pass.
- No live/paid provider calls; all import accounting tests use deterministic doubles.

### Acceptance Criteria Results
- PASS for CP031 F02, F03 and F07 backend. F07 editor consumption remains CP032 phase 5, not claimed complete.

### Remaining Limitations
- CP032 editor still needs to present the last successful report alongside latest failed-attempt state. Linux unavailable; no live provider or push.

## Revision: 2026-11-20 - Durable Import Usage, Retention Redaction, and Report Recovery

### Revision Plan
- `../plans/cp030-cp032-cp035_revision-plan_review-findings-gpt-luna.md` (owner-authorized phase 3; phase 1 reproduced the findings first).

### Changes Made
- Every provider attempt is checkpointed before dispatch as in-flight/unknown, then its returned usage is checkpointed immediately before response parsing/retry. This preserves cumulative batch usage across final draft CAS/validation/transaction failures. If the post-call usage write fails, the row is marked `uncertain`, `ai_used=1`, usage stays null, and replay is refused; pre-dispatch checkpoint failure does not dispatch the provider.
- Retention redacts source-derived text from current/replay reports: unknown labels/values, rejected proposals, accepted evidence quotes, dynamic activity-title paths and parser/layout note prose. Reports are marked `sourceExpired`; UI clearly displays this state and suppresses source-based review actions. Canonical draft and replay draft snapshots are preserved.
- New repeated-margin PDF diagnostics no longer inline source text.
- The operations API keeps `operation` as the latest attempt and adds `lastSuccessfulOperation` (completed/non-undone, deterministic tie-break) so a failed newer overwrite does not erase access to the last successful report. Undone report is not exposed as actionable success.

### Verification Performed
| Verification | Result | Evidence |
|---|---|---|
| Phase 1 reproduction | PASS | F02 stale CAS/F07 report behavior reused isolated mocks; F03 unique markers verified in SQLite. |
| Usage tests | PASS | Failed CAS keeps known token/cost; multi-batch cumulative totals; unknown retry usage remains null; injected post-provider checkpoint failure leaves `uncertain` and prevents replay; final completion failure retains checkpoint. |
| Retention and source-expiry tests | PASS | Current and replay report secret markers removed; notes and dynamic labels redacted; safe references/status/sourceExpired retained; editor report renders explicit expired notice. |
| Last-success API tests | PASS | Successful import then missing-source overwrite returns failed latest attempt plus prior success; undone result omitted as actionable `lastSuccessfulOperation`. |
| `test:web-import` | PASS | 192/192 tests. |
| API/AI/store/preview/publication/contracts/editor/render/places suites | PASS | 13/13, 30/30, 12/12, 12/12, 12/12, 52/52, 34/34, 15/15, 16/16. |
| Types/schema/build/release | PASS | Server/app/contracts typechecks, `check:web-types`, `build:web-release`, `validate:web-release` valid. |

### Acceptance Criteria Results
- PASS for CP031 phase 3 F02/F03 and backend portion of F07. Import failures do not lose recorded usage after a provider response; uncertain checkpoint persistence fails closed. Report/source copies are retention-redacted, and a previous successful report remains retrievable separately from a newer failed attempt.
- F07 frontend consumption is deliberately deferred to CP032 phase 5. This log does not claim the full seven-finding plan is complete.

### Remaining Limitations
- No live/paid AI call, push or deployment. Linux was not available/verified.
- CP032 still needs to guard late A→B responses, avoid false conflicts from normalized transient inputs, and display the new last-success/latest-failure API shape. CP035's broader original follow-ups remain open.

### Grouped-plan follow-up (2026-11-20)
- The CP031-phase limitation above records the state at the end of phase 3. The owner subsequently authorized CP032 phase 5; those UI items are now closed and verified in `../logs/cp032_completion-log_import-review-hardening.md` and the grouped review log. CP031 phase 3 status remains complete.

## Fase 3 — Review/Test addendum (2026-11-20)
- Re-reviewed final attempt lifecycle: usage is checkpointed before every provider call and after every response, including retries, before parsing or further provider dispatch. Final record update is in the draft/result transaction; previously committed usage survives rollback. A failed post-response checkpoint writes `uncertain` using a fallback update and outer error handling cannot overwrite it as `failed`.
- Retention passes current and replay reports, strips raw labels/values, proposal content, evidence quotes, dynamic activity-title paths and free-text notes; sets source-expired metadata on both copies. Editor displays clear expiry state and does not offer source-based decisions; canonical and replay itinerary content is retained by design.
- Last-import API adds `lastSuccessfulOperation`; latest attempt remains separately visible via `operation` and exposes error code; undone result is not returned as actionable success. CP032 editor integration is not included in this CP031 phase.
- Verified: import 192/192; API 13/13; AI 30/30; store 12/12; preview 12/12; publication 12/12; contracts 52/52; editor 34/34; render 15/15; places 16/16. App/server/contracts/schema typechecks pass. Release validates. Deterministic browser checks pass; no paid AI.
- Disposition: CP031 phase 3 scope complete. CP032 F05/F06 and F07 editor display remain open for phase 5; no claim the entire grouped revision is complete.

## Revision: 2026-11-23 - Hybrid Semantic Assignment and Coverage

### Revision Plan
- `../plans/cp031_revision-plan_hybrid-semantic-assignment-and-coverage.md`.

### Changes Made
- AI extraction now receives private source units with stable unit IDs, exact text, section, allowed paths, activity owner/day and structural-boundary metadata. The model is asked to return every supporting `sourceUnitIds` array; server validation independently checks scope, unique source match, complete quote, allowed path, exact activity target and one-to-one assignment.
- Global summary, closing note and policy completions require a matching explicit source section. Local unheaded prose is not promoted to a global claim; it stays pending for review.
- Same-line CP030 inline details bind only to their owning activity. Adjacent multi-line details may bind only in a contiguous schedule block ending at the next event. Blank-separated text and unowned end-of-trip prose remain unresolved. A structurally bounded complete unit may omit terminal punctuation without relaxing qualifier/negation checks.
- Import reports now distinguish provider batch status from mapping status and include final post-merge source-unit coverage/dispositions, pending unit references, requested model, and provider-reported model/generation IDs. Source text/quotes are not placed in the new ledger fields.
- Overwrite day/places protection now keys off owned unresolved source units and accepted mapping rather than treating every pre-AI unconsumed line as unresolved. Existing guards for structural day issues, omitted/layout-ambiguous units, overflow, transaction, revision, replay, usage, retention and undo remain.
- OpenRouter extraction requests now request JSON Schema structured output; AJV and the evidence/ownership guards remain authoritative. Added import-specific model preflight endpoint and import model ID in capabilities.
- CP032 remains separate. Owner's three-example format guidance and recommended collapsible placement under the text/PDF controls are recorded in the plan/TODO; no UI code was changed.

### Verification Performed
| Verification | Result | Evidence |
|---|---|---|
| H01–H07/focused extraction regressions | PASS | Mock tests verify local→global rejection, duplicate quote ID anchoring, no double assignment, ignored-unit coverage, same-line activity owner, no-period structural boundary, blank-line ambiguity, resolved overwrite, model-specific preflight and actual response identity. |
| `test:web-import` | PASS | 204 tests, 0 failures; includes PDF/text intake and apply regressions. |
| `test:web-ai` | PASS | 32 tests, 0 failures. |
| `test:web-store` | PASS | 12 tests, 0 failures. |
| `test:web-api` | PASS | 13 tests, 0 failures. |
| `test:web-publication` | PASS | 12 tests, 0 failures. |
| `typecheck:web-server` | PASS | 0 errors in server/contracts/API scope. |
| `check:web-types` | PASS | Generated declarations match canonical schema. |
| Correctly guarded live Haiku 5.5 smoke | PASS, text only | One extraction dispatch after import-specific preflight authenticated/listed `anthropic/claude-haiku-5.5`; JSON schema valid; filter/merge accepted Keraton description and tip to the same target; unheaded global sentence stayed unresolved. 1,929 prompt + 705 completion tokens; US$0.0005454. No retry. |

### Acceptance Criteria Results
| Criterion | Result | Evidence |
|---|---|---|
| H01: local quote cannot silently populate a global field | PASS | Unheaded local instruction remains pending; heading-authorized globals continue to pass. |
| H02: ignored source units remain reviewable | PASS | Empty valid completion returns provider batch complete but mapping unmapped and all unused units in `review.pendingUnits`. |
| H03: full structural unit can omit punctuation without truncating qualifiers | PASS | No-period activity detail is accepted only when bounded by the next event; existing wrapped-exception regression passes. |
| H05: complete overwrite can replace safely; partial text preserves old collection | PASS | Fully resolved two-day overwrite replaces the old schedule; existing partial-overwrite test preserves it. |
| H06: source line and activity ownership are enforced | PASS | Same-line suffix targets exact activity; blank-separated prose gets no target; duplicate title, source IDs and double assignment are guarded. |
| H07: import model health/provenance is distinct from writing AI | PASS | Import-specific preflight resolves/authenticates Haiku separately; response model/generation identity is recorded. |
| Existing persistence, privacy, usage/retry/replay/undo and API gates remain green | PASS | Full import/AI/store/API/publication suites and type/schema gates above. |

### Remaining Limitations and Live-Test Accounting
- Initial bounded text and PDF live smoke attempts using the pre-structured-output request failed schema validation after two attempts each; no AI values were applied and all source units stayed pending. Their costs were US$0.0009806 and US$0.0011951.
- A later authorized smoke harness accidentally statically imported the provider before loading `.env.web`, so one dispatch used the writing model `openai/gpt-6-luna` instead of Haiku. It applied local details correctly in isolated temporary storage; cost US$0.0002445. This is not counted as Haiku verification. The harness-order mistake and result are disclosed.
- After loading environment before dynamic provider import and adding JSON Schema response format, one correctly preflight-guarded Haiku 5.5 text dispatch passed. Total observed smoke cost, including failed attempts and the wrong-model call: approximately US$0.0029656. No further provider calls were made.
- Post-fix live validation was text-only; PDF semantic equivalence is covered by deterministic import/API tests, not a post-fix paid PDF smoke. CP032 review UI/browser preview (including the three sample formats) is not part of CP031.
- No migration, dependency change, user draft access, commit, push, or deployment. No Linux gate was run. CP033–CP036 remain deferred and unchanged.
