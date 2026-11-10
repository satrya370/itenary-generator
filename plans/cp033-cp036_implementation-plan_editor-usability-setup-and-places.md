# CP033-CP036 Implementation Plan: Editor Usability, Agency Setup and Place Autocomplete

Chapter plan (one shared document, one completion log per CP). Planner: Claude Opus 5.5, 2026-11-10. Executor: Claude Haiku. Base commit: `ef52f03` (`main`, pushed). Runs **before** the import chapter CP030-CP032.

## Objective

Fix the problems the owner found while using the editor (2026-11-10) and make the editor usable on a phone:

| # | Owner report | CP |
|---|---|---|
| 1 | "Preview belum tersedia: Preview cannot be rendered safely." | CP033 |
| 2 | "Katalog/font render untuk inggris belum tersedia" | CP033 |
| 3 | "AI belum aktif: kunci API belum diatur di server" | CP033 |
| 4 | Country filled during Setup | CP034 |
| 5 | Guides added during Setup, then picked in the draft (phone filled too) | CP034 |
| 6 | Upload a cover photo directly while creating the itinerary | CP034 |
| 7 | Practical info as common OTA options + "type your own", including terms & conditions | CP035 |
| 10 | Red warnings on empty required fields before publish | CP035 |
| 11 | More user friendly, mobile first, multi-step form per section | CP035 |
| 8 | Google autocomplete for the activity "Tempat / area" | CP036 |
| 9 | Google autocomplete for the meeting point and its Maps link | CP036 |

## Clarifications and Decisions

Structured Ask Question rounds on 2026-11-10 (three rounds):

| Topic | Decision |
|---|---|
| Language (1, 2) | Replace the free-text locale field with a dropdown of the six supported languages plus "Deteksi otomatis". A default content language is set in Setup; new drafts start with it. |
| Google (8, 9) | Server-side proxy to Places API (New) Autocomplete. The key stays on the server. Daily cap **300 requests** (about 9,000/month, under Google's 10,000 free Autocomplete Requests per month). Without a key or after the cap, the fields stay plain text inputs. Public pages never call Google. |
| Practical options (7) | Common OTA options (researched from GetYourGuide and Viator listing structures), plus "ketik sendiri". Terms & conditions also get selectable options plus free text. |
| Practical fields | Follow the OTA pattern: Termasuk, Tidak termasuk, Yang perlu dibawa, **Tidak cocok untuk (new)**, **Tidak diperbolehkan (new)**, **Yang perlu diketahui** (replaces "Tips lokal"), Kontak darurat, Syarat & ketentuan. **"Kesehatan & keselamatan" is removed**; its existing items move into "Yang perlu diketahui". "Catatan penutup" and "Penafian" stay. |
| Wizard (10, 11) | Step-by-step on every screen size; desktop shows the step list at the side. Red warnings appear once a field was touched, or after pressing "Lanjut" or "Publish". Publish is locked while required fields are empty. |
| Setup (4, 5) | First-run Setup wizard (agency, contact, logo, default country, default language, guide list with name + phone), editable later in "Pengaturan". |
| Roadmap | New chapter CP033-CP036, executed before CP030-CP032. |

Planner decisions (the owner may override before execution):

- **PD-1** Places: no Place Details call. The selected suggestion's text goes into the field, and the meeting-point Maps link is built as a Maps URL with `query_place_id` (Google allows storing place IDs indefinitely; other Places content may not be cached). One billable Autocomplete request per debounced keystroke burst (min 3 characters, 300 ms debounce).
- **PD-2** OTA option texts ship for `id` and `en` only. For `fr`, `ja`, `zh-Hans`, `la` the lists show no presets (free text still works). Translations are a follow-up.
- **PD-3** Selected options are stored as plain strings in the existing lists (no new option IDs). Terms & conditions options are stored as lines inside the existing `policies` text.
- **PD-4** Schema `web-2.1.0`: add `notSuitableFor[]` and `notAllowed[]`, remove `healthSafety[]`. The key `localTips` is kept (only its label changes) to limit churn.
- **PD-5** All wizard steps stay mounted; inactive steps use the `hidden` attribute. This keeps the registry DOM coverage test and diagnostic focusing working (focusing switches to the step first).
- **PD-6** The AI key is read from a git-ignored `.env.web` file that `src/server/main.ts` loads at start; the owner pastes **one** OpenRouter key there.

## Scope

CP033, CP034, CP035, CP036 as described in "Proposed Changes". Revisions this implies to completed CPs are done inside these CPs and logged there: schema/registry (CP019 area), renderer labels/groups (CP020 area), profile API and migration (CP021 area), editor (CP022 area).

## Out of Scope

- Translating OTA options into `fr`, `ja`, `zh-Hans`, `la` (PD-2).
- Place Details, photos, ratings or maps embedded in the public page.
- Changing published HTML of existing published versions (they stay immutable).
- CP030-CP032 import, CP029 SaaS, deployment, `verify:web-systemd`.
- Follow-ups F-R3-1 (duplicate mode label in the hero) and F-R3-2 (renderer-side blank filtering) unless a step below names them.

## Current-State Findings (audit 2026-11-10)

- **1 + 2 share one root cause.** The language field (`LocaleField`) accepts any syntactically valid BCP 47 tag. "inggris" and "english" pass `Intl.getCanonicalLocales`, so the draft gets an unsupported locale. Reproduced on a temporary server: `null` -> preview 422 `LOCALE_UNRESOLVED`; `"inggris"` -> 422 `LOCALE_UNSUPPORTED`; `"en"` -> 200, publish ready. All 13 drafts created since 2026-10-07 in the owner's data have `trip.language = null`. The status line then shows the generic server message "Preview cannot be rendered safely." instead of the specific Indonesian diagnostic the server already returns.
- **3** is configuration: `src/server/main.ts` loads no env file; the credential loader reads `OPENROUTER_API_KEY` or `OPENROUTER_CREDENTIAL_FILE`. The owner's `../Credential_information.md` contains two OpenRouter keys, which the loader treats as `ambiguous`.
- **4, 5:** the profile accepts only `agencyName`, `agencyContact`, `agencyLogoAssetId` (`profileKeys` in `src/server/app.ts`). `createBlankDraft(mode, _profile)` ignores the profile.
- **6:** `PhotoField` offers only a select of already uploaded assets; uploading is a separate sidebar panel.
- **7:** practical lists are free text only (`TextList`). `healthSafety`/`localTips` are used in schema, registry, 6 locale catalogs, `upgrade-v1.ts`, `draft.ts`, `render.ts`, `preview.ts`, editor and fixtures.
- **10:** publish problems are only listed after "Preview" (server diagnostics); fields are not marked.
- **11:** the editor is one long page with a sidebar; on a phone the sidebar (mode cards, drafts, profile, upload) comes first.

## Proposed Changes

### H0. Rules for the executor (same as the previous chapter's H0, repeated here)

- Repo root `D:\.agents\Micro Saas\itinerary-engine`; check every write path starts with it.
- Write files with Write/Edit; read before editing.
- Stage files **by name** (`git add <paths>`); never `git add -A`/`.`; run `git diff --cached --stat` before each commit.
- Forbidden in `src/**` and `tests/**`: `@ts-ignore`, `@ts-expect-error`, `@ts-nocheck`, `as any`, `: any`, `<any>` in new or changed lines. No `!`-exclusions in typecheck commands.
- Do not delete or loosen assertions to make a check pass; change an assertion only when this plan changes the behaviour, and list each such change in the stage log.
- Never claim a result you did not run; paste commands and counts into the stage log.
- Same failure three times -> stop, log what you tried, ask.
- Never use the real data root `.runtime/` in tests or verify scripts (they create temporary folders). The owner's running server uses `.runtime/`; restart it only when the owner asks.
- After each CP gate: commit `CPxxx: <summary> (pending review)` and **stop for review**. The next CP starts only after the owner says "lanjut".
- Stage log per CP: `logs/cp0NN_stage-log_<object>.md`.

### CP033 — Language, preview message, AI key (fixes 1-3)

1. **Language dropdown.** Replace `LocaleField` (`src/editor/fields.tsx`) with a `<select data-field-path="trip.language">`. Options in this order (value -> label): `auto` -> "Deteksi otomatis", `id` -> "Bahasa Indonesia", `en` -> "English", `fr` -> "Français", `ja` -> "日本語", `zh-Hans` -> "中文（简体）", `la` -> "Latina". Keep the "Deteksi otomatis" button and the proposal/confirm flow (shown only when the value is `auto`). Remove the free-text input, the datalist, and the "Katalog/font render untuk … belum tersedia" note (no unsupported tag can be chosen any more). If an old draft holds an unsupported tag, show an extra disabled option "Bahasa tidak didukung: <tag>" so the user sees why, plus the plain message "Pilih salah satu bahasa yang tersedia."
2. **Preview status message.** In `main.tsx` `previewSaved` catch: when `e.body.fields.errors` exists, set the status to `Preview belum tersedia: ` + the first error's message (the server messages are already Indonesian, e.g. "Pilih atau deteksi bahasa dan simpan sebelum preview."). Use the generic server message only when no diagnostic exists.
3. **AI key.** In `src/server/main.ts`, before `createApp()`: `if (existsSync('.env.web')) process.loadEnvFile('.env.web');`. Add `GOOGLE_PLACES_API_KEY=` and `GOOGLE_PLACES_DAILY_LIMIT=300` to `.env.web.example` (CP036 uses them). In `docs/standalone-development.md`, add: copy `.env.web.example` to `.env.web`, paste exactly one key into `OPENROUTER_API_KEY`, restart. In the editor's AI panel, show plain text per credential state from the context endpoint: `configured` -> nothing extra; `missing` -> the existing `statusCopy.aiNotActive` plus "Isi OPENROUTER_API_KEY di file .env.web lalu jalankan ulang server."; `ambiguous` -> "File kredensial berisi lebih dari satu kunci; isi satu kunci di OPENROUTER_API_KEY."; `unavailable` -> "Kunci AI tidak terbaca; periksa formatnya." Do **not** read or print any key.
4. Tests: editor test for the language select (all six options plus `auto` render; no text input with `data-field-path="trip.language"`). Update `verify-editor.ts`, `verify-preview.ts`, `verify-ai-ui.ts`, `verify-e2e.ts` where they type into the language field (`page.select` instead of `fill`). Add to `verify-preview.ts`: a draft saved with `auto` -> Preview -> status contains "Pilih atau deteksi bahasa".
5. **Gate CP033:** `build:web-app`; full `typecheck:web-app`, `typecheck:web-contracts`; all `test:web-*`; `verify:web-editor`, `verify:web-preview`, `verify:web-publication`, `verify:web-ai-ui`, `verify:web-e2e`. Unit test for `main.ts` env loading is not needed; instead start the server once with a temporary `.env.web` containing `OPENROUTER_API_KEY=sk-or-v1-` + 32 `a` characters and `ENGINE_DATA_DIR=<temp folder>`, call `/api/v1/itinerary-engine/context`, and log that `credentialState` is `configured`; then delete that temporary `.env.web`.

### CP034 — Agency Setup, profile defaults, guides, photo upload (4-6)

1. **Profile fields** (`src/server/app.ts`, `store.ts` keeps `profile_json` as JSON): allow `agencyName` (≤160), `agencyContact` (≤320), `agencyLogoAssetId` (asset or null), `defaultCountry` (string ≤120), `defaultLanguage` (one of `id`, `en`, `fr`, `ja`, `zh-Hans`, `la`, or null), `guides` (array ≤20 of `{ id: uuid, name: 1-120 chars, phone: 0-40 chars }`, unique ids), `setupCompleted` (boolean). Missing new fields in a stored profile read as `''`, `null`, `[]`, `false`. Unknown keys -> 422 as today.
2. **Draft defaults.** `createBlankDraft(mode, profile)` sets `trip.country = profile.defaultCountry ?? ''` and `trip.language = profile.defaultLanguage ?? null`. In the create route, when no `languageContext` is sent and `trip.language` is set, use `{ requestedLanguage: lang, outputLanguage: lang, source: 'explicit' }`. Existing drafts are not changed.
3. **Setup wizard** (`src/editor/setup/SetupWizard.tsx`, new): shown instead of the workspace when `profile.setupCompleted !== true`. Steps: (1) Agensi: nama, kontak, logo (upload button + preview); (2) Default: negara (text), bahasa konten (same dropdown as CP033 without `auto`); (3) Guide: list of name + phone rows (add, remove), may be empty. Buttons "Kembali", "Lanjut", and on the last step "Selesai" (saves with `setupCompleted: true`). Mobile first: one column, sticky bottom button bar.
4. **Pengaturan** (`src/editor/settings/Settings.tsx`, new): same fields as Setup on one page, reachable from the header ("Pengaturan"), with "Simpan". It replaces the sidebar profile panel (`sections/Profile.tsx` is deleted or reduced to the shared form used by both).
5. **Guide picker** (`sections/TripGuide.tsx`): a select "Pilih guide" listing profile guides plus "Isi manual". Choosing a guide copies name and phone into `draft.guide` (the draft stays self-contained). "Isi manual" shows the two text fields as today. If the draft's guide matches a profile guide by name and phone, that option is preselected.
6. **Upload in photo fields** (`PhotoField` in `fields.tsx`): add an "Unggah foto" button next to the asset select (hidden `<input type="file" accept="image/jpeg,image/png,image/webp">`). On upload success the new asset is selected for that field and the asset list refreshes. Errors show under the field. Works for cover, day and place photos. Remove the separate sidebar upload panel.
7. Tests: API tests for profile validation (valid, each invalid field, unknown key, guide limit, duplicate guide id) and for draft defaults; editor tests for the guide picker and photo upload button presence. Browser (`verify-editor.ts`): first run shows Setup; completing it creates a new draft with the default country and language and preview works without touching the language; guide pick fills both fields; cover upload selects the uploaded asset. Update other verify scripts that relied on the sidebar profile or upload panel (complete Setup through the API at the start of each script).
8. **Gate CP034:** as CP033 plus `test:web-api` count increased by the new tests; screenshots `output/web-editor/cp034-setup-{390,1280}.png` and `cp034-settings-{390,1280}.png`, opened and described in the stage log.

### CP035 — OTA practical fields, wizard, validation (7, 10, 11)

Stage S1 — schema `web-2.1.0` (PD-4):

1. `config/web/itinerary.schema.json`: `schemaVersion` const `web-2.1.0`; add `notSuitableFor` and `notAllowed` (same shape and limits as `included`); remove `healthSafety`. Regenerate types (`node scripts/web/generate-types.mjs`), update `SCHEMA_VERSION` in `src/contracts/types.ts`.
2. `upgradeV20ToV21(doc)` in `src/contracts/upgrade-v2.ts` (new): add the two empty arrays; append `healthSafety` items to `localTips` (skip exact duplicates); delete `healthSafety`; set `schemaVersion`. `upgradeV1ToV2` returns its result passed through `upgradeV20ToV21`, so every upgrade lands on 2.1.
3. Migration 4 in `src/server/store.ts`: back up first (same `VACUUM INTO` pattern as migration 3, new file name), then upgrade every `web-2.0.0` draft in one transaction; revision unchanged; `schema_version` updated. Published snapshots are not touched.
4. Registry: add `notSuitableFor[]` and `notAllowed[]` (control `repeater`, modes `all`, not required), remove `healthSafety[]`, change `localTips[]` labelKey to `knowBeforeYouGo`. Catalog labels (all six locales): `notSuitableFor` (id "Tidak cocok untuk", en "Not suitable for", fr "Ne convient pas à", ja "ご参加いただけない方", zh-Hans "不适合人群", la "Non idoneum pro"), `notAllowed` (id "Tidak diperbolehkan", en "Not allowed", fr "Non autorisé", ja "禁止事項", zh-Hans "禁止事项", la "Non licet"), `knowBeforeYouGo` (id "Yang perlu diketahui", en "Know before you go", fr "À savoir avant de partir", ja "事前にご確認ください", zh-Hans "出行须知", la "Ante iter scienda").
5. Renderer `renderPractical`: groups in this order: included, notIncluded, whatToBring, notSuitableFor, notAllowed, localTips (label `knowBeforeYouGo`), emergency contacts; drop blank entries (this also closes follow-up F-R3-2).
6. Update `draft.ts`, `preview.ts` (content diagnostic paths), `fixtures-v2.ts`, `render-fixture.ts`, contracts/store tests (expected version `web-2.1.0`; healthSafety-to-localTips migration test; migration 4 backup test), editor `labels.ts` (`notSuitableFor`, `notAllowed`, `knowBeforeYouGo`; remove `healthSafety`), `model.ts` `normalizeBlanks` (new lists in, `healthSafety` out).

Stage S2 — OTA options:

1. `config/web/practical-options.json` (new): `{ "version": 1, "locales": { "id": { … }, "en": { … } } }` with keys `included`, `notIncluded`, `whatToBring`, `notSuitableFor`, `notAllowed`, `localTips`, `policies`, each an array of strings, in the order below (index i of `id` and `en` mean the same thing).
2. `OptionList` component (`src/editor/fields.tsx`): for a list field, shows the locale's options as checkbox chips (checked = the exact string is in the list), then the custom entries as editable rows, then "Tambah lainnya". Unchecking removes that string; custom rows behave like today's `TextList` rows. `data-field-path` stays on each row input and on each chip checkbox (`<path>`, e.g. `included[]`). If `trip.language` is unset or has no options, show only the custom rows and the hint "Pilih bahasa konten untuk melihat pilihan umum."
3. Terms & conditions: `PolicyOptions` above the `policies` textarea. Checking an option appends it as a new line to `policies`; unchecking removes that exact line. The textarea stays editable.
4. Test: every option string, in both locales, run through the preview content checks (the price/opening-hours/promotion pattern guards) must produce no diagnostic. If one does, report it in the stage log and drop that option; do not change the guards (RULES 11c).

Option lists (from GetYourGuide/Viator listing structure; `id` | `en`):

- **included:** Pemandu wisata lokal | Local tour guide; Penjemputan dan pengantaran hotel | Hotel pickup and drop-off; Transportasi ber-AC | Air-conditioned transport; Tiket masuk objek wisata | Entrance fees; Air mineral | Bottled water; Sarapan | Breakfast; Makan siang | Lunch; Makan malam | Dinner; Camilan | Snacks; Parkir dan tol | Parking and toll fees; Bahan bakar | Fuel; Peralatan aktivitas | Activity equipment; Akomodasi | Accommodation; Asuransi perjalanan | Travel insurance; Pajak dan biaya layanan | Taxes and service charges.
- **notIncluded:** Tip untuk pemandu dan sopir | Tips for the guide and driver; Pengeluaran pribadi | Personal expenses; Makanan dan minuman di luar program | Food and drinks not mentioned; Penjemputan dan pengantaran hotel | Hotel pickup and drop-off; Tiket masuk objek wisata | Entrance fees; Asuransi perjalanan | Travel insurance; Tiket pesawat | Flights; Biaya visa | Visa fees; Aktivitas opsional | Optional activities; Retribusi atau biaya lokal di lokasi | Local levies paid on site; Paket foto dan video | Photo and video packages.
- **whatToBring:** Paspor atau kartu identitas | Passport or ID card; Pakaian yang nyaman | Comfortable clothes; Sepatu yang nyaman untuk berjalan | Comfortable walking shoes; Topi | Hat; Kacamata hitam | Sunglasses; Tabir surya | Sunscreen; Obat nyamuk | Insect repellent; Jas hujan atau payung | Raincoat or umbrella; Baju ganti | Change of clothes; Pakaian renang dan handuk | Swimwear and towel; Uang tunai | Cash; Jaket | Jacket; Pakaian sopan yang menutup bahu dan lutut | Modest clothing covering shoulders and knees; Botol minum isi ulang | Refillable water bottle; Kamera | Camera; Power bank | Power bank.
- **notSuitableFor:** Ibu hamil | Pregnant women; Pengguna kursi roda | Wheelchair users; Orang dengan keterbatasan mobilitas | People with mobility impairments; Anak di bawah 5 tahun | Children under 5 years; Bayi di bawah 1 tahun | Babies under 1 year; Orang dengan gangguan jantung | People with heart problems; Orang dengan masalah punggung | People with back problems; Orang dengan gangguan pernapasan | People with respiratory problems; Orang yang takut ketinggian | People with a fear of heights; Orang yang tidak bisa berenang | Non-swimmers; Orang yang mudah mabuk laut | People prone to seasickness; Orang berusia di atas 70 tahun | People over 70 years.
- **notAllowed:** Hewan peliharaan | Pets; Merokok | Smoking; Minuman beralkohol | Alcohol; Drone | Drones; Koper atau tas besar | Luggage or large bags; Celana pendek dan baju tanpa lengan di tempat ibadah | Shorts and sleeveless tops at places of worship; Makanan dan minuman dari luar | Outside food and drinks; Memberi makan hewan | Feeding animals; Senjata atau benda tajam | Weapons or sharp objects; Fotografi dengan lampu kilat | Flash photography; Menginjak terumbu karang | Standing on coral.
- **localTips (Yang perlu diketahui):** Jadwal dapat berubah karena cuaca atau lalu lintas | The schedule may change due to weather or traffic; Harap tiba di titik kumpul 15 menit lebih awal | Please arrive at the meeting point 15 minutes early; Diperlukan kebugaran tingkat sedang | A moderate level of fitness is required; Banyak berjalan kaki dan naik tangga | Involves a lot of walking and stairs; Kenakan pakaian sopan saat mengunjungi tempat ibadah | Dress modestly when visiting places of worship; Sinyal ponsel terbatas di beberapa lokasi | Mobile signal is limited in some areas; Bawa uang tunai karena tidak semua tempat menerima kartu | Bring cash as not all places accept cards; Anak-anak wajib didampingi orang dewasa | Children must be accompanied by an adult; Kegiatan ini berlangsung di luar ruangan | This activity takes place outdoors; Tur memerlukan jumlah peserta minimum | A minimum number of participants is required.
- **policies (Syarat & ketentuan):** Pembatalan gratis hingga 24 jam sebelum keberangkatan | Free cancellation up to 24 hours before departure; Pembatalan kurang dari 24 jam sebelum keberangkatan tidak dapat dikembalikan dananya | Cancellations less than 24 hours before departure are non-refundable; Peserta yang tidak hadir tidak mendapat pengembalian dana | No refund for no-shows; Jadwal ulang dapat diajukan hingga 48 jam sebelum keberangkatan, sesuai ketersediaan | Rescheduling is possible up to 48 hours before departure, subject to availability; Jika dibatalkan karena cuaca buruk, Anda dapat memilih tanggal lain atau pengembalian dana penuh | If cancelled due to bad weather, you can choose another date or a full refund; Pembayaran penuh diperlukan untuk mengonfirmasi pemesanan | Full payment is required to confirm the booking; Uang muka tidak dapat dikembalikan | The deposit is non-refundable; Penyelenggara dapat mengubah urutan kegiatan demi keselamatan | The organiser may change the order of activities for safety reasons; Peserta bertanggung jawab atas barang pribadinya | Participants are responsible for their personal belongings.

Stage S3 — wizard (11):

1. App views (`main.tsx`): `setup` (CP034), `home` (draft list + "Buat itinerary baru" with the four mode cards), `editor` (wizard), `settings` (CP034). A header with "Draf saya" and "Pengaturan". The sidebar is removed. `<main>` content is one column on phones.
2. Steps (`src/editor/wizard/steps.ts`): `info` "Info trip" (trip-info); `time` "Waktu & titik kumpul" (time-meeting, not for the guide); `guide` "Guide & foto" (trip-guide + cover); `summary` "Ringkasan"; `plan` "Jadwal" / "Hari demi hari" / "Tempat" (by mode); `practical` "Info praktis"; `terms` "Ketentuan & penutup"; `ai` "Bantuan AI (opsional)"; `publish` "Preview & publish" (save state, diagnostics, preview, publish, publication).
3. `src/editor/wizard/Wizard.tsx`: renders every step's sections inside `<div data-step="<id>" hidden={step !== current}>` (PD-5). Phone: top bar "Langkah N dari M · <title>", sticky bottom bar "Kembali" / "Lanjut" (last step: none). Desktop (≥ 1024 px): a step list on the left with a status per step (done, has errors with count, current). "Simpan draft" stays visible in the top bar on every step.
4. `focusDiagnostic`: find the target element first, then switch to the step of its closest `[data-step]`, wait one render (`requestAnimationFrame`), then open `<details>`, focus and scroll.
5. The registry DOM coverage test keeps rendering `EditorForm` (all steps mounted); add a test that exactly one step is visible at a time.

Stage S4 — validation (10):

1. `src/editor/validation.ts`: `publishIssues(content)` runs `validateForPublish` from `src/contracts/validator.ts` and maps each error to `{ key, step, message }`, where `key = targetIdFor(content, path) + '|' + templatePath(path)` and `message` is Indonesian by code: `PUBLISH_FIELD_REQUIRED` "Wajib diisi sebelum publish."; `SINGLE_DAY_REQUIRED` "Itinerary ini harus punya tepat satu hari."; `MULTI_DAY_COUNT_INVALID` "Itinerary beberapa hari perlu 2–14 hari."; `PLACES_REQUIRED` "Tambahkan minimal satu tempat."; `EMPTY_DAY` "Setiap hari perlu minimal satu aktivitas."; `ACTIVITY_ORDER` "Urutkan jam aktivitas dari yang paling awal."; `DURATION_CAP_EXCEEDED` "Total durasi melebihi batas untuk tipe ini."; `TIME_RANGE_INVALID` "Jam selesai harus setelah jam mulai."; `PHOTO_ATTRIBUTION_REQUIRED` "Isi nama fotografer untuk foto ini."; any other code: the validator message. Warnings are not shown as red.
2. `ItemScope` context: `DayCard` wraps day fields in `<ItemScope id={day.id}>`, each activity in `<ItemScope id={activity.id}>`, each place in `<ItemScope id={place.id}>`. Field components look up `issues.get(scopeId + '|' + meta.path)`; when present and (the field was touched, or its step was "submitted" by "Lanjut", or Publish was pressed): red border, `aria-invalid="true"`, message below with `aria-describedby`. Touched = blurred at least once.
3. Step list and phone top bar show the number of issues per step. "Publish itinerary" is disabled while issues exist, with the text "Lengkapi N isian wajib sebelum publish." and a button "Tunjukkan" that focuses the first issue. The server checks remain the final authority.
4. Tests: unit tests for `publishIssues` (each mapped code, key mapping for an activity, a day and a place); a render test that a touched empty required field gets `aria-invalid` and the message; browser: a new draft, press Publish -> red messages appear on title/destination/activity fields, the issue counter matches, fill them -> Publish enabled.

**Gate CP035:** `check:web-types`; full typechecks; all `test:web-*` (contracts/store counts grow with the migration tests); all browser verify scripts (`editor`, `preview`, `publication`, `ai-ui`, `e2e`, `publish-retry`); `verify:web-render` (fixtures updated to 2.1); a migration run on a **copy** of `.runtime` in a temporary folder: all drafts upgrade, backup file exists, counts logged; screenshots `output/web-editor/cp035-<mode>-step-<id>-{390,1280}.png` for at least `info`, `plan`, `practical`, `publish` per mode, plus one showing red validation, opened and described. Published page screenshot showing the two new practical groups.

### CP036 — Google Places autocomplete (8, 9)

1. Config: `GOOGLE_PLACES_API_KEY` (server only), `GOOGLE_PLACES_DAILY_LIMIT` (default 300, 0-5000), via `envLimit`.
2. Provider (`src/server/places/provider.ts`): interface `PlacesProvider { readonly configured: boolean; autocomplete(input: { text: string; sessionToken: string; languageCode: string | null }): Promise<Array<{ placeId: string; mainText: string; secondaryText: string }>> }`. Google implementation: `POST https://places.googleapis.com/v1/places:autocomplete` with headers `X-Goog-Api-Key`, `X-Goog-FieldMask: suggestions.placePrediction.placeId,suggestions.placePrediction.structuredFormat`, body `{ input, sessionToken, languageCode }`; 5 s timeout; map `suggestions[].placePrediction` to the shape above; drop non-place suggestions. Never log the key or the full response.
3. Usage counter: migration 5 creates `places_usage(day TEXT PRIMARY KEY, count INTEGER NOT NULL)`; the server increments it per Google request (UTC day) and refuses when `count >= limit`.
4. Route `POST /api/v1/places/autocomplete` (same-origin write guard like other POST routes): body `{ text: 3-100 chars, sessionToken: uuid }`; uses the draft language when sent as `languageCode` (optional, one of the six). Responses: 200 `{ suggestions, remainingToday }`; 503 `PLACES_UNAVAILABLE` "Autocomplete Google belum diatur; ketik manual." when no key; 429 `PLACES_DAILY_LIMIT` "Batas harian autocomplete tercapai; ketik manual sampai besok."; 502 `PLACES_FAILED` on provider error. `createApp` accepts an optional `placesProvider` for tests.
5. Editor `PlaceAutocomplete` (`src/editor/fields/PlaceAutocomplete.tsx`): ARIA combobox (input `role="combobox"`, `aria-expanded`, `aria-controls`, listbox with `role="option"`, Arrow/Enter/Escape). Debounce 300 ms, minimum 3 characters, one `crypto.randomUUID()` session token per focus-to-selection, at most 5 suggestions. Shows the Google attribution required when Places data appears without a Google map (use the official Google Maps logo asset, stored locally under `src/editor/assets/`; if you cannot obtain the official asset, stop and ask instead of improvising). Selecting fills the field with `mainText`. The input remains free text at all times.
6. Use it for `days[].activities[].place` and `meeting.place`. For the meeting point, selecting also sets `meeting.mapsUrl` to `https://www.google.com/maps/search/?api=1&query=<encodeURIComponent(mainText + ', ' + secondaryText)>&query_place_id=<placeId>` (PD-1). The Maps link field stays editable.
7. Tests: route tests with a provider double (validation, 503 without key, limit reached -> 429 and no provider call, usage counted per day, error -> 502, key never in responses). Editor tests for the combobox. `scripts/web/verify-places.ts` (new, `npm run verify:web-places`): app with a provider double; type in an activity place and the meeting point, pick with the keyboard, check the stored values and the Maps URL, cap reached message, zero external requests. `package.json`: add the `verify:web-places` script only.
8. **Gate CP036:** full typechecks; all `test:web-*`; `verify:web-places` plus the other browser scripts; screenshots of the dropdown at 390 and 1280. Owner-only live check (not part of the gate): with a real key in `.env.web`, one manual search per field, logged as done or skipped.

## Data Flow or Control Flow

- Setup -> `PATCH /itinerary-engine/profile` (new fields) -> `POST /itineraries` uses profile defaults -> editor wizard edits the draft locally -> "Simpan draft" `PATCH` -> Preview/Publish on the saved revision (unchanged server checks).
- Editor validation is advisory and immediate; the server's `validateForPublish` remains the gate.
- Autocomplete: editor -> `POST /api/v1/places/autocomplete` -> server checks cap -> Google -> suggestions -> user picks -> text (and Maps URL for the meeting point) stored in the draft. Renderer and public pages never call Google.

## Files and n8n Workflows Affected

No n8n workflows. Main files: `src/editor/**` (fields, sections, main, new `setup/`, `settings/`, `wizard/`, `validation.ts`, `fields/PlaceAutocomplete.tsx`), `src/server/app.ts`, `main.ts`, `draft.ts`, `store.ts`, `preview.ts`, new `src/server/places/`, `src/contracts/types.ts`, generated types, new `upgrade-v2.ts`, `upgrade-v1.ts` (pipe), `config/web/itinerary.schema.json`, `field-registry.json`, `locales/*.json`, new `practical-options.json`, `src/render/render.ts`, `.env.web.example`, docs (`standalone-development.md`, `editor-ai-api-contract.md`, `engine-runtime-contract.md`), tests and verify scripts, `package.json` (`verify:web-places`).

## Security and Failure Handling

- API keys (OpenRouter, Google) live only in `.env.web` (git-ignored) or the process environment; never in the client bundle, logs, responses, plans or screenshots.
- The places route keeps the same-origin guard and validates input length; the daily cap is enforced before calling Google; failures degrade to manual typing.
- Migration 4 backs up before changing drafts and runs in one transaction; failure leaves data untouched and the server refuses to start with a clear error (same as migration 3).
- Option strings pass the existing content guards.

## Verification Plan

Per-CP gates above. Visual checks per RULES 11a at every CP (phone 390 and desktop 1280 screenshots opened and described). Negative checks: unsupported locale cannot be selected; Setup cannot finish with an invalid guide; Publish stays disabled with an empty required field; autocomplete stays usable as plain input with no key and after the cap.

## Acceptance Criteria

1. Choosing a language from the dropdown makes Preview work; typing language names is impossible; a missing language gives a specific Indonesian message.
2. With one OpenRouter key in `.env.web`, the AI panel reports AI active after restart; with none or two keys, it tells the owner exactly what to do; no key is ever displayed.
3. First run shows Setup; new drafts get the default country and language; guides are picked from a list and fill name and phone; photos can be uploaded from the photo field.
4. Practical info shows OTA options (id/en) with free text, the two new lists render on the public page, "Kesehatan & keselamatan" is gone and its old content appears under "Yang perlu diketahui"; terms & conditions can be picked or typed.
5. The editor is a step-by-step wizard on phone and desktop; required empty fields show red messages after touch/Lanjut/Publish; Publish is disabled until they are filled.
6. Activity place and meeting point offer Google suggestions through the server, capped at 300 requests per day, with attribution; the meeting point also gets a Maps link; everything still works by typing when Google is unavailable.
7. All gates pass; existing drafts migrate to `web-2.1.0` with a backup; published pages are unchanged.

## Risks and Rollback

- Google Maps Platform terms: storing the chosen place name in a published itinerary relies on it being the user's confirmed text; only the place ID is stored as Google data (in the Maps URL). The owner should confirm with Google's current policy page before public launch.
- Google billing account required even inside the free quota; the cap limits exposure.
- Schema 2.1 migration touches every draft; rollback = restore the migration 4 backup and the previous release.
- The wizard changes many selectors in verify scripts; assertions must be kept (H0).
- Rollback per CP: revert that CP's commits; CP035 additionally needs the data backup if migration 4 ran on real data.
