# CP038 Implementation Plan: Native Multi-Tenant Itinerary Engine

Tanggal: 2026-11-14, Asia/Makassar. Status: **planned / belum implementasi**.
Target repo: `/Users/rangga/Applications/itenary-generator` (saat plan ditulis). Eksekusi 2026-11-20 dilakukan di `C:\Users\Asus\itenary-generator` (Windows).
Panduan eksekutor: `plans/cp038_executor-brief_native-multi-tenant-engine.md` (urutan kerja, fakta repo, batas mode lokal).
Menggantikan arah Laravel pada CP029; tidak mengubah ID atau hasil historis CP029 menjadi selesai.

## Objective

Satu aplikasi React + Fastify + SQLite pada satu server melayani banyak driver/agency. Setiap bisnis mempunyai satu owner yang dapat mendaftar, login, dan memakai generator; master admin mengelola akun, tenant dan penggunaan. Akun, tenant, session dan administrasi dibangun langsung di engine ini. Website driver menyusul setelah isolasi tenant terbukti.

## Clarifications and Decisions

Keputusan pengguna yang sudah eksplisit:

- Rombak rencana: multi-tenant langsung di itinerary engine, tidak memakai Laravel/project lain.
- Satu owner per driver/agency pada V1 (jawaban structured clarification sebelumnya tetap berlaku).
- Satu server, self-registration, akun master, generator dapat dipakai dengan atau tanpa website driver.
- Deliverable sesi ini adalah plan untuk agent lain, bukan implementasi.

Structured clarification sesi revisi: apakah mode lokal tanpa login dipertahankan. Saat draft ditulis jawaban belum diterima dan asumsi draft adalah "semua akses editor wajib login, termasuk lokal".

**Jawaban owner (structured Ask Question 2026-11-20): mode lokal tanpa login dipertahankan.** Asumsi draft di atas tidak berlaku lagi. Mode lokal adalah pengecualian eksplisit yang default-nya mati, hanya untuk satu workspace yang belum di-claim, dan ditolak saat startup atau per request bila ada tanda deployment (origin HTTPS, trusted proxy, header forwarded, Host bukan loopback). Batas lengkap, guard dan test wajibnya ada di brief eksekutor §3. Mode akun (login) tetap jalur utama dan satu-satunya mode untuk deployment.

Keputusan desain yang diusulkan plan:

- Tenant = `workspaces` existing; jangan membuat tabel `tenants` duplikat atau mengubah canonical itinerary.
- Satu owner mempunyai tepat satu workspace; platform master tidak otomatis mempunyai workspace atau akses konten tenant.
- Semua akun memakai email/password. Email harus verified sebelum penggunaan generator; MFA TOTP wajib untuk master sebelum akses admin.
- Shared SQLite/shared schema dengan `workspace_id`, satu proses server, satu data root. Multi-process/horizontal scaling belum didukung.
- Session opaque di database dan cookie HttpOnly; tidak memakai JWT di localStorage, cookie workspace, Laravel, PostgreSQL, atau gateway antar aplikasi.
- React editor dan API same-origin di produksi; Vite development tetap memakai proxy `/api`.
- Signup publik bisa dinonaktifkan operator; tidak ada billing/anggota agency pada V1.

## Scope

Auth, tenant creation, request-scoped authorization, master panel, status lifecycle, metering, legacy adoption, regression, runtime packaging dan dokumentasi operasi. Tetap mendukung lima mode `web-2.2.0`, import teks/PDF, autosave, AI, preview, publish/revoke dan OG.

## Out of Scope

Laravel/SSO, anggota/invitations, owner transfer, impersonation, social login, OTP WhatsApp, billing/payment, database-per-tenant, OCR, site templates/custom domains, deployment publik pada sesi planning. Hard delete tenant dan self-service penghapusan akun menunggu plan retention terpisah.

## Current-State Findings

- `src/server/store.ts:openStore()` memilih satu workspace dari `app_meta`, membuat closure store tunggal dan menjalankan migration/recovery saat dibuka.
- `src/server/app.ts:createApp()` memegang store, AI dan import service tunggal. Mengganti variable workspace global akan menimbulkan kebocoran saat request overlap.
- `workspaces`, itinerary/assets/publication dan beberapa ledger sudah memiliki workspace ID. `import_sources`/`import_operations` masih memiliki referensi tanpa FK; raw SQL harus diaudit.
- `places_usage(day,count)` global, sedangkan writing AI daily usage sudah workspace-scoped. `ai_live_budget` adalah ledger pengujian global; jangan diubah menjadi kuota tenant atau direset.
- Operation IDs AI/import/publication saat ini primary key global. Pemeriksaan replay/konflik harus memastikan workspace sebelum mengembalikan hasil.
- Origin + `x-engine-request` pada mutasi bukan autentikasi; GET management saat ini juga belum dilindungi session.
- Lifecycle startup/cleanup berjalan atas data root bersama. Memakai references dari satu tenant untuk cleanup global akan menghapus data tenant lain.
- Migrations saat audit berakhir di 7. Baca ulang sebelum memilih nomor migration baru.
- Audit sesi sebelumnya menemukan 7 error pada `typecheck:web-contracts`; app/server typecheck dan beberapa unit suites lulus. Agent wajib mengambil baseline baru, bukan menganggap bukti lama masih berlaku.

## Proposed Changes

### 1. Struktur modul dan kepemilikan

| Area | Target perubahan |
|---|---|
| `src/server/database.ts` (baru) | Open DB sekali, migrate, global recovery, close saat shutdown. Tidak memilih tenant. |
| `src/server/store.ts` | `createWorkspaceStore(db, workspaceId)`; view immutable tanpa migrate/recovery/open/close per request. |
| `src/server/auth/{schema,passwords,sessions,tokens,csrf,rate-limit,routes}.ts` (baru) | Auth persistence, credential verification, session lifecycle dan endpoint. |
| `src/server/tenancy/{context,policy,lifecycle}.ts` (baru) | Resolve user -> workspace dari DB, owner/master policies, suspension. |
| `src/server/admin/{routes,audit}.ts` (baru) | Metadata/usage/actions admin dengan audit transaksional. |
| `src/server/auth/mail.ts` + worker/outbox module | Verifikasi/reset via transport interface; capture lokal dan SMTP produksi. |
| `src/server/app.ts`, AI/import/publication/preview | Services mendapat workspace store/context request, bukan tenant singleton. |
| `src/editor/auth/*`, `src/editor/admin/*`, `src/editor/main.tsx` | Login/signup/reset/verification, onboarding, master pages, auth bootstrap. |
| `src/api/client.ts` | Session credentials, CSRF header, typed auth error, account-state handling. |
| `scripts/web/admin-account.ts`, `adopt-workspace.ts` (baru) | Bootstrap/recovery master dan binding workspace lama lewat CLI privat. |
| tests + release scripts + deploy/docs | Isolation matrix, new dependencies packaged, setup dan backup. |

### 2. Schema database yang ditargetkan

Semua ID baru UUID; timestamps UTC konsisten dengan existing schema. Gunakan transaction synchronous pendek tanpa `await` di dalam transaction SQLite. Foreign keys aktif. Migration additive, backward-reading fixtures dan backup sebelum perubahan.

| Tabel | Kolom/constraint minimum |
|---|---|
| `users` baru | `id PK`, `email_normalized UNIQUE NOT NULL`, `email_display`, `password_hash`, `platform_role CHECK(owner,master)`, `status CHECK(active,disabled)`, `email_verified_at`, `auth_version INTEGER`, timestamps |
| `workspaces` existing | tambah `owner_user_id NULL UNIQUE REFERENCES users(id)`, `business_type CHECK(driver,agency)`, `access_status CHECK(unclaimed,pending_verification,active,suspended)`, `status_revision`, timestamps status; preserve `profile_json`, IDs/revision |
| `auth_sessions` | `token_hash PK`, `user_id nullable FK`, `auth_version`, `csrf_secret`, `auth_level CHECK(anonymous,password,mfa)`, `created_at`, `last_seen_at`, `idle_expires_at`, `absolute_expires_at`, `revoked_at` |
| `auth_action_tokens` | `token_hash PK`, `user_id FK`, `purpose CHECK(verify_email,reset_password)`, expiry, consumed_at; satu token hanya sekali pakai |
| `user_mfa` | `user_id PK/FK`, encrypted TOTP secret, confirmed_at, last_accepted_counter; recovery codes disimpan hashed pada child table |
| `auth_rate_limits` | HMAC-normalized account/IP key + action + time window unique, attempts; TTL cleanup; tanpa email/password plaintext |
| `auth_mail_outbox` | job ID, user FK, purpose, encrypted delivery payload, retry/next_attempt/status/expiry; hapus payload setelah terkirim atau expired |
| `admin_audit_events` | actor, action, target user/workspace, reason, safe before/after JSON, request ID, timestamp; aplikasi tidak menyediakan update/delete |
| `workspace_limits` | workspace PK/FK, writing AI daily limit, places daily limit, revision; validasi terhadap hard bounds server |
| `workspace_places_usage` | `(workspace_id,day_utc) PK`, count; counter provider global tetap terpisah |

Invariants: user `owner` hanya satu workspace; master tidak dapat menjadi owner lewat payload signup. Signup+workspace pending dibuat dalam satu transaction. Assignment owner pada workspace existing hanya CLI terotorisasi. Penambahan owner FK tidak otomatis mengikat data lama ke akun pertama. Registrasi duplicate ditangani UNIQUE+transaction; kedua request bersamaan tidak boleh menghasilkan orphan user/workspace.

Consume verifikasi email menandai user verified dan mengubah workspace miliknya dari `pending_verification` ke `active` dalam transaction yang sama. Jangan mengaktifkan `suspended` atau `unclaimed` melalui email verification/reset. Reaktivasi admin hanya untuk tenant yang owner-nya verified; user disabled tetap ditolak walaupun tenant active. Tindakan ini harus memakai expected status revision agar stale admin action tidak menimpa perubahan baru.

Pertahankan global operation UUID PK pada V1 untuk menghindari rebuild ledger/FK besar: replay hanya jika workspace, fingerprint dan target cocok. Collision dengan workspace lain menjawab generic `409 OPERATION_CONFLICT`, tanpa hasil/identitas tenant lawan, tanpa quota/provider mutation. Semua query update/read tetap memakai workspace predicate. Test eksplisit collision tiga jenis operation.

FK komposit/ownership guard: cek parent-child ownership sebelum setiap write (asset, source, target itinerary/version). Inventory raw SQL dan tambahkan constraint yang memungkinkan dengan migrasi aman; satu FK `itinerary_id` saja tidak membuktikan workspace sama.

### 3. Auth/session contract

- Password memakai `node:crypto.scrypt` async: salt acak >=16 bytes, derived key 64 bytes, N=131072/r=8/p=1, maxmem 256 MiB; simpan algoritme+parameter+salt+hash dalam format versioned. Bandingkan constant-time setelah length check. Benchmark dan batasi hashing concurrency maksimum 2 per proses serta queue bounded; rate-limit sebelum hashing. Jangan menurunkan parameter diam-diam.
- Password 12–128 karakter, tidak di-trim/diubah; email trim+lowercase untuk uniqueness, tanpa Gmail dot/plus rewriting. Login unknown account menjalankan dummy verification yang bounded; error generic.
- Cookie production `__Host-itinerary-session`: random 32-byte token, Secure, HttpOnly, SameSite=Lax, Path=/, tanpa Domain. DB hanya menyimpan SHA256 token. Cookie HTTP development punya nama berbeda; non-Secure hanya jika explicit local config dan loopback. Jangan menentukan secure mode dari arbitrary forwarded header.
- Owner session idle 24 jam/absolute 7 hari; master idle 30 menit/absolute 12 jam. DB clock authoritative. Session rotation saat login/MFA/reset; token lama revoked, CSRF diperbarui. Logout merevoke session dan clear cookie; password reset/disable mencabut seluruh session lewat `auth_version`+revoke.
- `GET /api/v1/auth/session` membuat anonymous session bila belum ada dan mengembalikan CSRF token serta safe user/workspace summary bila login. Bootstrap ini `no-store`, same-origin; cap anonymous sessions/rate dan purge expiry untuk mencegah DB growth.
- Semua mutasi browser, termasuk login/register/logout/reset/MFA, perlu exact allowed Origin dan `x-csrf-token` yang terikat session. JSON content type enforced kecuali endpoint upload multipart. `x-engine-request` boleh dipertahankan sementara tetapi bukan credential/CSRF secret.
- Token verify/reset random 32 bytes, DB hash saja, verify 24 jam/reset 30 menit. URL UI memakai fragment agar token tidak masuk HTTP access log; React menukar dengan POST setelah CSRF bootstrap, lalu membersihkan URL/history. Referrer policy no-referrer pada auth pages, tidak ada third-party assets di halaman token.
- Mail outbox memerlukan token asli untuk delivery: encrypt payload dengan AES-GCM dan key berversi dari env; key tidak ada di DB/repo. Hapus ciphertext sesudah delivery/expiry. Reset consume+password update+session revoke atomik; concurrent consume hanya satu sukses. Resend membatalkan token sebelumnya secara atomik.
- Gunakan library TOTP terpelihara yang diverifikasi saat tahap A; jangan menulis algoritme TOTP sendiri. Master login password hanya memberi sesi pre-MFA tanpa admin access. Enrollment membutuhkan password baru diverifikasi; encrypted secret+hashed recovery codes, replay counter dan throttling. Recovery admin via CLI lokal, audited dan revoke semua session.
- Rate-limit awal: login 5 gagal/account/15 menit dan 30/IP/15 menit; register 5/IP/jam; reset/resend 3/account/jam dan 20/IP/jam; MFA 5/session/5 menit. IP hanya dari socket/trusted proxy yang dikonfigurasi; spoofed X-Forwarded-For tidak dipercaya. Tampilkan 429 + Retry-After; temporary throttling, bukan lock permanen.
- Dependency baru: `@fastify/cookie` kompatibel Fastify 5, mail SMTP client dan TOTP library. Pin versi setelah cek official docs/lockfile; tests memakai mail fake. Tambahkan dependencies ke runtime release allowlist dan validator.

### 4. Endpoint dan permission matrix

Semua response mengikuti error envelope existing; update error handler agar 401/403/409/422/429 tidak menjadi 500. Endpoint baru berikut merupakan target implementasi, belum tersedia.

| Endpoint | Akses/perilaku |
|---|---|
| `GET /api/v1/auth/session` | Anonymous/authenticated bootstrap; no secrets selain token CSRF session peminta |
| `POST /api/v1/auth/register` | Anonymous+CSRF; email/password/businessType/agencyName; generic 202 untuk email existing; account/workspace pending dan email queued |
| `POST /api/v1/auth/login` | Anonymous+CSRF; 200 safe summary untuk owner, master `mfaRequired`; 401 generic |
| `POST /api/v1/auth/logout` | CSRF; revoke session, 204 |
| `POST /api/v1/auth/verify-email`, `/forgot-password`, `/reset-password` | CSRF + token/expiry atau generic 202 untuk forgot |
| `POST /api/v1/auth/resend-verification` | Logged-in unverified+CSRF+rate limit |
| `POST /api/v1/auth/mfa/enroll`, `/confirm`, `/challenge`, `/recovery` | Master appropriate session/password stage; strict state transitions |
| Existing `/api/v1/itinerary-engine/*`, `/itineraries/*`, `/assets/*`, `/imports/*`, `/places/*` | Verified active owner + active workspace dari session; master tidak otomatis boleh masuk |
| `GET /api/v1/admin/workspaces`, `/users`, `/usage`, `/audit` | Active master+MFA; paginated metadata, tanpa draft/source/provider credentials |
| `POST /api/v1/admin/workspaces/:id/suspend`, `/reactivate` | Master+MFA+CSRF; expected status revision, reason required; status+audit atomik |
| `POST /api/v1/admin/users/:id/disable`, `/enable` | Master+MFA+CSRF; jangan disable diri/master aktif terakhir |
| `PATCH /api/v1/admin/workspaces/:id/limits` | Master+MFA+CSRF; revision+bounded values+audit |
| `GET/HEAD /i/:token` dan `/og-image` | Anonymous; hanya published active token dan workspace active |
| `GET /api/health` + static bundle | Public minimal; tanpa workspace/account/filesystem details |

Role/tenant context diambil DB per request, bukan workspace ID pada header/body/cookie/URL dari client. Master admin target ID pada route diperiksa oleh policy admin, tidak menghasilkan global bypass untuk owner endpoints. Endpoint baru yang tidak diklasifikasi default deny.

### 5. Tenant context dan lifecycle

Request flow: cookie -> session hash lookup -> expiry/revoke/auth_version -> user active -> role policy -> owner workspace lookup+status -> immutable context -> workspace store -> service. Jangan menyimpan tenant aktif di global/decorated app singleton. Shared provider client boleh global; store, limits, locks dan context harus tenant-aware.

- Resolve `{actorId,role,workspaceId,requestId}` pada management request. GET privat juga auth; unauthorized 401, unverified/disabled/suspended 403, foreign object 404. Jangan mengembalikan metadata lewat exception details.
- Services AI/import/preview/publication menerima context eksplisit, termasuk callback async dan job/retry. DB connection satu, beberapa store views; view tidak punya `close()` yang menutup koneksi bersama.
- Semua references/cursor/cache/replay/usage dites dengan dua tenant. Provider requests dilakukan setelah otorisasi. Cursor tidak membuka data tenant lain; pagination query selalu workspace-scoped.
- Startup recovery/retention/orphan cleanup berjalan sekali memakai system repository dengan references seluruh workspace. System context tidak boleh tersedia via HTTP client atau ordinary owner service.
- Tenant suspend: management request baru 403, public HTML/OG 404; jangan hapus/revoke token. Reactivate memulihkan link yang belum permanen direvoke. Suspend dan perubahan audit satu transaksi. Disable user memblokir akun/session tetapi tidak otomatis menutup public pages tenant; admin memilih suspend bila diperlukan.
- Untuk long-running AI/import/publish, cek status sebelum provider dispatch dan lagi sebelum final draft/publication commit. Jika suspend terjadi selama provider call, catat biaya yang terjadi; tolak content commit dengan `WORKSPACE_SUSPENDED`. Jangan refund biaya nyata atau mengklaim provider dibatalkan. Permanent unpublish/revoke rules tetap berlaku.
- Public serving resolve token -> workspace -> status -> artifact; setelah async read cek ulang status/token/current version sebelum mengirim bytes. Hindari proxy/CDN cache V1; HTML/OG `no-store`, tidak serve stale saat suspended. Data yang sudah diunduh klien tidak dapat ditarik kembali.
- Kuota writing AI dan places per workspace; batas global provider/concurrency terpisah untuk melindungi satu server. Import tetap ledger biaya terpisah tanpa kuota komersial baru. `ai_live_budget` existing khusus test tidak direset. Migration places mempertahankan counter global lama; tenant counter dimulai dari cutover karena history tidak bisa diatribusi secara jujur.

### 6. React user flows

- Auth gate pada bootstrap sebelum fetch draft/profile/assets. Halaman login, daftar, cek email, reset, setup bisnis, editor dan master panel.
- Login owner verified -> setup/profile bila belum lengkap -> daftar draft. Unverified hanya halaman verifikasi/resend/logout. Master hanya panel admin setelah MFA.
- Logout/account switch: tunggu atau beri keputusan simpan draft; setelah logout clear semua record/asset/AI/import state, query cache dan account-dependent localStorage. Preferences generik dapat dipertahankan; dismiss report/create preferences yang memakai IDs diberi namespace user/workspace.
- Session expired saat mengetik: hentikan autosave, beri prompt login. Jangan hapus draft in-memory atau menyimpan ke akun berbeda. Setelah re-auth, cocokkan user+workspace+revision sebelum menawarkan retry; login akun lain membuang state lama setelah konfirmasi pengguna.
- Semua mutasi melalui API wrapper CSRF; multipart tetap tanpa content-type manual. Saat 401/403/CSRF expired, jangan auto-retry POST yang mungkin sudah committed; reconcile operation ID/revision.
- UI admin: tenant/account list, usage totals, suspend/reactivate reason, limits dan audit. Tidak ada tombol membuka draft tenant, password viewer, atau impersonation.

### 7. Migration, bootstrap dan deployment

- Bootstrap CLI master dengan email+password prompt privat; tidak menerima password via argv/history/seed. Existing master tidak boleh dioverwrite otomatis. Local bootstrap dapat menandai email verified sebagai tindakan operator audited, lalu wajib enrollment MFA.
- Migration workspace existing -> `unclaimed`, owner null; server tidak otomatis membuat workspace/default owner dari `app_meta` lagi. Public routes untuk unclaimed fail closed. Untuk menjaga link live, lakukan binding dalam maintenance window sebelum restart traffic.
- CLI `adopt-workspace` menerima workspace UUID dan user owner UUID yang sudah verified; tampilkan dry-run counts/IDs/hash manifest. Reject jika owner sudah punya workspace, target sudah claimed, user master atau disabled. Binding owner+status+audit atomic dan idempotent untuk pasangan yang sama. Jika signup sudah membuat workspace, CLI harus membuat owner legacy lewat jalur dedicated sebelum adoption; dilarang menghapus workspace signup diam-diam.
- Tambahkan CLI create-legacy-owner terverifikasi operator yang belum punya workspace, hanya untuk adoption. Tidak expose jalur ini ke registrasi publik. Master bootstrap tidak mengklaim data lama.
- Backup stopped full root sebelum migration; rehearsal pada copy, lalu compare draft/asset/version UUID, revisions, hashes, token/revocation tombstones dan ledger. Tidak memindahkan file shared root jika ownership checks sudah memadai.
- Server tetap loopback di belakang reverse proxy HTTPS; produksi `/api` dapat diakses melalui proxy tetapi dilindungi session. Update Caddy/service examples yang sebelumnya share-only. Allowlist Host/origin dan trusted proxy eksplisit. Local HTTP dibatasi loopback.
- Config baru documented: `AUTH_PUBLIC_ORIGIN`, `AUTH_SIGNUP_ENABLED`, `AUTH_LOCAL_HTTP`, `AUTH_ENCRYPTION_KEY_FILE`, `AUTH_RATE_KEY_FILE`, SMTP host/port/user/secret reference, mail-from dan transport mode. Env secrets server-only, tidak `VITE_*`. Keys mandatory saat startup fitur yang membutuhkan; production tidak boleh fallback mail capture/HTTP.
- Outbox runner satu bounded loop dengan DB leases/expiry/retry capped dan graceful shutdown; duplicate email mungkin terjadi setelah crash, token tetap one-use. Maintenance expiry job membersihkan session/tokens/rate rows/mail payload; tenant data tidak ikut dihapus.
- Update build-release runtime packages, CLI files, mail/MFA dependencies dan environment examples. Test cold clean install dari artifact, bukan hanya `tsx` source.

### 8. Tahapan eksekusi serial untuk agent

| Tahap | Deliverable dan gate sebelum lanjut |
|---|---|
| A — Baseline & kontrak | Baca RULES/SPEC/TODO/plan ini; pastikan keputusan login lokal; inventory seluruh route/raw SQL/jobs; baseline commands dan migration fixture. Tulis `docs/native-tenancy-contract.md` dengan endpoint/policy/schema/error matrix. |
| B — DB & tenant repository | Migration identities/workspaces, database lifecycle split, request-store view, CLI legacy dry-run; tests migration/rollback + dua tenant interleaved tanpa HTTP bypass. |
| C — Auth | Password/session/CSRF/verification/reset/MFA/mail outbox/rate limits + CLI master; HTTP positive/negative tests; belum membuka produksi. |
| D — Enforcement | Semua routes/services/files/recovery scoped, public suspend checks, quotas, replay; seluruh isolation matrix pass. Tidak menyisakan owner endpoint legacy tanpa auth. |
| E — React | Auth/account-state UX + editor existing, MFA/master panel dan API client; browser dua owner/master, mobile+desktop. |
| F — Admin & migration rehearsal | Atomic audit/lifecycle/limits, adopt real-data copy, suspend during AI/import/publish, restart/restore evidence. |
| G — Release acceptance | Semua regression/type/build/browser gates, artifact clean start, load sample, docs operator dan completion log. |

Satu tahap Working -> Review -> Test -> Revise hingga gate bersih. Catat stage evidence di `logs/cp038_stage-log_native-multi-tenant-engine.md`; hanya buat `logs/cp038_completion-log_native-multi-tenant-engine.md` setelah seluruh acceptance tercapai. Jangan menandai completed dari unit tests saja.

## Data Flow or Control Flow

```text
Browser React -> same-origin Fastify
  -> session + CSRF (mutations) + account policy
  -> owner workspace from DB -> immutable store/context
  -> itinerary / assets / AI / import / publication -> SQLite + files

Master browser -> session + MFA + admin policy -> metadata/lifecycle + atomic audit
Public share -> token lookup -> workspace active -> artifact read -> status/token recheck
Startup jobs -> explicit system repository -> all-workspace recovery/cleanup
```

## Files and n8n Workflows Affected

Lihat module map §1. Tambahan: `vite.config.ts` bila proxy/auth dev perlu, `.env.web.example`, `deploy/runtime.env.example`, `deploy/Caddyfile.example`, package/lock, runtime tsconfig dan `scripts/web/build-release.mjs`. Tidak mengubah canonical schema untuk menambahkan email/password/tenant; identitas berada di metadata server. Tidak ada n8n workflow atau repo Laravel yang dikerjakan.

## Security and Failure Handling

- Default deny seluruh management routes. Tidak ada query flag/env production/header yang membuka anonymous owner access; test injection store/clock/mail hanya tersedia dalam constructor tests, tidak via HTTP.
- Password/reset/MFA/token tidak muncul di logs, screenshots, audit atau errors. Security headers termasuk CSP untuk shell/auth, no-referrer dan no-store private endpoints; preview sandbox tetap dipertahankan.
- Backup mengandung identitas/secrets terenkripsi: dokumentasikan access permissions dan pemulihan encryption keys terpisah. Secret key rotation harus mendukung data encrypted lama selama masa transisi; jangan kehilangan MFA/outbox setelah rotasi.
- Password hashing, anonymous session, mail dan API limits dibatasi per-account/per-IP dan global. Bounded job/crypto queue gagal dengan 429/503 terstruktur, tidak menjatuhkan proses.
- SQLite busy/IO errors tidak dipetakan ke sukses; transaction rollback, preserve user draft dan operation reconciliation. Tidak ada awaited external call di dalam SQLite transaction.

## Verification Plan

Test baru yang harus dibuat beserta scripts npm sesuai nama pada implementasi:

| Suite | Bukti minimum |
|---|---|
| `test:web-auth` | Register duplicate race, password/dummy hash, verified gate, fixation, expiry/logout/reset revoke, token one-use, origin/CSRF pada login+upload, rate cap, encrypted outbox restart, MFA recovery/replay |
| `test:web-tenancy` | Dua owner satu proses, interleaved async requests; seluruh route foreign IDs/cursors/references/replay 404/409; zero unauthorized provider calls/files writes |
| `test:web-admin` | Owner cannot admin; master no owner bypass; last-master protection; metadata redaction; audit rollback on failure; suspension/disable/reactivate/limits |
| `test:web-tenant-lifecycle` | A cleanup/recovery tidak memengaruhi B, global refs correct, suspend during artifact read/provider await, atomic final commit refusal dan biaya benar |
| `verify:web-tenancy` | Browser sessions A/B/master + anonymous; signup/mail capture/verification/login, lima mode create/import/save/preview/publish, OG, suspend/reactivate/revoke, logout/relogin different owner, MFA dan session expiry unsaved UX |
| `verify:web-tenant-migration` | Legacy DB copy, unclaimed fail closed, explicit adoption, same IDs/hashes/links, malformed references report, repeated migration/adoption, stopped full-root restore |

Existing suites harus diperbarui memakai login/session fixture nyata untuk protected HTTP, bukan mematikan auth global. Unit services boleh inject workspace store. Browser scripts membuat user/workspace sementara; tidak memakai `.runtime` pengguna. Tambahkan `test:web-security` aggregate menjalankan suites auth/tenancy/admin/lifecycle atau dokumentasikan aggregate yang setara.

Full gate: `check:web-types`; `typecheck:web-app`, `typecheck:web-server`, `typecheck:web-contracts`, `typecheck:web-contracts-v2`; seluruh existing web unit suites; build brochure CSS + app; browser editor/create/import/AI/places/preview/publication/retry/E2E dan tenancy/migration; build+validate release; cold artifact smoke auth+upload+import+publish. Baseline errors harus diperbaiki dan dicatat melalui revisi asal bila diwajibkan RULES. Tidak melemahkan assertion untuk hijau.

Screenshot auth/setup/editor/admin pada 390 dan 1280, overflow 360, keyboard focus, field error dan pending state. AI menggunakan doubles; tidak melakukan paid inference. SMTP lokal capture tidak membuktikan production deliverability.

Load gate awal: 10 tenant sintetis, 10 concurrent clients, 100 siklus list/save per client, satu Node. Laporkan p95/error/SQLite busy/CPU/RSS, zero cross-tenant access/lost committed writes; target lokal p95 list/save <1 detik pada host uji yang dicatat. Ukur hashing concurrency dan mail backlog terpisah; jika target gagal, revise/measure, jangan menjanjikan kapasitas produksi.

## Acceptance Criteria

1. Dua bisnis self-register, verifikasi dan login, masing-masing satu owner/workspace; race/retry tidak membuat ganda.
2. Anonymous tidak bisa membaca/mengubah management data; verified owner hanya workspace miliknya; master hanya izin admin yang disebut.
3. Auth/session/CSRF/MFA/email token/limits lulus negative tests dan release artifact memuat dependency runtime yang diperlukan.
4. Seluruh data/files/jobs/recovery/cache/usage/operation replay terisolasi di proses yang sama, termasuk requests overlap.
5. Generator lima mode berfungsi tanpa website driver; autosave/import/AI/publish/revoke tetap correct melalui auth boundary.
6. Suspend mencegah reads/mutations baru dan public HTML/OG; in-flight commit diblokir, biaya nyata dicatat; reactivate dan permanent revoke berbeda.
7. Migrasi existing hanya ke owner yang dipilih; IDs/token/revisions/artifacts dipertahankan dan rollback stopped root berhasil.
8. Master actions mempunyai audit atomik dan tidak memberikan akses konten privat secara default.
9. Semua required gates pass dengan output/screenshot yang diperiksa, completion log ada sebelum TODO completed. Deployment publik tetap pekerjaan terpisah.

## Risks and Rollback

- SQLite: single-process deployment; ukur contention. Migrasi PostgreSQL hanya lewat plan terpisah bila kapasitas menuntut.
- Auth menutup seluruh API lama: update fixtures/client/proxy bersama. Tidak rollback dengan membuka anonymous editor di internet.
- Restore: maintenance stop, restore full SQLite+files backup dan matching release/encryption keys; cek migration version/hash manifest. Restore lama menghilangkan accounts yang dibuat setelah snapshot, sehingga jangan downgrade skema live tanpa maintenance+backup data terbaru.
- Legacy public links sementara unavailable selama unclaimed: maintenance adoption sebelum membuka traffic, preserve URL/token.
- State leaks: jangan mutable global workspace, jangan global cache auth/tenant positif tanpa revocation. Audit semua factory/service closures.

## Handoff dan Hubungan Roadmap

- CP029 Laravel ditandai superseded, bukan completed. CP038 adalah CP baru karena hasil dan implementasinya berbeda; tidak menggunakan nama file Laravel untuk implementasi native.
- CP038 menjadi fondasi SI2/E1b dan dependency sebelum SI3/SI4/SI6/SI7 online integration. SI0 dan review SI1 dapat diselesaikan sesuai gate sendiri.
- CP032 masih in_progress menurut audit. Sebelum eksekusi CP038, tutup dependency review atau dapatkan pengecualian eksplisit; permintaan plan bukan izin memalsukan completion. Tidak memperbaiki seluruh UI import sebagai scope sampingan.
- **Keputusan owner 2026-11-20:** dependency memakai status CP032 `completed` di `TODOS.md` (Linux dan live AI tidak diklaim). Gap itu dicatat sebagai known limitation, bukan blocker. Revisi import `real-world-text-coverage` yang masih `in_progress` bukan dependency CP038.
- Tidak perlu bertanya lagi apakah memakai Laravel atau apakah agency multi-user: dua keputusan itu sudah jelas. Agent hanya perlu keputusan login lokal yang ditandai di atas dan akses SMTP/domain saat benar-benar menuju deployment.
- Laporan setiap tahap wajib: files changed, commands+results, evidence path, unresolved findings dan next stage. Jangan commit/push/deploy tanpa instruksi tersendiri.

## References

- [Node crypto](https://nodejs.org/api/crypto.html): asynchronous scrypt, random salts dan timing-safe comparison.
- [Fastify cookie plugin](https://github.com/fastify/fastify-cookie): cookie hooks dan compatibility matrix; pin saat implementasi.
- [OWASP Session Management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html): session rotation, expiry, cookie flags; SameSite tidak menggantikan CSRF token.

Referensi mendukung mekanisme keamanan, bukan klaim implementasi tersedia. Pilihan parameter, tahapan dan arsitektur adalah desain plan ini.
