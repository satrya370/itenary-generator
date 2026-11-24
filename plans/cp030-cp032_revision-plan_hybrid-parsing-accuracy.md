# Revision plan — akurasi hybrid parsing per CP

Tanggal: 2026-11-23  
Status: **CP030 focused inline-detail subplan completed; broader CP031/CP032 scope proposed / not started**  
Basis review: `logs/cp030-cp032_review_hybrid-parsing-accuracy_2026-11-23.md`.

## Tujuan dan aturan hasil

Hybrid = deterministic extraction untuk fakta terstruktur + AI untuk detail/teks ambigu, keduanya dibatasi bukti dan konteks. Sasaran bukan sekadar request 201 atau semua field nonkosong: informasi harus berada pada field/aktivitas yang tepat, sementara yang belum jelas terlihat untuk review.

- Pertahankan draft pengguna, edit lokal, revision guard, retention, dan undo.
- Jangan mengarang deskripsi, jam, harga, durasi, atau ketentuan demi mengisi field wajib.
- Tidak auto-publish. Tidak commit/push/deploy dalam pelaksanaan plan tanpa permintaan.
- Model impor yang diminta: `anthropic/claude-haiku-5.5` via OpenRouter. Writing AI tetap dibedakan dari import AI.
- Regresi memakai mock untuk determinisme; smoke live bounded memakai key yang sudah dikonfigurasi, hanya pada data uji terisolasi. Jangan menjalankan loop paid untuk mengejar output yang terlihat bagus.
- Status CP historis dan temuan baru harus dibedakan. CP035 home-view/screenshot lama bukan bagian revision ini.

## Matriks ownership

| CP | Fokus revisi | Temuan |
|---|---|---|
| CP030 — Import Source Intake | representasi unit/span, boundary, parsing detail inline, paritas teks/PDF | H04, fondasi H03/H06 |
| CP031 — AI Structured Itinerary Extraction | semantik/owner, completion validation, final coverage, overwrite, model diagnostics | H01/H02/H03/H05/H06/H07 |
| CP032 — Import Review Editor and E2E | review unresolved/misrouting, status akurasi, evidence/model UI, E2E dan laporan yang benar | H02/H07 + verifikasi seluruh temuan |

## Fase 0 — Bekukan baseline dan expected mapping

- [ ] Simpan fixture 11 baris dan hasil teredaksi dari review sebagai regression artifacts di repository, bukan hanya temporary directory.
- [ ] Simpan reproduksi H01/H03/H04 sebagai tes yang gagal sebelum perbaikan.
- [ ] Tambahkan expected canonical mapping: uraian kunjungan → description Keraton; pakaian sopan → tip Keraton; ringkasan perjalanan global → summary atau pending review bila konteks tidak cukup. Jangan otomatis menjadikannya closingNote hanya karena berada di akhir file.
- [ ] Catat unknown/ambiguous cases sebagai pending review yang sah, bukan memaksa pilihan model.
- [ ] Tambahkan fixture panjang tiga hari sesuai contoh pengguna, tanpa mengasumsikan setiap field harga/hotel didukung schema. Field tidak didukung wajib terlihat.

**Gate:** baseline kegagalan dapat direproduksi tanpa provider; fixtures tidak memuat key/data pengguna.

## CP030 — source units dan parser yang tidak kehilangan detail

**Disposition 2026-11-23:** focused inline-activity-detail revision completed under `plans/cp030_revision-plan_source-spans-and-inline-activity-details.md`; regression, import gate and server typecheck are recorded in `logs/cp030_completion-log_text-and-pdf-parser.md`. This completes only the bounded inline-detail behavior, not the broader source-unit/span or PDF-layout work listed below. Same-line activity target binding remains CP031. CP031/CP032 sections below remain proposed and unexecuted.

### Pekerjaan

- [ ] Perluas model source unit: stable ID, original text, line/span offsets, page/block bila PDF, section, owner candidates dan deterministic mappings.
- [ ] Pisahkan context-only metadata dari source evidence.
- [ ] Ganti consumed boolean/baris sebagai satu-satunya cakupan dengan partial span mapping; jam terpetakan tidak berarti seluruh detail baris selesai.
- [ ] Tangani judul + uraian/tip dalam satu baris jadwal melalui aturan konservatif. Jika pembagian tidak aman, jadikan kandidat AI/review dengan bukti span utuh.
- [ ] Boundary paragraph/aktivitas/heading menutup unit tanpa keharusan titik; gabungkan wrapped sentences dan qualifier yang masih terkait.
- [ ] Pertahankan PDF layout ambiguity fail-closed. Perubahan jangan menganggap kolom ambigu memiliki urutan pasti.

### Tes wajib

- [ ] Jam tunggal/rentang; 09.00–10.30 tetap 90 menit.
- [ ] Inline title + description pendek (<200 chars), panjang, singkatan/nama bertitik; jangan memotong nama.
- [ ] Deskripsi multiline dengan/tanpa titik, bullet, blank line, heading baru, aktivitas berikutnya.
- [ ] Negasi/pengecualian pada baris lanjutan tetap satu unit dan tidak terpotong.
- [ ] Teks/PDF dengan isi sama menghasilkan source facts/ownership candidates setara; page metadata boleh berbeda.

**Gate CP030:** H04 tidak lagi menghasilkan false-complete coverage; sisa detail tetap dapat ditindaklanjuti; seluruh regresi intake/parser/labels/realistic/templates relevan lulus.

## CP031 — assignment semantik, coverage final, dan AI nyata

### Pekerjaan

- [ ] Payload AI memakai units ber-ID dengan span, section, owner/allowed destinations dan konteks read-only; model mengembalikan source IDs + target/path + quote/value.
- [ ] Server memvalidasi pasangan sumber→target, bukan hanya apakah kutipan ditemukan.
- [ ] Terapkan ownership lokal: kalimat Keraton tidak boleh diam-diam menjadi summary/policies global. Kandidat lintas-lingkup masuk pending review.
- [ ] Terapkan boundary dari CP030 pada whole-unit validation tanpa melemahkan negasi/qualifier.
- [ ] Final mapping ledger sesudah merge dan fit-to-limits: applied, pending-review, rejected, unsupported, omitted, beserta alasan. Proposal accepted tetapi tidak tersimpan tidak boleh dihitung applied.
- [ ] Hitung remaining coverage dan lost/unmapped spans dari input dikurangi output tersimpan; baris yang diabaikan AI tetap muncul.
- [ ] Pisahkan status provider request/batch dari extraction coverage/completeness.
- [ ] Hitung safety overwrite dari final coverage per koleksi. AI-complete boleh memperbarui koleksi yang aman; partial tetap mempertahankan draft lama dengan alasan yang jelas.
- [ ] Hindari konflik/double assignment bukti yang sama tanpa aturan eksplisit; global vs lokal harus tervalidasi.
- [ ] Tambahkan preflight/status khusus import model, serta requested model dan response identity jika tersedia. Jangan menyamakan valid-format key dengan authenticated.
- [ ] Pastikan batas batch, deadline, retry, usage per percobaan, redaksi retention, dan idempotency tidak regresi.

### Tes wajib

- [ ] H01: proposal salah-field dengan quote valid ditolak atau pending-review, bukan diterapkan.
- [ ] H02: AI `{}` / hasil subset / hasil seluruhnya ditolak → remaining units tetap terlihat meski HTTP success.
- [ ] H03: titik vs tanpa titik pada unit yang jelas menghasilkan keputusan assignment setara; qualifier tidak terpotong.
- [ ] H05: overwrite all-resolved vs partial, new vs overwrite, revision conflict, undo dan edit lokal.
- [ ] H06: dua aktivitas bernama sama pada hari berbeda, konteks lintas batch, kalimat penutup setelah aktivitas terakhir; tidak salah owner.
- [ ] H07: writing model tersedia tetapi import model tidak ada, key invalid, auth error, response tanpa model ID. Status harus menyatakan kondisi sebenarnya.
- [ ] Unknown label/field unsupported tetap ada di review, tidak hilang karena model tidak mengusulkan sesuatu.

**Gate CP031:** semua source facts fixture memiliki disposition; assignment salah tidak applied; koleksi parsial tetap aman; usage/provenance sesuai hasil nyata.

## CP032 — review UI, preview, dan acceptance

### Pekerjaan

- [ ] Pisahkan label “AI dipanggil”, “isian terisi”, “informasi belum terpetakan”, dan “siap publish”.
- [ ] Tampilkan pending unit beserta kutipan dan konteks aktivitas/hari, bukan hanya jumlah field wajib kosong.
- [ ] Sediakan keputusan kandidat field/target yang tervalidasi; jangan mengarahkan sumber ambigu ke satu field tanpa review.
- [ ] Tampilkan identitas model impor yang benar dan statusnya secara terpisah dari writing AI; bedakan requested vs actual bila tersedia.
- [ ] Sinkronkan evidence setelah merge/overwrite/clipping dan redaksi retention.
- [ ] Gunakan nama draft/artifact berbeda untuk teks dan PDF, agar bukti preview tidak tertukar.
- [ ] Laporan tes dihasilkan dari JSON hasil, bukan angka yang disalin manual antar kasus.

### E2E dan gate akhir

- [ ] Terminal: intake → parse → apply → baca ulang draft → final coverage untuk teks dan PDF.
- [ ] Assert expected semantic mapping, bukan hanya HTTP/status atau field nonkosong.
- [ ] Bandingkan normalisasi hasil teks/PDF: waktu/judul/owner/detail wajib setara; ambiguous mapping boleh pending dengan alasan konsisten.
- [ ] Uji fixture pendek, itinerary panjang tiga hari, dan kasus kelima mode yang relevan.
- [ ] Smoke live terbatas dengan Haiku 5.5: simpan model/provenance bila tersedia, attempts, token, biaya, coverage. Perbedaan output dicatat sebagai temuan; jangan rerun sampai cocok lalu menyembunyikan kegagalan.
- [ ] Playwright buka **kedua** draft dan preview, cocokkan judul/summary/deskripsi/tip dengan snapshot persisted.
- [ ] Viewport benar-benar disetel 1280px dan 390px; catat dimensi screenshot dan mode Phone/Desktop terpisah. Periksa jadwal di bawah fold, bukan hanya hero.
- [ ] Uji review unresolved → apply → save/reload/preview dan guard race response/conflict yang sudah ada.
- [ ] Jalankan gate import/API/contracts/editor/render/preview yang terdampak, type/schema check, build. Jangan mengklaim Linux lulus tanpa eksekusi.
- [ ] Perbarui completion/review log CP030/031/032 dengan revision scope; sinkronkan TODO yang masih memiliki status historis tidak konsisten tanpa menghapus riwayat.

**Gate CP032 / chapter acceptance:** tidak ada H01–H04 P1/P2 terbuka; H05–H07 direproduksi lalu ditangani; residual informasi tidak hilang; preview sesuai persisted data; laporan mencerminkan angka/viewport/model dan server yang benar. Sumber yang ambigu tetap jujur sebagai review, bukan dianggap sukses penuh.

## Urutan pelaksanaan

1. Baseline reproduksi dan fixture.
2. CP030 source units/spans + parser.
3. CP031 semantic guard + completion ledger + overwrite + import diagnostics.
4. CP032 review UI + E2E + smoke live + visual verification.
5. Review akhir dan disposition setiap H01–H07; catat apa yang belum tercakup.

Tidak perlu memperluas CP035 pada tahap ini: masalah input kustom/home-view sebelumnya memiliki scope dan follow-up tersendiri.
