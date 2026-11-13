# CP030–CP032 Revision Plan: Text and PDF Parser Hardening

**Tanggal:** 2026-11-13
**Status:** planned — belum diimplementasikan, belum ada gate revisi yang dinyatakan lulus.
**Scope:** CP030 intake/parser → CP031 evidence/AI/merge → CP032 review UI/E2E. Gunakan ID checkpoint asal; tidak membuat checkpoint implementasi baru.
**Authority:** `SPEC.md`, `TODOS.md`, `RULES.md`; canonical runtime saat audit `web-2.2.0`.
**Plan historis:** `plans/cp030-cp032_implementation-plan_document-and-text-import.md`. Jangan mengubah plan historis untuk menyamarkan revisi. Revisi pemisahan model `plans/cp031_revision-plan_split-import-model.md` tetap berlaku.

## Reason for Revision

Audit menemukan kegagalan yang tidak tercakup lima live happy-path imports. Tiga adverse outputs dari extractor simulasi terbukti lolos melalui API dan tersimpan: negasi terpotong, penanda internal masuk ringkasan, dan deskripsi ditempel ke aktivitas yang salah. Reproduksi parser juga menunjukkan hari lompat tercampur, salah durasi/jam, tanggal ISO hilang, URL menghilangkan nama meeting point, serta field berulang ditimpa tanpa konflik.

PDF saat ini direkonstruksi dengan pengelompokan posisi Y dan urutan X. Ini belum cukup untuk tabel, dua kolom, baris terbungkus, atau jadwal lintas halaman. Tiga test PDF sebelumnya gagal karena fixture tidak tersedia; kegagalan itu bukan bukti fungsi PDF rusak atau benar.

Tujuan revisi adalah mencegah salah isi yang tampak valid, meningkatkan coverage teks/PDF berteks, dan menjadikan kehilangan informasi serta ambiguitas terlihat. Bukan menjanjikan parsing universal atau menyerahkan semua keputusan ke AI.

## Clarifications and Decisions

Structured Ask Question untuk plan ini telah dijawab pengguna:

| ID | Keputusan | Dampak |
|---|---|---|
| R1 | **PDF berteks saja**, termasuk tabel/multi-kolom/header-footer/lintas halaman. | Tidak menambah OCR atau vision. Scan ditolak dengan pesan jelas. |
| R2 | **Review eksplisit** untuk data ambigu/konflik. | Draft parsial boleh disimpan; nilai meragukan tidak dipilih otomatis. Tampilkan kandidat, sumber, dan alasan untuk keputusan pengguna. |
| R3 | Audit menjadi dasar revisi teks dan PDF. | Semua temuan di matriks F01–F15 masuk scope dengan acceptance test yang nyata. |

Keputusan sebelumnya yang dipertahankan:

- Import memakai `anthropic/claude-haiku-5.5`; penulisan memakai `openai/gpt-oss-120b`; key OpenRouter sama, server-side. Tidak mengganti model/key atau mencetak nilainya.
- Mode dipilih pengguna, tidak auto-switch. Dukung lima mode runtime: `half_day`, `full_day`, `multi_day`, `destination_guide`, `activity`.
- Import tidak menerjemahkan atau menulis fakta/deskripsi yang tidak ada. Hasil adalah draft, tidak auto-publish.
- Existing writing-AI quota/ledger tidak dipakai import. Tidak menambah plafon komersial import; batas teknis per eksekusi tetap wajib.
- Negara/bahasa default hanya bila sumber benar-benar tidak menyebutnya; default tidak boleh menutupi konflik.
- Kepastian dinyatakan sebagai status berbasis aturan, **bukan** angka confidence yang dianggap probabilitas benar.

### Rekonsiliasi dokumen sebelum implementasi

- Plan historis I9 tidak menyimpan kutipan per field; revisi ini memerlukan evidence privat minimal dan UI khusus kandidat/konflik untuk memenuhi R2 dan `SPEC.md` W19. Tidak menambah badge provenance di seluruh editor.
- Plan historis mewajibkan nomor hari bertambah satu dan menyatakan hanya baris unconsumed dikirim ke AI. Aturan itu diganti dengan batas blok hari yang aman dan unresolved spans plus konteks read-only ber-ID.
- Plan historis masih menyebut empat mode dan schema lama. Ikuti kelima mode runtime; jangan downgrade activity/schema.
- `SPEC.md` masih memuat DOCX sebagai sumber historis, sementara plan import aktual membatasinya ke teks/PDF. Revisi ini **tidak** mengimplementasikan atau menghapus DOCX. Sebelum mengubah klaim produk DOCX/schema/model secara luas, klarifikasikan ketidaksinkronan tersebut; jangan memperluas pekerjaan diam-diam.
- Saat implementasi dimulai, tambahkan amendment terarah di bagian import `SPEC.md` untuk R1/R2, evidence, safe day boundaries, dan review; catat bahwa aturan revisi ini menggantikan bagian plan historis yang disebut di atas.

## Existing Behavior

1. `normalizeText()` membersihkan newline/invisible characters, tetapi `parseDocument()` langsung tidak tahan CRLF. Offset hasil `fold()` dipakai memotong teks asli di pembaca waktu/hari.
2. Parser berbasis line/section; konsumsi satu baris dianggap selesai walaupun sebagian faktanya hilang. AI hanya mendapat baris tersisa, tanpa ID aktivitas atau batas evidence target.
3. `quoteHolds()` memakai folded substring global. Quote yang dipilih AI sendiri bisa menghilangkan negasi; quote tempat lain bisa dipakai untuk target yang salah.
4. `segmentsOf()` menghasilkan `sent` dan `plain`, tetapi service memvalidasi `sent` yang memuat penanda engine.
5. Field scalar berulang memakai last-write-wins. Hari yang tidak berurutan tidak menjadi batas baru; aktivitas berikutnya dapat masuk hari sebelumnya.
6. `durationIn()` hanya mengambil satu komponen; waktu akhir rentang tidak memakai AM/PM parser yang sama. ISO date dan tanggal tidak valid bisa hilang tanpa diagnosis.
7. Inline lists, section tanpa bullet, pickup/hotel dan fakta dalam lanjutan baris belum memiliki coverage/mapping yang memadai. Meeting place + URL kehilangan place.
8. Segmen AI dipotong pada batas 20.000 karakter dengan `break`; satu baris panjang dapat menahan semua bagian berikutnya. Output diberi 3.000 token tanpa mempertimbangkan jumlah target.
9. Merge mengganti koleksi yang ditemukan secara keseluruhan. Ini perlu perlindungan agar hasil parsial/ambigu tidak menghapus jadwal atau daftar lama.
10. PDF items hanya menyimpan teks/X/Y/width; rekonstruksi row memakai toleransi Y tetap. Informasi halaman/layout tidak dibawa hingga evidence dan review.

## Required Behavior

### A. Prinsip dan batas scope

- Deterministik mengusulkan fakta yang benar-benar eksplisit; AI membantu unresolved extraction, bukan menjadi sumber kebenaran baru.
- Semua kandidat harus memiliki `sourceId`, `blockId`, span teks, target, metode, dan status. Field tidak boleh masuk draft hanya karena kebetulan kata-katanya ada di dokumen.
- Status minimum: `accepted`, `ambiguous`, `conflict`, `unsupported`, `omitted`. `missing` adalah keadaan field tanpa kandidat, bukan hasil ekstraksi palsu.
- Konflik/ambiguitas tidak teratasi → field baru kosong; pada overwrite nilai lama dipertahankan dan dijelaskan sebagai nilai lama, bukan dianggap berasal dari sumber baru.
- Kandidat yang ditolak tetap dapat ditinjau secara privat. Jangan tampilkan source text/kutipan di public HTML, snapshot published, OG data, atau telemetry.
- Batas existing tetap: 10 MB/PDF, 60 halaman, 120.000 code point teks, worker extraction 20 detik, maksimal 14 hari dan 30 aktivitas/hari. Melebihi kapasitas harus terlihat, tidak sukses penuh diam-diam.
- Tidak ada perubahan canonical itinerary, renderer, kuota writing AI, deployment, Laravel/n8n, OCR, atau dependencies baru tanpa keputusan tambahan.

### B. Representasi sumber dan coverage

Gunakan model internal berversi, terpisah dari canonical itinerary:

```text
SourceDocument { version, sourceId, sourceHash, kind, normalizedText,
                 pages?, blocks[], diagnostics[] }
SourceBlock { blockId, pageNumber?, kind, readingOrder, text, spans,
              bounds?, parentBlockId?, daySourceId?, targetSourceId? }
Candidate { candidateId, targetPath, targetSourceId?, sourceRefs[],
            rawValue, proposedValue, method, ruleId?, status, reasonCode? }
SourceRef { blockId, startUtf16, endUtf16, quote }
```

- Offset internal memakai UTF-16 secara konsisten dengan JS slicing; limit publik tetap code point. Test emoji, combining marks, CRLF, tab, dan NFC membuktikan kutipan selalu cocok terhadap representasi tersimpan.
- Jadikan normalisasi idempotent di entry parser. Pertahankan raw/extracted text serta mapping ke normalized source bila offset berubah. Dilarang memotong raw string dengan offset hasil `fold()`.
- Source bounds untuk PDF memakai page number dan koordinat yang dinormalisasi berdasarkan rotasi halaman. Untuk teks gunakan line/column yang diturunkan dari span.
- Coverage dihitung per span/blok: mapped, unresolved, excluded-with-reason. Semua konten substantif harus masuk salah satu kategori; hilangnya informasi harus memiliki diagnosis.
- Field parsial tidak membuat seluruh baris dianggap selesai. Contoh `Titik kumpul: Hotel Melati <URL>` mengekstrak place dan URL, bukan memilih salah satunya.
- Nilai turunan/default/hasil pilihan manual diberi asal berbeda; jangan mengklaim semuanya merupakan kutipan sumber literal.

### C. Parser deterministik

1. **Struktur teks:** dukung Markdown heading/bold pembungkus, bullet/numbered list, tabular text, inline `Label: item`, dan daftar multiline tanpa bullet jika batas section jelas. Jangan memecah koma di nama tempat tanpa aturan section yang aman.
2. **Hari:** setiap marker dikenali sebagai batas, termasuk lompat/ulang/tidak urut. Marker invalid dan aktivitas sesudahnya masuk blok unresolved, bukan diwariskan ke hari sebelumnya. Missing day markers pada `multi_day` tidak boleh menghasilkan jadwal tebakan. Mode single-day dengan lebih dari satu hari harus melaporkan cakupan yang tidak diimpor.
3. **Waktu:** satu grammar untuk awal/akhir rentang; AM/PM, WIB/WITA/WIT, `pukul`, tanda rentang umum. Pertahankan timezone sebagai konteks privat; tidak konversi timezone tanpa fakta. Jam ambigu kosong + kandidat. Lintas tengah malam hanya menghasilkan durasi jika pergantian hari eksplisit; selain itu minta review.
4. **Durasi:** gabungan `1 jam 30 menit`, `1h 30m`, desimal, range versus explicit duration yang berbeda → konflik, bukan salah satu dipilih diam-diam. Jangan merampas angka dari jumlah peserta/harga/nomor telepon.
5. **Tanggal:** ISO `YYYY-MM-DD`, nama bulan id/en, numerik yang jelas, leap year, invalid date. `03/04/2026` tetap kandidat ambigu kecuali format dinyatakan eksplisit oleh pengguna/sumber; bahasa saja bukan bukti. Tidak mengarang tahun.
6. **Fakta/section:** meeting place+URL; guide/contact sesuai section; pickup offered/area/time/dropoff; hotel/meals/transfer per hari hanya bila tertulis; aktivitas dengan lanjutan deskripsi dan tips. Mode-inapplicable values tidak dipaksa masuk field lain.
7. **Duplikat:** nilai sama boleh deduplicate dengan beberapa sourceRefs; nilai berbeda menjadi konflik. Jangan menimpa scalar dengan occurrence terakhir.
8. **Klasifikasi:** `kind` dari keyword adalah rule-derived suggestion. Keyword bertabrakan atau tanpa dukungan kuat diberi diagnosis; fallback existing bukan fakta dari sumber.
9. **Batas:** overflow hari/aktivitas/list dan pemotongan field menghasilkan daftar omission terstruktur yang bisa ditinjau; tidak menyatakan consumed sukses jika nilai tidak disimpan.

### D. PDF berteks yang sadar layout

- Pertahankan metadata page, koordinat, dimensi/font/rotation yang tersedia dari API `unpdf`/pdf.js saat ini. Verifikasi API terpasang sebelum mendesain adapter; jangan mengasumsikan properti tersedia.
- Jalankan ekstraksi dan rekonstruksi layout di worker dengan deadline existing. Timeout/error/oversize tidak meninggalkan worker atau file orphan.
- Deteksi region/kolom sebelum urutan baca; jangan gabungkan teks dua kolom hanya karena posisi Y sama. Ambiguous reading order menjadi review, bukan paragraf campur.
- Tabel jadwal: petakan sel waktu/aktivitas/durasi/notes menggunakan batas kolom dan asosiasi row. Header tabel bukan aktivitas; merged cell dan row lintas halaman hanya dilanjutkan bila hubungan struktural jelas.
- Wrapped lines disatukan hanya dalam sel/blok yang sama. Jadwal yang berlanjut ke halaman berikutnya mempertahankan batas hari; heading baru mengakhiri carry-over.
- Header/footer berulang dan nomor halaman dideteksi dari posisi + pola pengulangan; catat exclusion. Jangan menghapus teks karena berulang saja (misalnya kegiatan sarapan setiap hari).
- PDF scan penuh ditolak. PDF campuran/sparse text: deteksi halaman tanpa usable text layer; laporkan nomor halaman dan coverage tidak lengkap. Tidak boleh menyebut seluruh dokumen terbaca hanya karena rata-rata karakter melewati threshold. Halaman kosong dekoratif tidak otomatis dianggap scan.
- Dokumen terenkripsi/rusak/rotasi tak tertangani mendapat pesan terarah. Layout tak didukung bisa menghasilkan draft parsial **hanya jika** bagian yang aman teridentifikasi dan omission terlihat.
- Source evidence harus bisa dilacak ke halaman/blok; tidak perlu menyimpan original PDF bytes atau menambah PDF viewer. UI dapat menampilkan halaman dan kutipan hasil ekstraksi.

### E. AI extraction dan evidence guards

- Kirim unresolved blocks dengan ID stabil, target ID, batas konteks read-only, mode, allowed paths, dan field yang sudah accepted. Context bukan izin mengekstrak sembarang substring dari seluruh dokumen.
- Gunakan schema per mode: output mereferensikan `candidateId/targetSourceId` dan sourceRefs. Scalar teks yang jelas dapat diisi deterministik tanpa AI, termasuk summary/policies yang eksplisit sebagai section.
- Guard memeriksa: schema → allowed target/path → source/hash/span valid → quote sama dengan teks source → relasi source-target → batas kalimat/butir → kelengkapan negasi/qualifier → normalizer field → konflik.
- Untuk kalimat/kebijakan/deskripsi, kutipan harus unit sumber utuh, bukan substring yang dapat membuang `tidak`, `kecuali`, syarat usia, tanggal berlaku, atau klausa pengecualian. Jika batas kalimat tidak meyakinkan, tandai review. Jangan mengklaim semantic equivalence hanya dari regex negasi.
- Untuk nama/area, part-span dibolehkan hanya di blok entity yang sama. Deskripsi pantai tidak boleh dipakai untuk museum meskipun quote valid secara global.
- ID tidak dikenal, target duplikat, source marker engine, instruction text, dan response yang mencoba mengganti fakta accepted ditolak dengan code terstruktur.
- Angka/jam/durasi yang diusulkan AI wajib diperiksa parser deterministik terhadap span asal; AI tidak dapat menyelesaikan ambiguitas melalui asumsi. Tidak menambah harga/jam buka/klaim keselamatan dari luar dokumen.
- Gunakan structured `response_format` hanya bila model/route mendukung; tetap lakukan validasi server. Jika tidak, JSON instructions + AJV tetap wajib.
- Repair retry menyertakan error validasi ringkas dan target yang gagal, tanpa memanggil ulang seluruh dokumen. Maksimal dua attempt per batch; partial valid candidates dipertahankan, malformed candidates dilaporkan.
- Provider response menyertakan finish reason agar output terpotong dibedakan dari JSON invalid. Tidak boleh fallback diam-diam lalu mengklaim AI sukses.

### F. Chunking, cost, dan operasi

- Ganti prefix-only truncation dengan batching berurutan berdasarkan blok/hari/target. Batas 20.000 karakter dihitung atas serialized batch termasuk konteks/hints, bukan plain text saja.
- Blok besar dipecah pada kalimat/span yang aman; satu blok oversize tidak menahan semua blok berikutnya. Chunk overlap hanya untuk konteks, bukan menduplikasi extraction target.
- Default teknis: maksimum 8 batch sekuensial/import, maksimum 2 attempt/batch, timeout 120 detik/call, total wall-clock AI phase maksimum 180 detik dengan abort propagation. Saat deadline/cap tercapai, jangan mulai call berikutnya; sisa blok menjadi omission/review.
- Maksimal output per call tetap 3.000 token pada revisi ini; batch target harus disesuaikan agar feasible. Jika output terpotong, pecah target tersisa dalam cap yang sama; jangan menambah retry tak terbatas atau mengubah model secara diam-diam.
- Catat model aktual, batch/attempt count, status, input/output tokens dan cost tiap call. Biaya unknown harus `null/unknown`, tidak otomatis nol; seluruh biaya attempt tetap dicatat walau draft gagal validasi atau konflik revisi.
- Replay tidak mengirim ulang AI; fingerprint mencakup source/hash, target, mode, revision, language, dan parser/extractor version. Same operation ID + payload berbeda → conflict. Report replay harus mereferensikan hasil revision yang benar, tidak menampilkan latest draft seolah hasil awal.
- Staged artifacts + commit operasi/draft secara transaksional atau recovery-safe mengikuti pola store; interrupted run tidak membayar atau menulis ulang diam-diam. Cancel tidak membatalkan fakta bahwa provider mungkin sudah mengenakan biaya.

### G. Merge aman dan review eksplisit

- Pertahankan accepted deterministic facts; AI tidak boleh menimpanya. Konflik baru tidak menghapus nilai lama pada overwrite.
- Sebelum mengganti `days`, `places`, atau list sebagai satu koleksi, pastikan sumber koleksi lengkap dan tidak ada unresolved member/overflow/layout ambiguity. Jika parsial, pertahankan koleksi lama dan tampilkan kandidat; jangan mencampur jadwal lama/baru otomatis.
- Field baru tanpa sumber tetap kosong. Source/default/manual dibedakan. Mode, cover, photo, color theme, dan unrelated draft fields tidak diubah.
- Review menampilkan kandidat bernomor, nilai lama jika overwrite, kutipan, halaman/baris, alasan, serta aksi pilih/edit/abaikan. Pemilihan eksplisit memakai expectedRevision; stale review mendapat 409 dan tidak diterapkan ke revision baru.
- Revalidasi kandidat dan evidence di server saat dipilih; jangan percaya status accepted dari browser. Manual edit dicatat sebagai manual, bukan quote-verified.
- Publish tetap memakai validator existing; unresolved review tidak otomatis memblokir semua draft, tetapi tidak diubah menjadi nilai palsu demi lolos publish. Jadwal yang belum diverifikasi harus mempertahankan warning existing.
- Tidak memperluas badge provenance ke seluruh editor. Report ringkas tetap: terisi, perlu review, belum terbaca/tidak dimasukkan, wajib kosong, biaya, sumber, undo.

## Proposed Changes

### Entry gate — sebelum implementasi

1. Baca ulang `RULES.md`, plan ini, `SPEC.md`, status/tahap active di `TODOS.md`, dan working tree. Perubahan pemisahan model dari task sebelumnya harus dipertahankan.
2. Cross-check completion evidence CP030/CP031 beserta dependency yang diwajibkan. Audit sebelumnya menemukan stage/review logs tidak selalu disertai completion log historis. Jika log wajib hilang, **berhenti** untuk merekonsiliasi dari bukti atau memperbaiki status; jangan mengarang test historis.
3. CP032 dan checkpoint lain sudah memiliki status in_progress historis. Jangan otomatis membuka pekerjaan paralel atau mengubah status milik pekerjaan lain; konfirmasikan serial execution gate sebelum mulai.
4. Catat baseline failures CRLF dan fixture PDF; generator harus bisa dijalankan pada clean checkout. Jangan melonggarkan assertion agar baseline tampak hijau.
5. Dokumen ini baru plan. Tidak memasang dependency, menjalankan migration, mengubah runtime/credential, melakukan live provider calls, atau menandai CP completed pada tahap perencanaan.

### Tahap 1 — CP030: source model, deterministik dan PDF

- Implementasi A–D, fixtures dan regression parser/layout; dry-run API mengembalikan source blocks, candidates, coverage dan diagnostics tanpa draft write.
- Buat red regression tests untuk F01/F02/F06–F12/F15 sebelum memperbaikinya; F03–F05 mendapatkan scaffold evidence-target untuk tahap 2.
- Tambah source metadata private sidecar berversi jika perlu, ditulis atomik dan ikut retention/delete. Jangan menyimpan original PDF.
- Review terhadap plan → Test → Revise hingga gate bersih. Completion/revision log CP030 wajib sebelum tahap 2.

### Tahap 2 — CP031: evidence/AI batching/merge/persistence

- Implementasi E–G backend: schema mode-specific, source-target guards, batch accounting, conflict/partial-collection protection, replay fingerprint, review resolution dan undo.
- Tambah migration additive **hanya bila** diperlukan untuk private provenance/report v2. Pilih nomor berikutnya setelah membaca daftar migration saat eksekusi; tidak mengubah migration 6/7 yang sudah applied.
- Report private version 2 menyimpan candidate/evidence/decisions dalam metadata import, bukan canonical published data. Legacy report tanpa evidence tetap bisa dibaca; jangan membangun provenance historis palsu.
- Review → Test → Revise. Log CP031 revision diselesaikan sebelum tahap 3; preserve model-routing revision dan hasilnya.

### Tahap 3 — CP032: explicit review UI dan integrasi

- Tambah panel konflik/omission, navigasi sumber halaman/baris, pilihan kandidat/manual edit, revision-safe apply, progress/cost yang sesuai batching.
- Update API client/contracts serta docs import. Data lama tetap ditampilkan tanpa crash dan ditandai bahwa evidence tidak tersedia.
- Jalankan E2E teks/PDF semua mode, new/overwrite/review/undo/reload; inspeksi screenshot 390px dan 1280px.
- Setelah regression/release gates bersih, tulis log CP032 dan chapter review. Tidak auto-publish, commit, push atau deploy tanpa permintaan terpisah.

## Impact and Regression Risk

| Area | Risiko | Mitigasi |
|---|---|---|
| Span/normalisasi | Offset salah pada emoji/CRLF/Unicode | Golden source-span tests, raw→normalized mapping, idempotence tests. |
| PDF layout | Heuristik menggabung kolom atau menghapus isi penting | Fixtures visual + expected block order; ambiguous layouts tidak auto-accepted. |
| Guard lebih ketat | Recall turun meskipun false claims turun | Ukur precision dan coverage terpisah; user review untuk kandidat aman, jangan melonggarkan evidence. |
| Overwrite | Koleksi lama hilang karena hasil parsial | Whole-collection completeness gate, confirmation/diff, expectedRevision dan undo. |
| Batching | Cost/latency naik, duplicate extraction | Zero-call deterministic path, stable IDs, batch/deadline cap, call ledger dan replay tests. |
| Private evidence | Source bocor via response/log/publish | Workspace-scoped private APIs, retention-linked deletion, negative public-output tests. |
| Compatibility | Report lama/sidecar lama tidak terbaca | Versioned adapters, additive migration + backup, old/new DB tests. |

### Files and interfaces affected

- `src/server/import/{intake,normalize,complete,merge,service,routes,schema,retention}.ts`.
- `src/server/import/parse/{lines,text,days,time,activity,extract}.ts`.
- New internal modules dipisah menurut fungsi: source/evidence, PDF layout, candidate resolution, batching; hindari menumpuk semua logic di `service.ts`.
- `src/server/ai/provider.ts` untuk extract request/response metadata dan structured output; `generate()` dan pemisahan model tidak diubah semantiknya.
- `src/server/store.ts` hanya jika migration/transaction private metadata diperlukan.
- `src/api/client.ts`, `src/editor/import/{ImportScreen,ImportReport,copy}.tsx`/`.ts` sesuai file aktual, integrasi editor terkait bila diperlukan.
- `config/web/import-headings.json`, `config/web/import-completion.schema.json`; canonical schema tidak dirombak.
- `tests/web/import-*.test.ts`, model routing/provider/store/editor/publication tests yang terkait; tambah focused evidence/layout/conflict/batch tests.
- `scripts/web/{make-import-fixtures,verify-import,verify-import-five-live}.ts`, script test fixture setup, `package.json` bila perlu command repeatable.
- `docs/editor-ai-api-contract.md`, `docs/standalone-development.md`, amendment import `SPEC.md`, `TODOS.md`, stage/completion/review logs.
- Tidak ada workflow n8n, credential mutation, production database atau deployment.

## Verification Plan

### Audit-to-test traceability

| ID | Bug/edge case | Expected acceptance |
|---|---|---|
| F01 | CRLF/LF, tab, zero-width, Unicode, doubled space | Hasil semantik sama; offset/quote tepat; `08:00   WIB Museum` tidak menjadi `IB Museum`. |
| F02 | Hari 1→3, duplikat, urut terbalik, missing markers | Tidak ada aktivitas menempel ke hari sebelumnya; blok unresolved tercatat dan bisa ditinjau. |
| F03 | `Tidak termasuk X` → AI quote `termasuk X` | Ditolak/review; qualifier dan negasi tidak boleh hilang meski substring valid. Uji juga `kecuali`, `hanya`, kondisi usia. |
| F04 | Engine marker `[summary]` dikutip AI | Tidak tersimpan sebagai evidence/text; service menggunakan plain source. Literal bracket asli di sumber tidak dibuang secara global. |
| F05 | Deskripsi pantai ke museum; judul sama pada dua hari | Salah target ditolak; ID hari/aktivitas membedakan judul identik. Quote dari entity lain tidak lolos. |
| F06 | AM/PM endpoints, compound duration, midnight, conflicting duration | 13:00–15:00 = 120 menit; 1j30m = 90; midnight ambigu tetap null/review; tidak ada `pm` tersisa di judul. |
| F07 | ISO, leap day, invalid date, missing year, ambiguous DD/MM | ISO diterima; invalid/missing-year dilaporkan; tanggal ambigu butuh keputusan eksplisit. |
| F08 | Inline list, no-bullet list, Markdown, wrapped descriptions | Field terbaca bila struktur jelas; sisa span tidak hilang; tidak mengubah comma-containing names sembarangan. |
| F09 | Meeting place+URL, guide/contact, pickup/hotel/meals | Semua fakta eksplisit yang applicable terpetakan dan terkait hari/section benar; nilai inapplicable dilaporkan. |
| F10 | Scalar konflik/duplikat | Nilai sama dideduplikasi; berbeda tampil sebagai kandidat, tidak last-write-wins. |
| F11 | Baris >20k di awal; dokumen panjang; output truncated | Blok berikutnya tetap diproses atau omission terukur; batching bounded; token/cost seluruh attempt tercatat. |
| F12 | PDF tabel/dua kolom/wrapped row/header-footer/lintas halaman | Expected reading order/sel/hari benar; footers bukan aktivitas; ambiguous layout tidak diisi otomatis. |
| F13 | Partial overwrite + unresolved member | Koleksi lama tidak terhapus; pilihan explicit revision-safe; undo mengembalikan nilai/review state yang sesuai. |
| F14 | Timeout/429/auth/bad JSON/unknown cost/restart/replay mismatch | Bounded calls; no duplicate charge/write; usage unknown bukan nol; conflicting replay mendapat 409. |
| F15 | Scan/sparse/mixed/corrupt/encrypted/oversize PDF | Reject penuh atau partial+coverage sesuai kondisi; halaman tidak terbaca terlihat; worker dibersihkan. |

### Fixture strategy dan metrik

- Semua fixtures sintetis; tidak ada dokumen pelanggan/key di repo. Baseline minimum: **40 kasus teks**, **12 layout PDF berteks** (termasuk kombinasi layout), dan rejection fixtures existing + mixed/sparse/blank-page cases. Bukan sekadar menggandakan fixture lewat variasi whitespace.
- Golden manifest per fixture berisi expected fields, source spans, mapping halaman/target, expected unresolved candidates dan omission. Negatives penting harus punya assertion server/API, tidak hanya mock utility.
- Siapkan PDF reproducible dengan generator yang disimpan Git dan existing Puppeteer; keluaran PDF di direktori generated terisolasi. Karena `*.pdf` di-ignore, fresh checkout harus menjalankan generation sebelum suite PDF. Jangan mengubah file teks input atau menambahkan binary secara paksa untuk menyembunyikan setup gap.
- Ukur accepted-field precision, explicit-fact coverage, wrong-day/wrong-target count, negation/qualifier violations, unresolved count, latency dan call/cost. Claim accuracy hanya pada corpus berlabel ini, bukan persentase universal.
- Gate: **0 false accepted fields** dan **100% expected explicit supported fields** pada golden corpus; kasus ambiguity yang sengaja dibuat harus menghasilkan expected review, bukan dihitung missing extraction yang harus dipaksa filled.
- Mutation tests minimum: guard negasi/span dilewati, source-target binding dihapus, day boundary diabaikan, koleksi parsial diizinkan replace, atau replay fingerprint dihapus → masing-masing harus membuat regression test gagal.

### Commands/gates

Jalankan dengan Node >=24; pada Windows gunakan `npm.cmd` bila `npm.ps1` diblokir. Catat command aktual dan output; jangan mengubah execution policy/global Node hanya untuk test.

1. Fixture generation terisolasi, kemudian `npm run test:web-import` dan focused tests tambahan tahap terkait.
2. `npm run test:web-store`, `npm run test:web-api`, `npm run test:web-ai`, `npm run test:web-editor`, `npm run test:web-preview`, `npm run test:web-publication`.
3. `npm run check:web-types`, `npm run typecheck:web-contracts-v2`, `npm run typecheck:web-app`, `npm run typecheck:web-server`.
4. `npm run build:brochure-css`, `npm run build:web-app`, lalu `npm run verify:web-import` setelah harness diperbarui untuk lima mode dan review flows.
5. Regression public-data-leak check; rendered visual verification untuk PDF fixtures dan UI/report/sumber halaman, screenshot dibuka dan diperiksa, bukan hanya dibuat. Jika browser gate merender public HTML, inspeksi hasilnya juga.
6. `npm run build:web-release`, `npm run validate:web-release`, `git diff --check`; release packaging tidak diubah di luar CP yang sesuai.
7. Windows dan Linux clean-checkout test/import fixture generation. Jika salah satu environment tidak tersedia, log sebagai verification blocked; tidak klaim lintas platform lulus.
8. Live smoke setelah deterministic/mocked gates hijau: opt-in **baru**, 5 format teks + 3 layout PDF sintetis representatif, model parsing tetap Claude. Laporkan accepted facts versus expected, omissions, calls/token/cost; jangan menyamakan HTTP 201 dengan extraction sukses. **Plan ini tidak mengotorisasi paid run baru**; mintakan izin saat gate tersebut siap.

Review dilakukan **sebelum** Test pada setiap tahap; setelah perbaikan ulangi Review/Test. Tidak melanjutkan CP berikutnya ketika finding wajib unresolved atau log tahap sebelumnya belum tersedia.

## Updated Acceptance Criteria

1. F01–F15 memiliki regression tests yang lulus; ketiga API adverse-output reproductions dari audit tidak lagi menghasilkan field salah yang tersimpan.
2. Teks/PDF berteks menghasilkan candidate/evidence yang dapat dilacak ke sumber dan target; tidak ada offset fiktif atau kutipan engine marker.
3. Scan tetap ditolak tanpa OCR; PDF campuran/ambiguous layout tidak dipresentasikan sebagai pembacaan lengkap. Tabel/kolom/continuation supported fixtures benar secara visual dan data.
4. Hari, tanggal, jam, durasi dan scalar konflik tidak ditebak. User dapat meninjau kandidat dengan sumber/alasan dan menyelesaikannya secara revision-safe.
5. Deterministic-only structured fixtures memakai **0 AI calls**. AI tidak menimpa accepted deterministic facts atau menempelkan kutipan target lain.
6. Tidak ada data hilang diam-diam pada parsing, chunking, cap, fit-to-limits atau merge. Partial collection tidak menghapus koleksi lama pada overwrite.
7. Existing new/overwrite/replay/undo/restart behavior aman, biaya attempt tercatat termasuk failure; writing AI model/quota/ledger tidak berubah.
8. Legacy draft/report terbaca; metadata evidence privat mengikuti workspace, retention, backup/restore dan deletion. Tidak ada evidence di public output/log umum.
9. Golden corpus memenuhi gate precision/coverage, dan test/browse/typecheck/build/release gates lulus dengan bukti nyata. Tidak ada klaim OCR, universal PDF support, atau akurasi general dari corpus kecil.
10. Per CP ada completion log/revision section faktual, TODOS selaras, dan chapter review diterima sebelum menyatakan hardening selesai. Plan ini sendiri tidak memenuhi completion criteria tersebut.

## Rollback

- Gunakan perubahan additive/versioned dan backup DB sebelum migration baru; simpan source metadata lama sampai kompatibilitas terverifikasi. Uji backup/restore di dataDir sementara.
- Jika rollback diperlukan, hentikan import baru, pertahankan draft/ledger/source privat yang sudah ada, dan disable entry import lebih aman daripada mengaktifkan kembali guard rentan. Jangan otomatis downgrade ke parser lama yang diketahui menerima false claims.
- Jangan menghapus migration yang sudah applied atau menjalankan downgrade database destruktif. Restore snapshot DB+sidecars yang konsisten hanya dengan persetujuan operator dan scope yang jelas.
- Revert hanya artefak revisi ini; pertahankan perubahan pengguna, pemisahan model, kredensial lokal, draft/publication dan plan/log historis. Tidak ada `git reset --hard`, broad recursive delete, commit/push/deploy otomatis.
