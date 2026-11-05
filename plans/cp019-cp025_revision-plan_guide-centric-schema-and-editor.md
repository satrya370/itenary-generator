# CP019–CP025 Revision Plan: Guide-Centric Schema and Editor

**Date:** 2026-11-05. **Status:** planned — not started. No CP is `in_progress`.
**Authority:** `SPEC.md` v3.4, `TODOS.md`, `RULES.md`. This plan supersedes canonical `web-1.0.0` with `web-2.0.0`.
**Executor:** intended to be executed by a smaller model (Claude Haiku). Every design decision is fixed here. **The executor must not invent fields, rename things, or change behavior beyond this document.** If something here is impossible or contradicts the code, stop and use `AskUserQuestion` (see § Executor Rules).
**Affected completed CPs (revision IDs):** CP019 (schema/registry/validator/locales), CP020 (renderer), CP021 (DB/API), CP023 (AI target paths only), CP024 (preview/publish checks), CP025 (publication OG paths), CP022 (editor). The shared file name covers CP019–CP025 because the CP023 and CP025 code paths also change. The user approved a single shared revision plan; CP025 was added after the audit showed `publication.ts` hard-codes v1 paths.
**Priority:** this revision runs **before** CP030–CP032 (import), which must be re-planned against `web-2.0.0` afterwards. CP029 stays last.

## Reason for Revision

The owner reports that the editor is messy, many fields are irrelevant or duplicated, and the four modes are indistinguishable. A read-only audit (2026-11-05) confirmed the following:

1. **The schema is a port of the n8n AI-brochure pipeline, not a guide's mental model.** For example, agency name/contact are stored in the workspace profile, in each draft, and again in `closing.agencyContact`. Scope, pace and themes are duplicated in `overview.quickFacts`. Photo credits are entered per photo and again in `closing.photoCredits`.
2. **Mode-irrelevant fields.** The destination guide asks for a start date. Half and full day each have a block date in addition to the start date. Destination-guide places require duration, best time, getting-there and tips.
3. **Developer jargon in the UI.** Examples: "unresolved", "asset ID", "kredensial: missing". "Jenis destinasi" actually selects a colour palette, and "Tanggal dibuat" is shown as an editable field.
4. **Half day and full day are identical** in the validator and editor. They differ only in a preview duration cap (360 vs 660) and a label. The guide renderer falls back to the `modeFullDay` key (`render.ts:176`).
5. **Fields guides need are missing:** meeting point/time, pickup/drop-off, tour start/end time, trip guide name/contact, and policies.
6. **The editor is hand-coded.** `main.tsx` never reads `field-registry.json`; `editor/coverage.ts` is a hand-kept path list, so the registry's "single source" claim is not enforced.
7. **Backend defects (verified in code):**
   - The `migrations` table is a static insert with no runner (`store.ts:54`, `ai/schema.ts`).
   - `schema_version` is never updated on save (`store.ts:88`).
   - `listItineraries` sorts by random UUID instead of `updated_at` (`store.ts:94-95`).
   - The publish `pending` row and the `mkdir` calls run outside try/transaction, so an operation can get stuck as `pending`, and a concurrent same-`operationId` request returns 500 (`publication.ts:136,165`).
   - `GET /api/v1/assets/:id` returns 500 when the file is missing (`app.ts:252`).
   - `changeMode` does not clear `overview.routeSummary`/`brochure.endDate`, which stay hidden but are still rendered (`model.ts:73-90`, `render.ts:247,254`).

## Clarifications and Decisions

Structured Ask Question, 2026-11-05 (two rounds after the import discussion):

| ID | Decision |
|---|---|
| R-1 | Problem = field/form design and UI; DB/BE may also be faulty. Prioritise this revision over CP030–CP032. |
| R-2 | Depth: **schema + UI overhaul** (new `web-2.0.0`), not a UI-only cosmetic fix. |
| R-3 | **Keep 4 modes.** Half vs full day differ by **duration cap + meals**: half day ≤ 6 h with no meals section; full day ≤ 12 h with meals. The mode cards explain the difference, and the half-day output layout is more compact. |
| R-4 | **Add:** meeting point and time; pickup/drop-off; trip guide name and contact; policies/terms (free text). Prices remain excluded (D11). |
| R-5 | **Remove from the form and the schema:** derived duplicates (quickFacts scope/pace/themes, closing agency contact, manual closing photo credits, generated date); traveller profile (count, type, pace); themes and "destination type" (replaced by a simple colour theme); highlights and best season. |
| R-6 | Destination-guide place: **required = name, area, description.** Everything else is optional. |
| R-7 | One shared revision plan (this file); a revision section is appended to each affected CP's completion log. |
| R-8 | Existing data: **migrate drafts automatically to `web-2.0.0`; published snapshots stay as their immutable HTML.** Republish uses v2. |
| R-9 | **Gated stages** R1…R6, each with mandatory verification commands that must pass before the next stage. |

Planner defaults (fixed for the executor; the user may override **before** R1 starts):

- PD-1: Condensed day ranges (`dayStart`–`dayEnd`, `isCondensed`) are removed; multi-day has one entry per day (2–14 days). Migration turns a range block into one day plus a warning (see mapping).
- PD-2: Agency name/contact/logo are **not stored in drafts**. The renderer reads them from the workspace profile at preview/publish time. Published HTML freezes them.
- PD-3: Times are structured: `"HH:MM"` (24 h) or `null`. Durations are `durationMinutes` integers or `null`. This replaces free-text `timeLabel`/`durationLabel`.
- PD-4: Colour theme reuses the existing palette keys in `config/palettes.json` (`beach, mountain, city, cultural, nature, desert, mixed`). The UI shows them as colour swatches with colour names, never as "destination type".
- PD-5: Missing meeting point (with no pickup offered) on half/full/multi-day is a **publish warning**, not an error (W12 style).
- PD-6: AI description target kind is renamed `spot` → `place`. The AI DB CHECK constraints are unchanged (`target_kind` has no CHECK).
- PD-7: Deleting drafts is **not** added (retention policy W13 requires a separate decision). It is listed as a follow-up.
- PD-8: The legacy n8n adapter (`legacy-adapter.ts`) is kept and still outputs v1. Tests pipe it through `upgradeV1ToV2`. It is not used at runtime.

## Existing Behavior

See § Reason for Revision. Summary: `web-1.0.0` uses `brochure/hero/overview/schedule/spots/practical/closing`, 89 registry paths, a hand-coded editor, fake migrations, and published snapshots served from immutable HTML files with sha256 (`snapshot_json` is written but never read).

## Required Behavior

### Canonical `web-2.0.0` (authoritative shape)

All string fields are trimmed. `null` means "not provided". "Applies to" lists the modes in which the field may be non-empty. In other modes it **must** be `null`/`[]`/`false`; `validateDraft` reports `FIELD_NOT_APPLICABLE` as an **error** for these, so hidden data can never be saved.

```ts
type Mode = 'half_day' | 'full_day' | 'multi_day' | 'destination_guide';
type HHMM = string;            // /^([01]\d|2[0-3]):[0-5]\d$/
type PhotoCredit = { photographer: string; url: string | null; source: string }; // photographer≤240, url≤2048 https only, source≤120
type Photo = { assetId: string; credit: PhotoCredit | null } | null;

interface ItineraryV2 {
  schemaVersion: 'web-2.0.0';
  trip: {
    mode: Mode;
    title: string;               // ≤200, publish-required
    destination: string;         // ≤200, publish-required (city/area)
    country: string;             // ≤120, publish-required
    region: string | null;       // ≤200
    language: string | null;     // BCP 47 ≤35, publish-required; mirrors languageContext.outputLanguage
    colorTheme: 'beach'|'mountain'|'city'|'cultural'|'nature'|'desert'|'mixed'; // default 'mixed'
    startDate: string | null;    // YYYY-MM-DD; applies to half_day, full_day, multi_day
    startTime: HHMM | null;      // applies to half_day, full_day
    endTime: HHMM | null;        // applies to half_day, full_day; must be > startTime when both set
  };
  guide: { name: string | null; phone: string | null };   // ≤160 / ≤80; all modes; optional
  meeting: { place: string | null; mapsUrl: string | null; time: HHMM | null; note: string | null }; // applies to half/full/multi; place≤240, mapsUrl https≤2048, note≤500
  pickup: { offered: boolean; area: string | null; time: HHMM | null; dropoffNote: string | null }; // applies to half/full/multi; area≤200, dropoffNote≤500; area/time/dropoffNote must be null when offered=false
  cover: Photo;                   // hero; null ⇒ gradient from colorTheme
  summary: string;                // ≤4000, publish-required, AI-assisted ("overview")
  days: Day[];                    // half_day/full_day: exactly 1; multi_day: 2–14; destination_guide: []
  places: Place[];                // destination_guide: 1–60; other modes: []
  included: string[];             // ≤40 items ≤300
  notIncluded: string[];          // ≤40 items ≤300
  whatToBring: string[];          // ≤40 items ≤300
  localTips: string[];            // ≤30 items ≤600
  healthSafety: string[];         // ≤30 items ≤600
  emergencyContacts: { label: string; value: string }[]; // ≤10; label≤120 value≤160
  policies: string | null;        // ≤4000 (cancellation, weather, children, etc.)
  closingNote: string | null;     // ≤2000
  disclaimer: string | null;      // ≤2000
}
interface Day {
  id: string;                     // uuid v4, stable
  dayNumber: number;              // 1..n contiguous in array order (derived; recomputed on save)
  title: string;                  // ≤200; publish-required for multi_day only
  location: string | null;        // ≤240
  photo: Photo;
  activities: Activity[];         // 1–30, publish-required ≥1
  hotel: { name: string; area: string | null; note: string | null } | null; // multi_day only; name≤200 area≤200 note≤1000
  meals: { breakfast: boolean; lunch: boolean; dinner: boolean } | null;    // full_day & multi_day; must be null for half_day
  transferNote: string | null;    // multi_day only; ≤1000 (inter-city transfer)
}
interface Activity {
  id: string;                     // uuid v4, stable
  time: HHMM | null;              // start time
  durationMinutes: number | null; // 1..1440
  kind: 'sightseeing'|'food'|'activity'|'transport'|'free';
  title: string;                  // ≤200, publish-required
  place: string | null;           // ≤200 (venue/area)
  description: string;            // ≤4000, publish-required, AI-assisted
  tip: string | null;             // ≤1000
}
interface Place {
  id: string;                     // uuid v4, stable
  group: string | null;           // ≤160 (area/theme group)
  name: string;                   // ≤200, publish-required
  area: string;                   // ≤160, publish-required
  description: string;            // ≤4000, publish-required, AI-assisted
  tips: string[];                 // ≤10 items ≤600, optional
  gettingThere: string | null;    // ≤1000
  suggestedDuration: string | null; // ≤80 free text ("1–2 jam")
  bestTime: string | null;        // ≤120 free text ("pagi hari")
  nearby: string | null;          // ≤200
  photo: Photo;
}
```

Derived at render time (never stored): agency name/contact/logo (from the profile), the scope label, the day count, end date (`startDate + days − 1`), the route summary (ordered activity places/titles or place names), photo credits (collected from `cover`, `days[].photo`, `places[].photo`), and the generated date (preview/publish date).

### Mode rules (validateForPublish errors unless marked warning)

| Rule | half_day | full_day | multi_day | destination_guide |
|---|---|---|---|---|
| days count | 1 | 1 | 2–14 | 0 |
| places count | 0 | 0 | 0 | 1–60 |
| span cap (first activity time → max(time+duration), or startTime→endTime) | ≤ 360 min | ≤ 720 min | per day ≤ 960 min | n/a |
| meals | must be null | allowed | allowed | n/a |
| hotel / transferNote | null | null | allowed | n/a |
| startDate/startTime/endTime/meeting/pickup | allowed | allowed | startDate/meeting/pickup allowed; startTime/endTime null | all null/false |
| no meeting.place and pickup.offered=false | warning `MEETING_POINT_MISSING` | warning | warning | n/a |
| activity time missing | warning (W12) | warning | warning | n/a |
| activity times not ascending within a day | error `ACTIVITY_ORDER` | error | error | n/a |

Span-cap rule: only **provable** violations are errors. Unknown times/durations produce W12 warnings, never guesses (this preserves CP024 revision V27-01 semantics).

### Editor behaviour

- New draft = **4 mode cards** (no dropdown). Card texts (Indonesian, exact):
  - **Setengah hari** — "Tur ±4–6 jam dengan titik kumpul dan jadwal per jam. Tanpa makan." Example: "City tour pagi Yogyakarta".
  - **Sehari penuh** — "Tur hingga ±12 jam dengan jadwal per jam dan makan yang termasuk." Example: "Bromo sunrise & kawah".
  - **Beberapa hari** — "2–14 hari; tiap hari punya jadwal, hotel, makan dan perpindahan." Example: "Bali 5 hari 4 malam".
  - **Panduan destinasi** — "Kumpulan tempat rekomendasi per area, tanpa tanggal dan jam." Example: "Panduan kuliner Bandung".
- Each mode has a distinct colour badge (list, header, cards): half = amber, full = teal, multi = indigo, guide = rose.
- Editor sections in order. Only applicable sections render for the active mode:
  1. **Informasi trip**: title, destination, country, region, language, colour theme (swatches), startDate (not for the guide).
  2. **Waktu & titik kumpul** (half/full): startTime, endTime, meeting (place, maps link, time, note), pickup (toggle → area, time, drop-off note). Multi-day shows meeting + pickup without start/end time. Hidden for the guide.
  3. **Guide trip**: name, phone (optional; helper text: "kosongkan jika sama dengan kontak agensi").
  4. **Foto sampul**: asset picker; credit fields appear only after a photo is chosen.
  5. **Ringkasan** + "Buat dengan AI".
  6. Half/full: **Jadwal** (one day, activity list; full day also shows meal checkboxes for breakfast/lunch/dinner). Multi: **Hari demi hari** (add/remove/reorder days; per day: title, location, photo, activities, hotel, meals, transfer). Guide: **Tempat** (grouped by `group`; required name/area/description; optional fields inside a collapsed "Detail tambahan").
  7. **Info praktis**: included, not included, what to bring, local tips, health & safety, emergency contacts.
  8. **Ketentuan & penutup**: policies, closing note, disclaimer.
  9. **Bantuan AI** (collapsed panel at the end, not mid-form): brief + fact notes, provider check.
- Removed from the UI: agency fields inside the draft (shown read-only as "Dari profil agensi: … · Ubah profil"), Tanggal dibuat, every "(turunan)" field, travellers, pace, themes, highlights, best season, closing photo credits and contact.
- `changeMode` clears every field that does not apply to the new mode. The existing data-loss confirmation lists them in plain words.
- The draft list is sorted by last update. Each row shows: title or "Tanpa judul", the mode badge, and "diubah <tanggal relatif>".
- Plain-language status copy. Replace exactly:

| Old | New |
|---|---|
| "Bahasa unresolved; pilihan auto belum di-resolve. Manual copy tidak diterjemahkan." | "Bahasa belum dipilih. Pilih bahasa atau klik 'Deteksi otomatis'. Teks Anda tidak akan diterjemahkan." |
| "Status kredensial server: missing · Usage diperiksa saat preflight." | "AI belum aktif: kunci API belum diatur di server. Semua field tetap bisa diisi manual." |
| "Model target: openai/gpt-6-luna. Key tidak dikirim ke browser." | (remove from main UI; keep only inside the Bantuan AI panel as "Model: GPT-6 Luna") |
| "1 aset tersedia; asset ID disimpan di draft." | "1 foto tersedia." |
| "Hero memakai gradien; foto tidak akan ditampilkan." | "Belum ada foto sampul — halaman memakai warna tema." |
| "Manual edit tetap tersedia; simpan draft dan pilih bahasa sebelum AI." | "Simpan draft dan pilih bahasa dulu untuk memakai AI." |

- The registry drives labels, required markers and visibility. `main.tsx` must import `config/web/field-registry.json` (v2) and use a helper `fieldMeta(path)` for the label key, `requiredOnPublish` and `modes`. The editor test must assert, per mode, that every registry path applicable to that mode with control ≠ `hidden|derived` has a rendered control (`data-field-path` attribute), and that no non-applicable path is rendered.

## Proposed Changes

Stages run strictly in order. Before starting stage N, change the matching CP status in `TODOS.md` to `in_progress` (only one at a time). After the gate passes, append the revision section to that CP's completion log, set the CP back to `completed`, then start the next stage.

### R1 — Contract v2 (CP019)

Files:
- `config/web/itinerary.schema.json`: rewrite to the shape above (draft 2020-12, `additionalProperties:false` everywhere, `schemaVersion` const `web-2.0.0`). Use plain nullable unions, not nullable `$ref` intersections.
- `scripts/web/generate-types.mjs` → regenerate `src/contracts/itinerary.generated.d.ts`. The output must have no `X & X1` intersection types; fix the generator config if needed.
- `src/contracts/types.ts`: export `ItineraryV2`, `Mode`, `Day`, `Activity`, `Place`, `Photo`. Keep `WebItineraryContent` as an alias of v2.
- `config/web/field-registry.json`: rewrite for v2, one entry per leaf path with `path, labelKey, control, source, modes, requiredOnPublish`. Remove `notRenderedReason` entries for deleted fields.
- `src/contracts/validator.ts`: rewrite `validateDraft` (structure + `FIELD_NOT_APPLICABLE` + dayNumber recompute + `trip.language` mirror) and `validateForPublish` (mode rules table). Remove all derived-duplicate sync code.
- New `src/contracts/upgrade-v1.ts`: pure `upgradeV1ToV2(v1, profile)` → `{ value, warnings }` using the mapping table below. Never throws on a valid v1. Returns warnings for dropped/lossy data.
- `src/contracts/field-coverage.ts`: keep generic; verify against the v2 schema.
- `config/web/locales/{la,fr,en,id,ja,zh-Hans}.json`: remove keys for deleted fields; add keys for the new fields/sections (`meetingPoint, meetingTime, mapsLink, pickup, pickupArea, pickupTime, dropoffNote, guideName, guidePhone, policies, startTime, endTime, meals, breakfast, lunch, dinner, hotel, transferNote, durationMinutes, colorTheme, dayTitle, placeGroup, bestTime, nearby`). Every locale must have all keys. Write natural translations; for `la` use classical Latin terms (consistent with the existing la catalog).
- `src/server/draft.ts`: `createBlankDraft(mode)` returns a valid v2 draft per mode (half/full: one day with one empty activity; multi: two days; guide: zero places).

v1 → v2 mapping (used by `upgradeV1ToV2`):

| v1 | v2 | Notes |
|---|---|---|
| `brochure.tripTitle/destination/country/region` | `trip.title/destination/country/region` | |
| `brochure.itineraryMode` | `trip.mode` | |
| `brochure.outputLanguage` | `trip.language` | |
| `brochure.destinationType` | `trip.colorTheme` | same key |
| `brochure.startDate` | `trip.startDate` | null for guide (warning if dropped) |
| `brochure.agencyName/Contact/LogoAssetId`, `closing.agencyContact` | dropped | if a draft value differs from the workspace profile, warning `AGENCY_VALUE_DROPPED` |
| `travelerCount/Type`, `paceLevel`, `themes`, `scopeLabel`, `durationDays`, `generatedDate`, `endDate`, `overview.quickFacts.*`, `overview.highlights`, `overview.routeSummary`, `hero.gradientOnly`, `closing.photoCredits` | dropped | warning per non-empty dropped value (except derived ones) |
| `hero.assetId + photoAttribution` | `cover` | credit null if photographer empty |
| `overview.summary` | `summary` | |
| `schedule[]` | `days[]` | block with `dayEnd>dayStart` → one day; title prefixed "Hari {start}–{end}: " + warning `DAY_RANGE_COLLAPSED` |
| `schedule[].date` | dropped | warning if it differs from the start date + offset |
| `schedule[].assetId+photoAttribution` | `days[].photo` | |
| `schedule[].accommodation` | `days[].hotel` | null if name empty; area/note copied |
| `schedule[].mealsIncluded[]` | `days[].meals` | case-insensitive match on breakfast/sarapan/pagi, lunch/makan siang, dinner/makan malam; unmatched → warning; half_day → null |
| `schedule[].transportNote`, `blockTip` | multi: `transferNote` (joined); half/full: appended to the last activity tip | warning |
| `activities[].timeLabel` | `time` | parse first `H:MM`/`HH:MM`/`HH.MM`; otherwise null + warning `TIME_UNPARSED` (and the original text appended to the tip) |
| `activities[].durationLabel` | `durationMinutes` | parse "N jam/hours/h", "N menit/min/m", "N jam M menit"; otherwise null + warning, original appended to tip |
| `activities[].type` | `kind` | `rest`/`accommodation` → `free` |
| `activities[].area` | `place` | |
| `activities[].category` | dropped (appended to tip if non-empty) | |
| `spots[]` | `places[]` | `groupLabel→group`, `bestTimeToVisit→bestTime`, `nearbyPairing→nearby`, photo |
| `practical.localTips[{topic,note}]` | `localTips[]` | "topic: note" |
| `practical.*` (other) | same names at root | |
| `closing.closingNote/disclaimer` | `closingNote/disclaimer` | empty string → null |
| — | `guide`, `meeting`, `pickup`, `policies`, `trip.startTime/endTime` | null/false defaults |

**Gate R1:** `npm run check:web-types && npm run typecheck:web-contracts && npm run test:web-contracts`. The contracts tests are rewritten for v2 and must include:
- a valid and an invalid fixture per mode;
- `FIELD_NOT_APPLICABLE` for each mode-exclusive field;
- span caps 360/720/960 with known and unknown times;
- ascending-time rule;
- registry ↔ schema leaf coverage;
- `upgradeV1ToV2` on every existing v1 fixture in `tests/web/fixtures.ts` and `tests/fixtures/web/legacy-full-day.json` (through `adaptLegacyDocument`) producing valid v2 drafts, with the expected warnings asserted.

### R1 amendment 2026-11-05 (after review `logs/cp019_review-log_r1-guide-centric-schema.md`) — overrides R1 above where they differ

0. **Precondition:** the owner-approved baseline commit exists (review B1), and the dev servers on ports 3000/5173 are stopped. Write files with the Write/Edit tools, never bash heredocs.
1. **Freeze v1 first, before touching anything else:**
   - rename `config/web/itinerary.schema.v1.backup.json` → `config/web/itinerary.schema.v1.json`;
   - copy the current `src/contracts/itinerary.generated.d.ts` → `src/contracts/itinerary-v1.generated.d.ts` and change only its banner comment to "Frozen v1 declaration; do not regenerate";
   - export `type ItineraryV1 = StandaloneItineraryContent` from that file via `src/contracts/types.ts`.
2. **Schema rules:**
   - every object lists **all** its keys in `required` (including `trip.region`, `photo.assetId/credit`, `hotel.*`, `meals.*`);
   - URLs (`meeting.mapsUrl`, `photoCredit.url`) add `"pattern": "^https://"`;
   - `days.maxItems: 14`, `places.maxItems: 60`;
   - **no** `minItems` on `day.activities` (draft may hold 0 activities; ≥1 is a publish rule);
   - no `default` keywords;
   - **never** put sibling keywords next to `$ref`;
   - nullable objects are defs with `"type": ["object","null"]` referenced by a bare `$ref` (do not use `anyOf`).
3. **Types:** regenerate with `node scripts/web/generate-types.mjs --print > src/contracts/itinerary.generated.d.ts`, then `--check` must pass. The output must contain no ` & ` intersection between generated interfaces. `types.ts` exports `ItineraryV2` (= the generated root type), `WebItineraryContent = ItineraryV2`, `ItineraryV1`, `Mode`, `Day`, `Activity`, `Place`, `Photo`, `ItineraryMode = Mode`.
4. **Registry:**
   - keep the `modes` vocabulary `"all" | "scheduled" | Mode[]`;
   - keep `displayLabelKeys`, and add `legacyLabelKeys`: every key currently in the catalogs that is neither a v2 field `labelKey` nor a `displayLabelKeys` entry;
   - the catalog-parity test expects keys = labelKeys ∪ displayLabelKeys ∪ legacyLabelKeys;
   - `legacyLabelKeys` and their catalog entries are deleted in R3.
5. **Locales:** **add only** (no deletions in R1). New keys are the 24 listed in R1 plus any new v2 field `labelKey` the registry introduces; all six catalogs get identical key sets.
6. **Validator:**
   - `validateDraft` validates `trip.language` only as a BCP 47 tag and returns `value` with `days[i].dayNumber = i + 1`. It does **not** read `languageContext`;
   - `FIELD_NOT_APPLICABLE` is a draft **error**, using the "Applies to" rules in Required Behavior. Example: a guide with any non-null `startDate`/`startTime`/`endTime`/`meeting.*` or with `pickup.offered=true`/non-null pickup fields, or `days.length>0`;
   - `validateForPublish` implements the Mode rules table;
   - remove all v1 derivation/sync code (scopeLabel, quickFacts, closing contact, durationDays).
7. **Upgrade mapping additions:**
   - **preserve every stable ID** (day = v1 block id, activity id, place = v1 spot id);
   - if `trip.startDate` is null and the first v1 block has a `date`, use it as `startDate`;
   - a collapsed range warning message states the old and new day count (`DAY_RANGE_COLLAPSED`);
   - a photo with no `assetId` but a non-empty attribution → `null` + `PHOTO_CREDIT_WITHOUT_PHOTO`;
   - v1 blocks with zero activities stay with zero activities (valid draft).
8. **`createBlankDraft(mode, _profile?)`:** keep the optional second parameter (ignored) so `app.ts` still compiles until R2.
9. **Amended gate R1:** create `tsconfig.contracts.json` (same compilerOptions as `tsconfig.web.json`; `include`: `src/contracts/**/*.ts`, `src/server/draft.ts`, `tests/web/contracts.test.ts`, plus any new v2 fixture module used by it), and add the npm script `typecheck:web-contracts-v2`. Then run:
   - `npm run check:web-types && npm run typecheck:web-contracts-v2 && npm run test:web-contracts`.

   The full `typecheck:web-contracts` (`tsconfig.web.json`) is **not** an R1 gate; it becomes an R6 gate. Record the command output in the CP019 revision log only after the reviewer accepts.

### R2 — Persistence, API and backend fixes (CP021, CP023 paths)

- `src/server/store.ts`: replace the static migrations insert with a **runner**. It takes an ordered array `{ version, up(db) }` and runs each pending migration inside `BEGIN IMMEDIATE … COMMIT`, recording it in `migrations`. Versions 1 and 2 = the existing DDL (idempotent). The AI schema DDL moves into the runner as version 2 (it currently inserts 2 itself; keep the result identical). **Version 3** = upgrade every `itineraries` row whose `schema_version='web-1.0.0'` via `upgradeV1ToV2(draft, profile)`, then:
  - write `draft_json` and `schema_version='web-2.0.0'`;
  - **do not bump `revision`**, so open editors are not forced into a conflict;
  - store the warnings in a new `app_meta` key `migration3_warnings` as JSON `{ itineraryId: [codes] }`.

  Before version 3 runs, copy the SQLite file (after a WAL checkpoint) to `<dataDir>/backups/pre-migration-3.sqlite`. Do not overwrite if it already exists. If any row fails to upgrade, roll back the whole migration and refuse to start with a clear error.
- `store.updateItinerary` and `createItinerary`: write `schema_version` from the content.
- `listItineraries`: `ORDER BY updated_at DESC, id DESC`. The cursor is an opaque base64url of `updated_at|id`. Keep `limit`. Return `mode` from `trip.mode` and `title` from `trip.title`.
- `src/server/app.ts`:
  - create/patch use the v2 validators;
  - `assetIds()` reads `cover`, `days[].photo`, `places[].photo`;
  - the agency logo comes from the profile;
  - `GET /api/v1/assets/:id` wraps `readFile`: ENOENT → `404 ASSET_FILE_MISSING`.
- `src/server/publication.ts`:
  - insert the `pending` operation row and run the `mkdir`s inside the existing try/transaction scope, so any throw marks the operation `failed`;
  - a duplicate `operationId` insert (PK conflict) returns the stored operation result (replay) or `409 PUBLISH_IN_PROGRESS`, never 500;
  - replace the hard-coded `'web-1.0.0'` with the constant from `src/contracts/types.ts`;
  - OG title/description/image use `trip.title`, `summary`, `cover`.
- `src/server/ai/service.ts`: context builders read v2 paths (`summary`, `days[].activities[]`, `places[]`). Target kind `spot` → `place` in the API body and in `findTarget`. The AI tables and the US$2 ledger logic are untouched.
- `src/api/client.ts`: v2 DTO types; list cursor is opaque.

**Gate R2:** `npm run typecheck:web-app && npm run test:web-api && npm run test:web-publication && npm run test:web-ai`. Tests must be updated or added for:
- migration runner idempotency (run twice → no-op);
- v1 rows upgraded with the backup file created;
- a failing upgrade rolls back and leaves the DB unchanged;
- list order by `updated_at`;
- missing asset file → 404;
- duplicate publish `operationId` → no 500;
- a thrown `mkdir` → operation `failed`, not `pending`;
- the AI ledger unchanged by the migration.

Also run the app once against a **copy** of the real local data root: `ENGINE_DATA_DIR=<copy-path> PORT=3100 npm run start:web-app` (first copy the default data root `.runtime/` to a temp folder; `.runtime/` itself must not be touched until R2 passes). Confirm that existing drafts list and open, and that existing `/i/:token` links still serve.

### R2 amendment 2026-11-05 (recorded by the executor while running R2; the reviewer confirms or rejects) — overrides R2 above where they differ

The R2 gate as written cannot pass: `typecheck:web-app` compiles `preview.ts`, `render.ts` and the editor, and `test:web-publication` renders through them; all stay v1 until R3–R5. The amended R2 gate is:

1. `npm run check:web-types && npm run typecheck:web-contracts-v2 && npm run typecheck:web-server` — `typecheck:web-server` runs `scripts/web/typecheck-scope.mjs tsconfig.app.json src/server src/contracts src/api !src/server/preview.ts`, failing only on diagnostics inside those paths. R3–R5 reuse the script with their own scope; the full `typecheck:web-app` returns as the R6 gate.
2. `npm run test:web-contracts && npm run test:web-store && npm run test:web-api && npm run test:web-publication && npm run test:web-ai`.
3. Publication and API tests run against a renderer double (`tests/web/test-renderer.ts`) injected through the new `renderPreview` option of `createApp` / `render` input of `publishSavedRevision`. The double applies the real v2 `validateDraft`/`validateForPublish`, so publish gating is genuine; only the layout is stubbed. R4 must re-run the publication flow with the real renderer.
4. Run against a **copy** of `.runtime/` (done: 6 v1 drafts, 0 published versions) and compare with the original.

R2 deviations from the plan text:

| ID | Deviation | Reason |
|---|---|---|
| E1 | The "same `operationId` concurrent request returns 500" finding is not reproducible within one process: the prior-operation check and the pending insert run in one synchronous segment. The real 500 was an `operationId` already held by **another workspace** (the table's only key is `id`). Fixed: any insert conflict resolves to the stored operation or `409 PUBLISH_OPERATION_CONFLICT`. | Verified by test; the fix covers both causes. |
| E2 | Backup uses SQLite `VACUUM INTO` (a consistent snapshot in any journal mode) instead of file copy + WAL checkpoint. It is taken only when v1 drafts exist and never overwrites an existing backup. | Safer and simpler; behaviour matches the plan's intent. |
| E3 | `ensureAiSchema` is split into `AI_SCHEMA_DDL` (migration 2) and `recoverInterruptedAiOperations` (runs at every start). | The recovery is not DDL. The resulting tables and ledger rows are identical. |
| E4 | Legacy `ai_operations.target_kind = 'spot'` rows are not rewritten. New requests use `place`; an old operation ID can no longer replay (its fingerprint differs), which is the existing conflict behaviour. | Acceptance #9: the ledger must not change. |
| E5 | New error code `INVALID_CURSOR` (422) for forged list cursors; `listItineraries` returns `{ items, nextCursor }` and fetches `limit + 1` rows so the last page has no cursor. | Opaque cursor needs a rejection path. |
| E6 | The AI provider context payload changes shape (`themes` and `category` removed; activity target carries `activityKind`; place target uses `bestTime`/`nearby`). | Source fields no longer exist. No live provider call was made, so output quality on v2 context is unverified. |

### R1/R2 revision round 1 (reviewer, 2026-11-05) — must pass before R3 starts

Source: joint review in `logs/cp019_review-log_r1-guide-centric-schema.md` (findings F1–F6). Correction to "R1 amendment" item 2: nullable objects use **`anyOf: [{$ref}, {type: "null"}]`** at the use site (deviation D4 accepted); `collectSchemaLeafPaths` follows `anyOf`.

**RV1 — exact-match label parsing (F1).** In `src/contracts/upgrade-v1.ts`, a label is mapped only when the **whole trimmed label** matches an accepted form; otherwise the field stays `null`, a warning is emitted, and the original text goes to a private note (RV3). Never pick a number out of a longer label.
- Time label accepted forms: single time `H:MM | HH:MM | H.MM | HH.MM`; or a range `<time> <sep> <time>` with sep `-`, `–`, `—`, `to`, `s.d.`, `sampai` (spaces optional). A range sets `time` = start and, when the activity has no readable duration label and end > start, `durationMinutes` = end − start. If the duration label is also readable and disagrees with the range, keep the duration label's value and add a `TIME_RANGE_CONFLICT` warning + note.
- Duration label accepted forms (case-insensitive, optional leading `±`/`~`/`about`/`sekitar`/`kurang lebih` is **not** accepted, because it is an estimate): `N (jam|hour|hours|hr|hrs|h)`, `N (menit|minute|minutes|min|mins|m)`, `N jam M menit`, `N hours M minutes`, `NhMm`, `NhM`, decimal hours `N.5 jam/hours` (comma allowed). Ranges (`2-3 hours`) and anything else → `null` + `DURATION_UNPARSED`.
- Result must be 1–1440 minutes, else `null` + warning.
- Tests (add to `tests/web/contracts.test.ts`): every probe case from F1 with its expected result: `1h30m`→90; `2-3 hours`→null + note; `1–2 jam`→null + note; `about 30 min + 15 min transfer`→null + note; `10:00 - 12:00`→10:00 and 120 when no duration label; `Pagi 8.30 - 11.00`→null time + note (extra word); `08:00`+`1.5 hours`→90. Add a test that a parsed value never coexists with discarded text.

**RV2 — independent meal matching (F2).** Each meal entry is tested against breakfast, lunch and dinner **independently** (no `else`). An entry is `MEAL_UNMATCHED` (and goes to a private note) only when it matches none. Tests: `Breakfast & dinner` → breakfast + dinner; `Makan siang dan makan malam` → lunch + dinner; `Picnic` → note + warning.

**RV3 — leftovers to private notes, not public text (F6, owner decision).**
- `upgradeV1ToV2` returns `{ value, warnings, notes }`, where `notes: Array<{ targetId: string; text: string }>`.
- Unreadable time label, unreadable duration label, range conflicts, unmatched meals, activity `category` and place `category` produce notes, **not** tip text. Remove every `Waktu:`/`Durasi:`/`Kategori:` append from public fields.
- targetId is the activity id (time/duration/category), the day id (meals) or the place id (place category). Note text format: `<field>: <original text>`, using the v1 field names `timeLabel`, `durationLabel`, `mealsIncluded`, `category` (private, language-neutral).
- Block `transportNote`/`blockTip` handling stays as R1 implemented it (they were public in v1).
- Migration 3 merges notes into `writing_json.notes` (existing notes kept, in order; new notes appended).
  - One note per targetId: concatenate that target's lines with `\n`, max 4000 characters.
  - Never exceed 100 notes total. If the merged list would exceed 100, collapse **all** migration notes into a single note with targetId `itinerary` (still ≤ 4000 characters; if longer, truncate with warning `NOTES_TRUNCATED`).
  - `writing_json` must still pass `validWriting` in `app.ts` (keys `brief`/`notes`, brief ≤ 20000, ≤ 100 notes, text ≤ 4000). Assert this in a test by re-reading the row.
- Update the store migration tests: `writing_json` is unchanged when the upgrade yields no notes, and gains the expected notes otherwise. Add a test with existing notes plus migration notes that would exceed 100.

**RV4 — localized day-range title (F6, owner decision).**
- Add catalog key `dayRange` to all six catalogs: en `Days {start}–{end}`, id `Hari {start}–{end}`, fr `Jours {start}–{end}`, ja `{start}–{end}日目`, la `Dies {start}–{end}`, zh-Hans `第{start}–{end}天`. Add it to `displayLabelKeys`.
- The upgrade looks up the catalog for `brochure.outputLanguage` through `getLocaleCatalog`. Title = `<template filled>: <old title>` (or the template alone if the old title is empty). With no language or no catalog: `<start>–<end>: <old title>`.
- Test: `en` → `Days 2–3: Ubud`, `ja` → `2–3日目: Ubud`, `null` language → `2–3: Ubud`.

**RV5 — ensure AI tables on every start (F3).**
- After migrations, `openStore` executes `AI_SCHEMA_DDL` (idempotent `CREATE … IF NOT EXISTS` / `INSERT OR IGNORE`) every time, so a root recorded at version 2 without AI tables recovers. Do not add a migration version for this.
- Test: build a root with core DDL and versions (1),(2) but no AI tables. `createApp` starts, the AI tables exist, and the ledger row is `(1, 2, 0)`.

**RV6 — close the store on failed startup (F4).** Wrap everything in `createApp` after `openStore` so any thrown error closes the store before rethrowing. Test: inject a failing `aiProvider` construction path or `recoverPublication` failure, assert the error propagates and the data directory can be deleted (or the SQLite file reopened exclusively).

**RV7 — narrow the conflict catch (F5).**
- In `publication.ts`, only treat SQLite constraint failures (`error.code === 'ERR_SQLITE_ERROR'` with `errcode` 19 / message containing `UNIQUE constraint failed`) as an operation-ID conflict. Check what `node:sqlite` actually reports and assert on that.
- Rethrow anything else: before the pending row exists it surfaces as a 500 with no row left behind; inside `execute` the existing terminalization applies.
- Test with a `BEFORE INSERT` trigger raising `ABORT` (not a constraint): publish must not answer 409, and no `pending` row may remain.

**Gate for this round:** the amended R2 gate, plus all new tests, plus a re-run of the real-data **copy** check (`.runtime/` copied to a temp folder; original untouched): 6/6 drafts valid, IDs/revisions/timestamps unchanged; `b25d1f08` title uses the `en` template if its language is `en`; its category/label leftovers, if any, appear only in `writing_json.notes`; AI ledger identical. Commit as `CP019/CP021 revision: R1/R2 round 1 fixes`. Hand back to the reviewer.

**Carried into later stages (do not do now):** R3 must not print an empty hotel name. R4 adds the `HOTEL_NAME_EMPTY` publish warning, restores v1 preview overlap checks against v2 times, and re-runs the publication suite with the real renderer. R5 renders the `time`/`toggle` controls, honours `requiredModes`, and clears pickup details/mode-specific fields before save.

### R3 — Renderer (CP020)

- `src/render/render.ts`: render from v2. `RenderOptions` gains `agency: { name, contact, logo }` (resolved by the caller from the profile). Sections:
  - hero: title, destination, scope label by mode — fix the guide using `modeDestinationGuide`;
  - **trip info strip**: date(s), start–end time, meeting point + time (+ maps link), pickup, guide name/phone;
  - summary;
  - timeline (half: compact single list; full: list + meal icons; multi: day cards with hotel, meals, transfer) or places (grouped by `group`, optional fields shown only if present);
  - practical;
  - policies;
  - closing (closing note, disclaimer, agency contact from options, photo credits derived from the photos used).

  Remove highlights/quickFacts/routeSummary inputs. The route summary is derived and shown for full/multi only.
- `src/render/resources.ts`, `scripts/web/render-fixture.ts`, `tests/web/render.test.ts`: v2 fixtures per mode, six locales, long copy, 14 days, 60 places.

**Gate R3:** `npm run test:web-render && npm run verify:web-render`. Then **open the rendered HTML for each mode** (phone 390 px and desktop 1280 px screenshots) and inspect them. Record the screenshot paths in the CP020 revision log (RULES §11a). Run `scripts/web/print-pagination.py` only if render output pagination code changed; it is historical, not a product gate.

### R4 — Preview and publish checks (CP024, CP025)

- `src/server/preview.ts`:
  - caps 360/720/960 per the table, keeping V27-01 semantics;
  - the content-policy scanner path list is rewritten to the v2 text fields (`summary`, activity title/description/tip, place fields, practical lists, policies, closingNote, disclaimer, meeting/pickup notes, `transferNote`);
  - `MEETING_POINT_MISSING` warning;
  - raster decode (V27-03) applies to `cover`, `days[].photo`, `places[].photo`;
  - diagnostic paths use the stable-ID form (`days[<id>].activities[<id>].time`) so V27-02 focus still works.
- `src/server/publication.ts`: passes `agency` from the profile to the renderer.

**Gate R4:** `npm run test:web-preview && npm run test:web-publication && npm run verify:web-preview && npm run verify:web-publication`.

### R3/R4 execution plan (planner, 2026-11-05) — overrides R3 and R4 above where they differ

Written for Claude Haiku to execute. R1/R2 round 1 is accepted (commits `ee2462c`, `65ff9df`, `ee10278`, `e260e92`). Run R3 first. Start R4 only when the R3 gate is fully green and R3 is committed. Then stop and hand R3+R4 back for **one joint review**. Do not start R5.

#### Ground rules for both stages

- Write files with the Write/Edit tools, never bash heredocs. Keep the existing line endings.
- Do **not** change: `config/web/itinerary.schema.json`, `field-registry.json`, the locale catalogs, `src/contracts/*`, `src/server/store.ts`, migrations, `tests/web/test-renderer.ts`, or anything under `src/editor/` (R5).
- Every label the renderer needs already exists in the catalogs (see the key list in R3.2). If you think a new key is needed, **stop and record it** under "Open questions" in the stage log. Do not add it.
- Do not weaken or delete assertions in suites outside the ones this plan rewrites (contracts, store, api, ai, publication). Those must stay green after every step.
- If the same gate step fails three times for the same reason, stop. Write down what you tried in the stage log and hand back.
- Commit locally only. Never push.

#### R3 — Renderer (CP020)

**R3.1 `src/render/resources.ts`.** Rename the second parameter of `loadInlineRenderResources` from `destinationType` to `colorTheme`. It still selects the palette from `config/palettes.json` (fallback `mixed`). No other change.

**R3.2 `src/render/render.ts`: rewrite to render `ItineraryV2` only.** Remove every v1 type, path and input (`brochure`, `hero`, `overview`, `schedule`, `spots`, `closing.*`, quickFacts, highlights, pace, themes, travelers, `timeLabel`, `durationLabel`, `category`, `gradientOnly`). Keep these helpers and their behaviour unchanged: `esc`, `safeColor`, `icon` + `ICONS`, `safeCreditUrl`, `hasUnsafeCss`, `formatDate`, `resolvedImage`, the asset size checks in `assetErrors`, the 64 MiB HTML limit, and the CSS/font safety errors.

New options:
```ts
export interface RenderAgency { name: string; contact: string; logoAssetId: string | null }
export interface RenderOptions {
  stylesheet: string; fontCss: string; catalog: LocaleCatalog; palette: RenderPalette;
  assets?: Record<string, RenderAsset>;
  agency: RenderAgency;      // resolved by the caller from the workspace profile
  generatedDate: string;     // YYYY-MM-DD, supplied by the caller (never read the clock in render.ts)
}
export function renderItineraryHtml(content: ItineraryV2, options: RenderOptions): RenderResult
```

Locale and catalog: the locale is `content.trip.language`. `catalogCapabilityError` keeps its logic, but every diagnostic path becomes `trip.language`.

Photo credit (v2 `PhotoCredit = { photographer, url, source }`). A credit is complete when:
- `photographer.trim()` is non-empty;
- `url`, if set, is https;
- when `source` matches `/unsplash|pexels/i`, `url` is set and https.

`source` may be empty. A used photo (one that resolves to an image) without a complete credit pushes `PHOTO_ATTRIBUTION_REQUIRED` with path `cover.credit`, `days[i].photo.credit` or `places[i].photo.credit`. Credits for the closing are collected **only** from used photos and de-duplicated by `photographer|url|source`.

`assetErrors` checks `options.agency.logoAssetId`, `cover.assetId`, `days[].photo.assetId` and `places[].photo.assetId`.

Section order. Each top-level block gets a `data-section` attribute with the value in brackets.
1. **Hero** [`hero`].
   - `cover` resolves to an image → render the image. Otherwise render the gradient (the palette from `trip.colorTheme`).
   - Top row: agency logo (when `agency.logoAssetId` resolves) and `agency.name`. Omit the element entirely when both are empty. Next to it, a scope pill: `scopeHalfDay` / `scopeFullDay` / `scopeMultiDay` (replace `{count}` with `days.length`) / `scopeDestinationGuide`.
   - Eyebrow: `modeHalfDay` / `modeFullDay` / `modeMultiDay` / `modeDestinationGuide`. This fixes the old bug where the guide showed the full-day label.
   - `<h1>`: `trip.title || trip.destination`. Sub-line: `destination · region · country`, skipping empty values.
2. **Trip info strip** [`trip-info`]. A `<dl>` grid. Render an item only when it has a value, and omit the whole strip when it would be empty.
   - Dates. Half/full: `startDate` formatted, label `startDate`. Multi: `startDate` and `endDate`, where end = `startDate + days.length − 1`.
   - Time window (half/full): label `startTime`, value `HH:MM–HH:MM`, or just the start when there is no end.
   - Meeting: label `meetingPoint`, value `meeting.place`. Add a link labelled `mapsLink` only when `meeting.mapsUrl` is https, with `target="_blank" rel="noopener noreferrer"`. Label `meetingTime` for `meeting.time`, label `meetingNote` for `meeting.note`.
   - Pickup, only when `pickup.offered`: label `pickup` with `pickup.area`, `pickupTime`, `dropoffNote`.
   - Guide, in **all** modes: `guideName`, `guidePhone`.
3. **Summary** [`summary`]: heading `tripOverview`, then `summary` as a paragraph. Omit when blank.
4. **Route** [`route`], full_day and multi_day only. Show it only when there are ≥2 stops after removing consecutive duplicates. Label `routeSummary`, rendered as chips.
   - full_day stops: `activity.place ?? activity.title`.
   - multi_day stops: `day.location ?? day.title`.
5. **Schedule** [`schedule`] for scheduled modes, heading `itinerary`.
   - Activity row: keep the existing timeline markup. Add `data-activity-id`.
     - Time column: `activity.time` or empty.
     - Kind icon and the `activityType<Kind>` label.
     - Duration from `durationMinutes` via `formatDuration(minutes, locale)`:
       - use `Intl.NumberFormat(locale, { style: 'unit', unit: 'hour' | 'minute', unitDisplay: 'short' })`;
       - < 60 → minutes; exact hours → hours; otherwise `"<hours> <minutes>"` joined by one space;
       - when the formatter's resolved language differs from the requested language (as `formatDate` does), fall back to `<n> min`;
       - expected `en` results: 45 → `45 min`, 120 → `2 hr`, 90 → `1 hr 30 min`.
     - Then title, description, `activity.place` as a small line, and `tip` with the `localTip` label.
   - half_day: one day. Show the day title/location only if non-empty. No meals, hotel or transfer markup ever.
   - full_day: as half_day, plus a meals line when any meal is true: label `meals`, then the checked `breakfast`/`lunch`/`dinner` labels joined by ` · `.
   - multi_day:
     - A day index nav of chips `dayLabel N`.
     - Then one card per day with `data-day-id`. Header: `dayLabel N`, plus ` · <date>` when `startDate` is set (`startDate + N − 1`). Then `title` and `location`.
     - Card body: day photo, timeline, meals line.
     - Hotel box: label `hotel`. Show the name only when non-empty — **never print an empty name or a dangling separator**. Then `area · note`, skipping empty values. Omit the box when all three are empty.
     - Transfer note: label `transferNote`.
6. **Guide** [`guide`] for destination_guide, heading `exploreDestinations`. Do **not** repeat the summary here.
   - Keep the existing run-grouping by `group`: consecutive same-group places share a heading, and interleaved groups repeat their heading.
   - Card with `data-place-id`: two-digit number, photo, name, area, description.
   - Then a `<dl>` with only the present optional fields: `suggestedDuration`, `bestTime`, `gettingThere`, `nearby`.
   - Then `tips` with the `localTip` label.
7. **Practical** [`practical`], heading `practicalInfo`. Cards for each non-empty list:
   - `included`, `notIncluded`, `whatToBring`, `healthSafety`;
   - `localTips` with label `localTip`;
   - `emergencyContacts` with label `emergencyContact`, as `label: value`.
8. **Policies** [`policies`]: heading `policies`, text in an element with class `whitespace-pre-line`. Omit when null or blank.
9. **Closing** [`closing`] (footer): heading `closingHeading`, `closingNote`, `agency.contact` (when non-empty), `disclaimer`, the photo credits, then a muted line `generatedDate: <formatted options.generatedDate>`.

`<title>` = `trip.title || trip.destination`. `<html lang>` = `trip.language`. Keep `meta robots noindex`. No `<script>` or `<iframe>`, ever.

**R3.3 `src/render/styles.css`.** Reuse the existing classes. Add CSS only for new needs: the `trip-info` grid, route chips, the hotel box, and the `whitespace-pre-line` utility if Tailwind does not already emit it. After editing render.ts, run `npm run build:brochure-css`, because Tailwind scans `render.ts` through `@source`.

**R3.4 `tests/web/render.test.ts`: rewrite on `createContentV2` from `fixtures-v2.ts`.**

Default options for every test:
- the catalog for the locale;
- `paletteConfig.palettes.cultural`;
- `agency: { name: 'Sample Travel Studio', contact: 'guide@example.test', logoAssetId: null }`;
- `generatedDate: '2026-11-05'`.

Required tests:
1. **Four modes** render with `errors: []` and the right `lang`. The title is present. There are no `undefined`, `[object Object]`, `{{…}}`, `<script` or `<iframe`. The guide eyebrow contains the catalog value of `modeDestinationGuide` and not `modeFullDay`.
2. **Escaping.** HTML in title, activity description and place description is escaped. Emergency contacts render as `Guide: +62-000-0000`.
3. **Mode sections.**
   - half_day has no `breakfast`/`lunch`/`hotel`/`transferNote` labels.
   - full_day shows the meals line with `Lunch`.
   - multi_day shows `Ubud Garden Hotel`, the transfer note, the chips `Day 1`/`Day 2` and an end date.
   - The guide has a `data-section="guide"` and no `data-section="schedule"`.
   - `data-section="route"` appears only for full/multi, and only with ≥2 distinct stops.
4. **Empty hotel name.** For a day with `hotel = { name: '', area: 'Ubud', note: 'Quiet' }`, the box shows `Ubud · Quiet`, and the hotel box markup has no empty name element and no leading ` · `.
5. **Trip info strip.**
   - The meeting place and an https maps link with `rel="noopener noreferrer"` render. An `http:` maps URL is not rendered as a link.
   - Pickup renders only when offered.
   - Guide name and phone render in all modes.
   - destination_guide has no meeting or pickup items.
6. **Agency comes from options.** Name, contact and logo are inlined when the asset is supplied. An empty name/contact leaves no empty element. Draft content cannot change the agency.
7. **Optional place fields.** A place with `bestTime: null` has no `Best time` label. With a value, the label is shown.
8. **Photo credits.**
   - A cover with a credit is inlined and the credit is listed.
   - A used day photo without a credit → `PHOTO_ATTRIBUTION_REQUIRED` at `days[0].photo.credit`.
   - An Unsplash source without a url fails.
   - A cover with an unresolvable asset → a `RENDER_ASSET_MISSING` warning plus the gradient.
   - Unused credits are never listed.
9. **Fail closed.** An unsupported locale, unsafe CSS (`@import`, external `url()`), and an incomplete or script-mismatched catalog all fail closed with `html: ''`. Port the existing tests to the `trip.language` path.
10. **`la` dates.** Dates render as numeric ISO (port the existing test).
11. **Interleaved guide groups** repeat their headings (port).
12. **Scale and durations.**
    - 14 days × 3 activities and 60 places render without errors.
    - `formatDuration` gives `45 min`, `2 hr` and `1 hr 30 min` in `en`.
    - A `ja` and a `zh-Hans` render contain no Latin fallback for the mode label.
13. **Long copy.** A 4000-character Unicode description and multi-line policies render. Line breaks are kept through `whitespace-pre-line`.

**R3.5 `scripts/web/render-fixture.ts` (`npm run verify:web-render`): port to v2.** Read the whole file first and keep its checks (no external requests, HTML size, fonts inlined, failure list, summary rows), but build the fixtures with `createContentV2`.

Rows to render:
- the six `language-samples.json` locales, as full_day, mapping the sample fields onto `trip`, `summary`, `days[0]` and `closingNote`/`disclaimer`;
- one row per mode in `en`, with a cover photo, a day photo and credits;
- 14-day multi_day;
- 60-place guide.

For each mode row, write the HTML plus Puppeteer screenshots at 390×844 and 1280×900 (full page) to `output/web-foundation/r3-<mode>-<width>.png`.

**R3.6 Other callers.** `src/server/preview.ts` will not compile against the new signature until R4. That is expected and it stays outside `typecheck:web-server`. Do not touch it in R3.

**Gate R3 (all must pass):**
- `npm run build:brochure-css`
- `npm run test:web-render`
- `npm run verify:web-render`
- `node scripts/web/typecheck-scope.mjs tsconfig.app.json src/render` → 0 errors
- `npm run typecheck:web-server` and `npm run typecheck:web-contracts-v2` → 0 errors
- `test:web-contracts`, `test:web-store`, `test:web-api`, `test:web-ai`, `test:web-publication` still all green
- **Visual check:** open each of the 8 screenshots with the Read tool and look at them. Phone width: no horizontal overflow, the trip-info strip wraps, the timeline is readable. Desktop: the hero, the strip, and the day cards or place grid look intentional. The `ja`/`zh-Hans` rows show glyphs, not tofu. Fix what you see before committing.
- Write `logs/cp020_stage-log_r3-renderer-v2.md`. It contains:
  - the commands and their pass counts;
  - the screenshot paths, with one sentence per screenshot on what you checked;
  - deviations from this plan, with the reason;
  - open questions.
- Commit: `CP020 revision: R3 renderer for web-2.0.0 (pending joint review)`.

#### R4 — Preview and publish checks (CP024, CP025)

**R4.1 `src/server/preview.ts`.**
- Types: `WebItineraryContent` is v2. `PreviewStore` becomes `{ getAsset(id: string): any | undefined; workspace(): { profile: unknown } }`. The real store already has `workspace()`.
- Locale: `content.trip.language`.
  - Unresolved when `languageContext.outputLanguage !== trip.language`, when `source === 'unresolved'`, or when the language is null → `LOCALE_UNRESOLVED` at `trip.language`.
  - No catalog → `LOCALE_UNSUPPORTED` at `trip.language`.
- **Delete** `scheduleDiagnostics`, the local `parseTime`/`parseDuration`, the `unquantifiedTime` filter and `expandRequiredDiagnostic`. Span caps, `ACTIVITY_ORDER`, `TIME_RANGE_INVALID`, `SCHEDULE_TIME_UNKNOWN` and `MEETING_POINT_MISSING` now come from `validateForPublish`. Do not duplicate them.
- **Add `overlapDiagnostics(content)`.** Within each day, take the activities that have both `time` and `durationMinutes`, in array order. If an activity starts before the previous measured activity ends, push the error `SCHEDULE_OVERLAP` at `days[d].activities[j].time`. Only provable overlaps; missing values never produce an error.
- **Add `hotelDiagnostics(content)`.** For multi_day, a day with `hotel !== null` and a blank `hotel.name` gives the **warning** `HOTEL_NAME_EMPTY` at `days[d].hotel.name`.
- **Target IDs (overrides "stable-ID form" in R4 above).**
  - Diagnostic `path` stays index-based, exactly as the validator emits it, so paths match between validator, preview and publish.
  - Add `targetId` to every diagnostic whose path starts with `days[d]` or `places[p]`. Use the innermost ID: the activity ID when the path contains `activities[j]`, otherwise the day or place ID.
  - Write one helper `withTargetIds(content, diagnostics)` and apply it to both errors and warnings.
  - The R5 editor focuses by `targetId`.
- `contentDiagnostics` scans exactly these v2 text fields:
  - `trip.title`, `trip.destination`, `trip.region`, `summary`;
  - `meeting.place`, `meeting.note`, `pickup.area`, `pickup.dropoffNote`, `guide.name`;
  - per day: `days[d].title`, `days[d].location`, `days[d].transferNote`, and `days[d].hotel` as `[name, area, note]` joined;
  - per activity: `days[d].activities[j].title`, `.description`, `.tip`, `.place`;
  - per place: `places[p].name`, `places[p].description`, and `places[p].logistics` as `[area, group, gettingThere, ...tips, nearby, suggestedDuration, bestTime]` joined;
  - per item: `included[i]`, `notIncluded[i]`, `whatToBring[i]`, `healthSafety[i]`, `localTips[i]`, `emergencyContacts[i]` as `[label, value]`;
  - `policies`, `closingNote`, `disclaimer`.

  Keep the four regexes (money, opening hours, promotional, placeholder) unchanged.
- Assets: `assetReferences` covers `cover.assetId` (path `cover.assetId`), `days[d].photo.assetId`, `places[p].photo.assetId`, and the profile `agencyLogoAssetId` (path `profile.agencyLogoAssetId`). Keep the storage-key check, the sharp decode, the mime/byte match and the 20 MiB total exactly as they are.
- Render call:
  - `loadInlineRenderResources(trip.language, trip.colorTheme, stylesheetPath)`;
  - `agency` from `store.workspace().profile`: `agencyName` → `name`, `agencyContact` → `contact`, `agencyLogoAssetId || null` → `logoAssetId`, with strings defaulting to `''`;
  - `generatedDate: new Date().toISOString().slice(0, 10)`.
- `scheduleVerification`: `'not_applicable'` for destination_guide, `'partial'` when any warning has code `SCHEDULE_TIME_UNKNOWN`, otherwise `'complete'`.
- `editorMessages` (Indonesian). Remove the v1-only codes. The table must contain exactly:
  - `PUBLISH_FIELD_REQUIRED`: Lengkapi field ini sebelum publish.
  - `SCHEMA_VALIDATION_FAILED`: Perbaiki nilai field agar sesuai format yang diminta.
  - `DUPLICATE_STABLE_ID`: Item memiliki ID yang sama; simpan ulang setelah memperbaiki data.
  - `FIELD_NOT_APPLICABLE`: Field ini tidak berlaku untuk tipe itinerary ini; kosongkan dulu.
  - `SINGLE_DAY_REQUIRED`: Tipe ini hanya memakai satu hari jadwal.
  - `MULTI_DAY_COUNT_INVALID`: Itinerary multi-hari membutuhkan 2 sampai 14 hari.
  - `PLACES_REQUIRED`: Tambahkan minimal satu tempat ke panduan destinasi.
  - `EMPTY_DAY`: Tambahkan minimal satu aktivitas di hari ini.
  - `DURATION_CAP_EXCEEDED`: Total waktu melebihi batas durasi tipe itinerary ini.
  - `ACTIVITY_ORDER`: Urutkan aktivitas dari jam paling awal.
  - `TIME_RANGE_INVALID`: Jam selesai harus setelah jam mulai.
  - `SCHEDULE_OVERLAP`: Aktivitas ini dimulai sebelum aktivitas sebelumnya selesai.
  - `SCHEDULE_TIME_UNKNOWN`: Sebagian jam atau durasi belum diisi; jadwal belum bisa dicek penuh.
  - `MEETING_POINT_MISSING`: Belum ada titik kumpul atau penjemputan.
  - `HOTEL_NAME_EMPTY`: Nama hotel belum diisi.
  - `PHOTO_ATTRIBUTION_REQUIRED`: Lengkapi kredit untuk foto yang digunakan.
  - `RENDER_ASSET_MISSING`: Aset foto tidak tersedia; preview menggunakan tampilan fallback.
  - `LOCALE_UNSUPPORTED`: Katalog bahasa atau script ini belum didukung.
  - `LOCALE_LABELS_INCOMPLETE`: Katalog label bahasa belum lengkap.
  - `LOCALE_CATALOG_UNAVAILABLE`: Label untuk bahasa ini belum tersedia.
  - `RENDER_STYLES_INVALID`: Stylesheet render tidak tersedia atau tidak aman.
  - `RENDER_FONTS_EXTERNAL`: Font render tidak tersedia sebagai resource lokal.
- Keep unchanged: the 422/503 status rules and the response shape (`ok`, `html`, `errors`, `warnings`, `publishReady`, `scheduleVerification`). `publishReady` = no errors.

**R4.2 `src/server/publication.ts` (overrides "passes agency" in R4 above).** The agency is resolved inside `renderSavedDraftPreview`, which publication already calls, so do not change publication logic. Only adjust the `Store` type if the new `PreviewStore` requires it. The OG image and tags already read v2 fields; leave them as they are.

**R4.3 `tests/web/preview.test.ts`: rewrite on `createContentV2`.** Keep the `setup()` shape: a real renderer, a temp stylesheet, `createApp`. Required tests:
1. A saved incomplete draft (empty `trip.title`) previews with `ok: true`. Publish errors are separated (`publishReady: false`), and the stored draft is unchanged (deepEqual before/after GET).
2. **Overlap and cap.**
   - `08:00`+90 followed by `09:00` → error `SCHEDULE_OVERLAP` at `days[0].activities[1].time`, with `targetId` = that activity's ID.
   - A half_day with `08:00`+60 and `14:30`+60 → `DURATION_CAP_EXCEEDED`.
3. **Locale.** A stale `languageContext` and an unresolved one → 422 `LOCALE_UNRESOLVED`. Benign wording such as "price-conscious travellers" is still allowed.
4. **Missing time.** An activity with `time: null` → a `SCHEDULE_TIME_UNKNOWN` warning, `publishReady: true`, `scheduleVerification: 'partial'`.
5. **Pattern guards.** Each of `IDR 150.000` in an activity tip, `jam buka 08:00` in `meeting.note`, `book now` in `policies`, `営業時間` in a place description, and `{{name}}` in `closingNote` blocks with the right code and path. "Best visited in the morning" does not block.
6. **Caps without start times.** full_day 2×400 minutes and multi_day 2×500 minutes in one day → `DURATION_CAP_EXCEEDED`. Exactly 720 / 960 → no error.
7. Missing stylesheet → 503 `RENDER_RESOURCES_UNAVAILABLE`, draft preserved (port).
8. A same-size, pixel-corrupt cover image → 422 `ASSET_INVALID` at `cover.assetId` (port).
9. A missing activity title → `PUBLISH_FIELD_REQUIRED` at `days[0].activities[1].title`, with `targetId` = the activity ID. A missing place name → a `targetId` with the place ID.
10. A multi_day hotel `{ name: '', area: 'Ubud', note: null }` → the warning `HOTEL_NAME_EMPTY` (not an error), and the HTML has no empty hotel name.
11. **Agency from the profile.** PATCH the profile with `agencyName: 'Sample Travel Studio'` and an uploaded logo asset → the preview HTML contains the name and an inline `data:image/` logo. A profile with a corrupt logo → `ASSET_INVALID` at `profile.agencyLogoAssetId`.
12. A full_day with `meeting.place = null` and no pickup → the `MEETING_POINT_MISSING` warning, still `publishReady: true`.

**R4.4 `tests/web/publication.test.ts`: add one real-renderer test.** Keep every existing test on the stub. Add a test where `setup` is given an option that leaves out `renderPreview`, so the real `renderSavedDraftPreview` runs with the temp stylesheet. Publish → 200. The public page contains the trip title, the agency name from the profile, and the OG tags, and does not contain the private writing brief.

**R4.5 `scripts/web/verify-preview.ts` and `scripts/web/verify-publication.ts`.** Swap the v1 `createContent` for `createContentV2` and update any v1 paths. They use `.runtime/web-render/brochure.css`, which the R3 gate already built. Keep their checks unchanged in intent.

**Gate R4 (all must pass):**
- `npm run test:web-preview` (all green)
- `npm run test:web-publication` (existing tests plus the new real-renderer test)
- `npm run verify:web-preview` and `npm run verify:web-publication`
- `npm run typecheck:web-server` **with `src/server/preview.ts` included**: run `node scripts/web/typecheck-scope.mjs tsconfig.app.json src/server src/contracts src/api src/render` → 0 errors. Then remove `!src/server/preview.ts` from the `typecheck:web-server` script in `package.json`.
- The R3 gate commands and the contracts/store/api/ai suites are still green.
- `test:web-editor` is still expected to fail (R5). Record its count. Do not touch it.
- Write `logs/cp024_stage-log_r4-preview-v2.md`, with the same structure as the R3 stage log.
- Commit: `CP024/CP025 revision: R4 preview and publish checks for web-2.0.0 (pending joint review)`.

#### Planner decisions in this section (the owner may override before execution)

- **PR-1:** Duration display uses `Intl.NumberFormat` units ("1 hr 30 min"), not new catalog keys. The `la` fallback is `<n> min`.
- **PR-2:** The route summary is shown only for full/multi, and only with ≥2 distinct stops.
- **PR-3:** The content-policy scanner also covers `policies`. A cancellation fee written with a currency amount will block publish, because the existing no-prices rule is applied as-is.
- **PR-4:** Diagnostics keep index paths, plus `targetId`, instead of the stable-ID path form.
- **PR-5:** The overlap check lives in preview, not in `validateForPublish`. It therefore does not run in the stub renderer used by the publication state-machine tests.

### R5 — Editor (CP022)

- Rewrite `src/editor/main.tsx` into smaller files (`src/editor/sections/*.tsx`: `TripInfo`, `TimeAndMeeting`, `TripGuide`, `Cover`, `Summary`, `DaySchedule`, `MultiDay`, `Places`, `Practical`, `Closing`, `AiAssist`, `ModePicker`, `DraftList`), using the Editor Behaviour spec above, the registry-driven `fieldMeta`, and the `data-field-path` attribute on every input. Keep the existing behaviour: manual Save, the 409 conflict panel, preview, publish/unpublish/copy link, AI Generate/Apply/Discard with staleness checks, keyboard reorder buttons, and the mode-change confirmation.
- `src/editor/model.ts`: v2 factories (`makeActivity`, `makeDay`, `makePlace`), `changeMode` clearing non-applicable fields, `hasModeLoss` listing them in plain words.
- `src/editor/labels.ts`: v2 labels (Indonesian), with the plain-language copy table above.
- Delete `src/editor/coverage.ts`; replace its test with the registry-driven DOM coverage test.

**Gate R5:**
- `npm run typecheck:web-app && npm run test:web-editor && npm run verify:web-editor`, with `verify-editor.ts` updated to: four mode cards create four drafts; each mode shows only its sections; mode change clears fields after confirmation; 14 days; 60 places; save/reopen identical.
- Phone (390 px) and desktop (1280 px) screenshots for each mode's editor, opened and inspected.

### R6 — Regression, E2E and logs

- Update `scripts/web/verify-e2e.ts`, `verify-ai-ui.ts`, `verify-ai.ts` (no new paid inference; deterministic double only), `verify-readiness.ts`, `tests/web/fixtures.ts`, and `tests/web/cp027-fixtures.json` to v2.
- Run the full suite: `npm run check:web-types`, `typecheck:web-contracts`, `typecheck:web-app`, and every `test:web-*` and `verify:web-*` script listed in `package.json` **except** `verify:web-ai` live mode and `verify:web-systemd`. Then `npm run build:web-release && npm run validate:web-release`.
- Append a dated **Revision: 2026-11-xx – Guide-centric schema web-2.0.0** section (RULES §8 format) to `logs/cp019_…`, `cp020_…`, `cp021_…`, `cp022_…`, `cp023_…`, `cp024_…`, `cp025_…` completion logs. Each records only that CP's changes and evidence.
- Update `docs/engine-runtime-contract.md` and `docs/editor-ai-api-contract.md` for the v2 paths/endpoints.
- Mark the CP030–CP032 plan as needing revision (its Current-State Findings reference `web-1.0.0`); do not start CP030.

## Impact and Regression Risk

- About 1,500 of 2,300 source lines are touched (audit). The store, publication state machine, share tokens, revocation and the AI ledger are preserved and must keep passing their existing tests.
- Stored drafts are rewritten by migration 3. Mitigations: a pre-migration backup, a transactional all-or-nothing migration, and revision numbers not bumped.
- Published links keep serving immutable HTML. The first republish after migration changes the page layout to v2. This is expected and is noted in the logs.
- Locale catalogs: the new keys need translations in six languages, and a quality risk exists for `la`/`ja`/`zh-Hans`. The render test asserts the keys exist and the visual check reviews them.
- The AI API target kind changes (`spot` → `place`); the editor and API change together in R2/R5.

## Verification Plan

The gate commands are per stage above. Additionally:
- Migration on a **copy** of the real local data root, never the original, until R2 passes.
- Visual inspection (RULES §11a) at R3 and R5, plus a final R6 pass: one published page per mode opened on phone/desktop.
- Negative checks:
  - a v2 draft with a destination-guide `startDate` → `FIELD_NOT_APPLICABLE`;
  - half day 5 h → OK, 7 h known → error, unknown times → warning only;
  - a half-day `meals` object → error;
  - a policy-guard fixture with "harga" without a number is still accepted (RULES §11c).

## Updated Acceptance Criteria

1. `web-2.0.0` schema, registry and generated types agree. Every registry path is either rendered in the editor for its modes or explicitly `hidden/derived`. The DOM coverage test proves it per mode.
2. The four modes are visibly distinct: mode cards, badges, and per-mode sections. Half vs full day differ by cap (360/720) and meals, and the output layouts differ.
3. No duplicated or derived field is editable. Agency data comes only from the profile. Photo credits and route summary are derived.
4. The new fields (meeting, pickup, guide, policies, start/end time) are stored, validated and rendered.
5. Destination-guide places require only name, area and description.
6. Existing v1 drafts open after automatic migration with no data silently lost: every lossy change is recorded as a warning and a backup exists. Existing share links still serve.
7. Backend fixes verified: real migration runner, `schema_version` updated, list sorted by update time, no stuck `pending` publish or 500 on a duplicate operation, missing asset file → 404, mode change cannot leave hidden rendered data.
8. All updated test/verify suites and the release build/validation pass, and phone/desktop screenshots for each mode were inspected.
9. The US$2 AI ledger, the daily quota, share-token/revocation behaviour and published HTML immutability are unchanged.

## Rollback

- Code: revert the revision commits (one commit per stage is required, so stages can be reverted individually).
- Data: stop the app and restore `<dataDir>/backups/pre-migration-3.sqlite` over the database. Published HTML/asset files are untouched by this revision.
- If R2 fails on the real data copy, do not run against the real root. Stop and report.

## Executor Rules (for the implementing model)

1. Read `RULES.md`, this plan, and the current code of each file before editing it. Do not rely on line numbers; they are hints.
2. Do exactly one stage at a time. Do not start the next stage until its gate commands pass and are recorded.
3. Never add fields, endpoints, dependencies or UI not listed here. Never change the AI ledger, share-token logic or published files.
4. **Stop and use `AskUserQuestion`** when:
   - a gate fails twice after honest fixes;
   - the plan contradicts the code in a way that changes behaviour;
   - a migration would lose data not covered by the mapping table;
   - any destructive action on the real data root is needed;
   - you would need a new dependency.
5. Never claim a test passed without running it. Paste command + summary result into the log.
6. Commit after each stage gate passes, with the message `CPxxx revision: <stage> guide-centric schema` and the attribution line required by the session. Do not push.
7. Do not delete or rewrite existing plans/logs; append revision sections only.
