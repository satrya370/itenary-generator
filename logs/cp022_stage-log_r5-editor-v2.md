# CP022 Stage Log: R5 Editor for web-2.0.0

Executor: OpenCode. Date: 2026-11-05.

## Orientation (Step 0)

Status at handoff: commit 23d88e9 has partial R5.1 schema-meta.ts and R5.2 labels.ts. labels.ts is syntactically broken (v1 junk appended after v2 disclaimer line -> TS1005) despite the handoff note saying v2 labels are committed. No stage log existed yet. Editor main.tsx/model.ts/coverage.ts still v1.

### File map (R5/R6 will touch)

| File | R5/R6 change |
|---|---|
| src/editor/labels.ts | R5.2 rewrite v2-only + themeNames/modeCopy/statusCopy |
| src/editor/schema-meta.ts | R5.1 exists, review extractLimits against schema anyOf/ |
| src/editor/model.ts | R5.3 rewrite |
| src/editor/fields.tsx | R5.4 new shared controls |
| src/editor/EditorForm.tsx | R5.4 new pure form |
| src/editor/sections/*.tsx | R5.4 new sections |
| src/editor/main.tsx | R5.4 app shell only |
| src/editor/coverage.ts | R5.9 delete |
| tests/web/editor.test.ts | R5.9 rewrite |
| scripts/web/verify-editor.ts, verify-preview.ts, verify-publication.ts | R5.10 rewrite/adapt |
| scripts/web/verify-e2e.ts, verify-readiness.ts, verify-ai-ui.ts, verify-ai.ts, probe-publish-retry.ts, probe-recovery-scope.ts, probe-cp027-findings.ts, tests/web/cp027-fixtures.json | R6.1 port |
| docs/engine-runtime-contract.md, docs/editor-ai-api-contract.md, docs/standalone-development.md | R6.6 update |
| TODOS.md | R5/R6 gate lines only (do not tick R1-R6) |

### Off-limits (read per Step 0, do not edit)

config/web/**, config/palettes.json, src/contracts/**, src/server/**, src/render/**, src/api/client.ts, migrations, tests/web/{contracts,store-migration,api,ai,ai-api,ai-harness,ai-provider,render,preview,publication}.test.ts.

### API endpoints the editor calls (src/api/client.ts -> src/server/app.ts)

| Client | Route | Body / notes |
|---|---|---|
| api.context | GET /api/v1/itinerary-engine/context | workspace, capabilities |
| api.profile / saveProfile | GET/PATCH /api/v1/itinerary-engine/profile | {profile:{agencyName,agencyContact,agencyLogoAssetId}, expectedRevision} |
| api.list | GET /api/v1/itineraries?cursor,limit | {items, nextCursor} ordered updated_at DESC |
| api.create | POST /api/v1/itineraries | {mode} -> createBlankDraft v2 |
| api.get | GET /api/v1/itineraries/:id | RecordDto |
| api.save | PATCH /api/v1/itineraries/:id | {expectedRevision, draftContent, languageContext, writingContext} |
| api.preview | POST /api/v1/itineraries/:id/preview | {expectedRevision} -> {html, publishReady, errors/warnings {code,path,message,targetId?}} |
| api.publication / publish / unpublish / versions | /api/v1/itineraries/:id/publication, /publish {operationId,expectedRevision}, /unpublish, /versions | |
| api.assets / upload | GET/POST /api/v1/assets, GET /api/v1/assets/:id | |
| api.resolveLanguage | POST /api/v1/itineraries/:id/language/resolve | {expectedRevision} |
| api.aiPreflight / generateOverview / generateDescription | /api/v1/itinerary-engine/ai/preflight, /ai/overview, /ai/description {target:{kind:overview|activity|place, id}} | |

Draft shape (v2): %s. Diagnostic shape from preview.ts: {code, path, message, targetId?}; R4 kept index paths + targetId (PR-4).

### Registry paths per mode (generated from config/web/field-registry.json, not hand-typed)

#### half_day

| path | labelKey | control | requiredOnPublish |
|---|---|---|---|
| closingNote | closingNote | textarea | 0 |
| cover.assetId | heroPhoto | assetPicker | 0 |
| cover.credit.photographer | photographer | text | 0 |
| cover.credit.source | photoSource | text | 0 |
| cover.credit.url | photographerLink | url | 0 |
| days[].activities[].description | description | textarea | 1 |
| days[].activities[].durationMinutes | durationMinutes | number | 0 |
| days[].activities[].id | stableId | hidden | 1 |
| days[].activities[].kind | activityType | select | 1 |
| days[].activities[].place | placeName | text | 0 |
| days[].activities[].time | time | time | 0 |
| days[].activities[].tip | localTip | textarea | 0 |
| days[].activities[].title | activityTitle | text | 1 |
| days[].dayNumber | dayLabel | derived | 1 |
| days[].id | stableId | hidden | 1 |
| days[].location | location | text | 0 |
| days[].photo.assetId | heroPhoto | assetPicker | 0 |
| days[].photo.credit.photographer | photographer | text | 0 |
| days[].photo.credit.source | photoSource | text | 0 |
| days[].photo.credit.url | photographerLink | url | 0 |
| days[].title | dayTitle | text | 1 |
| disclaimer | disclaimer | textarea | 0 |
| emergencyContacts[].label | emergencyContact | text | 0 |
| emergencyContacts[].value | contactValue | text | 0 |
| guide.name | guideName | text | 0 |
| guide.phone | guidePhone | text | 0 |
| healthSafety[] | healthSafety | repeater | 0 |
| included[] | included | repeater | 0 |
| localTips[] | localTip | repeater | 0 |
| meeting.mapsUrl | mapsLink | url | 0 |
| meeting.note | meetingNote | textarea | 0 |
| meeting.place | meetingPoint | text | 0 |
| meeting.time | meetingTime | time | 0 |
| notIncluded[] | notIncluded | repeater | 0 |
| pickup.area | pickupArea | text | 0 |
| pickup.dropoffNote | dropoffNote | textarea | 0 |
| pickup.offered | pickup | toggle | 0 |
| pickup.time | pickupTime | time | 0 |
| policies | policies | textarea | 0 |
| schemaVersion | schemaVersion | hidden | 0 |
| summary | overviewSummary | textarea | 1 |
| trip.colorTheme | colorTheme | select | 0 |
| trip.country | country | text | 1 |
| trip.destination | destination | text | 1 |
| trip.endTime | endTime | time | 0 |
| trip.language | outputLanguage | localeSelect | 1 |
| trip.mode | itineraryMode | select | 1 |
| trip.region | region | text | 0 |
| trip.startDate | startDate | date | 0 |
| trip.startTime | startTime | time | 0 |
| trip.title | tripTitle | text | 1 |
| whatToBring[] | whatToBring | repeater | 0 |

#### full_day

| path | labelKey | control | requiredOnPublish |
|---|---|---|---|
| closingNote | closingNote | textarea | 0 |
| cover.assetId | heroPhoto | assetPicker | 0 |
| cover.credit.photographer | photographer | text | 0 |
| cover.credit.source | photoSource | text | 0 |
| cover.credit.url | photographerLink | url | 0 |
| days[].activities[].description | description | textarea | 1 |
| days[].activities[].durationMinutes | durationMinutes | number | 0 |
| days[].activities[].id | stableId | hidden | 1 |
| days[].activities[].kind | activityType | select | 1 |
| days[].activities[].place | placeName | text | 0 |
| days[].activities[].time | time | time | 0 |
| days[].activities[].tip | localTip | textarea | 0 |
| days[].activities[].title | activityTitle | text | 1 |
| days[].dayNumber | dayLabel | derived | 1 |
| days[].id | stableId | hidden | 1 |
| days[].location | location | text | 0 |
| days[].meals.breakfast | breakfast | toggle | 0 |
| days[].meals.dinner | dinner | toggle | 0 |
| days[].meals.lunch | lunch | toggle | 0 |
| days[].photo.assetId | heroPhoto | assetPicker | 0 |
| days[].photo.credit.photographer | photographer | text | 0 |
| days[].photo.credit.source | photoSource | text | 0 |
| days[].photo.credit.url | photographerLink | url | 0 |
| days[].title | dayTitle | text | 1 |
| disclaimer | disclaimer | textarea | 0 |
| emergencyContacts[].label | emergencyContact | text | 0 |
| emergencyContacts[].value | contactValue | text | 0 |
| guide.name | guideName | text | 0 |
| guide.phone | guidePhone | text | 0 |
| healthSafety[] | healthSafety | repeater | 0 |
| included[] | included | repeater | 0 |
| localTips[] | localTip | repeater | 0 |
| meeting.mapsUrl | mapsLink | url | 0 |
| meeting.note | meetingNote | textarea | 0 |
| meeting.place | meetingPoint | text | 0 |
| meeting.time | meetingTime | time | 0 |
| notIncluded[] | notIncluded | repeater | 0 |
| pickup.area | pickupArea | text | 0 |
| pickup.dropoffNote | dropoffNote | textarea | 0 |
| pickup.offered | pickup | toggle | 0 |
| pickup.time | pickupTime | time | 0 |
| policies | policies | textarea | 0 |
| schemaVersion | schemaVersion | hidden | 0 |
| summary | overviewSummary | textarea | 1 |
| trip.colorTheme | colorTheme | select | 0 |
| trip.country | country | text | 1 |
| trip.destination | destination | text | 1 |
| trip.endTime | endTime | time | 0 |
| trip.language | outputLanguage | localeSelect | 1 |
| trip.mode | itineraryMode | select | 1 |
| trip.region | region | text | 0 |
| trip.startDate | startDate | date | 0 |
| trip.startTime | startTime | time | 0 |
| trip.title | tripTitle | text | 1 |
| whatToBring[] | whatToBring | repeater | 0 |

#### multi_day

| path | labelKey | control | requiredOnPublish |
|---|---|---|---|
| closingNote | closingNote | textarea | 0 |
| cover.assetId | heroPhoto | assetPicker | 0 |
| cover.credit.photographer | photographer | text | 0 |
| cover.credit.source | photoSource | text | 0 |
| cover.credit.url | photographerLink | url | 0 |
| days[].activities[].description | description | textarea | 1 |
| days[].activities[].durationMinutes | durationMinutes | number | 0 |
| days[].activities[].id | stableId | hidden | 1 |
| days[].activities[].kind | activityType | select | 1 |
| days[].activities[].place | placeName | text | 0 |
| days[].activities[].time | time | time | 0 |
| days[].activities[].tip | localTip | textarea | 0 |
| days[].activities[].title | activityTitle | text | 1 |
| days[].dayNumber | dayLabel | derived | 1 |
| days[].hotel.area | area | text | 0 |
| days[].hotel.name | accommodationName | text | 0 |
| days[].hotel.note | accommodationNote | textarea | 0 |
| days[].id | stableId | hidden | 1 |
| days[].location | location | text | 0 |
| days[].meals.breakfast | breakfast | toggle | 0 |
| days[].meals.dinner | dinner | toggle | 0 |
| days[].meals.lunch | lunch | toggle | 0 |
| days[].photo.assetId | heroPhoto | assetPicker | 0 |
| days[].photo.credit.photographer | photographer | text | 0 |
| days[].photo.credit.source | photoSource | text | 0 |
| days[].photo.credit.url | photographerLink | url | 0 |
| days[].title | dayTitle | text | 1 |
| days[].transferNote | transferNote | textarea | 0 |
| disclaimer | disclaimer | textarea | 0 |
| emergencyContacts[].label | emergencyContact | text | 0 |
| emergencyContacts[].value | contactValue | text | 0 |
| guide.name | guideName | text | 0 |
| guide.phone | guidePhone | text | 0 |
| healthSafety[] | healthSafety | repeater | 0 |
| included[] | included | repeater | 0 |
| localTips[] | localTip | repeater | 0 |
| meeting.mapsUrl | mapsLink | url | 0 |
| meeting.note | meetingNote | textarea | 0 |
| meeting.place | meetingPoint | text | 0 |
| meeting.time | meetingTime | time | 0 |
| notIncluded[] | notIncluded | repeater | 0 |
| pickup.area | pickupArea | text | 0 |
| pickup.dropoffNote | dropoffNote | textarea | 0 |
| pickup.offered | pickup | toggle | 0 |
| pickup.time | pickupTime | time | 0 |
| policies | policies | textarea | 0 |
| schemaVersion | schemaVersion | hidden | 0 |
| summary | overviewSummary | textarea | 1 |
| trip.colorTheme | colorTheme | select | 0 |
| trip.country | country | text | 1 |
| trip.destination | destination | text | 1 |
| trip.language | outputLanguage | localeSelect | 1 |
| trip.mode | itineraryMode | select | 1 |
| trip.region | region | text | 0 |
| trip.startDate | startDate | date | 0 |
| trip.title | tripTitle | text | 1 |
| whatToBring[] | whatToBring | repeater | 0 |

#### destination_guide

| path | labelKey | control | requiredOnPublish |
|---|---|---|---|
| closingNote | closingNote | textarea | 0 |
| cover.assetId | heroPhoto | assetPicker | 0 |
| cover.credit.photographer | photographer | text | 0 |
| cover.credit.source | photoSource | text | 0 |
| cover.credit.url | photographerLink | url | 0 |
| disclaimer | disclaimer | textarea | 0 |
| emergencyContacts[].label | emergencyContact | text | 0 |
| emergencyContacts[].value | contactValue | text | 0 |
| guide.name | guideName | text | 0 |
| guide.phone | guidePhone | text | 0 |
| healthSafety[] | healthSafety | repeater | 0 |
| included[] | included | repeater | 0 |
| localTips[] | localTip | repeater | 0 |
| notIncluded[] | notIncluded | repeater | 0 |
| places[].area | area | text | 1 |
| places[].bestTime | bestTime | text | 0 |
| places[].description | description | textarea | 1 |
| places[].gettingThere | gettingThere | textarea | 0 |
| places[].group | placeGroup | text | 0 |
| places[].id | stableId | hidden | 1 |
| places[].name | placeName | text | 1 |
| places[].nearby | nearby | text | 0 |
| places[].photo.assetId | heroPhoto | assetPicker | 0 |
| places[].photo.credit.photographer | photographer | text | 0 |
| places[].photo.credit.source | photoSource | text | 0 |
| places[].photo.credit.url | photographerLink | url | 0 |
| places[].suggestedDuration | suggestedDuration | text | 0 |
| places[].tips[] | localTip | repeater | 0 |
| policies | policies | textarea | 0 |
| schemaVersion | schemaVersion | hidden | 0 |
| summary | overviewSummary | textarea | 1 |
| trip.colorTheme | colorTheme | select | 0 |
| trip.country | country | text | 1 |
| trip.destination | destination | text | 1 |
| trip.language | outputLanguage | localeSelect | 1 |
| trip.mode | itineraryMode | select | 1 |
| trip.region | region | text | 0 |
| trip.title | tripTitle | text | 1 |
| whatToBring[] | whatToBring | repeater | 0 |

### Baseline (Step 0, 2026-11-05)

Expected from plan vs observed (all match for tests/server):

- `npm run test:web-contracts` — 42 pass / 0 fail (exp 42)
- `npm run test:web-store` — 11 pass / 0 fail (exp 11)
- `npm run test:web-api` — 12 pass / 0 fail (exp 12)
- `npm run test:web-ai` — 28 pass / 0 fail (exp 28)
- `npm run test:web-render` — 14 pass / 0 fail (exp 14)
- `npm run test:web-preview` — 12 pass / 0 fail (exp 12)
- `npm run test:web-publication` — 12 pass / 0 fail (exp 12)
- `npm run test:web-editor` — 3 pass / 5 fail (exp 3/5; v1 tests on v2 fixtures)
- `npm run typecheck:web-server` — 0 errors, 1 outside scope ignored (exp 0)
- `npm run check:web-types` — matches (exp matches)
- `npx tsc --noEmit -p tsconfig.app.json` — DIFFERS: 1 error `src/editor/labels.ts(57,3): error TS1005` (exp 134). The partial R5.2 labels.ts at 23d88e9 is syntactically broken — count 134 is moot. This is R5 work-in-progress inside R5 scope (src/editor/), not off-limits code. Proceeding with R5 (fix labels.ts); no off-limits file is implicated.

Open questions for reviewer (non-blocking):

- Plan says app typecheck counts include `verify-ai.ts` 14 errors — `verify-ai.ts` is R6 scope; R5 gate uses scoped check per plan. Confirmed tsconfig.app.json includes verify-ai.ts and verify-editor.ts.
- `schema-meta.ts` at 23d88e9: `templatePath` replaces [].id — verify against registry; `extractLimits` needs schema walking incl. anyOf/$ref. Will review in R5.1 step.
- AGENTS.md was absent; created it at repo root and will keep untracked (do not commit).

---

## R5 completion (plan section H1-H9), 2026-11-10

Executor: Claude Sonnet 5.5 (the owner switched models; the plan was written for Haiku). Starting point: OpenCode WIP, snapshot commit `407c0c5`; review in `logs/cp022_review-log_r5-editor-wip.md`.

### What changed

- H2 `schema-meta.ts`: S1 type error fixed, `MAX_PLACES = 60` added (PR-15).
- H3 `labels.ts` (L1 straight quotes, `noPhoto`), `model.ts` rewritten: M1 no validator call in `changeMode`, M2 `ensureMeals`, M3 `setPhotoCredit(null)` returns `null`, M4/M5 `hasModeLoss` rewritten, M6 `normalizeBlanks` (used by `save()`).
- H4 `sections/TripInfo.tsx` split into `EditorForm.tsx` + 15 files in `sections/` (incl. `Profile.tsx`) (code moved, not rewritten); `PhotoField`/`LocaleField` moved to `fields.tsx`, `ObjectList` deleted. Fixes F1-F8 applied.
- H5 `main.tsx` rewritten (398 lines): orchestration kept from the v1 file; all v1 field code removed; `focusDiagnostic` per plan; new `sections/Profile.tsx`; `coverage.ts` deleted; no `any`.
- H6 `tsconfig.web.json`: `"jsx": "react-jsx"`.
- H7 `tests/web/editor.test.ts` rewritten (25 tests). H8 `verify-editor.ts` rewritten; `verify-preview.ts` and `verify-publication.ts` selectors only.

### Gate (all run in this session, after `npm run build:web-app`)

| # | Command | Result |
|---|---|---|
| 1 | `npm run build:brochure-css && npm run build:web-app` | success |
| 2 | `typecheck-scope tsconfig.app.json src scripts/web/verify-editor.ts` | 0 errors |
| 3 | `typecheck-scope tsconfig.web.json src/editor tests/web/editor.test.ts scripts/web/verify-{editor,preview,publication}.ts` | 0 errors |
| 4 | `npm run test:web-editor` | 25 pass, 0 fail |
| 5 | `verify:web-editor`, `verify:web-preview`, `verify:web-publication` | exit 0 each (0 console errors, 0 external requests) |
| 6 | contracts / store / api / ai / render / preview / publication | 42 / 11 / 12 / 28 / 14 / 12 / 12 pass, 0 fail |
| 7 | `typecheck:web-server`, `check:web-types`, `verify:web-render` | 0 errors / matches / exit 0 |
| 8 | grep v1 names in `src/editor` | no output |
| 9 | grep `@ts-*`, `as any`, `: any`, `<any>` in `src/editor`, `tests/web/editor.test.ts` | no output |
| 10 | `git diff --stat 8dd31c3 -- config src/contracts src/server src/render src/api package.json` | no output |
| 11 | `ls src/editor/coverage.ts` | No such file |

### H7 mutation check

- Removed `data-field-path` from `TextField`: test 1 failed in all 4 modes (21 pass / 4 fail). Restored.
- Made `changeMode` keep `places` for half/full: test 4 failed for guide -> half_day and guide -> full_day (23 pass / 2 fail). Restored; 25/25 again.

### Screenshots (`output/web-editor/r5-<mode>-{390,1280}.png`)

Opened: all four 1280 shots, and cropped slices of the multi_day and destination_guide 390 shots. The half_day and full_day 390 shots were only checked by the automated no-overflow assertion and a thumbnail glance (too tall to read in full).

- `half_day-1280`: sections Informasi trip, Waktu & titik kumpul, Guide trip, Foto sampul, Ringkasan, Jadwal (2 activities, reordered), Info praktis, Ketentuan & penutup, Bantuan AI collapsed; amber badge; Indonesian labels; no hotel/meals.
- `full_day-1280`: same plus Sarapan/Makan siang/Makan malam toggles; teal badge; the language help text and "Deteksi otomatis" show because the language is unresolved.
- `multi_day-1280`: "Hari demi hari" with day cards (hotel, transfer note, meals, activities), move/remove buttons disabled at the ends; indigo badge.
- `destination_guide-1280`: no time/meeting section; "Tempat" with the group heading "Eastern Kyoto" above the card, "Detail tambahan" collapsed; cover photo with credit fields; rose badge.
- `multi_day-390`, `destination_guide-390` (slices): single column, header with badge, theme swatches wrap, no horizontal overflow.

### Deviations and notes

- Day move/remove buttons are hidden for half/full day (only one day), via a `showDayControls` prop; the plan only said "disabled at the ends".
- `verify-editor.ts` keeps the older checks (409 conflict flow, asset upload, unsupported-locale note, list delete with cancel/confirm, writing notes) in addition to the H8 scenarios.
- Named inner functions inside `page.evaluate` break under tsx (`__name is not defined`); the bulk write in the 60-place scenario uses an array loop instead.
- `build:brochure-css` output is 27989 bytes (R3 log: 27263); `.runtime/` is gitignored, not investigated.

### Open questions for the reviewer

- R1-S1: `config/web/itinerary.schema.json` has no `places.maxItems`; the editor limits to 60 with a constant.
- The unsupported-language note "Katalog/font render untuk zh-Hant belum tersedia; tidak akan fallback diam-diam." is developer-style wording, kept from v1 (not in the plain-language table).
- Time inputs show 12-hour format in this Chromium locale; the stored value is `HH:MM`.
