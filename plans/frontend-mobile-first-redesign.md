# Plan redesign editor: minimalis, ramah pemula, mobile-first

Tanggal: 2026-11-12. Status: arah produk disepakati melalui tanya jawab; plan implementasi untuk ditinjau. Belum diimplementasikan.

## 1. Sasaran dan keputusan pengguna

Pengguna utama: guide/driver wisata, termasuk pengguna awam. Seluruh alur membuat, mengedit di lapangan, import, preview, dan berbagi harus nyaman dari HP.

- Visual minimalis modern, clean; netral dengan aksen teal.
- Beranda terpisah dari editor, termasuk pada desktop.
- Draft tersimpan hanya menampilkan 5 terbaru; tombol **Muat lebih banyak** menambah 5 berikutnya.
- Pilihan buat draft berupa list, bukan grid; tulisan singkat.
- Pembuatan manual dan import berada dalam satu alur: pilih jenis → pilih cara mengisi.
- Editor memiliki 4 langkah; detail opsional dibuka sesuai kebutuhan.
- Penyimpanan otomatis dengan status yang jelas dan pemulihan kesalahan.
- Preview menjadi layar khusus dengan jalan kembali ke editor.
- Fokus perubahan adalah editor.

## 2. Dasar teknis yang diperiksa

- `src/editor/main.tsx`: pengelolaan draft, navigasi, save, import, AI, preview, dan publikasi; saat ini beranda/sidebar dan editor berada dalam satu layout.
- `src/editor/EditorForm.tsx`: komposisi bagian editor.
- `src/editor/sections/ModePicker.tsx`: pilihan jenis itinerary.
- `src/editor/validation.ts`: 8–9 langkah saat ini, pemetaan field ke langkah, dan masalah publikasi.
- `src/api/client.ts`: daftar draft mendukung cursor; operasi preview/publish menggunakan expectedRevision.
- `plans/cp037_brief_create-flow-three-steps.md`: brief yang belum disetujui, memiliki ide alur pembuatan yang beririsan. Plan ini mengambil arah UX yang telah dipilih pengguna; tidak mengesahkan pekerjaan backend/retensi dalam brief tersebut.
- Working tree memiliki perubahan pada `src/editor/import/ImportScreen.tsx`. Baca diff dan koordinasikan saat implementasi agar perubahan yang sudah ada tidak tertimpa.

Penilaian ini berdasarkan source, bukan audit visual browser atau uji pengguna. Jangan menyatakan skor usability, performa, atau tampilan telah terverifikasi.

## 3. Struktur layar dan perjalanan pengguna

### A. Beranda

Urutan: judul aplikasi dan Pengaturan → Buat itinerary → Draft tersimpan.

Pilihan jenis tampil sebagai empat baris dengan seluruh baris dapat ditekan:

- Setengah hari
- Sehari penuh
- Beberapa hari
- Panduan destinasi

Gunakan ikon sederhana bila ikon yang sesuai sudah tersedia, label singkat, indikator pilihan, dan panah seperlunya. Hindari paragraf penjelasan berulang. Jenis tetap dipetakan ke empat mode schema yang ada.

Draft tampil sebagai list: judul, destinasi bila tersedia, waktu perubahan, dan status singkat. Judul boleh dua baris; informasi tambahan tidak boleh mendesak judul keluar layar. Jangan menampilkan ID atau revisi sebagai informasi utama.

**Muat lebih banyak:** tambah 5 baris per klik; cegah klik ganda, tampilkan loading dan retry bila gagal, hilangkan tombol ketika habis. Gunakan cursor API yang ada dengan buffer FE bila ukuran halaman API lebih dari 5. Dedup berdasarkan ID. Verifikasi urutan API sebelum menjanjikan urutan terbaru global; menyortir satu halaman saja tidak cukup. Jika API tidak mendukung urutan yang dibutuhkan, ajukan perubahan backend terpisah.

Empty state: “Belum ada itinerary” dengan ajakan membuat. Refresh list setelah save tidak mereset jumlah item yang sudah dibuka atau mengganggu input editor.

### B. Pembuatan: jenis → cara mengisi

1. Pilih jenis melalui list di beranda.
2. Pilih **Isi sendiri** atau **Dari teks/PDF**.
3. Manual membuat satu draft saat pengguna menegaskan pilihan, lalu membuka editor. Import membuka input sumber dengan jenis yang sudah dipilih, menampilkan hasil untuk ditinjau, lalu mengikuti mekanisme apply import yang ada.

Jangan membuat draft kosong hanya karena pengguna memilih jenis atau menekan Kembali. Cegah pembuatan ganda saat tombol ditekan berulang. Tombol kembali mempertahankan pilihan dan sumber import selama sesi. Jangan meminta jenis dua kali. Keadaan import mencakup membaca, memproses, hasil parsial, gagal, coba lagi, dan pembatalan sesuai kemampuan API yang tersedia; jangan menjanjikan pembatalan server yang belum didukung.

### C. Editor empat langkah

| Langkah | Isi | Perilaku |
|---|---|---|
| Info perjalanan | Judul, destinasi, bahasa, tanggal, waktu, titik temu/penjemputan sesuai mode | Isian utama tampil; bagian tidak relevan untuk mode disembunyikan |
| Susun perjalanan | Ringkasan, hari dan aktivitas atau daftar tempat | Fokus pada satu hari/bagian terbuka; tambah aktivitas jelas; pindah urutan juga tersedia lewat tombol |
| Detail & tampilan | Guide, cover, tema, informasi praktis, kebijakan, penutup | Bagian tambahan dapat dibuka; nilai yang sudah terisi terlihat dalam ringkasan |
| Periksa & bagikan | Ringkasan kelengkapan, tautan ke masalah, lihat hasil, publikasi dan berbagi | Validasi publikasi lengkap tetap berlaku; tampilkan tindakan berikutnya yang jelas |

Bantuan AI berada dekat konten yang dibantu. Pengguna dapat menyelesaikan itinerary manual tanpa konfigurasi AI. Saran tetap ditinjau sebelum diterapkan; pertahankan perlindungan saran usang dan bahasa yang sudah ada.

Detail yang sudah berisi tidak boleh tersembunyi tanpa indikator. Kesalahan pada bagian tertutup otomatis membuka bagian dan memfokuskan field saat dipilih. Jangan menjadikan field wajib opsional hanya untuk memperpendek formulir.

### D. Preview dan berbagi

Layar khusus: tombol **Kembali mengedit**, judul, hasil preview, dan aksi sesuai status. Kembali mempertahankan langkah, data, dan posisi yang relevan. Pada HP hasil menggunakan lebar yang tersedia tanpa frame desktop yang mengecilkan teks.

Sebelum preview, tunggu antrean save selesai dan gunakan revision terbaru. Gagal menyimpan harus menghasilkan pesan dan pilihan coba lagi, bukan preview yang seolah-olah sudah mutakhir.

Publikasi tetap tindakan eksplisit. Autosave tidak memperbarui halaman publik otomatis. Bedakan “Perubahan tersimpan” dengan “Perubahan belum dibagikan”. Publish menunggu save, menggunakan revision tepat, dan mempertahankan mekanisme operationId/retry yang ada. Jika pengguna mengedit selama publish, tandai bahwa versi publik belum memuat perubahan terbaru.

Bagikan menggunakan Web Share API bila tersedia dan salin tautan sebagai fallback. Jika clipboard gagal, tampilkan tautan yang dapat disalin manual. Gunakan hanya tautan publik yang valid; preview tidak diperlakukan sebagai tautan publik.

## 4. Spesifikasi visual dan mobile

- Tailwind CSS v4; gunakan token desain yang sudah ada bila tersedia. Tidak menambah dependency.
- Latar netral terang, permukaan putih, teks slate gelap, aksen teal untuk aksi utama dan keadaan aktif. Warna status harus disertai teks/ikon.
- Gunakan font sans yang sudah tersedia. Dasar input 16 px; body 14–16 px; judul 20–24 px. Batasi variasi bobot dan ukuran.
- Skala spacing 4/8/12/16/24/32 px. Gutter HP 16 px; lebar konten formulir desktop sekitar 720–800 px.
- List memakai divider tipis; hindari kartu bertumpuk dan bayangan pada setiap blok. Border radius konsisten 8–12 px.
- Target sentuh minimal 44 × 44 px. Label selalu terlihat; placeholder hanya contoh singkat, bukan pengganti label.
- HP: header ringkas, “Langkah 2 dari 4” dan nama langkah, tombol untuk berpindah langkah. Desktop boleh menampilkan empat langkah horizontal.
- Footer editor berisi Kembali/Lanjut dan status autosave yang ringkas. Perhitungkan safe-area bawah, keyboard virtual, padding akhir halaman, dan zoom agar footer tidak menutup field atau error.
- Navigasi hari menggunakan pemilih berlabel; jangan bergantung pada deretan tab kecil atau drag-and-drop.
- Fokus keyboard terlihat; hover/focus/active/disabled konsisten. Dialog mengelola fokus dan mengembalikannya saat ditutup. Animasi singkat mengikuti reduced-motion.
- Kontras teks normal minimal 4.5:1. Hindari overflow horizontal pada lebar 320, 360, 390, dan 768 px; verifikasi desktop 1280 px.

## 5. Autosave: kontrak perilaku

1. Edit memperbarui state lokal seketika. Setelah sekitar 1 detik tanpa pengetikan, simpan snapshot jika berubah dan lolos validasi draft yang ada.
2. Maksimal satu save aktif per draft. Edit baru selama request berjalan masuk sebagai snapshot terbaru untuk save berikutnya.
3. Respons save memperbarui revision yang diketahui, tetapi tidak menimpa edit lokal yang lebih baru. Gunakan generation/token dan ID draft untuk mengabaikan respons usang.
4. Status: belum tersimpan → menyimpan → tersimpan; kegagalan menampilkan “Belum tersimpan” dan **Coba lagi**. Draft tidak valid tetap dapat diedit dan menampilkan alasan konkret.
5. Koneksi putus tidak menghilangkan state di memori. Jangan mengklaim offline support atau ketahanan reload sebelum mekanisme pemulihan persisten dirancang dan disetujui.
6. Konflik revision menghentikan auto-retry; pertahankan perubahan lokal dan tawarkan memuat versi terbaru dengan konfirmasi kehilangan edit. Jangan menimpa versi server secara diam-diam.
7. Pindah draft/keluar editor menunggu save bila memungkinkan. Jika gagal, pengguna memilih tetap mengedit atau meninggalkan perubahan secara eksplisit. beforeunload hanya perlindungan tambahan, bukan jaminan pada browser mobile.
8. Preview, publish, AI, dan apply/undo import harus berkoordinasi dengan antrean save dan memakai revision terbaru. Pembatalan timer, unmount, pergantian draft, dan respons terlambat diuji.
9. Ubah jalur save saat ini bila ia menginstal ulang seluruh record: autosave tidak boleh mereset langkah, fokus, touched state, input, atau posisi scroll setiap kali berhasil.
10. Status dan selector yang digunakan verify scripts wajib dipertahankan: `Engine tersambung`, `Draft baru tersimpan`, `Draft dibuka`, `Tersimpan · revisi N`, `Itinerary berhasil dipublish`. Penjelasan pengguna dapat ditambahkan tanpa menghapus kontrak tersebut.

## 6. Urutan implementasi dan gerbang penerimaan

### Tahap 1 — Fondasi visual dan beranda

Periksa style/token dan diff aktif; buat shell beranda/editor, list jenis, list draft 5 terbaru, pagination, dan state kosong/loading/error. Uji urutan, dedup, retry, dan akhir pagination. Review screenshot HP/desktop sebelum memperluas pola ke seluruh editor.

### Tahap 2 — Satu alur pembuatan dan editor empat langkah

Integrasikan pilihan cara mengisi dengan import yang ada. Ubah pemetaan langkah di validation serta EditorForm secara konsisten. Tambahkan pengungkapan detail opsional dan navigasi field bermasalah. Pertahankan `data-field-path`, `data-editor-section`, `data-target-id`, dan `data-mode-card` yang dibutuhkan integrasi.

Penerimaan: keempat mode tetap dapat diedit lengkap, tidak ada draft ganda, kembali mempertahankan pilihan, error membawa pengguna ke field yang benar. Perbarui verify scripts yang bergantung pada jalur UI lama tanpa melemahkan assertion.

### Tahap 3 — Autosave dan koordinasi operasi

Ekstrak pengelolaan save ke hook/helper kecil bila diperlukan; jangan menambah state library. Uji request lambat, edit saat save, koneksi gagal, retry, konflik revision, perpindahan draft, dan respons usang dengan mock deterministik. Uji juga bahwa import/AI tidak balapan dengan save.

Penerimaan: tidak ada kehilangan edit baru atau save tumpang tindih, status tidak menyatakan tersimpan sebelum server mengonfirmasi, validasi draft dan expectedRevision tetap berlaku.

### Tahap 4 — Preview, publikasi, dan berbagi

Buat layar preview dan navigasi kembali; koordinasikan save → preview/publish; tampilkan ringkasan masalah dan status tautan. Pertahankan retry publikasi dan pencabutan tautan. Verifikasi berbagi native, salin tautan, fallback, dan perubahan setelah publish.

### Tahap 5 — Verifikasi mobile dan pengguna awam

- Build sebelum browser verify; gunakan data root sementara, bukan `.runtime/` nyata.
- Jalankan `npm run typecheck:web-app`, `npm run test:web-editor`, `npm run build:web-app`, lalu verify yang relevan: `npm run verify:web-editor`, `npm run verify:web-preview`, `npm run verify:web-publication`, dan `npm run verify:web-publish-retry` bila tersedia di package.json. Periksa nama script import/AI sebelum menjalankannya; gunakan mock, bukan AI berbayar.
- Jalankan pemeriksaan release yang diwajibkan proyek sebelum menyatakan siap rilis. Catat command dan hasil sebenarnya pada log tahap; kegagalan atau skip disertai alasan.
- Browser: semua mode, manual/import, teks panjang, tanpa foto, daftar kosong/banyak, error inline, pergantian mode, keyboard virtual, zoom, navigasi keyboard, tombol Back, loading, dan koneksi lambat.
- Ambil dan periksa screenshot beranda, pilih cara mengisi, setiap langkah, preview, serta error save pada HP dan desktop.
- Uji tugas pada 3–5 guide/driver pemula bila tersedia: buat itinerary, tambah aktivitas, ubah jam, temukan kesalahan, lihat hasil, bagikan. Sasaran: pengguna tahu tindakan berikutnya tanpa pendamping; catat titik bingung dan perbaiki. Tanpa peserta, tandai uji pengguna belum dilakukan.

## 7. Batas implementasi dan risiko

Ruang perubahan utama: `src/editor/**`, pengujian editor, dan script verifikasi relevan. Backend, renderer, API client, schema, contracts, migrations, dan suite server tetap mengikuti batas izin repo. Jika urutan draft, import, atau kebutuhan autosave ternyata memerlukan perubahan di area tersebut, ajukan keputusan scope sebelum implementasi.

Risiko utama: state terpusat pada main.tsx, respons save menimpa input baru, perubahan urutan langkah mematahkan navigasi error, serta perubahan import yang sudah ada. Mitigasi: perubahan bertahap, helper save terisolasi, pemetaan langkah tunggal, dan uji alur/regresi yang menguji perilaku nyata.

## GSTACK REVIEW REPORT

- Keputusan pengguna: target guide/driver; desain netral-teal minimalis; beranda terpisah; list jenis; lima draft dan load more; satu alur manual/import; empat langkah; detail sesuai kebutuhan; autosave; layar preview.
- Cakupan review: struktur source, alur, state kesalahan, aksesibilitas, mobile, dan batas implementasi.
- Belum dilakukan: mockup visual, audit browser, pengujian kode, dan validasi pengguna. Tidak ada skor desain atau klaim lulus pengujian.
- Status: plan siap ditinjau sebelum implementasi; tahap pertama menjadi titik review visual.
