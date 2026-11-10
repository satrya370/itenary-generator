# Standalone Engine Runtime and API Contract

**Status:** CP018 base contract, extended by CP024–CP025 decisions 2026-10-07.
**API version:** `/api/v1`.

## Runtime ownership and defaults

- Node.js 24+, TypeScript, Fastify 5, React + Vite, Tailwind CSS v4.
- API binds to `127.0.0.1:3000`; Vite dev binds to `127.0.0.1:5173` and proxies `/api` to the engine origin. Public share origin is a separately configured value, never inferred from request headers.
- One server-selected workspace. No browser-provided workspace/tenant ID is trusted.
- SQLite through `node:sqlite`; data defaults to `.runtime/engine.sqlite`, `.runtime/assets/`, `.runtime/published/`, and `.runtime/tmp/` under the server-configured data root. There is no product PDF store/worker.
- Default editor/API host is loopback (`127.0.0.1`). Public share links are a separate route family.
- AI provider: OpenRouter. Target model ID: `openai/gpt-6-luna`.
- Local secret priority: injected `OPENROUTER_API_KEY`, then optional `OPENROUTER_CREDENTIAL_FILE`; production must use a deployment secret store/injection.
- Renderer is an internal Node module/worker, not a public endpoint or a separately deployed microservice.

## Browser → engine

All management endpoints are same-origin and workspace-scoped. Final request schemas are versioned in CP019.

| Method and path | Operation | Planned status/error behavior |
|---|---|---|
| `GET /api/v1/itinerary-engine/context` | Workspace defaults, capabilities, selected model label, runtime limits. Never return credentials. | `200`; no key value in any field. |
| `GET/PATCH /api/v1/itinerary-engine/profile` | Read/update single workspace profile. | `404`, `422`, `409`. |
| `POST /api/v1/assets` | Validated workspace asset upload. | `413` size; `415` MIME; `422` unsafe content. |
| `GET/POST /api/v1/itineraries` | List/create draft. | `401/403` when editor boundary is enabled; `422` invalid draft. |
| `GET/PATCH /api/v1/itineraries/{id}` | Read/update draft with expected revision. | `404`; `409` revision conflict with current revision only. |
| `POST /api/v1/itineraries/{id}/ai/overview` | Request overview suggestion. | Implemented in CP023; never sends credentials to browser. |
| `POST /api/v1/itineraries/{id}/ai/description` | Request one stable activity/place description target. | Implemented in CP023; never changes unrelated fields. |
| `POST /api/v1/itineraries/{id}/preview` | Render safe saved revision and return separate publish diagnostics. | `409` stale revision; `422` render-safety failure; `503` renderer unavailable. |
| `POST /api/v1/itineraries/{id}/publish` | Publish an eligible saved revision atomically/idempotently. | `409` stale/conflicting operation; `422` publish validation; `503` render/storage failure. |
| `GET /api/v1/itineraries/{id}/publication` | Owner publication state and active share URL. | Workspace-scoped owner metadata. |
| `GET /api/v1/itineraries/{id}/versions` | Owner-only immutable HTML version history. | Workspace-scoped, paginated metadata only. |
| `POST /api/v1/itineraries/{id}/unpublish` | Permanently revoke active bearer token. | Epoch-checked; repeated revoke is idempotent. |
| `GET /i/{shareToken}` | Public, `noindex` current published HTML with Open Graph tags. | `404` for absent/revoked token; never draft. |
| `GET /i/{shareToken}/og-image` | Current version's bounded social-preview image. | `404` for absent/revoked token. |

## Error envelope

```json
{
  "error": {
    "code": "REVISION_CONFLICT",
    "message": "The itinerary changed since it was loaded.",
    "fields": {},
    "requestId": "server-generated-id"
  }
}
```

Stable codes include `LANGUAGE_UNRESOLVED`, `LOCALE_UNSUPPORTED`, `INVALID_DOCUMENT`, `REVISION_CONFLICT`, `ASSET_INVALID`, `PROVIDER_UNAVAILABLE`, and `RENDER_FAILED`. Production errors do not include stack traces, secrets, raw provider bodies, filesystem paths, or client-controlled hostnames.

## Canonical document seam

`config/web/itinerary.schema.json` is the canonical Draft 2020-12 `web-2.0.0` schema (the old schema stays as `itinerary.schema.v1.json` only for the one-way `upgradeV1ToV2` migration); `config/web/field-registry.json` maps every leaf to a control, the modes it applies to and whether it is required to publish. The editor renders from the registry and the schema limits. Generated TypeScript declarations are checked against the schema. The v2 n8n schema remains separate. Execution wrapper, recipient email, provider credentials, verifiedVenueSet, tenant billing, and server paths are not itinerary content. The agency name, contact and logo are not part of the draft: they come from the workspace profile at render time. `trip.language` is an extensible BCP 47 tag that must equal `languageContext.outputLanguage` on save; schema validation and render capability validation are separate.

Content shape (`web-2.0.0`): `schemaVersion`; `trip` (`mode`, `title`, `destination`, `country`, `region`, `language`, `colorTheme`, `startDate`, `startTime`, `endTime`); `guide` (`name`, `phone`); `meeting` (`place`, `mapsUrl`, `time`, `note`); `pickup` (`offered`, `area`, `time`, `dropoffNote`); `cover` (photo with optional credit); `summary`; `days[]` (`id`, `dayNumber`, `title`, `location`, `photo`, `activities[]`, `hotel`, `meals`, `transferNote`); `places[]` for destination guides (`id`, `group`, `name`, `area`, `description`, `tips`, `gettingThere`, `suggestedDuration`, `bestTime`, `nearby`, `photo`); the practical lists (`included`, `notIncluded`, `whatToBring`, `localTips`, `healthSafety`), `emergencyContacts`, `policies`, `closingNote`, `disclaimer`. An activity has `time` (`HH:MM` or `null`), `durationMinutes`, `kind`, `title`, `place`, `description`, `tip`.

Stable UUIDs identify days, activities and places. `dayNumber` is derived from the day order during normalization. The route summary, scope label, photo credits and generated date are derived at render time and are not stored. Draft validation allows blank text and empty lists, but `FIELD_NOT_APPLICABLE` rejects data that does not belong to the mode (for example places in a half-day, hotel outside a multi-day, meals in a half-day, a start date in a guide). Half day, full day and multi-day have span caps of 360, 720 and 960 minutes per day; CP024 composes publish diagnostics and preview safety. Uncomputable schedule details warn rather than inventing values; provable overlaps/caps block publish.

## Locale detection boundary

- `requestedLanguage` is `auto` or an explicit valid locale tag; `outputLanguage` is a resolved locale tag or `null` while unresolved; the draft's `trip.language` must equal it when the draft is saved; a mismatch returns `422 INVALID_LANGUAGE_CONTEXT`.
- Locale source is `detected`, `explicit`, or `unresolved`. Detection for future CP023 uses descriptive client brief/notes, not brand/place names. Mixed-language or low-confidence inputs require guide selection before generation/publish.
- The CP020 catalogs are `la`, `fr`, `en`, `id`, `ja`, and `zh-Hans`; these are fixtures, not a schema allowlist. Unsupported locale catalogs/fonts return an actionable capability result, never an unannounced English fallback.
- `la` date formatting uses deterministic ISO/numeric formatting if host `Intl` lacks the locale. Unicode-aware length limits do not count CJK text by whitespace-separated words.

## Asset and render limits (initial contract)

- Canonical JSON request: 2 MiB UTF-8.
- Single uploaded image: 5 MiB; all resolved assets per render: 20 MiB.
- Final self-contained HTML: 64 MiB maximum; reject clearly rather than dropping itinerary content.
- Resolve asset IDs using workspace-owned server records. Never fetch arbitrary client URLs from the renderer.
- Public origin comes from trusted server configuration, never the request `Host` header.
- Backup/restore boundary: a consistent SQLite database + matching asset/published HTML/OG-image directory snapshot. Take the filesystem backup with the engine stopped; restore the complete data root, not a database-only copy.

## Secret and future SaaS boundary

- Never serve `OPENROUTER_API_KEY` or the credential file to browser code.
- Credential loader reports only `missing`, `configured`, or `ambiguous`; it never prints values.
- Live model generation remains disabled until CP023 and explicit test configuration. CP018 metadata verification is a non-generative GET only.
- Laravel CP029 may authenticate server-to-server and map external tenant identities to internal workspaces. It does not change the standalone same-origin API contract or make Laravel a CP018–CP028 runtime dependency.

## CP018 verification evidence

- Runtime: Node.js `v24.10.0`; `node:sqlite` in-memory create/insert/read/close probe passed. Node emitted its documented experimental API warning; pin and regression-test the runtime as SQLite is implemented.
- OpenRouter public catalog: `openai/gpt-6-luna` listed. Supported parameters observed: `max_tokens`, `reasoning`; do not send unsupported sampling settings such as `temperature` unless a later catalog response documents support.
- Credential source was processed by a local Node probe that emitted only `configured` state; no key bytes were printed, logged, persisted, or sent to OpenRouter. This confirms one OpenRouter-labelled key pattern is present, **not that the key authenticates**. Authentication/inference is deferred to CP023 and requires explicit live test configuration.
- Chromium-for-Testing file exists under `D:\Playwright` (file metadata version `151.0.7922.34`); direct `--version` invocation unexpectedly opened a browser and was stopped. An isolated headless launch probe timed out after 15s and left no process/profile behind. Browser verification is available for preview/public HTML checks. The earlier PDF launch probe is historical only; PDF export was removed from product scope before CP026.
- TypeScript/Vite/React/Tailwind package engine metadata is compatible with the selected Node 24 runtime. Exact dependency versions are locked when those packages are added; Puppeteer remains pinned at `25.1.0`.
- No code-generation/inference request was sent in CP018.
