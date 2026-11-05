# CP020 Stage Log: R3 Renderer for web-2.0.0

Executor: Claude Sonnet 5.5 (audit and revision of the earlier Haiku submission, commits 4a37008 and f0185da). Date: 2026-11-05.

## Why this is a revision

The earlier R3 submission passed its own tests but did not match the R3.2/R3.4/R3.5 plan. The audit found and this revision fixed:

| # | Finding | Fix |
|---|---|---|
| 1 | `catalogCapabilityError` was deleted. A mismatched or incomplete catalog was not rejected. | Restored, paths now `trip.language`. |
| 2 | `isCompletePhotoCredit` required `source`; the plan says `source` may be empty. | Only `photographer` is mandatory; Unsplash/Pexels still require an https `url`. |
| 3 | Hotel box was dropped when the name was empty; the plan shows `area · note` without the name. | Box shows when any of name/area/note is non-empty; name only when non-blank. |
| 4 | half_day and full_day printed hotel/transfer/meals if the data had them. | half: none; full: meals only; multi: meals, hotel, transfer. |
| 5 | Schedule heading used the mode label instead of `itinerary`; multi-day header had no date. | Fixed; header is `Day N · <date>` when `startDate` is set. |
| 6 | Policies were rendered inside the closing footer. | Own `data-section="policies"` section with `whitespace-pre-line`. |
| 7 | Only some blocks had `data-section`. | hero, trip-info, summary, route, schedule, guide, practical, policies, closing. |
| 8 | Empty agency name and no logo left an empty element in the hero. | Element omitted. |
| 9 | Maps link used the raw URL instead of the normalised https URL. | Uses the normalised href. |
| 10 | `trip-info` had no CSS (single unstyled column touching the hero). | Card, 2 columns on phone, 4 on desktop. Dead `.facts` rules removed. |
| 11 | Closing order put credits after the date line. | heading, note, contact, disclaimer, credits, created-on. |
| 12 | `render.test.ts` had weak assertions (many only `errors.length === 0`). | Rewritten: 14 tests covering the 13 required cases with content assertions. |
| 13 | `render-fixture.ts` dropped the old checks and wrote no screenshots. | Ported with all old checks; new per-mode rows and screenshots. |

## Commands

| Command | Result |
|---|---|
| `npm run build:brochure-css` | OK, 27263 bytes |
| `npm run test:web-render` | 14/14 pass |
| `npm run verify:web-render` | exit 0, 13 fixtures, 0 failures |
| `node scripts/web/typecheck-scope.mjs tsconfig.app.json src/render` | 0 errors |
| `npm run typecheck:web-server` | 0 errors (still excludes preview.ts until R4) |
| `npm run typecheck:web-contracts-v2` | 0 errors |
| `test:web-contracts` / `store` / `api` / `ai` / `publication` | 42 / 11 / 12 / 28 / 11 pass, 0 fail |
| `test:web-editor` | 3 pass, 5 fail (expected, R5) |

`verify:web-render` rows: six language samples as full_day (la, fr, en, id, ja, zh-Hans), half-day-en, multi-day-en, guide-en (each with cover, day or place photo, credits, agency logo), multi-day-14-en (14 days, 42 activities, empty hotel names on odd days), guide-many-en (60 places, 60 interleaved group headings), guide-ja, guide-zh-Hans. Checks kept: fonts inlined, font licence notice, HTML size, no external requests, no console errors, mobile/desktop overflow, broken images, glyph/tofu check, locale font loaded, PDF validity, print day-index wrap. New checks: photo markup counts, photo credit present, logo presence, `data-section` presence, localized 90-minute duration text, nameless hotel boxes.

## Screenshots (opened and inspected)

All in `output/web-foundation/`.

- `r3-half_day-390.png`: no horizontal overflow; trip-info card wraps to two columns; single timeline readable; no meals/hotel/transfer.
- `r3-half_day-1280.png`: four-column info card sits below the hero; day photo, timeline and practical cards aligned.
- `r3-full_day-390.png`: route chips, timeline with durations (`1 hr 30 min`), meals line, policies and closing readable.
- `r3-full_day-1280.png`: same content in wide layout; practical cards in two columns.
- `r3-multi_day-390.png`: day chips, `Day N · date` headers, hotel box with name, transfer note; Day 3 shows `Sidemen · Quiet valley stay.` with no empty name.
- `r3-multi_day-1280.png`: three day cards, end date `Dec 3, 2026` in the info card, route chips `Ubud`, `Sidemen`.
- `r3-destination_guide-390.png`: group headings repeat; only present optional fields shown; no schedule section.
- `r3-destination_guide-1280.png`: place cards occupy the left half because each group in this fixture has one place. That is a data property of the fixture; cards sit two per row when a group has two or more places.

The `ja` and `zh-Hans` glyph check is automated (no notdef boxes, locale font face loaded); those rows are not in the eight screenshots.

## Deviations from the plan

- `render-fixture.ts` also keeps the `guide-ja` and `guide-zh-Hans` rows from the old script (cheap, they exercise CJK in guide mode). Not required by the plan.
- Desktop screenshots in the verify output are 1280 wide (was 1440) so they match the plan.
- Expected localized duration in the verify script is computed with `Intl.NumberFormat` in the script itself (independent of `render.ts`), because the plan fixes expected strings only for `en`.

## Open questions

- Hero shows `destination · region · country`; the language samples use the same value for destination and region, so Kyoto appears twice in the fixture. Data issue, not a renderer one.
- The scope pill and the eyebrow both show the mode (for example `Half day` twice) as the plan specifies. A reviewer may prefer to drop one.
