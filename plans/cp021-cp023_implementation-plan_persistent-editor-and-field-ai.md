# CP021–CP023 Implementation Plan: Persistent Editor and Field AI

**Tanggal:** 2026-10-06.
**Status:** planning selesai; implementasi CP021–CP023 belum dimulai.
**Workspace:** `D:\.agents\Micro Saas\itinerary-engine`.
**Authority:** `SPEC.md` v3.1, `TODOS.md`, `RULES.md`, canonical contract `web-1.0.0`.
**Peran:** worker mengeksekusi dan mengumpulkan evidence; planner mengevaluasi chapter setelah CP023.

## Objective

Membangun aplikasi lokal/private yang benar-benar menyimpan draft/profile/asset, menyediakan editor empat mode, dan menawarkan AI overview/deskripsi per field tanpa mengambil alih data guide.

| CP | Hasil yang diverifikasi sendiri | Gate sebelum eksekusi |
|---|---|---|
| CP021 | Fastify + SQLite/filesystem + shell React yang dapat create/save/reopen draft dan profile/assets. | CP019 completed, log tersedia, foundation planner ACCEPT. |
| CP022 | Editor seluruh field relevan, repeaters empat mode, stable IDs/order, manual save dan conflict handling. | CP020 dan CP021 completed beserta log. |
| CP023 | Language resolution dan AI suggestion per field, explicit Apply/Discard, local usage/idempotency, live provider evidence. | CP022 completed beserta log. |

Urutan wajib CP021 → CP022 → CP023. Satu CP `in_progress`; completion log terpisah per CP. Chapter berhenti sebelum CP024 dan diserahkan kepada planner untuk ACCEPT/REVISE.

## Clarifications and Decisions

Structured Ask Question dijawab pengguna pada 2026-10-06:

| ID | Pertanyaan/keputusan | Jawaban dan konsekuensi |
|---|---|---|
| D21-1 | Satu chapter atau tiga plan? | **Satu chapter**: satu file ini, eksekusi berurutan, dependency/log gate tetap per CP, evaluasi planner di akhir. |
| D22-1 | Save manual atau autosave? | **Save manual**: tombol Simpan, status saved/unsaved/saving/error/conflict, peringatan keluar ketika unsaved. Save sebelum Generate AI. |
| D23-1 | Limit lokal dan biaya live test? | **30 operasi AI/workspace/hari**, configurable server-side; **US$2 maksimal total live test chapter**, termasuk enam locale. Periksa tarif/capability sebelum call; tidak substitusi model diam-diam. |

Keputusan teknik dalam scope yang disetujui:

- Node.js 24+, Fastify 5, `node:sqlite`, React/TypeScript/Vite dan Tailwind CSS v4; dependency exact versions dikunci saat implementasi, Puppeteer `25.1.0` dipertahankan.
- Satu workspace dipilih server, API `127.0.0.1:3000`, Vite `127.0.0.1:5173` dengan proxy `/api`; data root `.runtime/` atau override konfigurasi server.
- UI awal memakai label Indonesia yang jelas; locale brochure/AI tetap mengikuti `languageContext` dan katalog foundation. Bahasa UI bukan override bahasa konten manual.
- Tidak menambah autosave, signup atau JSON editor sebagai pengganti form. AI Apply mengubah buffer lokal saja, menjadi unsaved; persist melalui Simpan eksplisit.
- `openai/gpt-6-luna` adalah model target yang tercatat di CP018. Catalog/credential presence bukan bukti autentikasi atau inference; worker membuktikannya pada CP023.
- Detection bahasa lokal memakai classifier dengan mapping ISO → BCP 47, bukan paid generation tambahan. Threshold merupakan heuristic yang diuji, bukan probabilitas statistik. Input pendek/bercampur atau script ambigu meminta pilihan guide.
- Default AI satu operasi aktif/workspace, maksimal dua operasi baru/menit, timeout total 45 detik, maksimum satu retry hanya untuk penolakan provider yang jelas retryable. Semua angka configurable server-side dengan batas validasi.

## Scope

- Persistence nyata untuk satu workspace/profile, draft canonical + metadata record, asset metadata/files dan AI operations/usage ledger.
- API context/profile/assets/list/create/read/save draft; request/response schemas dan error envelope yang ketat; optimistic concurrency.
- Shell frontend, typed API client, draft list/create/open, profile dan upload asset; editor dinamis untuk empat mode berdasarkan field registry.
- Manual save, empty/incomplete drafts, stable IDs, mode-change confirmation, keyboard reorder, field errors dan conflict resolution tanpa kehilangan input.
- Brief/catatan faktual dan language context sebagai metadata record, bukan field canonical baru; language detection/override, capability state, AI overview/description dengan explicit suggestion lifecycle.
- Integration test database/filesystem nyata, browser user flows phone/desktop, live OpenRouter test terbatas dan evidence per CP.

## Out of Scope

- CP024 preview endpoint/UI dan full publish-quality/travel/policy validator; CP025 publish/share/version server; CP026 durable PDF export jobs.
- Laravel, auth/signup multi-guide, subscription/billing, CORS lintas aplikasi, deployment publik, realtime collaboration atau offline sync.
- AI membuat rute/tempat/jadwal, mengubah field manual, stock-photo acquisition atau arbitrary URL fetch.
- Perubahan schema/registry/renderer/workflow n8n foundation yang telah completed. Jika seam foundation ternyata perlu perubahan perilaku, catat temuan dan lakukan revision gate CP asal sebelum mengubahnya.
- Commit/push/deploy atau paid provider call saat penulisan plan ini.

## Current-State Findings

1. Foundation CP018–CP020 memiliki completion logs; planner re-evaluation 2026-10-06 memberi ACCEPT. `TODOS.md` masih memiliki kalimat menunggu re-evaluasi yang perlu disinkronkan dengan verdict tersebut.
2. `src/contracts/` menyediakan generated types, `LanguageContext`, draft/publish structural validator, normalization dan legacy adapter. Normalization meng-clone input dan menyinkronkan derived contact/pace/themes dengan diagnostics.
3. `config/web/field-registry.json` menginventarisasi 89 leaf paths; tiga field AI-assisted adalah overview summary, activity description dan spot description. Batas canonical summary/activity description 4.000 karakter; spot description 6.000 karakter.
4. Draft boleh memiliki teks kosong/repeater kosong tetapi wajib bentuk canonical lengkap dan tipe benar. `validateDraft` bukan JSON merge-patch validator; buat draft factory yang mengisi seluruh properti required dengan empty/null yang sah.
5. Schema canonical tidak memuat record metadata, language request/source, brief atau notes AI. `LanguageContext` type sudah ada; belum ada SQLite record/repository atau API DTO schemas.
6. `docs/engine-runtime-contract.md` menetapkan route families, error envelope dan limit, tetapi belum menyediakan implementasi request/response schemas. Kalimat bahwa final request schemas ada di CP019 tidak boleh dianggap evidence bahwa endpoint DTO sudah tersedia.
7. Belum ada Fastify server, SQLite migrations/persistent repositories, frontend React, typed browser API client atau provider adapter. Package saat ini adalah contracts/render tooling; frontend/server dependencies belum dipasang.
8. Renderer CP020 adalah pure offline module dengan enam katalog/font fixtures (`la`, `fr`, `en`, `id`, `ja`, `zh-Hans`); render unsupported locale terpisah dari validitas BCP 47 schema.
9. Limit yang sudah dikunci: canonical JSON request 2 MiB, upload image 5 MiB, resolved render assets 20 MiB, HTML 64 MiB. CP018 belum mengimplementasikan quota ledger atau menetapkan semua angka AI; default AI di plan ini adalah keputusan baru, bukan hasil test CP018.
10. `src/styles/tokens/` belum ada. Gunakan semantic tokens minimal di stylesheet editor Tailwind v4, selaras warna/type renderer; jangan membangun design-system package terpisah.
11. Working tree memiliki banyak perubahan/untracked foundation. Inspeksi sebelum edit; tidak reset/clean atau overwrite artefak pengguna.

## Proposed Changes

### CP021 — Engine API and Draft Persistence

1. Verifikasi dependency logs dan verdict; tandai hanya CP021 `in_progress` saat eksekusi benar-benar mulai. Tambahkan dependency server/frontend yang diperlukan dengan lockfile, scripts dev/build/start/typecheck/test tanpa menghapus scripts existing.
2. Pisahkan server bootstrap dari app factory untuk integration tests. Vite dev proxy dan production static build memakai API same-origin. Startup default loopback; konfigurasi exposure non-loopback ditolak pada scope lokal ini sampai deployment boundary direncanakan.
3. Konfigurasi data root tervalidasi, SQLite `foreign_keys=ON`, migration version table, transactions dan bounded busy timeout. Database/file dibuat hanya di root server; app tidak menyajikan `.runtime/` sebagai static directory.
4. Buat tabel minimal:
   - `workspaces`: UUID stabil, profile JSON tervalidasi, profile revision, timestamps; initial workspace dibuat sekali, bukan setiap restart.
   - `itineraries`: UUID, workspace FK, schema version, revision, canonical draft JSON, language-context JSON, writing-context JSON (brief + catatan faktual yang ditargetkan stable ID), timestamps. Published fields tetap nullable/reserved, tanpa implementasi publish.
   - `assets`: UUID, workspace FK, storage key, MIME aktual, byte size, dimensions, safe display filename, attribution defaults opsional, timestamps.
   AI operations/usage tables ditambahkan melalui migration CP023, bukan membuat runtime AI pura-pura di CP021.
5. UUID itinerary/asset dibuat server. IDs block/activity/spot dibuat satu kali ketika item ditambahkan (browser `crypto.randomUUID()`), tervalidasi canonical, tidak diganti saat save/reopen/reorder. Metadata record tidak dapat ditulis lewat `draftContent`.
6. Definisikan DTO schemas yang reject unknown properties; gunakan foundation validator untuk content. Request create memakai mode, optional canonical content dan metadata yang diizinkan; response mengembalikan record normalized. PATCH draft mengganti document lengkap dengan `expectedRevision`, bukan arbitrary JSON-path patch. Language metadata harus konsisten dengan `brochure.outputLanguage`; auto/unresolved boleh disimpan.
7. Buat draft factory valid untuk semua mode. Agency defaults disalin pada create saja; perubahan profile tidak menimpa draft existing. `generatedDate` diberikan dari create context server; save tidak diam-diam mengganti manual copy/order/IDs.
8. Implement route contract berikut dalam `docs/editor-ai-api-contract.md` dan server:

| Method/path | Request/response minimum |
|---|---|
| `GET /api/v1/itinerary-engine/context` | Workspace summary, profile/defaults, limits, locale/render capabilities, access mode; AI state `not_implemented` pada CP021, bukan usage/model success palsu. |
| `GET/PATCH /api/v1/itinerary-engine/profile` | Profile + revision; PATCH `expectedRevision` dan editable agency defaults, CAS `409`. |
| `POST /api/v1/assets` | Multipart satu image; response asset metadata/ID, tanpa server path. |
| `GET /api/v1/assets` | Workspace-owned asset list dengan pagination untuk picker. |
| `GET /api/v1/assets/{id}` | Private image bytes milik workspace, MIME benar dan `nosniff`; ID bukan filepath. |
| `GET /api/v1/itineraries` | Cursor pagination summaries milik workspace, tanpa semua canonical documents sekaligus. |
| `POST /api/v1/itineraries` | Create draft; `201` record revision awal + normalized content/warnings. |
| `GET /api/v1/itineraries/{id}` | Record, language/writing metadata dan content untuk editor. |
| `PATCH /api/v1/itineraries/{id}` | `{expectedRevision, draftContent, languageContext, writingContext}`; atomic revision compare-and-swap; success normalized record + warnings. |

9. Workspace dipilih request context server; reject browser workspace/tenant fields. Semua record/asset lookup wajib workspace predicate. Unknown atau foreign record/asset memberi `404`, tidak mengungkap metadata.
10. Validate image dari byte signature dan decode aktual (misalnya Sharp), bukan MIME header/extension. Awal mendukung JPEG/PNG/WebP; reject SVG/HTML/polyglot yang tidak decode aman, oversized upload (5 MiB), dimensions >8.192 px atau >16 megapixel. Re-encode raster dan strip metadata; hasil tersimpan juga memenuhi 5 MiB. Attribution dari guide tetap data, tidak diganti dengan klaim lokasi foto.
11. Storage key UUID server; streaming multipart bounded, temporary file UUID, rename final setelah decode. DB/file failure dibersihkan dalam `finally`; startup reconciliation hanya membersihkan orphan upload milik engine yang aman, tidak menghapus referenced assets. Referensi asset di canonical harus workspace-owned; tidak menerima remote URL/file path.
12. Manual save menggunakan `UPDATE ... WHERE workspace_id=? AND id=? AND revision=?` dalam transaction. Conflict `409` memuat current revision, bukan otomatis overwrite. Normalization warnings ditampilkan/tersedia pada response. Gagal validation/storage tidak menaikkan revision atau merusak draft sebelumnya.
13. Shell React minimal: daftar draft, pilih mode/create/open, profile defaults, upload/list asset, save/reopen form dasar; semua request memakai backend nyata. Buffer lokal in-memory mempertahankan input saat network error. Advanced repeaters/form coverage menjadi CP022.
14. Error envelope foundation (`code`, message, field errors, requestId). JSON limit 2 MiB; logging tidak membawa raw content/credential/path. Untuk write endpoints, validate Origin terhadap configured local origins, gunakan explicit request header dari typed client, tidak membuka permissive CORS.
15. Backup/restore pada chapter ini menggunakan engine dihentikan + seluruh data root (database termasuk WAL jika ada + assets). Dokumentasikan dan uji restore konsisten; tidak menjanjikan hot backup.
16. Review → integration/browser tests → revise. Buat `logs/cp021_completion-log_engine-api-and-draft-persistence.md`; baru tandai completed dan lanjut CP022.

### CP022 — Dynamic Itinerary Editor

1. Gunakan canonical types dan field registry sebagai sumber labels/control/mode visibility/limits. Buat komponen kecil untuk text/textarea/select/date/number/list/repeater/asset picker; domain-specific layout lebih penting daripada generic form-builder.
2. Editor groups: informasi perjalanan + bahasa/brief, hero/logo/credits, overview/facts/routes/highlights, schedule atau spots, practical dan closing. Semua manual/AI-assisted field relevan dapat diedit; derived fields read-only dan internal stable IDs tidak tampil sebagai input.
3. Source authoritative tetap `brochure.agencyContact`, `paceLevel`, `themes`; derived copies bukan input kedua. Gunakan normalized response setelah save hanya bila buffer belum berubah sejak request dimulai; edit saat saving tetap unsaved dan tidak tertimpa response lama.
4. Half/full-day memakai satu block dengan aktivitas; tidak ada overnight accommodation. Multi-day menyediakan add/remove/reorder hari dan aktivitas, accommodation/meals/transport/block tip serta 2–14 hari untuk output valid. Draft yang belum lengkap tetap dapat disimpan.
5. Day range berasal urutan dan span block. Default satu hari per block; condensed range hanya tindakan guide eksplisit dengan konfirmasi dan pelestarian aktivitas/copy. Reorder mengubah numeric day positions yang derived, tidak mengganti IDs atau mengarang time/date/manual text. Jika manual block date menjadi tidak konsisten, tampilkan pemberitahuan, bukan silently rewrite.
6. Destination guide memiliki spots/group/area/category/description/duration/best-time/access/tips/pairing/photo, tanpa field jam timeline. Group labels tidak mengubah array order. Banyak tempat memakai payload limit, bukan cap jumlah baru atau pemotongan konten.
7. Add/delete/reorder mempunyai tombol Naik/Turun dan keyboard support, focus management serta nama aksesibel. Delete memberi konfirmasi ketika menghilangkan isi; ID item yang tetap ada tidak berubah.
8. Mode change menunjukkan ringkasan data yang akan dibuang sebelum konfirmasi. Half ↔ full mempertahankan block yang kompatibel; perubahan yang menghapus block/spots/accommodation memerlukan persetujuan eksplisit. Cancel mempertahankan seluruh buffer; tidak melakukan konversi konten/rute otomatis. Shared brochure/overview/practical/closing tetap dipertahankan.
9. Language selector searchable + custom valid BCP 47, termasuk `auto`. Pada CP022 pilihan auto tetap unresolved sampai detector CP023; label capability jelas dan tidak default diam-diam ke English. Brief/catatan tidak diterjemahkan; metadata bukan bagian renderer.
10. Save state machine: `saved → unsaved → saving → saved/error/conflict`. Save manual, inline field errors, retry eksplisit; beforeunload/in-app navigation warning ketika unsaved. Disable double-submit save, bukan seluruh form.
11. Conflict UX menyimpan local buffer, menawarkan lihat latest serta salinan lokal, reload latest dengan konfirmasi, atau reconcile manual lalu submit terhadap latest revision. Tidak ada force-overwrite otomatis. Failed request tetap di halaman dengan input utuh; reopen menunjukkan data server yang terakhir sukses.
12. Tailwind CSS v4 utility-first, mobile-first (`390×844`) dan desktop (`1440×1000`), semantic tokens minimum, hover/focus/active/disabled states, keyboard navigation, native labels dan error associations. Tidak perlu menambah component framework bila native controls cukup.
13. Review coverage matrix registry → UI → canonical round-trip, lalu test flow empat mode, 14 hari, 60 spots, panjang teks/CJK, upload/credits, delete/reorder/mode cancel, conflict dua tab, edit-saat-save dan restart. Buka screenshot/app hasil render untuk visual verification; assertion DOM saja tidak menggantikan visual review.
14. Buat `logs/cp022_completion-log_dynamic-itinerary-editor.md` sesudah semua gate lulus. CP023 baru dimulai setelah status completed.

### CP023 — Field-Scoped AI Writing

1. Tambahkan migration `ai_operations` + usage ledger: operation UUID, workspace/itinerary/target/type/revision, fingerprint konteks, status, attempt count, reserved allowance/cost, reported tokens/cost dan safe suggestion/error. Tidak menyimpan key/raw provider request dalam logs. Operation result minimal dibutuhkan untuk idempotent replay; tidak menyimpan full prompt/duplicate itinerary.
2. Secret priority injected `OPENROUTER_API_KEY`, lalu optional server-only `OPENROUTER_CREDENTIAL_FILE`. Loader memory-only harus mengenali tepat satu OpenRouter key; missing/ambiguous menghasilkan capability/error actionable. Agent tidak membaca credential file ke context; tidak menaruh key dalam CLI args atau frontend bundle.
3. Preflight ulang catalog `openai/gpt-6-luna` dan current pricing/parameters. Jika absent, auth gagal atau response format tidak dapat dipenuhi, CP023 blocked dengan evidence; tidak fallback model lain. CP018 hanya membuktikan listing dan key presence.
4. Resolve language dari descriptive brief/notes saja, bukan place/brand/contact. Pilihan explicit canonical BCP 47 menang atas detector. Gunakan local classifier `franc` + mapping ISO → BCP 47 (exact versions locked saat dipakai). Baseline auto membutuhkan minimal 80 Unicode characters, top normalized score ≥0,8 dan margin runner-up ≥0,15, serta tidak ada conflicting language pada paragraph yang cukup panjang; score ini heuristic, bukan probabilitas. Uji enam bahasa; low-confidence/mixed/short text `LANGUAGE_UNRESOLVED`, bukan menurunkan threshold demi PASS. Generic Chinese detection tidak membuktikan Hans/Hant: jika script tidak terbukti, minta guide memilih. Tidak membuat enum enam bahasa; bedakan detection/model/render capability.
5. Tambahkan `POST /api/v1/itineraries/{id}/language/resolve`: expected revision, request ID, membaca saved brief/notes, mengembalikan language proposal/reason tanpa menulis draft. Guide mengonfirmasi hasil atau override; UI menerapkan metadata + outputLanguage ke buffer, lalu Simpan sebelum Generate. Tidak melakukan provider call untuk endpoint detector lokal ini.
6. AI endpoints:

| Route | Request | Response |
|---|---|---|
| `POST .../{id}/ai/overview` | `{operationId, expectedRevision}` | `{operationId, itineraryId, revision, target:{kind:'overview'}, locale, text}` |
| `POST .../{id}/ai/description` | `{operationId, expectedRevision, target:{kind:'activity'\|'spot', id}}` | Target ID yang sama, base revision/locale dan satu `text` proposal. |

   Endpoint tidak menerima arbitrary field path/context/provider/model dari browser. Target lookup menggunakan stable ID, bukan index. Salah target/mode/foreign ID ditolak sebelum reservasi quota/provider call.
7. Generate hanya dari saved draft yang revision cocok dan bahasa resolved. Context minimal: locale, destination/mode/themes, guide factual notes, relevant names/areas/type/logistics. Overview boleh memuat urutan tempat/hari yang relevan; description hanya target + konteks lokal yang perlu. Hilangkan agency contact, user/account metadata, storage paths dan unrelated long copy. Jika konteks melampaui limit, minta guide mempersempit notes; tidak drop/truncate diam-diam.
8. Server prompt memisahkan instructions dan untrusted guide notes sebagai data. Minta satu JSON object `{text:string}` tanpa keys tambahan; tidak bergantung `response_format`, sampling `temperature` atau parameter lain yang catalog belum mendukung. Output harus overview atau description saja, tanpa tempat/rute/harga/jam buka baru.
9. Validate JSON shape, nonempty string, Unicode-aware canonical length, selected language/script dan unsupported factual/policy patterns sebelum menawarkan proposal. Tidak menilai CJK lewat word-count spasi. Untuk spot, 40–90 kata adalah target Latin copy, bukan gate CJK universal. Low-confidence output locale atau klaim yang tidak didukung ditolak dengan error terstruktur; detector/regex bukan klaim verifikasi fakta universal.
10. Guards harga/jam operasional match pola klaim sebenarnya, bukan bare words. Sertakan legitimate fixtures seperti “harga tidak dicantumkan”, time slot guide dan “morning visit” yang tetap boleh. Full itinerary publish validators tetap CP024; CP023 memeriksa keluaran AI miliknya.
11. Limit awal: 30 accepted provider operations/workspace/hari UTC, dua operasi baru/menit dan satu inflight; description `max_tokens` 1.024, overview 1.536, context teks maksimal 16 KiB UTF-8 (prompt overhead ikut pengukuran budget). Quota/config hanya server; `429` dengan retry/reset hint, tidak charge karena invalid target/locale/conflict sebelum provider dispatch.
12. Reservasi quota atomik sebelum dispatch. Operation UUID sama + fingerprint sama mengembalikan saved result atau pending state tanpa provider call baru; ID sama dengan payload berbeda `409 OPERATION_CONFLICT`. Retry transport tidak membuat usage record baru. Tokens/cost per attempt diakumulasi bila provider melaporkan billing; logical daily operation dihitung sekali.
13. Total timeout 45 detik, maksimal dua attempts hanya untuk definite retryable rejection (429/503 dan mengikuti Retry-After di dalam deadline). Timeout/disconnect ambigu tidak di-retry otomatis karena provider mungkin sudah menagih. Simpan reservation sebagai consumed/uncertain bila dispatch terjadi; restart menandai interrupted operation, tidak blind replay. Provider rejection yang terbukti belum melakukan inference boleh melepaskan reservation; semua perubahan ledger transaksional.
14. Live-test ceiling **US$2 total**, tidak direset oleh restart/retry. Harness memakai ledger terpisah/dedicated workspace dan reservasi worst-case biaya input/output sesuai tarif terkini (termasuk reasoning/request fees jika berlaku). Jika upper bound tarif/token tidak dapat ditentukan atau sisa budget tidak cukup, hentikan sebelum call; budget jangan hanya diperiksa setelah bayar. Actual/provider usage direkonsiliasi; uncertain dispatch tidak dianggap gratis.
15. Recheck revision dan target setelah provider response, sebelum mengembalikan success. Edit tersimpan/target hilang menghasilkan stale response, tidak mengubah draft; provider usage yang sudah terjadi tetap tercatat.
16. UI field actions Generate/Apply/Discard + loading/timeout/limit/unavailable/stale states. Generate saat unsaved meminta Save lebih dahulu. Capture buffer edit-generation counter + target text/revision; perubahan lokal saat call, walau belum disimpan, membatalkan eligibility Apply. Apply hanya jika base revision/current buffer generation/target masih cocok; ganti satu field → unsaved. Discard tidak mengubah canonical content. Tidak ada AI autosave atau overwrite nama/waktu/durasi/rute/logistics.
17. Review → deterministic provider-double tests → live tests → browser verification → revise. Test double untuk failures bukan pengganti live success. Buat `logs/cp023_completion-log_field-scoped-ai-writing.md`; submission chapter menyertakan log/matrix/evidence kepada planner.

## Data Flow or Control Flow

```text
CP021: guide → same-origin client → server-selected workspace
         → DTO + validateDraft + owned assets → SQLite CAS transaction
         → normalized saved record + warnings → browser buffer/status

CP022: field registry → mode-specific controls → local canonical buffer
         → explicit Save(expectedRevision) → CP021 persistence
         → restart/reopen → IDs/order/manual content tetap

CP023: saved brief/notes → detection proposal / explicit locale
         → guide confirm + Save → Generate(saved revision, stable target, op UUID)
         → atomic quota/cost reservation → OpenRouter → validated proposal
         → server revision check + browser edit-generation check
         → Apply one field to local buffer → explicit Save

Setiap CP: Working → Review → Test → Revise sampai bersih
           → completion log → completed → gate CP berikutnya
Setelah CP023: planner chapter evaluation → ACCEPT atau revision plan
```

Conflict `409`, provider error, invalid output, Discard dan stale result tidak melakukan draft update. Satu-satunya persist perubahan konten editor adalah Save melalui CP021.

## Files and n8n Workflows Affected

Paths berikut adalah target minimal; pengelompokan modul boleh disederhanakan bila tanggung jawab dan gate tetap jelas.

| Path | Ownership/perubahan |
|---|---|
| `src/server/` | CP021 config/bootstrap/app, migrations/repositories, draft/profile/asset routes; CP023 AI routes/ledger/provider/locale resolver. |
| `src/editor/`, root `index.html`, `vite.config.ts` | CP021 shell/client; CP022 controls/repeaters/state/styles; CP023 proposal actions/language resolution. |
| `src/api/` | Shared DTO types/schemas yang berbeda dari canonical content, error mapping; CP021 lalu CP023 extensions. |
| `src/contracts/`, `src/render/`, `config/web/` | Reuse read-only foundation; perubahan perilaku membutuhkan revision gate CP asal. |
| `package.json`, `package-lock.json`, scoped tsconfigs | Exact pinned dependencies dan dev/build/start/typecheck/test scripts; preserve existing gates. |
| `tests/web/api.test.ts`, `editor.test.ts`, `ai.test.ts`, `tests/fixtures/web/` | Meaningful API/state/AI regression fixtures tanpa secrets atau personal raw outputs. |
| `scripts/web/verify-editor.ts`, `verify-ai.ts` | Browser/API evidence harness; live harness hanya opt-in dan budget-reserved. |
| `docs/editor-ai-api-contract.md`, `docs/standalone-development.md` | DTO/status/state/idempotency/limits, run/build/storage/stop-backup-restore dan safe live-test setup. |
| `.env.web.example` | Nonsecret limit/config names, tidak memuat credential values. |
| `.gitignore` | Targeted generated build/data/evidence ignores; pastikan root `index.html` tracked walau existing `*.html` ignore. |
| `TODOS.md`, `logs/cp021_completion-log_engine-api-and-draft-persistence.md`, `logs/cp022_completion-log_dynamic-itinerary-editor.md`, `logs/cp023_completion-log_field-scoped-ai-writing.md` | Status dan factual verification; log hanya dibuat sesudah CP lulus. |
| `output/web-editor/`, `output/web-ai/`, `.runtime/` | Ignored screenshots/request summaries/test DB/assets/live usage evidence; bukan source data produksi. |

Tidak ada n8n workflow/credential/instance atau repo Laravel yang diubah. UI tidak membuka file credential; raw credential source hanya boleh diproses loader server yang aman.

## Security and Failure Handling

- Management endpoints lokal/private, strict same-origin writes dan workspace context server; foreign IDs diuji melalui seeded workspace test meski runtime hanya satu workspace.
- SQL parameterized dan transaction CAS; browser tidak dapat menulis record revision/workspace/storage key/provider settings.
- Upload bounded decode/re-encode, workspace ownership, safe UUID path dan cleanup; asset URLs hanya private API ID, bukan arbitrary network/file fetch.
- No secrets in Vite-prefixed env, client bundle, context response, screenshots, network evidence atau logs. Safe errors memakai code/requestId tanpa raw provider body/stack/path.
- Draft structural validity berbeda dari publish validity: blank draft tetap tersimpan, shape/type/duplicate IDs/invalid references ditolak. AI validation tidak memperbaiki jadwal/manual fields.
- Save failure/conflict/edit-during-save dan stale AI mempertahankan local buffer. Tidak menganggap abort browser sebagai bukti provider tidak menagih.
- Usage/cost reservations durable; quota race, duplicate operations, retries dan crash recovery diuji. Missing pricing/auth/model atau exhausted live budget adalah blocker CP023, bukan mock PASS.
- Foundation revision, materi scope baru atau authority conflict diselesaikan melalui Ask Question dan plan terkait, bukan patch oportunistik.

## Verification Plan

### Gates dan commands

Semua commands baru di bawah adalah **target scripts**, belum tersedia saat plan ditulis. Worker menambahnya saat CP terkait dan mencatat command/result nyata; tidak mengklaim test sudah pass.

| Command | Stage/gate |
|---|---|
| `npm run check:web-types`, `npm run typecheck:web-contracts`, `npm run test:web-contracts`, `npm run test:web-render` | Foundation regression pada semua CP. |
| `npm run typecheck:web-app`, `npm run build:web-app` | Target CP021–CP023: server/editor compile dan Vite/Tailwind production build. |
| `npm run test:web-api` | Target CP021: real SQLite/temp filesystem/API integration. |
| `npm run test:web-editor`, `npm run verify:web-editor` | Target CP022: buffer/repeater state dan browser flow nyata. CP021 menjalankan subset shell/persistence. |
| `npm run test:web-ai` | Target CP023: deterministic provider/ledger/staleness/failure cases. |
| `npm run verify:web-ai -- --live --budget-usd=2` | Target CP023: opt-in OpenRouter calls + persisted budget tracking + safe live evidence. CLI tidak membawa key. |
| `npm run validate`, `npm test`, `npm audit --audit-level=moderate`, `git diff --check` | Existing/package/dependency/doc gates sebelum handoff. |

Brochure renderer tidak berubah di chapter ini; preview/PDF product features belum diuji sebagai app capability. Jika worker harus mengubah renderer, lakukan revision gate dan seluruh visual/PDF regressions termasuk `printBackground:true`.

### CP021 evidence

1. Create incomplete canonical drafts ke real temp SQLite, save/profile/upload asset, close process, start ulang dengan data root sama, reopen; content/profile/asset bytes/IDs/revision tetap.
2. Dua concurrent PATCH dengan revision sama: tepat satu berhasil, lainnya `409`; prior/latest record benar. Validation/storage failures tidak mengubah saved data.
3. Wrong workspace record/asset → `404`; payload workspace/revision injection, unknown props, duplicate IDs, malformed collections, invalid refs/locale, JSON >2 MiB ditolak terstruktur.
4. Upload valid JPEG/PNG/WebP; forged MIME/SVG/invalid decode/5 MiB overflow/pixel bomb/file-write/DB-failure cleanup; private asset read tidak mengungkap file path.
5. Restore stopped full-data-root backup ke root baru dan reopen profile/draft/assets. Catat process restart/restore evidence, bukan in-memory test saja.
6. Buka shell/profile/create/save/reopen di browser; screenshot phone/desktop, error state koneksi gagal dan retained input; pastikan production build hanya menyajikan allowed app/API assets.

### CP022 evidence

1. Form coverage matrix untuk setiap relevant registry path: editable/default/derived/internal beserta mode; zero JSON-edit requirement.
2. Create/edit/save/reopen empat mode dari UI; 14-day dan 60-spot input, long descriptions, accented/CJK values, credits/logistics/emergency. Deep compare stable IDs/order/manual content sebelum dan setelah restart.
3. Keyboard-only add/reorder/delete, confirmation cancel, change mode cancel/confirm, condensed day span, focus/error association; tidak ada hidden data loss.
4. Two-tab conflict, save retry setelah offline, edit saat save, navigation unsaved warning; local input tetap dan no silent last-write-wins.
5. Visual review nyata pada 390×844 dan 1440×1000, layout empat mode, no horizontal overflow/console error; screenshot path dan observation dicatat.

### CP023 evidence

1. Local tests untuk explicit/auto/mixed/short/unresolved language, supported region/script dan unsupported capability; override tidak menerjemahkan manual text.
2. Provider doubles: valid/malformed JSON, wrong-language/script/length, price/opening-hour patterns dan legitimate phrases, 401/429/503/timeout/disconnect, quota race/retry/idempotency/crash/uncertain billing. Assert invalid requests tidak dispatch provider.
3. Stale saved revision, deleted target, moved target ID, local unsaved edit selama request, duplicate op/fingerprint mismatch, Apply/Discard. Deep diff canonical: sebelum Apply tidak berubah; sesudah Apply tepat satu target string berubah; sesudah Save hanya normalization yang terdokumentasi menambah perubahan derived.
4. Live preflight dengan safe configured/auth/catalog/price summary. Jalankan overview dan description pada enam locale `la/fr/en/id/ja/zh-Hans` (12 success cases), meliputi activity dan spot description across matrix; budget US$2 mencakup seluruh calls/retries. Minimal Jepang atau Mandarin harus benar-benar diuji. Jika budget/model/locale tidak memungkinkan, catat blocker dan tanyakan keputusan; jangan menurunkan matrix atau mengklaim support.
5. Reviewer menilai live copy mengikuti locale, target/context, tidak mengarang facts dan tidak membocorkan notes instructions. Bukti: operation IDs, model ID, status, token/cost metadata yang tersedia dan field-diff summary, bukan key/raw prompt/personal content.
6. Browser Generate/Apply/Discard/error/limit/stale flows phone/desktop dengan server nyata; manual writing/save tetap tersedia saat provider unavailable.
7. Completion logs factual dan acceptance matrix chapter diserahkan ke planner. Setiap finding Review/Test di-revise lalu diulang sebelum CP completed.

## Acceptance Criteria

| ID | PASS bila evidence menunjukkan |
|---|---|
| R21-1 | Engine/server/editor shell berjalan mandiri dengan SQLite/filesystem nyata; build/dev/start terdokumentasi dan Laravel/n8n tidak diperlukan. |
| R21-2 | Incomplete draft, profile dan assets bertahan setelah restart/restore; canonical shape/IDs/manual text tetap. |
| R21-3 | Workspace boundary, upload validation/cleanup, error envelope dan limits teruji; secret/path tidak ke browser. |
| R21-4 | Atomic revision checking menangani concurrent saves; failed/conflicting save mempertahankan input dan prior server data. |
| R21-5 | Integration/browser evidence dan completion log tersedia sebelum CP022. |
| R22-1 | Semua relevant manual/AI-assisted fields tersedia lewat form; derived/internal fields memiliki alasan disposition, tanpa duplicate authoritative controls. |
| R22-2 | Empat mode, 2–14 hari, many-spots, keyboard reorder/stable IDs dan mode-change confirmation lulus UI round-trip. |
| R22-3 | Saved/unsaved/error/conflict/edit-saat-save jelas dan tidak kehilangan data; phone/desktop visuals inspected. |
| R22-4 | Locale override/auto state dan metadata tersimpan tanpa translate manual text; coverage matrix/log tersedia sebelum CP023. |
| R23-1 | Live OpenRouter exact model membuktikan overview/description matrix enam locale dalam budget; auth/model unavailable bukan mock completion. |
| R23-2 | Generate tidak mengubah draft; Apply hanya field target dan tetap manual Save; Discard/stale/local edit tidak overwrite. |
| R23-3 | Language resolution/copy validation/minimal context/instruction boundary teruji; manual fields dan secrets tetap aman. |
| R23-4 | Durable quota 30/hari, rate/concurrency/timeouts, idempotency/retry/uncertain cost accounting dan live ceiling US$2 lulus meaningful cases. |
| R23-5 | Manual edit/save tetap operasional saat AI error/limit; logs/evidence lengkap, planner chapter ACCEPT diperlukan sebelum chapter berikutnya. |

## Risks and Rollback

- **SQLite/filesystem atomicity:** upload memakai UUID temporary + compensating cleanup. Migrations diuji terhadap copied data root; sebelum perubahan persistent schema buat stopped consistent backup. Jangan menghapus DB produksi untuk meloloskan tests.
- **Canonical/UI drift:** generate types dari foundation, registry coverage matrix dan round-trip tests; bila foundation berubah, gunakan revision CP asal, bukan duplicate schema tersembunyi.
- **Race save/AI:** server CAS + browser generation counter; response lama tidak boleh mengganti buffer baru. Conflict/unknown billing diselesaikan eksplisit.
- **Language classifier:** Latin/short notes/Chinese script ambiguity mungkin unresolved; guide override adalah jalur resmi, bukan English fallback. Tidak mengklaim score sebagai confidence statistik.
- **Provider capability/cost:** slug/price/parameters dicek sebelum live calls; reserve worst-case dan fail closed sebelum melebihi budget. Blocker menahan CP023 completed; perubahan budget/model perlu Ask Question.
- **Rollback:** revert hanya perubahan chapter yang dimaksud setelah diff inspection, hentikan engine dan restore seluruh pre-migration data root bila diperlukan; jangan restore database tanpa matching assets. Retain plan/log/evidence kegagalan dan existing foundation/user work.
- **Status:** saat plan ini ditulis semua CP021–CP023 tetap `pending`; checklist planning boleh checked setelah dokumen ada, bukan bukti implementasi atau completion.
