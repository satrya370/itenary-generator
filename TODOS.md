# Itinerary Engine Web App — Checkpoints

**Updated:** 2026-11-05 (revisi guide-centric schema `web-2.0.0` untuk CP019–CP025 diprioritaskan; lalu chapter import CP030–CP032; CP029 paling akhir).
**Authority:** `SPEC.md` v3.2 menentukan scope; `RULES.md` menentukan proses.
**Keputusan pengguna:** engine selesai dulu, satu workspace lokal/private, empat mode; app terpisah + API SaaS Laravel menyusul.
**Status:** CP021–CP023 and CP024–CP025 initial planner reviews ACCEPTed. CP024 V27-01/V27-02/V27-03 and CP025 V27-04/V27-05/V27-06 revisions are logged/pass. CP027 local matrix and CP028 local deployment-readiness both passed; chapter review records ACCEPT as standalone-ready/not-deployed. AWS target remains undecided; public HTTPS/WhatsApp verification needs separate deployment authorization.

**Target Laravel berikutnya:** `D:\belajar-pemograman` (TourFlow, constraint Laravel `^13.17`, Blade/Tailwind v4). Kesiapan SaaS ini bukan dependency CP018–CP028.

## 1. Riwayat dan aturan eksekusi

- CP001–CP017 tidak dihapus/renumber; riwayat lengkap berada di `docs/archive/TODOS-n8n.md`, dengan plan/log lama tetap tersedia.
- CP n8n yang belum selesai tidak menjadi dependency rilis web. Scope yang masih relevan masuk checkpoint web baru secara explicit.
- Arsip memiliki ketidakkonsistenan CP011: overview `pending`, section `in_progress`. Ini dipertahankan sebagai evidence historis dan harus diklarifikasi jika pekerjaan n8n dilanjutkan; bukan status web.
- Sebelum menjalankan CP: dependency completed + log tersedia, Ask Question, lalu implementation plan sesuai `RULES.md`.
- Urutan wajib: Diskusi → Planning → Working → Review → Test → Revise.
- Hanya satu CP `in_progress`. Tidak ada instalasi, kode, API/credential mutation, atau deployment sebelum plan CP terkait tersedia.
- `completed` hanya setelah verification nyata, acceptance criteria lulus, dan `logs/cpNNN_completion-log_<object>.md` tersedia.
- Plan/log CP lama tidak diubah untuk menutupi migrasi. Jika merevisi artefak completed, gunakan revision plan ID asal.
- Implementasi di repo SaaS Laravel harus membaca aturan repo tersebut; checkpoint integrasi tidak boleh dinyatakan selesai hanya dari mock app.
- CP018–CP028 memakai engine backend/storage/AI/publish nyata yang berdiri sendiri. Mock Laravel hanya menguji kontrak future adapter, bukan pengganti persistence atau backend engine.
- CP029 dijalankan setelah Laravel siap. Menunggu CP029 tidak menghalangi status rilis mandiri selesai.
- Keputusan 2026-11-05: CP029 ditunda dan menjadi CP **paling terakhir** dalam roadmap; chapter CP030–CP032 dijalankan lebih dulu. ID tidak di-renumber.

**Chapter CP018–CP020 — standalone engine foundation:** satu Ask Question round dan plan `plans/cp018-cp020_implementation-plan_standalone-engine-foundation.md`; planner ACCEPT 2026-10-06 (lihat `logs/cp018-cp020_planner-review_standalone-engine-foundation.md`). Technical completion tetap bukan klaim full app siap.

**Chapter CP021–CP023 — persistent editor and field AI:** keputusan Ask Question 2026-10-06: satu plan `plans/cp021-cp023_implementation-plan_persistent-editor-and-field-ai.md`, manual Save, limit awal 30 operasi AI/workspace/hari dan live-test budget maksimal US$2 total. Eksekusi CP021 → CP022 → CP023 berurutan dengan satu CP in-progress, log terpisah dan dependency gate per CP; berhenti sebelum CP024, lalu evaluasi planner. Perencanaan tidak memulai implementasi atau provider calls.

**Revision gate 2026-10-07:** user memilih **Bug + gap** lewat structured Ask Question. Audit `logs/cp021-cp023_review-log_bug-and-evidence-audit.md` memberi REVISE. Urutan CP021 → CP023 revision lulus dan tercatat; planner re-review memberi ACCEPT (lihat log tersebut di atas). CP022 tidak memerlukan revision terpisah.

**Chapter CP024–CP025 — preview, publish and share links:** satu chapter/plan `plans/cp024-cp025_implementation-plan_preview-publish-and-share-links.md`; keputusan 2026-10-07 mencakup saved-draft preview + diagnostics, warning jadwal ambigu, link aktif stabil, revoke permanen/token rotation, retained HTML/assets tanpa auto-expiry/delete dan Open Graph preview image. PDF export dihapus dan CP026 removed. Revisions CP024 V27-01/V27-02/V27-03 dan CP025 V27-04/V27-05/V27-06 (server, pending-retry UI, workspace-safe recovery) completed/logged. Planner ACCEPT awal tetap historis; final chapter review setelah E2E. Live WhatsApp card menunggu public HTTPS deployment sesuai W15.

**Chapter CP027–CP028 — standalone verification and deployment readiness:** structured Ask Question 2026-10-07: **Target belum diputuskan** + **Readiness saja**. Satu shared plan `plans/cp027-cp028_implementation-plan_standalone-verification-and-deployment-readiness.md`, CP027 → CP028, log masing-masing. V27-01…06 passed original-CP revisions. CP027 synthetic four-mode/six-locale E2E, publish crash and cross-workspace recovery pass; broader matrix/review remains in progress. CP028 remains pending. Scope CP028: runtime-only release tanpa PDF/browser, local Linux/TLS proxy, backup/restore/rollback dan resource report. Tidak ada AWS provisioning/spend, staging, DNS atau production deploy. Public HTTPS/WhatsApp card test tetap deferred.

**Chapter CP033–CP036 — editor usability, agency setup and place autocomplete (sebelum CP030):** owner test 2026-11-10 menemukan 11 masalah (preview/bahasa, AI key, setup negara & guide, upload foto, opsi OTA, validasi merah, wizard mobile-first, Google autocomplete). Tiga putaran structured Ask Question 2026-11-10. Satu plan bersama `plans/cp033-cp036_implementation-plan_editor-usability-setup-and-places.md`; tiap CP punya completion log sendiri; berhenti untuk review setelah tiap CP.

**Chapter CP030–CP032 — document and text import:** structured Ask Question 2026-11-05 (tiga putaran). Satu shared plan `plans/cp030-cp032_implementation-plan_document-and-text-import.md`, CP030 → CP031 → CP032, log masing-masing, chapter review setelah CP032. Keputusan: hasil import = draft untuk review/edit yang mengisi field canonical asli (tanpa auto-publish); format teks/DOCX/PDF ber-teks (tanpa OCR); tanpa kuota/plafon budget import tetapi biaya tiap import dicatat di ledger terpisah (tidak memakai ledger US$2/kuota 30 harian); data hilang = kosong + warning; deskripsi hanya dari dokumen; guide memilih mode sebelum import; kutipan sumber per field disimpan privat. Status: planned, belum ada eksekusi.

**Revisi CP019–CP025 — guide-centric schema & editor (`web-2.0.0`), PRIORITAS:** structured Ask Question 2026-11-05 (dua putaran) setelah owner melaporkan UI berantakan, field tidak nyambung, dan mode tidak berbeda; audit read-only backend/DB mengonfirmasi cacat schema, editor dan backend. Satu shared revision plan `plans/cp019-cp025_revision-plan_guide-centric-schema-and-editor.md` dengan tahap bergerbang R1 (CP019) → R2 (CP021/CP023) → R3 (CP020) → R4 (CP024/CP025) → R5 (CP022) → R6 regression/E2E/log. Ditujukan untuk dieksekusi Claude Haiku; plan mengunci schema, mapping migrasi, teks UI dan perintah gate. Keputusan: schema + UI dirombak; tetap 4 mode (half ≤6 jam tanpa makan, full ≤12 jam dengan makan); tambah titik/jam kumpul, penjemputan, guide trip, ketentuan; hapus field turunan/duplikat, profil wisatawan, tema/jenis destinasi (diganti warna tema), sorotan/musim terbaik; tempat destination guide wajib nama+area+deskripsi; draft dimigrasi otomatis, snapshot published tetap. Chapter import CP030–CP032 menunggu revisi ini selesai dan plan import direvisi ke `web-2.0.0`.

### Checklist revisi (status CP terkait diubah ke `in_progress` per tahap)

- [x] Ask Question + revision plan (2026-11-05).
- [x] R1 — CP019 (gate run 2026-11-05: pass; Opus re-review 2026-11-10: ACCEPT): schema `web-2.0.0`, generated types, registry v2, validator per mode, `upgradeV1ToV2`, locale keys 6 bahasa, `createBlankDraft` v2. Gate: `check:web-types`, `typecheck:web-contracts`, `test:web-contracts`.
- [x] **Revisi ronde 1 R1/R2 (review Opus 2026-11-05: REVISE; re-review 2026-11-10: ACCEPT, F1-F6 fixed)** — F1 parsing label jam/durasi membuang/merusak data tanpa warning; F2 makan ganda hilang; F3 regresi start tanpa tabel AI; F4 handle DB bocor saat start gagal; F5 catch konflik terlalu luas; F6 teks migrasi → catatan privat + judul rentang hari sesuai bahasa (keputusan owner). Instruksi: plan § "R1/R2 revision round 1" (RV1–RV7). R3 tidak boleh mulai sebelum ronde ini diterima.
- [x] R2 — CP021/CP023 (gate run 2026-11-05 on the amended gate: pass; real-data copy: 6/6 drafts migrated; Opus joint R1+R2 review 2026-11-10: ACCEPT): migration runner nyata + migration 3 (backup `VACUUM INTO`, transaksional, revision tidak naik), `schema_version` saat save, list urut `updated_at` + cursor opaque, publish pending/duplicate fix, asset file hilang → 404, AI paths v2 (`place`). Gate (amandemen): `check:web-types`, `typecheck:web-contracts-v2`, `typecheck:web-server`, `test:web-contracts|store|api|publication|ai`.
- [x] R3 — CP020 (gate run 2026-11-05 after audit: pass, commit ac087dd; stage log `logs/cp020_stage-log_r3-renderer-v2.md`; Opus review 2026-11-10: ACCEPT, follow-ups F-R3-1/F-R3-2 in `logs/cp019-cp025_review-log_r3-r6.md`): renderer v2 (info strip waktu/titik kumpul/penjemputan/guide, layout per mode, ketentuan, kredit foto & ringkasan rute turunan, agensi dari profil). Gate: `test:web-render`, `verify:web-render` + screenshot phone/desktop per mode diperiksa.
- [x] R4 — CP024/CP025 (gate run 2026-11-05 on the amended gate: pass, commit 5b0f183; `verify:web-preview`/`verify:web-publication` moved to the R5 gate; stage log `logs/cp024_stage-log_r4-preview-v2.md`; Opus review 2026-11-10: ACCEPT, E1-E4 accepted): batas 360/720/960 menit, policy scanner path v2, warning titik kumpul, raster decode & focus diagnostik v2, OG dari v2. Gate: `test:web-preview`, `test:web-publication`, `verify:web-preview`, `verify:web-publication`.
- [x] R5 — CP022 (gate run 2026-11-10: pass; stage log `logs/cp022_stage-log_r5-editor-v2.md`; Opus review 2026-11-10: REVISE round 1; fixes RF1-RF6 re-reviewed 2026-11-10: ACCEPT, one extra fix for save-error focus applied): editor dipecah per section, 4 kartu mode + badge warna, section per mode, registry-driven `fieldMeta` + `data-field-path`, teks bahasa awam, mode change membersihkan field. Gate: `typecheck:web-app`, `test:web-editor`, `verify:web-editor` + screenshot per mode.
- [x] R6 (gate run 2026-11-10: pass; skipped with reason: `verify:web-readiness` (Docker daemon not running), `verify:web-ai --live`; stage log `logs/cp019-cp025_stage-log_r6-regression.md`; Opus review 2026-11-10: ACCEPT) — regression penuh + `build:web-release`/`validate:web-release`; revision section di log CP019–CP025; docs kontrak diperbarui; plan CP030–CP032 ditandai perlu revisi.

## 2. Status overview

| CP | Object | Depends on | Status |
|---|---|---|---|
| CP018 | standalone-api-and-runtime-contract | — | completed |
| CP019 | canonical-schema-and-field-registry | CP018 | completed (revision web-2.0.0 accepted 2026-11-10) |
| CP020 | portable-html-renderer | CP019 | completed |
| CP021 | engine-api-and-draft-persistence | CP019 | completed (revision web-2.0.0 accepted 2026-11-10) |
| CP022 | dynamic-itinerary-editor | CP020, CP021 | completed (revision web-2.0.0 accepted 2026-11-10) |
| CP023 | field-scoped-ai-writing | CP022 | completed (revision web-2.0.0 accepted 2026-11-10) |
| CP024 | draft-preview-and-publish-validation | CP023 | completed (revisions passed) |
| CP025 | published-web-link-and-versioning | CP024 | completed |
| CP026 | removed-pdf-export | — | removed from product scope |
| CP027 | standalone-end-to-end-verification | CP025 | completed |
| CP028 | standalone-deployment-readiness | CP027 | completed (standalone-ready / not deployed) |
| CP033 | language-preview-and-ai-key-fixes | revisi `web-2.0.0` selesai | in_progress (gate run 2026-11-10: pass; awaiting review) |
| CP034 | agency-setup-profile-defaults-and-photo-upload | CP033 | in_progress (gate run 2026-11-10: pass; awaiting review) |
| CP035 | ota-practical-fields-wizard-and-validation | CP034 | in_progress (S1-S4 gate run 2026-11-11: pass; deviations listed in stage log; awaiting review) |
| CP036 | google-places-autocomplete | CP035 | in_progress (gate + review fixes done 2026-11-11; default provider now Photon/OSM, no card; Google optional; awaiting owner acceptance) |
| CP030 | import-intake-and-parser | CP033–CP036 diterima | in_progress (working 4e08bac, review + revisi 55f5160 selesai, gate hijau 2026-11-11; menunggu penerimaan owner) |
| CP031 | import-ai-merge-and-write | CP030 | pending |
| CP032 | import-ui-and-e2e | CP031 | pending |
| CP029 | laravel-saas-integration | CP032 + kesiapan SaaS Laravel | pending (deferred — last) |

Setiap CP menghasilkan satu hasil yang dapat diverifikasi. CP018–CP028 dan CP030–CP032 adalah fase A (standalone); CP029 fase B (integrasi SaaS) dan dijalankan paling akhir. Urutan eksekusi mengikuti tabel ini, bukan urutan angka ID. Nomor CP yang belum dieksekusi dipertahankan; scope/object disesuaikan keputusan terbaru, bukan menulis ulang hasil pekerjaan completed.

## CP018 — Standalone API and Runtime Contract

**Status:** completed · **Depends on:** —
**Plan:** `plans/cp018-cp020_implementation-plan_standalone-engine-foundation.md` (§ Proposed Changes — CP018)
**Log:** `logs/cp018_completion-log_standalone-api-and-runtime-contract.md`

**Hasil:** kontrak app dan runtime mandiri yang dapat dibangun tanpa menunggu SaaS.

- [x] Ask Question: library/backend, port/origin, workspace profile, SQLite/storage directories, AI provider/model, dan Node/Chromium runtime.
- [x] Tetapkan OpenRouter sebagai provider dan GPT-6 Luna sebagai target; verifikasi exact API model ID/slug serta dukungan request sebelum live test.
- [x] Tentukan secret loading lokal dari `D:\.agents\Micro Saas\Credential_information.md`; probe lokal hanya mengembalikan status, bukan raw key. Deployment menggunakan secret store/environment injection.
- [x] Tetapkan auto-detection bahasa brief, locale tag, manual override saat bahasa campur/tidak yakin, dan capability locale/font/model.
- [x] Verifikasi baseline yang disetujui: Node.js 24+, TypeScript/Fastify, `node:sqlite`, React/Vite/Tailwind v4, file storage dan browser service. Direct local Chromium launch timed out; Puppeteer/print verification adalah bukti historis CP020 renderer, bukan komitmen product PDF export.
- [x] Tetapkan endpoint/payload/response/version/error contract, timeout, asset/payload limits, local AI usage/rate limits dan idempotency.
- [x] Tetapkan local/private access boundary, share-link origin/retention, workspace deletion, serta revoke/cache policy.
- [x] Definisikan future identity/entitlement adapter boundary dengan target `D:\belajar-pemograman`; akses API Laravel bukan blocker fase A.
- [x] Tetapkan storage layout, migration/backup dan cara menyimpan HTML/asset tanpa kebutuhan cloud atau database Laravel.
- [x] Tulis implementation plan sebelum pekerjaan kontrak/interface dimulai.
- [x] Review kontrak terhadap `SPEC.md` §§2–3, 8–10; unresolved direct Chromium execution dicatat sebagai follow-up CP020.
- [x] Verifikasi contract, runtime probes, package validation/regression test dan availability model/secret tanpa koneksi Laravel.
- [x] Completion log.

**Acceptance:** pemilik data engine, API, workspace, AI, storage, jobs, exposure dan runtime jelas; OpenRouter/GPT-6 Luna API ID dan secret loading server-side terverifikasi; tidak ada dependency Laravel pada jalur utama.

## CP019 — Canonical Schema and Field Registry

**Status:** completed · **Depends on:** CP018
**Plan:** `plans/cp018-cp020_implementation-plan_standalone-engine-foundation.md` (§ Proposed Changes — CP019)
**Revision plan:** `plans/cp019_revision-plan_canonical-schema-and-field-registry.md`
**Log:** `logs/cp019_completion-log_canonical-schema-and-field-registry.md`
**Revision 2026-10-06:** validator malformed JSON tidak lagi throw; derived contact/pace/themes disinkronkan dengan warning; konflik legacy dilaporkan. 22 contract tests PASS.

**Hasil:** satu kontrak data versi web dan pemetaan field lengkap.

- [x] Ask Question + implementation plan (satu chapter plan CP018–CP020).
- [x] Inventaris field schema v2, renderer, form n8n, dan fixture; tetapkan manual/derived/AI/legacy behavior.
- [x] Schema `web-1.0.0`: nested `brochure`, stable IDs, numeric day ranges, metadata record dipisah.
- [x] Draft vs publish structural validator, empat mode, exclusivity schedule/spots, coverage numeric dan duration derived.
- [x] Field registry 89 leaf path dengan localized labels, control, mode, requirement, source, render disposition dan schema constraints source.
- [x] Mapping agency assets, tanggal/peserta, emergency label+value, credits, tips, legacy URL diagnostics.
- [x] Adapter root/wrapper/flat tanpa mutasi input; generated UUID disimpan saat first import; private metadata di luar content.
- [x] Locale catalogs `la`, `fr`, `en`, `id`, `ja`, `zh-Hans`; valid BCP 47 di luar fixture diterima oleh schema.
- [x] Schema-generated TypeScript declaration dan automatic drift check.
- [x] Review dan test field coverage, valid/invalid mode, stable IDs/reorder, round-trip, dan 14-day fixture.
- [x] Completion log.

**Acceptance:** setiap field memiliki sumber dan mapping; editor/API/renderer menggunakan kontrak yang sama.

## CP020 — Portable HTML Renderer

**Status:** completed · **Depends on:** CP019
**Plan:** `plans/cp018-cp020_implementation-plan_standalone-engine-foundation.md` (§ Proposed Changes — CP020)
**Revision plan:** `plans/cp020_revision-plan_portable-html-renderer.md`
**Revision 2026-10-06:** contact/themes fallback otoritatif, locale script-aware (`zh-Hant` → `LOCALE_UNSUPPORTED`, `zh-Hans-*` ok), urutan guide dijaga (contiguous runs), `gradientOnly` dihormati, print keep-with-next + `scripts/web/print-pagination.py` (0 failures, negative control terbukti), harness 11 fixture 0 failures + DOM/glyph assertion, bukti PDF per-halaman, koreksi klaim font/emergency di log. Planner review: `logs/cp018-cp020_planner-review_standalone-engine-foundation.md`.

**Hasil:** renderer web independen dari n8n, siap dipakai preview dan publish.

- [x] Ask Question + implementation plan; gunakan source lama sebagai referensi, pisahkan module web dari wrapper n8n.
- [x] Jika perlu mengubah artefak CP009/CP010 completed, buat revision plan sesuai ID asal terlebih dahulu. (Tidak diperlukan; artefak lama read-only.)
- [x] Port hero/overview/timeline/guide/practical/closing dan palette; input langsung schema nested.
- [x] Tailwind v4 compiled/inline, inline SVG, locale-aware labels/formatting, bahasa dari brief, text escaping, dan field coverage CP019.
- [x] Katalog/fixture `la`, `fr`, `en`, `id`, `ja`, `zh-Hans`; CJK font embedding dan label coverage terverifikasi tanpa membatasi enum locale.
- [x] Asset embedding/gradient fallback serta attribution mengikuti storage/asset contract CP018.
- [x] Module render-HTML pure menerima resources explicit; loader/harness menangani asset lokal. Integrasi endpoint engine/timeout tetap CP021.
- [x] Review terhadap schema/registry; test output empat mode dan escaping input guide/AI.
- [x] Rendered visual verification phone/desktop; verifikasi self-contained tanpa request CDN/runtime asset eksternal.
- [x] Completion log: `logs/cp020_completion-log_portable-html-renderer.md`.

**Acceptance:** HTML lengkap dan coherent untuk empat mode, tanpa n8n context, unresolved placeholder, atau field penting yang hilang.

## CP021 — Engine API and Draft Persistence

**Status:** completed · **Depends on:** CP019
**Plan:** `plans/cp021-cp023_implementation-plan_persistent-editor-and-field-ai.md` (§ Proposed Changes — CP021)
**Log:** `logs/cp021_completion-log_engine-api-and-draft-persistence.md`
**Revision:** `plans/cp021_revision-plan_engine-api-and-draft-persistence.md` — lulus dan tercatat 2026-10-07; chapter re-review masih pending.

**Hasil:** frontend + backend mandiri dapat menyimpan/membaca draft dan asset secara persistent dalam satu workspace.

- [x] Ask Question + implementation plan (chapter CP021–CP023; 2026-10-06).
- [x] Scaffold frontend/backend mandiri sesuai CP018, Tailwind v4, typed API client dan workspace context yang ditentukan server.
- [x] SQLite schema/migrations, data directories, workspace/agency profile, itinerary records, revision checking dan asset ownership.
- [x] Engine context/profile/asset endpoints dan list/create/read/update draft; incomplete draft dapat disimpan.
- [x] Validated asset upload, file storage dan references; file data tidak masuk source control.
- [x] Revision checking `409`, invalid record/workspace access, saved/failed states; tidak mempercayai workspace ID browser.
- [x] API fixture/mock hanya untuk development; aplikasi sebenarnya memakai database, bukan fallback localStorage atau mock SaaS.
- [x] Review + integration test engine nyata: save/reopen setelah restart, profile/assets persistence, conflict dan koneksi gagal.
- [x] Completion log.

**Acceptance:** satu workspace operasional tanpa login SaaS, persistent draft/profile/assets dan conflict handling yang mempertahankan input.

## CP022 — Dynamic Itinerary Editor

**Status:** completed · **Depends on:** CP020, CP021
**Plan:** `plans/cp021-cp023_implementation-plan_persistent-editor-and-field-ai.md` (§ Proposed Changes — CP022)
**Log:** `logs/cp022_completion-log_dynamic-itinerary-editor.md`

**Hasil:** guide dapat menyusun itinerary lengkap melalui form dinamis empat mode.

- [x] Ask Question + implementation plan (chapter CP021–CP023; manual Save).
- [x] Informasi perjalanan, hero/asset, overview, practical dan closing dari field registry.
- [x] Half/full-day: satu blok; multi-day: tambah/hapus/urutkan hari dan aktivitas, akomodasi dan makan.
- [x] Destination guide: tempat/area/group, logistics, tips; tanpa field jam itinerary.
- [x] Add/remove/reorder stable IDs; tombol/keyboard alternatif untuk drag-and-drop.
- [x] Mode-change confirmation, derived duration, field errors, dan status saved/unsaved/save failed.
- [x] Save/reopen tidak kehilangan konten, order, IDs, asset references, atau manual copy.
- [x] Review + test user flow empat mode pada phone/desktop, termasuk 14 hari dan banyak tempat.
- [x] Completion log.

**Acceptance:** semua field yang relevan bisa diisi tanpa mengedit JSON, dan tersimpan sesuai canonical contract.

## CP023 — Field-Scoped AI Writing

**Status:** completed (revision passed; chapter re-review pending) · **Depends on:** CP022
**Plan:** `plans/cp021-cp023_implementation-plan_persistent-editor-and-field-ai.md` (§ Proposed Changes — CP023)
**Revision:** `plans/cp023_revision-plan_field-scoped-ai-writing.md` — passed 2026-10-07 · **Log:** `logs/cp023_completion-log_field-scoped-ai-writing.md`

**Hasil:** AI mengusulkan overview/deskripsi tanpa mengambil alih itinerary guide.

- [x] Ask Question + implementation plan: OpenRouter `openai/gpt-6-luna`, default 30 operasi/workspace/hari dan live-test budget maksimal US$2 total.
- [x] Node engine AI endpoints/provider adapter dengan bounded timeout/retry, local usage/rate limit, operation ID dan minimal context.
- [x] Prompt/response validation overview dan description satu target ID; tidak membuat field lain.
- [x] UI Generate/Apply/Discard, manual input tetap tersedia, dan error/kuota state yang jelas.
- [x] Revision/target staleness check; hasil request lama tidak menimpa edit terbaru atau target yang dihapus.
- [x] Review + live OpenRouter/GPT-6 Luna test pada bahasa-bahasa yang telah diputuskan CP018, termasuk bahasa/script di luar Latin; secret redacted.
- [x] Test timeout, local limit exceeded, retry tanpa double usage accounting, malformed response, stale result, dan instruction-like notes.
- [x] Assert hanya field target berubah; nama, waktu, durasi, rute, dan field manual tetap identik.
- [x] Completion log: `logs/cp023_completion-log_field-scoped-ai-writing.md`.

**Handoff:** CP021 dan CP023 revisions telah dijalankan dan diverifikasi; hasil/evidence ada di revision section masing-masing completion log. Audit findings untuk replay/pending, unknown usage, language proposal, fixture/rate resume, upload errors dan test coverage ditutup sesuai revision plans. Chapter planner re-review masih diperlukan setelah verdict REVISE; CP024 tetap pending sampai ACCEPT. Budget ledger live tetap US$0.001361 dari US$2, tanpa inference baru pada revision replay.

**Acceptance:** hasil AI adalah usulan editable, applied secara explicit, hanya pada field yang diminta.

## CP024 — Draft Preview and Publish Validation

**Status:** completed (revisions passed) · **Depends on:** CP023
**Plan:** `plans/cp024-cp025_implementation-plan_preview-publish-and-share-links.md` (§ Proposed Changes — CP024)
**Log:** `logs/cp024_completion-log_draft-preview-and-publish-validation.md`
**Revision plan:** `plans/cp024_revision-plan_schedule-cap-with-unknown-start.md` — V27-01 passed 2026-10-07; evidence appended to completion log.
**Revision plan:** `plans/cp024_revision-plan_full-raster-decode-before-preview.md` — V27-03 passed 2026-10-07; evidence appended to completion log.
**Revision plan:** `plans/cp024_revision-plan_diagnostic-focus-for-repeaters.md` — V27-02 passed 2026-10-08; evidence appended to completion log.
**Entry gate:** CP021–CP023 planner re-review ACCEPT 2026-10-07; see `logs/cp021-cp023_planner-review_2026-10-07.md`.

**Hasil:** guide melihat output sebenarnya dan mengetahui apa yang harus diperbaiki sebelum publish.

- [x] Ask Question + implementation plan (chapter CP024–CP025; 2026-10-07).
- [x] Preview menggunakan renderer CP020 melalui backend engine, isolated dari editor scripts; phone/desktop view.
- [x] Publish validation: schema, mode exclusivity, required copy/logistics, IDs, attribution, unresolved values.
- [x] Original schedule overlap/duration/multi-day/transport checks.
- [x] Revision V27-01: known duration above cap blocks even with unknown start; condensed multi-day only blocks individually provable per-activity violations.
- [x] Revision V27-03: same-size pixel-corrupt raster fails closed before preview/publish; preserve stored asset/draft/current public version.
- [x] Revision V27-02: repeater diagnostics return indexed path/stable target and focus the exact invalid field after reordering; CP024 re-reviewed ACCEPT 2026-10-08.
- [x] Pattern-based guards harga/jam buka/OTA claims; kata "harga" tanpa nominal tetap diterima.
- [x] Actionable field errors, draft incomplete tetap bisa disimpan, tidak ada silent content thinning.
- [x] Review + test valid/invalid empat mode, legitimate time labels/duration pada guide, dan renderer unavailable.
- [x] Rendered visual verification preview vs renderer baseline CP020.
- [x] Completion log.

**Acceptance:** preview mencerminkan canonical content, publish ditolak dengan alasan konkret jika invalid, pekerjaan guide tetap tersimpan.

## CP025 — Published Web Link and Versioning

**Status:** completed (revisions passed) · **Depends on:** CP024
**Plan:** `plans/cp024-cp025_implementation-plan_preview-publish-and-share-links.md` (§ Proposed Changes — CP025)
**Log:** `logs/cp025_completion-log_published-web-link-and-versioning.md`
**Revision plan:** `plans/cp025_revision-plan_replay-after-permanent-revoke.md` — V27-05 passed 2026-10-07; evidence appended to completion log.
**Revision plan:** `plans/cp025_revision-plan_recheck-publication-after-async-read.md` — V27-04 passed 2026-10-07; evidence appended to completion log.
**Revision plan:** `plans/cp025_revision-plan_reuse-pending-publish-operation.md` — pending retry UI revision passed 2026-10-08; evidence appended to completion log.
**Revision plan:** `plans/cp025_revision-plan_preserve-cross-workspace-publication-recovery.md` — V27-06 recovery revision passed 2026-10-08; evidence appended to completion log.

**Hasil:** traveller dapat membuka versi published melalui link yang stabil.

- [x] Ask Question + implementation plan (chapter CP024–CP025; 2026-10-07).
- [x] Immutable published snapshots: content, HTML, embedded assets, schema/render version and timestamps; no PDF status/artifact.
- [x] Idempotent publish revision tertentu; update current published version atomik setelah render/storage sukses.
- [x] Node engine public share route, random token minimal 128 bit, `noindex`, configured origin dan public/private metadata separation.
- [x] Copy link, publish status, republish, unpublish/revoke dan cache invalidation; retention tanpa auto-expiry/delete serta token rotation setelah revoke sesuai keputusan chapter 2026-10-07.
- [x] Initial HTML includes safe Open Graph title/description/canonical URL and absolute image URL; token-scoped preview-image route serves matching committed image to no-cookie/no-JS crawler.
- [x] Review + test draft edit vs published, republish failure, stale revision, management/public access boundary and revoke HTML/image routes.
- [x] Verify policy dengan timestamp lebih dari 12 bulan, bukan menunggu selama itu; link tetap hidup sampai revoke.
- [x] Visual/mobile verification public page, asset persistence dan deep-link reload.
- [x] Completion log.

**Acceptance:** draft tidak bocor; link tetap menuju versi published yang benar; Open Graph metadata dan preview image tersedia untuk crawler; publish failure tidak merusak versi lama; revoke efektif.

## CP026 — PDF Export (Removed from Product Scope)

**Status:** removed · **Decision:** 2026-10-07, before implementation.
**Replacement:** shared web link with Open Graph metadata and WhatsApp preview image in CP025.

- [x] Do not implement PDF rendering/export, queue/worker, status, storage, UI or download routes.
- [x] Preserve CP020 renderer/print-pagination work as completed historical verification; it is not a user-facing PDF export commitment.
- [ ] Revisit only with a new explicit product decision and plan; do not add opportunistically to CP027/CP028.

## CP027 — Standalone End-to-End Verification

**Status:** completed · **Depends on:** CP025
**Plan:** `plans/cp027-cp028_implementation-plan_standalone-verification-and-deployment-readiness.md` (§ Proposed Changes — CP027)
**Log:** `logs/cp027_completion-log_standalone-end-to-end-verification.md`
**Finding status:** V27-01…V27-06 passed original-CP revision gates. Four-mode UI and publish checks, six locales, long copy, owned assets/OG, anonymous no-JS reads, 14-day/60-spot stress, deterministic AI lifecycle, crash/restart/restore, revocation, retry and cross-workspace recovery all pass. Completion log maps all local `SPEC.md` §12 criteria and marks public HTTPS/WhatsApp crawler testing deferred per W15. CP028 may begin; no AWS or production deployment is claimed.

**Hasil:** local release acceptance pada editor + real backend/SQLite/storage dengan browser verification; historical live AI/replay dan deterministic doubles dipisahkan. Tidak mengklaim external WhatsApp preview.

- [x] Ask Question + shared implementation plan (2026-10-07; AWS target undecided, readiness only).
- [x] Integrated local E2E rerun: deterministic full-day AI Generate/Apply/Save, restart and revoke/rotation, plus preview/publish/OG for all four modes; safe success/failure summary, no external requests/errors.
- [x] Flow four-mode UI create/save/reopen + preview/publish/share; anonymous initial OG HTML/image fetched locally without cookies or scripts.
- [x] Six locale renders, mixed/low-confidence detection and override behavior, 14-day/60-spot stress, missing-photo fallback, supplied photo/logo/credits, and long copy.
- [x] Workspace scoping, private editor/API boundary, public HTML/OG checks; no PDF download route.
- [x] Save conflict, AI timeout/local limit, renderer/storage failure, pending publish retry and process restart/crash.
- [x] Link longevity, stable republish, permanent revoke/rotation, no private metadata and content policy guards.
- [x] Real persistence/server without Laravel/n8n; deterministic doubles labeled; live ledger read-only checked without inference/reset.
- [x] V27-01…06 verified and completed-CP defects closed through original revision plans.
- [x] Actual SaaS adapter integration remains deferred; no Laravel integration claim.
- [x] Phone/desktop/editor/public/OG screenshots inspected and API/integration evidence recorded without secrets/personal data.
- [x] All local `SPEC.md` §12 criteria PASS; public HTTPS/WhatsApp external verification is DEFERRED — readiness-only decision.
- [x] Completion log and CP027 acceptance disposition recorded.

**Acceptance:** seluruh local release acceptance `SPEC.md` §12 terbukti, evidence provider dibedakan dan original-CP defects ditutup melalui revision gates; public HTTPS/WhatsApp evidence explicitly deferred, fase B tetap terpisah.

## CP028 — Standalone Deployment Readiness

**Status:** completed (standalone-ready / not deployed) · **Depends on:** CP027
**Plan:** `plans/cp027-cp028_implementation-plan_standalone-verification-and-deployment-readiness.md` (§ Proposed Changes — CP028)
**Log:** `logs/cp028_completion-log_standalone-deployment-readiness.md`
**Chapter review:** `logs/cp027-cp028_chapter-review_2026-10-09.md` — ACCEPT; standalone-ready/not-deployed.

**Hasil:** reproducible standalone-ready package dengan clean local Linux/runtime, backup/restore/rollback dan measured resource report; target AWS/domain belum ditentukan, belum deployed.

- [x] Ask Question + shared implementation plan (2026-10-07; readiness saja, tidak staging/remote mutation).
- [x] Runtime-only release: compiled Node backend, built frontend/CSS, fonts/catalogs/Sharp + external persistent SQLite/filesystem; no Puppeteer/Chromium/PDF/helper/test/dev runtime. Native Node 24 Linux x64 clean install verified.
- [x] Secret-free environment examples, loopback bind, share-only proxy/local TLS, configured origins, readiness checks and one process per data root.
- [x] Documented setup, API/schema/field mapping, publish/share/OG, retention, backup and rollback in readiness runbook.
- [x] Clean-start smoke tests four modes, raster asset, manual mode without credentials, share/OG and deep reload; volume/data-root persistence across restart.
- [x] Local TLS reverse-proxy test allows only exact share HTML/image GET/HEAD; editor/API/assets/path bypass denied. Internet crawler/card gate deferred.
- [x] Stopped full-root backup/restore and same-build release-path upgrade/rollback preserve IDs, active links, content hashes and revoked-token tombstones; incompatible migration recovery point documented.
- [x] Measured startup/install/idle/sampled-peak CPU/RSS/release/data/snapshot sizes; future cloud costs unpriced until target/account/region are selected.
- [x] Future deployment gate documents selected host/region/architecture/budget, domain/origin/DNS owner, admin boundary, backup owner and explicit request. No provisioning/deploy/DNS performed.
- [x] Completion log and chapter review; status standalone-ready/not-deployed, not staging-ready or production-live.

**Acceptance:** clean local Linux runtime, local TLS/access, resource report dan stopped backup/restore/rollback lulus; local failures atau unavailable required environment tidak boleh ditandai ready. Public HTTPS/WhatsApp verifikasi dan actual deployment deferred; Laravel tidak menjadi gate.

## CP030 — Import Source Intake

**Status:** pending · **Depends on:** CP028 + revisi guide-centric schema R1–R6 selesai
**Plan:** `plans/cp030-cp032_implementation-plan_document-and-text-import.md` (§ Proposed Changes — CP030) — **harus direvisi ke `web-2.0.0` sebelum mulai** (mapping/blank draft/field paths masih v1).

**Hasil:** guide dapat memasukkan itinerary yang sudah ditulis (ketik/tempel, DOCX, PDF ber-teks) dan engine menyimpan teks bersih yang terbatas secara aman, tanpa AI.

- [x] Ask Question + shared implementation plan (2026-11-05).
- [ ] Migration `import_sources` + direktori `imports/`; byte asli tidak disimpan, hanya hash.
- [ ] Ekstraksi deterministik: teks (NFC/newline), DOCX (`mammoth`), PDF (`unpdf`) dengan page marker.
- [ ] Deteksi magic bytes; batas 10 MB, 60 halaman, DOCX decompressed 50 MB, 120k karakter, deadline 20 s; tanpa truncation diam-diam.
- [ ] Tolak PDF scan/terenkripsi/korup/spoofed dengan error code stabil.
- [ ] `POST /api/v1/imports/sources` (multipart atau JSON) + `GET /api/v1/imports/sources/:id`, workspace-scoped; language proposal via `detectLanguage`.
- [ ] Fixture reproducible lewat generator script; `tests/web/import-intake.test.ts`; asset upload 5 MB tidak berubah.
- [ ] Review + test; completion log.

**Acceptance:** tiga format menghasilkan teks yang tersimpan dan persistent setelah restart; setiap jalur penolakan menghasilkan code/pesan yang jelas tanpa membuat record.

## CP031 — AI Structured Itinerary Extraction

**Status:** pending · **Depends on:** CP030
**Plan:** `plans/cp030-cp032_implementation-plan_document-and-text-import.md` (§ Proposed Changes — CP031)

**Hasil:** teks sumber + mode pilihan guide menjadi draft canonical `web-1.0.0` yang valid, dengan kutipan sumber privat per field dan biaya tercatat.

- [ ] Extraction schema per mode (`{ value, quote } | null`) dan provider `extract()`; `generate()` lama tidak berubah.
- [ ] Prompt transcribe-only, dokumen sebagai untrusted data, bahasa sumber dipertahankan, tanpa terjemahan.
- [ ] AJV + satu repair retry; quote verification (kutipan harus ada di sumber; angka jam/durasi harus ada di kutipan); gagal = kosong + warning.
- [ ] Mapping lewat `createBlankDraft(mode)` + UUID baru; `validateDraft`; tidak membuat half-draft saat gagal.
- [ ] `import_operations` ledger terpisah tanpa plafon/kuota; replay idempotent; satu import in-flight per workspace; restart → `uncertain`.
- [ ] `import_field_sources` + `GET /api/v1/itineraries/:id/import-provenance`; tidak pernah masuk snapshot/HTML/OG.
- [ ] Test double empat mode, 14 hari/60 spot, prompt injection, nilai karangan, malformed/timeout/replay/busy; ledger US$2 dan kuota 30/hari tidak berubah.
- [ ] Live test set tetap (~6 import, id/en/ja, empat mode) dengan biaya dicatat; inspeksi manual hasil vs dokumen.
- [ ] Review + test; completion log.

**Acceptance:** tidak ada nilai tanpa kutipan terverifikasi di draft; field yang tidak ada di dokumen kosong + warning; draft valid dan bisa diedit; biaya per import tercatat.

## CP032 — Import Review Editor and E2E

**Status:** pending · **Depends on:** CP031
**Plan:** `plans/cp030-cp032_implementation-plan_document-and-text-import.md` (§ Proposed Changes — CP032)

**Hasil:** guide memakai import dari UI, meninjau dan mengedit hasilnya di editor, lalu publish ke share link seperti biasa.

- [ ] API client import; aksi "Buat dari dokumen/teks": pilih mode → Ketik/Tempel | Upload → hasil intake + bahasa → Ekstrak AI → buka draft.
- [ ] AI disabled dengan alasan jelas saat credential tidak ada; teks hasil ekstraksi tetap bisa dilihat.
- [ ] Review: banner, badge "dari dokumen"/"diedit" + kutipan, daftar "tidak ditemukan di dokumen" dengan focus ke field, biaya import tampil.
- [ ] E2E browser `scripts/web/verify-import.ts`: empat mode × (tempel, DOCX, PDF), penolakan PDF scan, edit → save → reopen → preview → publish → share anonim tanpa provenance.
- [ ] Screenshot phone/desktop dibuka dan diperiksa.
- [ ] Regression semua suite web + `build:web-release` + `validate:web-release` (perubahan packager lewat revision gate CP028).
- [ ] Review + test; completion log; chapter review CP030–CP032.

**Acceptance:** alur import → review → edit → publish berjalan untuk empat mode di phone/desktop tanpa regresi fitur yang sudah ada.

## CP029 — Laravel SaaS Integration (Fase Berikutnya, paling akhir)

**Status:** pending (deferred — last in roadmap) · **Depends on:** CP032 + kesiapan SaaS Laravel
**Plan:** `plans/cp029_implementation-plan_laravel-saas-integration.md`

**Hasil:** TourFlow dapat mengakses engine yang sudah jadi lewat integrasi API tanpa membangun ulang fitur itinerary.

- [ ] Ask Question + implementation plan: auth/SSO, tenant/roles, entitlement/usage/billing, domains dan deployment sesuai SaaS yang benar-benar tersedia.
- [ ] Baca aturan `D:\belajar-pemograman\AGENTS.md`; inspeksi existing API/data/auth sebelum perubahan pada repo Laravel.
- [ ] Implement authenticated server-to-server integration, external tenant → engine workspace mapping, dan identity/entitlement adapter.
- [ ] Akses editor dari SaaS, expiry/revoke authorization, CORS/CSRF jika diperlukan; credentials hanya di server.
- [ ] Usage/quota integration idempotent dan contract failures tidak fallback ke standalone workspace.
- [ ] Engine tetap menyimpan canonical content/artifacts; Laravel menyimpan reference/mapping, bukan salinan itinerary yang bisa drift.
- [ ] Tentukan explicit mapping workspace standalone ke tenant SaaS; stable itinerary/version IDs, asset references dan share links existing tetap utuh.
- [ ] Review + test Laravel nyata: login, dua tenant, permissions, entitlement, expiry, retries dan integration unavailable.
- [ ] Verifikasi engine standalone dan published HTML/share preview tetap berfungsi setelah adapter ditambahkan.
- [ ] Completion log.

**Acceptance:** acceptance fase B `SPEC.md` §12 terbukti pada TourFlow nyata; fase A tidak perlu dibuka ulang atau menunggu CP029.

## 3. Follow-ups di luar rilis awal

- Email/WhatsApp delivery setelah guide memilih kirim.
- Venue/route verification berbasis sumber eksternal jika kebutuhan pengguna terbukti.
- Library tempat/deskripsi yang dapat dipakai ulang oleh guide.
- Custom template, collaboration, analytics, dan offline mode.

Follow-up belum mendapat CP implementation ID; buat ID baru sebelum dijadwalkan. Jangan memasukkannya diam-diam ke CP018–CP029.
