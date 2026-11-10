# CP030–CP032 Implementation Plan: Document and Text Import

**Date:** 2026-11-05. **Status:** planned — **must be revised to `web-2.0.0` before CP030 starts** (field paths, `createBlankDraft`, mapping and blank shape below still reference v1). Blocked behind `plans/cp019-cp025_revision-plan_guide-centric-schema-and-editor.md`.
**Authority:** `SPEC.md` v3.3, `TODOS.md`, `RULES.md`, canonical `web-1.0.0`.
**Chapter:** CP030 → CP031 → CP032, one CP `in_progress` at a time, one shared plan, separate completion logs, chapter review after CP032. CP029 (Laravel) is moved to the end of the roadmap and is not touched by this chapter.
**Entry gate:** CP028 completed/logged and `logs/cp027-cp028_chapter-review_2026-10-09.md` ACCEPT. Re-verify these artifacts and the working tree when CP030 starts.

## Objective

Let a guide turn an itinerary they already wrote into an engine draft without retyping it. The guide picks a mode, then either types/pastes text or uploads a DOCX or text-layer PDF. The engine extracts plain text deterministically, AI maps that text into the real canonical fields of the chosen mode, and the result is saved as an ordinary draft. The guide reviews and edits it in the existing editor (each imported field shows the quote it came from), then uses the existing preview → publish → share-link flow.

The AI only **transcribes** what the document says into structure. It does not invent places, order, times, durations, transport, prices or descriptions.

| CP | Deliverable | Completion boundary |
|---|---|---|
| CP030 | Import source intake: text/DOCX/PDF → stored, bounded plain text with stats; scanned/encrypted/oversized files rejected with clear codes. No AI. | API + tests prove each format, every rejection path and private storage. |
| CP031 | AI structured extraction: source text + chosen mode → canonical draft + private per-field provenance quotes; separate unlimited cost ledger. | Deterministic-double tests + bounded live test prove fidelity guards, idempotency and that no value without a verified quote reaches the draft. |
| CP032 | Import UI + review in editor + chapter E2E. | Browser E2E four modes: import → review → edit → save → preview → publish → share link; phone/desktop screenshots inspected. |

## Clarifications and Decisions

Structured Ask Question gate, three rounds, 2026-11-05:

| ID | Decision | Consequence |
|---|---|---|
| D30-1 | Import result is a **draft for review**; the guide can edit everything; extracted values fill the real canonical fields. | No auto-publish. Import ends at "draft created"; publish keeps all CP024/CP025 validation. |
| D30-2 | Formats v1: **typed/pasted text, DOCX, PDF with a text layer.** | Scanned/photo PDFs are rejected (`IMPORT_NO_TEXT_LAYER`) with a message suggesting paste/DOCX. No OCR/vision. |
| D30-3 | **No quota and no budget ceiling for import** (user: "gak usah ada budget, aman aja"). | Import does not reserve against or consume the US$2 `ai_live_budget` ledger nor the 30/day `ai_daily_usage` quota. Actual cost/tokens per import are still recorded in a separate ledger and shown to the guide. Technical per-request bounds (file size, text length, token cap, timeout, one in-flight import) remain as safety limits, not budget. |
| D30-4 | **CP029 deferred to the very end** of the roadmap. | New chapter IDs CP030–CP032 run before CP029. CP029 depends on CP032 + Laravel readiness. IDs are not renumbered (RULES §2). |
| D30-5 | Missing time/duration/transport/etc. → **left empty + warning.** | Consistent with W12: no fabricated values. Warnings list "not found in document" per field. |
| D30-6 | Descriptions/overview are **taken from the document only.** | Empty descriptions stay empty; the guide can use the existing per-field Generate AI buttons afterwards. Import never calls the overview/description writer. |
| D30-7 | **Guide selects the mode before import.** | Extraction prompt and schema are mode-specific; no mode auto-detection. Guide can still change mode later with the existing mode-change confirmation. |
| D30-8 | Chapter of **three CPs** (CP030 intake, CP031 AI extraction, CP032 UI/review/E2E). | One shared plan, three logs, chapter review after CP032. |
| D30-9 | **Store a source quote per extracted field.** | Private provenance metadata, shown in the editor; never in the canonical content, published snapshot, HTML or OG data. |

Planner defaults (behavior-affecting, can be revised before CP030 starts):

- Model: existing OpenRouter `openai/gpt-6-luna`. CP031 checks `supported_parameters` from preflight; uses `response_format` JSON schema if supported, otherwise JSON-only instructions. Both paths are validated by AJV.
- Language: the source text language is detected with the existing `detectLanguage`; mixed/low-confidence detection asks the guide to choose (D10). Text is never translated.
- Content kept as written. If the document contains prices or opening hours, the text is imported as-is and the existing CP024 publish guards report it. Import does not silently delete guide text.
- Safety limits: upload ≤ 10 MB; PDF ≤ 60 pages; DOCX decompressed ≤ 50 MB; extracted text ≤ 120,000 characters; AI timeout 120 s; one retry on retryable failures; one in-flight import per workspace. Exceeding a limit is a clear rejection, not truncation. Chunking long documents is out of scope v1.
- Credentials missing: CP030 intake still works and the extracted text stays viewable; the AI step is disabled with an explanation, and manual editing remains available.

## Scope

- New private import storage (SQLite tables + data directory) for sources, operations, cost ledger and per-field provenance.
- Deterministic text extraction from DOCX (`mammoth` raw text) and PDF (`unpdf`/pdf.js text content), plus typed text; normalization (Unicode NFC, whitespace, page/paragraph markers).
- Magic-byte detection, size/page/decompression/text limits, encrypted/scanned PDF detection, timeouts.
- Mode-specific extraction schema, prompt, provider method, deterministic test double, quote verification, canonical mapping with fresh stable UUIDs, `validateDraft`, draft creation, and provenance.
- Import endpoints, typed API client, import screen, review badges/quotes/missing-field list in the editor, and E2E verification.
- SPEC v3.3 and TODOS updates reflecting D30-1…D30-9.

## Out of Scope

- OCR, vision models, images/photos embedded in DOCX/PDF (guide uses the existing asset upload), `.doc`, `.odt`, `.rtf`, Google Docs links, spreadsheets.
- Auto-publish, mode auto-detection, AI writing of empty descriptions during import, translation.
- Merging an import into an existing itinerary. Import always creates a new draft.
- Chunked/multi-call extraction for documents over the text limit.
- Venue/time verification against external sources; geocoding.
- Changes to the renderer, publish pipeline, share links, or the existing overview/description AI behavior and ledgers.
- CP029 / Laravel / quota-billing integration; any cloud deployment.

## Current-State Findings

1. `POST /api/v1/itineraries` (`src/server/app.ts:134`) already accepts a full `draftContent` + `languageContext` + `writingContext`, runs `validateDraft`, checks asset ownership and returns warnings. CP031 can create the draft through the same store path (`store.createItinerary`) without a new draft format.
2. `createBlankDraft` (`src/server/draft.ts`) defines the exact blank shape per mode and generates UUIDs. The mapper should start from this shape so defaults stay identical to manual drafts.
3. `writingContext` is limited to `{ brief ≤ 20k, notes ≤ 100 × 4k }` (`validWriting`, `app.ts:46`). Provenance must not be stored there: it would break the PATCH contract and the size bounds. Separate tables are needed.
4. Multipart is registered globally with `fileSize: 5 MB, files: 1, fields: 0, parts: 1` (`app.ts:84`). The import upload needs its own per-route limits (10 MB and the `mode` field), so the CP030 route must override limits per request instead of changing the asset upload behavior.
5. The AI provider (`src/server/ai/provider.ts`) exposes only `generate()` for `{ text }` suggestions, with a fixed copy-assistant system prompt and 45 s timeout. Extraction needs a separate `extract()` method/prompt. The existing `generate` path and its tests must stay unchanged.
6. `AiService.reserve()` charges `ai_daily_usage` and `ai_live_budget` (`service.ts`, around lines 146–173). Import must use its own ledger (D30-3) and must not call `reserve()`.
7. `detectLanguage(brief, notes)` and the language-resolve flow already exist and can be reused for source text.
8. No DOCX/PDF parsing dependency is installed. `puppeteer` remains only as historical tooling. New runtime dependencies (`mammoth`, `unpdf`) must be pure JS. The CP028 release packager/validator must still pass. If `build-release.mjs`/`validate-release.mjs` needs changes, that is a CP028 revision and follows its own revision gate.
9. Editor (`src/editor/main.tsx`, 580 lines) creates drafts via `create(mode)` and has `focusDiagnostic()` for jumping to fields by path. The review list can reuse this focus mechanism.
10. CP024 policy guards (prices/opening hours/OTA) run at preview/publish, not at draft save. Imported text with prices will save but be reported before publish. This is the intended behavior.

## Proposed Changes

### CP030 — Import Source Intake

1. Add `src/server/import/schema.ts`: migration creating `import_sources(id, workspace_id, kind CHECK IN ('text','docx','pdf'), sha256, byte_size, page_count, char_count, language_proposal_json, text_path, created_at)`. Extracted text is stored under `<dataDir>/imports/<sourceId>.txt`; original uploaded bytes are **not** retained after extraction (only the hash).
2. Add `src/server/import/extract.ts`: `extractText(kind, bytes|string)` →
   - text: NFC + newline normalization; reject empty/whitespace-only.
   - DOCX: verify `PK` header and `word/document.xml` entry; pre-scan the zip central directory for total uncompressed size and entry count before `mammoth.extractRawText`.
   - PDF: verify `%PDF-` header; reject encrypted documents; load with `unpdf`; reject over 60 pages; join per-page text with page markers; treat < 40 characters per page on average as `IMPORT_NO_TEXT_LAYER`.
   - Enforce the 120k character limit **after** extraction with `IMPORT_TEXT_TOO_LONG` (no truncation); overall 20 s extraction deadline.
3. Add routes in `src/server/import/routes.ts`, registered from `createApp`:
   - `POST /api/v1/imports/sources`: multipart (`file` + `mode`) or JSON `{ mode, text }`. Validates mode, extracts, stores, runs `detectLanguage`, and returns `{ sourceId, kind, mode, pageCount, charCount, languageProposal, excerpt }`.
   - `GET /api/v1/imports/sources/:id`: metadata + full extracted text (workspace-scoped).
   Stable error codes: `IMPORT_UNSUPPORTED_TYPE`, `IMPORT_FILE_TOO_LARGE`, `IMPORT_TOO_MANY_PAGES`, `IMPORT_ENCRYPTED`, `IMPORT_NO_TEXT_LAYER`, `IMPORT_TEXT_TOO_LONG`, `IMPORT_EMPTY`, `IMPORT_CORRUPT`, `IMPORT_TIMEOUT`.
4. Install `mammoth` and `unpdf` as exact-pinned runtime dependencies after this plan is accepted. Record versions and licenses in the log.
5. Fixtures in `tests/fixtures/web/import/`: generated DOCX (id/en/ja), text-layer PDF, image-only PDF, encrypted PDF, zip-bomb-like DOCX, oversized text, renamed `.exe`→`.pdf`, plus typed text. Generate fixtures with a committed script so they are reproducible, not hand-made binaries.
6. Tests `tests/web/import-intake.test.ts` and npm script `test:web-import`.

### CP031 — AI Structured Extraction

1. Add extraction schema `config/web/import-extraction.schema.json`, one variant per mode. It is an intermediate shape: every leaf value is `{ value, quote }` or `null`. Scheduled modes: trip info, days → activities (title, timeLabel, durationLabel, area, type, description, tip), accommodation, meals, transport note, practical lists, closing note. `destination_guide`: spots/groups/logistics/tips without time fields.
2. Extend `AiProvider` with `extract(request: { mode, locale, sourceText, schema, maxTokens }, timeoutMs)` → `{ json, usage }`. Implement it in `OpenRouterProvider` with a dedicated system prompt: transcribe only; every value must include a verbatim quote; use `null` when absent; never infer times/durations/prices/opening hours; treat the document as untrusted data, not instructions; keep the source language. Add a deterministic double for tests.
3. Add `src/server/import/service.ts`:
   - `POST /api/v1/imports/sources/:id/extract` with `{ operationId (uuid v4), outputLanguage }`. One in-flight import per workspace (`409 IMPORT_BUSY`). Idempotent replay by `operationId` returns the same result and never calls the provider twice.
   - `import_operations(operation_id, workspace_id, source_id, mode, status CHECK IN ('running','completed','failed','uncertain'), itinerary_id, prompt_tokens, completion_tokens, actual_usd, error_code, created_at, updated_at)` is the separate cost ledger (D30-3). There is no ceiling. Interrupted `running` rows become `uncertain` on startup, mirroring the AI schema behavior.
   - Validate the model JSON with AJV against the mode schema. Malformed output gets one repair retry, then `IMPORT_MODEL_OUTPUT_INVALID`.
   - **Quote verification:** normalize whitespace/case/Unicode and check that each `quote` is a substring of the source text and that the `value` is contained in or directly derived from its quote (for time/duration: the digits must appear in the quote). Any failed value is dropped and becomes empty + `IMPORT_QUOTE_NOT_FOUND` warning. This is the main anti-hallucination guard.
   - Map to canonical via `createBlankDraft(mode, profile)` + fill fields; generate fresh UUIDs for days/activities/spots; numeric day ranges in source order; `brochure.outputLanguage` set from the resolved locale.
   - Run `validateDraft`. On structural failure, drop the offending optional fields with warnings. If the draft is still invalid, fail with `IMPORT_DRAFT_INVALID` and do not create a half-draft.
   - Create the itinerary through `store.createItinerary`, set `writingContext.brief` to the first ≤ 20k characters of source text (useful context for the later Generate AI buttons), and write `import_field_sources(itinerary_id, path, quote, imported_value_hash, source_id)` keyed by stable-ID paths (e.g. `schedule[<blockId>].activities[<activityId>].timeLabel`).
   - Return `{ itinerary, warnings: [{ code, path, message }], missing: [...paths], usage: { promptTokens, completionTokens, actualUsd } }`.
   - `GET /api/v1/itineraries/:id/import-provenance`: workspace-scoped, private. It is **not** exposed on `/i/:token` routes and not included in published snapshots.
4. Tests `tests/web/import-extract.test.ts` (double): all four modes, multi-day 14 days/60 spots size, quote-not-found drop, injected instruction text inside the document, model returning invented time, malformed JSON + repair, timeout, replay, busy, restart-uncertain, the US$2 ledger and daily usage unchanged after imports, provenance absent from published HTML/snapshot.
5. Bounded live verification `scripts/web/verify-import-live.ts`: a small fixed set (≈ 6 imports across id/en/ja and the four modes). Record tokens/cost per import in the log. There is no budget ceiling per D30-3, but the run is a fixed set, not open-ended.

### CP032 — Import UI, Review in Editor, and E2E

1. API client methods `createImportSource`, `getImportSource`, `extractImport`, `getImportProvenance` in `src/api/client.ts`.
2. Editor list screen: a "Buat dari dokumen/teks" action. The import panel has: mode select (required) → tabs **Ketik/Tempel** | **Upload DOCX/PDF** → intake result (pages, characters, language proposal + override) → "Ekstrak dengan AI" (disabled with reason when credentials are missing) → progress → opens the new draft.
3. Review mode in the editor for imported drafts:
   - Banner "Hasil import — periksa sebelum publish" with the counts imported/missing/warnings.
   - Per-field badge "dari dokumen" with an expandable source quote. The badge switches to "diedit" when the current value's hash differs from `imported_value_hash` (computed client-side; the server never mutates the draft).
   - "Tidak ditemukan di dokumen" list with links that reuse `focusDiagnostic` to jump to each empty field.
   - The import cost of the operation is shown. The extracted source text can be viewed read-only.
4. E2E `scripts/web/verify-import.ts`: real server + SQLite + browser + deterministic provider double; four modes × (paste, DOCX, PDF), scanned-PDF rejection, edit an imported field → badge "diedit" → save → reopen → preview → publish → anonymous share fetch shows no provenance/quotes; phone + desktop screenshots.
5. Re-run the existing suites (`test:web-*`, `verify:web-editor`, `verify:web-publication`, `verify:web-e2e`) and `build:web-release` + `validate:web-release` to prove no regression.

## Data Flow or Control Flow

```
Guide: mode + (text | DOCX | PDF)
  → POST /imports/sources ── magic bytes, limits ──→ extractText ──→ import_sources + imports/<id>.txt
                                                         └─ reject: NO_TEXT_LAYER / TOO_LARGE / ENCRYPTED / …
  → (language proposal; guide confirms/overrides if mixed)
  → POST /imports/sources/:id/extract {operationId, outputLanguage}
        busy/replay check → import_operations(running)
        → provider.extract (mode schema, untrusted-data prompt) → AJV → quote verification → map to createBlankDraft(mode)
        → validateDraft → store.createItinerary → import_field_sources → import_operations(completed, cost)
  → editor opens draft (review badges, quotes, missing list)
  → guide edits → existing Save (PATCH, 409) → Preview → Publish → /i/:token (no provenance)
```

## Files and n8n Workflows Affected

- New: `src/server/import/{schema,extract,routes,service,mapper}.ts`, `config/web/import-extraction.schema.json`, `tests/web/import-intake.test.ts`, `tests/web/import-extract.test.ts`, `tests/fixtures/web/import/*` + generator script, `scripts/web/verify-import.ts`, `scripts/web/verify-import-live.ts`.
- Changed: `src/server/app.ts` (register import routes/migration), `src/server/ai/provider.ts` (add `extract`, unchanged `generate`), `src/api/client.ts`, `src/editor/main.tsx` (+ possibly a new `src/editor/import.tsx`), `package.json`/`package-lock.json` (two runtime deps + scripts), `SPEC.md`, `TODOS.md`, docs `docs/editor-ai-api-contract.md`.
- Possibly changed (only via CP028 revision gate): `scripts/web/build-release.mjs`, `scripts/web/validate-release.mjs`.
- n8n workflows: none.

## Security and Failure Handling

- Files: magic-byte type detection, never trust the extension or MIME; per-route size limits; DOCX decompression and entry-count guard before parsing; encrypted PDF rejection; page and text limits; extraction deadline. Original bytes are discarded after extraction.
- Prompt injection: document text is sent as data in a delimited field; the system prompt states it is untrusted. The output is schema-validated and quote-verified, so an injected instruction cannot add values that are not in the document, and it cannot touch other itineraries or settings (no tools).
- Fidelity: values without a verified quote are dropped (empty + warning). Time/duration digits must appear in their quote. W12 and D11 are preserved.
- Privacy: provenance quotes and source text are workspace-private and never in published snapshots/HTML/OG. The API key stays server-side. Logs record counts/hashes, never raw document text (RULES §12).
- Failures: provider timeout/5xx → `uncertain`/`failed` with cost recorded conservatively; no draft is created on failure; the source stays available for retry with a new operation ID; restart marks `running` as `uncertain`.
- Concurrency: one in-flight import per workspace; idempotent `operationId` replay.

## Verification Plan

- CP030: `npm run test:web-import` (intake). Every format and rejection code; magic-byte spoof; zip-bomb guard; data-root persistence across restart; the asset upload 5 MB limit is unchanged.
- CP031: extraction tests with the double; regression `npm run test:web-ai` proves the US$2 ledger, the daily quota and the `generate` behavior are unchanged; bounded live run with cost recorded; manual inspection of one live result per mode against its source document.
- CP032: `scripts/web/verify-import.ts` browser E2E; phone/desktop screenshots actually opened and inspected (RULES §11a); full regression suites; `build:web-release` + `validate:web-release`.
- Chapter review against SPEC v3.3 and this plan before marking CP032 completed.

## Acceptance Criteria

1. A guide can create a draft from typed text, DOCX, or a text-layer PDF for each of the four modes, in the guide-chosen mode.
2. Scanned/encrypted/oversized/spoofed files are rejected with a specific, understandable message, and nothing is created.
3. Every non-empty imported field has a quote that exists in the source text; no time, duration, price or place appears that the document did not contain.
4. Fields absent from the document are empty and listed as "tidak ditemukan di dokumen"; the guide can jump to each.
5. Imported drafts are ordinary drafts: editable, saved with revision checks, previewable and publishable through the unchanged CP024/CP025 rules.
6. Provenance/source text never appears in published HTML, OG data, or public routes.
7. Import does not change the US$2 live ledger or the 30/day writing quota; each import's tokens/cost is recorded and visible.
8. Existing test/verify suites and the release build/validation still pass.

## Risks and Rollback

- **Extraction quality varies by document layout** (tables, two-column PDFs). Mitigation: quote verification turns misreads into empty fields instead of wrong values; tables are tested in fixtures. Residual risk is documented in the CP031 log.
- **Unbounded cost (D30-3).** The cost is visible per import and in the ledger. If real usage shows a problem, adding a ceiling is a new decision/revision, not a silent change.
- **Model JSON reliability.** Mitigation: structured output if supported, AJV, one repair retry, then a clean failure.
- **Release packaging drift** from new dependencies. Mitigation: validate-release in CP032; packaging changes go through a CP028 revision plan.
- **Rollback:** the feature is additive. Remove the route registration and UI entry to disable it. Import tables are additive migrations; existing drafts/publications are unaffected. Imported drafts remain ordinary drafts.

## Planner note 2026-11-10: revise before CP030 starts

The guide-centric revision (R1-R6, `plans/cp019-cp025_revision-plan_guide-centric-schema-and-editor.md`) replaced the canonical schema with `web-2.0.0`. This plan was written against `web-1.0.0` and is **not valid as written**:

- Its extraction target (`brochure`, `schedule` blocks with `dayStart`/`dayEnd`, `spots`, `hero`, `overview`, `practical`, `closing`) no longer exists. The target is now `trip`, `guide`, `meeting`, `pickup`, `cover`, `summary`, `days[]` (one entry per day), `places[]`, the practical lists, `policies`, `closingNote`, `disclaimer`; agency data comes from the workspace profile.
- Activity time and duration are structured (`time` as `HH:MM` or null, `durationMinutes`), not free labels; mode rules (`FIELD_NOT_APPLICABLE`, span caps 360/720/960) apply to imported drafts as to any draft.
- The editor registry (`config/web/field-registry.json`) is the source for which fields an import may fill; imported fields should map to registry paths.
- The existing `upgradeV1ToV2` is a one-way upgrade for stored v1 drafts and is not an extraction path.

Before CP030 starts: run a new Ask Question round, then replace this plan with a revision plan (RULES section 6) written against `web-2.0.0`. Status of CP030-CP032 stays `pending`.
