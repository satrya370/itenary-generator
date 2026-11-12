# Frontend redesign CP4 — stage log

Status: implemented, pending owner review. This stage builds on uncommitted CP037 and frontend CP1–CP3 work.

## Changes

- Preview opens in a dedicated full-screen dialog; the editor stays mounted and inactive behind it. Back and Escape restore the previous editor step and focus. Background scrolling is locked while open.
- The preview uses the saved revision and stays sandboxed. It indicates whether publish requirements remain, without presenting a preview URL as a public link.
- Active public links offer native sharing and copying; native-share failure falls back to copying, and the visible URL remains available when clipboard access fails. Revoked links have no share action.
- Preview and publish remain coordinated with autosave; publish is an explicit user action.

## Checks actually run

- `npm run typecheck:web-app`: passed after final changes.
- `npm run test:web-editor`: 33 passed, 0 failed before the final preview step-preservation adjustment.
- `npm run build:web-app`: passed after final UI changes; Vite reports a >500 kB chunk warning.
- `npm run verify:web-preview`: passed after final changes; sandboxed saved preview, exact diagnostic target after reorder, mobile/desktop widths, editor inactive during preview, Escape, restored focus and previous editor step. Zero console errors or external requests. The saved phone screenshot was inspected; it is a full-page capture with a viewport-fixed overlay.
- `npm run verify:web-publication`: initial run failed because Puppeteer evaluation included a transpiler-only `__name` helper; fixed the test harness, then passed. Tests native share and clipboard through browser stubs, clipboard-failure fallback, revoked links, and publish/republish. Zero console errors or external requests.
- `npm run verify:web-editor`: passed for all four modes after preview integration and before the final previous-step adjustment.
- `npm run verify:web-publish-retry`: passed; six attempts using deterministic double, no live inference.
- `node --import tsx scripts/web/verify-autosave.ts`: passed after final UI changes, including queued preview and publication revision checks.
- `git diff --check`: passed (line-ending warnings only).

## Limitations

- Native OS share sheet, real phone keyboard, screen reader, and guide usability sessions were not tested; browser share/clipboard checks used stubs.
- Publishing during in-flight edits was tested with a simulated pending publication response, while normal real publication and retry were tested separately.
- No release gate or local commit was performed. No changes to renderer or API were needed for this stage.
