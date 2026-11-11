# CP036 Stage Log: Google Places autocomplete (fixes 8, 9)

Executor: Claude Haiku 5.5 (via Claude Code). Date: 2026-11-11. Base: `d1f4696` (review of CP033-CP035). Plan: `plans/cp033-cp036_implementation-plan_editor-usability-setup-and-places.md`, section CP036 steps 1-8.

## What was built

| Plan step | Result |
|---|---|
| 1 Config | `GOOGLE_PLACES_API_KEY` (server only) and `GOOGLE_PLACES_DAILY_LIMIT` (default 300, 0-5000, via `envLimit`). Both were already listed in `.env.web.example` from CP033. |
| 2 Provider | `src/server/places/provider.ts`: `PlacesProvider` interface; `GooglePlacesProvider` posts to `places.googleapis.com/v1/places:autocomplete` with `X-Goog-Api-Key` in a header, the required field mask, a 5 s timeout, and maps only `placePrediction` items (max 5). The key is never in the body or a response. |
| 3 Usage counter | Migration 5 (`places_usage(day, count)`) in `src/server/store.ts`. One reservation per Google request, per UTC day, taken before the call, so a failed call still counts (conservative). |
| 4 Route | `POST /api/v1/places/autocomplete` in `src/server/app.ts`, behind the same origin and `x-engine-request` guard as other POSTs. 400 for invalid input, 503 `PLACES_UNAVAILABLE` without a key, 429 `PLACES_DAILY_LIMIT` at the limit (no provider call), 502 `PLACES_FAILED` on provider error. `createApp` accepts `placesProvider` and `placesDailyLimit` for tests. |
| 5 Editor | `src/editor/fields/PlaceAutocomplete.tsx`: ARIA combobox (`role=combobox`, `aria-expanded`, `aria-controls`, `aria-activedescendant`, listbox with options). 300 ms debounce, minimum 3 characters, one session token per focus-to-pick, ArrowUp/Down, Enter, Escape. The input stays free text. Stale responses are ignored. A 503 disables search for the session. |
| 6 Use | `days[].activities[].place` and `meeting.place`. Picking a meeting place also fills `meeting.mapsUrl` with `https://www.google.com/maps/search/?api=1&query=...&query_place_id=...` (PD-1). The Maps link stays editable. |
| 7 Tests | `tests/web/places.test.ts` (10 tests: valid search, validation, 503 without key, 429 limit with no provider call and per-day count, zero limit, 502 without leaking the key, key not in responses, Google header/field mask/body, HTTP error and missing key, language mapping and parsing). Editor test 5i (Maps URL, language mapping, combobox markup). `scripts/web/verify-places.ts` with a provider double. |
| 8 Gate | See below. |

## Decisions and deviations (please review)

1. **Google logo not added.** The plan says that if the official "Powered by Google" logo cannot be obtained, stop and ask. I did not obtain it. The dropdown shows the text "Powered by Google" inside the list box instead, as a placeholder. Google's display rules ask for the logo image when Places results appear without a Google map, so the owner must decide: supply the official asset under `src/editor/assets/`, or accept the text form. **Open.**
2. `package.json`: besides the `verify:web-places` script the plan asks for, I added `test:web-places` so the unit suite runs with the other `test:web-*` suites.
3. Zero daily limit: `INSERT ... ON CONFLICT ... WHERE count < ?` only guards the conflict branch, so a zero limit inserted a row. The test caught this; the code now refuses in JavaScript before reserving.
4. Language for Google: `zh-Hans` is sent as `zh-CN`; `la` (Latin) is not sent, because Google has no matching tag. `id`, `en`, `fr`, `ja` are sent as they are.
5. The usage counter counts a request before the call, so a failed call still uses one of the 300. This is deliberately conservative.
6. Migration 5 adds a table only; no draft data changes. `store-migration.test.ts` now expects versions `[1, 2, 3, 4, 5]` (three assertions and one more in the second case).
7. The editor test's `FieldMeta` fixture and the Places test's `TestContext` are typed (no `any`, no casts beyond one read-only view of `places_usage` in the test).
8. Not run: the owner-only live check (a real key in `.env.web`, one manual search per field). It is not part of the gate and costs nothing in the local gate, but it has not happened.

## Gate (2026-11-11)

Commands and results (all exit 0 unless noted):

- `typecheck:web-app`, `typecheck:web-contracts`, `typecheck:web-contracts-v2`, `typecheck:web-server`, `check:web-types`: 0.
- Unit suites: contracts 43, api 13, store 12, ai 28, render 14, editor 33, preview 12, publication 12, places 10: all pass, 0 fail.
- `build:web-app` then `verify:web-editor`, `verify:web-preview`, `verify:web-publication`, `verify:web-ai-ui`, `verify:web-e2e`, `verify:web-publish-retry`, `verify:web-render`: all 0.
- `verify:web-places`: 0. Summary: `calls 4`, `dailyLimit 4`, `externalRequests 0`, `consoleErrors 0`; keyboard pick, cap message, free text kept, saved draft contains the picked place and the Maps link with `query_place_id`.
- `build:web-release` and `validate:web-release`: valid, 41 files.
- Screenshots: `output/web-places/cp036-dropdown-390.png` and `cp036-dropdown-1280.png` (list open, both checked by eye; the "Powered by Google" line sits inside the box).

Problems found and fixed during the run:
- First `verify:web-places` run: the browser loaded the old `dist/` bundle (no combobox). Fixed by `build:web-app` (the gate always rebuilds first).
- The combobox assertion read the first combobox in the DOM (meeting point, not the activity). Fixed by selecting the activity field's `data-field-path`.
- The attribution line was hidden behind the list. Moved into the list box.
- Typecheck of tests: `app.store` not on `FastifyInstance`, and a `: any` in the test. Both fixed.

## Still open

- Google logo / attribution decision (deviation 1).
- Owner-only live check with a real key.
- CP036 review (this log is the executor's record; review comes next).
- CP030 import chapter still needs its plan revised to `web-2.1.0` before it starts.

## Review fixes (2026-11-11)

Reviewer changes after the executor's gate (details in `logs/cp036_review-log.md`): the 503/429 explanation note no longer disappears; the editor stops searching after the daily cap is reported and for queries over 100 characters; docs for the key, cap and route added; two server tests and two browser assertions added. Places suite 12 tests; all gates re-run green.

## Provider change: Photon (OpenStreetMap) by default, Google optional (2026-11-11)

The owner does not want to give a credit card to Google Cloud, so the default provider is now Photon (`photon.komoot.io`, OpenStreetMap data, no key, no account). Google stays in the code behind `PLACES_PROVIDER=google` (needs billing and `GOOGLE_PLACES_API_KEY`); `PLACES_PROVIDER=off` keeps the fields plain text.

- Server: `PhotonPlacesProvider`, `createPlacesProvider(env)`, `defaultDailyLimit` (1000 for Photon, 300 for Google), env `PLACES_DAILY_LIMIT` (replaces `GOOGLE_PLACES_DAILY_LIMIT`). The response now carries `source` (`osm` or `google`). 503 and 502 messages are provider-neutral.
- Photon facts checked against the live service before coding: `lang` accepts only `en` and `fr` (`id`, `ja` give HTTP 400, so other languages are not sent); `osm_tag=!highway` removes bus stops and roads; the same OSM object can appear twice (parser drops repeats by OSM ID and by name plus area); the public service is fair-use with no guarantee (docs recommend self-hosting for heavy use).
- Editor: attribution follows the source ("© OpenStreetMap contributors" linked to the OSM copyright page, or "Powered by Google"). The meeting Maps link is a plain Google Maps search link (`query=name, area`); only Google suggestions add `query_place_id`.
- Tests: `tests/web/places-sources.test.ts` (Photon parsing, provider request shape, provider choice, route source and 503 when off); `verify:web-places` now runs once per source; opt-in `scripts/web/verify-places-live.ts` hits the real Photon through the real route (passed: Ubud, Tanah Lot, Kiyomizu with Japanese names, Kuta Beach; all `source: osm`, no repeated places).
- The Google logo question only matters if `PLACES_PROVIDER=google` is chosen.

Known limits (owner should know): results are worldwide with no location bias, so a vague name such as "kuta beach" without a language can list a place in Italy before Bali. A bias from the trip's country or destination is a possible follow-up (needs a hint field in the request). The public Photon service can throttle or change without notice.
