# CP019-CP025 Review Log: R3, R4, R5 and R6 (guide-centric schema web-2.0.0)

Reviewer: Claude Opus 5.5. Date: 2026-11-10. Reviewed: disk state at commit `6366ecd`; stage logs `logs/cp020_stage-log_r3-renderer-v2.md`, `logs/cp024_stage-log_r4-preview-v2.md`, `logs/cp022_stage-log_r5-editor-v2.md`, `logs/cp019-cp025_stage-log_r6-regression.md`. R1/R2 round 1 is closed in `logs/cp019_review-log_r1-guide-centric-schema.md` (ACCEPT).

## Verdicts

| Stage | CP | Verdict |
|---|---|---|
| R3 renderer | CP020 | **ACCEPT** (two low follow-ups, not blocking) |
| R4 preview/publish | CP024, CP025 | **ACCEPT**; deviations E1-E4 accepted |
| R5 editor | CP022 | **REVISE (round 1)**: one medium and three low findings, small fix round |
| R6 regression, logs, docs | all | **ACCEPT**, with one doc wording fix carried in the R5 fix round |

## Independently reproduced (2026-11-10)

- Full `typecheck:web-contracts`, `typecheck:web-app`, `typecheck:web-contracts-v2`: 0 errors. `check:web-types`: matches.
- `test:web-contracts` 42, `store` 11, `api` 12, `ai` 28, `render` 14, `editor` 25, `preview` 12, `publication` 12: all pass.
- After a fresh `build:brochure-css` and `build:web-app`: `verify:web-editor`, `verify:web-preview`, `verify:web-publication`, `verify:web-ai-ui`, `verify:web-e2e` all exit 0.
- Screenshots the executor had not opened: `r5-full_day-390.png` (slice) and `cp027-integrated-public-mobile.png` (slice). Both are single-column with no overflow and readable labels.
- Probe `output/_tmp/probe-blank.ts`: a draft with `included: ['Local guide', '', '  ']` and `emergencyContacts: [{label:'', value:''}]` passes `normalizeBlanks`, `validateDraft` and `validateForPublish` unchanged (finding M1).

## Findings

| ID | Severity | Stage | Finding | Evidence |
|---|---|---|---|---|
| M1 | Medium | R5 (CP022) | Every "Tambah …" button adds an empty row. Empty list entries (`included`, `notIncluded`, `whatToBring`, `localTips`, `healthSafety`, `places[].tips`) and fully blank emergency contacts are saved and published. `renderPractical` does not filter them, so the public page shows empty bullets or a lone ": ". | probe above; `src/render/render.ts` `renderPractical` |
| L1 | Low | R5 | The editor disables "Tambah tempat" at 60 places (`MAX_PLACES`). This contradicts ruling R1 D2 (no place cap; 60 is a stress case). The cap came from a planner error (PR-15, finding R1-S1, both withdrawn). | `schema-meta.ts`, `sections/Places.tsx`, R1 review log |
| L2 | Low | R5 | The save-error panel ("Periksa field berikut") prints the raw path and schema message (e.g. `meeting.mapsUrl: format: …`), unlike the publish diagnostics, which use Indonesian labels. | `main.tsx` `sectionErrors` rendering |
| L3 | Low | R5 | The colour-theme radios are `sr-only`; keyboard focus on a swatch has no visible indicator. | `fields.tsx` `ThemePicker` |
| L4 | Low | R6 | Docs say `trip.language` "mirrors" `languageContext.outputLanguage`; the server actually rejects a PATCH where they differ (`INVALID_LANGUAGE_CONTEXT`). | `app.ts` `validLanguage` |
| F-R3-1 | Low, follow-up | R3 (CP020) | For half day, full day and the guide, the hero shows the same mode text twice (pill and eyebrow, e.g. "JOURNÉE COMPLÈTE"). Multi-day differs ("2 JOURS" vs "PLUSIEURS JOURS"). | `cp027-integrated-public-mobile.png`, `cp027-mode-half_day-desktop.png` |
| F-R3-2 | Low, follow-up | R3 (CP020) | The renderer should also drop blank practical entries defensively (drafts can arrive through the API, not only the editor). | `renderPractical` |
| P1 | Product, not a defect | R5 | "Bahasa konten" is a free BCP 47 input that shows `auto`; an owner who does not know locale tags sees developer wording. A select with language names would fit the plain-language goal. | `r5-full_day-390.png` |

## Rulings on deviations

- R4 E1 (overlap against the latest end), E2 (only resource loading maps to 503), E3 (diagnostics de-duplicated by code and path), E4 (an uncredited used photo returns 422 without HTML): **accepted**. The editor shows the 422 diagnostics in the publish panel, so E4 is actionable for the user.
- R5: hidden day controls for single-day modes; extra checks kept in `verify-editor.ts`; tsx `__name` workaround: **accepted**.
- R6: `verify-ai-ui` sidebar assertion inverted (the plan removed the sidebar box); `verify-e2e` scope label matched in page source, case-sensitive; `verify-preview` waits for an enabled Preview button (real race, 1 failure in 3 before); manifest re-keyed with recomputed IDs; agency logo via the workspace profile: **accepted**, none weakens a check.
- Skips: `verify:web-readiness` (Docker daemon off; not run so the CP028 evidence file is not overwritten) and `verify:web-ai --live` (paid): **accepted as skipped, not passed**. Run readiness when Docker is available before any deployment.
- Process: R5 and R6 ran back to back without the planned review stop, on the owner's instruction; the executor was Sonnet 5.5, not Haiku. No harm found.

## Status decisions

- CP019, CP021, CP023: `completed` (R1/R2 accepted, regression green).
- CP020, CP024, CP025: stay `completed` (R3/R4 accepted). F-R3-1 and F-R3-2 are recorded as follow-ups.
- CP022: stays `in_progress` until "R5 review round 1" in the plan passes. R5 and R6 checkboxes stay open until then.
- CP030-CP032: stay `pending`; their plan must be revised to `web-2.0.0` first (note already appended by R6).
