# CP021 Completion Log: Engine API and Draft Persistence

## Result

- Status: `completed`.
- Summary: Added a loopback-only Fastify API, persistent SQLite workspace/profile/drafts, validated filesystem image storage, same-origin React/Vite shell, API contract and restart/backup evidence.

## Date

- Completed at: `2026-10-06` (local time).

## Plan Reference

- Implementation plan: `../plans/cp021-cp023_implementation-plan_persistent-editor-and-field-ai.md` (§ Proposed Changes — CP021).
- Ask Question decisions: one CP021–CP023 chapter plan; manual Save; CP023 local limit 30 operations/workspace/day and total live-test ceiling US$2.

## Changes Made

- Added Fastify app factory and loopback-only entrypoint; production serves the static Vite shell, while development proxies `/api` from Vite on `127.0.0.1:5173` to engine `127.0.0.1:3000`.
- Added SQLite tables/version marker for workspaces, itineraries and assets. A stable server-selected workspace UUID is persisted (an existing workspace ID is retained on migration). Draft/profile writes use revision compare-and-swap; draft saves replace a complete canonical document and metadata, returning `409` on conflicts.
- Added valid incomplete draft factory for all four modes, profile defaults copied on create, workspace-filtered list/read and cursor pagination, language/writing context outside canonical content, JSON DTO validation, asset-reference ownership validation and request ID error envelopes.
- Added bounded JPEG/PNG/WebP upload: actual decode and pixel checks, rotate/re-encode to strip metadata, opaque storage IDs, safe filename, private image reads, and startup removal only of UUID-shaped unreferenced upload/partial files.
- Added minimal React shell for draft list/create/open, operator profile, image upload and manual editing/saving of trip title, destination and overview. Input typed during an in-flight save remains unsaved and is not replaced by an older response; full form/repeater coverage is CP022.
- Added local development/backup instructions and `docs/editor-ai-api-contract.md`; context reports AI as `not_implemented` pending CP023.

## Files and n8n Workflows Changed

| Artifact | Change |
|---|---|
| `src/server/app.ts`, `store.ts`, `draft.ts`, `main.ts` | Fastify lifecycle, SQLite repositories, routes, asset safety, draft factory and loopback startup. |
| `src/api/client.ts`, `src/editor/main.tsx`, `style.css`, `index.html`, `vite.config.ts`, `tsconfig.app.json` | React shell, typed API calls, Tailwind v4 build/proxy and app typecheck. |
| `tests/web/api.test.ts` | SQLite/filesystem/API integration, concurrency, DTO/origin/ownership/upload/backup tests. |
| `docs/editor-ai-api-contract.md`, `docs/standalone-development.md` | API contract and local run/backup/restore instructions. |
| `package.json`, `package-lock.json` | Fastify, multipart/static, sharp, React, Vite 7.3.7, React plugin 5.2.0, Tailwind Vite plugin 4.1.13 and app/API gates. Tailwind packages remain aligned at 4.1.13. |
| `.gitignore` | Allows root app `index.html` despite the existing `*.html` ignore. |
| `TODOS.md` | CP021 marked completed; CP022 returns to pending until this log gate. |
| n8n workflows / Laravel repository | None changed. |

## Verification Performed

| Verification | Result | Evidence |
|---|---|---|
| Foundation regression | PASS | `npm run check:web-types`, `npm run typecheck:web-contracts`, `npm run test:web-contracts` (22 pass), `npm run test:web-render` (12 pass). |
| CP021 app/API | PASS | `npm run typecheck:web-app`; `npm run test:web-api` (7 pass, 0 fail): all-mode blank draft factory, persistence across database reopen, two concurrent CAS saves (one `200`, one `409`), profile save, request/metadata/asset ownership rejection, cursor pagination, upload re-encode/private fetch, fake/SVG/oversize upload rejection, orphan cleanup and stopped full-data-root restore. Node emits its documented `node:sqlite` experimental warning. |
| Production frontend | PASS | `npm run build:web-app` (Vite 7.3.7); launched `npm run start:web-app`, opened shell over production same origin, created/edited/saved/reopened a draft, saved profile; console had 0 errors. Playwright artifacts `cp021-desktop.png` and `cp021-final-desktop.png`. |
| Vite development proxy | PASS | Launched `npm run dev:web-app`; `http://127.0.0.1:5173/api/health` returned `{"status":"ok"}`; API-backed draft create succeeded from the 5173 origin. No current console errors after HMR root handling fix. |
| Responsive shell | PASS | Browser viewport 390×844 and 1440×1000; document width did not exceed viewport (390→375 CSS px effective content, 1440→1440); manual Save state was visible. |
| In-flight edit preservation | PASS | Browser route delayed PATCH by 1.5s; title save completed at revision 5 while destination was edited during request; UI retained `Mid-save value`, showed `Belum disimpan`, and reported “edit terbaru masih belum disimpan.” |
| Renderer & print regression | PASS | `npm run build:brochure-css` + `npm run verify:web-render`: 11 fixtures, no external requests/console errors/overflow; `python scripts/web/print-pagination.py`: 0 failures. Tailwind CLI and Vite plugin pinned/aligned to 4.1.13 to prevent a duplicate 4.3.x renderer utility set. |
| Package/existing checks | PASS | `npm run validate`, `npm test` (1 pass), `npm audit --audit-level=moderate` (0 vulnerabilities), `git diff --check` (clean; Git only reports LF→CRLF notices). |

Smoke-test draft/profile values were removed from `.runtime/engine.sqlite` after evidence capture; the local server and Vite dev server were stopped.

## Acceptance Criteria Results

| Criterion | Result | Evidence |
|---|---|---|
| R21-1 — standalone loopback API and editor shell | PASS | Production and Vite dev servers booted; Vite proxy and production shell/API verified; no Laravel/n8n runtime. |
| R21-2 — incomplete canonical draft, profile, assets persist | PASS | Four-mode draft tests; database-close/reopen test; stopped full-root copy/restore reopens profile, draft and referenced image. |
| R21-3 — workspace boundary, upload validation, errors/limits | PASS | Foreign seeded workspace records/assets resolve as 404; workspace field injection and invalid references rejected; raster/size tests; private asset response omits paths; loopback bind guard and strict Origin/header checks. |
| R21-4 — revision conflict and retained input | PASS | Concurrent API writes produce exactly one success and one 409; delayed browser save preserved newer local input. |
| R21-5 — evidence and completion log before CP022 | PASS | This completion log, seven API integration tests, real-browser production/dev checks and visual artifacts recorded. |

## Deviations from Plan

- CP021 frontend is intentionally a persistence shell with only title, destination and overview controls; registry-complete four-mode forms, repeaters, mode transitions and conflict reconciliation remain CP022 scope.
- Added a Vite HMR root reuse guard after browser testing surfaced duplicate `createRoot()` warnings during development reload; production behavior is unchanged.
- Vite 8 and the latest Tailwind Vite plugin initially caused a Tailwind peer-version split. Replaced them with Vite 7.3.7, React plugin 5.2.0 and Tailwind plugin 4.1.13, matching the already pinned Tailwind CLI/runtime. Rebuilt and reran renderer/PDF gates successfully.

## Known Limitations and Follow-Ups

- Single local workspace and loopback-only management API; no signup, authentication, public deployment, publish routes or multi-tenant boundary (future SaaS integration CP029).
- CP021 shell does not yet expose all canonical fields/repeaters; CP022 owns complete editing, stable-ID controls, keyboard reorder, unsaved navigation and conflict-resolution UI.
- AI is explicitly unavailable in context until CP023; no provider credentials/calls or billing are part of CP021.
- SQLite reports the Node 24 experimental API warning. Backup is supported only by stopping the engine and copying/restoring the complete data root.
- CP022 may start only after this log exists and CP021 is `completed` in `TODOS.md`.

## Follow-up Finding for Planner Review: 2026-10-07 — Malformed Image Re-encode Error

- During CP022 asset-picker QA, a truncated PNG with a readable metadata header failed during Sharp re-encode and returned generic HTTP 500 instead of `422 ASSET_INVALID`.
- The handler now converts decode/re-encode failures to `422 ASSET_INVALID`; `tests/web/api.test.ts` includes the truncated-PNG regression. Full CP021/API and CP022 chapter gates are rerun before handoff.
- Per user direction, this note records the change and evidence only; it does **not** claim a formal CP021 revision or replace its revision-plan gate. The large-AI planner/reviewer will decide whether to create a CP021 revision plan after chapter handoff.

## Review Addendum: 2026-10-07 — Formal Revision Planned

- Structured Ask Question: user selected **Bug + gap**. Review `cp021-cp023_review-log_bug-and-evidence-audit.md` requires formal CP021 revision/reverification for the PNG follow-up and upload persistence/boundary evidence gaps.
- Plan: `../plans/cp021_revision-plan_engine-api-and-draft-persistence.md`. Revision execution has not started; this is not an executed-revision PASS section.
- Original completion and follow-up above remain historical records. Chapter acceptance/CP024 is held until CP021 and CP023 revisions are verified and re-reviewed.

## Revision: 2026-10-07 - Upload Error and Persistence Verification

### Revision Plan

- `../plans/cp021_revision-plan_engine-api-and-draft-persistence.md`

### Changes Made

- Kept the existing server fix that maps Sharp decode/re-encode failure to `422 ASSET_INVALID`; this revision confirmed behavior and strengthened regression evidence rather than changing upload runtime behavior.
- The malformed-image API test now checks error codes and proves SVG/fake/truncated/oversized inputs create no asset records or files.
- Added boundary fixtures for an 8,193-pixel axis and a 16-megapixel overflow. Both reject before persistence.
- Added a controlled metadata-store failure after the final image write. The API returns safe `500 INTERNAL_ERROR`, removes temporary/final files and metadata, then accepts a valid upload after the failure is removed.
- Extended the valid-upload round trip across JPEG, PNG and WebP to ensure existing supported formats remain intact.

### Verification Performed

| Verification | Result | Evidence |
|---|---|---|
| Upload/error/cleanup integration | PASS | `npm run test:web-api`: 9 tests, 9 pass. New cases assert `ASSET_INVALID`, `PAYLOAD_TOO_LARGE`, 8,193-axis/pixel-bound rejection, empty metadata/files after invalid inputs, cleanup after DB persistence failure and successful follow-up upload; JPEG/PNG/WebP all remain valid. |
| Contracts/editor regression | PASS | `npm run check:web-types`; `npm run typecheck:web-contracts`; `npm run test:web-contracts` (22); `npm run test:web-editor` (8). |
| API/app/build/browser regression | PASS | `npm run typecheck:web-app`; `npm run build:web-app`; `npm run verify:web-editor` (four modes, 14 days, 60 spots, 390/1440px, zero console/external requests). |
| Package and whitespace | PASS | `npm run validate`; `git diff --check` (line-ending notices only). |

### Acceptance Criteria Results

| Criterion | Result | Evidence |
|---|---|---|
| R21-3a — malformed/truncated raster | PASS | API returns `422 ASSET_INVALID`; no asset row, temp file or final file; subsequent valid upload path succeeds. |
| R21-3b — axis/pixel ceilings and existing raster support | PASS | PNG header boundary fixtures for axis 8,193 and 4,097×4,097 are rejected with `422 ASSET_INVALID` and no persistence; generated JPEG/PNG/WebP round trips return valid owned assets. |
| R21-3c — persistence failure cleanup | PASS | Injected SQLite asset-metadata failure after file promotion returns `500 INTERNAL_ERROR`; both created paths and asset record are absent. |
| R21-1/2/4 regression | PASS | Type, API, contract/editor, build and real-browser editor regression gates listed above pass. |
| Revision close | PASS | This executed revision section, its plan, audit review and matching `TODOS.md` status are recorded. |

### Remaining Limitations

- The injected failure covers DB metadata persistence after final rename; low-level OS write/rename failure injection is not included. Existing compensating cleanup for the tested persistence path is verified.
- No dependency/schema/renderer change was needed. CP023 revision remains next in sequence; chapter verdict remains REVISE until CP023 passes and the chapter is re-reviewed.
