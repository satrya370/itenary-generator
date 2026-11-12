# Rencana SI: Menyambungkan engine ke situs driver (URL pribadi + URL domain driver) dan mode ke-5 "Activity"

Status: **DRAFT v2, menunggu persetujuan owner.** Tanggal: 2026-11-12.
Revisi v2: "5 section" artinya **5 mode itinerary** di engine. Mode yang sudah ada: Setengah hari, Sehari penuh, Beberapa hari, Panduan destinasi; ditambah **Activity**. Ini bukan halaman situs baru dan bukan entitas terpisah.
Lanjutan dari: `plans/driver-templates_plan_bali-five-templates.md` (v3, §8 E1–E4). Plan ini merinci E1–E4 menjadi checkpoint yang bisa diuji **di localhost dulu**, tanpa domain asli, tetapi siap dipindah ke domain.
Alur kerja: Haiku mengerjakan → Opus mereview → Haiku merevisi. Berhenti di setiap checkpoint dan tunggu "lanjut".

---

## 0. Keputusan dan asumsi

| # | Hal | Keputusan di plan ini |
|---|---|---|
| 1 | Dua cara membagikan itinerary | **A. URL pribadi**: halaman bawaan engine `/i/{token}` (sudah ada). **B. URL domain driver**: `{domain-driver}/itinerary/{slug}`, dirender oleh template dari API engine. |
| 2 | Domain | Belum ada. Semua diuji di localhost dengan subdomain `*.localhost`. Nilai produksi memakai placeholder `{BRAND}` dan `{PARENT_DOMAIN}`. |
| 3 | Mode itinerary | Menjadi **5**: `half_day`, `full_day`, `multi_day`, `destination_guide`, **`activity`** (baru). Schema naik ke **`web-2.2.0`**. Draf `web-2.1.0` tetap valid dan otomatis di-upgrade. |
| 4 | Halaman situs driver | Tetap seperti plan v3 (Beranda, `activities.html` = daftar paket, About, Itinerary). Daftar paket kini memuat kelima mode dengan filter per mode. Halaman itinerary punya tampilan khusus untuk mode Activity. |
| 5 | Backend di landing page | **Tidak ada.** HTML statis + Tailwind + satu `engine-render.js`. Semua CRUD ada di engine. |
| 6 | Harga dan kategori paket | Disimpan di engine sebagai data daftar situs (`site_listings`), berlaku untuk kelima mode, **bukan** di konten itinerary. |
| 7 | Login driver | Ditunda ke **E1b** (sebelum online). Untuk tes lokal, owner berpindah workspace lewat pemilih di editor. |
| 8 | Bahasa | Label baru untuk mode Activity ditambahkan ke 6 locale engine. Halaman `/id/` situs tetap mengikuti plan v3. |

---

## 1. Gambaran sistem

```
                    EDITOR ENGINE  (lokal: http://127.0.0.1:3000, produksi: app.{BRAND})
                    workspace per driver → itinerary 5 mode, situs, domain
                                   │ publish
            ┌──────────────────────┴───────────────────────┐
  A. URL PRIBADI (sudah ada)                    B. URL DOMAIN DRIVER (baru)
  http://127.0.0.1:3000/i/{token}               http://wayan.localhost:4173/itinerary/{slug}
  produksi: {BRAND}/i/{token}                    produksi: wayanbalidriver.com/itinerary/{slug}
  halaman jadi dari renderer engine,            HTML statis template + engine-render.js
  preview WA (OG) sudah ada                     → GET {ENGINE_API}/api/v1/public/sites/{host}/...
```

- **Visibilitas per itinerary** saat publish:
  - *Link pribadi* (bawaan): hanya cara A.
  - *Tampilkan di website*: cara A tetap jalan, ditambah muncul di daftar paket situs dan bisa dibuka lewat slug di cara B.
- **Domain menentukan pemilik.** API mencari `host` di tabel `site_hosts` → situs → workspace. Slug milik workspace lain → 404.
- Itinerary pribadi **tidak** bisa dibuka lewat slug, hanya lewat token.

---

## 2. Checkpoint

| CP | Repo | Isi | Bergantung pada |
|---|---|---|---|
| **SI0** | engine/plans | Kontrak: schema `web-2.2.0` + mode Activity, `site.json`, API publik, penanda template, normalisasi host | – |
| **SI1** | engine | **Mode Activity**: schema, validator, registry, editor, alur buat (5 kartu), renderer, AI, import, locale | SI0 |
| **SI2** | engine | Multi-workspace lokal (E1a) + isolasi data | SI0 |
| **SI3** | engine | Situs, host, daftar paket (visibilitas, slug, harga, kategori) + layar "Situs" | SI2 |
| **SI4** | engine | API publik baca-saja + CORS + cache + endpoint izin TLS | SI1, SI3 |
| **SI5** | driver-sites | Mode Activity di kelima template: kartu di daftar paket, tampilan halaman itinerary, filter mode, data contoh | SI0 |
| **SI6** | driver-sites | `engine-render.js` + server dev multi-host + aturan rewrite | SI4, SI5 |
| **SI7** | keduanya | E2E lokal dua driver, dua cara URL, kelima mode | SI6 |
| **SI8** | engine/docs | Persiapan produksi (Caddy on-demand TLS, DNS, env), **tidak dijalankan** | SI7 |
| **E1b** | engine | Login driver (magic link / OTP WA) sebelum online | SI7 |

SI1 (mode Activity) bisa langsung dipakai di engine walau situs belum tersambung. SI5 bisa dikerjakan paralel dengan SI1–SI4.

---

## 3. SI0: Kontrak (dokumen saja)

Hasil: `docs/site-integration-contract.md` (engine) dan `driver-sites/docs/template-contract.md`.

1. **Schema `web-2.2.0`**: perubahan mode Activity (§4.3) + aturan upgrade dari `web-2.1.0`.
2. **Rute situs**:

   | Rute | Berkas | Sumber data |
   |---|---|---|
   | `/` | `index.html` | `site.json` + paket unggulan (API) |
   | `/activities` | `activities.html` | API `listings` (kelima mode, filter) |
   | `/about` | `about.html` | `site.json` |
   | `/itinerary/{slug}` | `itinerary.html` (rewrite) | API `itineraries/{slug}`; tata letak mengikuti `trip.mode` |

3. **Penanda HTML**: `data-section`, `data-field`, `data-repeat`, `data-if` (sembunyikan bila kosong), `data-mode` (blok khusus mode).
4. **Skema `site.json`**: nama usaha, WA, email, area layanan, tarif harian, FAQ, testimoni (dengan nama dan sumber), foto, kategori paket, bahasa.
5. **Kontrak API** (§7) dengan contoh respons untuk kelima mode.
6. **Normalisasi host**: huruf kecil, buang titik di akhir, buang port (mode dev saja), `www.` didaftarkan sebagai alias.

Kriteria selesai: owner menyetujui kedua dokumen.

---

## 4. SI1: Mode ke-5 "Activity"

### 4.1 Hasil riset: isi halaman aktivitas yang lazim

- Halaman aktivitas di marketplace besar memakai blok yang konsisten: **ringkasan atas** (nama, durasi, bahasa, pembatalan), **Highlights**, **Deskripsi**, **Termasuk**, **Titik temu/penjemputan**, **Informasi penting** (yang dibawa, yang dilarang, tidak cocok untuk).
- Situs aktivitas dan driver Bali:
  - harga per orang dalam IDR, sering "mulai dari";
  - paket gabungan (Rafting + ATV, Rafting + Swing);
  - penjemputan hotel dari area tertentu;
  - daftar isi paket (alat keselamatan, pemandu, makan siang, handuk, shower, asuransi).
- Kisaran harga aktivitas 2026: ATV sekitar US$35–50, rafting sekitar US$30–45, swing sekitar US$15–35. Biasanya dibayar terpisah dari tarif driver.
- **Batas usia dan kesehatan berbeda per operator**:
  - rafting minimal 5–10 tahun, sebagian maksimal 55–65 tahun;
  - ATV solo minimal sekitar 15 tahun;
  - ada batas berat (mis. 120 kg);
  - tidak untuk ibu hamil atau penderita masalah jantung/punggung.

  Karena itu, data ini **diisi per itinerary Activity**, bukan nilai bawaan.
- Halaman yang ada **tidak menjelaskan cakupan asuransi** operator. Engine dan AI tidak boleh menulis "diasuransikan" kecuali driver mengisinya sendiri.

### 4.2 Apa itu mode Activity

- **Definisi:** satu kegiatan berdurasi jam, bukan tur keliling. Contoh: rafting Ayung, ATV Payangan, snorkeling Blue Lagoon, kelas memasak Ubud, Batur sunrise trek, spa.
- **Beda dengan Setengah hari:** tidak ada jadwal per jam di beberapa tempat. Yang ditonjolkan adalah fakta kegiatan (durasi, sesi, usia, kesulitan), highlights, dan aturan keselamatan.
- **Kartu di alur buat:**
  - judul: "Aktivitas";
  - deskripsi: "Satu kegiatan beberapa jam: rafting, ATV, snorkeling, kelas memasak.";
  - contoh: "Rafting Sungai Ayung".

### 4.3 Data (`web-2.2.0`)

Field yang **dipakai ulang** untuk mode Activity:

| Field | Untuk Activity |
|---|---|
| `trip.title`, `trip.destination` (lokasi), `trip.country`, `trip.region`, `trip.language` | Sama; wajib seperti mode lain |
| `trip.startDate` | Opsional (tanggal kegiatan bila sudah dipesan) |
| `trip.startTime`, `trip.endTime` | **Tidak berlaku**; diganti `activity.sessionTimes` |
| `guide`, `meeting`, `pickup` | Berlaku |
| `cover`, `summary` | Berlaku; `summary` wajib |
| `included`, `notIncluded`, `whatToBring`, `notSuitableFor`, `notAllowed`, `localTips`, `emergencyContacts` | Berlaku |
| `policies`, `closingNote`, `disclaimer` | Berlaku |
| `days`, `places` | **Harus kosong** (seperti `places` di mode berjadwal) |

Objek baru `activity` (hanya untuk mode Activity; `null` di mode lain):

| Field | Wajib saat publish | Batas | Catatan |
|---|---|---|---|
| `category` | ✓ | enum | `adventure`, `water`, `culture`, `wellness`, `nature`, `family` |
| `durationMinutes` | ✓ | 15–720 | |
| `sessionTimes[]` | | maks 8, `HH:MM` | Jam mulai sesi |
| `difficulty` | | enum | `easy`, `moderate`, `challenging` |
| `highlights[]` | | maks 5 × 160 | |
| `steps[]` | | maks 12 | "Jalannya kegiatan": `{ title (maks 120), minutes?, note? (maks 500) }` |
| `ageMin`, `ageMax` | | 0–99 | Kosong = tidak ditampilkan |
| `weightMaxKg` | | 20–250 | |
| `guideLanguages[]` | | maks 6 × 40 | |
| `operator` | | maks 160 | Nama mitra operator (transparansi bila driver menjual ulang) |
| `bestTime` | | maks 240 | |

Harga **tidak** masuk konten. Harga ada di `site_listings` (SI3), sama untuk kelima mode.

### 4.4 Perubahan engine (daftar berkas terdampak)

| Area | Perubahan |
|---|---|
| `config/web/itinerary.schema.json` | `trip.mode` + `activity`; `$defs/activity`; `schemaVersion` `web-2.2.0`; aturan `days`/`places` kosong untuk activity |
| `src/contracts/*` | Regenerasi tipe; `upgrade` 2.1.0 → 2.2.0 (`activity: null`); validator dan aturan publish |
| **Aturan "scheduled"** | `validator.ts:56` dan `schema-meta.ts:23` sekarang memakai `mode !== 'destination_guide'`. **Wajib diubah** menjadi daftar eksplisit `['half_day','full_day','multi_day']`, supaya Activity tidak diwajibkan punya hari dan aktivitas. Tes khusus untuk ini. |
| `config/web/field-registry.json` | Field `activity.*` dengan `modes: ["activity"]`; field lama yang berlaku untuk activity ditambahkan |
| `config/mode-profiles.json`, `src/editor/labels.ts` | Profil dan kartu mode ke-5 |
| `src/editor/model.ts` | `changeMode` dan `hasModeLoss` untuk perpindahan ke/dari Activity (mis. "3 hari beserta aktivitasnya akan dihapus") |
| `src/editor/validation.ts` `stepsFor` | Langkah Activity: Info → Detail aktivitas → Guide & titik temu → Ringkasan → Praktis → Ketentuan → AI → Publish |
| `src/editor/sections/ActivityDetails.tsx` (baru) | Kategori, durasi, sesi, kesulitan, highlights, langkah, usia, berat, bahasa pemandu, operator, waktu terbaik |
| Alur buat (CP037) | Langkah 1 menjadi 5 kartu; `verify:web-create` diperbarui |
| `src/render/render.ts` | Tata letak Activity: hero, baris fakta (durasi, sesi, usia, kesulitan), highlights, jalannya kegiatan, termasuk/tidak termasuk, untuk siapa/tidak cocok, yang dibawa, titik temu/jemput, ketentuan |
| `config/web/locales/*.json` (6 locale) | Label baru (Durasi, Sesi, Usia minimal, Tingkat kesulitan, Highlights, Jalannya kegiatan, …) |
| AI (`src/server/ai/service.ts`) | Ringkasan untuk Activity. Prompt melarang fakta keselamatan, usia, atau asuransi yang tidak ada di konteks |
| Import (`src/server/import/*`) | Mode `activity` di parser: heading Highlights, Durasi, Usia, Berat, Sesi; jam sesi dan durasi dibaca deterministik. AI hanya mengisi `summary`, `highlights`, `steps` dengan pengaman kutipan yang sama |
| Fixtures dan tes | Fixture Activity lengkap dan minimal; tes kontrak, render, editor, preview, publikasi, import, AI diperluas |

Tes kunci:
- Activity valid tanpa `days`; ditolak bila `days`/`places` terisi.
- Publish ditolak tanpa `activity.category` atau `durationMinutes`.
- Upgrade 2.1.0 → 2.2.0 tidak mengubah draf lama.
- Berpindah mode ke/dari Activity menampilkan peringatan kehilangan data.
- Render Activity di 360/390/1280.
- AI tidak menambah fakta usia atau keselamatan.
- Import teks aktivitas contoh.

---

## 5. SI2: Multi-workspace lokal (E1a)

**Sekarang:** `store.ts` membaca satu `workspaceId` per server (`store.ts:190`).

- Workspace aktif dipilih per request lewat cookie `engine-workspace` (hanya untuk loopback; diganti sesi login di E1b).
- Semua query store, AI, import, publikasi, dan aset di-scope ke workspace dari request. Batas AI harian per workspace.
- Pemilih workspace di header editor (owner saja): "Driver: Wayan ▾", plus "Tambah driver".
- Profil agensi (Setup) per workspace.

Tes: isolasi draf, aset, publikasi, token share, dan import antar workspace; migrasi data lama ke workspace pertama dengan backup; gerbang lama tetap hijau.

---

## 6. SI3: Situs, host, daftar paket

```sql
sites(id, workspace_id, template, locales_json, status, content_json, revision, created_at, updated_at)
site_hosts(host PRIMARY KEY, site_id, kind CHECK(kind IN ('site','share')), is_primary, created_at)
site_listings(itinerary_id PRIMARY KEY, workspace_id, visibility CHECK(visibility IN ('private','website')),
              slug UNIQUE, price_idr INTEGER NULL, price_unit CHECK(price_unit IN ('person','car','group')),
              child_price_idr INTEGER NULL, category TEXT NULL, sort INTEGER, updated_at)
```

- `content_json` = `site.json`, diisi owner di **Pengaturan → Situs** (template, host, bahasa, editor JSON + validasi).
- **Dialog publish** ditambah pilihan:
  - "Link pribadi" (bawaan);
  - "Tampilkan di website", dengan harga (opsional, "mulai dari"), satuan, harga anak (opsional, berguna untuk Activity), dan kategori.
- **Slug**: `{judul-kebab}-{6 karakter acak}`, dibuat sekali. Bagian acak tetap meski judul berubah.
- `site_hosts.kind='share'` disiapkan untuk domain link pribadi milik driver (paket "engine saja").

Tes: slug unik dan stabil, host unik di semua workspace, visibilitas berubah tanpa publish ulang, unpublish → listing tidak terlihat.

---

## 7. SI4: API publik baca-saja

| Endpoint | Isi |
|---|---|
| `GET /api/v1/public/sites/{host}` | template, locales, `site.json` |
| `GET /api/v1/public/sites/{host}/listings?mode=` | itinerary *website* terpublish: data kartu (cover, judul, mode, durasi/hari, area, ringkasan, kategori Activity, usia minimal) + harga + slug |
| `GET /api/v1/public/sites/{host}/itineraries/{slug}` | konten versi terpublish (`web-2.2.0`) |
| `GET /internal/tls/allow?domain=` | 200 bila domain terdaftar (untuk Caddy on-demand TLS); hanya dari loopback |

Aturan:
- Hanya versi terpublish dan bertanda *website*. Slug milik workspace lain → 404 yang sama dengan "tidak ada".
- **CORS**: hanya origin yang host-nya terdaftar. Mode dev (`ENGINE_DEV_HOSTS=1`) mengabaikan port dan mengizinkan `http`. Produksi wajib `https` dan origin persis.
- `Cache-Control: public, max-age=60`, `ETag` dari revisi publikasi, respons 304.
- Batas laju per IP untuk endpoint publik.
- Field yang dikirim dibatasi daftar yang diizinkan (tanpa brief penulisan, catatan internal, atau data import).
- **Cara A tetap**: `/i/{token}` tidak berubah. Bila request datang lewat host `kind='share'`, token harus milik workspace host itu.

Tes: isolasi lintas host, 404 untuk draf/pribadi/unpublish, CORS ditolak untuk origin asing, ETag/304, batas laju, `tls/allow` menolak domain asing dan request non-loopback.

---

## 8. SI5: Mode Activity di kelima template

Untuk Sawah, Batu, Segara, Endek, dan Arus:

1. **Kartu Activity di daftar paket** (`activities.html`):
   - foto, nama, kategori, durasi;
   - area, harga "mulai dari Rp…";
   - lencana jemput hotel, usia minimal, maksimal 3 highlight;
   - tombol WA dengan pesan terisi (nama, tanggal, jumlah orang, area hotel).
2. **Filter mode** di atas daftar: Semua, Setengah hari, Sehari penuh, Beberapa hari, Aktivitas, Panduan. Kategori Activity jadi sub-filter.
3. **Tampilan halaman itinerary untuk mode Activity** (`data-mode="activity"`), urutannya:
   - hero;
   - baris fakta;
   - highlights;
   - deskripsi;
   - jalannya kegiatan;
   - termasuk/tidak termasuk;
   - untuk siapa / tidak cocok untuk;
   - yang dibawa;
   - titik temu dan jemput;
   - info penting dan ketentuan;
   - kredit foto.

   Mode lain tetap memakai tata letak yang sudah ada.
4. **Variasi tata letak per template** mengikuti pola yang sudah ada:

   | Template | Gaya |
   |---|---|
   | Sawah | Grid asimetris |
   | Batu | Kontras tajam |
   | Segara | Foto samping lebar |
   | Endek | Baris besar bergantian |
   | Arus | Editorial navy/lime |

5. **Arus** masuk ke `build-engine-pages.mjs` dan diberi penanda kontrak.
6. **Data contoh**: `shared/engine-sample.json` ditambah 4 Activity Bali yang masuk akal dan lolos validator `web-2.2.0`: rafting Ayung, ATV Payangan, cooking class Ubud, snorkeling Blue Lagoon.
7. **Label baru** di `shared/engine-labels.json` disalin dari locale engine.
8. Ganti `https://www.example.com` di JSON-LD dengan `{HOST}`; Activity memakai `TouristTrip` + `Offer` bila ada harga.
9. **Ikon** memakai SVG, bukan emoji (plan v3 §9).

Tes: screenshot 390/1280 halaman daftar dan itinerary Activity per template, tidak ada overflow di 360, keadaan kosong (Activity tanpa foto/harga/usia), tidak ada tautan mati.

---

## 9. SI6: `engine-render.js` dan server dev multi-host

- **`shared/engine-render.js`** (satu berkas untuk kelima template):
  - membaca `ENGINE_API` dari `<meta name="engine-api">`;
  - mengambil `location.host` dan slug;
  - mengisi `data-field`, mengulang `data-repeat`, menyembunyikan `data-if` yang kosong;
  - memilih blok `data-mode` sesuai `trip.mode`;
  - label EN/ID, format tanggal dan jam `HH:MM`;
  - tombol WA;
  - keadaan memuat, tidak ditemukan, dan gagal jaringan.

  Fungsi pembentuk HTML per tema diambil dari `build-engine-pages.mjs`, supaya hasil statis dan dinamis identik.
- **`preview/serve-sites.mjs`**:
  - membaca header Host, lalu mengambil `/api/v1/public/sites/{host}` untuk menentukan template;
  - menyajikan berkas template tersebut dan menulis ulang `/itinerary/*` → `itinerary.html`;
  - menyuntikkan `<meta name="engine-api" content="http://127.0.0.1:3000">`.
- **Tes lokal tanpa domain**: `wayan.localhost:4173` dan `komang.localhost:4173`.
  - Chrome dan puppeteer otomatis mengarahkan `*.localhost` ke 127.0.0.1. Puppeteer juga diberi `--host-resolver-rules="MAP *.localhost 127.0.0.1"` agar pasti.
  - Untuk curl/Node di Windows, tambahkan baris di berkas `hosts` atau kirim header `Host`.
- **Bila API engine mati**: Beranda dan About tetap tampil; daftar paket dan itinerary menampilkan pesan dan tombol WA.

---

## 10. SI7: E2E lokal dan SI8: persiapan produksi

### SI7: `verify:site-integration`

| # | Skenario | Harus terjadi |
|---|---|---|
| 1 | Dua workspace: Wayan (Segara) dan Komang (Sawah), host `wayan.localhost`, `komang.localhost` | Tiap host menampilkan template dan data miliknya |
| 2 | Wayan publish itinerary "Link pribadi" | Cara A `127.0.0.1:3000/i/{token}` jalan; tidak muncul di daftar paket; slug → 404 |
| 3 | Ubah menjadi "Tampilkan di website" + harga | Muncul di `wayan.localhost:4173/activities` dan `/itinerary/{slug}`, tanpa build ulang |
| 4 | Buka slug Wayan di host Komang | 404 |
| 5 | Edit dan publish ulang | Konten baru tampil setelah cache habis (tes memakai TTL pendek) |
| 6 | Unpublish | Hilang dari daftar; slug → halaman "tidak tersedia" + WA |
| 7 | **Kelima mode** dipublish ke website | Masing-masing muncul dengan kartu dan tata letak itinerary yang benar; filter mode jalan |
| 8 | Activity tanpa harga dan tanpa usia | Kartu menampilkan "tanya harga", blok usia tidak muncul |
| 9 | Origin asing memanggil API | CORS ditolak |
| 10 | Halaman itinerary | `noindex`, tidak ada di sitemap |
| 11 | Layout | Screenshot 390/1280, overflow 360, tidak ada request eksternal kecuali API engine |

### SI8: Persiapan produksi (dokumen + konfigurasi, tidak dijalankan)

- `Caddyfile.sites.example`:
  - `on_demand_tls { ask http://127.0.0.1:3000/internal/tls/allow }`;
  - satu blok untuk semua host situs;
  - `app.{BRAND}` untuk editor (setelah E1b);
  - `api.{BRAND}` hanya meneruskan `/api/v1/public/*`;
  - `{BRAND}/i/*` untuk cara A.
- Panduan DNS: subdomain `nama.{PARENT_DOMAIN}` (wildcard) dan domain sendiri (A/CNAME ke server).
- Env baru: `ENGINE_DEV_HOSTS`, `PUBLIC_API_ORIGIN`, `BRAND_DOMAIN`, `PUBLIC_RATE_PER_MINUTE`.
- Daftar periksa sebelum online: E1b selesai, backup, uji isolasi di server, server terpisah dari n8n produksi.

---

## 11. Keputusan yang dibutuhkan dari owner

1. **Definisi mode Activity** (§4.2): satu kegiatan beberapa jam, tanpa jadwal per hari. Setuju?
2. **Jalannya kegiatan**: daftar langkah sederhana (`activity.steps`), bukan jadwal per jam seperti Setengah hari. Setuju?
3. **Harga** semua mode disimpan di engine (`site_listings`), bukan di konten itinerary dan bukan di `site.json`? (Rekomendasi: ya.)
4. **Urutan**: SI1 (mode Activity) dikerjakan dulu, karena langsung berguna di engine walau situs belum tersambung? (Rekomendasi: ya.) SI5 (template) paralel?
5. CP037 diterima dulu sebelum SI1?

## 12. Di luar lingkup

- Login driver (E1b), pembayaran/booking online, ulasan otomatis, terjemahan otomatis konten, SSR Astro.
- SEO daftar paket yang dirender JavaScript: diterima untuk v1. Pra-render lewat webhook dicatat sebagai tahap berikutnya.
- Preview WhatsApp untuk link `domain-driver/itinerary/...`: belum ada OG per itinerary. Untuk berbagi ke tamu lewat WA, tetap pakai cara A.

## Sumber riset

- [Black Pepper Bali Tours: biaya driver dan kisaran harga aktivitas 2026](https://blackpepperbalitours.com/guide/private-driver-cost-bali)
- [Adventures in Bali: daftar aktivitas dan paket gabungan](https://adventuresinbali.com/activities)
- [Bali Nusa Transport: panduan ATV dan rafting](https://balinusatransport.id/blog/bali-adventure-guide.html)
- [Balinese Guide: isi paket ATV + rafting](https://balineseguide.com/atv-quad-bike-and-rafting-with-private-transfer-lunch/)
- [GetYourGuide Supplier: Extra Information](https://supply.getyourguide.support/hc/en-us/articles/23334014264605-Setting-up-Extra-Information-for-Your-Product-Listings)
- [Pilot Plans: struktur halaman GetYourGuide](https://www.pilotplans.com/blog/getyourguide-review)
- [Pertiwi Adventure: batas usia rafting](https://pertiwiadventure.com/white-water-rafting/)
- [Bali Zipline: batas usia dan kesehatan ATV](https://balizipline.com/ubud-complete-atv-white-water-rafting-tlaga-singha-infinity-pool/)
- [The Bali Package: usia minimum rafting dan ATV](https://www.thebalipackage.com/tours/telaga-waja-rafting-and-atv-ride-package/)
- [GetYourGuide: Pertiwi ATV + rafting, tidak cocok untuk](https://www.getyourguide.com/sangeh-l232266/bali-atv-rafting-and-jungle-swing-adventure-t1233870/)
