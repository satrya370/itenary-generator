# Frontend redesign CP3 — stage log

Status: implemented, pending owner review. Existing CP037, CP1 and CP2 changes remain in the working tree.

## Implemented

- Draft changes are saved after one second without edits. One save is in flight at a time; edits during a save are submitted with the newer revision afterwards.
- Save failures stop automatic retry and expose a retry button. Validation errors wait for a new edit. Conflicts stop automatic saving and keep local edits; copying local data uses the latest content, language and writing.
- Preview and publish requested while a draft is changing wait for the latest successful save. If saving fails, the queued operation is cancelled; preview failure handling is covered by a browser test.
- AI generation and import can be requested while edits are unsaved; they start after the latest save. Switching draft or starting a new one likewise waits; save failure returns to the existing discard confirmation. Other concurrent operations remain guarded.

## Checks actually run

- `npm run typecheck:web-app`: passed after final changes.
- `npm run test:web-editor`: 33 passed, 0 failed before the preview-queue change.
- `npm run build:web-app`: passed after the preview-queue change; Vite reports >500 kB chunk warning.
- `node --import tsx scripts/web/verify-autosave.ts`: passed after final changes. Browser test checks sequential saves, latest edit during delayed save, preview waiting on the latest revision, preview cancellation on save failure, explicit network retry, validation recovery, and conflict retaining local/server data.
- `npm run verify:web-editor`: passed before the preview-queue change.
- `npm run verify:web-ai-ui`: passed with deterministic provider double before the preview-queue change.
- `npm run verify:web-preview`: passed after the preview-queue change.
- `npm run verify:web-publication`: passed after adding the publish queue; covers normal publication, not a publish click during an in-flight save.
- Follow-up: `npm run typecheck:web-app` and `npm run build:web-app` passed; initial typecheck failed on union narrowing and was fixed.
- Follow-up: `node --import tsx scripts/web/verify-autosave.ts` passed; checks preview, publish, AI, import and draft switching wait for the saved revision, alongside network/validation/conflict cases. Publish uses a deterministic pending response; AI uses a provider double.
- Follow-up: the autosave browser check also passed after preview-screen changes and after adding a failed-save/draft-switch cancellation scenario; the local edit remained available for retry.
- Follow-up: `npm run verify:web-ai-ui` passed. `npm run verify:web-import` initially failed its old unsaved-blocking assertion; the assertion was replaced with a check that the edit is saved before import opens, and the rerun passed.

## Limitations

- Language detection remains disabled until saving is complete. Browser unmount during a network request and editing during an in-flight real publish have not been directly tested.
- Real-phone lifecycle, offline persistence, screen-reader and usability testing have not been performed. No release gate or local commit was run.
