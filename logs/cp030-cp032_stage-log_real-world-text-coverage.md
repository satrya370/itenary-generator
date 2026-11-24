# CP030–CP032 Stage Log: Real-World Text Coverage

**Status:** in_progress. Revisi belum selesai; log ini bukan completion log dan tidak mengubah status CP030–CP032 yang sudah `completed`.
**Plan:** `plans/cp030-cp032_revision-plan_real-world-text-coverage.md`
**Tanggal:** 2026-11-16
**Lingkungan:** Windows, Node v22.18.0 (proyek mensyaratkan ≥24; tidak diverifikasi di Node 24). Tanpa AI live. Tanpa PDF (permintaan owner: uji teks saja).

## Baseline sebelum perubahan

- `test:web-import` (sebelum tahap 1): 133/133 lulus.
- Kontrak dan activity-mode: 63/63 lulus.

## Yang dikerjakan

### Tahap 1: parser (CP030) — sebagian
| Bagian plan | Status | Berkas |
|---|---|---|
| B. Pra-pemrosesan baris (markdown, emoji, bullet, prefix chat, coretan, catatan internal, TBA, instruksi, sapaan) | selesai | `parse/clean.ts`, `parse/lines.ts` |
| C. Pola nilai | belum (tidak ada perubahan) | — |
| D. Label fuzzy bertingkat (exact → dwibahasa → singkatan → salah ketik 1–2 huruf; tie → review) | selesai untuk heading dan key-value | `parse/labels.ts` |
| D. Guard singkatan: kunci pendek tidak boleh memilih alias yang jauh lebih panjang (`harga` ≠ `harga termasuk`) | selesai (ditemukan lewat test) | `parse/labels.ts` |
| E. Grammar durasi (`mnt`, `'`, `setengah jam`, `±`, durasi parsial → kosong) | selesai | `parse/time.ts`, `parse/activity.ts` |
| E. Frasa jam ambigu dibuang dari judul aktivitas | selesai | `parse/time.ts` |
| F. Aturan judul (label eksplisit; baris awal ketat yang diikuti struktur; anotasi REVISI dibuang) | selesai | `parse/extract.ts` |
| F. Aktivitas tanpa jam di bagian PAGI/SIANG/SORE | selesai | `parse/lines.ts`, `parse/extract.ts` |
| F. Tabel bertab (header dikenali, keterangan ke `tip`) | selesai untuk teks; PDF belum | `parse/lines.ts`, `parse/extract.ts`, `merge.ts` |
| F. Baris bernomor dan bullet berjam dibaca dari isinya | selesai | `parse/extract.ts` |
| F. Daftar inline dipecah per koma kecuali ada negasi atau kurung terbuka | selesai | `parse/clean.ts` |
| F. Paragraf dipecah menjadi klausa | **belum** | — |
| F. Destination guide: bullet menjadi `places` | **belum** | — |
| F. Jenis aktivitas tambahan (`berangkat`, `jeep`, dst.) | **belum** | — |
| G. PDF berteks: baris tabel tidak dibuang | **belum** (dan tidak diuji ulang setelah perubahan) | — |

### Tahap 3: jadwal lintas tengah malam (D2) — selesai di validator dan preview
- `dayClock` di `src/contracts/validator.ts`: satu kali lewat tengah malam per hari (jatuh dari ≥18:00 ke <12:00) dianggap hari berikutnya. Dipakai oleh `ACTIVITY_ORDER`, `DURATION_CAP_EXCEEDED`, dan `SCHEDULE_OVERLAP` (`src/server/preview.ts`).
- Penanda "+1" di renderer **belum** dikerjakan.

### Merge
- `src/server/import/merge.ts`: `tip` dari tabel sampai ke draft aktivitas.

## Yang belum dikerjakan (dari plan)
- Tahap 2: laporan `unknownLabels`, resolve keputusan label di review. Tidak ada perubahan database (sesuai D7).
- Tahap 4: panel "Format yang didukung", 22 template di `config/web/import-templates.json`, tombol salin, banner coverage rendah, kartu label belum dikenal. **Belum ada perubahan UI sama sekali.**
- Kontrak template (setiap template harus lolos parser 100%): belum ada karena template belum ditulis.
- Mutasi keamanan baru di `verify:web-import-mutations` (matikan guard pemecahan list, aturan parsial-kosong, filter prefix chat): **belum ditambahkan dan belum dijalankan**.
- Fixture korpus di `tests/fixtures/web/import/realistic/`: belum dibuat. Sebagai gantinya korpus ditulis inline di `tests/web/import-realistic.test.ts`.
- Pengecekan nilai per baris dan alasan (bagian K) hanya sebagian: alasan untuk baris diabaikan dan harga sudah ada; "label tidak dikenal" dan "peringatan aturan mode saat import" belum.

## Hasil verifikasi

| Perintah | Hasil |
|---|---|
| `npm run test:web-import` (termasuk `import-realistic`) | 147/147 lulus |
| `tests/web/import-realistic.test.ts` | 14/14 lulus |
| `test:web-contracts` | 51/51 lulus |
| `test:web-preview` | 12/12 lulus |
| `test:web-editor` | 34/34 lulus |
| `test:web-store` | 12/12 lulus |
| `test:web-render` | 14/14 lulus |
| `test:web-ai` | 30/30 lulus |
| `test:web-api` | 13/13 lulus |
| `test:web-publication` | 12/12 lulus |
| `typecheck:web-app` | 0 error |
| `typecheck:web-server` | 0 error |
| `check:web-types` | cocok dengan JSON Schema |
| Korpus 20 sampel, jalur teks (`run-text.mts`) | lihat tabel di bawah |

Tidak dijalankan: `verify:web-import-mutations`, `verify:web-import`, `verify:web-e2e`, `build:web-release`, `validate:web-release`, browser check 390/1280 px. Klaim lulus hanya untuk yang tercantum di tabel di atas.

## Perubahan keputusan yang disengaja (test lama diperbarui)
- `tests/web/import-parser.test.ts` dan `tests/web/import-apply.test.ts`: judul "Half day Kyoto walk 🌸" sekarang "Half day Kyoto walk". Emoji di tepi baris dibuang dari nilai, sesuai plan bagian B. Teks sumber tidak berubah.
- `tests/web/import-parser.test.ts`: baris injeksi tidak lagi berada di `unconsumed`; sekarang dilaporkan di `notes` dengan alasan "berisi instruksi". Ini disengaja: baris itu tidak boleh sampai ke AI.
- `tests/web/import-parser.test.ts`: daftar inline "Transportasi, air mineral" sekarang dipecah menjadi dua item. Sesuai aturan pemecahan di plan bagian F.

## Perbandingan korpus (jalur teks, cakupan = baris terbaca / total baris)

| Sampel | Sebelum | Sesudah | Catatan |
|---|---|---|---|
| A5 chat + injeksi | 0.17 | 0.83 | judul kosong; injeksi diabaikan dengan alasan |
| A10 sapaan | 0.20 | 0.80 | sapaan dan emoji diabaikan dengan alasan; judul kosong |
| B2 daftar bernomor | 0.38 | 1.00 | `Meetpoint` terbaca; `jm 8` dipisah dari tempat |
| B3 markdown | 0.10 | 1.00 | judul bersih; 5 aktivitas berjam |
| B4 tabel | 0.83 | 1.00 | keterangan ke `tip` |
| B7 dua bahasa | 0.50 | 1.00 | destinasi terbaca |
| B8 PAGI/SIANG/SORE | 0.20 | 1.00 | 5 aktivitas tanpa jam, dengan catatan |
| B9 activity | 1.00 | 1.00 | `1jam 30mnt` = 90 menit (sebelumnya 60, salah) |
| B10 revisi | 0.75 | 1.00 | coretan, NOTE, TBA diabaikan dengan alasan; judul bersih |
| B1 paragraf | 0.00 | 0.00 | belum (klausa belum dikerjakan) |
| A6 destination guide | 0.43 | 0.43 | belum (`places` belum) |
| B6 kebijakan dan kontak | 0.44 | 0.44 | belum (label kebijakan dan kontak darurat belum dikenal) |

Preview B5 (lintas tengah malam): tidak ada `ACTIVITY_ORDER` untuk 23:30 → 01:00. Yang tersisa `ACTIVITY_ORDER` untuk `00:00` setelah `03:30`, dan itu sesuai plan.

Catatan: hasil PDF sebelum perubahan (dari sesi uji sebelumnya) tidak berlaku lagi. PDF belum diuji ulang setelah perubahan parser.

## Risiko yang tercatat
- Pencocok label fuzzy bisa salah pada kata pendek. Guard panjang sudah ditambahkan; belum ada test negatif yang menutup semua pasangan label mirip.
- Kata `dan`/`and` di pola bagian waktu bisa mengenai baris yang memang berisi kata-kata itu; batas panjang 30 karakter dan tanpa angka mengurangi risiko.
- Pola instruksi (`ubah … tempat`) bisa menandai kalimat sah sebagai "berisi instruksi". Baris itu tetap dilaporkan, tidak hilang diam-diam.

## Deviasi dari plan
- Korpus disimpan inline di test, bukan sebagai fixture terpisah.
- Penanda "+1" di renderer dan kartu label belum dikerjakan (lihat bagian belum dikerjakan).
- Verifikasi di Node 22, bukan 24.

## Lanjutan 2026-11-16: tahap 1 dilengkapi

| Bagian plan | Status | Catatan |
|---|---|---|
| C. Pola nilai: nomor HP di teks bebas | selesai, hanya bila nomornya tunggal | `phonesIn` di `parse/clean.ts`; dua nomor berbeda → tidak dipilih |
| C. Nama dan nomor dalam satu nilai (`mas Dimas (wa …)`) | selesai | `handleKeyValue` case `guide` |
| D. Label kontak darurat dan kebijakan | selesai | `keyValue.emergency`, `keyValue.policy` di `import-headings.json`; kebijakan masuk `fields.policies` → draft `policies` (AI tetap menang bila ada) |
| E. Harga: dilaporkan, tidak diisi | selesai | catatan "harga tidak didukung engine" |
| F. Paragraf dipecah per klausa | selesai, terbatas | hanya klausa dengan jam jelas (`jam 1 siang`, `13.00`); `jam 5` tanpa periode tetap "dicek" |
| F. Destinasi: bullet/baris pendek jadi `places` | selesai | baris tetap `unconsumed` agar AI punya konteks kutipan; tempat AI tetap menang |
| F. Jenis aktivitas tambahan | selesai | `kinds.transport` |
| G. Tabel PDF berkolom sejajar | selesai untuk satu kolom | `tableRows` dan `cellsOf` di `intake.ts`; fixture `tests/fixtures/web/import/layout-copied-table-cp030.pdf` |

Catatan PDF:
- Sebelumnya tabel empat kolom dianggap multi-kolom lalu ditandai ambigu, sehingga barisnya dibuang dari parse.
- Sekarang baris bertabel dideteksi lebih dulu dan tidak ikut dihitung sebagai kolom.
- Sel dipisah pada celah > 9 satuan. Celah kata dalam sel sekitar 2–7 satuan.
- Sumber PDF tidak sejajar sempurna (karakter tab merender kolom tidak rata). Karena itu sel "1,5 jam Gratis tiket" tetap menyatu, dan sisa teks setelah durasi dipindah ke `tip`.

Hasil gate setelah lanjutan:
- `npm run test:web-import`: 152/152 lulus (termasuk 19 test di `import-realistic.test.ts`).
- Suite web lain (kontrak, preview, editor, store, render, AI, API, publication): semua lulus.
- `typecheck:web-app`, `typecheck:web-server`, `check:web-types`: bersih.

Perubahan test lama karena keputusan baru:
- `import-apply.test.ts`: injeksi tempat sekarang diuji dengan memastikan nama yang disuntikkan tidak ada; tempat berasal dari bullet dokumen.
- `import-parser.test.ts`: bullet destinasi tidak lagi harus "tetap tidak terbaca" di tahap parser; karena tetap `unconsumed`, uji lama tetap lulus.

Yang masih belum (di luar tahap 1):
- Tahap 2 (laporan label belum dikenal, keputusan guide) dan tahap 4 (UI, template, banner) belum dikerjakan.
- Mutasi keamanan baru belum ditambahkan.
- Penanda "+1" di renderer belum dikerjakan.
- Coverage destinasi (A6) tetap 43% di metrik, karena baris tempat sengaja tetap `unconsumed` untuk AI. Tempatnya sudah terbaca oleh kode.

## Tahap 2: laporan label dan resolve (2026-11-16)

| Bagian plan | Status | Berkas |
|---|---|---|
| H. `unknownLabels` di laporan (setiap "Label: nilai" yang tidak dipakai parser, termasuk label dikenal yang tidak berlaku di mode itu) | selesai | `parse/extract.ts` (`keep`, `valueTypeOf`) |
| H. Pilihan field per tipe nilai dan mode; email hanya bisa diabaikan | selesai | `service.ts` (`LABEL_TARGETS`, `labelTargets`) |
| H. Resolve: pilih field atau abaikan; nilai selalu disalin dari sumber; revisi dicek | selesai | `service.ts` (`resolveUnknownLabel`, `commitReview`) |
| Tanpa perubahan database, prompt AI, atau schema AI | sesuai plan (D7) | — |

Catatan:
- Laporan lama tetap utuh; `review.unknownLabels` hanya menambah field.
- `resolve` untuk kandidat konflik dipindah ke `commitReview`, bagian commit yang sama. Perilaku konflik tidak berubah; suite lama lulus.
- Label yang dikenal tetapi tidak berlaku di mode (mis. `Jam mulai` di mode lain) juga dilaporkan. Sebelumnya ini hilang diam-diam.
- Kandidat sudah dicocokkan ke sumber: label dan nomor baris harus sama, jika tidak permintaan ditolak (`IMPORT_REVIEW_UNAVAILABLE`).

Test baru: `tests/web/import-labels.test.ts` (9 test). Mencakup pencatatan, label dikenal yang tidak dilaporkan, tipe tanggal dan jam, daftar tujuan per mode, pilih field, target yang tidak ditawarkan ditolak, nilai yang tidak cocok ditolak, abaikan dan keputusan ganda ditolak, dan revisi usang ditolak.

Hasil gate: `test:web-import` 161/161; suite web lain lulus; typecheck dan `check:web-types` bersih.

## Tahap 3: jadwal lintas tengah malam di renderer (2026-11-16)

| Bagian plan | Status | Berkas |
|---|---|---|
| J. Validator dan preview memakai hitungan jam yang sama | selesai sebelumnya | `contracts/clock.ts` (sebelumnya di validator) |
| J. Penanda "+1" di renderer | selesai | `render/render.ts` (`renderActivity`, parameter `clockMinutes`) |

Catatan:
- `dayClock` dan `minutesOf` dipindah ke `src/contracts/clock.ts` supaya validator, preview, dan renderer memakai satu definisi. Validator tetap mengekspor `dayClock`, jadi pemanggil lama tidak berubah.
- Penanda ditampilkan sebagai `<span class="next-day">+1</span>` di samping jam. Tidak ada perubahan schema.

Test: `tests/web/render.test.ts` menambah satu test. Aktivitas 23:30, 01:00, dan 03:30 dalam satu hari: "+1" muncul dua kali (untuk 01:00 dan 03:30), tidak untuk 23:30.

Hasil gate: `test:web-import` 161/161; `test:web-render` 15/15; suite web lain lulus; `tsconfig.app.json`, `tsconfig.runtime.json`, `typecheck:web-server`, dan `check:web-types` bersih.

## Tahap 4: UI, template, dan banner (2026-11-16)

| Bagian plan | Status | Berkas |
|---|---|---|
| L. Panel "Format yang didukung" per mode, dengan tab format dan contoh Indonesia/English | selesai | `editor/import/ImportFormats.tsx` |
| L. Tombol "Salin contoh" dengan pesan gagal yang jelas | selesai | `editor/import/ImportFormats.tsx` |
| L. 22 template (11 per bahasa) | selesai | `config/web/import-templates.json` |
| L. Kontrak template: setiap contoh dibaca lengkap oleh parser | selesai | `tests/web/import-templates.test.ts` (23 test) |
| L. Banner "sebagian besar baris tidak terbaca" di bawah 60% | selesai | `editor/import/ImportScreen.tsx` (`LOW_COVERAGE`) |
| H. Kartu "Label belum dikenal" di layar hasil import | selesai (kode dan typecheck; uji browser belum) | `editor/import/ImportReport.tsx` (`UnknownLabels`) |

Perubahan pendukung:
- Respons parse membawa `coverage` (sudah ada) dan `unknownLabels` (baru). Tipe klien diperbarui di `src/api/client.ts`.
- Baris destinasi (`places`) sekarang dihitung sebagai terbaca di `coverage`, karena memang dibaca kode. Baris tetap `unconsumed` agar AI punya konteks kutipan.
- Bug parser yang ditemukan lewat template: baris `Hari 2` setelah bagian `SIANG` ikut terbaca sebagai aktivitas. Bagian waktu sekarang berakhir pada penanda hari.
- `id` panel per tab (`import-formats-paste`, `import-formats-pdf`), karena alur pembuatan memasang dua layar import. Id yang sama membuat DOM tidak valid.

Verifikasi:
- `test:web-import` 184/184 lulus.
- `test:web-editor` 34/34, dan suite web lain lulus.
- `typecheck:web-app`, `typecheck:web-server`, `tsconfig.runtime.json`, dan `check:web-types` bersih.
- `build:web-app` dan `build:web-release` berhasil; `validate:web-release` menghasilkan `valid`.
- Browser (Chrome headless, engine dari build baru): panel format tampil di 390 dan 1280 px, tanpa overflow horizontal; banner muncul untuk teks tanpa struktur itinerary.

Belum diverifikasi di browser:
- Kartu "Label belum dikenal" di layar hasil import. Logikanya mengikuti kartu konflik dan diuji lewat API (`import-labels.test.ts`), tetapi tampilannya belum dilihat di browser.
- Tombol "Salin contoh" pada clipboard browser sungguhan.
- Verifikasi di Node 24 (proyek mensyaratkan ≥24; di sini Node 22).
