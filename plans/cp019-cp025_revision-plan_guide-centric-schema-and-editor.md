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

### R4 amendment 2026-11-05 (recorded by the executor after the R3/R4 audit; the reviewer confirms or rejects) — overrides the R4 gate above where it differs

`npm run verify:web-preview` and `npm run verify:web-publication` drive the **editor UI** in a browser (create a draft, open it, press Preview/Publish, focus a diagnostic). The editor stays v1 until R5, so both scripts stop waiting for an editor status before any server logic runs. The amended R4 gate drops them. They move to the R5 gate, and R6 already runs every `verify:web-*` script.

Amended R4 gate: `test:web-preview`, `test:web-publication` (including the real-renderer test), `test:web-render`, `verify:web-render`, `typecheck:web-server` with `preview.ts` included, and the contracts/store/api/ai suites. The server behaviour the two scripts would check (diagnostics, `targetId`, publish with the real renderer, immutable public page) is covered at API level by those tests.

R4 executor changes recorded here:

| ID | Change | Reason |
|---|---|---|
| E1 | `overlapDiagnostics` compares each activity with the latest end so far, not only the previous measured activity. | `ACTIVITY_ORDER` keeps starts non-decreasing, so comparing only with the previous one misses an overlap with an earlier long activity (08:00+180, 09:00+30, 09:30). Still only provable overlaps. |
| E2 | Only `loadInlineRenderResources` maps to 503; an exception inside `renderItineraryHtml` is a server error. | A render bug must not be reported as "resources unavailable". |
| E3 | Diagnostics are de-duplicated by code and path. | Validator and renderer both report `PHOTO_ATTRIBUTION_REQUIRED`. |
| E4 | An uncredited used photo still returns 422 without HTML. | The plan says to keep the 422/503 status rules; behaviour is unchanged from v1. |

### R5 — Editor (CP022)

- Rewrite `src/editor/main.tsx` into smaller files (`src/editor/sections/*.tsx`: `TripInfo`, `TimeAndMeeting`, `TripGuide`, `Cover`, `Summary`, `DaySchedule`, `MultiDay`, `Places`, `Practical`, `Closing`, `AiAssist`, `ModePicker`, `DraftList`), using the Editor Behaviour spec above, the registry-driven `fieldMeta`, and the `data-field-path` attribute on every input. Keep the existing behaviour: manual Save, the 409 conflict panel, preview, publish/unpublish/copy link, AI Generate/Apply/Discard with staleness checks, keyboard reorder buttons, and the mode-change confirmation.
- `src/editor/model.ts`: v2 factories (`makeActivity`, `makeDay`, `makePlace`), `changeMode` clearing non-applicable fields, `hasModeLoss` listing them in plain words.
- `src/editor/labels.ts`: v2 labels (Indonesian), with the plain-language copy table above.
- Delete `src/editor/coverage.ts`; replace its test with the registry-driven DOM coverage test.

**Gate R5:**
- `npm run typecheck:web-app && npm run test:web-editor && npm run verify:web-editor`, with `verify-editor.ts` updated to: four mode cards create four drafts; each mode shows only its sections; mode change clears fields after confirmation; 14 days; 60 places; save/reopen identical.
- `npm run verify:web-preview && npm run verify:web-publication` (moved here from the R4 gate; see the R4 amendment). `verify-preview.ts` expects the diagnostic path `days[0].activities[0].title` and the focus on the exact activity after a reorder; `verify-publication.ts` already seeds with `createContentV2`.
- Phone (390 px) and desktop (1280 px) screenshots for each mode's editor, opened and inspected.

### R6 — Regression, E2E and logs

- Update `scripts/web/verify-e2e.ts`, `verify-ai-ui.ts`, `verify-ai.ts` (no new paid inference; deterministic double only), `verify-readiness.ts`, `tests/web/fixtures.ts`, and `tests/web/cp027-fixtures.json` to v2.
- Run the full suite: `npm run check:web-types`, `typecheck:web-contracts`, `typecheck:web-app`, and every `test:web-*` and `verify:web-*` script listed in `package.json` **except** `verify:web-ai` live mode and `verify:web-systemd`. Then `npm run build:web-release && npm run validate:web-release`.
- Append a dated **Revision: 2026-11-xx – Guide-centric schema web-2.0.0** section (RULES §8 format) to `logs/cp019_…`, `cp020_…`, `cp021_…`, `cp022_…`, `cp023_…`, `cp024_…`, `cp025_…` completion logs. Each records only that CP's changes and evidence.
- Update `docs/engine-runtime-contract.md` and `docs/editor-ai-api-contract.md` for the v2 paths/endpoints.
- Mark the CP030–CP032 plan as needing revision (its Current-State Findings reference `web-1.0.0`); do not start CP030.

### R5/R6 execution plan (planner, 2026-11-05, for the OpenCode agent) — overrides R5 and R6 above where they differ

Written for an AI coding agent (OpenCode) that has not seen this repository before. R1–R4 are implemented and committed locally (latest: `1ed930a`), and R3+R4 are awaiting a joint review. Run **Step 0**, then **R5**, then **R6**. Stop and hand back after R6. Do not start CP030.

#### Ground rules for Step 0, R5 and R6

- **Shell:** Windows 11 with Git Bash. Use POSIX shell syntax. Node.js 24. A `node:sqlite` "ExperimentalWarning" in test output is normal.
- **The parent folder's `CLAUDE.md` is about n8n MCP servers.** Nothing in R5/R6 touches n8n; do not call any n8n tool.
- **Do not edit** (stop and record an open question if you think you must): `config/web/**` (schema, registry, locale catalogs), `config/palettes.json`, `src/contracts/**`, `src/server/**`, `src/render/**`, `src/api/client.ts`, migrations, `tests/web/{contracts,store-migration,api,ai,ai-api,ai-harness,ai-provider,render,preview,publication}.test.ts` (R6 exception: you may fix TypeScript-only errors in `store-migration.test.ts` and `ai.test.ts` without changing what they assert).
- **No new npm dependencies.** `react-dom/server` is already available through `react-dom`.
- **Never use the real data root** (`.runtime/`). Every verify script already creates a temporary data directory. Never run live paid AI (`verify:web-ai --live`) or `verify:web-systemd`.
- **`dist/` is a stale editor bundle from 2026-10-09.** The server serves the editor from `dist/`, so every browser script (`verify:web-editor`, `verify:web-preview`, `verify:web-publication`, `verify:web-e2e`, `verify:web-ai-ui`, `verify:web-readiness`) tests whatever was last built. Run `npm run build:web-app` before each of those runs.
- Same-step failure three times for the same reason: stop, record what you tried in the stage log, and ask the owner.
- Never claim a command passed without running it. Paste the command and its pass/fail counts into the stage log.
- Commit locally after each stage gate. Never push. Commit format: `CPxxx revision: <stage> guide-centric schema web-2.0.0 (pending review)`. If your tool adds a co-author line, it must name the model you actually are.
- If you cannot view images, say so in the stage log and ask the owner to inspect the screenshots. Do not claim a visual check you did not do.

#### Step 0 — Understand and index the codebase (no source changes)

1. **Index.** If your tool can build a project index (for example OpenCode `/init`, which writes `AGENTS.md`), run it. Then correct `AGENTS.md` where it disagrees with this plan: the canonical schema is `web-2.0.0`, Windows + Git Bash, the gates below, and the stale `dist/`. Keep `AGENTS.md` **untracked** (do not commit it) unless the owner asks.
2. **Read, in this order:**
   - `RULES.md` §3, §8, §9, §11a, §11c, §12; the checklist in `TODOS.md`.
   - This plan: "Canonical `web-2.0.0`", "Mode rules", "Editor behaviour", "R4 amendment", "R5", "R6", and this section.
   - Stage logs `logs/cp020_stage-log_r3-renderer-v2.md` and `logs/cp024_stage-log_r4-preview-v2.md` (how R3/R4 were verified and what went wrong in the first attempt).
   - Contracts: `src/contracts/itinerary.generated.d.ts` (the real v2 types), `src/contracts/types.ts`, `src/contracts/validator.ts` (`normalizeCanonicalContent`, `applicabilityErrors`, `structureDiagnostics`), `config/web/field-registry.json`, `config/web/itinerary.schema.json`.
   - Server surface the editor uses: `src/server/app.ts` (routes), `src/server/draft.ts` (`createBlankDraft`), `src/server/preview.ts` (diagnostic shape: `{ code, path, message, targetId? }`), `src/api/client.ts`.
   - Editor today (v1, being replaced): `src/editor/main.tsx`, `model.ts`, `labels.ts`, `coverage.ts`, `style.css`, `index.html`, `vite.config.ts`.
   - Tests and scripts: `tests/web/fixtures-v2.ts` (v2 fixtures), `tests/web/fixtures.ts` (v1, used on purpose by the upgrade tests), `tests/web/editor.test.ts`, `scripts/web/verify-editor.ts`, `verify-preview.ts`, `verify-publication.ts`, `scripts/web/typecheck-scope.mjs`.
3. **Baseline.** Run and record (expected values in brackets; if any differs, stop and ask):
   - `npm run test:web-contracts` [42 pass], `test:web-store` [11], `test:web-api` [12], `test:web-ai` [28], `test:web-render` [14], `test:web-preview` [12], `test:web-publication` [12], `test:web-editor` [3 pass, 5 fail].
   - `npm run typecheck:web-server` [0 errors]; `npx tsc --noEmit -p tsconfig.app.json` [134 errors: `src/editor/main.tsx` 82, `scripts/web/verify-editor.ts` 28, `scripts/web/verify-ai.ts` 14, `src/editor/model.ts` 10].
   - `npm run check:web-types` [matches].
4. **Write the orientation section** at the top of a new file `logs/cp022_stage-log_r5-editor-v2.md`: a file map of what R5 and R6 will touch, the API endpoints the editor calls, a table of registry paths per mode with their control type (generate it with a short `node -e` script from the registry, do not type it by hand), the baseline results, and any open questions. If there are no blocking questions, continue to R5.

#### R5 — Editor (CP022)

Set CP022 in `TODOS.md` to `in_progress (R5 — editor v2)` before you start.

**R5.1 `src/editor/schema-meta.ts` (new).** The registry and the schema drive the form; nothing is hard-coded twice.
- `appliesTo(field, mode)`: `modes` is `"all"`, `"scheduled"` (every mode except `destination_guide`) or an array of modes. Same semantics as `modeApplies` in `validator.ts`.
- `fieldMeta(path, mode)` returns `{ path, labelKey, label, control, required, applies, maxLength?, maxItems? }` for a registry template path (for example `days[].activities[].title`).
  - `label` comes from `labels.ts` (see R5.2). `required` = `requiredOnPublish` and (`requiredModes` absent or contains `mode`).
  - `maxLength`/`maxItems` are read from `config/web/itinerary.schema.json` by walking `properties` / `items`, following `$ref` to `#/$defs/*`, and taking the non-null branch of `anyOf`. **Do not copy limits from this plan's prose**; the schema is authoritative and some prose values are outdated (for example `included` is `maxItems 50`, items `maxLength 500`).
  - Unknown path → throw. A unit test calls `fieldMeta` for every registry path.
- `templatePath(path)`: turns `days[0].activities[2].title` into `days[].activities[].title`.

**R5.2 `src/editor/labels.ts` (rewrite).** Indonesian only. Delete every v1 key.
- `fieldLabels` keyed by registry `labelKey`: tripTitle "Judul perjalanan", destination "Destinasi (kota/area)", country "Negara", region "Wilayah/provinsi", outputLanguage "Bahasa konten", colorTheme "Warna tema", itineraryMode "Tipe itinerary", startDate "Tanggal mulai", startTime "Jam mulai", endTime "Jam selesai", meetingPoint "Titik kumpul", mapsLink "Link Google Maps", meetingTime "Jam kumpul", meetingNote "Catatan titik kumpul", pickup "Ada penjemputan", pickupArea "Area penjemputan", pickupTime "Jam penjemputan", dropoffNote "Catatan pengantaran pulang", guideName "Nama guide", guidePhone "Nomor HP guide", heroPhoto "Foto", photographer "Nama fotografer", photographerLink "Link fotografer", photoSource "Sumber foto", overviewSummary "Ringkasan", dayTitle "Judul hari", location "Lokasi", time "Jam", durationMinutes "Durasi (menit)", activityType "Jenis aktivitas", activityTitle "Judul aktivitas", placeName "Nama tempat", description "Deskripsi", localTip "Tips lokal", breakfast "Sarapan", lunch "Makan siang", dinner "Makan malam", accommodationName "Nama hotel", area "Area", accommodationNote "Catatan hotel", transferNote "Perpindahan antarkota", placeGroup "Grup/area", suggestedDuration "Lama kunjungan", bestTime "Waktu terbaik", gettingThere "Cara ke sana", nearby "Tempat terdekat", included "Termasuk", notIncluded "Tidak termasuk", whatToBring "Yang perlu dibawa", healthSafety "Kesehatan & keselamatan", emergencyContact "Kontak darurat (nama)", contactValue "Nomor/kontak", policies "Ketentuan (pembatalan, cuaca, anak, dll.)", closingNote "Catatan penutup", disclaimer "Penafian".
- `pathLabels` overrides by template path: `cover.assetId` "Foto sampul", `days[].photo.assetId` "Foto hari", `places[].photo.assetId` "Foto tempat", `days[].activities[].place` "Tempat / area", `days[].hotel.area` "Area hotel", `places[].tips[]` "Tips".
- `kindLabels`: sightseeing "Wisata", food "Makan", activity "Aktivitas", transport "Perjalanan", free "Waktu bebas".
- `themeNames` (palette key → colour name; never a destination type): beach "Toska", mountain "Biru batu", city "Biru kota", cultural "Nila & toska", nature "Hijau daun", desert "Abu & emas", mixed "Biru tua (bawaan)". Swatch colours come from `config/palettes.json` (`primary`, `secondary`).
- `modeCopy`: the four cards from "Editor behaviour" verbatim (title, description, example) plus badge colour: half_day amber, full_day teal, multi_day indigo, destination_guide rose (Tailwind `bg-*-100 text-*-900` style classes).
- `statusCopy`: the six "New" strings from the plain-language table, verbatim. None of the six "Old" strings may remain anywhere in `src/editor/` (a test checks this).

**R5.3 `src/editor/model.ts` (rewrite, pure functions, no React).**
- Keep `moveById`, `moveIndex`. Delete `makeScheduleBlock`, `makeSpot`, `resizeScheduleRange`.
- `makeActivity()`, `makeDay(mode, dayNumber)`, `makePlace()`: same shapes as `src/server/draft.ts` (`blankDay`/`blankActivity`) and the generated types, with `crypto.randomUUID()` (browser-safe; do not import `node:crypto`).
- `renumberDays(days)`: `dayNumber = index + 1`. Call it after every add/remove/reorder of days.
- Blank-to-null rule: a **nullable** string field stores `null` when its input is blank (`region`, `guide.*`, `meeting.*`, `pickup.area|time|dropoffNote`, `trip.startDate|startTime|endTime`, `day.location`, `day.transferNote`, `activity.time|place|tip`, `hotel.area|note`, `place.group|gettingThere|suggestedDuration|bestTime|nearby`, `policies`, `closingNote`, `disclaimer`, `credit.url`). Non-nullable strings keep `''`.
- `durationMinutes`: integer 1–1440 or `null` when blank.
- Photo: choosing an asset sets `{ assetId, credit: null }`; clearing sets the photo to `null`. Typing in any credit field creates `{ photographer: '', url: null, source: '' }`; when all three are blank again, `credit` returns to `null`.
- Hotel (multi_day only): `null` when name, area and note are all blank; otherwise `{ name, area, note }` (name may be `''`; preview then warns `HOTEL_NAME_EMPTY`).
- Meals (full_day, multi_day): `null` when all three are false.
- Pickup toggle off → `{ offered: false, area: null, time: null, dropoffNote: null }` (the validator rejects leftover values).
- `changeMode(content, mode)` must return a draft that passes `validateDraft` for the new mode (no `FIELD_NOT_APPLICABLE`). Always keep: trip title/destination/country/region/language/colorTheme, `guide`, `cover`, `summary`, the six practical lists, `policies`, `closingNote`, `disclaimer`.

  | Target mode | Rules |
  |---|---|
  | `destination_guide` | `days = []`; `trip.startDate/startTime/endTime = null`; `meeting` all null; pickup off (as above); `places` unchanged if already a guide, else `[]`. |
  | `half_day` / `full_day` | `places = []`; `days = [first existing day ?? makeDay(mode, 1)]`; that day gets `hotel = null`, `transferNote = null`; `meals = null` for half_day, kept for full_day; `trip.startTime/endTime` kept (they are `null` when coming from multi_day or the guide). |
  | `multi_day` | `places = []`; `trip.startTime = trip.endTime = null`; from half/full: `[day1, makeDay('multi_day', 2)]`; from the guide: `[makeDay(…, 1), makeDay(…, 2)]`; from multi: unchanged. Renumber. |

- `hasModeLoss(content, mode)`: plain Indonesian strings, only for data that is actually non-empty and would be cleared. Exact strings: `"{n} tempat"` (leaving the guide, places with any text), `"{n} hari beserta aktivitasnya"` (to the guide), `"tanggal mulai"`, `"jam mulai/selesai"`, `"titik kumpul"`, `"penjemputan"`, `"{n} hari selain hari pertama"`, `"info hotel"`, `"catatan perpindahan"`, `"pilihan makan"`.

**R5.4 Components.** Split as listed in R5 above. Concretely:
- `src/editor/fields.tsx`: shared controls (`TextField`, `TextArea`, `TimeField` (`<input type="time">`), `NumberField`, `Toggle`, `SelectField`, `TextList`, `ObjectList`, `AssetSelect`, `PhotoField`, `ThemePicker`, `LocaleField`). Every control that edits a registry path takes `meta = fieldMeta(path, mode)` and renders `data-field-path="<registry template path, exactly as in the registry>"` on the input/select/textarea (for `TextList` items: on each item input, path `included[]` etc.; for `Toggle`: on the checkbox). Required marker and limits come from `meta`.
- `src/editor/EditorForm.tsx`: a **pure** component that renders the sections for `content` + `mode` from props (no `fetch`, no effects that call the API). This is what the coverage test renders.
- `src/editor/sections/*.tsx`: `TripInfo`, `TimeAndMeeting`, `TripGuide`, `Cover`, `Summary`, `DaySchedule` (half/full), `MultiDay`, `Places`, `Practical`, `Closing`, `AiAssist`, `ModePicker`, `DraftList`. You may add `Profile.tsx`, `Publication.tsx`, `Diagnostics.tsx`, `ConflictPanel.tsx` to move existing UI out of `main.tsx`; do not add new features.
- `src/editor/main.tsx`: the app shell and orchestration only (state, API calls, save, preview, publish, conflict, AI, profile, upload). Keep `import React from 'react'` at the top of every `.tsx` file (tsx runs without a root `tsconfig.json`, so it uses the classic JSX transform).
- Every section root: `<section data-editor-section="<id>">` with ids `trip-info`, `time-meeting`, `trip-guide`, `cover`, `summary`, `schedule`, `days`, `places`, `practical`, `closing`, `ai-assist`. Day, activity and place containers: `data-target-id="<stable id>"` and `tabIndex={-1}`.
- Element `id`s stay unique per record (pattern `${recordId}-<field>-<stableId>`), and every control keeps a `<label htmlFor>`.

**R5.5 Section content** (follow "Editor behaviour" above; these points fix the details).
- `TripInfo`: title, destination, country, region, language (`LocaleField`; keep the existing BCP 47 input + datalist + "unsupported locale" note + detect/confirm flow; the detect button text becomes "Deteksi otomatis"), `ThemePicker` (radio group of 7 swatches with `themeNames`), startDate (scheduled modes only), the mode control (`trip.mode`, label "Tipe itinerary", opens the existing loss-confirmation dialog), and a read-only line "Dari profil agensi: {agencyName || 'belum diisi'} · Ubah profil" whose button focuses the profile panel.
- `TimeAndMeeting`: half/full: startTime, endTime, meeting place/mapsUrl/time/note, pickup toggle → area/time/drop-off note (only when on). multi: meeting + pickup, no start/end time. Not rendered for the guide.
- `TripGuide`: name, phone, helper text "kosongkan jika sama dengan kontak agensi".
- `Cover`: `PhotoField` — credit fields render only after a photo is chosen; empty state uses the `statusCopy` "Belum ada foto sampul — halaman memakai warna tema.".
- `Summary`: textarea + "Buat dengan AI" (existing overview generation and suggestion panel).
- `DaySchedule` (half/full): one day: title, location, photo, activities list; full_day adds three meal toggles. `MultiDay`: day cards with add (max 14), remove (disabled at 2 days), move up/down, and per day: title, location, photo, activities, hotel (name/area/note), meals, transfer note. Activities: add (max 30), remove (disabled at 1), move up/down; fields time, duration, kind (`kindLabels`), title, place, description (+ "Buat dengan AI", target `{ kind: 'activity', id }`), tip.
- `Places`: add (max 60), remove, move up/down; a group heading is shown whenever `group` changes between consecutive places (display only; order stays the array order). Required name, area, description (+ "Buat dengan AI", target `{ kind: 'place', id }`), group; inside a collapsed `<details>` "Detail tambahan": tips list, gettingThere, suggestedDuration, bestTime, nearby, photo.
- `Practical`: included, notIncluded, whatToBring, localTips, healthSafety (string lists), emergencyContacts (label + value rows).
- `Closing`: policies, closingNote, disclaimer.
- `AiAssist`: collapsed `<details>` at the end: brief, itinerary fact notes, provider check, daily usage, credential copy from `statusCopy`, "Model: GPT-6 Luna" (when `modelId` is `openai/gpt-6-luna` or not yet known; otherwise `Model: {modelId}`). The old sidebar "Penulisan AI" box is removed.
- `ModePicker`: replaces the `#new-mode` select + "Buat" button with four card buttons, each with `data-mode-card="<mode>"`, title, description, example and badge.
- `DraftList`: rows in server order (already newest first), each: title or "Tanpa judul", the mode badge, and "diubah <relative time>" via `Intl.RelativeTimeFormat('id', { numeric: 'auto' })`.
- Header of the open draft shows the mode badge next to the title.

**R5.6 Status strings the browser scripts wait for — keep exactly:** "Engine tersambung", "Draft baru tersimpan", "Draft dibuka", "Tersimpan · revisi", "Itinerary berhasil dipublish". Keep the `[role="status"]` element.

**R5.7 Diagnostics and focus.** Each diagnostic is a button with `data-diagnostic-path="<path>"` and text `"<label>: <message>"`, where label = `fieldMeta(templatePath(path))` label if the path is a registry path, else the raw path. `focusDiagnostic(d)`:
1. `template = templatePath(d.path)`.
2. Scope = `[data-target-id="<d.targetId>"]` if `targetId` is set, else `document`.
3. Find, inside the scope, the first element with `data-field-path === template`; else the first whose `data-field-path` starts with `template + '.'` (covers `days[0].photo.credit`); for a list item path like `included[2]`, take the element at that index among `[data-field-path="included[]"]`.
4. If nothing matches and a `targetId` scope exists, focus the scope element itself (it has `tabIndex=-1`). `profile.agencyLogoAssetId` focuses the profile logo picker (give it `data-field-path="profile.agencyLogoAssetId"`).
5. Open any closed ancestor `<details>` first, then `focus()` and `scrollIntoView({ block: 'center' })`.

**R5.8 Keep all existing behaviour:** manual save; the 409 conflict panel (copy local / load latest); `beforeunload` warning; preview of the saved revision in a sandboxed `srcdoc` iframe with Phone/Desktop toggle; publish / republish / unpublish / copy link / version history; AI generate → editable suggestion → apply/discard with revision + edit-generation staleness checks and the pending-poll loop; language detect + confirm; profile save with its own revision; asset upload; mode-change confirmation dialog with Escape to cancel; keyboard-operable move buttons. Port each from `main.tsx`; do not change their API usage.

**R5.9 `tests/web/editor.test.ts` (rewrite).** Delete `src/editor/coverage.ts`. Use `node:test`; build elements with `React.createElement` (the test file is `.ts`) and `renderToStaticMarkup` from `react-dom/server`.
1. **Registry DOM coverage, per mode.** Render `EditorForm` with a "fully expanded" v2 draft for that mode (start from `createContentV2(mode)`; set `cover`, every day photo / place photo with a credit; pickup offered with values; meals and (multi) hotel non-null; at least one item in every list and one emergency contact). Assert: every registry path that applies to the mode with `control` not `hidden`/`derived` appears as `data-field-path="…"`; no path that does not apply appears.
2. `fieldMeta` resolves every registry path; every non-hidden/derived `labelKey` has an Indonesian label (no fallback to the key); limits match the schema for at least `included[]` (50 / 500) and `trip.title` (200).
3. Factories: a draft built from `makeDay`/`makeActivity`/`makePlace` passes `validateDraft`.
4. `changeMode` for all 12 ordered mode pairs, starting from a filled draft of the source mode: the result passes `validateDraft` (zero errors), keeps title/summary/practical lists/guide, has the right day/place counts, and `hasModeLoss` returns exactly the expected strings.
5. Blank-to-null, photo/credit, hotel, meals and pickup helpers behave as in R5.3.
6. `moveById` / `moveIndex` keep stable IDs (port the existing two tests).
7. None of the six "Old" plain-language strings appears in any file under `src/editor/`; all six "New" strings appear in `labels.ts`.
8. Mutation-check the coverage test once: temporarily remove one `data-field-path`, confirm the test fails, restore. Record it in the stage log.

**R5.10 Browser scripts.**
- `scripts/web/verify-editor.ts`: rewrite against the v2 UI. Required checks: the four mode cards create four drafts with the right badge; each mode shows only its `data-editor-section`s (half/full: schedule; multi: days; guide: places; guide has no `time-meeting`); filling fields and saving then reloading and reopening gives an identical `draftContent` (compare via the API); mode change shows the loss list and clears the fields only after confirmation (and Cancel changes nothing); a multi_day with 14 days; a guide with 60 places; reorder keeps stable IDs; no console errors; no external requests; no horizontal overflow at 390 and 1280; screenshots `output/web-editor/r5-<mode>-390.png` and `r5-<mode>-1280.png` (full page) for the four modes.
- `scripts/web/verify-preview.ts`: replace the `#new-mode` select with a click on `[data-mode-card="half_day"]`; select the diagnostic button by `data-diagnostic-path="days[0].activities[0].title"`; keep the "focus lands on the exact activity after a reorder" assertion; keep the sandbox, overflow and screenshot checks.
- `scripts/web/verify-publication.ts`: only adapt selectors that changed. It already seeds with `createContentV2`.

**Gate R5 (overrides the R5 gate above):**
- `npm run build:web-app`
- `node scripts/web/typecheck-scope.mjs tsconfig.app.json src scripts/web/verify-editor.ts` → 0 errors, and `node scripts/web/typecheck-scope.mjs tsconfig.web.json scripts/web/verify-editor.ts scripts/web/verify-preview.ts scripts/web/verify-publication.ts tests/web/editor.test.ts` → 0 errors. (`tsconfig.app.json` does not include the preview/publication scripts or the tests; the full `typecheck:web-app` also covers `verify-ai.ts`, which is R6.)
- `npm run test:web-editor` → all pass.
- `npm run verify:web-editor && npm run verify:web-preview && npm run verify:web-publication` → exit 0.
- Regression, same counts as the Step 0 baseline: contracts, store, api, ai, render, preview, publication; `npm run verify:web-render` exit 0.
- Open the 8 `r5-*` screenshots and check: mode cards and badges are distinct; only the mode's sections show; labels are Indonesian and plain; no developer jargon ("asset ID", "unresolved", "turunan", "kredensial"); phone width has no overflow and fields stack.
- Complete `logs/cp022_stage-log_r5-editor-v2.md` (orientation, commands with counts, screenshot paths with one sentence each, deviations, open questions).
- Update the R5 line in `TODOS.md` with "gate run <date>: pass; awaiting review". Leave CP022 `in_progress`.
- Commit: `CP022 revision: R5 editor guide-centric schema web-2.0.0 (pending review)`.

#### R6 — Regression, end-to-end and logs

**R6.1 Port the remaining v1 scripts to v2** (use `tests/web/fixtures-v2.ts`, v2 paths, the mode cards and `data-field-path` selectors): `scripts/web/verify-e2e.ts`, `verify-readiness.ts`, `verify-ai-ui.ts`, `verify-ai.ts` (deterministic double only; no live inference), `probe-publish-retry.ts` (run by `verify:web-publish-retry`), `probe-recovery-scope.ts`, `probe-cp027-findings.ts`, and `tests/web/cp027-fixtures.json` (it uses v1 names such as `tripTitle`, `scopeLabel`; the scope label is now derived from the catalog, so drop or recompute it). Keep each script's checks in intent; do not delete assertions to make a script pass.

**R6.2 `tests/web/fixtures.ts` stays v1** (overrides "update `tests/web/fixtures.ts` to v2" above). It is the v1 input for the `upgradeV1ToV2` tests in `contracts.test.ts` and `store-migration.test.ts`. Do not convert it; only stop the scripts from importing it.

**R6.3 Type errors.** Make `npm run typecheck:web-app` and `npm run typecheck:web-contracts` report 0 errors. At the start of R6 the remaining ones should be in `verify-ai.ts`, `tests/web/store-migration.test.ts` (6) and `tests/web/ai.test.ts` (1); fix types without changing assertions. Then set the `typecheck:web-server` script back to a plain full check only if the owner asks; otherwise leave it.

**R6.4 Full suite** (build the app first): `npm run check:web-types`, `typecheck:web-contracts`, `typecheck:web-app`, every `test:web-*`, and every `verify:web-*` except `verify:web-ai --live` and `verify:web-systemd`: `verify:web-editor`, `verify:web-preview`, `verify:web-publication`, `verify:web-e2e`, `verify:web-publish-retry`, `verify:web-ai` (default, non-live), `verify:web-ai-ui`, `verify:web-readiness`, `verify:web-render`. Then `npm run build:web-release && npm run validate:web-release`. If a script needs something unavailable on this machine (network, systemd, a live key), record it as **skipped with the reason**, never as passed.

**R6.5 Final visual pass (RULES §11a):** one published page per mode, opened at 390 and 1280 (screenshots from `verify:web-e2e` or a small script using the real server), inspected and listed in the log.

**R6.6 Logs and docs.**
- Append a `## Revision: <execution date> - Guide-centric schema web-2.0.0` section (RULES §8 format: Revision Plan / Changes Made / Verification Performed / Acceptance Criteria Results / Remaining Limitations) to each completion log: `cp019_…`, `cp020_…`, `cp021_…`, `cp022_…`, `cp023_…`, `cp024_…`, `cp025_…` in `logs/`. Each records only that CP's changes, cites the stage logs and commits, and preserves everything above it.
- Update `docs/engine-runtime-contract.md`, `docs/editor-ai-api-contract.md` and `docs/standalone-development.md` for v2: content shape, `PATCH` body (`expectedRevision`, `draftContent`, `languageContext { requestedLanguage, outputLanguage, source }`, `writingContext`), the profile endpoint `/api/v1/itinerary-engine/profile`, preview diagnostics `{ code, path, message, targetId? }`, AI target kind `place`.
- Append a dated note to `plans/cp030-cp032_implementation-plan_document-and-text-import.md` that its Current-State Findings reference `web-1.0.0` and it must be revised before CP030 starts. Do not start CP030.
- Write `logs/cp019-cp025_stage-log_r6-regression.md` with every command and count, skipped items with reasons, screenshot paths, deviations and open questions.
- Update the R6 line in `TODOS.md` ("gate run <date>: pass; awaiting final review"). Do **not** tick R1–R6 or mark CPs `completed`; the owner's reviewer does that after the final review.
- Commit: `CP019-CP025 revision: R6 regression and logs guide-centric schema web-2.0.0 (pending review)`.

#### Planner decisions in this section (the owner may override before execution)

- **PR-6:** The R5 gate uses a scoped type check; the full `typecheck:web-app` moves to R6 because `verify-ai.ts` is R6 scope.
- **PR-7:** `data-field-path` carries the registry template path; item identity comes from the nearest `data-target-id`. Diagnostics keep index paths plus `targetId` (PR-4).
- **PR-8:** Field limits come from the JSON Schema, not from this plan's prose.
- **PR-9:** `tests/web/fixtures.ts` stays v1 for the upgrade tests.
- **PR-10:** Colour theme names are colour names (`themeNames` above), not destination types.
- **PR-11:** `changeMode` to multi_day from a single-day mode adds one blank day so the draft has the minimum two days.

### R5 completion and R6 plan (planner review 2026-11-10, executor: Claude Haiku) — overrides the "R5/R6 execution plan" above where they differ

Written for Claude Haiku running in Claude Code. OpenCode started R5 but stopped part-way and committed nothing. The review of what it left is `logs/cp022_review-log_r5-editor-wip.md`; the finding IDs there (S1, L1, M1–M6, F1–F8) are the fix IDs below. Everything in "R5/R6 execution plan" above still applies unless this section says otherwise. Work through H1 → H9, **stop for review**, and only then do H10 (R6) when the owner says "lanjut R6".

#### H0. Rules for this section

- **Repo root is `D:\.agents\Micro Saas\itinerary-engine`.** Every path below is relative to it. Before every Write, check that the absolute path starts with that root. (An earlier Haiku run wrote a log to `D:\Micro Saas\…` by mistake.)
- Write source files with the Write/Edit tools, not with shell heredocs. Read a file before you edit it.
- **Off-limits** (same as above): `config/web/**`, `config/palettes.json`, `src/contracts/**`, `src/server/**`, `src/render/**`, `src/api/client.ts`, `package.json`, the server-side test files. The only config file you may change in R5 is `tsconfig.web.json` (H6).
- **Forbidden in `src/editor/**` and `tests/web/editor.test.ts`:** `@ts-ignore`, `@ts-expect-error`, `@ts-nocheck`, `as any`, `: any`, `<any>`. Do not add `!`-exclusions to any typecheck command. Do not delete or loosen assertions in existing scripts to make them pass; adapt selectors only.
- Every step ends with a check command. Run it, read the result, fix within the step. Same failure three times → stop, write what you tried in the stage log, and report.
- Never write "pass" without having run the command in this session. Paste command + counts into the stage log.
- Stage files by name only (`git add <path> …`). Never `git add -A` or `git add .`: the tree holds untracked screenshots, `dist/`, `.playwright-mcp/`, `e2e-pdf-results/`, `.codebase-memory/`, `.claude/` and `AGENTS.md`, none of which may be committed. (Commit `23d88e9` did exactly that with `git add -A`; commit "Untrack files committed by mistake in 23d88e9" undid it.) Before every commit run `git diff --cached --stat` and check the file list.

#### H1. Snapshot the WIP (no code changes)

```bash
git add TODOS.md src/editor/labels.ts src/editor/model.ts src/editor/schema-meta.ts src/editor/fields.tsx src/editor/sections/TripInfo.tsx logs/cp022_stage-log_r5-editor-v2.md
git diff --cached --stat
git commit -m "CP022 revision: R5 WIP snapshot from OpenCode (unreviewed)"
```

Check: `git status --short src/editor` shows only `?? ` lines for files you have not created yet, nothing modified.

#### H2. `src/editor/schema-meta.ts`

- **S1:** replace the `$defs` lookup inside `deref` with:
  ```ts
  const defs = (schema as unknown as { $defs: Record<string, unknown> }).$defs;
  current = defs[name as string];
  ```
- Add one line above `extractLimits`: `// maxItems is the limit of the nearest enclosing array (e.g. activities for days[].activities[].title).` Keep that behaviour; the add buttons use it.
- **PR-15:** export `export const MAX_PLACES = 60;` and use it for the "Tambah tempat" limit, because the schema has no `places.maxItems` yet (finding R1-S1). Do not edit the schema.

Check: `node scripts/web/typecheck-scope.mjs tsconfig.app.json src/editor/schema-meta.ts` → `0 error(s)`.

#### H3. `src/editor/labels.ts` and `src/editor/model.ts`

- **L1:** `statusCopy.languageUnresolved` must be exactly: `Bahasa belum dipilih. Pilih bahasa atau klik 'Deteksi otomatis'. Teks Anda tidak akan diterjemahkan.` (straight `'`). Add `noPhoto: 'Belum ada foto.'` to `statusCopy`.
- **M1:** remove the `validateDraft` import and call from `model.ts`; `changeMode` returns `next` after `renumberDays`. The test (H7) checks validity.
- **M2 (PR-12):** meals rule: `half_day` → `meals: null`; `full_day` and `multi_day` → always an object (all three `false` is valid). Delete `normalizeMeals`. Add `ensureMeals(day)` that sets `{ breakfast: false, lunch: false, dinner: false }` when `meals` is `null`. `changeMode` to full/multi calls it on every kept or new day; to half sets `meals = null`.
- **M3 (PR-13):** `setPhotoCredit(null, …)` returns `null` (credit fields are only shown when a photo exists).
- **M5:** in `hasModeLoss` change the condition to `if (content.trip.mode === 'destination_guide') {`.
- **M4:** rewrite `hasModeLoss` with a helper `hasContent(value)` that walks strings (non-blank), `true` booleans, arrays and objects, and **skips the keys `id`, `dayNumber` and `kind`**. Return strings in exactly this order: days, `tanggal mulai`, `jam mulai/selesai`, `titik kumpul`, `penjemputan`, hotel, transfer, meals. Count only items with content. Expected results for sources built with `createContentV2(mode)` (these are test 4's expectations):

  | From → to | `hasModeLoss` result |
  |---|---|
  | half_day → full_day | `[]` |
  | half_day → multi_day | `['jam mulai/selesai']` |
  | half_day → destination_guide | `['1 hari beserta aktivitasnya', 'tanggal mulai', 'jam mulai/selesai', 'titik kumpul']` |
  | full_day → half_day | `['pilihan makan']` |
  | full_day → multi_day | `['jam mulai/selesai']` |
  | full_day → destination_guide | `['1 hari beserta aktivitasnya', 'tanggal mulai', 'jam mulai/selesai', 'titik kumpul']` |
  | multi_day → half_day | `['1 hari selain hari pertama', 'info hotel', 'catatan perpindahan', 'pilihan makan']` |
  | multi_day → full_day | `['1 hari selain hari pertama', 'info hotel', 'catatan perpindahan']` |
  | multi_day → destination_guide | `['2 hari beserta aktivitasnya', 'tanggal mulai', 'titik kumpul']` |
  | destination_guide → half_day / full_day / multi_day | `['2 tempat']` |

  `penjemputan` appears only when `pickup.offered` is true; `createContentV2` has it off, so it is not in the table. Add one extra test case with pickup on.
- **M6 (PR-14):** add `normalizeBlanks(content): WebItineraryContent` that returns a clone where every nullable string listed in R5.3 ("Blank-to-null rule") that is `''` or whitespace becomes `null`, and every `durationMinutes` that is not an integer 1–1440 becomes `null`. `main.tsx` calls it in `save()` on the content it sends.
- Day counts after `changeMode`: to guide 0 days / places kept only if already a guide; guide → half/full 1 day; guide → multi 2 days; half/full → multi 2 days (first kept + one new); multi → half/full 1 day.

Check: `node scripts/web/typecheck-scope.mjs tsconfig.app.json src/editor/model.ts src/editor/labels.ts` → `0 error(s)`.

#### H4. Split `src/editor/sections/TripInfo.tsx` (move first, then fix)

Move the code, do not rewrite it. After the move, `TripInfo.tsx` contains only the trip-info section.

| New file | Takes from the current `TripInfo.tsx` |
|---|---|
| `src/editor/EditorForm.tsx` | `Patch`, `AiAction`, `MetaFn`, `EditorProps` types and `EditorForm`, which now only composes the section components in the order of "Editor behaviour" |
| `src/editor/fields.tsx` | add `PhotoField`, `LocaleField` (moved); delete `ObjectList` |
| `sections/TripInfo.tsx` | the `trip-info` section (incl. mode select and "Dari profil agensi" line) |
| `sections/TimeAndMeeting.tsx` | `time-meeting` section |
| `sections/TripGuide.tsx` | `trip-guide` section |
| `sections/Cover.tsx` | `cover` section |
| `sections/Summary.tsx` | `summary` section |
| `sections/DayCard.tsx` | `DayCard` and `ActivityList` |
| `sections/DaySchedule.tsx` | `schedule` section (half/full) |
| `sections/MultiDay.tsx` | `days` section (multi) |
| `sections/Places.tsx` | `places` section |
| `sections/Practical.tsx` | `practical` section |
| `sections/Closing.tsx` | `closing` section |
| `sections/AiAssist.tsx` | `ai-assist` section |
| `sections/ModePicker.tsx` | `ModePicker` |
| `sections/DraftList.tsx` | `DraftList` |

Section components take `props: EditorProps` (simplest; no prop drilling redesign). Every `.tsx` keeps `import React from 'react'` as its first import.

Then fix:
- **F1 `PhotoField`:** change its props to `{ id, basePath, mode, meta, photo, assets, emptyText, onAsset, onCredit }`, where `basePath` is e.g. `'cover'`, `'days[].photo'` or `'places[].photo'`. The asset select uses `meta(`${basePath}.assetId`, mode)`; the three credit fields use `meta(`${basePath}.credit.photographer`, mode)`, `…credit.url` (type `url`) and `…credit.source`. `emptyText`: cover → `statusCopy.noCover`; day and place → `statusCopy.noPhoto`.
- **F2 emergency contacts:** rows get "Naikkan", "Turunkan" (via `moveIndex`) and "Hapus kontak" (with `confirm`). Add button limit = `meta('emergencyContacts[].label', mode).maxItems`.
- **F3 AI panel:** delete `AiAssistProbe`; put the brief's `<label>` before its `<textarea>`.
- **F4 places:** render the group heading `<h4>` **before** the card when `index === 0 || place.group !== places[index - 1].group` and `place.group` is not null. Legend is only `Tempat {n}`. Delete asks `confirm('Hapus tempat ini?')`. Add limit `MAX_PLACES`.
- **F5 days (multi):** "Naikkan hari" disabled on the first day, "Turunkan hari" on the last; move = `renumberDays(moveById(days, id, delta))`; delete asks `confirm('Hapus hari ini beserta aktivitasnya?')`, then `renumberDays`. Add limit = `meta('days[].title', mode).maxItems` (14).
- **F6 `LocaleField`:** add a prop `unresolved: boolean`; show the `statusCopy.languageUnresolved` help text only when it is true (`language.source === 'unresolved'`).
- **F7 `ModePicker`:** show the badge (with the title) once, then description and "Contoh: …". No second title line.
- **F8:** the `LocaleField` input has `data-field-path="trip.language"`.

Check: `node scripts/web/typecheck-scope.mjs tsconfig.app.json src/editor/EditorForm.tsx src/editor/fields.tsx src/editor/sections` → `0 error(s)`.

#### H5. Rewrite `src/editor/main.tsx`

`main.tsx` keeps the app shell and the orchestration; the form comes from `EditorForm`. Get the old file at any time with `git show 8dd31c3:src/editor/main.tsx`.

- **Delete** (v1-only): local `Field`, `TextList`, `ObjectList`, `AssetSelect`, `options`, `modes`, `withAttribution`, `withAccommodation`, `setPath`, `setIndexed`, `setList`, `updateBlock`, `updateActivity`, `updateSpot`, `pendingRange` state, `requestRange`, `applyRange`, `reorderBlocks`, `removeBlock`, and the import of `coverage.ts`. Then delete `src/editor/coverage.ts`.
- **Keep unchanged** (only adjust types if needed): `isPendingAiResponse`, `SuggestionPanel`, `refresh`, the three `useEffect`s, `markDirty`, `edit` (type its mutator `(next: WebItineraryContent) => void`; `EditorForm`'s `patch` is `edit`), `installRecord`, `canDiscard`, `open`, `create`, `changeLocale`, `localeSupported`, `proposalValid`, `resolveLanguage`, `checkProvider`, `acceptLanguage`, `generate`, `proposalPanel`, `aiAction`, `save` (apply `normalizeBlanks` to the content it sends), `previewSaved`, `publishSaved`, `unpublish`, `copyShareLink`, `reloadLatest`, `copyLocal`, `saveProfile`, `upload`, `changeProfile`.
- **Change:**
  - AI target kind `'spot'` → `'place'` everywhere.
  - `findTarget`: `place` → `draft.places.some(p => p.id === target.id)`; `activity` → `draft.days.some(d => d.activities.some(a => a.id === target.id))`.
  - `requestMode` compares with `content.trip.mode`; `applyMode(mode)` = `edit(next => Object.assign(next, changeMode(next, mode)))`.
  - `focusDiagnostic`: replace with this (R5.7):
    ```ts
    function focusDiagnostic(d: { path: string; targetId?: string }) {
      const template = templatePath(d.path);
      const scoped = d.targetId ? document.querySelector<HTMLElement>(`[data-target-id="${CSS.escape(d.targetId)}"]`) : null;
      const root: ParentNode = scoped ?? document;
      const all = [...root.querySelectorAll<HTMLElement>('[data-field-path]')];
      const listIndex = /\[(\d+)\]$/.exec(d.path);
      let el = listIndex ? all.filter(e => e.dataset.fieldPath === template)[Number(listIndex[1])] : undefined;
      el ??= all.find(e => e.dataset.fieldPath === template)
        ?? all.find(e => e.dataset.fieldPath!.startsWith(`${template}.`))
        ?? all.find(e => e.dataset.fieldPath!.startsWith(template))
        ?? scoped ?? undefined;
      if (!el) return;
      for (let p = el.parentElement; p; p = p.parentElement) if (p instanceof HTMLDetailsElement) p.open = true;
      el.focus(); el.scrollIntoView({ block: 'center' });
    }
    ```
  - Diagnostic label: `labelFor(path)` = `fieldMeta(templatePath(path), mode).label` inside `try`, falling back to the raw path in `catch`.
- **Layout and the UI contract.** The browser scripts depend on these exact texts and attributes; keep every one:

  | Element | Exact text / attribute |
  |---|---|
  | status line | `<p role="status" aria-live="polite">`; messages "Engine tersambung", "Draft baru tersimpan", "Draft dibuka", "Tersimpan · revisi …", "Itinerary berhasil dipublish", "Link dicabut…" (copy these from the old file) |
  | left column | `<aside>` containing: `ModePicker` (cards with `data-mode-card`), `DraftList`, the agency profile panel (logo select has `data-field-path="profile.agencyLogoAssetId"` and an `id` the "Ubah profil" button focuses), asset upload |
  | draft header | title or "Tanpa judul" + mode badge + button "Simpan draft" + button "Preview" |
  | form | `<EditorForm …>` with `meta={fieldMeta}`, `patch={edit}`, `onModeChange={requestMode}` |
  | diagnostics | container `aria-label="Publish diagnostics"`; each item a `<button data-diagnostic-path={d.path}>` with text `` `${labelFor(d.path)}: ${d.message}` `` calling `focusDiagnostic(d)` |
  | preview | `<iframe title="Preview itinerary tersimpan" sandbox="" srcDoc=…>` + Phone/Desktop toggle (copy from old file) |
  | publication | buttons "Publish itinerary", "Publish ulang", "Cabut link", copy-link, version list (copy from old file) |
  | AI | `SuggestionPanel` and `aiAssistExtra` (provider check, daily usage, `statusCopy.aiNotActive` when the credential is missing, `statusCopy.modelLabel` or `Model: {modelId}`, `statusCopy.saveBeforeAi`) inside the AI panel only |
  | mode dialog | `role="dialog" aria-modal="true"`, heading "Ganti tipe itinerary?", the `hasModeLoss` strings as a list, buttons "Ganti tipe" and "Batal"; Escape cancels |
  | conflict | the 409 panel from the old file, unchanged |

- None of the six "Old" strings from the plain-language table may remain.

Check, in order: `node scripts/web/typecheck-scope.mjs tsconfig.app.json src` → `0 error(s)`; `npm run build:web-app` → success. Do **not** use `npm run start:web-app` for a manual check: it uses the real data folder. The browser checks come in H8 with a temporary data folder.

#### H6. `tsconfig.web.json` (PR-16)

Add `"jsx": "react-jsx"` to `compilerOptions`. Without it `tests/web/editor.test.ts` cannot typecheck once it imports `.tsx`.

Check: `node scripts/web/typecheck-scope.mjs tsconfig.web.json src/editor` → `0 error(s)`.

#### H7. Rewrite `tests/web/editor.test.ts`

Use `node:test`, `node:assert/strict`, `React.createElement` and `renderToStaticMarkup` from `react-dom/server`. Build `EditorForm` props with stubs: `aiAction: () => null`, `patch: () => {}`, `meta: fieldMeta`, `assets: []`, `writing: { brief: '', notes: [] }`, booleans `false`, strings `''`, `language: { requestedLanguage: 'auto', outputLanguage: null, source: 'unresolved' }`, `languageProposal: null`, `aiAssistExtra: null`.

Helper `expandedDraft(mode)`: start from `createContentV2(mode)` and set `cover = { assetId: 'a1', credit: { photographer: 'P', url: 'https://example.test/p', source: 'S' } }`, the same photo on every day (scheduled) or place (guide), `pickup = { offered: true, area: 'A', time: '07:00', dropoffNote: 'N' }` (scheduled only), one item in each of the five lists, `emergencyContacts = [{ label: 'Polisi', value: '110' }]`, one tip on every place. Expected paths per mode = registry paths where `appliesTo(field, mode)` and `control` is not `hidden` or `derived`.

Required tests (each name starts with the number):
1. Per mode: every expected path appears as `data-field-path="<path>"` in the markup, and no registry path that does not apply appears.
2. `fieldMeta` resolves every registry path for at least one mode it applies to; every non-hidden/derived `labelKey` has an entry in `fieldLabels` (or the path in `pathLabels`); `fieldMeta('included[]', 'full_day')` has `maxItems 50` and `maxLength 500`; `fieldMeta('trip.title', 'full_day').maxLength === 200`.
3. A draft built from `makeDay`/`makeActivity`/`makePlace` plus required text passes `validateDraft` with zero errors (one case per mode).
4. For all 12 ordered mode pairs from `createContentV2(source)`: `validateDraft(changeMode(...))` has zero errors; title, summary, the five lists and `guide` are kept; day/place counts match H3; `hasModeLoss` equals the H3 table exactly. Plus one case with pickup on → `penjemputan` appears for → guide.
5. Helpers: `normalizeBlanks` (blank nullable → `null`, bad duration → `null`), `setPhotoCredit(null, …) === null`, credit back to all-blank → `credit: null`, `normalizeHotel` all-blank → `null`, `ensureMeals`.
6. `moveById` / `moveIndex` keep IDs and do not mutate the input (port the two old tests).
7. No file under `src/editor/` contains any of the six "Old" strings; `labels.ts` contains all six "New" strings (read the files with `fs`).
8. Mutation check (manual, not a test): remove `data-field-path` from `TextField` in `fields.tsx`, run the test, confirm test 1 fails, restore. Write the result into the stage log.

Check: `npm run test:web-editor` → 0 fail and at least 8 passing tests (`ℹ pass`), then `node scripts/web/typecheck-scope.mjs tsconfig.web.json tests/web/editor.test.ts src/editor` → `0 error(s)`.

#### H8. Browser scripts

- **`scripts/web/verify-editor.ts`:** rewrite. Keep its server/browser setup, `availablePort`, `waitStatus`, `records`, `getRecord`, console-error and external-request capture, and the `page.on('dialog', d => d.accept())` handler. Select fields with `page.locator('[data-field-path="…"]')` (use `nth` for repeated paths), mode cards with `[data-mode-card="…"]`. Scenarios:
  1. For each mode card: create; status "Draft baru tersimpan"; badge text equals `modeCopy[mode].title`; the set of `[data-editor-section]` values equals: half/full `trip-info, time-meeting, trip-guide, cover, summary, schedule, practical, closing, ai-assist`; multi the same with `days` instead of `schedule`; guide `trip-info, trip-guide, cover, summary, places, practical, closing, ai-assist`.
  2. Half day: fill title, destination, summary, two activity titles; reorder with "Naikkan"; save ("Tersimpan · revisi"); read the record via API (A); reload, open the draft ("Draft dibuka"); the values of `trip.title`, `trip.destination`, `summary` and every `days[].activities[].title` equal A, and the order of `[data-target-id]` inside the schedule equals A's activity IDs.
  3. Mode change: in the half-day draft fill `trip.startTime` (`09:00`), then choose `multi_day` in the mode select; the dialog lists exactly `jam mulai/selesai`; click "Batal" → mode, start time and section list unchanged; repeat and click "Ganti tipe" → `days` section shown, 2 day cards, start time field gone. (When `hasModeLoss` is empty the change applies without a dialog; that is correct.)
  4. Multi day: click "Tambah hari" until 14 days; the button is disabled; save succeeds.
  5. Guide: click "Tambah tempat" until 60 places; the button is disabled; fill every place name/area/description with short text through `page.evaluate` using the native value setter plus an `input` event (the technique of the old `fill` helper), save succeeds.
  6. For each mode at 390×844 and 1280×900: no horizontal overflow; full-page screenshot `output/web-editor/r5-<mode>-390.png` / `r5-<mode>-1280.png`.
  7. No console errors, no external requests.
- **`scripts/web/verify-preview.ts`:** replace `page.select('#new-mode', 'half_day'); clickButton('Buat')` with a click on `[data-mode-card="half_day"]`; replace the activity title selector `input[id*="-activity-title-"]` with `[data-field-path="days[].activities[].title"]`; find the diagnostic with `[data-diagnostic-path="days[0].activities[0].title"]` instead of matching its text. Keep every other assertion.
- **`scripts/web/verify-publication.ts`:** replace `input[id$="-tripTitle"]` with `[data-field-path="trip.title"]`. Nothing else should need changing; if something else fails, fix the editor, not the assertion.

Check per script: `npm run build:web-app` then the script; exit code 0.

#### H9. R5 gate, stage log, commit, STOP

Run in this order and paste each result into `logs/cp022_stage-log_r5-editor-v2.md`:

| # | Command | Expected |
|---|---|---|
| 1 | `npm run build:brochure-css && npm run build:web-app` | success |
| 2 | `node scripts/web/typecheck-scope.mjs tsconfig.app.json src scripts/web/verify-editor.ts` | `0 error(s)` |
| 3 | `node scripts/web/typecheck-scope.mjs tsconfig.web.json src/editor tests/web/editor.test.ts scripts/web/verify-editor.ts scripts/web/verify-preview.ts scripts/web/verify-publication.ts` | `0 error(s)` |
| 4 | `npm run test:web-editor` | ≥ 8 pass, 0 fail |
| 5 | `npm run verify:web-editor`, `npm run verify:web-preview`, `npm run verify:web-publication` | exit 0 each |
| 6 | `test:web-contracts`, `test:web-store`, `test:web-api`, `test:web-ai`, `test:web-render`, `test:web-preview`, `test:web-publication` | 42 / 11 / 12 / 28 / 14 / 12 / 12 pass, 0 fail |
| 7 | `npm run typecheck:web-server`, `npm run check:web-types`, `npm run verify:web-render` | 0 errors / matches / exit 0 |
| 8 | `grep -rnE "brochure\.|\.schedule\b|spots|makeSpot|timeLabel|durationLabel|resizeScheduleRange" src/editor` | no output |
| 9 | `grep -rnE "@ts-(ignore|expect-error|nocheck)|as any|: any\b|<any>" src/editor tests/web/editor.test.ts` | no output |
| 10 | `git diff --stat 8dd31c3 -- config src/contracts src/server src/render src/api package.json` | no output |
| 11 | `ls src/editor/coverage.ts` | "No such file" |

Then:
- Open the 8 `output/web-editor/r5-*.png` screenshots and write one sentence each (what you saw: sections present, labels Indonesian, no overflow, badges distinct). If you cannot view images, write that and leave the visual check to the reviewer.
- Record the H7 mutation check result, every deviation and every open question.
- `TODOS.md` R5 line: append "(gate run <date>: pass; awaiting review)". CP022 stays `in_progress`.
- Commit: `git add` the files you changed or created under `src/editor`, `tests/web/editor.test.ts`, the three `scripts/web/verify-*.ts`, `tsconfig.web.json`, `TODOS.md`, the stage log; message `CP022 revision: R5 editor guide-centric schema web-2.0.0 (pending review)`; remove the deleted `src/editor/coverage.ts` with `git rm`.
- **STOP.** Report: commit hash, the gate table with counts, screenshot notes, deviations, open questions. Do not start H10.

#### H10. R6 (only after the owner says "lanjut R6")

Follow R6.1–R6.6 above, with these additions:

- **Order** (one script at a time; after each, run that script and `node scripts/web/typecheck-scope.mjs tsconfig.web.json <that file>`): `verify-ai.ts` (default deterministic mode only) → `verify-ai-ui.ts` → `probe-publish-retry.ts` (`npm run verify:web-publish-retry`) → `probe-recovery-scope.ts` (`npm run probe:web-recovery-scope`) → `probe-cp027-findings.ts` (no npm script: make it typecheck and run it once with `npx tsx scripts/web/probe-cp027-findings.ts`; if it needs something unavailable, record "skipped" with the reason) → `verify-readiness.ts` → `tests/web/cp027-fixtures.json` → `verify-e2e.ts` (largest, last).
- **Field mapping v1 → v2** (authoritative source: `src/contracts/upgrade-v1.ts` and `src/contracts/itinerary.generated.d.ts`; check each use against them):

  | v1 | v2 |
  |---|---|
  | `brochure.tripTitle` / `destination` / `country` / `region` | `trip.title` / `trip.destination` / `trip.country` / `trip.region` |
  | `brochure.itineraryMode` | `trip.mode` |
  | output language in brochure/languageContext | `trip.language` (+ `languageContext` in the API body) |
  | `hero.assetId` + `hero.photoAttribution` | `cover` (`{ assetId, credit }`) |
  | `overview.summary` | `summary` |
  | `schedule[]` (blocks with `dayStart/dayEnd`) | `days[]` (one per day, `dayNumber` derived) |
  | `activity.timeLabel` / `durationLabel` / `type` / `area` | `time` (`HH:MM` or null) / `durationMinutes` / `kind` / `place` |
  | `spots[]`, `groupLabel`, `bestTimeToVisit`, `nearbyPairing` | `places[]`, `group`, `bestTime`, `nearby` |
  | `practical.included` / `notIncluded` / `whatToBring` / `localTips` / `healthSafety` | top-level `included` / `notIncluded` / `whatToBring` / `localTips` / `healthSafety` |
  | AI target `{ kind: 'spot' }` | `{ kind: 'place' }` |
  | removed: highlights, routeSummary, bestSeason, closing photo credits, scope label, travellers, pace, themes | do not port; drop the assertion only if it checks a removed field, and list each dropped assertion in the R6 stage log |

- **Gate:** as R6.4, plus `npx tsc --noEmit -p tsconfig.web.json` and `npx tsc --noEmit -p tsconfig.app.json` both with 0 errors (full, unscoped).
- Logs/docs/TODOS/commit as R6.6. Then **STOP** and report as in H9.

#### Planner decisions in this section (the owner may override before execution)

- **PR-12:** Meals are `null` only for `half_day`; `full_day`/`multi_day` always store an object (matches `createBlankDraft`).
- **PR-13:** Credit edits never create a photo; credit fields exist only after a photo is chosen.
- **PR-14:** Blank nullable strings become `null` once, at save time (`normalizeBlanks`), instead of per keystroke.
- **PR-15:** The places limit is the constant `MAX_PLACES = 60` until the schema gets `places.maxItems` (R1 finding R1-S1, for the R1 reviewer).
- **PR-16:** `tsconfig.web.json` gets `"jsx": "react-jsx"`; fixes the planner defect P1.
- **PR-17:** `hasModeLoss` counts only days/places with content and ignores `id`, `dayNumber` and `kind`.
- **PR-18:** Review stop between R5 and R6 (Haiku → review → Haiku workflow).

### R5 review round 1 (reviewer, 2026-11-10) — must pass before CP022 is completed

Review: `logs/cp019-cp025_review-log_r3-r6.md` (R3, R4, R6 accepted; R5 REVISE). **PR-15 is withdrawn**: ruling R1 D2 accepted no place cap, so 60 places is a stress case, not a limit. Rules H0 above still apply (repo root, stage files by name, no `any`, no weakened assertions, paste real output). Work only in the files named below.

- **RF1 (M1) Blank rows are dropped at save.** In `src/editor/model.ts` `normalizeBlanks`: remove entries that are blank after `trim()` from `included`, `notIncluded`, `whatToBring`, `localTips`, `healthSafety` and every `places[].tips`; remove emergency contacts whose `label` and `value` are both blank. Keep non-blank text exactly as typed (do not trim it). Tests: extend test 5 in `tests/web/editor.test.ts` with these cases (blank, whitespace-only, contact with one side filled is kept). Browser: in `scripts/web/verify-editor.ts` guide scenario, click "Tambah tidak termasuk" and leave the row empty before saving; assert the saved `notIncluded` is `[]`.
- **RF2 (L1) No place cap.** Delete `MAX_PLACES` from `src/editor/schema-meta.ts` and the `disabled` condition on "Tambah tempat" in `sections/Places.tsx`. In `verify-editor.ts` replace the assertion that "Tambah tempat" is disabled at 60 with an assertion that the button is still enabled at 60; keep the 60-place save/reopen checks.
- **RF3 (L2) Readable save errors.** In `main.tsx`, render each `sectionErrors` item as `labelFor(item.path, activeMode): item.message` (same helper as the publish diagnostics), and make each item a button with `data-diagnostic-path` that calls `focusDiagnostic(item)`.
- **RF4 (L3) Visible focus on theme swatches.** In `fields.tsx` `ThemePicker`, give the `<label>` a visible focus style when its radio has keyboard focus (for example Tailwind `has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-teal-700`). Check it by tabbing in a 1280 screenshot added to `verify-editor.ts` (`output/web-editor/r5-theme-focus.png`).
- **RF5 (L4) Doc wording.** In `docs/engine-runtime-contract.md`, change "mirrors" to "must equal" for `trip.language` vs `languageContext.outputLanguage`, and mention that a mismatch returns `422 INVALID_LANGUAGE_CONTEXT`. Same wording in the line under "Locale detection boundary".
- **RF6 Log corrections (append only).** Append a dated "Review correction 2026-11-10" paragraph to the CP019 and CP022 revision sections in their completion logs stating that R1-S1 / `MAX_PLACES` were withdrawn per ruling D2. Do not edit earlier text.

Not in this round (follow-ups recorded in the review log): F-R3-1 duplicate mode label in the hero, F-R3-2 renderer-side blank filtering, P1 language select with names.

**Gate:** `npm run build:web-app`; full `npm run typecheck:web-app` and `npm run typecheck:web-contracts` (0 errors); `npm run test:web-editor` (all pass, at least 25 tests); `npm run verify:web-editor`, `verify:web-preview`, `verify:web-publication` (exit 0); `test:web-render` 14 and `test:web-preview` 12 unchanged. Open `r5-theme-focus.png` and say what you see. Append a "Round 1" section to `logs/cp022_stage-log_r5-editor-v2.md` with the commands and counts. Commit `CP022 revision: R5 review round 1 fixes (pending review)`. Stop and report.

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
