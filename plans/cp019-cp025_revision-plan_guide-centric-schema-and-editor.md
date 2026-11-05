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
