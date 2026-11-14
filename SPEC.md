# Itinerary Engine Web App — Specification

**Version:** 3.4 — engine-first, aplikasi mandiri; share link web dengan preview WhatsApp, tanpa PDF export; canonical `web-2.0.0` berbasis cara kerja guide; import itinerary dari teks/DOCX/PDF ber-teks ke draft.
**Tanggal:** 2026-11-05 (v3.3 dan v3.4 pada hari yang sama; v3.2: 2026-10-07).
**Status:** spesifikasi authoritative; progress implementasi dan chapter/revision gates mengikuti `TODOS.md`.
**Authority:** perilaku produk di dokumen ini, roadmap di `TODOS.md`, proses eksekusi di `RULES.md`.

## 1. Tujuan produk

Aplikasi untuk guide/tour operator membuat, mengedit, dan mempublikasikan itinerary sebagai halaman web yang bisa dibagikan. Halaman published menyediakan Open Graph metadata dan gambar preview agar link dapat menampilkan kartu preview di WhatsApp.

Guide menentukan tempat, urutan, waktu, durasi, transportasi, dan informasi praktis melalui form dinamis. AI hanya membantu menulis **overview** dan **description tiap tempat/aktivitas**. Hasil AI selalu bisa diedit.

Sejak v3.3 guide juga dapat **mengimpor itinerary yang sudah ia tulis** (ketik/tempel teks, DOCX, atau PDF ber-teks). AI hanya *mentranskripsikan* isi dokumen ke field canonical mode yang dipilih guide; tidak menyusun, menambah, atau menebak tempat, urutan, waktu, durasi, transport, harga, maupun deskripsi. Hasilnya draft biasa yang direview dan diedit guide sebelum publish (§7a).

Aplikasi diselesaikan lebih dahulu sebagai produk mandiri untuk **satu workspace guide/operator**. Backend engine sendiri menyediakan penyimpanan, AI, preview dan published web link. Rilis awal dapat digunakan lokal/private tanpa Laravel maupun n8n; WhatsApp preview memerlukan origin HTTPS publik yang dapat dijangkau crawler.

Setelah SaaS Laravel siap, engine dihubungkan melalui API untuk identitas, akses workspace/tenant, entitlement dan billing. Engine tetap menyimpan konten itinerary dan artefak published; Laravel tidak perlu membangun ulang editor atau renderer.

## 2. Keputusan dan batas scope

### 2.1 Keputusan yang dikonfirmasi pengguna

| ID | Keputusan |
|---|---|
| W1 | App terpisah + integrasi API dengan SaaS Laravel, bukan editor yang ditanam langsung sebagai modul Laravel. |
| W2 | Empat mode tersedia pada rilis awal: `half_day`, `full_day`, `multi_day`, `destination_guide`. |
| W3 | Form dinamis berdasarkan field itinerary; guide mengisi itinerary, AI membantu overview dan deskripsi tempat. |
| W4 | Output produk adalah published web page melalui share link; HTML menyediakan Open Graph metadata/image untuk social preview. PDF render/export tidak termasuk scope produk. |
| W5 | Itinerary Engine harus selesai dan dapat digunakan sebelum SaaS Laravel selesai. |
| W6 | Rilis mandiri awal menggunakan satu workspace, lokal/private; akun multi-guide dikelola SaaS pada fase integrasi. |
| W7 | Baseline disetujui: Node.js 24+, TypeScript, Fastify, `node:sqlite`, React/Vite/Tailwind v4. |
| W8 | Fixture multibahasa awal: bahasa Latin (`la`), Prancis (`fr`), Inggris (`en`), Indonesia (`id`), Jepang (`ja`), Mandarin sederhana (`zh-Hans`). Ini bukan enum pembatas bahasa produk. |
| W9 | Satu implementation plan chapter CP018–CP020 untuk worker AI; scope tidak mencakup CP021. Planner mengevaluasi hasil chapter berdasarkan evidence worker. |
| W10 | Satu implementation plan chapter CP024–CP025, urutan preview/validasi → publish/versioning/share preview; log per CP dan dependency gate tetap berlaku. Eksekusi menunggu chapter sebelumnya ACCEPT. |
| W11 | Preview draft yang aman untuk render boleh belum publish-ready; diagnostics publish ditampilkan terpisah. Preview tidak mengubah draft atau memberi izin publish. |
| W12 | Jadwal/waktu/durasi yang ambigu atau tidak lengkap menghasilkan warning bahwa jadwal belum sepenuhnya diverifikasi, bukan nilai karangan atau blocker otomatis. Pelanggaran overlap/cap yang terbukti tetap error sebelum publish. |
| W13 | Retain + rotate: republish aktif mempertahankan link; revoke permanen token lama; publish setelah revoke menggunakan token baru. Snapshot/HTML/assets dipertahankan tanpa expiry atau auto-delete. |
| W14 | Public published HTML mengandung Open Graph title, description, URL dan absolute preview-image URL yang dapat diambil crawler tanpa login. PDF rendering/export dihapus dari scope; CP026 ditandai removed sebelum implementasi. |
| W16 | Import teks/DOCX/PDF menghasilkan **draft untuk review**, bukan publish otomatis; hasil ekstraksi mengisi field canonical asli dan seluruhnya dapat diedit guide (Ask Question 2026-11-05). |
| W17 | Format import v1: teks ketik/tempel, DOCX, PDF dengan text layer. PDF scan/foto ditolak dengan pesan jelas; tanpa OCR/vision. |
| W18 | Import tidak memakai kuota harian maupun plafon budget, dan tidak memotong ledger live US$2 atau kuota 30 operasi menulis; biaya aktual tiap import tetap dicatat di ledger terpisah dan ditampilkan. Batas teknis per request tetap berlaku sebagai pengaman. |
| W19 | Data yang tidak ada di dokumen dibiarkan kosong + warning (selaras W12); deskripsi/overview hanya diambil dari dokumen; guide memilih mode sebelum import; setiap field hasil import menyimpan kutipan sumber privat. |
| W20 | Chapter CP030–CP032 (import) dijalankan sebelum CP029; CP029 Laravel menjadi CP paling akhir roadmap. |
| W21 | Canonical diganti `web-2.0.0` berbasis cara kerja guide (revisi CP019–CP025, prioritas di atas CP030–CP032). Bentuk schema, aturan mode, mapping migrasi dan perilaku editor otoritatif ada di `plans/cp019-cp025_revision-plan_guide-centric-schema-and-editor.md` § Required Behavior; §5–§6 di bawah yang menyebut path `brochure.*`/`schedule[]`/`spots[]` adalah v1 historis. |
| W22 | Tetap 4 mode yang dibedakan nyata: half day ≤ 6 jam tanpa makan, full day ≤ 12 jam dengan makan, multi day 2–14 hari (hotel/makan/transfer per hari), destination guide tanpa tanggal/jam. Pemilihan mode lewat kartu berpenjelasan, badge warna per mode. |
| W23 | Field baru: titik & jam kumpul, penjemputan/pengantaran, nama & kontak guide trip, ketentuan/kebijakan, jam mulai–selesai tur. Field dihapus: duplikat turunan (quickFacts, kontak agensi penutup, kredit foto manual, tanggal dibuat), profil wisatawan, tema & jenis destinasi (diganti warna tema), sorotan & musim terbaik. Data agensi hanya dari profil workspace. |
| W24 | Tempat destination guide wajib nama, area, deskripsi; detail lain opsional. Draft v1 dimigrasi otomatis (backup + warning untuk perubahan lossy); snapshot published tetap HTML immutable lama. |
| W15 | Chapter CP027–CP028 adalah local E2E + deployment readiness saja (structured decision 2026-10-07); target AWS belum dipilih. Tidak provisioning, staging, DNS atau production deploy. Local TLS/OG contract diuji, external HTTPS/WhatsApp card appearance ditunda ke deployment yang diminta terpisah. |

### 2.2 Baseline engineering yang harus dikunci pada CP018

- Frontend mandiri: React + TypeScript + Vite, **Tailwind CSS v4**.
- Backend Node.js 24+ + TypeScript + Fastify: API, validasi, persistence, AI provider adapter, render HTML dan publish route.
- Persistence awal: SQLite server-side melalui `node:sqlite` dan filesystem untuk asset/HTML; real storage yang tetap ada setelah restart, bukan mock atau browser localStorage sebagai source of truth.
- Satu backend engine; renderer adalah module/worker internal, tidak perlu microservice, Redis, atau database Laravel untuk rilis awal.
- Provider AI rilis mandiri: OpenRouter, dengan GPT-6 Luna sebagai target model. Verifikasi exact API model ID/slug dan dukungan endpoint pada CP018; nama tampilan model bukan pengganti ID API.
- Untuk local development, key dirujuk dari `D:\.agents\Micro Saas\Credential_information.md`; file itu di luar repo dan tidak boleh dibaca ke log/context, disalin ke repo, atau dikirim ke browser. Format file belum ditentukan; CP018 menetapkan cara aman memuatnya ke server process. Deployment menggunakan secret store/environment injection, bukan file credential lokal.
- Limit/rate usage lokal bukan subscription/billing SaaS.
- Future SaaS adapter untuk identity/authorization/entitlement; canonical data, field registry, editor dan renderer tidak bergantung adapter Laravel.
- Default standalone bind ke loopback/local-private dengan workspace yang dipilih server. Sebelum editor/API dipaparkan ke jaringan publik, harus ada proteksi operator di boundary deployment; public share routes dipisahkan dari akses editor.

CP018 mengunci pilihan library, port/origin, data directories, asset limits, OpenRouter/GPT-6 Luna API model ID dan secret loading, serta Node/Chromium runtime. Pilihan baseline teknis dapat diperbaiki melalui Ask Question sebelum implementation plan, tetapi kemampuan mandiri W5/W6 tidak boleh menjadi fallback mock.

**Target integrasi berikutnya:** `D:\belajar-pemograman` (TourFlow). Pemeriksaan 2026-10-06: `composer.json` mensyaratkan Laravel `^13.17` dan PHP `^8.3`; frontend Blade/Vite dengan Tailwind v4. Route yang diperiksa berisi halaman belajar dan demo tour, belum itinerary API. Kesiapan auth/tenant/subscription/API tidak diasumsikan. Repo ini baru menjadi dependency pada CP029, bukan CP018–CP028.

### 2.3 Aturan produk yang dibawa dari v2

| Referensi lama | Aturan pada versi web |
|---|---|
| D1 | Guide/operator membuat output; traveller membaca output published. |
| D2, D5 | Published HTML/share link adalah output produk; link tidak memakai expiry 24 jam. PDF export tidak termasuk scope terbaru. |
| D3 | Foto milik guide dapat digunakan; stock photo opsional, hanya dekorasi destinasi/region. |
| D6 | `multi_day` mendukung 2–14 hari. Guide mengendalikan pengelompokan hari; AI tidak memadatkan jadwal otomatis. |
| D7 | Tidak ada nilai harga dalam brochure. Billing/subscription SaaS terpisah dari konten itinerary. |
| D10 (revised) | Itinerary multibahasa; bahasa output mengikuti bahasa yang klien gunakan pada brief/form. Tidak dibatasi ke `id`/`en`; guide boleh memilih override bahasa secara eksplisit. |
| D11 | AI tidak membuat klaim jam operasional atau harga tiket. Waktu kunjungan dari guide bukan jam buka venue. |
| D12, D13 | Timeline untuk mode terjadwal; kartu tempat untuk destination guide. |
| D14, D15 | Konten bersifat brochure dan guidance, tanpa rating, scarcity, atau booking CTA; tempat dapat dikelompokkan tanpa menghilangkan kedalaman. |

**Multilingual behavior (D10):** bahasa output mengikuti bahasa dominan yang klien gunakan dalam brief dan isian konten. `outputLanguage` menyimpan locale/tag bahasa extensible (misalnya BCP 47), bukan enum tetap `id`/`en`. Guide dapat memilih override bahasa. Jika input bercampur atau deteksi bahasa tidak yakin, minta guide memilih sebelum generate AI/publish; jangan diam-diam menerjemahkan teks manual klien. Generated output dan label brochure mengikuti locale terpilih. Locale catalog/font/model yang belum mendukung bahasa yang dipilih harus dinyatakan jelas sebelum publish, bukan menghasilkan halaman setengah diterjemahkan.

CP020 memverifikasi katalog label dan render untuk `la`, `fr`, `en`, `id`, `ja`, `zh-Hans`, termasuk font CJK self-contained. Bahasa lain ditambahkan lewat katalog/capability extensible; schema tidak diubah menjadi enum enam bahasa. CP018 menetapkan mekanisme detection, tetapi implementasi detection/AI endpoints menjadi CP023. Fixture chapter tidak boleh diklaim sebagai hasil live AI jika dibuat manual.

Pipeline tiga tahap AI, penentuan rute oleh AI, genericisation venue otomatis, serta email wajib pada pipeline lama digantikan oleh editor dan AI per field. D4/D8 tetap menjadi prinsip kehati-hatian fakta, tetapi pencarian/verifikasi venue otomatis bukan syarat rilis awal. D9 berlaku jika fitur email ditambahkan: pengiriman ke guide secara eksplisit, bukan otomatis ke traveller.

## 3. Arsitektur dan kepemilikan

```text
FASE A — ENGINE MANDIRI
Guide → web editor → Node engine API → SQLite + asset/artifact storage
                            ├─ AI overview/description + local usage limits
                             └─ HTML renderer → immutable published HTML + OG metadata/image
Traveller → engine share route → published HTML + social preview image

FASE B — SAAS INTEGRATION
Laravel TourFlow → authenticated engine API / identity adapter
  accounts, tenant, entitlement, billing → workspace-scoped engine operations
```

| Komponen | Tanggung jawab |
|---|---|
| Web editor | Form dinamis, tambah/hapus/urutkan hari dan tempat, edit hasil AI, preview, status save/publish. |
| Node engine API | Workspace scope, validasi, CRUD, revision checking, AI, usage limits, publikasi dan storage. |
| Renderer | Render deterministik dari data tervalidasi dan embed asset yang diizinkan ke HTML; internal ke engine. |
| Public page | Hanya versi published; tidak menampilkan draft, email internal, atau metadata billing. |
| Future Laravel adapter | Menerjemahkan identitas, tenant dan entitlement SaaS ke engine workspace; tidak mengambil alih renderer/data tanpa migration plan tersendiri. |

App tidak bergantung pada Laravel atau n8n untuk create, save, generate copy, preview, atau publish. Workflow lama menjadi referensi migrasi. Fase B tidak mengubah kepemilikan konten secara otomatis atau menggandakan database itinerary di Laravel.

## 4. Alur pengguna

1. Guide membuka app lokal/private dan menggunakan satu workspace operator yang dikonfigurasi server.
2. Pilih mode dan isi informasi perjalanan.
3. Tambah hari/blok, tempat/aktivitas, serta informasi praktis; ubah urutan sesuai rute.
4. Isi overview/deskripsi manual atau minta AI untuk field tertentu.
5. Edit hasil, simpan draft, dan lihat preview mobile/desktop.
6. Publish versi tertentu, lalu salin/bagikan web link; WhatsApp dapat menampilkan kartu preview jika crawler dapat mengambil origin HTTPS dan image.
8. Revisi membuat perubahan di draft. Traveller tetap melihat versi published sebelumnya sampai republish berhasil.

Overview/deskripsi manual tetap dapat dipakai ketika provider AI gagal atau local usage limit tercapai. Link lokal hanya dapat diakses pada lingkungan yang dapat menjangkau origin engine; link internet membutuhkan deployment dengan domain/origin yang sesuai. Keduanya menggunakan publish route dan data yang sama, bukan file preview sementara.

## 5. Empat mode dan form dinamis

> **v3.4:** tabel dan aturan di bawah adalah perilaku `web-1.0.0`. Perilaku target `web-2.0.0` (W21–W24) ada di revision plan guide-centric; setelah R6 selesai, bagian ini ditulis ulang dari plan tersebut.

| Mode | Editor | Konten output |
|---|---|---|
| `half_day` | Satu blok aktivitas, waktu/durasi; tidak ada akomodasi malam. | Timeline ringkas. |
| `full_day` | Satu blok aktivitas, waktu/durasi, catatan transportasi. | Timeline satu hari. |
| `multi_day` | 2–14 hari, aktivitas per hari, akomodasi dan makan. | Timeline dengan penanda hari. |
| `destination_guide` | Tempat dan kelompok area/tema, tanpa jam atau urutan perjalanan wajib. | Kartu tempat dengan durasi kunjungan, best time, akses, dan tips. |

- Tepat satu dari `schedule[]` atau `spots[]` berisi data pada output final.
- ID stabil pada hari/aktivitas/tempat dipakai untuk editing, reorder, dan target AI; posisi array tidak menjadi identitas.
- Perubahan mode yang membuang data harus dikonfirmasi; data tidak dihapus diam-diam.
- `durationDays` berasal dari hari yang dibuat pada editor multi-day, tidak menjadi input yang bisa bertentangan dengan isi jadwal.
- Reorder, tambah, dan hapus dapat digunakan lewat keyboard serta tombol, bukan drag-and-drop saja.
- Jumlah tempat tidak dibatasi sebagai aturan konten; batas ukuran payload/performa ditentukan dan didokumentasikan pada CP018/CP019. Batas tidak boleh menyebabkan pemotongan diam-diam.
- Deskripsi aktivitas menjelaskan pengalaman/konteks, bukan mengulang judul. Deskripsi spot guide menargetkan 40–90 kata, disertai logistics dan minimal satu tip actionable; jumlah kata bukan satu-satunya ukuran kualitas.
- Waktu tumpang tindih dan durasi yang melebihi 6 jam untuk half-day atau 11 jam per hari untuk full/multi-day ditampilkan sebagai kesalahan yang harus dibereskan sebelum publish. AI tidak memperbaiki atau mengubah rute otomatis.
- Panduan travel-time lama hanya diadaptasi jika datanya mencukupi; aplikasi tidak mengklaim rute feasible tanpa bukti geografi/durasi yang memadai.
- Keputusan CP024–CP025 (2026-10-07): label waktu/durasi yang tidak bisa dihitung pasti tetap disimpan dan memunculkan warning/partial schedule verification. Tidak menginfer durasi dari aktivitas berikutnya atau membagi durasi blok condensed ke hari-hari tanpa data. Error publish hanya untuk konflik/pelanggaran yang bisa dibuktikan dari input; tidak mengubah field duration opsional menjadi required secara diam-diam.

## 6. Kontrak data dan pemetaan field

### 6.1 Satu canonical document

`config/itinerary-schema.json` adalah fondasi v2, bukan kontrak editor yang sudah selesai. Kontrak web ada di `config/web/itinerary.schema.json` (`web-1.0.0`) beserta `field-registry.json` dan locale catalogs; perubahan tidak menimpa schema n8n lama.

```text
ItineraryRecord                 dimiliki backend engine, tidak dikirim seluruhnya ke AI
  id, workspaceId, revision, schemaVersion
  draftContent, currentPublishedVersionId
  languageContext                requestedLanguage, resolved outputLanguage, source (detected|explicit|unresolved)
  createdAt, updatedAt

canonical content
  brochure                      agency, title, destination, mode, dates, travellers, language
  hero                          photo asset, attribution, gradient fallback
  overview                      summary, quickFacts, routeSummary, highlights
  schedule[]                    stable id, numeric dayStart/dayEnd, activities[], accommodation, notes
    activities[]                stable id, timeLabel, type, title, description, durationLabel
  spots[]                       stable id, group, name, area, category, description, logistics, tips
  practical                     included, notIncluded, packing, local tips, safety, emergency contacts
  closing                       closingNote, agencyContact, disclaimer, photoCredits
```

Renderer menerima canonical content dengan `brochure` bersarang, bukan bergantung pada field duplikat di root. Metadata workspace/revision dan state form bukan bagian brochure. Future external tenant/user IDs disimpan dalam mapping integrasi tersendiri, tidak menggantikan stable IDs itinerary/version.

### 6.2 Field registry untuk editor

Registry terpusat mendefinisikan `path`, label per bahasa, tipe kontrol, required-on-publish, mode visibility, grup/repeater, sumber nilai (`manual`, `derived`, `ai-assisted`), dan batas panjang. Registry harus cocok dengan schema dan pemetaan renderer.

| Path | Kontrol | Pemilik nilai | Output |
|---|---|---|---|
| `brochure.tripTitle` | Text | Guide | Judul hero. |
| `brochure.destination` | Text | Guide | Lokasi hero. |
| `brochure.agencyName`, `brochure.agencyContact` | Text | Profil workspace/guide; profil SaaS opsional pada fase B | Identitas dan kontak guide. |
| `brochure.itineraryMode` | Select | Guide | Memilih editor/layout. |
| `brochure.durationDays`, `brochure.scopeLabel` | Read-only | Derived | Durasi/scope. |
| `brochure.startDate`, `endDate`, `travelerCount`, `travelerType` | Date/number/select | Guide/derived | Informasi perjalanan. |
| `brochure.outputLanguage` | Auto-detect + searchable locale selector override | Derived dari brief/input; guide dapat override | Mengatur AI, format tanggal/angka, dan label brochure; locale extensible, bukan enum tetap `id`/`en`. |
| `hero.photoUrl`, `photoAttribution` | Asset selector + credit fields | Guide | Hero dan credit. |
| `overview.summary` | Textarea + Generate | Guide/AI | Overview. |
| `schedule[].activities[].title` | Text | Guide | Nama tempat/aktivitas. |
| `schedule[].activities[].description` | Textarea + Generate | Guide/AI | Deskripsi timeline. |
| `schedule[].activities[].timeLabel`, `durationLabel` | Time/duration | Guide | Jadwal dan durasi. |
| `spots[].name`, `area`, `category` | Text/select | Guide | Identitas kartu tempat. |
| `spots[].description` | Textarea + Generate | Guide/AI | Deskripsi kartu tempat. |
| `spots[].suggestedDuration`, `bestTimeToVisit`, `gettingThere`, `tips[]` | Text/repeater | Guide | Guidance praktis. |
| `practical.*`, `closing.*` | Field/group/repeater sesuai schema | Guide/default terkurasi | Informasi praktis dan penutup. |

Tabel ini menjelaskan pemetaan utama. CP019 wajib menginventarisasi seluruh field: setiap field memiliki input, derivation/default, atau alasan explicit tidak ditampilkan. Placeholder tidak dipertontonkan mentah sebagai nama form.

## 7. AI writing yang terbatas

- Dua operasi: overview seluruh itinerary dan deskripsi satu aktivitas/spot berdasarkan ID stabil.
- Konteks: locale terpilih/dideteksi, destinasi, nama/area tempat, jenis aktivitas, itinerary relevan, dan catatan faktual guide.
- Overview hanya menghasilkan `overview.summary`; deskripsi hanya menghasilkan `description` untuk target yang diminta.
- AI tidak mengubah nama tempat, urutan, tanggal, waktu, durasi, transportasi, hotel, atau field lain.
- Tidak membuat tempat baru, harga, jam operasional, rating, atau klaim fasilitas yang tidak didukung konteks. Konteks kurang: minta guide melengkapi atau gunakan deskripsi umum yang tidak membuat klaim spesifik.
- Catatan guide diperlakukan sebagai data, bukan instruksi yang mengubah batas tugas AI.
- Response terstruktur, validasi tipe/panjang/konsistensi terhadap locale terpilih/konten sebelum menawarkan hasil ke guide; deteksi bahasa bukan bukti dukungan model.
- Hasil ditampilkan sebagai usulan; Apply mengganti field target, Discard mempertahankan teks lama. Tidak autosave hasil AI sebelum Apply.
- Request terikat `itineraryId`, `targetId`, `revision`, dan operation ID. Hasil yang stale tidak menimpa perubahan yang lebih baru.
- Kunci OpenRouter hanya di backend engine. AI menerima konteks minimum, bukan email penerima atau metadata akun/billing. GPT-6 Luna adalah target; request live baru dilakukan setelah CP018 mengonfirmasi model ID yang didukung dan secret loading berfungsi.
- Timeout/retry terbatas; satu operation ID tidak menggandakan usage accounting karena retry transport. Local usage limit/idempotency dikunci pada CP018; subscription charge/refund baru dikunci dengan Laravel pada CP029.

## 7a. Import itinerary dari dokumen/teks (v3.3)

- Input: mode pilihan guide + teks ketik/tempel, DOCX, atau PDF ber-teks. Tipe dideteksi dari magic bytes; batas ukuran/halaman/dekompresi/panjang teks ditolak secara eksplisit, bukan dipotong diam-diam. Byte file asli tidak disimpan setelah ekstraksi; teks hasil ekstraksi disimpan privat milik workspace.
- Ekstraksi teks deterministik (tanpa AI). Ekstraksi struktur oleh AI hanya transkripsi: setiap nilai wajib memiliki kutipan verbatim yang terbukti ada di teks sumber; angka jam/durasi harus muncul di kutipannya. Nilai tanpa kutipan terverifikasi dibuang menjadi field kosong + warning.
- Dokumen diperlakukan sebagai data tak tepercaya, bukan instruksi. Bahasa mengikuti dokumen (D10); tidak ada terjemahan diam-diam. Teks guide yang berisi harga/jam buka tidak dihapus; guard publish CP024 tetap melaporkannya.
- Hasil selalu draft baru yang lolos `validateDraft`; kegagalan tidak membuat half-draft. Kutipan/provenance dan teks sumber privat, tidak pernah masuk snapshot published, HTML, OG atau route publik.
- Operasi import idempotent per operation ID, satu import in-flight per workspace, biaya/token dicatat di ledger import terpisah (W18).

## 8. Penyimpanan, preview, dan publish

- Draft boleh belum lengkap; publish wajib lolos schema dan aturan konten.
- Save menggunakan optimistic revision check. Konflik `409` mempertahankan input lokal dan menawarkan reload/reconcile; tidak silent last-write-wins.
- Preview memakai renderer dan stylesheet yang sama dengan output published. Autosave/debounce hanya diperkenalkan jika status saved/unsaved/error selalu jelas.
- Preview CP024 memakai saved revision setelah manual Save dan terisolasi dari editor; draft yang incomplete dapat dirender jika struktur, locale dan resource aman. Publish-readiness errors/warnings terpisah; locale/resource unsafe/unresolved tetap memblokir render, tanpa fallback bahasa diam-diam.
- PublishedVersion menyimpan snapshot canonical content, self-contained HTML, asset references dan render/schema version; tidak ada PDF status.
- Snapshot published immutable. Link itinerary stabil menunjuk current published version.
- Publish/republish atomik setelah HTML berhasil dibuat dan disimpan. Kegagalan mempertahankan published version lama serta draft.
- Share token acak minimal 128 bit, tidak berasal dari sequential ID. Default tanpa expiry otomatis; dapat di-unpublish/revoke oleh guide berizin.
- Republish saat aktif mempertahankan link. Revoke mematikan token lama secara permanen; publish baru setelah revoke membuat token baru dan replay operasi lama tidak mengaktifkan kembali link yang dicabut.
- Link berlaku setidaknya 12 bulan selama tidak direvoke/dihapus berdasarkan kebijakan retention operator dan origin/storage engine tetap tersedia. Kebijakan retention standalone diperjelas oleh keputusan chapter CP024–CP025 di bawah; account/tenant closure SaaS ditambahkan pada CP029.
- Keputusan chapter 2026-10-07 melengkapi gap retention CP018: tidak ada purge/expiry otomatis; seluruh committed snapshots, HTML dan assets embedded disimpan. Revoke hanya mencabut public access, bukan menghapus owner history. Kebijakan deletion baru memerlukan keputusan terpisah.
- Public page mobile-first, `noindex`, dan tidak membutuhkan login. Ini akses bearer-link, bukan akses privat berbasis identitas.
- Public HTML menyediakan `og:title`, `og:description`, absolute `og:url` dan absolute `og:image`; public OG image route hanya menyajikan asset preview dari active current published version. WhatsApp/Meta scraping membutuhkan origin HTTPS yang dapat diakses publik dan dapat memakai cache eksternal.
- Keputusan 2026-10-07: tidak ada PDF render, export, download, job, worker atau PDF API/UI dalam product scope; CP026 dihapus sebelum implementasi. CP020 print CSS/pagination artifacts tetap sebagai hasil renderer historis, bukan product PDF feature.

## 9. Kontrak API engine dan integrasi mendatang

Endpoint rilis awal dimiliki Node engine. Browser menggunakan same-origin engine API; tidak memerlukan API Laravel. Nama/version/payload final dikunci CP018/CP019 dan dapat diakses future Laravel adapter tanpa mengubah editor.

### 9.1 Browser → Node engine

| Method/path | Fungsi |
|---|---|
| `GET /api/v1/itinerary-engine/context` | Workspace, agency defaults, access mode, local usage, capabilities. |
| `GET/PATCH /api/v1/itinerary-engine/profile` | Baca / simpan agency defaults workspace. |
| `POST /api/v1/assets` | Upload asset tervalidasi milik workspace. |
| `GET/POST /api/v1/itineraries` | Daftar milik workspace / buat draft. |
| `GET/PATCH /api/v1/itineraries/{id}` | Baca / simpan draft dengan expected revision. |
| `POST /api/v1/itineraries/{id}/ai/overview` | Usulan overview. |
| `POST /api/v1/itineraries/{id}/ai/description` | Usulan deskripsi untuk activity/spot ID. |
| `POST /api/v1/imports/sources` | Intake import: mode + teks atau file DOCX/PDF → teks terekstrak tersimpan + language proposal. |
| `GET /api/v1/imports/sources/{id}` | Metadata + teks hasil ekstraksi (privat). |
| `POST /api/v1/imports/sources/{id}/extract` | Ekstraksi AI terstruktur → draft baru + warnings/missing + biaya. |
| `GET /api/v1/itineraries/{id}/import-provenance` | Kutipan sumber per field hasil import (privat). |
| `POST /api/v1/itineraries/{id}/preview` | Preview draft tervalidasi untuk render. |
| `POST /api/v1/itineraries/{id}/publish` | Publish revision tertentu secara idempotent. |
| `POST /api/v1/itineraries/{id}/unpublish` | Cabut akses link. |
| `GET /i/{shareToken}` | HTML published untuk traveller. |
| `GET /i/{shareToken}/og-image` | Preview image versi published aktif untuk crawler sosial. |

Response error memiliki code stabil, message, field errors jika ada, request ID; tidak membocorkan secret atau path server. Minimal: `401`, `403`, `404`, `409`, `422`, `429`, dan `503` untuk dependency unavailable.

### 9.2 API → HTML renderer

- Renderer dipanggil internal oleh engine API; tidak perlu endpoint render publik terpisah.
- Input: operation ID, render/schema version, canonical snapshot, serta asset yang sudah di-resolve oleh backend.
- Result HTML; errors terstruktur, timeout terbatas. Path file arbitrer dari client tidak diterima.
- Immutable published HTML dan embedded preview image disimpan; tidak ada PDF job queue atau export worker.

### 9.3 Akses standalone dan future SaaS adapter

- Standalone: tidak ada signup atau akun multi-guide. Workspace tunggal berasal dari konfigurasi server; browser tidak dapat memilih workspace dengan payload.
- Editor/management API bersifat lokal/private. Jika share routes dihost publik, perimeter harus tetap membatasi editor/API; public access hanya ke token routes dan asset snapshot yang diperlukan. Konfigurasi exposure diuji sebelum deployment.
- Semua record/asset/version/AI operation tetap workspace-scoped untuk memudahkan integrasi nantinya.
- Fase B: Laravel mengirim identitas/entitlement lewat integrasi server-to-server yang diautentikasi; engine memetakan external tenant ke workspace internal. Jangan mempercayai tenant/user headers dari browser.
- Contract tests future adapter dapat ditulis sebelum Laravel siap; actual SSO, permission, billing/kuota, CORS/CSRF dan dua tenant baru dinyatakan terintegrasi setelah diuji terhadap Laravel nyata pada CP029.
- Mode integrasi yang tidak valid/unavailable tidak boleh fallback ke workspace standalone. Service credentials tidak pernah dikirim ke frontend.

## 10. Rendering and assets

- Satu layout/render contract untuk preview dan HTML published. Tailwind CSS **v4**, compiled dan inline pada snapshot agar self-contained; tidak bergantung CDN runtime.
- Reuse fungsi/layout dari `render-itinerary-html.js`; implementasi web baru diselaraskan dengan schema nested, bukan copy bug flattening.
- Seluruh text escaped; tidak menerima arbitrary HTML/script dari guide maupun AI.
- Render agency logo, tanggal, peserta, emergency **label + value**, dan attribution berupa credit/link yang sesuai schema.
- Foto/asset di-resolve melalui storage engine atau allowlisted backend acquisition. Tidak membiarkan Chromium mengambil URL arbitrer dari form.
- Validasi size, MIME, dan protokol asset; cegah akses private network/file URL pada fetch backend. Foto gagal menjadi gradient fallback yang jelas.
- Stock photo bersifat dekoratif destinasi/region, tidak diklaim sebagai foto venue tertentu. Credit wajib; provider download attribution requirements dipenuhi jika integrasinya digunakan.
- Print CSS tetap menjadi styling/regression renderer jika relevan, bukan kemampuan export/download produk.
- OG preview image yang bounded berasal dari hero/gradient versi published dan disajikan melalui route active-token.
- Temporary preview/publish files memakai operation UUID, bukan `Date.now()` atau path pengguna; cleanup dalam `finally`, termasuk timeout/gagal.

## 11. Reuse dan gap yang sudah diketahui

| Bahan sekarang | Perlakuan |
|---|---|
| `config/itinerary-schema.json` | Dasar schema web baru dengan stable IDs dan pemisahan metadata. |
| `config/mode-profiles.json`, `palettes.json`, `travel-rules.json` | Port nilai/aturan yang masih sesuai, hindari duplikasi sumber config. |
| `render-itinerary-html.js` | Referensi fungsi/layout; nested mapping, label bahasa, field yang hilang, dan Tailwind v4 perlu diselaraskan. |
| `scripts/render-pdf.mjs` | Historical standalone helper; jangan port ke product export kecuali scope dipulihkan melalui keputusan baru. |
| Workflow n8n 63 node | Sumber referensi prompt/parser/validation; `$input`, `$execution`, dan lookup node tidak masuk runtime web. |
| `output/`, `e2e-pdf-results/` | Fixture dan contoh visual untuk regression, bukan sumber data produksi. |
| Landing page CP015 | Referensi marketing; tidak dianggap editor yang sudah selesai. |

Schema output dan renderer sekarang berbeda nested/flat; sebagian metadata belum ditampilkan; tips renderer belum seluruhnya masuk schema; render emergency contacts dapat kehilangan value. Tidak ditemukan standalone editor, database/API aplikasi, atau field registry lengkap pada repo ini.

PDF/print artifacts adalah bukti validasi renderer yang telah selesai. Scope sekarang tidak memerlukan verifikasi export PDF baru; verifikasi public OG HTML/image secara terpisah.

## 12. Acceptance criteria rilis awal

1. Satu operator dapat menjalankan editor + engine API + storage tanpa menjalankan Laravel atau n8n.
2. Workspace dipilih server; editor/management API terbatas lokal/private, public token routes tidak membocorkan draft atau asset private.
3. Empat mode dapat dibuat, disimpan, dibuka kembali, diedit, dipreview dan dipublish sebagai web page.
4. Semua field registry memiliki sumber nilai dan pemetaan output; nested schema dipakai konsisten.
5. AI overview/deskripsi hanya mengubah field yang di-Apply; urutan dan data guide tetap identik.
6. Timeout AI, local usage limit, revision conflict, dan renderer unavailable mempertahankan pekerjaan guide.
7. Draft edit tidak mengubah public page; republish berhasil mengganti current version secara atomik.
8. Link tidak expired dalam 24 jam; revoke berlaku untuk HTML/OG image dan tidak menyajikan cached snapshot lama.
9. Published HTML memiliki Open Graph metadata dan public preview image yang benar, aman, dan dapat diambil tanpa login dari reachable HTTPS origin.
10. Preview/public page diperiksa visual pada phone dan desktop untuk empat mode, termasuk multi-day 14 hari dan guide banyak tempat.
11. Bahasa itinerary mengikuti brief klien atau override guide, tidak dibatasi ke Indonesia/Inggris; locale dan label output konsisten, tanpa unresolved placeholder, metadata internal, harga, booking CTA, atau klaim jam buka dari AI.
12. AI/provider keys dan service credentials tidak ada di browser, workflow export baru, atau source control.
13. Draft, published link, assets, HTML snapshots dan OG preview image bertahan setelah restart.
14. Kontrak API dan adapter boundary terdokumentasi; rilis mandiri tidak menunggu implementasi SaaS.
15. (v3.3, revisi CP030–CP032 2026-11-14) Guide dapat membuat draft dari teks atau PDF ber-teks (tanpa OCR) untuk lima mode runtime; file scan/terenkripsi/terlalu besar ditolak dengan pesan jelas. Fakta yang diterima deterministik/AI harus lolos bukti sumber dan target; konflik atau ambiguitas tidak dipilih diam-diam, omission terlihat, dan review kandidat privat revision-safe. Draft dapat diedit, dipreview, dan dipublish lewat aturan yang sama; provenance/bukti tidak bocor ke route publik; ledger US$2 dan kuota menulis tidak berubah karena import. Revisi ini menggantikan klaim DOCX dan empat mode pada kalimat historis ini; tidak mengubah schema canonical.

**Readiness boundary (W15):** untuk CP027–CP028, kriteria 9 dibagi menjadi local initial-HTML/OG-image/TLS access contract dan external HTTPS/WhatsApp crawler verification. Seluruh local criteria wajib PASS; external portion dicatat **DEFERRED — target/domain/deployment belum diotorisasi**, bukan PASS. CP028 dapat selesai sebagai `standalone-ready/not-deployed` setelah clean runtime, private/public proxy boundary, restore/rollback dan resource measurements lulus. Label staging-ready/production-live serta kartu WhatsApp internet membutuhkan verifikasi pada origin nyata setelah deployment diotorisasi. Deterministic provider doubles menguji lifecycle/faults; evidence live CP023/replay dicatat terpisah dan tidak disebut inference baru.

**Acceptance fase B (CP029, bukan gate rilis awal):** akses engine dari identitas Laravel, tenant/workspace mapping, permission dan entitlement/usage accounting bekerja pada SaaS nyata. Dua tenant tidak dapat mengakses draft/version/asset/AI operation tenant lain; mode standalone tidak menjadi authorization bypass. Itinerary IDs dan published links tetap utuh setelah integrasi.

## 13. Out of scope rilis awal

- AI menyusun itinerary/rute, mengganti tempat, atau mengoptimasi jadwal otomatis. (Import v3.3 hanya mentranskripsikan dokumen guide, bukan menyusun; lihat §7a.)
- OCR/vision untuk PDF scan/foto, ekstraksi gambar dari dokumen, format selain teks/DOCX/PDF ber-teks, dan publish otomatis hasil import.
- Geocoding, live traffic, opening-hours verification, dan venue search wajib.
- Booking, pembayaran perjalanan, quotation, rating/review, atau katalog OTA.
- Sistem user/tenant/subscription baru yang menduplikasi SaaS Laravel.
- Integrasi Laravel nyata, SSO, multi-guide onboarding dan billing sebagai gate rilis awal; semuanya dijadwalkan terpisah pada CP029 setelah SaaS siap.
- Real-time collaborative editing, offline sync, marketplace template, custom template builder.
- Automated WhatsApp messaging; social preview is rendered by the receiving app from the share URL and is not an outbound messaging integration.
- Memindahkan seluruh kode n8n satu-per-satu atau mengubah workflow lama sebagai bagian penulisan dokumen ini.

## 14. Arsip dan proses migrasi

- Spesifikasi v2: `docs/archive/SPEC-n8n-v2.md`.
- Checkpoint CP001–CP017: `docs/archive/TODOS-n8n.md`; status dicatat historis, bukan bukti kesiapan web.
- Plan/log lama tetap di `plans/` dan `logs/`; referensi `SPEC.md` pada log lama mengacu v2 pada tanggal pekerjaan tersebut.
- `RULES.md` tetap mengatur Ask Question, plan gate, review/test/revise, dan completion log. Aturan n8n berlaku hanya jika artefak/instance n8n benar-benar disentuh; aturan HTML, social metadata, foto, validation, dan evidence tetap berlaku pada web.
- Roadmap web memakai ID baru mulai CP018. Jika implementasi mengubah perilaku artefak CP lama yang completed, buat revision plan pada ID lama sesuai `RULES.md`, bukan menyamarkannya sebagai perubahan roadmap baru.
- Revisi v3.2 mencatat penghapusan PDF rendering/export sebelum CP026 dimulai dan mengganti hasil CP024–CP025 dengan share-link Open Graph preview. Roadmap CP018–CP028 adalah rilis standalone; CP029 adalah integrasi berikutnya dengan `D:\belajar-pemograman`.
