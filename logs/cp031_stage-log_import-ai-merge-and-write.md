# CP031 Stage Log: AI completion, merge, write (new or overwrite), undo, ledger

Executor: Claude Haiku 5.5 (inline, same session as CP030). Date: 2026-11-11. Base: `main` after CP030 accepted (owner said "lanjut"). Plan: `plans/cp030-cp032_implementation-plan_document-and-text-import.md`, section CP031, with decisions I1-I10 and PD-1 to PD-6.

## What was built

| Plan item | Result |
|---|---|
| Migration 7, import operations ledger | Done (`src/server/import/schema.ts`, `src/server/store.ts`). Separate from the writing ledger. Statuses `running`, `completed`, `failed`, `uncertain`. A start-up marks leftover `running` rows `uncertain`. |
| Provider `extract` | Done as a separate interface `ImportExtractor` (`src/server/ai/provider.ts`). `generate()` and its tests are unchanged. |
| AI completion | `src/server/import/complete.ts`. Only unconsumed parse lines are sent, as `[section] text`, at most 20,000 characters. One repair retry on invalid output, one retry on a retryable provider failure, 120 s timeout, 1,500 max tokens. |
| Reply schema | `config/web/import-completion.schema.json`. Every leaf is `{value, quote}`. There are no time, duration or price fields, so the model cannot write them. AJV validates every reply. |
| Quote guard | `quoteHolds`: the quote must be a substring of the folded segments, and the value a substring of the folded quote. A failing value is dropped and listed in the report. |
| Mode and path rules | Places only for `destination_guide`. Activity details only for day modes, and only for an activity the parser found by exact folded title. Paths code already filled are never overwritten. |
| Merge | `src/server/import/merge.ts`: one function serves new drafts (start blank) and overwrite (start from the saved draft). Anything the document does not provide keeps its current value. Lists are replaced whole when found. Days are replaced whole when found, keeping photo, hotel, meals and transfer note of the same `dayNumber`. Guide is matched to Setup. List items are matched to the built-in OTA options (id and en only). |
| Language | Overwrite keeps the draft's language unless the guide chose one. A new draft uses the chosen output language, else the detected one, else the Setup default, else unresolved. `languageContext` always satisfies `validLanguage`. |
| Write | New: `store.createItinerary`. Overwrite: `store.updateItinerary` with the expected revision; a stale revision is 409 and nothing is written. The draft is checked with `validateDraft` first; an invalid draft is 422 `IMPORT_DRAFT_INVALID` and nothing is written. |
| Apply, replay, busy | `POST /api/v1/imports/sources/:id/apply`. The same `operationId` returns the stored result: no second model call, no second draft. A running operation, or a second concurrent import, answers 409 `IMPORT_BUSY`. A reused id from a failed or uncertain run answers 409 `IMPORT_NOT_REPEATABLE`. A duplicate id from another workspace answers 409 too. |
| Undo | `POST /api/v1/imports/operations/:id/undo` with `{expectedRevision}`. Overwrite only. Works only while the draft is still at the import's result revision. Restores the saved content as a new revision. Otherwise 409 `IMPORT_UNDO_UNAVAILABLE` ("batalkan secara manual"). |
| Latest | `GET /api/v1/imports/operations?itineraryId=` returns the latest report, usage and `undoAvailable`. |
| Report | `filled`, `missingRequired` (paths from the publish validator), `skipped` (dropped AI values with plain Indonesian reasons), `notes` (parser and AI notes), `sourceCount`. |
| Cost | Tokens and USD recorded per operation. `actual_usd` is null when the provider gives no cost. No ceiling (D30-3). |
| Writing AI untouched | Test: the `ai_daily_usage` rows are identical before and after an import. |

Files changed: `src/server/ai/provider.ts` (`ImportExtractor`, `extract`), `src/server/draft.ts` (exports `blankDay`, `blankActivity`), `src/server/store.ts` (migration 7), `src/server/app.ts` (wiring and `importExtractor` option), `src/server/import/{schema,complete,merge,service,routes}.ts`, `config/web/import-completion.schema.json`, `tests/web/import-apply.test.ts` (15 tests), `tests/web/store-migration.test.ts` (versions up to 7), `package.json` (`test:web-import` includes the apply suite).

## Gate results (2026-11-11)

| Command | Result |
|---|---|
| typecheck:web-app, typecheck:web-contracts, typecheck:web-contracts-v2, typecheck:web-server, check:web-types | rc 0 |
| test:web-import | 35 pass (intake 10, parser 10, apply 15) |
| test:web-store | 12 pass (migration 7 included) |
| test:web-contracts 43, test:web-api 13, test:web-ai 28, test:web-render 14, test:web-editor 33, test:web-preview 12, test:web-publication 12, test:web-places 16 | all pass |
| build:web-app and verify:web-editor | rc 0 |
| build:web-release and validate:web-release | valid, 55 files |

## Mutation check

The quote guard (`quoteHolds`) forced to return true: `import-apply` fails 2 tests (a closing note with a quote not in the text is kept; an injected place is accepted). Restored: 0 fail.

## Deviations from the plan (with reasons)

1. **`response_format` not used.** The plan asked for a JSON schema `response_format` when the preflight lists it. The extraction call sends JSON-only instructions, and AJV validates the reply. Reason: the call stays independent of the preflight cache, and AJV guards both paths.
2. **Narrower AI scope.** The plan's extraction covered every scheduled section (times, durations, lists, hotel, meals). CP031 lets the model complete only: `summary`, `closingNote`, `policies`, destination `places` (name, area, description), and activity `place`, `description`, `tip` for activities the parser found. Times, durations, lists and dates come from code only. Reason: the owner asked for code first. The AI never writes times now, which is stricter than the plan.
3. **No `import_field_sources` table and no provenance endpoint.** The plan's per-field provenance (D30-9) was replaced by I9 (summary panel and source text only). The quote check still runs on the server; quotes are not stored.
4. **No partial drop on an invalid draft.** The plan said to drop offending optional fields with warnings. The implementation refuses the whole import (`IMPORT_DRAFT_INVALID`, nothing written). Reason: a half-applied overwrite is harder to undo, and the report says why.
5. **Overwrite keeps hotel, meals, photo and transfer note** of a day with the same `dayNumber` when the import replaces that day. The plan did not say; this avoids losing data the document does not contain.
6. **Overwrite keeps the draft's language** unless the guide chose one in this import. The plan said "keep the resolved language unless the guide chose another one", which matches.
7. **Writing brief.** A new draft's `writingContext.brief` is the first 20,000 characters of the source. Overwrite leaves the saved writing context unchanged; the plan did not say.
8. **Option matching** uses only the built-in id and en lists. The synonym table from CP030 stays empty.

## Known gaps

- Restart recovery is tested by inserting a `running` row and restarting the app. A real crash mid-call is not reproduced.
- `actual_usd` is null when the provider returns no cost; the report then shows tokens only.
- The completion prompt is in English and the document is sent as-is. Prompt quality on real Indonesian documents is unmeasured until the CP032 live run.
- No browser UI yet (CP032).
