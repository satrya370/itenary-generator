# Import API (CP030-CP032)

Local, same-origin writes only (the usual `origin` and `x-engine-request: 1` headers). Errors use the standard envelope `{ "error": { "code", "message", "requestId" } }`. Import never writes a draft except through `apply`.

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

## Model contract (CP031)

The model receives only the unread lines of the document, as data, and returns JSON with the keys `summary`, `closingNote`, `policies`, `places`, `activityDetails`. Every value is `{ value, quote }`; the server keeps a value only if its quote is in the document and the value is in its quote. The model never writes times, durations, lists, dates or prices. One repair retry on invalid output; one retry on a retryable provider failure; 120 s timeout.

## Editor (CP032)

- Start screen: "Buat dari teks/PDF" opens the import screen for a new draft.
- Open draft: "Import teks/PDF" (disabled while the draft has unsaved changes) opens it as an overwrite. Overwrite asks for confirmation listing the sections it replaces.
- After an import the report panel shows what was filled, the required fields still empty (click to jump), skipped AI values, notes, usage, the source text, and "Batalkan import" while undo is available.

## Live check (opt-in)

`IMPORT_LIVE=1 npm run verify:web-import-live` runs six fixed imports against the configured OpenRouter key and prints tokens and cost per import. It is not part of the gate.
