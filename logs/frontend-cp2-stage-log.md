# Frontend redesign CP2 — stage log

Status: implemented, pending owner review. Existing CP037 and CP1 working-tree changes were preserved.

## Changes

- Editor now groups fields into Info perjalanan, Susun perjalanan, Detail & tampilan, and Periksa & bagikan for all four modes.
- Publish-issue paths point to the new groups; fields and existing section/target attributes remain mounted.
- The mobile stepper wraps into two columns. AI writing settings are near the summary and activity/place actions.
- Multi-day editor uses one open day at a time, with visible labels and existing reorder controls; ketentuan/penutup can be expanded and indicates saved content.
- Existing new/manual/import entry from CP037 was preserved. Existing manual-save behaviour remains; autosave belongs to CP3.

## Checks actually run

- `npm run typecheck:web-app`: passed; repeated after the day-selector change, passed.
- `npm run test:web-editor`: 33 passed, 0 failed; repeated after the day-selector change, 33 passed, 0 failed.
- `npm run build:web-app`: passed; repeated after the day-selector change, passed, with Vite's >500 kB chunk warning.
- `npm run verify:web-editor`: initial failure due to the old section-order assertion; updated the expected order to match the new layout without removing sections. Subsequent run passed; repeated after the day-selector change, passed for all four modes, with no external requests or console errors.
- `npm run verify:web-ai-ui`: passed using the deterministic provider double, including explicit application, stale proposals, and mobile/desktop.
- `npm run verify:web-create`: passed for manual, text, PDF, navigation and slow import.
- `npm run verify:web-import`: passed for four modes, PDF, overwrite/undo, and unsaved blocking.
- `npm run verify:web-preview`: passed, including exact activity diagnostic focus after reorder.
- `npm run verify:web-publication`: passed, including republish and revoked links.
- Ad hoc browser check: all four steps navigated and exactly one step visible for each of four modes, before the day-selector revision.
- Ad hoc browser check after revision: multi-day initial open state `[true,false]`; selecting second day and typing kept `[false,true]` and retained the title.
- Two earlier ad hoc attempts to reach the multi-day selector through the new-create flow failed in the probe's timing; a separate check opened a draft created through the temporary server API instead. Existing `verify:web-create` passed before the day-selector change, which does not modify creation.

## Limitations

- No real-phone keyboard, screen-reader, or usability study was run. Four-step visual review is not a substitute for testing with guides.
- Detailed guide, cover, and practical sections remain visible in their group; only ketentuan/penutup is collapsible in this stage. Theme selection remains in Info perjalanan.
- No release gate or local commit was run; the working tree contains shared, uncommitted CP037/CP1 changes and a commit was not explicitly requested.
