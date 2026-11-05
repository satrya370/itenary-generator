# CP018 Completion Log: Standalone API and Runtime Contract

## Result

- Status: `completed`
- Summary: Runtime/API/secret/locale/asset contract established for the standalone engine. Public OpenRouter catalog confirms `openai/gpt-6-luna`; local credential availability was checked without displaying the key. No inference request was made.

## Date

- Completed at: `2026-10-06 14:09 +08:00`

## Plan Reference

- Implementation plan: `../plans/cp018-cp020_implementation-plan_standalone-engine-foundation.md` (§ Proposed Changes — CP018)
- Revision plan, if applicable: `N/A`

## Changes Made

- Documented Node 24 / TypeScript / Fastify 5, `node:sqlite`, loopback API + Vite origins, server-selected workspace, filesystem layout, limits, error envelope, locale boundary, backup/restore boundary and future Laravel adapter seam.
- Added `.env.web.example` without key values. Added ignores for `.runtime/` and explicit tracking of `.env.web.example` while preserving existing ignore rules.
- Added safe runtime probe. It reports only model ID/listing, supported parameters, runtime version and credential state; it never prints credential values.
- Verified the OpenRouter target as `openai/gpt-6-luna`. Catalog parameters observed were `max_tokens` and `reasoning`; sampling `temperature` must not be sent unless the catalog later declares support.
- Verified one OpenRouter-labelled credential key pattern in the user-provided credential file using the local probe. The key was not shown, logged, persisted or sent to OpenRouter. This is a presence check, not authentication validation.
- Verified Node `v24.10.0` and an in-memory `node:sqlite` create/insert/read/close operation. Node emitted the experimental SQLite API warning.
- Verified a headless browser service is available through the connected Playwright browser (Chrome `154.0.0.0`). A local Chromium-for-Testing binary exists (`151.0.7922.34`), but an isolated direct headless launch timed out; CP020 must separately prove Puppeteer PDF launch. The accidental headed probe process tree was stopped and the isolated profile cleaned.

## Files and n8n Workflows Changed

| Artifact | Change |
|---|---|
| `SPEC.md` | Recorded approved runtime and language fixture decisions. |
| `TODOS.md` | CP018 progress and chapter references. |
| `RULES.md` | Generalized temporary artifact identity for web engine jobs. |
| `.gitignore` | Ignore `.runtime/`; allow tracking `.env.web.example`. |
| `.env.web.example` | Secret-free local runtime sample. |
| `docs/engine-runtime-contract.md` | Standalone API/runtime contract and evidence. |
| `scripts/web/probe-runtime.mjs` | Redacted Node/OpenRouter/credential-presence probe. |
| `scripts/web/probe-chromium.mjs` | Isolated bounded browser launch probe; profile cleanup. |
| `logs/cp018_completion-log_standalone-api-and-runtime-contract.md` | CP018 evidence record. |
| n8n workflows | None changed. |

## Verification Performed

| Verification | Result | Evidence |
|---|---|---|
| Node/SQLite runtime probe | PASS | Node `v24.10.0`; in-memory create/insert/read/close. Experimental warning recorded. |
| OpenRouter model catalog | PASS | `node scripts/web/probe-runtime.mjs`; model ID `openai/gpt-6-luna`, listed; supported parameters `max_tokens`, `reasoning`. |
| Credential presence | PASS (presence only) | Same probe with `OPENROUTER_CREDENTIAL_FILE` set; output `credentialState: configured`; raw key not printed. |
| Live OpenRouter authentication/inference | NOT RUN | No inference or paid request was part of CP018; key validity is not established. |
| Browser service availability | PASS | Playwright browser evaluation reported Chrome `154.0.0.0`, Windows platform. |
| Direct local Chromium headless probe | FAIL / fallback available | `scripts/web/probe-chromium.mjs` timed out at 15s; no orphan process or profile remained. Local binary metadata `151.0.7922.34`; CP020 Puppeteer PDF gate remains. |
| Existing package validation | PASS | `npm run validate` → `package validation passed`. |
| Existing regression test | PASS | `npm test` → 1 pass, 0 fail. |
| Source package runtime metadata | PASS | Registry metadata checked for Node 24 compatibility of TypeScript/Vite/React/Tailwind/Fastify baseline; exact versions lock when dependencies are added. |

## Acceptance Criteria Results

| Criterion | Result | Evidence |
|---|---|---|
| R18-1 — Node 24/SQLite and browser feasibility evidenced | PASS with follow-up | SQLite probe passed; headless Chrome service available. Local direct Chromium launch did not pass; CP020 must prove Puppeteer PDF. |
| R18-2 — exact OpenRouter model ID and secret availability | PASS (availability only) | Public catalog lists exact `openai/gpt-6-luna`; one labelled credential pattern found without revealing it. Authentication deferred to CP023. |
| R18-3 — runtime/API/storage/error/revision contract documented | PASS | `docs/engine-runtime-contract.md` and `.env.web.example`. |
| R18-4 — six locales and extensible detection/capability policy | PASS | `SPEC.md` D10 and multilingual behavior; contract records unresolved/mixed-language boundary. |
| R18-5 — no app/server/AI-writing implementation or Laravel/n8n changes | PASS | Only config/docs/read-only probes changed; no inference sent; no n8n or Laravel mutation. |

## Deviations from Plan

- Direct local Chromium launch did not succeed within the bounded probe. A connected headless Playwright browser is available for CP020 HTML visuals; production-like Puppeteer PDF generation is explicitly still unverified and must pass CP020 before that CP can complete.
- Package versions are not installed/locked in CP018; exact versions will be locked only when CP019/CP020 introduce the relevant dependencies, as specified by the plan.

## Known Limitations and Follow-Ups

- OpenRouter key pattern is present but has not been authenticated; CP023 must perform an explicitly configured live test and redact errors.
- `node:sqlite` emits an experimental warning in the tested Node `v24.10.0`; CP021 must regression-test persistence and the selected Node version.
- CP020 must launch Puppeteer/Chromium for verification-only PDF and complete all browser/PDF visual acceptance. If that fails, CP020 remains blocked.
- No application server, persistence CRUD, editor, live AI writing, public publishing service, or production PDF feature is implemented by CP018.
