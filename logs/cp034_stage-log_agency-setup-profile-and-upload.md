# CP034 Stage Log: Agency Setup, Profile Defaults, Guides and Photo Upload

Executor: Claude Haiku 5.5. Date: 2026-11-10. Plan: `plans/cp033-cp036_implementation-plan_editor-usability-setup-and-places.md`, CP034. Base: `b6662bf`.

## Changes

| Plan step | Change | Where |
|---|---|---|
| 1 Profile fields | Profile accepts `defaultCountry` (≤120), `defaultLanguage` (one of id, en, fr, ja, zh-Hans, la, or null), `guides` (≤20; each id uuid unique, name 1–120, phone ≤40), `setupCompleted` (boolean). Unknown keys still 422. Stored profiles without the new keys read as empty. | `src/server/app.ts` (`profileKeys`, `validGuides`, PATCH validation) |
| 2 Draft defaults | `createBlankDraft` takes the profile: `trip.country` and `trip.language` come from it. A create request without `languageContext` gets an explicit context for the default language. Existing drafts unchanged. | `src/server/draft.ts`, `src/server/app.ts` (POST) |
| 3 Setup wizard | Shown when `setupCompleted` is not true: 3 steps (Agensi, Default, Guide), Kembali/Lanjut, "Selesai" saves with `setupCompleted: true`. | `src/editor/main.tsx` (`view === 'setup'`), `src/editor/sections/ProfileForm.tsx` |
| 4 Pengaturan | Same form on one page, reachable from a "Pengaturan" header button; "Simpan" saves. | `src/editor/main.tsx` (`view === 'settings'`) |
| 5 Guide picker | Trip guide shows "Pilih guide" from the profile plus "Isi manual". Picking copies name and phone into the draft (draft stays self-contained; saving is manual). | `src/editor/sections/TripGuide.tsx`, `EditorForm.tsx` (`guides` prop) |
| 6 Photo upload | Cover, day and place photo fields get "Unggah foto" (upload then select the new asset). Logo upload in the profile form. The sidebar upload panel was removed with the sidebar. | `src/editor/fields.tsx` (`AssetSelect`, `PhotoField`), `DayCard`, `Cover`, `Places` |
| 7 Tests | API test "profile accepts setup fields…" (validation cases and draft defaults); editor tests 5d (guide picker and upload action). Browser scripts complete Setup through the profile API first (`complete-setup.ts` helper; `verify-e2e` and `probe-publish-retry` do it inline because they run the server in a child process). | `tests/web/api.test.ts`, `tests/web/editor.test.ts`, `scripts/web/*.ts` |

Bug found and fixed during verification: "Selesai" set the new state and then saved the previous profile (stale closure). `finishSetup` now saves the newly computed profile directly.

Other fix found during verification: the header "Pengaturan" button was missing (plan step 4 requires it).

## Gate

| Command | Result |
|---|---|
| `npm run build:web-app` | rc 0 |
| `typecheck:web-app`, `typecheck:web-contracts`, `typecheck:web-server`, `check:web-types` | rc 0 each |
| `test:web-contracts` / `store` / `api` / `ai` / `render` / `editor` / `preview` / `publication` | 42 / 11 / 13 / 28 / 14 / 28 / 12 / 12 pass, 0 fail (api 12 → 13, editor 27 → 28 from the new tests) |
| `verify:web-editor` | rc 0 |
| `verify:web-preview` | rc 0 |
| `verify:web-publication` | rc 0 |
| `verify:web-ai-ui` | rc 0 |
| `verify:web-e2e` | rc 0 |
| `verify:web-publish-retry` | rc 0 (after completing Setup in the probe; first attempt failed because the probe never got past Setup) |
| `verify:web-render`, `probe:web-recovery-scope` | rc 0 each |
| Browser flow (scratch script, `output/_tmp/cp034-flow.ts`) | Setup 3 steps → Selesai → profile saved (`setupCompleted: true`); new full_day draft gets country `Japan` and language `en` from Setup; picking guide "Hiro" then Simpan stores name `Hiro` and phone `+81-90-1111`; 0 external requests, 0 console errors |

## Screenshots opened

- `output/web-editor/cp034-setup-390.png`: Setup step 1 of 3 ("Agensi"), three fields, Kembali (disabled) and Lanjut, single column, no overflow.
- `output/web-editor/cp034-settings-390.png`: Pengaturan with the values set through the API (country Indonesia, language Bahasa Indonesia, guide Made). Layout single column.

Not opened: `cp034-setup-1280.png` (generated; same component at a wider width, overflow check passed).

## Deviations

1. Sticky action bar: in the full-page screenshot it appears mid-page. This is an artefact of full-page capture with `position: sticky`; in a real scrolling viewport it stays at the bottom. Not verified on a physical phone.
2. The guide picker copies name and phone only when the draft is saved (manual save rule of the editor). The plan did not state this; kept as the editor's existing rule.
3. The Setup "Default" step reuses the same form section as the Agensi step's sibling fields (no separate component); visible behaviour matches the plan.
4. Setup "Selesai" saves immediately (`setupCompleted: true`), so an interrupted Setup restarts at step 1 on next load only if the save never happened.

## Open questions for the reviewer

- The Setup step 3 "Guide" list does not validate a duplicate guide name (only duplicate ids are rejected server-side, per plan). Decide whether duplicate names should warn.
- `verify:web-readiness` still not run (Docker not running); CP034 changes to Setup affect its runtime probe, which does not complete Setup yet.
