# CP018–CP020 Implementation Plan: Standalone Engine Foundation

**Tanggal:** 2026-10-06.
**Peran:** planner menetapkan kontrak dan mengevaluasi hasil; worker mengimplementasikan dan mengumpulkan evidence.
**Status dokumen:** approved scope/baseline melalui Ask Question; pelaksanaan CP belum dimulai.
**Workspace:** `D:\.agents\Micro Saas\itinerary-engine`.
**Authority:** `SPEC.md` v3.1, `TODOS.md`, dan `RULES.md`.

## Objective

Menyiapkan fondasi engine mandiri yang bisa dipakai CP021 dan seterusnya: kontrak runtime/API yang nyata, canonical schema + field registry yang konsisten, dan renderer HTML self-contained untuk empat mode serta enam bahasa fixture.

Chapter ini **bukan full app**. Tidak menghasilkan editor pengguna, persistence CRUD API, live AI writing, publish link server, atau production PDF export. Worker tidak boleh melabelinya "app selesai".

| CP | Hasil mandiri | Gate masuk |
|---|---|---|
| CP018 | Runtime/API/secret/locale/asset contract beserta compatibility evidence. | Plan ini tersedia dan tidak ada CP web lain in-progress. |
| CP019 | Canonical contract berversi, field registry lengkap, adapters dan validator teruji. | CP018 completed dan completion log tersedia. |
| CP020 | Renderer HTML portable, locale catalogs/fonts, render harness dan evidence visual. | CP019 completed dan completion log tersedia. |

## Clarifications and Decisions

Keputusan pengguna melalui structured questions:

1. Engine selesai dahulu; Laravel di `D:\belajar-pemograman` adalah integrasi CP029, bukan runtime dependency chapter.
2. Satu workspace lokal/private; tidak membuat signup/multi-guide/subscription.
3. Empat mode: `half_day`, `full_day`, `multi_day`, `destination_guide`.
4. Baseline disetujui: Node.js 24+, TypeScript, Fastify, SQLite bawaan `node:sqlite`, React/Vite/Tailwind CSS v4.
5. Satu file plan. Klarifikasi terakhir membatasi scope ke **CP018–CP020 saja**, bukan empat CP dan bukan CP021.
6. Bahasa Latin berarti **bahasa Latin**, bukan sekadar aksara Latin. Fixture: `la`, `fr`, `en`, `id`, `ja`, `zh-Hans`. Mandarin sederhana menjadi baseline fixture; tidak mengklaim dukungan semua varian bahasa China.
7. OpenRouter dengan target GPT-6 Luna; exact model ID belum diverifikasi. Tidak menebak slug, memakai model lain diam-diam, atau mengklaim live provider test sudah berhasil.
8. Credential lokal berada di `D:\.agents\Micro Saas\Credential_information.md`. Hanya loader server/subprocess boleh memprosesnya; agent tidak membaca raw file/key ke conversation. Deployment memakai injected secret.
9. AI nanti hanya overview/deskripsi. Locale catalogs chapter ditulis/direview sebagai template resources; tidak menambah live AI translation pipeline.
10. Worker boleh menyelesaikan tiga CP secara berurutan dalam satu sesi jika gates lulus. Tidak ada izin parallel CP, commit, push, deployment, atau perubahan repo Laravel.

**Keputusan teknik plan:** schema JSON Draft 2020-12 + Ajv 2020/formats; TypeScript types harus diturunkan dari schema atau diverifikasi otomatis agar tidak menjadi kontrak kedua. Gunakan TypeScript + `tsx` untuk harness/tests. Fastify runtime server dibuat pada CP021, bukan di chapter ini.

## Scope

- Kontrak endpoint, error, revision, workspace, asset/storage, render options, locale capabilities dan future adapter boundary.
- Read-only runtime probes, safe secret-availability/model-catalog verification, SQLite in-memory probe dan Chromium/browser availability.
- Port canonical content dari schema lama ke versi web yang nested dan memiliki stable IDs.
- Registry lengkap yang memetakan input/derived/manual/AI/output serta field yang memang tidak dirender.
- Validator draft/publish structural, normalization yang tidak mutasi input, adapter fixture lama dan targeted tests.
- Portable HTML renderer dengan Tailwind v4 compiled/inline, offline assets/fonts, locale catalogs, four-mode fixtures, unit/DOM tests dan browser visual checks.
- Completion log terpisah setiap CP dan worker handoff evidence untuk evaluasi planner.

## Out of Scope

- CP021 scaffolding app/API/SQLite persistence, CP022 editor, CP023 AI endpoints/detection implementation, CP024 full policy/schedule/content QA, CP025 share/version server, CP026 production PDF jobs.
- React screens, login, multi-tenancy billing, OAuth/SSO, Laravel changes, generic form builder, template marketplace.
- Live itinerary generation, automatic route changes, arbitrary URL image fetching, stock-photo API integration.
- Memodifikasi renderer/schema/workflow n8n lama; gunakan sebagai read-only reference. Jika perubahan artefak completed diperlukan, berhenti dan minta revision plan ID asal.
- Full product security audit, production cutover, atau menyatakan fixture sebagai production dataset.

## Current-State Findings

- Root `package.json` adalah helper ESM dengan `puppeteer` pinned `25.1.0`; scripts existing `validate`, `test`, `render:pdf` harus tetap bekerja.
- `config/itinerary-schema.json` mempunyai nested `brochure`, tetapi renderer root membaca sebagian metadata flat. Wrapper n8n meratakan data; web renderer harus tidak bergantung pada wrapper tersebut.
- `config/mode-profiles.json`, `palettes.json`, `travel-rules.json` berisi fondasi reusable; aturan lama tidak otomatis compatible dengan editor manual.
- Root `render-itinerary-html.js` memiliki timeline dan guide layout, tetapi field logo/traveller/date dan emergency value belum seluruhnya tampil konsisten; label statis masih banyak berbahasa Inggris.
- `scripts/render-pdf.mjs` memerlukan remote Chromium WS. Test existing hanya memeriksa source options, bukan render browser nyata.
- `output/` dan `e2e-pdf-results/` berisi fixture/evidence lama, sebagian memiliki metadata execution atau data personal; sanitasi sebelum dijadikan fixture committed.
- `Template/` kosong; belum ada field registry web, frontend app atau CRUD backend.
- Working tree mempunyai perubahan dokumen dan `config/`, `e2e-pdf-results/`, `docs/` yang belum tracked pada saat plan. Jangan menganggapnya sampah atau overwrite tanpa inspeksi.
- Repo Laravel masih proyek belajar TourFlow; jangan menjadikannya prerequisite.
- Model slug, format credential, locale/font capability, dan exact pinned tool versions belum terverifikasi. CP018 menghasilkan keputusan/evidence tentang hal itu.

## Proposed Changes

### CP018 — Standalone API and Runtime Contract

**Urutan kerja:**

1. Baca authority files dan git status. Mark hanya CP018 `in_progress` saat mulai. Pastikan plan/log completed historis yang relevan benar-benar ada; jangan menyelesaikan backlog n8n sebagai syarat baru.
2. Verifikasi Node major >=24, `node:sqlite` in-memory create/insert/read/close, dan dukungan runtime Windows. Catat exact Node/npm version dan probe result tanpa install aplikasi.
3. Verifikasi compatibility major TypeScript/tsx, Fastify 5, Tailwind 4/Vite/React terhadap Node yang dipilih. Lock exact versions saat paket pertama kali ditambahkan pada CP019/CP020/CP021; jangan mengubah pin Puppeteer.
4. Pilih satu backend API pada origin `http://127.0.0.1:3000`; Vite dev `127.0.0.1:5173` memakai proxy `/api` ke backend pada CP021. `PUBLIC_ORIGIN` tidak berasal dari request Host header. Tidak menjalankan persistent server di CP018.
5. Definisikan `.runtime/engine.sqlite`, `.runtime/assets/`, `.runtime/published/`, `.runtime/pdf/`, dan `.runtime/tmp/` sebagai defaults, dapat di-override melalui server config. Semua path dari server, bukan payload browser. Definisikan backup/restore unit SQLite + storage; WAL bila digunakan masuk strategi backup.
6. Tetapkan limit baseline: canonical request 2 MiB UTF-8, asset gambar maksimal 5 MiB per file dan total 20 MiB per render, output self-contained HTML maksimal 64 MiB termasuk font. Tolak eksplisit jika terlampaui, jangan crop/drop tempat. Worker boleh mengusulkan perubahan hanya dengan evidence font/output size dan Ask Question; tidak menambah cap spot arbitrer.
7. Secret config: `OPENROUTER_API_KEY` injected environment adalah prioritas; local file loader opsional memakai `OPENROUTER_CREDENTIAL_FILE` dengan path pengguna. Jangan menambahkan parser "ambil token pertama". Pastikan ada tepat satu key OpenRouter yang dapat diidentifikasi; jika format ambigu, minta clarification **tanpa menunjukkan values**. Jangan menulis `.env` berisi key, mengirimnya lewat command-line argument, atau membaca file dengan tool yang menampilkan raw content.
8. Verifikasi secret availability dengan output boolean/provider label saja. Model catalog OpenRouter boleh diperiksa tanpa key bila API mengizinkan; catat exact ID, endpoint style, dan parameter compatibility yang benar-benar didukung. Jika GPT-6 Luna tidak ditemukan/unavailable atau authorization tidak dapat diverifikasi, CP018 `blocked`; jangan substitusi model atau lanjut CP019 dengan hasil palsu. Tidak perlu paid copy-generation call untuk chapter ini.
9. Tetapkan language contract: `requestedLanguage: auto | valid locale`, resolved `outputLanguage: valid canonical BCP 47 | null`, source `detected | explicit | unresolved` sebagai metadata draft. Detection hanya mempertimbangkan brief/notes descriptif, bukan nama tempat/profil agen. Detector confidence low/mixed meminta override; tidak menjadikan model pendeteksi sebagai penulis itinerary. Implementasi detector CP023; fixture chapter memakai explicit locale.
10. Tetapkan locale catalog keys yang lengkap dan enam bahasa baseline. `la` sah sebagai language tag walau Intl date formatter belum tentu mendukungnya; gunakan deterministic ISO/numeric date jika locale Intl unsupported, bukan silent English label fallback. Unknown locale adalah capability warning/error terstruktur sebelum publish, bukan alasan membatasi schema enum.
11. Tentukan portable font strategy dan Chromium path/version. Latin+accent untuk `la/fr/en/id`, CJK untuk `ja/zh-Hans`; font embedded dengan license/attribution yang boleh didistribusikan. Tidak bergantung font Windows saja. CP020 mengecek glyph/render nyata; CP018 hanya memastikan source/license dan feasibility.
12. Tulis `docs/engine-runtime-contract.md`: endpoints dari SPEC §9, request/response ownership, error envelope, expected revision `409`, idempotency, local workspace scope, storage/asset policy, timeouts dan future adapter seam.
13. Tulis `.env.web.example` tanpa key: `HOST`, `PORT`, `PUBLIC_ORIGIN`, `ENGINE_DATA_DIR`, `OPENROUTER_API_KEY` kosong, `OPENROUTER_MODEL` hanya jika ID sudah verified, optional credential file dan Chromium executable/WS config. Pisahkan dari `.env.example` n8n existing.
14. Review → verify → revise. Buat completion log dengan model/runtime decisions; baru mark completed dan lanjut CP019.

**Error envelope:** `{ error: { code, message, fields?, requestId } }`. Error public tidak membawa stack, filesystem path, secret, raw request provider atau credential payload. Contract harus membedakan `LANGUAGE_UNRESOLVED`, `LOCALE_UNSUPPORTED`, `INVALID_DOCUMENT`, `REVISION_CONFLICT`, `ASSET_INVALID`, `PROVIDER_UNAVAILABLE`, `RENDER_FAILED`.

**Acceptance CP018:**

- R18-1: Node24+/SQLite/Chromium feasibility didukung hasil command/probe nyata, bukan asumsi dari package names.
- R18-2: exact OpenRouter model ID dan secret availability verified; credential tidak muncul pada evidence. Jika tidak, checkpoint blocked.
- R18-3: ownership backend engine, storage/limits, request/error/revision contract dan future adapter terdokumentasi.
- R18-4: enam locale, detection/override boundary, catalogs/fonts dan unsupported policy ditetapkan tanpa enum bahasa tertutup.
- R18-5: tidak ada app/server/AI-writing implementation atau perubahan Laravel/n8n di CP018.

### CP019 — Canonical Schema and Field Registry

1. Verifikasi log CP018 dan resolved decisions; mark hanya CP019 `in_progress`.
2. Tambahkan schema web `config/web/itinerary.schema.json`, Draft 2020-12, content version `web-1.0.0`. Versi ini terpisah dari schema n8n 2.0.0; metadata record tidak berada di content renderer.
3. Port seluruh properti output v2. Tambahkan stable UUID pada blocks/activities/spots. IDs tidak boleh berubah saat reorder, edit text, save/reopen atau serialize round-trip.
4. Sertakan activity `tip` optional agar field schema/renderer konsisten. Hero/region/logo assets memakai reference server-side; legacy `photoUrl` diadapter ke unresolved reference atau explicit safe decorative fallback, tidak auto-fetch URL.
5. Document adapter input legacy: canonical root, execution wrapper `canonicalItinerary`, serta existing flat render input. Output hanya satu nested contract. Metadata execution, email penerima, verifiedVenueSet dan secrets tidak dibawa ke content. Adapter tidak membuang deskripsi/manual values diam-diam; hasilkan diagnostics untuk field legacy yang tidak bisa dipetakan.
6. Adapter memberi stable IDs sekali pada import. Rendering tidak membuat UUID/timestamp atau mengubah input; derived `generatedDate` berasal record/import context yang explicit.
7. Draft validator menerima field yang belum diisi, tetapi tetap menolak tipe/properti tidak dikenal, duplicate IDs, locale invalid dan ownership metadata di content. Empty arrays boleh untuk draft baru. Publish structural validator mensyaratkan mode/layout yang benar, resolved locale, required fields, stable IDs, multi-day 2–14 coverage dan mode-appropriate fields. Full money/travel/quality policy validator CP024, bukan scope baru di sini.
8. Jadwal half/full-day tepat satu block dan tidak perlu akomodasi. Multi-day default satu block per hari; optional condensed ranges hanya dari tindakan guide, memakai `dayStart/dayEnd` numeric sehingga coverage dihitung tanpa parse label bahasa. Activity timeLabel adalah time slot guide; spot best-time/duration bukan jam operasional.
9. Derive `durationDays`, scope label dan date presentation dari canonical values, tidak percaya field duplikat root. Tidak mengubah urutan atau teks guide untuk meloloskan validation.
10. Locale canonicalization memvalidasi string BCP 47, bukan enum enam bahasa. Schema dapat menerima locale baru yang valid; renderer capability validator terpisah menolak catalog/font unsupported secara actionable.
    Panjang teks dibatasi secara Unicode-aware; jangan memakai jumlah kata berbasis spasi sebagai gate structural untuk Jepang/Mandarin. Penilaian substance/quality terlokalisasi menjadi CP024.
11. Buat `config/web/field-registry.json`: setiap leaf path memiliki labelKey, control, group/repeater, applicable modes, draft/publish requirements, source, length/type constraints dan renderTarget atau explicit `notRenderedReason`. Registry metadata tidak menjadi form UI pada CP019.
12. `source: ai-assisted` hanya `overview.summary`, `schedule[].activities[].description`, `spots[].description`. `outputLanguage` adalah derived/manual override; detection/locale catalog bukan scope AI copy generation baru.
13. Buat locale catalog resources `config/web/locales/{la,fr,en,id,ja,zh-Hans}.json` untuk registry dan seluruh label brochure. Keys sama di semua catalog, tanpa English filler dalam file bahasa lain. Terjemahan sample/manual direview; nama tempat/brand boleh tetap asli.
14. Implement schema validation, normalization dan legacy adapter sebagai pure functions di `src/contracts/`. Types dihasilkan dari schema atau drift-test; batas draft vs published type jelas. Hindari dua schema buatan tangan yang bisa drift tanpa check.
15. Tambahkan fixture sanitized di `tests/fixtures/web/`: empat mode utama, enam locale content, invalid shapes, incomplete drafts, locale ambiguous/unresolved, 14-day/many-spots/long-text cases. Fixture diberi asal manual/import; tidak menyalin email/tokens/output execution mentah.
16. Tambahkan tests kontrak di `tests/web/contracts.test.ts` dan field coverage/adapter tests. Review → test → revise, log, completed.

**Acceptance CP019:**

- R19-1: schema nested/versioned dan types/registry konsisten; seluruh leaf memiliki sumber/render disposition, tanpa duplicate fields root.
- R19-2: draft incomplete bisa valid, published invalid gagal; schedule/spots exclusivity dan numeric day coverage teruji.
- R19-3: stable IDs dan manual order/text bertahan pada import/reorder/round-trip; normalization tidak mutasi caller input.
- R19-4: valid locale di luar enam fixture lolos schema; unresolved locale gagal publish. Six catalogs memiliki exact key coverage.
- R19-5: adapter diagnostics dan fixture sanitized; metadata execution/private tidak menjadi output brochure.
- R19-6: targeted typecheck/contract tests PASS; dependency CP018 log tersedia.

### CP020 — Portable HTML Renderer

1. Verifikasi log CP019; mark hanya CP020 `in_progress`.
2. Implement module baru di `src/render/`; gunakan layout source lama sebagai referensi tanpa mengubah root `render-itinerary-html.js`, `.n8n-render-code.*` atau workflow exports.
3. Interface pure `renderItineraryHtml(content, options)` menerima publish-valid nested content plus explicit palette/catalog/pre-resolved asset/font/CSS resources. Return HTML/string dan diagnostics sesuai contract; tidak membutuhkan `$input`, `$execution`, database, process env, network fetch, mutation, atau inference model.
4. Loader/harness server-side yang terpisah membaca CSS/font/asset approved. Renderer tidak menerima filepath dari form. Raw URL, scriptable SVG, incomplete attribution atau unsafe resource ditolak/fallback sesuai policy CP018; tidak membuat arbitrary URL fetcher.
5. Tailwind v4 compiled build dari `src/render/styles.css` dan source templates; utility classes mobile-first. Hindari runtime class concatenation yang tidak tercapture build; palette lewat validated CSS tokens. Inline CSS pada HTML, tidak menggunakan Tailwind CDN. Font license files disimpan bersama binaries.
6. Shared hero/overview/practical/closing; timeline untuk scheduled modes dan grouped card grid untuk guide. Jangan thin konten atau membalik order karena styling. Gunakan Map untuk grouping agar bukan repeated linear lookup per spot.
7. Render semua field yang dijanjikan mapping: agency logo/contact, title/destination, dates/travellers, overview facts/highlights, activities/duration/tip, accommodation/meals/transport/block tip, spot logistics/tips/pairing, emergency label **dan value**, credits beserta link.
8. Enam locale catalogs digunakan untuk seluruh label; scope dan date formatting mengikuti locale policy CP018. `<html lang>` memakai locale canonical, Unicode utuh. Encode/escape text/attribute/link dengan benar; biarkan nama tempat yang memang proper noun tidak diterjemahkan.
9. Embed font/asset sebagai data URI atau static inline resources sehingga offline Chromium memakai glyph yang sama di Windows/Linux. CJK glyph dicek nyata, bukan sekadar "font loaded". Measure font/HTML size terhadap batas CP018.
10. Gradient fallback untuk missing/unresolved photo tidak mengklaim lokasi foto. Inline SVG hanya icon statis trusted. Credit/attribution missing tidak ditutupi dengan string kosong.
11. Styling print: A4, explicit margins, print-color-adjust, activity/spot avoidance hanya jika muat. Long content punya break policy wajar; jangan memberi seluruh multi-day section break-inside avoid sehingga blank page besar/overflow.
12. Tambahkan `scripts/web/render-fixture.ts` yang memuat fixture/resources dan menghasilkan HTML ke `output/web-foundation/<fixture-id>.html`; fixture ID aman deterministik, bukan timestamp. Tambahkan preview index untuk memudahkan reviewer membuka seluruh output.
13. Tambahkan tests targeted untuk nested mapping, label coverage, metadata privacy, escaping payload, order, palette/URL validation, unsupported locale dan no external dependency.
14. Browser visual verification pada 390×844 dan 1440×1000. Wajib visual seluruh enam locale setidaknya satu mode, dan seluruh empat mode setidaknya satu locale; Latin/French accents dan Japanese/Chinese glyph tidak boleh tofu. Inspect console, DOM overflow dan request log.
15. Verification-only PDF menggunakan Puppeteer existing/Chromium tersedia, `printBackground:true`, output UUID/job fixture ID safe. Ini harness acceptance CP020, bukan CP026 production PDF feature. Render empat mode + enam locale smoke, 14-day/many-spots/long-card fixture; inspect halaman/warna/glyph/card breaks secara visual.
16. Simpan evidence di `output/web-foundation/`, jangan commit runtime credentials/fixture personal. Review → test → revise sampai PASS; buat completion log CP020, mark completed dan berhenti sebelum CP021.

**Acceptance CP020:**

- R20-1: pure renderer nested, four-mode layout/order benar, semua promised fields muncul tanpa private/execution metadata.
- R20-2: Tailwind v4 compiled inline, fonts/icons/assets offline, enam locale catalogs lengkap dan glyph benar.
- R20-3: text/attribute escaping, safe palette/assets/credit links, no arbitrary script/network fetch dan unsupported locale diagnostics.
- R20-4: phone/desktop visual serta browser request/console evidence, bukan source inspection saja.
- R20-5: verification PDF readable/nonzero, warna/glyph utuh, no clipped content; long cards punya pagination policy yang diuji.
- R20-6: old n8n assets unchanged, CP021+ belum diimplementasikan, log CP019/CP020 tersedia.

## Data Flow or Control Flow

```text
CP018: configured runtime + safe availability probes
         → locked runtime/API/locale/asset contract
         → review/test/revise → log18 → completed

CP019: legacy references + sanitized fixtures
         → canonical nested schema / registry / locale catalogs
         → pure adapter / normalization / structural validators
         → review/test/revise → log19 → completed

CP020: validated canonical fixture + explicit render resources
         → pure renderer → self-contained HTML
         → browser visuals + verification-only print PDF
         → review/test/revise → log20 → completed
         → planner evaluates chapter evidence → ACCEPT or REVISE
```

`Draft → resolve locale → publish structural validation → render` adalah future runtime seam. Chapter tidak menyamarkan fixture harness sebagai endpoint persistence/publish yang sudah tersedia.

## Files and n8n Workflows Affected

### File ownership worker

| Path | Owner/scope |
|---|---|
| `docs/engine-runtime-contract.md`, `.env.web.example` | CP018; contract/settings, no secret values. |
| `config/web/itinerary.schema.json`, `field-registry.json`, `locales/*.json` | CP019 canonical resources. |
| `src/contracts/*` | CP019 adapter/normalize/validate/types. |
| `tests/fixtures/web/*`, `tests/web/*` | CP019 contract + CP020 render verification. |
| `src/render/*`, bundled licensed font files | CP020 renderer/resources/styles. |
| `scripts/web/*` | Scoped probe/render/build/verification harness, bukan CRUD server. |
| `package.json`, `package-lock.json`, scoped tsconfig | Tambah tool/dependency yang benar-benar dipakai CP019/CP020; preserve old scripts/Puppeteer pin. |
| `.gitignore` | Ignore `.runtime/`, `output/web-foundation/` dan local secrets yang dibuat chapter; jangan menambah blanket ignore pada artifact user existing. |
| `TODOS.md` | Status/checklist masing-masing CP sesuai real progress. |
| `logs/cp018_completion-log_standalone-api-and-runtime-contract.md` | Sesudah CP018 verified. |
| `logs/cp019_completion-log_canonical-schema-and-field-registry.md` | Sesudah CP019 verified. |
| `logs/cp020_completion-log_portable-html-renderer.md` | Sesudah CP020 verified. |
| `output/web-foundation/*` | Generated screenshots/HTML/PDF/request/verification summaries. |

Existing `SPEC.md`, `RULES.md`, dan plan ini adalah authority: worker tidak mengubah acceptance/baseline untuk menghindari failure. Perubahan perlu clarification/revision planning. Tidak membuat tiga implementation-plan file tambahan.

Sebelum dependency installation atau harness membuat direktori/file, verifikasi parent path yang dituju. Semua perubahan file menggunakan tool edit/write yang disediakan harness, bukan subprocess sandbox yang tidak menjamin persistensi. Semua probe/network output diringkas tanpa raw secrets.

### Read-only references

`config/*.json` lama, root renderer, `scripts/render-pdf.mjs`, workflow JSON, output evidence lama, dan arsip n8n. Tidak ada n8n workflow/credential/API mutation pada chapter. `D:\belajar-pemograman` dan credential source file tidak dimodifikasi.

## Security and Failure Handling

- Jangan memakai Read/Grep/Bash yang mencetak credential file; loader boleh membaca memory-only di server/subprocess dan melaporkan configured/ambiguous/missing tanpa nilai.
- Environment/config separation: secret tidak masuk registry/catalog/frontend sample/HTML/log/error, tidak dikirim sebagai CLI arg atau disimpan dalam harness output.
- Model/runtime/locale/font unresolved adalah blocker dengan code/detail factual; tidak mengarang hasil atau melanjutkan atas mock success.
- Structural error menunjuk canonical path. Adapter mempertahankan caller input dan melaporkan lossy/unmapped fields, bukan silently deleting.
- Renderer tidak menghasilkan timestamp/UUID/network I/O; SSR HTML tidak membawa caller object lewat JSON script injection.
- Font/asset licensing dan actual content diperiksa. Missing photo fallback jelas; missing mandatory credit gagal sebelum public render.
- Operation/job IDs menjadi file names, safe output root diverifikasi, concurrency tidak memakai satu temp filename bersama. Cleanup verification processes/browser meski exception.
- Existing user work dipertahankan; tidak reset/clean/git commit otomatis. Worker meminta keputusan jika konflik authority/material scope ditemukan.

## Verification Plan

### Commands dan evidence

CP018 memakai probes read-only: Node/npm version, `node:sqlite` in-memory operasi nyata, Chromium version/launch feasibility, provider catalog/config availability melalui safe subprocess. Ringkas output; jangan dump model catalog atau credentials.

CP019/CP020 menambahkan script names minimal yang stabil:

| Command | Gate |
|---|---|
| `npm run validate` | Legacy package requirements/Puppeteer pin tetap lolos. |
| `npm test` | Existing tests tetap pass; tidak dianggap bukti web/PDF visual. |
| `npm run typecheck:web-core` | Scoped TypeScript contracts/render/harness. |
| `npm run test:web-core` | Node/tsx targeted contracts/render tests. |
| `npm run build:brochure-css` | Tailwind v4 build hasil nonempty, utility coverage benar. |
| `npm run verify:web-render` | Generate deterministic fixture HTML + browser/PDF evidence summary; manual visual inspection tetap wajib. |
| `git diff --check` | Whitespace/conflict checks sebelum handoff. |

Worker mendefinisikan scripts saat stage terkait memerlukannya; jangan mengklaim command ada atau dijalankan sebelum dibuat. Fixture rendering dapat menggunakan temporary static loopback server atau file page, bukan full CP021 server.

### Meaningful regression cases

1. Nested brochure title/logo/travellers/dates muncul; emergency label **dan nomor** ter-render.
2. Draft empty valid vs publish empty invalid; schedule/spots both populated rejected.
3. Reorder stable IDs dan text sama; adapter tidak mutasi fixture.
4. Locale valid baru lolos schema tetapi unknown catalog gagal capability gate; mixed brief fixture unresolved meminta override.
5. Six catalogs exact key set; proper noun tetap, label tidak fallback Inggris diam-diam; Latin date menggunakan policy explicit.
6. Script/attribute-break payload escaped; javascript/data-SVG URL ditolak sesuai trusted resource contract; no external resource requests.
7. Four modes + 14 days + many grouped spots + long description tetap lengkap, tidak silent thin/clipped.
8. Missing photo menghasilkan gradient yang dilihat nyata; credits/link ter-render dan valid.
9. Latin/French diacritics, Japanese dan Chinese glyph ter-render offline setelah font readiness.
10. Verification PDF halaman/warna/glyph dinilai visual; jangan test source regex lalu melabeli PDF PASS.

Catat command, exit code, fixture ID, browser/Chromium version, viewport, screenshot/PDF paths dan hasil. Evidence bebas secrets/PII; jangan mengaku model output multilingual teruji live hanya karena manual fixture terlihat baik.

## Acceptance Criteria

Chapter technically complete hanya jika **semua R18-*, R19-*, R20-* PASS**, completion log tiga CP tersedia dan dependency order tercatat. Status sebelum worker mulai tetap pending.

### Worker handoff untuk planner

Worker menyerahkan ringkasan, bukan dump seluruh source:

1. Per-CP status + plan/log path dan acceptance matrix R18-1 sampai R20-6.
2. Daftar intended changed files, dependency/lock changes, serta confirmed no changes ke Laravel/n8n/credential source.
3. Runtime/model/config decisions tanpa key; blocker/deviation jika ada.
4. Typecheck/tests/build results, browser request/console summary, rendered HTML/PDF/screenshot evidence paths.
5. Field coverage report, legacy adapter diagnostics, locale coverage/glyph checks dan HTML/font sizes.
6. Known remaining scope CP021+, dengan jelas membedakan foundation siap vs full app belum tersedia.

### Planner evaluation gate

Planner (large AI) membaca diff dan logs, memeriksa field/schema/renderer consistency, reproducibility commands dan visual evidence. Verdict:

- **ACCEPT:** scope/acceptance chapter terbukti; CP021 boleh direncanakan berikutnya.
- **REVISE:** worker mendapat daftar temuan konkret, affected CP, expected behavior dan verification ulang. Jika affected CP sudah completed, ikuti revision plan/log gate `RULES.md`; jangan mengubah history agar tampak selalu pass.
- **BLOCKED:** runtime/model/secret/capability belum bisa dibuktikan; worker berhenti dan meminta keputusan yang relevan.

Worker tidak menulis "planner approved" atas evaluasinya sendiri. Planner approval tidak dibuat dalam sesi penyusunan plan ini karena implementasi belum ada.

## Risks and Rollback

| Risk | Mitigation / rollback |
|---|---|
| GPT-6 Luna ID/provider unavailable | Stop CP018 blocked, simpan evidence tanpa secrets, minta keputusan; tidak mengganti model. |
| Credential format ambiguous | Safe loader hanya melaporkan ambiguity; injected env sementara hanya dengan keputusan pengguna. Tidak edit file sumber. |
| Node/SQLite/Chromium mismatch | Probe compatibility lebih dulu, lock known-working versions; proposed baseline change memerlukan Ask Question. |
| CJK font/glyph atau output size bermasalah | Licensed portable fonts + actual offline visual + measured limits. Jangan drop content untuk mengecilkan HTML. |
| Locale implementation menjadi enum enam item | Test locale di luar fixture diterima schema; capability check terpisah, katalog extensible. |
| Field mapping drift/legacy wrapper leak | Schema/registry coverage dan adapter diagnostics; pure renderer tidak membaca wrapper metadata. |
| Worker membangun CP021+ terlalu cepat | File ownership/scope gates; stop chapter setelah log CP020, planner evaluasi sebelum scope baru. |
| Existing n8n/user files berubah | Read-only references; rollback hanya intended chapter changes yang telah diperiksa, jangan git reset/clean massal. |

Rollback chapter menghapus/revert hanya file web baru dan perubahan tool scripts yang intended setelah inspeksi diff; mempertahankan fixture/evidence user dan n8n source. Status CP disesuaikan dengan real evidence. Tidak ada production cutover/data migration pada chapter.
