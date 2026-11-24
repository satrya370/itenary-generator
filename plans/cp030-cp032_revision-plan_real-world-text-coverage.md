# CP030–CP032 Revision Plan: Real-World Text Coverage

**Tanggal:** 2026-11-16 (direvisi hari yang sama: tanpa skor confidence/cosine, tanpa klasifikasi label oleh AI, alias ditunda, empat format yang didukung).
**Status:** planned — belum diimplementasikan.
**Scope:** CP030 parser deterministik dan PDF berteks → CP031 laporan label belum dikenal dan resolve → CP032 UI contoh format dan review label. Ditambah perubahan aturan jadwal lintas tengah malam di validasi publish milik CP024 (`src/contracts/validator.ts`, `src/server/preview.ts`). ID checkpoint asal dipakai; tidak ada CP baru.
**Authority:** `SPEC.md`, `TODOS.md`, `RULES.md`. Canonical runtime `web-2.2.0`.
**Plan terkait yang tetap berlaku:** `plans/cp030-cp032_revision-plan_text-and-pdf-parser-hardening.md` (evidence guard, review eksplisit R2, tanpa OCR R1, kepastian berbasis aturan bukan angka), `plans/cp031_revision-plan_split-import-model.md`. Plan historis tidak diubah.

## Reason for Revision

Uji 20 sampel teks realistis pada 2026-11-14/16 (lewat API asli: source → parse → apply → preview, AI dimatikan) menunjukkan bahwa parser hanya kuat untuk dokumen yang sudah rapi. Teks yang wajar ditulis guide sebagian besar tidak terbaca:

| Sampel | Bentuk input | Coverage baris | Masalah |
|---|---|---|---|
| A5 | Ekspor chat WhatsApp + injeksi | 17% | Kalimat injeksi menjadi `trip.title`; 0 aktivitas. |
| A10 | Sapaan tanpa itinerary | 20% | "Halo kak 🙏😊" menjadi judul. |
| B1 | Satu paragraf | 0% | Tidak ada yang terbaca. |
| B2 | Daftar bernomor, singkatan | 38% | 0 aktivitas; `Tgl`/`Meetpoint` tidak dikenal; nomor HP menempel di nama guide. |
| B3 | Markdown ChatGPT/Notion | 10% | Judul "## 🗓️ …"; 0 aktivitas. |
| B8 | Bagian PAGI/SIANG/SORE | 20% | Semua aktivitas hilang. |
| A6 | Destination guide berupa bullet | 43% | `places` kosong tanpa AI. |
| B6, B7 | Kebijakan, kontak darurat, label dwibahasa | 44–50% | Label tidak dikenal. |

Ada juga nilai yang **salah tapi tampak valid**, dan ini paling berbahaya:
- `Durasi: 1jam 30mnt` → **60 menit**. Penyebab di `src/server/import/parse/time.ts:26`: satuan `mnt` tidak ada di regex, dan hasil penjumlahan parsial diterima tanpa catatan.
- Tabel bertab: kolom keterangan menempel ke judul aktivitas ("Jemput hotel Hotel area Tunjungan").
- **PDF:** dokumen dengan baris bertab (A8, B4) kehilangan judul dan semua aktivitas, sementara versi teksnya terbaca.
- Jadwal lewat tengah malam (B5, 23:30 → 01:00) diblokir `ACTIVITY_ORDER` saat publish, padahal sah.

Akar masalah: parser bergantung pada pencocokan kata persis dari kamus `config/web/import-headings.json` dan pada baris yang sudah berbentuk `jam judul`. Revisi ini menempuh dua jalur sekaligus:

1. **Mengurangi ketergantungan pada daftar kata lengkap** dengan pola nilai, kemiripan label, grammar kecil, dan bentuk baris.
2. **Mengarahkan guide ke empat format dokumen yang didukung penuh** lewat contoh di layar import. Dokumen di luar format itu tetap diterima, tetapi hasilnya jujur: yang tidak terbaca dilaporkan, tidak ditebak.

Prinsip "jangan menebak" (W12, W19, R2) tidak berubah.

## Clarifications and Decisions

Ask Question terstruktur 2026-11-16 (dua putaran) ditambah brainstorm lanjutan pada hari yang sama:

| ID | Keputusan | Dampak |
|---|---|---|
| D1 | Scope **P1 + P2 + P3** dari laporan uji. | Semua 14 temuan masuk, termasuk kualitas laporan import. |
| D2 | Jadwal lewat tengah malam **sah, hari berganti**. | Validator memakai jam diperluas; tidak ada `ACTIVITY_ORDER` untuk satu kali lintas tengah malam per hari. |
| D3 | Aktivitas tanpa jam pasti **masuk dengan jam kosong + warning**. | Label bagian (Pagi/Siang) hanya di laporan; tidak ada jam karangan. |
| D4 | Judul **selalu kosong kalau ragu**. | Judul hanya dari label eksplisit, atau baris awal yang lolos semua aturan ketat. Selain itu kosong + catatan. |
| D5 | UI import menampilkan **empat format yang didukung, dipilih sesuai mode, + tombol salin**, berlaku untuk tab teks dan PDF. | Satu sumber template; setiap template wajib lolos parser (lihat §L). |
| D6 | Pembacaan memakai **empat lapisan deterministik**: (1) pola nilai, (2) label fuzzy, (3) grammar jam/durasi, (4) bentuk baris. | Kamus label menyusut menjadi daftar nama kanonik. |
| D7 | **Tidak ada skor confidence numerik, tidak ada cosine/embedding, tidak ada klasifikasi label oleh AI.** Keputusan antar-sumber memakai urutan prioritas tetap; seri → review. Status ke guide hanya tiga tingkat: Pasti / Cukup / Perlu dicek. **Alias dari koreksi guide ditunda** ke revisi terpisah. | Sesuai keputusan hardening sebelumnya (kepastian berbasis aturan). Alasan: skor dari sumber berbeda tidak sebanding, AI cenderung overconfident, embedding menambah model/biaya/ketidakjelasan, dan hasil tidak bisa diuji dengan tabel tetap. |

Keputusan pelaksana (bisa dikoreksi owner):
- Kolom `Keterangan/Catatan/Note` pada tabel masuk ke `activity.tip`, karena itu catatan sumber dan bukan deskripsi.
- Alias workspace dikeluarkan dari plan ini karena menambah tabel dan UI baru; dievaluasi lagi setelah empat format terbukti cukup.
- AI import yang sudah ada (ekstraksi ringkasan, tempat, deskripsi, kebijakan, highlights/steps dengan kutipan wajib dan evidence guard) **tidak diubah** oleh revisi ini.

Keputusan sebelumnya yang dipertahankan: mode dipilih guide; hasil import selalu draft; tanpa OCR; import tidak memakai kuota AI menulis; harga tidak diisikan ke engine; nilai ambigu/konflik masuk review, bukan dipilih otomatis.

## Existing Behavior

- `parse/lines.ts` mengklasifikasi baris (blank, heading, bullet, key-value, url, text). Label dan heading harus cocok persis (setelah `fold`) dengan `import-headings.json`. Markdown (`#`, `**`), nomor daftar, prefix chat, dan label dwibahasa membuat baris jatuh ke `text`.
- `parse/extract.ts:127` mengambil baris `text` pertama (≤120 karakter, bukan jam) sebagai judul tanpa syarat lain.
- Aktivitas hanya dibuat dari baris yang diawali jam (`readTimeLine`). Bullet tanpa jam tidak menjadi aktivitas atau tempat.
- `durationIn` membaca angka + satuan dari daftar regex; satuan yang tidak dikenal menghentikan pembacaan, dan hasil parsial dipakai.
- Nilai gabungan (`nama (wa 08…)`, `tempat, jam kumpul 23.30`, `a, b` dalam list) disimpan utuh di satu field.
- PDF: `intake.ts pageToBlocks` menandai blok ambigu bila tata letak kolom tidak pasti; `layoutExcludedLines` membuang baris itu dari parse. Baris bertab dari satu kolom teks ikut terbuang.
- `validator.ts:260` mengeluarkan `ACTIVITY_ORDER` bila jam turun; `DURATION_CAP_EXCEEDED` dan `SCHEDULE_OVERLAP` (`preview.ts:95`) memakai menit 0–1439.
- Baris yang tidak terbaca hanya dilaporkan sebagai "N baris belum dikirim ke AI", tanpa alasan per baris. Pelanggaran aturan mode baru terlihat di preview/publish.
- Tidak ada contoh format di layar import; hanya placeholder textarea (`ImportScreen.tsx:145`).

## Required Behavior

### A. Prinsip

1. Setiap nilai di draft tetap merupakan salinan atau normalisasi dari teks sumber. Uji invarian "nilai ada di sumber" diperluas ke korpus baru.
2. Bila dua bacaan sama kuat, hasilnya konflik atau review, bukan pilihan otomatis.
3. Setiap baris sumber berakhir dalam salah satu status: **dipakai**, **diabaikan dengan alasan**, atau **perlu dicek** (dikirim ke AI ekstraksi bila aktif). Tidak ada baris yang hilang diam-diam.
4. Tidak ada angka confidence di mana pun (kode, API, UI). Kepastian hanya tiga tingkat berbasis aturan: **Pasti**, **Cukup**, **Perlu dicek**.

### B. Pra-pemrosesan baris

Sebelum klasifikasi, setiap baris dibersihkan tanpa mengubah offset sumber (evidence tetap menunjuk ke teks asli):
- Markdown: `#…######`, `**x**`, `__x__`, `*x*`, backtick, `> `, dan pemisah `—`/`–`/`-` di antara jam dan judul.
- Nomor daftar `1.`, `1)`, `a.`; bullet `• ▪ ➤ → ✓ ✔ ☐ - * +`; indentasi tab.
- Emoji di awal/akhir baris (dibuang dari nilai, tidak dari sumber).
- Prefix ekspor WhatsApp iOS `[dd/mm/yy hh.mm(.ss)] Nama: ` dan Android `dd/mm/yy hh.mm - Nama: `. Jam pada prefix chat **tidak pernah** dibaca sebagai jam aktivitas.
- Coretan `~~…~~` → baris diabaikan dengan alasan "dicoret".
- Baris catatan internal (`NOTE:`, `Catatan internal`, `TBA`, `TBD`) → diabaikan dengan alasan. `TBA` di bawah penanda hari menghasilkan hari kosong + warning.
- Baris berisi instruksi ke sistem (pola: perintah mengabaikan/menimpa instruksi, menyetel field) → diabaikan dengan alasan "berisi instruksi", tidak pernah menjadi nilai, dan tidak dikirim ke AI sebagai fakta.

### C. Pola nilai (lapisan 1)

Detektor tipe nilai yang berdiri sendiri dari label: telepon (`+62`/`08…`, 9–15 digit, pemisah spasi/titik/strip), email, URL (termasuk Google Maps → `meeting.mapsUrl`), tanggal, jam, durasi, mata uang (`Rp`, `IDR`, `rb`, `jt`, `$`, `USD`), persen.
- Nilai yang tipenya jelas dapat mengisi field yang tipenya cocok walau labelnya tidak dikenal, **hanya bila** target unik. Contoh: satu-satunya nomor HP di bagian kepala → `guide.phone`. Bila ada lebih dari satu kandidat → review.
- Nilai gabungan dipecah menurut tipe: `mas Dimas (wa 0857 1234 5678)` → nama `mas Dimas`, telepon terpisah. `Malang, jam kumpul 23.30 WIB` → tempat `Malang`, jam `23:30` (label tertanam dikenali oleh pencocok label).
- Mata uang dikenali agar tidak salah masuk field lain. Baris harga dilaporkan sebagai "harga tidak didukung engine", tidak diisi (sesuai SPEC).
- Tanggal numerik ambigu (`5-1-2027`, kedua angka ≤12) → konflik dua kandidat untuk review. Tanggal dengan nama bulan atau hari >12 dibaca langsung.

### D. Label fuzzy (lapisan 2)

`import-headings.json` menjadi daftar **nama kanonik** per field (ID/EN), bukan daftar semua variasi. Pencocokan setelah `fold`, dalam **tingkat berurutan**:
1. Exact.
2. Label dwibahasa dipecah pada ` / ` atau ` | `; cukup salah satu bagian cocok, dan bagian lain tidak boleh cocok ke field berbeda.
3. Singkatan: kerangka konsonan atau subsequence (`tgl` ⊂ `tanggal`, `tlp` ⊂ `telepon`), minimal 3 huruf; dan gabungan tanpa spasi (`meetpoint` = `meeting point`).
4. Jarak edit Damerau-Levenshtein ≤1 untuk label 4–7 huruf, ≤2 untuk ≥8 huruf.

Aturan keputusan: **tingkat tertinggi yang menghasilkan tepat satu field menang**. Tidak ada skor numerik dan tidak ada perbandingan antar tingkat. Bila sebuah tingkat menghasilkan dua field atau lebih, label tidak dipetakan dan masuk daftar "label belum dikenal" untuk review. Status ke guide: **Pasti** (tingkat 1), **Cukup** (tingkat 2–4 dengan satu field), **Perlu dicek** (seri atau tidak dikenal). Mekanisme yang sama dipakai untuk heading bagian (Termasuk, Tidak termasuk, Kebijakan, Kontak darurat, Refund, Pembatalan).

### E. Grammar jam dan durasi (lapisan 3)

Pengganti regex daftar dengan tokenizer angka + satuan:
- Satuan jam: `jam j h hr hrs hour(s)`; menit: `menit mnt mn m min mins minute(s) '`. Kata: `setengah` (=0,5), `seperempat` (=0,25), `satu/dua/…` (1–12).
- Bentuk: `1jam 30mnt`, `1j30m`, `1,5 jam`, `±10 mnt`, `90'`, `setengah jam`, `1 jam 15`. `±`/`+-`/`sekitar`/`kurang lebih` → nilai dibaca + catatan "perkiraan".
- **Bila ada token durasi yang tidak bisa dibaca utuh, seluruh durasi dikosongkan + catatan.** Hasil parsial tidak pernah dipakai (perbaikan bug 60 menit).
- Durasi dalam kurung di judul/langkah dipindah ke `durationMinutes`/`minutes`, dan teks kurungnya dibuang dari judul.
- Jam: `12 am` = 00:00, `12 pm` = 12:00. Zona `WIB/WITA/WIT/GMT+x` dibuang dari nilai; bila satu dokumen memakai lebih dari satu zona → catatan "zona waktu berbeda, periksa".
- Jam ambigu (`pukul 9`, `jam 11an`, `sore`) tetap kosong. Frasa jam yang ambigu dibuang dari judul aktivitas ("pukul 9 Keraton" → judul "Keraton", jam kosong, catatan).

### F. Bentuk baris dan struktur (lapisan 4)

- **Aktivitas tanpa jam (D3):** bullet atau baris pendek di bawah heading bagian waktu (Pagi/Siang/Sore/Malam/Morning/Afternoon/Evening/Night, termasuk gabungan "SORE - MALAM") atau di dalam blok hari → aktivitas dengan `time: null`. Laporan: "Baris N: aktivitas tanpa jam (bagian Pagi)". Heading bagian waktu tidak pernah dibaca sebagai penanda hari atau jam.
- **Destination guide:** bullet atau baris pendek di luar bagian list → `places[].name`. Jam di depan dibuang + catatan. `area` dan `description` tetap kosong bila tidak tertulis.
- **Tabel:** baris yang dipisah tab atau ≥2 spasi dengan jumlah sel konsisten di ≥2 baris berturut-turut dibaca sebagai tabel. Baris header dikenali lewat pencocok label (Jam/Waktu/Time, Kegiatan/Aktivitas/Activity, Durasi, Keterangan/Catatan/Note, Tempat/Lokasi). Kolom dipetakan dari header; tanpa header, dipakai pola nilai per kolom. Keterangan → `activity.tip`. Tabel yang berada di bawah penanda hari (multi day) menempel ke hari itu.
- **Paragraf:** baris >160 karakter dengan ≥2 frasa jam dipecah pada `.`, `;`, `,` menjadi klausa. Klausa dengan **jam tidak ambigu** menjadi aktivitas; klausa lain tetap "perlu dicek". Pasangan `Label: nilai` di dalam paragraf dibaca seperti biasa.
- **Item list inline:** `Tidak termasuk: a, b` dipecah pada koma/titik koma **hanya bila** tidak ada bagian yang diawali kata pengecualian/negasi (`kecuali, tanpa, hanya, tidak, bukan, except, but, only, not, without`) dan tidak ada kurung terbuka. Kalau ada, item dibiarkan utuh + catatan. Ini menjaga temuan audit lama tentang fragmen yang membalik makna.
- **Judul (D4):** diisi hanya dari:
  1. label eksplisit (`Judul`, `Nama tur`, `Title`, `Trip`, `Paket`), atau
  2. baris yang lolos **semua** aturan: berada di 3 baris tak-kosong pertama; setelah dibersihkan 3–80 karakter dan ≥2 huruf; bukan jam, URL, label, prefix chat, atau instruksi; tidak diakhiri `!`/`?`; diikuti struktur itinerary (label, penanda hari, baris berjam, atau heading list) dalam 5 baris berikutnya.
  Anotasi `(REVISI n)`, `(DRAFT)`, `(FINAL)`, `v2` dibuang dari judul + catatan. Selain itu judul kosong + catatan "judul tidak terbaca pasti".
- **Jenis aktivitas:** leksikon `kinds` ditambah (`berangkat, jeep, speedboat, drop off, tiba, check in/out, naik`) dan memakai pencocok fuzzy yang sama.

### G. PDF berteks

- Akar masalah A8/B4 di PDF dikonfirmasi lebih dulu (tahap 0). Hipotesis: item teks yang dipisah tab/jarak lebar terbaca sebagai kolom ambigu, lalu seluruh baris dibuang oleh `layoutExcludedLines`.
- Perbaikan: sebelum menandai ambigu, kenali **baris tabel**, yaitu posisi x sel yang konsisten di ≥2 baris berturut-turut. Baris tabel disatukan dengan pemisah tab, lalu mengikuti aturan tabel §F. Pengecualian ambigu hanya untuk kolom prosa yang benar-benar tidak pasti urutannya (perilaku audit lama tetap).
- Semua perbaikan §B–§F berlaku sama untuk teks hasil PDF karena dijalankan setelah intake.

### H. Label belum dikenal (review manual)

- Laporan import menambah `unknownLabels: [{ label, value, line, valueType, status }]` (status: Perlu dicek). Hanya label yang tidak dipetakan oleh lapisan 1–2.
- UI review: untuk tiap label, guide memilih "Masukkan ke field …" (daftar field yang cocok dengan tipe nilai dan mode) atau "Abaikan". Konfirmasi lewat endpoint resolve yang sudah ada (revision-safe); nilai ditulis ke draft dari teks sumber.
- Tidak ada penyimpanan alias dan tidak ada migrasi database pada revisi ini (D7). Pilihan guide berlaku untuk import itu saja.

### I. (Dikosongkan)

Bagian klasifikasi label oleh AI dihapus pada revisi plan ini (D7). Penomoran bagian dipertahankan agar rujukan lama tetap sah.

### J. Jadwal lintas tengah malam (D2)

- Per hari, urutan jam dihitung pada jam diperluas (0–2879 menit). Jam yang turun dari ≥18:00 ke <12:00 dianggap +24 jam, **maksimal satu kali per hari**. Penurunan kedua tetap `ACTIVITY_ORDER`.
- `DURATION_CAP_EXCEEDED` dan `SCHEDULE_OVERLAP` memakai jam diperluas yang sama.
- Renderer menampilkan penanda "+1" di samping jam setelah tengah malam. Schema tidak berubah; penanda dihitung saat render.
- Berlaku di validator editor, preview/publish, dan cek laporan import (§K).

### K. Kualitas laporan import

- Catatan per baris yang tidak dipakai, dengan alasan dari set tetap: format tidak dikenal, label belum dikenal, dicoret, catatan internal, berisi instruksi, harga tidak didukung, sapaan/obrolan, paragraf tanpa jam pasti, melebihi batas hari.
- Laporan menjalankan cek jadwal validator yang sama dengan publish (cap durasi mode, overlap, urutan, makan di half day bila aturan mode melarang) dan menampilkannya sebagai peringatan. Logika tidak diduplikasi.
- Hitungan "baris belum dikirim ke AI" tetap ada, tetapi tidak lagi menjadi satu-satunya informasi.

### L. Empat format yang didukung dan contohnya di UI (D5)

Empat format (dijelaskan ke guide dengan nama sederhana):

| # | Format | Ciri |
|---|---|---|
| F1 | **Berlabel + jam** (utama) | Bagian kepala `Label: nilai`, lalu baris `jam judul`, lalu bagian list (`Termasuk`, `Tidak termasuk`, …). |
| F2 | **Per hari** | Penanda `Hari N` / `Day N`, dengan baris berjam di bawahnya. Khusus multi day. |
| F3 | **Tabel** | Kolom Jam, Kegiatan, Durasi, Keterangan (tab atau spasi lebar; juga tabel di PDF). |
| F4 | **Per bagian waktu** | Heading Pagi/Siang/Sore/Malam dengan bullet di bawahnya, tanpa jam pasti. |

Format yang ditampilkan per mode:

| Mode | Format ditampilkan |
|---|---|
| `half_day`, `full_day` | F1, F3, F4 |
| `multi_day` | F2 (utama), F3 dan F4 di bawah penanda hari |
| `destination_guide` | F1 varian daftar tempat (bullet nama tempat) |
| `activity` | F1 varian kolom activity (kategori, durasi, jam sesi, langkah) |

- File baru `config/web/import-templates.json`: contoh per mode × format dalam `id` dan `en` (11 template per locale, 22 total).
- Layar import menampilkan, untuk mode yang dipilih, panel lipat "Format yang didukung" dengan tab per format + tombol "Salin contoh". Di tab PDF teksnya "Tulis dokumen Anda dengan susunan seperti ini". Locale contoh mengikuti bahasa UI, fallback `en`. Layout 390 px dan 1280 px.
- Dokumen di luar empat format tetap diterima. Setelah dry-run `parse`, bila coverage baris terpakai < 60%, layar menampilkan banner: "Sebagian besar baris tidak terbaca. Coba tulis dengan salah satu format yang didukung" dengan tautan ke panel contoh. Banner tidak memblokir import.
- **Kontrak:** setiap template harus lolos parser dengan coverage 100%, tanpa konflik, tanpa catatan parser kecuali yang memang diharapkan format itu (F4: catatan "aktivitas tanpa jam" dan peringatan jam kosong), dan tanpa `PUBLISH_FIELD_REQUIRED` untuk field yang tertulis di template. Ini dijaga test, sehingga template dan parser tidak bisa bergeser diam-diam.

## Proposed Changes

### Tahap 0 — entry gate
- Jalankan baseline: `test:web-import` (133 lulus pada 2026-11-14), `test:web-contracts`, `test:web-preview`, `test:web-editor`, `verify:web-import-mutations`. Catat hasilnya dan versi Node.
- Pindahkan 20 sampel uji ke `tests/fixtures/web/import/realistic/` (A1–A10, B1–B10, `.txt`). Buat versi PDF untuk A8, B3, B4, B5, B8 lewat `scripts/web/make-import-fixtures.ts`.
- Reproduksi dan konfirmasi akar masalah PDF bertab (§G) sebelum menulis perbaikan.

### Tahap 1 — CP030 parser
- `parse/lines.ts`: pra-pemrosesan §B; klasifikasi memakai pencocok label baru.
- File baru `parse/values.ts`: detektor tipe nilai §C dan pemecah nilai gabungan.
- File baru `parse/labels.ts`: pencocok label bertingkat §D, deteksi seri, status Pasti/Cukup/Perlu dicek.
- `parse/time.ts`: grammar jam/durasi §E menggantikan `durationIn`; aturan "parsial = kosong".
- `parse/extract.ts`: aturan judul §F, aktivitas tanpa jam, places destination guide, tabel, paragraf, list inline aman, alasan per baris §K.
- `parse/activity.ts`: memakai grammar durasi baru untuk `steps` dan `durationMinutes`.
- `normalize.ts`: leksikon `kinds` + fuzzy.
- `intake.ts`: deteksi baris tabel PDF §G.
- `config/web/import-headings.json`: dirampingkan ke nama kanonik; tambah heading bagian waktu, kebijakan, kontak darurat.

### Tahap 2 — CP031 laporan dan resolve
- `import/service.ts` dan `import/merge.ts`: `unknownLabels` di laporan; resolve menerima keputusan label (masukkan ke field / abaikan), revision-safe.
- `import/schema.ts`: bentuk laporan diperluas. **Tanpa** perubahan prompt AI, schema jawaban AI, tabel database, atau migrasi.

### Tahap 3 — validator jadwal (CP024 rule)
- `contracts/validator.ts` dan `server/preview.ts`: jam diperluas §J.
- `render/render.ts`: penanda "+1".
- `editor/validation.ts`: pesan ditambah penjelasan lintas tengah malam bila relevan.

### Tahap 4 — CP032 UI
- `editor/import/ImportScreen.tsx` dan `copy.ts`: panel "Format yang didukung" + salin, banner coverage rendah §L.
- `editor/import/ImportReport.tsx`: kartu "Label belum dikenal" dengan pilihan field, alasan per baris, peringatan aturan mode.
- `config/web/import-templates.json` + locale `id`/`en`.

## Impact and Regression Risk

| Risiko | Mitigasi |
|---|---|
| Fuzzy matching salah memetakan label (mis. `Tur` ke `Tujuan`). | Ambang ketat, minimal 3 huruf, seri → review. Test negatif untuk pasangan label mirip. |
| Pemecahan list membalik makna. | Aturan kata pengecualian/negasi; mutasi baru "matikan guard pemecahan" wajib tertangkap test. |
| Judul lebih sering kosong. | Sesuai D4; catatan jelas di laporan; format F1 mendorong label `Judul:`. |
| Paragraf menghasilkan aktivitas sampah. | Hanya klausa dengan jam tidak ambigu; sisanya tetap "perlu dicek". |
| Lintas tengah malam menyembunyikan salah urut sungguhan. | Hanya satu kali per hari, dari ≥18:00 ke <12:00; penurunan lain tetap error. |
| Deteksi tabel PDF membalikkan perbaikan kolom ambigu dari audit lama. | 12 layout PDF yang ada (`layout-case-01…12`) wajib tetap lulus tanpa perubahan ekspektasi. |
| Guide tidak membaca contoh format dan menempel teks bebas. | Banner coverage rendah; hasil tetap jujur (dilaporkan, tidak ditebak). |
| Template bergeser dari kemampuan parser. | Test kontrak §L untuk 22 template. |
| Lingkungan uji Node 22, sedangkan `engines` ≥24. | Catat versi Node di log; tidak mengklaim lulus di Node 24 bila tidak dijalankan. |

## Verification Plan

### Ekspektasi korpus realistis (test baru `tests/web/import-realistic.test.ts`)

Setiap sampel memakai jalur `parse` + `apply` dengan extractor double (AI mati).

| Sampel | Harus terjadi |
|---|---|
| A1 | `pukul 9` → judul "Keraton Yogyakarta", jam kosong + catatan; `sore …` → aktivitas jam kosong + catatan. |
| A2–A4 | Perilaku sekarang dipertahankan (penanda hari, batas 14, konflik). |
| A5 | Prefix chat dibuang; 3 aktivitas (08:00, 10:00, 13:00); judul kosong; 2 baris injeksi diabaikan dengan alasan "berisi instruksi"; tidak ada teks injeksi di field mana pun. |
| A6 | `places` = Pulau Padar, Pink Beach, Pulau Komodo, Gua Batu Cermin; catatan jam dibuang. |
| A7 | Laporan import memuat peringatan cap durasi dan overlap. |
| A8 | `included` = [Tiket masuk, Makan siang]; `notIncluded` = [Tip guide, belanja pribadi]; PDF sama dengan teks. |
| A9 | `Terbang tandem` 60 menit; `Udara` → label/kategori masuk review, bukan diisi. |
| A10 | Judul kosong; semua baris diabaikan dengan alasan; tidak ada aktivitas. |
| B1 | Judul kosong; guide Pak Rudi + telepon terpisah; aktivitas 13:00 dari klausa "jam 1 siang"; klausa lain "perlu dicek". |
| B2 | 3 aktivitas (08:30 120 mnt perkiraan, 10:45, 12:00); guide `mas Dimas` + telepon; `Tgl 5-1-2027` → konflik 2 kandidat; `Meetpoint` → titik kumpul (status Cukup). |
| B3 | Judul "Itinerary Yogyakarta 2D1N"; destinasi + negara; 2 hari dengan 3 + 2 aktivitas berjam; PDF sama. |
| B4 | Header tabel tidak menjadi aktivitas; 4 aktivitas dengan durasi; keterangan di `tip`; PDF sama. |
| B5 | Tanpa `ACTIVITY_ORDER` untuk 23:30 → 01:00; `12 am` setelah 03:30 tetap `ACTIVITY_ORDER`; titik kumpul `Malang` + jam 23:30; catatan zona waktu berbeda; `Berangkat`/`jeep` → transport. |
| B6 | Harga tidak diisi + alasan; kebijakan terisi; 2 kontak darurat; email/IG tidak masuk telepon guide. |
| B7 | Destinasi Ubud; 2 item included; aktivitas tidak dobel. |
| B8 | 5 aktivitas jam kosong, masing-masing dengan catatan bagian; tidak ada penanda hari palsu. |
| B9 | `1jam 30mnt` = 90; `9`, `11` tetap kosong; `4pm` = 16:00; langkah 10/90/30 menit dengan catatan perkiraan untuk `±`; berat `100 - 110 kg` kosong + catatan. |
| B10 | Judul tanpa "(REVISI 2!!)" + catatan; coretan, NOTE, TBA diabaikan dengan alasan; hari 3 kosong + warning. |

### Test tambahan
- Invarian "setiap nilai ada di sumber" (pola `import-parser.test.ts:105`) dijalankan untuk ke-20 sampel dan semua template.
- **Template (§L):** 22 template lolos kontrak; mode `multi_day` dengan F3/F4 di bawah penanda hari menempel ke hari yang benar; salinan contoh dari UI sama persis dengan isi template.
- Pencocok label: tabel positif (`Tgl`, `Meetpoint`, `Destination / Destinasi`, `Tlp`) dan negatif (tingkat yang menghasilkan dua field → review, tidak ada pemenang).
- Tidak ada angka confidence: test memeriksa bahwa respons parse/apply/laporan tidak memuat field skor numerik.
- Grammar durasi: tabel input → menit/kosong, termasuk semua bentuk §E.
- Label belum dikenal: muncul di laporan, resolve menulis nilai dari sumber ke field pilihan, revision conflict ditolak, abaikan tidak mengubah draft.
- Banner coverage rendah muncul untuk sampel B1/B3/A10 dan tidak muncul untuk template.
- Validator: lintas tengah malam satu kali sah, dua kali error; cap durasi pada jam diperluas.
- Mutasi baru di `verify:web-import-mutations`: matikan guard pemecahan list, matikan aturan "parsial = kosong", matikan filter prefix chat. Ketiganya wajib tertangkap.

### Gate perintah
`test:web-import`, `test:web-contracts`, `test:web-preview`, `test:web-editor`, `test:web-render`, `test:web-ai`, `verify:web-import`, `verify:web-import-mutations`, `typecheck:web-app`, `typecheck:web-server`, `check:web-types`, `build:web-release`, `validate:web-release`. Ditambah browser check layar import (panel format, salin, banner, review label) pada 390 px dan 1280 px. Live AI tidak diklaim kecuali dijalankan dengan izin.

## Updated Acceptance Criteria

1. Semua ekspektasi tabel korpus realistis lulus untuk teks; A8, B3, B4, B5, B8 juga lulus untuk PDF dengan hasil draft identik.
2. Rata-rata coverage baris "dipakai atau diabaikan dengan alasan" pada B1–B10 ≥90%. Tidak ada baris tanpa status.
3. Nol nilai salah yang tampak valid di korpus: durasi parsial, keterangan menempel ke judul, nilai gabungan, teks injeksi/sapaan sebagai judul.
4. 133 test import lama dan 12 layout PDF tetap lulus tanpa melonggarkan ekspektasi.
5. Jadwal lintas tengah malam sesuai §J di editor, preview, publish, dan laporan import.
6. Label belum dikenal dapat diputuskan guide di review (§H); tidak ada skor numerik, alias, klasifikasi AI, atau migrasi database yang ditambahkan.
7. 22 template per mode × format tampil, bisa disalin, dan lolos kontrak §L; banner coverage rendah bekerja.
8. Semua gate perintah lulus; hasil dan versi Node dicatat di log revisi.

## Rollback

- Perubahan parser dan UI bersifat kode; rollback dengan revert commit per tahap. Tahap dikomit terpisah (0–4).
- Tidak ada migrasi database, perubahan prompt/schema AI, atau perubahan data draft atau published, jadi rollback tidak menyentuh data.
- Aturan lintas tengah malam bisa dikembalikan sendiri (tahap 3) tanpa memengaruhi parser.
- Template dan panel UI (tahap 4) bisa dicabut tanpa memengaruhi parser; template yang tersisa tidak digunakan oleh jalur lain.
