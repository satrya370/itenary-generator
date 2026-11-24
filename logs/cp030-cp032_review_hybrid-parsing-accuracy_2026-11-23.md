# Review akurasi hybrid parsing teks/PDF

Tanggal: 2026-11-23  
Status: **CHANGES REQUIRED — koneksi AI dan render lulus; akurasi semantik belum lulus.**  
Lingkup: hasil smoke test live tersimpan, parser deterministik, pembentukan input AI, validasi bukti, merge, laporan review, dan observabilitas model. Ini review dan rencana, bukan implementasi perbaikan.

## 1. Bukti dan batas review

- Hasil tes tersimpan: `C:\Users\Asus\AppData\Local\Temp\opencode\hybrid-live-text.json` dan `hybrid-live-pdf.json`.
- Fixture/generator tes: `C:\Users\Asus\AppData\Local\Temp\opencode\verify-hybrid-live.py`.
- Reproduksi fungsi kode: `C:\Users\Asus\AppData\Local\Temp\opencode\review-hybrid-repro.mts`.
- Reproduksi dijalankan memakai Node 24 + `--import tsx`, working directory repository. Tidak memanggil AI live tambahan pada review ini.
- Inspeksi kode dilakukan pada working tree saat review, yang sudah memiliki banyak perubahan lokal. Nomor baris dapat bergeser sesudah perubahan berikutnya.
- Teks/PDF fixture hanya 11 baris, satu hari, empat aktivitas. Ini bukan pembuktian itinerary panjang tiga hari, semua lima mode, PDF scan, atau layout kompleks.
- Reproduksi filter memakai proposal AI buatan untuk menguji validator secara deterministik; dibedakan dari hasil live yang sudah tersimpan.

## 2. Koreksi laporan tes sebelumnya

| Ukuran | Teks | PDF |
|---|---:|---:|
| Intake / parse / apply HTTP | 201 / 200 / 201 | 201 / 200 / 201 |
| Prompt tokens | 732 | 732 |
| Completion tokens | 1.340 | 800 |
| Total tokens | **2.072** | **1.532** |
| Biaya yang dilaporkan provider | **US$0.0007432** | **US$0.0004732** |
| Batch / percobaan | 1 / 1 | 1 / 1 |
| Aktivitas terbaca | 4 | 4 |
| Deskripsi aktivitas terisi | 0 | 0 |

Laporan sebelumnya keliru menyamakan token/biaya kedua tes. Preview browser yang diperiksa sesuai hasil **PDF** (ringkasan dan ketentuan, 1.532 token), bukan bukti preview kedua draft. Screenshot bernama `preview-hybrid-1280.png` sebenarnya berukuran **1039×683**, dengan mode preview Phone; screenshot 390px berukuran 390×844. Klaim desktop 1280px tidak terbukti.

Server utama hanya diperiksa status/preflight; tes impor dan browser dilaksanakan di server terisolasi `:3196`. Karena itu tidak tepat menyebutnya tes impor langsung pada server utama. Preflight yang menampilkan `openai/gpt-oss-120b` adalah preflight model penulisan, bukan preflight Haiku khusus impor.

Kalimat “deskripsi kosong karena sumber tidak memuatnya” juga terlalu kuat: sumber memiliki kalimat penjelas tepat setelah kunjungan Keraton, tetapi hasil teks memindahkannya ke ringkasan dan PDF tidak menerapkannya. Klaim yang benar: **pipeline dan render berhasil, akurasi assignment belum diverifikasi dan ditemukan cacat.**

## 3. Temuan

### H01 — P1: bukti literal tidak menjamin field tujuan benar

**Terbukti melalui hasil live dan reproduksi validator.**

- `src/server/import/complete.ts:120–137`: `textEvidence` memeriksa keberadaan/equality kutipan; `textPath` menerapkan guard yang sama pada `summary`, `closingNote`, dan `policies`, tanpa batas konteks semantik tujuan.
- `src/server/import/complete.ts:194–217` membatasi konteks detail aktivitas, tetapi pembatasan sepadan tidak berlaku pada tiga field global tersebut.
- Kalimat `Kenakan pakaian sopan selama berada di dalam keraton.` diterima sebagai **summary**, **closingNote**, maupun **policies** dalam tiga reproduksi terpisah; seluruhnya `dropped: []`.
- Live teks menempatkan instruksi ini pada tip Keraton; live PDF menempatkannya pada kebijakan global. Kalimat deskripsi kunjungan menjadi ringkasan pada teks.

**Dampak:** tanpa mengarang kata baru, engine tetap dapat menghasilkan arti/lingkup yang keliru. Instruksi satu lokasi tampil seolah ketentuan seluruh paket.

**Arah perbaikan:** beri setiap source unit konteks/owner dan allowed destination. Kutipan cocok adalah syarat perlu, bukan syarat cukup. Konteks lokal jangan otomatis naik menjadi global. Ambiguitas harus menghasilkan kandidat review, bukan assignment diam-diam. Jangan hanya memperbaiki prompt atau menurunkan temperature.

### H02 — P1: baris yang dikirim tetapi diabaikan AI hilang dari daftar pekerjaan review

**Terbukti pada hasil live PDF dan inspeksi kode.**

- PDF mengirim source line indexes `[6,7,10]`; accepted evidence hanya memakai `[10]` dan `[7]`. Baris 6 tidak diterapkan, tidak masuk rejected, dan tidak masuk omitted.
- Namun laporan menunjukkan `batches[0].status: completed`, `review.unsupported: 0`, `skipped: []`, `notes: []`.
- `src/server/import/service.ts:223` menyebut batch completed ketika JSON completion tersedia, sebelum menilai hasil pemetaan.
- `service.ts:294–304`: unsupported menghitung dropped + omitted, bukan semua source units yang belum terwakili setelah merge; unconsumed adalah angka sebelum AI.
- `src/editor/import/ImportReport.tsx:160`: pemberitahuan bagian yang belum aman bergantung pada unsupported tersebut.

**Dampak:** pengguna tidak diarahkan ke informasi yang diam-diam ditinggalkan. Laporan keberhasilan teknis disalahartikan sebagai kelengkapan ekstraksi.

**Arah perbaikan:** ledger coverage setelah merge: setiap unit harus applied / pending-review / rejected / unsupported / omitted dengan alasan dan bukti. Pisahkan provider-completed dari mapping-complete. Ukur cakupan terhadap data yang benar-benar tersimpan, bukan proposal yang sempat diterima.

### H03 — P2: deskripsi valid tanpa titik ditolak

**Terbukti melalui reproduksi validator.**

- `src/server/import/complete.ts:92–102`: `wholeUnit` mewajibkan tanda akhir kalimat, kecuali bullet highlights/steps.
- Sumber `09:00 Keraton`, diikuti `Peserta mengenal budaya Yogyakarta bersama pemandu lokal`, lalu `12:00 Makan siang`.
- Proposal description dengan kutipan persis ditolak sebagai `IMPORT_SOURCE_UNIT_INCOMPLETE`.
- Menambahkan satu titik pada kalimat yang sama membuat proposal diterima.

**Dampak:** catatan WhatsApp tanpa tanda baca tidak dapat dipetakan meskipun boundary aktivitas berikutnya jelas. Token AI terpakai tanpa manfaat.

**Arah perbaikan:** kenali akhir unit dari struktur, section, aktivitas berikutnya, bullet, dan paragraph/layout; jangan bergantung pada titik saja. Pertahankan guard kalimat terbungkus dan qualifier/negasi: perubahan tidak boleh membolehkan pemotongan “kecuali …”.

### H04 — P1: deskripsi inline terserap ke judul dan tidak pernah dikirim ke AI

**Terbukti melalui reproduksi parser.**

```text
Judul: Review
Hari 1
09.00–10.30 — Tur Keraton. Peserta mengenal sejarah dan budaya bersama pemandu.
```

Hasil: time `09:00`, duration `90`, title **seluruh kalimat setelah jam**, `unconsumed: []`, `aiUnits: []`.

- `src/server/import/parse/extract.ts:275` menaruh sisa baris menjadi title.
- `src/server/import/complete.ts:35–45`: hanya unconsumed yang masuk segments AI.
- `src/server/import/merge.ts:83`: description aktivitas baru selalu mulai kosong; detail hanya diisi jika ada completion yang sesuai.
- Pemindahan ke description karena title melampaui 200 karakter (`merge.ts:213–217`) bukan segmentasi semantik dan tidak membantu contoh pendek ini.

**Dampak:** format alami seperti contoh itinerary panjang yang sebelumnya diberikan terlihat “terbaca”, tetapi detail menumpuk pada judul dan description tetap kosong. Coverage consumed tinggi bukan tanda kualitas tinggi.

**Arah perbaikan:** source spans terpisah untuk jam, judul, dan detail; title bersih + detail kandidat dengan offset bukti. Baris parcialmente terpetakan tetap dapat diproses untuk bagian yang belum terpetakan tanpa mengubah jam yang sudah terbaca. Jangan memisah semua titik secara membabi buta (singkatan/nama/tempat).

### H05 — P2: overwrite menganggap seluruh sisa sebelum AI tetap unresolved

**Teridentifikasi lewat alur kode; belum diuji sebagai operasi overwrite end-to-end.**

- `src/server/import/service.ts:246–250`: `hasUnresolvedDayText` berdasarkan `parse.unconsumed` awal, tidak dikurangi source units yang sudah berhasil diselesaikan AI.
- `service.ts:262–265`: bila days dianggap unsafe saat overwrite, completion.activityDetails justru dibuang.
- `src/server/import/merge.ts:40–41`: koleksi unsafe dipertahankan.

**Dampak:** sekalipun AI menyelesaikan seluruh detail dengan bukti valid, overwrite dapat tetap menolak pembaruan days dan menghilangkan manfaat completion. Perlindungan draft lama memang diperlukan; kondisi pemicunya terlalu luas.

**Arah perbaikan:** hitung unresolved setelah accepted mapping dan validasi; gunakan ownership per hari/koleksi. Koleksi benar-benar parsial tetap dipertahankan. Uji new vs overwrite dengan sumber sama, complete vs partial, edit lokal dan revisi konflik.

### H06 — P2: prompt memutus hubungan source line dan target aktivitas

**Teridentifikasi lewat kontrak dan payload; kontribusinya pada variasi live masuk akal tetapi tidak diisolasi secara statistik.**

- `src/server/import/complete.ts:71–79`: allowed targets memuat line dan targetId.
- `src/server/import/service.ts:221`: segments dikirim sebagai string tanpa lineIndex atau ownerTargetId.
- `src/server/ai/provider.ts:73–75`: segments digabung dengan newline; aktivitas/jam yang telah consumed tidak menyertai source units.

**Dampak:** model harus menebak pemilik teks dari daftar target yang terpisah. Ini memperburuk salah-rute ringkasan/detail dan variasi output untuk input sama.

**Arah perbaikan:** kirim object source units ber-ID, line span, section, owner/allowed targets, serta konteks read-only yang dibedakan dari evidence. Validator menegakkan hubungan tersebut. Stabilkan konfigurasi sampling bila didukung; jangan menuntut kesamaan prosa mentah antarrequest live, tetapi tuntut invariants assignment dan coverage.

### H07 — P2: status “AI configured” dan preflight tidak membuktikan model impor siap

**Teridentifikasi melalui kode dan respons runtime tes sebelumnya.**

- `src/server/app.ts:146`: import.aiConfigured hanya membandingkan credentialState dengan configured.
- `src/server/ai/provider.ts:35–61`: preflight mencari `MODEL_ID` (writing), sedangkan extract memakai `IMPORT_MODEL_ID` di baris 73.
- Kontrak usage extract (`provider.ts:88`) tidak mencatat model respons/provider generation ID. Evidence tes hanya menunjukkan penggunaan token/biaya, bukan identitas model yang melayani request.

**Dampak:** operator dapat menyimpulkan Haiku tersedia dari hasil preflight model lain. Key berformat valid juga belum sama dengan auth valid/model tersedia. Pada tes sebelumnya autentikasi memang berhasil; temuan ini tentang status/diagnostik yang belum tepat.

**Arah perbaikan:** status/preflight khusus import model, configured vs authenticated vs listed vs recent-request-success; simpan requested model dan response model/generation ID jika provider menyediakannya, tanpa key.

## 4. Yang sudah bekerja

- Sumber teks dan PDF berteks fixture menghasilkan parser awal yang sama secara semantik, satu hari dan empat jam/aktivitas.
- Rentang waktu contoh 09.00–10.30 menjadi durasi 90 menit.
- Panggilan AI benar-benar terjadi; usage tersimpan per hasil tes.
- Guard kutipan menolak informasi tanpa bukti literal; guard konteks aktivitas sudah ada.
- Preview hasil PDF menampilkan data draft yang tersimpan, tanpa error render yang terlihat pada screenshot yang diperiksa.

Keberhasilan di atas tetap tidak cukup untuk menyatakan semua informasi terpetakan akurat.

## 5. Rekomendasi prioritas

1. P1 H01/H02: cegah salah field dan tampilkan setiap informasi belum terpetakan.
2. P1 H04: dukung judul + detail pada baris jadwal alami.
3. H03/H06: perbaiki boundary dan konteks AI.
4. H05: pertahankan keamanan overwrite tanpa menolak completion lengkap.
5. H07 + CP032: diagnostik model dan laporan/tes yang jujur.

Revision plan: `plans/cp030-cp032_revision-plan_hybrid-parsing-accuracy.md`. Follow-up CP035 lama tetap terpisah. Review ini tidak mengubah status completion historis atau mengklaim temuan sudah diperbaiki.
