# CP037 Brief: Alur "Buat itinerary" 3 langkah (Jenis → Cara mengisi → Periksa)

Status: **brief, menunggu persetujuan owner.** Belum ada kode yang diubah. Tanggal: 2026-11-12.

## Masalah sekarang

- Membuat itinerary punya dua pintu terpisah. Kartu tipe langsung membuat draf kosong, sedangkan tombol "Buat dari teks/PDF" membuka layar lain yang menanyakan mode lagi.
- Orang awam tidak tahu harus mulai dari mana, dan draf kosong ikut tertinggal setiap kali kartu tidak sengaja disentuh.
- Di HP, pilihan ini ada di sidebar yang panjang, dan input file bawaan browser membingungkan (lihat revisi cepat sebelumnya).

## Alur baru (satu pintu: tombol "Buat itinerary baru")

| Langkah | Judul di layar | Isi | Draf dibuat? |
|---|---|---|---|
| 1 | **Jenis perjalanan** | 4 kartu: Setengah hari, Sehari penuh, Beberapa hari, Panduan destinasi. Tiap kartu berisi 1 kalimat penjelasan dan 1 contoh. | Belum |
| 2 | **Cara mengisi** | 3 kartu pilihan beserta penjelasan (lihat di bawah). Setelah memilih, panel isian muncul di bawah kartu pada layar yang sama. | Saat "Lanjut" ditekan |
| 3 | **Periksa & lengkapi** | Editor bertahap yang sudah ada (Info, Waktu, Guide, …, Publish). Untuk teks/PDF, panel "Hasil import" tampil di atas. | Sudah |

Penanda kemajuan di atas: "Langkah 2 dari 3 · Cara mengisi", ditambah 3 titik.

### Langkah 2: tiga kartu dan teks penjelasannya

Setiap kartu memuat ikon, judul, satu kalimat "cocok untuk", dan satu baris "yang terjadi".

1. **Tempel teks**
   - Cocok untuk: "Itinerary sudah ada di WhatsApp, catatan HP, atau email."
   - Yang terjadi: "Kami baca jam, hari, dan daftarnya. Yang tidak terbaca dibiarkan kosong untuk Anda isi."
2. **Upload PDF**
   - Cocok untuk: "Punya file PDF itinerary yang tulisannya bisa diblok."
   - Yang terjadi: sama seperti Tempel teks.
   - Peringatan kecil: "PDF hasil foto/scan belum bisa dibaca; salin teksnya lalu pilih Tempel teks."
3. **Isi manual**
   - Cocok untuk: "Mulai dari nol, atau itinerary belum ditulis di mana pun."
   - Yang terjadi: "Anda diajak mengisi langkah demi langkah."

Di bawah kartu ada lipatan "Belum yakin pilih yang mana?" berisi 3 baris tanya-jawab singkat:
- "Apakah isi saya dikirim ke AI?" Jawabannya: hanya bagian yang tidak terbaca, dan hanya jika AI aktif.
- "Bisa diubah nanti?" Jawabannya: ya, semua isian bisa diedit di langkah 3.
- "Teks saya disimpan?" Jawabannya: disimpan di komputer ini agar bisa dilihat ulang.

Setelah kartu dipilih:
- **Tempel teks.** Kotak teks besar yang tingginya mengikuti isi, dengan contoh di placeholder, penghitung karakter, dan tombol "Baca teks".
- **Upload PDF.** Kotak putus-putus "Ketuk untuk pilih file PDF" (komponen dari revisi cepat), nama file tampil, lalu tombol "Baca PDF".
- **Pratinjau hasil baca.** Setelah dibaca, muncul ringkasan seperti "3 hari · 14 kegiatan terbaca · 2 baris belum terbaca", pilihan bahasa, lalu tombol utama "Lanjut ke langkah 3".
- **Isi manual.** Tidak ada panel tambahan; tombol utama langsung "Mulai isi".

### Prinsip mobile-first dan untuk orang awam

- **Tata letak.** Satu kolom di lebar 360–430 px. Kartu memenuhi lebar layar dengan target sentuh minimal 44 px. Tidak boleh ada scroll horizontal.
- **Tombol aksi.** Bar aksi menempel di bawah ("Kembali" | "Lanjut") dan berada di atas keyboard HP. Tombol "Lanjut" nonaktif sampai langkahnya terisi, dengan alasan tertulis di bawahnya, misalnya "Pilih salah satu cara dulu".
- **Saat alur dibuka.** Sidebar draf disembunyikan selama alur 3 langkah ini berjalan. Di desktop, alur tampil di tengah dengan lebar maksimal sekitar 720 px.
- **Tombol back HP.** Tombol back di HP mundur satu langkah, bukan keluar dari aplikasi (riwayat `#buat/1`, `#buat/2`). Teks yang sudah ditempel tetap ada saat mundur.
- **Keluar di tengah jalan.** Jika teks sudah diketik atau file sudah dipilih, muncul konfirmasi "Buang isian ini?".
- **Bahasa.** Kata teknis tidak dipakai di layar:

  | Ganti | Dengan |
  |---|---|
  | "mode" | "jenis perjalanan" |
  | "import" | "isi dari teks/PDF" |
  | "parse" | "baca" |

  Pesan error berbentuk kalimat yang menyebut apa yang harus dilakukan.
- **Lainnya.** Pilihan terakhir (jenis dan cara) diingat sebagai pilihan awal berikutnya, disimpan di localStorage.

## Frontend (FE)

| Bagian | Pekerjaan |
|---|---|
| `src/editor/create/CreateFlow.tsx` (baru) | Wadah 3 langkah: state `step`, `mode`, `method`, `text`, `file`, `intake`, `preview`. Sinkron dengan hash URL untuk tombol back. |
| `create/StepType.tsx` | `ModePicker` diubah menjadi pemilih (memilih, bukan langsung membuat draf). Pemakaian lama tidak dipertahankan. |
| `create/StepMethod.tsx` | Tiga kartu, lipatan bantuan, panel teks atau PDF. Kode baca, pratinjau, dan proses diambil dari `import/ImportScreen.tsx`. |
| `create/StepFooter.tsx` | Bar aksi bawah yang menempel, dengan alasan saat tombol nonaktif. |
| `import/ImportScreen.tsx` | Dipakai hanya untuk **isi ulang draf yang sedang dibuka** (overwrite). Logika baca dan proses dipindah ke hook bersama `useImportSource` agar tidak dobel. |
| `main.tsx` | Sidebar: kartu tipe dan tombol "Buat dari teks/PDF" diganti satu tombol "Buat itinerary baru". Halaman kosong diberi tombol besar yang sama. Langkah 3 memakai editor yang sudah ada; `create()` dipanggil saat "Mulai isi". |
| `labels.ts` / `import/copy.ts` | Semua teks baru dikumpulkan di `create/copy.ts`. Label header "Import teks/PDF" diganti menjadi "Isi ulang dari teks/PDF". |

## Backend (BE)

Perubahan BE kecil. Endpoint sources, parse, apply, dan create sudah cukup untuk alur ini.

1. **Capabilities untuk import.** `GET /api/v1/...` (capabilities yang sudah ada di `app.ts:143`) ditambah:
   ```
   import: { ai: 'configured' | 'missing', maxTextChars: 120000, maxPdfBytes: 10485760, maxPdfPages: 60 }
   ```
   - FE menampilkan batas dari server, bukan angka yang di-hardcode.
   - Catatan "AI aktif/tidak" membaca status extractor import yang sebenarnya, sehingga temuan U3 tertutup.
2. **Retensi teks sumber (temuan A10).** Saat server mulai, hapus sumber import yang lebih tua dari 30 hari beserta file teksnya. Sumber yang ditinggal di langkah 2 juga ikut terhapus. Ini bisa diatur lewat `IMPORT_RETENTION_DAYS`, dengan 0 berarti tidak dihapus.
   - Sumber yang sudah dihapus tetap aman di laporan: tombol "Lihat teks sumber" menampilkan "Teks sumber sudah dihapus otomatis setelah 30 hari".
   - **Butuh persetujuan owner.**
3. **Tanpa migrasi DB dan tanpa endpoint baru.** Draf manual tetap dibuat dengan `POST /api/v1/itineraries` (mode) saat "Mulai isi". Draf dari teks/PDF dibuat dengan `apply` (target new, mode dari langkah 1).

## Tes dan bukti selesai

- **E2E baru `verify:web-create`** di lebar 390 dan 1280, untuk tiga jalur:
  - teks → langkah 3 dengan laporan,
  - PDF → langkah 3,
  - manual → editor kosong.
- **Skenario khusus:**
  - tombol back HP mundur satu langkah, dan teks tetap ada;
  - "Lanjut" nonaktif beserta alasannya;
  - tidak ada draf kosong yang dibuat saat hanya berpindah langkah;
  - tidak ada scroll horizontal di 360 px.
- **Skrip lama yang memakai `data-mode-card`** (verify-editor, verify-ai-ui, verify-preview, verify-places, verify-import) diperbarui agar lewat alur baru.
- **Unit test BE:** isi capabilities import, sapuan retensi (sumber tua terhapus, sumber baru tetap), dan laporan dengan sumber yang sudah dihapus.
- **Screenshot yang dibuka dan diperiksa:** langkah 1, 2, dan 3 di 390, serta langkah 2 di 1280.
- **Gerbang biasa:** typecheck, semua test, semua verify, dan release valid.

## Keputusan untuk owner

1. Setuju alurnya: Jenis → Cara mengisi → Periksa?
2. Retensi teks sumber 30 hari (A10)? Atau tidak dihapus?
3. Kartu tipe lama di sidebar dihapus seluruhnya (rekomendasi), atau tetap sebagai jalan pintas?

Perkiraan: 1 CP. Haiku yang mengerjakan, lalu Opus mereview.
