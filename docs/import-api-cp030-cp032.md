# Import API (CP030-CP032)

Local, same-origin writes only (the usual `origin` and `x-engine-request: 1` headers). Errors use the standard envelope `{ "error": { "code", "message", "requestId" } }`. Draft writes occur through `apply`, revision-safe `resolve`, or `undo`.

## Sources (CP030)

- `POST /api/v1/imports/sources` with `{ "text": string }` (up to 120,000 characters) or multipart with one `file` field (text-layer PDF, up to 10 MB, 60 pages). Returns `201 { sourceId, kind, pageCount, charCount, languageProposal, excerpt }`.
  - Rejections: `IMPORT_EMPTY`, `IMPORT_TEXT_TOO_LONG`, `IMPORT_UNSUPPORTED_TYPE` (magic bytes, not the file name), `IMPORT_FILE_TOO_LARGE`, `IMPORT_TOO_MANY_PAGES`, `IMPORT_ENCRYPTED`, `IMPORT_NO_TEXT_LAYER` (scan), `IMPORT_CORRUPT`, `IMPORT_TIMEOUT` (20 s worker deadline).
- `GET /api/v1/imports/sources/:id` returns metadata and the extracted text (private to the workspace).
- `POST /api/v1/imports/sources/:id/parse` with `{ "mode" }` returns the deterministic dry run: `fields`, `unconsumed`, `notes`, line counts. Writes nothing.

## Apply, undo, latest (CP031)

- `POST /api/v1/imports/sources/:id/apply` with
  `{ operationId (UUID v4), target: "new" | "overwrite", mode (new only), itineraryId + expectedRevision (overwrite only), outputLanguage? }`.
  - `new` returns `201`; `overwrite` returns `200`. Both return `{ itinerary, report, usage, operationId, sourceId }`.
  - `report`: `filled`, `missingRequired` (publish-check paths still empty), `skipped` (AI values dropped by the quote guard, with reasons), `notes`, `sourceCount`.
  - `usage`: `aiUsed`, `promptTokens`, `completionTokens`, `actualUsd` (null when the provider gives no cost). No ceiling (D30-3). The writing-AI quota and live budget are never touched.
  - Same `operationId`: the stored result is returned, no second model call, no second draft.
  - `409 IMPORT_BUSY` while another import runs; `409 REVISION_CONFLICT` for a stale overwrite (nothing written); `409 IMPORT_NOT_REPEATABLE` for a reused id of a failed or interrupted run.
  - `422 IMPORT_DRAFT_INVALID` when the merged draft fails validation (nothing written).
- `POST /api/v1/imports/operations/:id/undo` with `{ expectedRevision }`. Overwrite only, and only while the draft is still at the import's result revision. Writes the saved content back as a new revision. Otherwise `409 IMPORT_UNDO_UNAVAILABLE`.
- `GET /api/v1/imports/operations?itineraryId=` returns `{ operation }` for the latest run (`report`, `usage`, `undoAvailable`, `sourceId`), or `null`.
- `POST /api/v1/imports/operations/:id/resolve` accepts `{ expectedRevision, candidateId, action: "select" | "edit" | "ignore", line? , value? }`. Select uses an original source line; edit uses a manual value; ignore retains the existing field. The server re-reads and hashes the private source, re-parses the conflict and verifies its line/target, validates the draft and commits the decision and draft revision together. Stale revisions or altered sources return 409; removed sources return 404. Existing reports without review metadata cannot resolve candidates.
- Newly created operation IDs are bound to their request and source hash. A matching completed replay returns its original result revision without running the extractor again; a mismatched request or an older operation without replay metadata fails closed with 409. The original replay snapshot is private and is not part of the ordinary report response.
- Selectable review currently covers recognized scalar conflicts only; AI-rejected and ambiguous layout material remains non-actionable and must be reviewed/edited manually. Existing report data remains private; source text follows its retention policy.
- Some rejected text proposals are retained as explicitly unverified private diagnostics (bounded to 100 items and 2,000 characters per value/quote), not source-backed facts or actionable choices. Source retention removes these proposal texts and older accepted-evidence quotes from the report and replay report. Existing canonical draft contents are not erased by source retention.

## Model contract (CP031)

The model receives only the unread lines of the document, as data, and returns JSON with the keys `summary`, `closingNote`, `policies`, `places`, `activityDetails`. Every value is `{ value, quote }`; the server keeps a value only if its quote is in the document and the value is in its quote. The model never writes times, durations, lists, dates or prices. One repair retry on invalid output; one retry on a retryable provider failure; 120 s timeout.

## Editor (CP032)

- Start screen and sidebar: "Buat itinerary baru" opens the create flow (CP037): step 1 picks the type, step 2 picks the method (tempel teks, upload PDF, isi manual). Only "Mulai isi" or a finished import creates a draft; choosing a type or method creates nothing.
- Open draft: "Isi ulang dari teks/PDF" (disabled while the draft has unsaved changes or the create flow is open) opens it as an overwrite. Overwrite asks for confirmation listing the sections it replaces.
- After an import the report panel shows what was filled, the required fields still empty (click to jump), skipped AI values, notes, usage, the source text, and "Batalkan import" while undo is available.
- For scalar conflicts, the report shows source line/page, candidate values and the current draft value. Choose a source line, edit manually, or ignore; unsaved local changes block review. A stale operation cannot replace the current draft. Unsupported omissions are shown as manual-review items. AI token/cost totals that are unavailable are explicitly unknown, not zero.
- Typed text and reading results survive moving between steps and methods. Navigation is locked while a read, preview or apply request is running.

## Source text removal (CP037, A10)

- `IMPORT_SOURCE_TEXT_REMOVED` (404) is returned by `GET /imports/sources/:id`, `POST .../parse` and `POST .../apply` when the stored text is gone. Apply closes the run as failed, so a new operationId works.
- Text older than `IMPORT_RETENTION_DAYS` (default 30; 0 keeps everything) is removed at server start. Source rows and the import ledger stay, so the report of a finished import still shows.
- `GET /api/v1/itinerary-engine/context` reports `capabilities.import`: `aiConfigured` (from the import extractor, not the writing AI), `maxTextChars`, `maxPdfBytes`, `maxPdfPages`, `retentionDays`.

## Live check (opt-in)

`IMPORT_LIVE=1 npm run verify:web-import-live` runs six fixed imports against the configured OpenRouter key and prints tokens and cost per import. It is not part of the gate.

## Activity mode (SI1)

`mode: "activity"` is accepted by `POST .../parse` and `.../apply` (new and overwrite).

- **Read by code** (key lines `Label: value`): `Kategori` (exactly one of the six categories), `Durasi` (15 minutes to 12 hours), `Jam sesi` (clock times), `Tingkat kesulitan` (mudah, sedang, menantang), `Usia` / `Usia minimal` / `Usia maksimal`, `Berat maksimal` (20-250 kg), `Bahasa pemandu`, `Operator mitra`, `Waktu terbaik`, and the shared `Titik kumpul`, `Jam kumpul`, `Guide`.
- **Lists by heading:** `Highlights` (up to 5 bullets) and `Jalannya kegiatan` (up to 12 bullets, "(15 menit)" at the end becomes the minutes). These two headings are read only in activity mode; elsewhere `Highlights` stays a summary heading.
- **Never guessed:** a value that is not one of the allowed words or is out of range stays empty and the report gets a `Baris N:` note. "Rafting" is not a category.
- **Model step:** `summary`, `closingNote`, `policies` as before, plus `highlights` and `steps` (whole-line quotes, titles only, no minutes). A list the code already read is never replaced.
- **Limits:** over-long values are cut and reported; an age minimum above the maximum drops the maximum with a note. Nothing fails the import.
- An activity draft has no days. Both the days and places of the merged draft stay empty.
