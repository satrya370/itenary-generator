# CP030 Review Log: Import intake and deterministic parser

Reviewer: Claude Haiku 5.5 (same session as the executor). Date: 2026-11-11. Commit reviewed: `4e08bac`.
**Independence caveat:** the planned independent Sonnet reviewer was blocked twice by an auto-mode hook that changed the Agent input. The review was therefore done in the same session as the executor. Treat it as a self-review; the owner may request a separate review.

## Verdict

**REVISE (small).** Gates and the core behaviour hold. Four small findings and one unlogged deviation are fixed in the revision commit below.

## Gate results (run during review)

| Gate | Result |
|---|---|
| typecheck:web-app, -contracts, -contracts-v2, -server, check:web-types | rc 0 |
| test:web-import | 19 pass |
| test:web-store | 12 pass |
| test:web-api | 13 pass |
| test:web-editor | 33 pass |

## Probes (targeted, deleted after run)

| Probe | Input | Result |
|---|---|---|
| Text limit with astral characters | 120,000 emoji (UTF-16 length 240,000) | accepted (code points used consistently) |
| Text limit | 120,001 emoji | `IMPORT_TEXT_TOO_LONG` |
| Blank | spaces, zero-width space, tabs | `IMPORT_EMPTY` |
| Long first line (130 chars) | title | not used as title (correct: first line must be 120 or less) |
| Time-first document | `09:00 Ubud Palace` | no title, activities kept (correct) |
| Heading with no bullets | `Termasuk` then `Pemandu` and `1 jam` | no list; both lines unconsumed (correct, nothing invented) |
| Unclear hour | `jam 8 makan malam` | time null, ambiguous true (correct) |
| Day part word as name | `09:00 Pagi` | rest `Pagi` (correct after the fix in the working commit) |
| Empty key-value | `Guide:` | no guide value (correct) |
| Non-string text to the helper | number to `intakeText` | `TypeError` (the route guards this before calling; the helper itself did not) |

## Plan conformance (CP030)

| Plan item | Status | Where |
|---|---|---|
| Migration 6, `import_sources` with `kind` check | PASS | `src/server/import/schema.ts`, `src/server/store.ts` |
| Text normalization, empty and 120k limit, no truncation | PASS | `intake.ts` `normalizeText` |
| PDF magic bytes, 10 MB, 60 pages, encrypted, no text layer, corrupt, 20 s worker deadline | PASS (encrypted path not exercised, see gaps) | `intake.ts` `readPdfPages`, `assertTextLayer` |
| Original PDF bytes not kept, only hash and stats | PASS | `routes.ts` insert; test lists the imports folder |
| Text stored under `<dataDir>/imports` | PASS | `intake.ts` `storeSourceText` |
| Language proposal with `detectLanguage` | PASS | `intake.ts` |
| POST sources (JSON or multipart), GET detail, POST parse dry run | PASS | `routes.ts` |
| POST sources validates `mode` and returns it | **DEVIATION** (mode is chosen at parse, see below) | `routes.ts` |
| Same-origin write guard | PASS (global hook in `app.ts`) | `app.ts` onRequest |
| Per-route PDF size limit, asset 5 MB unchanged | PASS | `routes.ts` `request.file({limits})`; test |
| Heading dictionary in `config/web/import-headings.json` | PASS | config file |
| Day markers with increasing sequence | PASS | `parse/days.ts`, `extract.ts` |
| Time forms, ranges, durations, ambiguous hours, no invented end times | PASS | `parse/time.ts`; test |
| Extract rules (title, kv, bullets, activities, Maps URL, phone, no `title — place` split) | PASS | `parse/extract.ts` |
| Normalizers (time, minutes, kind, guide, option, date, defaults) | PASS (defaults helper not written, see gaps) | `normalize.ts` |
| PD-5 half/full day multiple days, 14-day cap, destination guide ignores days | PASS | `extract.ts`; tests |
| Fixtures from a committed generator (text, PDFs, scan, 61 pages, renamed) | PASS (no DOCX by design, no encrypted fixture) | `make-import-fixtures.ts` |
| Intake tests (rejections, size, storage, restart) | PASS | `import-intake.test.ts` |
| Parser tests (fixture table, normalizers, traceability) | PASS | `import-parser.test.ts` |
| `test:web-import` script | PASS | `package.json` |
| No AI, no quota touch, no draft write | PASS (no call sites; `routes.ts` writes only `import_sources`) | `routes.ts` |
| Mutation check | PASS (reproduced: traceability test fails on an injected invented value) | executor log; reviewer re-ran the mutation |

## Findings

| ID | Severity | Where | What is wrong | Failure scenario | Fix |
|---|---|---|---|---|---|
| R1 | Medium | `routes.ts` POST | The text file is written before the DB row. If the insert fails, the text file stays with no row. | Disk-full or constraint error during insert leaves an orphan `.txt` under `imports/`. | Remove the file when the insert throws. |
| R2 | Low | `routes.ts` GET detail | A row whose text file is missing returns a generic 500. | Someone deletes `imports/<id>.txt`; the GET fails with INTERNAL_ERROR. | Return 404 `NOT_FOUND` with a clear message. Add a test. |
| R3 | Low | `normalize.ts`/`intake.ts` | `intakeText` and `normalizeText` assume a string. The route guards it; the helpers do not. | A future caller passes a number and gets a TypeError. | Reject non-strings with `IMPORT_EMPTY`. |
| R4 | Low (plan deviation) | `routes.ts` POST | Plan step 3 says POST sources validates `mode` and returns it. The executor moved `mode` to the parse step. | Only documentation: a client that expects `mode` in the create response gets none. | Accept the deviation: I2 (mode is chosen before the import, and parse takes it). Record it in the stage log. No code change. |

## Deviations ruling

- Mode is not required at source creation: accepted (R4). Parse needs the mode anyway; the dry run is where it matters.
- Inline execution instead of a subagent: accepted as a process note (the subagent was blocked by a hook).
- Period words only count without minutes: accepted, it fixes a real bug found by a test.
- Release file count 41 to 51: accepted; the new config and import files are packaged, validation is valid.
- Option synonyms table empty: accepted; no invented synonyms.

## What is good

- Nothing invented in the probes; the injection line and the unclear hour are handled as text.
- Code-point counting is consistent (limit and stats use the same unit).
- No source text reaches logs (`import/` has no logging calls); no DB write in the parse path.
- Fixtures are reproducible and small (278 KB for 12 files).

## Revision (2026-11-11, executor: same session)

| ID | Fix | Test |
|---|---|---|
| R1 | `POST /imports/sources`: if the DB insert fails, the text file is removed (no orphan). | Covered by code path; no test for a forced insert failure (gap). |
| R2 | `GET /imports/sources/:id` with a missing text file answers 404 `NOT_FOUND` with a clear message. | New test: "a source whose text file was removed answers 404 ...". |
| R3 | `normalizeText` rejects non-strings with `IMPORT_EMPTY`. | Route already guards; helper now guarded too. |
| R4 | Deviation accepted (mode chosen at parse, see I2). No code change. | Recorded in the stage log. |

Gate after revision: typecheck (app, contracts, contracts-v2, server, check:web-types) rc 0; test:web-import 20 pass (intake 10, parser 10); test:web-store 12; test:web-contracts 43; test:web-api 13; test:web-ai 28; test:web-render 14; test:web-editor 33; test:web-preview 12; test:web-publication 12; test:web-places 16; build:web-app and verify:web-editor rc 0; build:web-release and validate:web-release valid (51 files).

## Revised verdict

**ACCEPT pending owner acceptance.** R1 to R3 fixed, R4 accepted. Still open (documented in the stage log): encrypted-PDF path not exercised, worker termination not directly proven, id/en headings only, empty option synonym table.
