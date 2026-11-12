# SI1 Stage Log: mode Activity (web-2.2.0)

Executor: Claude Haiku 5.5 (inline). Date: 2026-11-12. Plan: `plans/si_plan_site-integration-private-and-driver-urls.md` §4. Status: **working, awaiting review.** Not marked done.

## Built

| Area | Change |
|---|---|
| Schema | `config/web/itinerary.schema.json`: schema `web-2.2.0`, `trip.mode` gains `activity`, new `activity` block (nullable) with `$defs/activityMode`. Types regenerated (`itinerary.generated.d.ts`, `check:web-types` passes). |
| Contract helpers | `src/contracts/activity.ts`: `blankActivityMode`, `hasActivityContent`. |
| Validator | `SCHEDULED_MODES` explicit list (`half_day`, `full_day`, `multi_day`) replaces `mode !== 'destination_guide'`. Activity: days and places not applicable, activity block required in its own mode and refused elsewhere, `trip.startTime/endTime` refused, publish needs `activity.category` and `activity.durationMinutes`. `web-2.1.0` reads as `web-2.2.0` with `activity: null` (no data migration needed). |
| Registry | 14 `activity.*` entries; `meeting.*`, `pickup.*`, `trip.startDate` now list their modes explicitly (activity included). `registryVersion` 2.2.0. |
| Labels | 22 keys in all 6 locales (`config/web/locales/*.json`), `displayLabelKeys` extended, `modeCopy.activity`. |
| Drafts | `createBlankDraft`, `newDraftBase` create `activity` blank for activity mode; upgrade v1 writes 2.2.0. |
| Editor | `changeMode` and `hasModeLoss` handle activity (days/places cleared; "detail aktivitas" reported when leaving). `ActivityDetails` section in the plan step; `schema-meta` uses `isScheduledMode`. Errors on `activity.*` map to the plan step. |
| Create flow | Five type cards (from `modeCopy`). For Activity, paste and PDF are disabled with a note; manual only. |
| Server | API accepts mode `activity`. Import refuses activity (`IMPORT_MODE_UNSUPPORTED`, 422). AI overview receives activity facts; generate prompt forbids age, weight, health, safety and insurance claims not present in the context. |
| Render | Activity body: facts (category, duration, sessions, level, ages, weight, guide languages), highlights, steps. No day schedule. Category and level words in `en` and `id`, English fallback. |
| Tests | `tests/web/activity-mode.test.ts` (8 tests: blank draft, publish rules, not-applicable fields, missing block, schema bounds, 2.1.0 normalization, mode-switch losses, render in en and id). Existing tests updated from `web-2.1.0` to `web-2.2.0` where they assert the current version. `editor.test.ts` gets `ALL_MODES` for registry coverage. |
| Browser | `verify:web-editor` creates an activity draft, checks the activity-details field and that no day fields are shown, and saves. |

## Gate (so far)

- Typecheck app, server, contracts: pass (`verify-autosave.ts` and `verify-mobile-redesign.ts` have typecheck errors that already exist in HEAD `981b277`; not changed here).
- Unit: contracts 51, store 12, editor 33, render 14, api 13, publication 12, preview 12, ai 28, import 47, places 16. All pass.
- Browser and release gates: see the final report for this turn.

## Deviations and gaps (for review)

1. ~~Import of activity not built~~ **Done (follow-up pass, 2026-11-12).** See "Follow-up: import and pickers" below.
2. ~~Session times and highlights use the generic list editor~~ **Done.** `SessionTimes` (quick pagi/siang/sore, native time input per session, sorted on blur) and `HighlightList` (counters per line and per list).
3. **Steps have no drag reorder**, only move up and remove.
4. **Activity render layout is a single shared block**, not the per-template variants from plan §8 (SI5). Templates come later.
5. **Publish flow for activity is covered only by unit tests** (validator and render), not by a browser publish test.
6. **Translations of the 22 new labels** are mine. The `fr`, `ja`, `zh-Hans`, `la` strings need a native check.
7. **`activity` mode in the overwrite import path** is refused at the apply step; the report panel does not show a special message.
8. **`web-2.1.0` migration is read-time only.** Stored drafts are rewritten to 2.2.0 on their next save. No data migration was written.

## Follow-up: import and pickers (2026-11-12)

- **Import for Activity.** Parser reads the facts by code (`parse/activity.ts`); `Highlights` and `Jalannya kegiatan` are activity-only headings; AI may add `highlights` and `steps` (whole-line quotes, no minutes) and never replaces a list the code read. New draft, overwrite, and over-long values are covered. Details in `docs/import-api-cp030-cp032.md`.
- **Bug found by the tests.** `newDraftBase` still created one empty day for activity, so every activity import was refused (`days`). Fixed.
- **Create flow.** Paste and PDF are enabled again for Activity.
- **Pickers.** Session times and highlights have their own editors.
- **Tests added.** Parser 5, apply 5, browser: `verify:web-editor` (session picker, highlight counter, saved order) and `verify:web-create` (activity text import fills the editor, no day fields).

## Pre-existing failures, not caused by SI1

`verify:web-places` ("step not found: Jadwal") and `verify:web-e2e` (preview step times out) fail on a clean checkout of HEAD `981b277` too (checked in a temporary worktree, removed afterwards). The editor was restructured to four steps in that commit and these two scripts were not updated. They need their own fix.
