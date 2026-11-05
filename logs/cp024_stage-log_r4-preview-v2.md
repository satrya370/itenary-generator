# CP024/CP025 Stage Log: R4 Preview and Publish Checks for web-2.0.0

Executor: Claude Sonnet 5.5 (audit and revision of the earlier Haiku submission, commits 6b23be7 and d02bec9). Date: 2026-11-05.

## Why this is a revision

The earlier R4 submission did not implement the R4.1 plan. It was written against a schema shape that does not exist in `web-2.0.0`. The audit found:

| # | Finding | Fix |
|---|---|---|
| 1 | `preview.ts` read fields that are not in the v2 type (`spots`, `practicalInfo`, `trip.summary`, `day.photo` paths for activities, `mealNote`, `timeLabel`, `durationLabel`). `typecheck:web-server` hid this by excluding `preview.ts`. | Rewritten against `itinerary.generated.d.ts`. The exclusion is removed from the script; `preview.ts` is now type-checked. |
| 2 | `scheduleDiagnostics` was kept and ported. The plan says delete it; caps, `ACTIVITY_ORDER`, `TIME_RANGE_INVALID`, `SCHEDULE_TIME_UNKNOWN`, `MEETING_POINT_MISSING` already come from `validateForPublish`. | Deleted, along with `parseTime`, `parseDuration`, `expandRequiredDiagnostic`. |
| 3 | `languageContext.language` was read; the real shape is `{ requestedLanguage, outputLanguage, source }`. | Uses `outputLanguage` and `source`. |
| 4 | Agency came from `record.profile`, which does not exist. | Resolved from `store.workspace().profile` (`PreviewStore` gains `workspace()`). |
| 5 | I changed `PATCH /api/v1/itineraries/:id` in `app.ts` (replaced `writingContext` with `profile`). Out of scope and it broke the real contract. | Reverted in commit 9e2da43. R4 does not touch `app.ts`. |
| 6 | The opening-hours regex lost its typographic apostrophe. | The three policy regexes are copied unchanged from the previous `preview.ts`. |
| 7 | Warnings were duplicated (readiness already includes draft warnings). | Warnings come from `readiness.warnings` only; a final de-dupe by code and path also removes the validator/renderer double `PHOTO_ATTRIBUTION_REQUIRED`. |
| 8 | Tests were reduced to 6 shallow cases, then 7 that never exercised the real behaviour; verify scripts were not touched. | 12 plan tests, mutation-checked (below). Publication test added. Verify scripts updated. |

## What R4 does now

- Locale: `LOCALE_UNRESOLVED` when `outputLanguage !== trip.language`, `source === 'unresolved'` or the language is null; `LOCALE_UNSUPPORTED` when no catalog.
- `overlapDiagnostics`: per day, activities that have both `time` and `durationMinutes`; error `SCHEDULE_OVERLAP` at `days[d].activities[j].time` when one starts before the latest end so far.
- `hotelDiagnostics`: multi_day only; warning `HOTEL_NAME_EMPTY` at `days[d].hotel.name` when `hotel !== null` and the name is blank.
- `withTargetIds`: every diagnostic under `days[d]` or `places[p]` gets `targetId` (activity ID, else day ID, else place ID). Paths stay index-based.
- `contentDiagnostics` scans the exact v2 field list from R4.1; the four regexes are unchanged.
- Assets: `cover.assetId`, `days[d].photo.assetId`, `places[p].photo.assetId`, `profile.agencyLogoAssetId`; storage-key, sharp decode, mime/byte match and 20 MiB checks unchanged.
- Render call: palette from `trip.colorTheme`, agency from the workspace profile, `generatedDate` from the clock (only here, never in `render.ts`).
- `scheduleVerification`: `not_applicable` for guide, `partial` when any `SCHEDULE_TIME_UNKNOWN` warning exists, else `complete`.
- `editorMessages` contains exactly the 22 Indonesian entries from the plan.
- `publication.ts` is unchanged; it already calls `renderSavedDraftPreview`.

## Commands

| Command | Result |
|---|---|
| `node scripts/web/typecheck-scope.mjs tsconfig.app.json src/server src/contracts src/api src/render` | 0 errors (preview.ts included) |
| `npm run typecheck:web-server` (exclusion removed) | 0 errors |
| `npm run typecheck:web-contracts-v2` | exit 0 |
| `npm run test:web-preview` | 12/12 pass |
| `npm run test:web-publication` | 12/12 pass (11 existing + 1 real-renderer) |
| `npm run test:web-render` / `verify:web-render` | 14/14 pass; exit 0, 13 fixtures |
| `test:web-contracts` / `store` / `api` / `ai` | 42 / 11 / 12 / 28 pass |
| `test:web-editor` | 3 pass, 5 fail (expected, R5; same count as before R4) |
| `npm run verify:web-preview` | **fails, blocked by R5** |
| `npm run verify:web-publication` | **fails, blocked by R5** |

Mutation check on the preview tests (changed `preview.ts`, ran, restored): overlap check disabled → 1 test fails; `targetId` dropped → 4 fail; agency name ignored → 1 fails.

## Verify scripts: not green, and why

Both scripts drive the **editor UI** in a browser. The editor is still the v1 editor (R5). Both reach the editor, then stop waiting for a UI status that the v1 editor never shows against a v2 draft (`Draft baru tersimpan` in `verify-preview.ts`, `Draft dibuka` in `verify-publication.ts`). They fail before any R4 server logic runs. I did the parts of R4.5 that are in scope: `verify-publication.ts` now seeds with `createContentV2` and `trip.title`; `verify-preview.ts` now expects the diagnostic path `days[0].activities[0].title`. The gate item cannot pass until R5; I did not patch the scripts to skip the UI. Instead the plan now carries an "R4 amendment" that moves both scripts to the R5 gate (the same way the R2 amendment handled gates the v1 editor blocked). The amendment also lists the deviations above as E1-E4 for the reviewer to confirm or reject. The server behaviour they would check is covered by the API-level tests above.

## Deviations from the plan

- **Overlap uses the latest end so far**, not only the previous measured activity. It reports the same case the plan describes and also flags an activity that overlaps an earlier long one (08:00+180, 09:00+30, 09:30). Missing values still never produce an error.
- **The `try/catch` is narrower.** Only `loadInlineRenderResources` maps to 503 `RENDER_RESOURCES_UNAVAILABLE`; an exception inside `renderItineraryHtml` now surfaces as a server error instead of being reported as missing resources.
- **De-dupe** of diagnostics by code and path before localizing (needed because validator and renderer both report `PHOTO_ATTRIBUTION_REQUIRED`).
- Test 3 simulates a stale language context with `store.updateItinerary`, because `PATCH` rejects a mismatched context by design.

## Open questions

- `RENDER_RESOURCES_UNAVAILABLE`, `LOCALE_UNRESOLVED`, `ASSET_INVALID` and the `PUBLISH_*_CLAIM` codes are not in the plan's message table, so they keep their inline Indonesian messages. Say if they should join the table.
- An uncredited used photo is flagged by both the validator and the renderer. Because the renderer treats it as a render error, preview returns 422 with no HTML, while every other publish error returns 200 with HTML. This is unchanged from v1. A reviewer may prefer the 200 path with the diagnostic.
