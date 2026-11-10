# CP033 Stage Log: Language, Preview Message and AI Key

Executor: Claude Haiku 5.5. Date: 2026-11-10. Plan: `plans/cp033-cp036_implementation-plan_editor-usability-setup-and-places.md`, CP033. Base: `b1876a1`.

## Changes

| Item | Change | Where |
|---|---|---|
| 1 Language dropdown | Free-text locale input replaced by a `<select>`: "Deteksi otomatis" (auto) plus six languages (Bahasa Indonesia, English, Français, 日本語, 中文（简体）, Latina). A stored unsupported tag appears as a disabled option "Bahasa tidak didukung: <tag>" with the note "Pilih salah satu bahasa yang tersedia." | `src/editor/fields.tsx` `LocaleField`, `contentLanguages` |
| 2 Preview message | Preview failure shows the first server diagnostic in Indonesian (e.g. "Preview belum tersedia: Pilih atau deteksi bahasa dan simpan sebelum preview.") instead of the generic text | `src/editor/main.tsx` `previewSaved` |
| 3 AI key | `src/server/main.ts` loads `.env.web` when present (`process.loadEnvFile`). `.env.web.example` gains `GOOGLE_PLACES_API_KEY` and `GOOGLE_PLACES_DAILY_LIMIT=300` (used by CP036). The AI panel shows a state-specific hint for missing, ambiguous or unavailable credentials; no key is displayed. | `src/server/main.ts`, `.env.web.example`, `src/editor/labels.ts`, `src/editor/main.tsx` |
| Tests | Editor test 5c: dropdown has the six languages plus auto; no text input; unsupported stored tag is shown. | `tests/web/editor.test.ts` |
| Browser scripts | Typing into the language field replaced by `page.select` (`verify-preview`, `verify-ai-ui`). `verify-editor`: the old `zh-Hant` step (which expected the unsupported-language sentence) now asserts that the dropdown exists, offers no `zh-Hant`, and accepts `zh-Hans`. `verify-preview`: new check that an `auto` draft gives the specific Indonesian message. | `scripts/web/*.ts` |

Deviation from the plan: `LocaleField` still receives the `needsSupport` prop from `TripInfo.tsx` (always `false`); the prop is no longer rendered. Remove it in a later cleanup.

## Gate

| Command | Result |
|---|---|
| `npm run build:brochure-css` | rc 0 |
| `npm run build:web-app` | rc 0 |
| `typecheck:web-app`, `typecheck:web-contracts`, `typecheck:web-contracts-v2`, `check:web-types` | rc 0 each |
| `test:web-contracts` / `store` / `api` / `ai` / `render` / `editor` / `preview` / `publication` | 42 / 11 / 12 / 28 / 14 / 27 / 12 / 12 pass, 0 fail |
| `verify:web-editor` | rc 0 (first run failed on the stale `zh-Hant` step; fixed as above, rerun rc 0) |
| `verify:web-preview` | rc 0 (includes the new specific-message check) |
| `verify:web-publication` | rc 0 |
| `verify:web-ai-ui` | rc 0 |
| `verify:web-e2e` | rc 0 |
| `verify:web-render` | rc 0 |
| `verify:web-ai` (no `--live`) | rc 1, by design: "Live provider calls require --live; no request was sent." No provider request made. |
| Credential check with a dummy key in a temporary `.env.web` | `credentialState: configured`, key not printed. The file was deleted afterwards and is git-ignored. |

## Screenshots opened

- `output/web-editor/cp033-language-390.png` (390 px, full_day draft): "Bahasa konten" dropdown shows "Deteksi otomatis" with the help text and the detect button below. Layout is single column, no overflow.

Not opened: the 1280 desktop screenshot of the language field (the editor's standard 1280 shots `r5-*` were produced by `verify:web-editor` and show the same component).

## Open questions for the reviewer

- The language field now shows "Deteksi otomatis" twice (as the selected option and as the button below). Harmless; can be removed in CP035 when the wizard is built.
- The `needsSupport` prop cleanup (see Deviation).
