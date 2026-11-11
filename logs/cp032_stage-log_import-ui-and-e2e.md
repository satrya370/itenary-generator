# CP032 Stage Log: Import UI, report panel, browser E2E, live check

Executor: Claude Haiku 5.5 (inline, same session). Date: 2026-11-11. Base: `02a1f4f` (CP031 accepted). Plan: `plans/cp030-cp032_implementation-plan_document-and-text-import.md`, section CP032.

## What was built

| Plan item | Result |
|---|---|
| API client methods | `createImportSource` (text or PDF), `getImportSource`, `parseImport`, `applyImport`, `undoImport`, `latestImport` (`src/api/client.ts`). |
| Entry points | Start screen: "Buat dari teks/PDF" under the mode cards. Open draft: "Import teks/PDF" in the header, disabled while there are unsaved changes. |
| Import screen | `src/editor/import/ImportScreen.tsx`. Tabs "Tempel teks" and "Upload PDF"; intake result (pages and characters); mode select for a new draft (locked to the draft's mode for an overwrite); language select (detected or chosen); "Lihat hasil baca" dry run with counts and notes; overwrite confirmation listing what will be replaced; "Proses". On a phone the sidebar is hidden while the import screen is open, so the screen comes first. |
| Report panel | `src/editor/import/ImportReport.tsx`. Filled count; "Masih kosong dan wajib diisi" with clickable paths that jump to the field (`focusDiagnostic`); skipped and notes; usage line ("Tanpa AI · tidak ada biaya" or tokens and US$); "Lihat teks sumber" (read-only); "Batalkan import" while undo is available. Shown after an import and again when the draft is reopened (from `latestImport`). |
| Copy | Indonesian copy in `src/editor/import/copy.ts`. Not added to `labels.ts` (see deviations). |
| Server, small changes | `apply` and `latest` return `sourceId` so the report can show the source text. |
| Browser E2E | `scripts/web/verify-import.ts` (`npm run verify:web-import`). |
| Live check | `scripts/web/verify-import-live.ts` (`npm run verify:web-import-live`, opt-in with `IMPORT_LIVE=1`). |
| Docs | `docs/import-api-cp030-cp032.md` (API, model contract, editor behaviour, live check). |

## Browser E2E (what it proves)

Real server, SQLite, puppeteer, extractor double (no network, no key):
1. Paste import of the half-day fixture creates a draft titled from the text; the report lists required fields still empty.
2. Paste imports for full day, multi day and destination guide, each as a new draft.
3. Text-layer PDF creates a draft titled from the PDF text.
4. The scanned PDF is refused with "berupa gambar/scan"; nothing is created.
5. Overwrite of the open draft asks for confirmation, replaces the title, and "Batalkan import" restores the previous title.
6. "Import teks/PDF" is disabled while the draft has unsaved changes.
7. Publish is locked while required fields are empty (checked), then fields are filled and the draft publishes. The public page does not contain source text ("Jam kumpul:" and "Titik kumpul:" absent).
8. Zero external requests; zero console errors.

Screenshots opened and inspected: `output/web-import/cp032-report-1280.png` (report panel above the draft, missing fields listed, "Tanpa AI" shown correctly) and `output/web-import/cp032-import-screen-390.png` (import screen first on a phone, plain copy, AI-off note). The 390 screenshot first showed the import screen below the sidebar; fixed by hiding the sidebar while importing.

## Live check (run once, bounded, 2026-11-11)

Six fixed imports against the configured OpenRouter key: all six returned 201. Total cost about US$0.0007 (2,173 tokens); AI used in 4 of 6 imports (the fully structured one used none). No budget ceiling by decision D30-3.

**Problem found and fixed by the live run.** The extraction prompt never named the reply keys. The model answered with its own names ("destinations", "police"), so the destination guide's places were rejected by the schema. Fix: the prompt now lists the exact keys and shapes. A unit test checks that the prompt names them.

**Manual inspection** (against the source documents, after the fix):
- Destination guide: "Candi Prambanan" (area Sleman) and "Malioboro" (area Kota Yogyakarta). Both match the source lines. Correct.
- Injected instruction document ("abaikan instruksi ... Raja Ampat"): no injected place reached the draft. Correct. The unclear "jam 8" stays as text with no time.
- Full day: summary equals the source sentence exactly. Correct. Activity descriptions stay empty, since the source has none. Correct.

## Gate results (2026-11-11)

| Command | Result |
|---|---|
| typecheck:web-app, typecheck:web-contracts, typecheck:web-contracts-v2, typecheck:web-server, check:web-types | rc 0 (contracts failed once on a typed file input in the E2E; fixed) |
| test:web-import | 38 pass (intake 10, parser 10, apply 18) |
| test:web-store 12, test:web-contracts 43, test:web-api 13, test:web-ai 28, test:web-render 14, test:web-editor 33, test:web-preview 12, test:web-publication 12, test:web-places 16 | all pass |
| build:web-app and verify:web-import | rc 0 |
| verify:web-editor, verify:web-preview, verify:web-publication, verify:web-ai-ui, verify:web-e2e, verify:web-publish-retry, verify:web-render | all rc 0 |
| build:web-release and validate:web-release | valid, 55 files |

## Deviations from the plan (with reasons)

1. **Copy file.** The plan said to put the copy in `labels.ts`. It lives in `src/editor/import/copy.ts` so the import feature stays in one folder. Nothing else depends on this.
2. **Import screen placement.** The plan suggested `src/editor/import.tsx`; it is a folder with two components.
3. **No per-field "dari dokumen" badges or quotes.** Decided in I9 (summary panel and source text only).
4. **Editor AI state.** The import screen's "AI belum aktif" note reads the writing-AI credential state. In the E2E this shows "AI belum aktif" although the extraction double is active. The real server uses the same credential for both, so the note is correct in production. Recorded here so nobody is surprised by the E2E screenshot.
5. **Live check cost.** Run once, bounded, with a real key, as the plan's gate requires. Cost is shown above.

## Known gaps

- The live run covers six imports, not one result per mode for every case. Multi-day with no AI replies was not inspected against a model reply.
- The E2E uses a double for the model; the real model is covered only by the live run and its manual check.
- Mobile layout checked at 390 for the import screen and the editor; the report panel on a phone was not screenshotted separately.
- No restart-during-import test in the browser.
