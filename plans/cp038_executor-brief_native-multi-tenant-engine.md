# CP038 Executor Brief: Native Multi-Tenant Engine

**Untuk:** agent eksekutor (Claude Haiku) yang mengerjakan CP038.
**Tanggal:** 2026-11-20. Disusun dari plan, keputusan owner, dan pemeriksaan repo `C:\Users\Asus\itenary-generator` pada tanggal yang sama.
**Plan utama:** `plans/cp038_implementation-plan_native-multi-tenant-engine.md`. Brief ini tidak menggantikan plan. Brief ini memberi arah kerja, fakta repo, dan batas yang sudah diputuskan owner.

---

## 0. Cara memakai brief ini

1. **Urutan baca sebelum mulai:** `RULES.md` → `SPEC.md` §1–2 → `TODOS.md` §2 → plan CP038 (seluruhnya) → brief ini.
2. **Kalau plan dan brief berbeda:**
   - Untuk keputusan owner (§1) dan mode lokal (§3), **brief yang berlaku**.
   - Untuk fakta repo (§2), **brief yang berlaku**, tetapi cek ulang karena repo bisa sudah berubah.
   - Untuk hal lain (skema, auth, endpoint, acceptance), **plan yang berlaku**.
   - Kalau `RULES.md`/`SPEC.md`/`TODOS.md` bertentangan dengan keduanya, **berhenti dan tanyakan owner** lewat structured question.
3. **Satu tahap selesai dulu, baru lanjut.** Setiap tahap: kerjakan → review diri → test → perbaiki → ulangi sampai gate bersih. Bukti dicatat di `logs/cp038_stage-log_native-multi-tenant-engine.md`.
4. **Titik berhenti wajib** ada di §7. Di titik itu, kirim laporan (§8) dan tunggu owner.
5. **Jangan commit, push, atau deploy** tanpa instruksi owner yang eksplisit.

---

## 1. Keputusan final owner

| Topik | Keputusan | Sumber |
|---|---|---|
| Arsitektur | Multi-tenant langsung di engine ini. Tanpa Laravel, SSO, atau repo lain. | Plan §Clarifications |
| Pemilik | Satu owner per driver/agency di V1. Tanpa anggota tim. | Plan |
| Pendaftaran | Self-registration, bisa dimatikan operator. Ada akun master terpisah. | Plan |
| **Mode lokal** | **Mode lokal tanpa login dipertahankan** sebagai pengecualian eksplisit (detail §3). Mode akun tetap jalur utama dan satu-satunya mode untuk deployment. | Ask Question 2026-11-20 |
| **Dependency CP032** | Pakai status `completed` di `TODOS.md`. Linux dan live AI yang tidak diklaim dicatat sebagai known limitation, bukan blocker. | Ask Question 2026-11-20 |
| CP029 | Ditandai *superseded by CP038*, **bukan** completed. ID tidak di-renumber. | Plan §Handoff |

Yang **tidak perlu** ditanyakan lagi: Laravel atau tidak, dan agency multi-user atau tidak. Keduanya sudah final.

---

## 2. Kondisi repo saat brief ditulis

Cek ulang setiap poin di tahap A. Jangan menganggap angka ini masih benar.

**Lingkungan**
- Branch saat ini `cp032/import-review-hardening`. Branch utama `main`.
- Node lokal **v22.18.0**, padahal `package.json` mensyaratkan `>=24`. Test berjalan di Node 22. Catat versi Node di setiap log, dan jangan mengklaim lulus di Node 24 bila tidak dijalankan di sana.
- OS Windows. Banyak file memakai CRLF. **Pakai tool Edit untuk mengubah file.** Penggantian lewat `sed` atau `node -e` dengan pola `\n` sering gagal diam-diam di repo ini.
- `node:sqlite` mengeluarkan `ExperimentalWarning`. Itu normal.

**Working tree tidak bersih**
- Sekitar 43 file berubah atau baru, dari revisi import `real-world-text-coverage` yang statusnya masih `in_progress` dan belum di-commit.
- **Jangan revert, stash, atau menimpa perubahan itu.** Laporkan di awal tahap A dan tanyakan owner apakah perlu di-commit dulu (titik berhenti A0).

**Server**
- `src/server/main.ts` menolak `HOST` selain `127.0.0.1`/`::1`. Pertahankan.
- `src/server/store.ts` → `openStore({ dataDir })` membuka DB, menjalankan migrasi 1–7, lalu memilih **satu** workspace dari `app_meta.workspace_id`, atau membuatnya. Ini yang harus dipecah.
- `src/server/app.ts` → `createApp(options: AppOptions)` membuat satu store dan satu instance service AI, import, dan publication untuk seluruh proses.
- Guard satu-satunya saat ini ada di hook `onRequest` (`app.ts` sekitar baris 120): mutasi (`POST`/`PATCH`/`PUT`/`DELETE`) wajib membawa `Origin` yang diizinkan dan `x-engine-request: 1`. **Request GET manajemen tidak dijaga sama sekali.**
- `allowedOrigins` default: origin engine dan `http://127.0.0.1:5173` (Vite).
- Error handler hanya memetakan 413 dan 400. Status lain jadi 500. Ini harus diperluas untuk 401, 403, 409, 422, dan 429.
- `app.addHook('onClose', () => store.close())` menutup koneksi dari store. Ini harus pindah ke lifecycle database.

**Route yang ada (30)**
- **Publik:** `GET /api/health`, `GET /i/:token`, `GET /i/:token/og-image`.
- **Manajemen:** semua di bawah `/api/v1/itinerary-engine/*`, `/api/v1/itineraries/*`, `/api/v1/assets/*`, `/api/v1/imports/*`, `/api/v1/places/autocomplete`.
- Daftar lengkap ambil dengan: `grep -rnoE "app\.(get|post|patch|put|delete|head)" src/server`.

**Data**
- Migrasi saat ini berakhir di **versi 7** (`import-operations`). Migrasi baru mulai dari 8. Cek ulang sebelum memberi nomor.
- Tabel: `app_meta`, `workspaces`, `itineraries`, `assets`, `published_versions`, `share_tokens`, `publication_state`, `publish_operations`, `ai_daily_usage`, `ai_operations`, `ai_live_budget`, `ai_live_budget_entries`, `places_usage`, `import_sources`, `import_operations`, `migrations`.
- `places_usage(day,count)` **global**, dipakai di `app.ts` sekitar baris 311.
- `ai_live_budget` adalah ledger uji global. **Jangan diubah atau direset.**
- Raw SQL (`.prepare(`): `publication.ts` 30, `store.ts` 26, `ai/service.ts` 20, `import/service.ts` 16, `ai/schema.ts` 4, `import/retention.ts` 3, `import/routes.ts` 2, `app.ts` 1.
- `store.db` dipakai langsung di 6 file: `ai/service.ts`, `app.ts`, `import/retention.ts`, `import/routes.ts`, `import/service.ts`, `publication.ts`. Semua query di sana harus diaudit untuk predikat `workspace_id`.
- Ada sekitar 50 referensi `workspaceId` di luar `store.ts`.

**Test**
- Sekitar 29 file test/skrip memanggil `createApp(...)` dengan `app.inject` dan header `origin` + `x-engine-request`. Semuanya harus memakai fixture sesi nyata setelah tahap D (lihat §5).
- Suite yang ada: `test:web-contracts`, `test:web-api`, `test:web-store`, `test:web-preview`, `test:web-publication`, `test:web-editor`, `test:web-import`, `test:web-places`, `test:web-ai`, `test:web-render`. Ada juga skrip `verify:web-*`.

**Deploy**
- `deploy/Caddyfile.example` hanya meneruskan route share publik ke `127.0.0.1:3000`. Untuk CP038, `/api` dan editor juga akan lewat proxy, sehingga contoh ini harus diperbarui di tahap G.

**UI**
- Layar pertama editor adalah "Setup agensi" bertahap (`src/editor/main.tsx`, `setupStep`). Onboarding bisnis setelah daftar harus menyatu dengan alur ini, bukan menduplikasinya.

---

## 3. Mode lokal tanpa login (keputusan owner)

Tujuannya: operator bisa memakai editor di komputernya sendiri tanpa membuat akun. Bahayanya: di produksi, engine **juga** bind ke loopback di belakang Caddy. Jadi "request datang dari 127.0.0.1" **tidak cukup** untuk menandai mode lokal. Semua penjaga di bawah ini wajib.

### 3.1 Cara menyalakan
- Env baru: `AUTH_LOCAL_NO_LOGIN=1`. Default mati. Nilai lain selain persis `1` dianggap mati.
- Nama ini harus didokumentasikan di `.env.web.example` dengan komentar "khusus komputer lokal, jangan dipakai di server".
- **Tidak boleh** muncul di `deploy/runtime.env.example`. `scripts/web/validate-release.mjs` harus gagal bila flag ini ada di env contoh yang dipaketkan.

### 3.2 Penjaga saat startup (server menolak jalan, dengan pesan jelas)
Server berhenti dengan exit non-zero bila flag menyala **dan** salah satu kondisi ini terjadi:
1. `HOST` bukan `127.0.0.1` atau `::1`.
2. `AUTH_PUBLIC_ORIGIN` atau `PUBLIC_ORIGIN` diisi dengan origin `https:` atau host selain `127.0.0.1`/`localhost`/`[::1]`.
3. `SHARE_ORIGIN` diisi dengan origin `https:`.
4. Trusted proxy dikonfigurasi (env trusted proxy apa pun dari plan).
5. `NODE_ENV=production`.
6. Workspace lokal sudah di-claim, yaitu punya `owner_user_id`. Mode lokal **hanya** untuk workspace yang belum di-claim, supaya tidak bisa melewati login pada tenant yang sudah punya owner.

### 3.3 Penjaga per request
Untuk setiap request ke route manajemen, saat mode lokal menyala:
1. Alamat socket harus loopback.
2. Header `Host` harus persis `127.0.0.1:<PORT>`, `localhost:<PORT>`, atau `[::1]:<PORT>`. Ini menutup DNS rebinding.
3. Request yang membawa `X-Forwarded-For`, `Forwarded`, `X-Real-IP`, atau `X-Forwarded-Proto` ditolak dengan `403 LOCAL_MODE_PROXY_REJECTED`. Ini menutup jalur lewat Caddy.
4. **Mutasi tetap wajib** `Origin` yang diizinkan dan token CSRF dari `GET /api/v1/auth/session`. Mode lokal hanya menghapus login, bukan proteksi CSRF. Situs lain di browser yang sama tetap tidak boleh bisa memanggil API lokal.

### 3.4 Konteks dan perilaku
- Konteks request: `{ actorId: null, role: 'local_operator', workspaceId: <workspace dari app_meta>, requestId }`. Konteks dibentuk sekali per request dan tidak bisa diubah, sama seperti mode akun.
- Route akun (`/api/v1/auth/register`, `/login`, `/forgot-password`, `/reset-password`, `/mfa/*`) dan semua route `/api/v1/admin/*` menjawab `404 LOCAL_MODE`.
- `GET /api/v1/auth/session` menjawab `{ mode: 'local', csrfToken, workspace: {...ringkasan aman} }`.
- Route publik (`/i/:token`, OG) mengikuti aturan normal. Workspace lokal yang belum di-claim dianggap aktif hanya selama mode lokal menyala.
- UI menampilkan penanda permanen yang jelas, misalnya "Mode lokal tanpa login". Tanpa tombol login, logout, atau panel master.
- Log startup menulis satu baris peringatan bahwa mode lokal aktif. Tanpa rahasia apa pun.

### 3.5 Test wajib mode lokal (masuk `test:web-auth` atau suite `test:web-local-mode` tersendiri)
- Flag mati: route manajemen tanpa sesi menjawab 401.
- Flag menyala: route manajemen tanpa login berhasil untuk workspace lokal.
- Flag menyala + header `X-Forwarded-For`: 403 `LOCAL_MODE_PROXY_REJECTED`.
- Flag menyala + `Host: evil.example`: ditolak.
- Flag menyala + mutasi tanpa CSRF atau dengan Origin asing: 403.
- Flag menyala + route auth/admin: 404 `LOCAL_MODE`.
- Startup ditolak untuk masing-masing dari 6 kondisi di §3.2.
- `validate:web-release` gagal bila flag ada di env yang dipaketkan.

---

## 4. Peta kerja per tahap

Gunakan tabel tahapan di plan §8 sebagai acuan resmi. Bagian ini menerjemahkannya ke langkah konkret untuk repo ini.

### Tahap A — Baseline dan kontrak
**Tujuan:** tahu persis kondisi awal dan menulis kontrak yang akan dipegang semua tahap berikutnya.

1. Jalankan `git status`. Kalau masih ada perubahan revisi import yang belum di-commit, **berhenti (A0)** dan tanyakan owner.
2. Tambahkan baris `CP038 | native-multi-tenant-engine | CP032 | in_progress` di tabel `TODOS.md` §2. Ubah status CP029 menjadi `superseded by CP038 (plan plans/cp038_implementation-plan_native-multi-tenant-engine.md)`. Jangan menyentuh baris lain.
3. Jalankan baseline gate (§6) dan catat setiap kegagalan apa adanya. Plan menyebut riwayat 7 error di `typecheck:web-contracts`; ambil angka baru, jangan pakai angka lama.
4. Inventaris:
   - Semua route dan kelas aksesnya: publik, owner, master, lokal, atau sistem.
   - Semua raw SQL per file, dan apakah sudah memakai predikat `workspace_id`.
   - Semua job startup, recovery, dan cleanup (cari di `store.ts`, `publication.ts`, `import/retention.ts`).
   - Semua operation ID global (AI, import, publish) dan jalur replay-nya.
5. Tulis `docs/native-tenancy-contract.md` berisi: matriks endpoint × peran, skema dan nomor migrasi, kode error, aturan mode lokal (§3), dan daftar file yang akan diubah per tahap.

**Gate:** baseline tercatat, kontrak tertulis. **Berhenti (A1)** untuk review owner.

### Tahap B — Database dan repository tenant
**Tujuan:** satu koneksi DB untuk seluruh proses, dengan view store per workspace.

1. Buat `src/server/database.ts`: `openDatabase({ dataDir })` membuka DB sekali, menyalakan `PRAGMA foreign_keys = ON` (cek dulu apakah sudah), menjalankan migrasi dan recovery global sekali, lalu mengembalikan `{ db, close, system }`.
2. Ubah `store.ts`: pindahkan isi closure `openStore` ke `createWorkspaceStore(db, workspaceId)`. View ini tidak punya `close()` dan tidak menjalankan migrasi.
3. Pertahankan `openStore` sebagai pembungkus tipis (buka DB, pilih workspace legacy) **hanya** supaya test lama tetap hijau selama transisi. Tandai deprecated, dan hapus pemakaiannya di jalur produksi pada akhir tahap D.
4. Migrasi 8 dan seterusnya, mengikuti tabel skema di plan §2. Ikuti pola `before:` backup yang sudah dipakai migrasi 3 dan 4.
5. CLI `scripts/web/adopt-workspace.ts` dengan mode dry-run dulu.
6. Test: migrasi dari DB versi 7 berisi data (buat fixture dengan menjalankan migrasi 1–7 lalu mengisi data), migrasi diulang aman, dan dua tenant dengan operasi async yang saling selang-seling tanpa lewat HTTP.

**Gate:** `test:web-store` dan suite lama tetap hijau, test migrasi dan dua tenant hijau.

### Tahap C — Auth
**Tujuan:** akun, sesi, CSRF, verifikasi email, reset, MFA master, outbox email, dan rate limit, sesuai plan §3.

1. Pilih dan pin dependency: `@fastify/cookie` yang kompatibel Fastify 5, klien SMTP, dan library TOTP yang terawat. Cek dokumentasi resmi dan matriks kompatibilitas, lalu catat versi dan alasannya di stage log. Jangan menulis algoritme TOTP sendiri.
2. Modul `src/server/auth/*` sesuai plan §1. Transport email lewat interface; test memakai fake.
3. CLI `scripts/web/admin-account.ts` untuk bootstrap master. Password lewat prompt privat, tidak lewat argv.
4. Perluas error handler di `app.ts` untuk 401, 403, 409, 422, dan 429 dengan envelope error yang sama.
5. Implementasi mode lokal (§3) di tahap ini, termasuk penjaga startup.
6. Belum menutup route lama. Penegakan baru dilakukan di tahap D.

**Gate:** `test:web-auth` (termasuk test mode lokal §3.5) hijau, plus suite lama tetap hijau.

### Tahap D — Penegakan
**Tujuan:** setiap request manajemen berjalan dengan konteks tenant yang benar, dan tidak ada route owner yang tersisa tanpa auth.

1. Ganti hook `onRequest` lama dengan resolusi konteks per request: mode akun (sesi → user → workspace) atau mode lokal (§3). Route yang belum diklasifikasikan menjawab **deny secara default**.
2. Service AI, import, publication, dan preview menerima store atau konteks per request. Pilihan paling sederhana: buat instance service ringan per request dari store view. Klien provider (OpenRouter, Places) tetap global.
3. Replay operation ID global hanya dikembalikan bila workspace, fingerprint, dan target cocok. Selain itu `409 OPERATION_CONFLICT` tanpa data tenant lain. Uji tiga jenis operasi.
4. `places_usage` → `workspace_places_usage` per tenant, ditambah batas global provider yang terpisah.
5. Job startup, recovery, dan cleanup memakai repository sistem dengan referensi seluruh workspace.
6. Route publik: token → workspace → status → artifact, lalu cek ulang setelah baca file async.
7. Ubah sekitar 29 file test/skrip yang memanggil `createApp` agar memakai helper sesi nyata, misalnya `tests/web/helpers/session.ts` dengan `registerAndLogin(app, …)`. **Jangan** mematikan auth secara global untuk membuat test hijau.

**Gate:** `test:web-tenancy` dan seluruh suite lama hijau melalui batas auth. **Berhenti (D1)** untuk review owner, karena ini titik risiko keamanan terbesar.

### Tahap E — React
1. Auth gate saat bootstrap, sebelum fetch draft, profil, atau aset.
2. Halaman login, daftar, cek email, reset, onboarding bisnis yang menyatu dengan "Setup agensi", editor, dan panel master.
3. `src/api/client.ts`: kredensial sesi, header CSRF, error auth bertipe, dan tidak auto-retry POST setelah 401/403.
4. Logout membersihkan semua state dan localStorage yang terkait akun.
5. Penanda mode lokal (§3.4).
6. Cek browser 390, 1280, dan overflow di 360 untuk owner A, owner B, master, dan mode lokal.

**Gate:** editor, create, import, AI, places, preview, dan publish berfungsi lewat batas auth, dengan bukti screenshot.

### Tahap F — Admin dan rehearsal migrasi
1. Aksi admin (suspend, reactivate, disable, enable, limits) dengan audit atomik dan expected revision.
2. Suspend saat AI, import, atau publish sedang berjalan: commit ditolak dan biaya nyata tetap tercatat.
3. Rehearsal pada **salinan** data root: migrasi, adopt, bandingkan ID, revisi, hash, token, lalu restore dari backup.

**Gate:** `test:web-admin`, `test:web-tenant-lifecycle`, dan `verify:web-tenant-migration` hijau.

### Tahap G — Penerimaan rilis
1. `scripts/web/build-release.mjs` dan validatornya memuat dependency baru dan CLI baru.
2. Perbarui `.env.web.example`, `deploy/runtime.env.example`, `deploy/Caddyfile.example`, dan dokumentasi operator.
3. Start bersih dari artifact rilis (bukan dari `tsx`), lalu smoke test auth, upload, import, dan publish.
4. Load gate lokal sesuai plan (10 tenant, 10 klien, 100 siklus).
5. Tulis `logs/cp038_completion-log_native-multi-tenant-engine.md`, lalu ubah status di `TODOS.md` menjadi `completed`. Urutan ini wajib.

---

## 5. Jebakan teknis di repo ini

- **`node:sqlite` sinkron.** Jangan ada `await` di antara `BEGIN` dan `COMMIT`. Contoh pola yang benar: `commitReview` di `src/server/import/service.ts` (`BEGIN IMMEDIATE` → kerja sinkron → `COMMIT`, dengan `ROLLBACK` di `catch`).
- **SQLite `ALTER TABLE ADD COLUMN`** tidak bisa menambahkan `UNIQUE` atau `PRIMARY KEY`, dan kolom dengan `REFERENCES` harus default `NULL` bila foreign key aktif. Untuk `owner_user_id UNIQUE`, tambahkan kolom lalu buat `CREATE UNIQUE INDEX`. Buktikan perilakunya dengan test, jangan berasumsi.
- **Jangan menaruh workspace aktif di variabel global** atau di `app.decorate`. Request yang bertumpuk akan saling bocor.
- **Operation ID** AI, import, dan publish masih primary key global. Setiap jalur replay harus memeriksa workspace sebelum mengembalikan hasil.
- **Pesan error** tidak boleh membocorkan apakah ID milik tenant lain ada. Objek milik tenant lain dijawab 404.
- **Test lama** mengirim header `origin` + `x-engine-request`. Setelah tahap D, header itu bukan kredensial lagi. `x-engine-request` boleh dipertahankan sementara, tetapi tidak menggantikan CSRF.
- **Pengecekan browser:** engine hanya menyajikan editor bila `dist/index.html` ada (`npm run build:web-app`). `dist/` tidak dilacak git. Hapus setelah selesai kalau Anda yang membuatnya. Puppeteer sudah terpasang dan bisa dipakai untuk screenshot 390/1280.
- **Proses engine yang Anda jalankan** untuk pengecekan harus dimatikan lagi. Di Windows: cari PID dengan `netstat -ano | grep ":3000 "`, lalu `taskkill //PID <pid> //F`.
- **Rahasia** (password, token reset/verifikasi, secret MFA, kunci enkripsi) tidak boleh muncul di log, screenshot, audit, pesan error, maupun stage log.
- **AI berbayar:** gunakan test double. Jangan memanggil provider sungguhan.

---

## 6. Perintah gate

**Baseline (tahap A) dan setelah setiap tahap:**
```
npm run check:web-types
npm run typecheck:web-app
npm run typecheck:web-server
npm run typecheck:web-contracts
npm run typecheck:web-contracts-v2
npm run test:web-contracts
npm run test:web-api
npm run test:web-store
npm run test:web-preview
npm run test:web-publication
npm run test:web-editor
npm run test:web-import
npm run test:web-places
npm run test:web-ai
npm run test:web-render
```

**Suite baru (buat sesuai plan §Verification Plan):** `test:web-auth`, `test:web-tenancy`, `test:web-admin`, `test:web-tenant-lifecycle`, dan agregat `test:web-security`.

**Rilis (tahap G):**
```
npm run build:web-release
npm run validate:web-release
```

Catat setiap perintah beserta hasil aslinya: jumlah lulus/gagal, atau error pertama. Jangan menulis "lulus" untuk perintah yang tidak dijalankan.

---

## 7. Titik berhenti dan kapan bertanya

| Kode | Kapan | Yang dilaporkan |
|---|---|---|
| A0 | Awal tahap A, bila working tree tidak bersih | Daftar file berubah dan pertanyaan apakah owner mau commit dulu |
| A1 | Akhir tahap A | Baseline dan `docs/native-tenancy-contract.md` untuk direview |
| D1 | Akhir tahap D | Matriks isolasi, hasil `test:web-tenancy`, dan daftar route beserta kelas aksesnya |
| G1 | Akhir tahap G | Completion log dan semua bukti gate |

Selain titik di atas, **berhenti dan tanyakan owner** bila:
- Ada konflik antara `RULES.md`, `SPEC.md`, `TODOS.md`, plan, dan brief ini.
- Sebuah gate tidak bisa hijau tanpa melonggarkan assertion.
- Perlu akses SMTP, domain, atau server sungguhan.
- Perlu commit, push, atau deploy.
- Perlu menghapus data, atau menjalankan migrasi pada `.runtime` milik owner (rehearsal hanya pada salinan).

Jangan bertanya untuk hal yang sudah diputuskan di §1.

---

## 8. Format laporan setiap tahap

```
## Tahap X — <nama>  (tanggal, Node <versi>)

### Hasil
<lulus/gagal gate, satu kalimat>

### File yang diubah
- path — alasan singkat

### Perintah dan hasil
- <perintah> → <hasil asli>

### Bukti
- <path log, screenshot, atau output>

### Temuan yang belum selesai
- <temuan> — <rencana atau alasan ditunda>

### Tahap berikutnya
<nama tahap, atau titik berhenti yang sedang ditunggu>
```

Laporan yang sama ditambahkan ke `logs/cp038_stage-log_native-multi-tenant-engine.md`.
