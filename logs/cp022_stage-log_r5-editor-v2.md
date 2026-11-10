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
