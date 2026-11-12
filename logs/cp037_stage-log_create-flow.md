# CP037 Stage Log: create flow (Jenis → Cara mengisi → Periksa)

Executor: Claude Opus 5.5 (inline, same session as the owner's revision request). Date: 2026-11-12. Brief: `plans/cp037_brief_create-flow-three-steps.md`.
Status: **ready for owner review. Not accepted. Not marked done.** Independent review by a separate reviewer has not been run.

## What was built

| Brief item | Result |
|---|---|
| Single entry point "Buat itinerary baru" (sidebar and empty state) | Done. Choosing a type or a method creates no draft (E2E: count unchanged). |
| Step 1 type cards with explanation and example | Done. Last used type shows "Terakhir dipakai". |
| Step 2 method cards: "Cocok untuk" and "Yang terjadi", icon | Done. Icons are emoji with `aria-hidden`. |
| "Belum yakin pilih yang mana?" help | Done. Text depends on the server AI status and the retention setting. |
| Text and PDF reading on step 2, then footer action (read → preview → apply) | Done. Apply is only reachable after a preview (both create and overwrite). |
| Manual method: "Mulai isi" opens the editor | Done. One draft created. |
| Step 3 identity "Langkah 3 dari 3 · Periksa & lengkapi" and dots | Done in the editor header. |
| Step dots on steps 1 and 2 | Done. |
| Back button goes one step, browser Back/Forward use `#buat/1`, `#buat/2` | Done. |
| Leaving the flow asks first when something was typed | Done (Batal, and browser Back past the first step). |
| Textarea follows its content, placeholder example, character counter | Done. Counter uses the server limit. |
| Sidebar hidden during the flow, content centred at max 768 px | Done (`max-w-3xl`). Grid is single-column while creating. |
| Remember last type and method (localStorage) | Done. Key `itinerary-create-last`. |
| Server capabilities for import (AI status, limits, retention) | Done. AI status comes from the import extractor. FE reads the limits. |
| Removed source text handled on GET, parse and apply | Done. Code `IMPORT_SOURCE_TEXT_REMOVED`, 404. Apply closes the run as failed. |
| Copy that depends on retention | Done. Shows the configured days, or "tidak dihapus otomatis" when 0. |

## Revision after the audit request (findings P1 to P2)

1. **Input lost on Back or method switch (P1).** Both reading screens stay mounted and are hidden, not unmounted. Text, file, reading result and preview survive steps and methods. E2E checks this for Back, Forward, method switch, and returning from step 1.
2. **Navigation not protected during a request (P1).** Each reading screen reports its busy state to the flow. While any request runs, Back, Batal, method cards and browser Back are locked (browser Back re-pushes the step). Responses that arrive after the screen was left are ignored (`alive` guard). The server still finishes an apply that was already sent; the flow never claims otherwise. E2E delays the apply by 2.5 s and checks the lock and that exactly one draft is created.
3. **Verify scripts ran the manual step twice (P1).** Duplicate blocks removed; each script creates its draft once. Assertions were not weakened; `waitForSelector` now precedes `page.click`.
4. **Capabilities not from the real extractor (P2).** `capabilities.import.aiConfigured` = `importExtractor.credentialState === 'configured'`. Tests cross both states (writing off/import on, writing on/import off).
5. **Removed source inconsistent (P2).** GET, parse and apply return the same structured 404. Other read errors are still thrown (500). Test: `tests/web/import-source-removed.test.ts`. The old test that expected `NOT_FOUND` was updated to the new code.
6. **Sidebar visible on desktop (P2).** Hidden with no `lg:block` override while creating.
7. **Missing UX and evidence (P2).** Added `verify:web-create`, last-choice memory, editor step identity, textarea behaviour, footer action for text and PDF, icons, and a short-viewport check for the footer.

## Deviations from the brief (need owner approval)

1. **Copy file location.** Brief said `create/copy.ts` (done) and "`labels.ts`" for import copy (not used; still `import/copy.ts`, as in CP032).
2. **Hook for shared read logic.** Brief suggested `useImportSource`. Not done: the logic stays in `ImportScreen`, which is embedded in the flow. Smallest change that keeps behaviour.
3. **Footer keyboard evidence is an approximation.** The check shrinks the viewport to 520 px and asserts that the footer does not overlap the textarea. Puppeteer does not show the real phone keyboard. Not proven on a real device.
4. **Editor step-3 dots use text characters** (`● ● ●`), not three separate elements.
5. **Overwrite path also needs a preview before apply** (brief only mentioned the creation path). Applied to both, for consistency with the reading order.
6. **Sidebar draft list is hidden during the flow**, not only the create card. Opening another draft therefore needs leaving the flow first. Header "Isi ulang" and "Pengaturan" are disabled during the flow with a tooltip.

## Tests and evidence

- `test:web-import`: 47 pass (was 43). New: retention sweep (`import-retention`), removed-source endpoints and replay (`import-source-removed`), capability crossing and limits (`import-capabilities`). The old removed-source test was updated to the new code.
- `verify:web-create` (new): paths manual, text, PDF; Back/Forward; method switch keeps text; discard asks first; slow apply locks navigation and creates one draft; last-choice memory; screenshots at 390 and 1280; no horizontal overflow at 360; no external requests; no console errors.
- Screenshots reviewed: `output/web-create/cp037-step1-390.png`, `cp037-step2-paste-390.png`, `cp037-step2-paste-1280.png`, `cp037-keyboard-short-390.png`.
- Verify scripts updated for the new flow: `verify-editor`, `verify-ai-ui`, `verify-places`, `verify-preview`, `verify-import`.

Gate results are listed in the final report for this turn, not repeated here, so they match the last run.

## Not tested

- Real phone keyboard (only the approximation above).
- Multi-day live imports through the new flow (the live check still uses the API, not the UI).
- Retention deletion while a browser session is open (sweep runs at server start only).
- Accessibility audit with a screen reader.
- Long documents close to 120,000 characters in the browser (counter and disabled state are tested only by code reading).

## Final gate (2026-11-12, after the last change)

| Command | Result |
|---|---|
| typecheck:web-app, typecheck:web-server, typecheck:web-contracts | rc 0 |
| test:web-import | 47 pass, 0 fail |
| build:web-app | rc 0 |
| verify:web-create (new) | rc 0 |
| verify:web-import, verify:web-editor, verify:web-ai-ui, verify:web-places, verify:web-preview, verify:web-e2e, verify:web-publication, verify:web-publish-retry, verify:web-render | rc 0 |
| build:web-release, validate:web-release | rc 0 |

Gate run source: `/tmp/gate2-summary.txt` (ends with `GATE2-DONE`). Per-command rc:

| Command | rc |
|---|---|
| typecheck:web-app | 0 |
| typecheck:web-server | 0 |
| typecheck:web-contracts | 0 |
| test:web-import | 0 (pass 47, fail 0) |
| build:web-app | 0 |
| verify:web-create | 0 |
| verify:web-import | 0 |
| verify:web-editor | 0 |
| verify:web-ai-ui | 0 |
| verify:web-places | 0 |
| verify:web-preview | 0 |
| verify:web-e2e | 0 |
| verify:web-publication | 0 |
| verify:web-publish-retry | 0 |
| verify:web-render | 0 |
| build:web-release | 0 |
| validate:web-release | 0 |

Two fixes made in the verify scripts during gate 2 (app code unchanged):
- `verify:web-ai-ui` (race): the mode card click could land while the app still had `busy` set, and the click was dropped. The script now retries the click on `[data-mode-card]` (up to 20 tries, 250 ms apart) until `[data-method="manual"]` appears. The step-navigation helper also targets `[aria-label="Langkah"] button` and maps the old step names to the new ones. Assertions are unchanged.
- `verify:web-import` (wait condition, not a timing retry): the flow no longer has `#import-mode`, so the script now waits for `#import-language` after reading, and for the "Lihat hasil baca" button before clicking it on the PDF path. Before this, the PDF path went straight to "Proses" without the preview the flow requires. The waits match the new screen state; no retry loop was added.

Not run: a separate reviewer; the real phone keyboard; the live OpenRouter check through the new UI.
