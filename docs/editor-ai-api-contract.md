# Editor and AI API Contract (CP021–CP023)

API base is same-origin `/api/v1`; versioned canonical content is `web-2.0.0`. Existing `web-1.0.0` drafts are upgraded in place by migration 3 (backup by `VACUUM INTO` first, revision unchanged); every lossy change is reported as a warning or kept as a private note. The server selects one local workspace. No browser field may select or override workspace, revision, storage key, provider or model. Management writes require the configured local Origin and `X-Engine-Request: 1`; they are not public share endpoints.

## Error envelope

```json
{"error":{"code":"REVISION_CONFLICT","message":"The record changed since it was loaded.","fields":{"currentRevision":2},"requestId":"server-generated"}}
```

Do not expose stack traces, provider bodies, secrets, raw paths or foreign record metadata. Unknown and foreign IDs are both `404`.

## Implemented in CP021

| Method | Path | Behavior |
|---|---|---|
| GET | `/api/v1/itinerary-engine/context` | Server workspace/profile summary, current limits/capabilities and AI credential state. Never returns a credential value. |
| GET/PATCH | `/api/v1/itinerary-engine/profile` | Read or compare-and-swap profile using `expectedRevision`; profile fields are `agencyName`, `agencyContact`, `agencyLogoAssetId`. |
| GET/POST | `/api/v1/itineraries` | List workspace drafts / create an incomplete canonical draft. `POST` accepts `{mode}` or `{mode,draftContent,languageContext,writingContext}`. |
| GET/PATCH | `/api/v1/itineraries/{id}` | Read record / replace complete draft and metadata with `{expectedRevision,draftContent,languageContext,writingContext}`. Success increments revision atomically. |
| GET/POST | `/api/v1/assets` | List assets / upload one bounded raster image as multipart `image`. |
| GET | `/api/v1/assets/{id}` | Stream only an owned processed raster image by opaque ID; no filesystem path is returned. |
| GET | `/api/health` | Local readiness only. |

JSON body limit is 2 MiB; image input and processed output are limited to 5 MiB, formats JPEG/PNG/WebP, maximum 8,192 pixels per axis and 16 megapixels. Images are decoded, auto-rotated, re-encoded and stripped of metadata. Storage uses server-generated IDs. Draft save is whole-document optimistic concurrency, never JSON-path mutation. `409` does not overwrite the latest saved document.

Record metadata (`id`, workspace, revision, timestamps), `languageContext` (`{requestedLanguage,outputLanguage,source}`) and `writingContext` (`{brief,notes:[{targetId,text}]}`) are stored outside canonical `draftContent`. Profile defaults are copied when creating a draft and do not retroactively alter existing drafts. Blank canonical strings and repeaters are allowed on draft save; publish validation is outside CP021.

Draft lists are ordered by last update (newest first) with an opaque cursor; the response shape is `{items,nextCursor}`. Asset IDs in the draft/profile must refer to uploaded assets belonging to the server workspace; browser URLs/file paths are never fetched by the renderer.

## Added by CP022–CP023

CP022 uses these endpoints and adds no independent persistence source. CP023 adds:

| Method | Path | Request | Behavior |
|---|---|---|---|
| POST | `/api/v1/itineraries/{id}/language/resolve` | `{expectedRevision}` | Resolves saved brief/factual notes locally; returns a proposal/reason without changing the record or calling the provider. |
| POST | `/api/v1/itineraries/{id}/ai/overview` | `{operationId,expectedRevision}` | Proposes only the overview summary for a saved, resolved locale. |
| POST | `/api/v1/itineraries/{id}/ai/description` | `{operationId,expectedRevision,target:{kind:"activity"\|"place",id}}` | Proposes only the description for the stable ID and matching itinerary mode. |

AI endpoints use the server-configured `openai/gpt-6-luna`; clients cannot choose a provider/model, field path or arbitrary context. A completed replay returns the same target and text metadata as the initial response and sets `replayed:true`. Reusing an ID with different input returns `409 AI_OPERATION_CONFLICT`. A duplicate while the operation is running returns `202 {operationId,status:"running",retryAfterMs}`; clients may poll the exact same request/ID until bounded completion and must not start another operation. A suggestion never updates canonical content: the editor must explicitly Apply one field and then manually save the draft. Revision/target changes during generation return a stale-result error.

Default limits are 30 accepted operations per workspace/day, two new operations per minute, one in flight, a 16 KiB context limit and a 45-second timeout. Only definite retryable provider rejections are retried once; ambiguous dispatches remain charged/uncertain. A dispatched response with missing/invalid billing usage returns `503 PROVIDER_USAGE_UNKNOWN` and keeps its worst-case reservation committed; the same operation cannot redispatch. If valid token counts are available but provider cost is omitted, the engine estimates from the current catalog token prices (web search/tools are not sent); a reported nonnegative provider cost, including measured zero, is used directly. Credentials stay server-side. The opt-in live-test harness has a persistent US$2 total ceiling; see the implementation plan and `standalone-development.md` for verification commands.

## Added by CP024 — Draft Preview

| Method | Path | Request | Behavior |
|---|---|---|---|
| POST | `/api/v1/itineraries/{id}/preview` | `{expectedRevision}` | Renders only the server-saved revision with the CP020 renderer; returns `{itineraryId,revision,html,publishReady,errors,warnings,scheduleVerification}`; each diagnostic is `{code,path,message,targetId?}` where `targetId` is the activity ID, else the day ID, else the place ID, so the editor can focus the exact item after a reorder. No draft/artifact is persisted. Dirty/local payloads are not accepted. |

Stale revision returns `409 REVISION_CONFLICT`. Structurally invalid, unresolved-locale or unsafe-resource previews return a structured `422 PREVIEW_BLOCKED`; unavailable renderer resources return `503`. Publish-readiness diagnostics can be errors while safe HTML preview is returned. Ambiguous/missing schedule data is explicitly partial/warning; provable overlaps/cap violations are errors. Preview is displayed in a script-sandboxed iframe. Build the self-contained stylesheet with `npm run build:brochure-css` before previewing.

## Added by CP025 — Published Links and OG Preview

| Method | Path | Request | Behavior |
|---|---|---|---|
| POST | `/api/v1/itineraries/{id}/publish` | `{operationId,expectedRevision}` | Validates and atomically commits an immutable HTML/version snapshot; returns version and active share URL. Same operation ID replays its result; pending returns `202`. |
| GET | `/api/v1/itineraries/{id}/publication` | — | Owner status, current version, draft-diff indicator, epoch and active URL. |
| GET | `/api/v1/itineraries/{id}/versions` | optional `cursor`, `limit` | Owner-only published history metadata. |
| POST | `/api/v1/itineraries/{id}/unpublish` | `{expectedPublicationEpoch}` | Revokes current token; repeated revoke is idempotent; stale epoch returns `409`. |
| GET | `/i/{shareToken}` | — | Scriptless current published HTML for active token only. Unknown/revoked token returns `404`. |
| GET | `/i/{shareToken}/og-image` | — | Current version's bounded JPEG preview image for crawlers; unknown/revoked token returns `404`. |

Set `SHARE_ORIGIN` to the trusted absolute origin (scheme + host, no path) used in generated URLs; it is never derived from request headers. WhatsApp/Meta preview requires that origin and OG image be reachable over public HTTPS. Republish keeps an active URL and updates its current HTML/image, but external card caches may lag. Unpublish permanently retires the old token; publishing after revoke generates a different token.

## Added by CP036 — Place autocomplete

`POST /api/v1/places/autocomplete` with the same-origin write guard. Body `{ text (3-100 characters), sessionToken (UUID v4), languageCode? (id|en|fr|ja|zh-Hans|la|null) }`; unknown keys are rejected. `200 { suggestions: [{ placeId, mainText, secondaryText }] (max 5), remainingToday }`. Errors: `400 INVALID_REQUEST`; `503 PLACES_UNAVAILABLE` (no key); `429 PLACES_DAILY_LIMIT` (limit from `GOOGLE_PLACES_DAILY_LIMIT`, default 300 per UTC day, counted in `places_usage`, no provider call once reached); `502 PLACES_FAILED` (provider error or timeout, no upstream text and never the key). One request is counted before the provider call, so failed calls count too.

## Runtime

- `npm run dev:web-app`: Vite on `127.0.0.1:5173` with `/api` proxy to the engine.
- `npm run start:web-app`: Fastify on `127.0.0.1:3000` (loopback only); serves `dist/` if built.
- Data root: `ENGINE_DATA_DIR` (default `.runtime`); public origin is configuration, never request `Host`.
- Stop the engine before copying a backup. Restore the complete data root, not SQLite alone; it includes the database and matching assets.
