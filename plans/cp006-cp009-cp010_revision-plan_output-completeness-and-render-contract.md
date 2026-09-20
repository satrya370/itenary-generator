# CP006 / CP009 / CP010 Revision Plan: Output Completeness and Render Contract

**Scope:** one combined revision plan covering CP006 (final copy and canonical
assembly), CP009 (HTML shell and scheduled layout), and CP010 (guide layout).

**Rationale for combining (user decision, see Clarifications D1):** every defect
below has a single root cause — the `canonicalItinerary` contract in `SPEC.md`
§11 and the renderer's actual field reads have drifted apart, and nothing in the
pipeline compares them. Splitting this into three plans would require three
live end-to-end runs to verify interdependent fixes that can only be observed
together in one rendered brochure. Each CP still receives its own dated
revision entry in its own completion log (`RULES.md` §8).

---

## Reason for Revision

The user reported that the rendered brochure looked thin — "overview-nya dikit
banget, penjelasan tiap itinerary dikit banget, ada yang belum keisi."

Investigation of real execution data proved the **opposite of the initial
hypothesis**: the AI output is rich and complete. `overview.summary` is 203
characters, `practical.localTips` has 6 topic-tagged entries,
`practical.whatToBring` has 6 items, `healthSafety` has 5, activity
descriptions run 142–178 characters each, and every schedule block carries
`title`, `location`, `mealsIncluded`, `transportNote`, and `blockTip`.

The brochure looks thin because **the renderer silently discards a large
fraction of that data**, and because two AI-side shape inconsistencies cause
whole sections to vanish. Nothing failed loudly: no QA gate fires, no parse
error is raised, no execution is marked unsuccessful. The data is generated,
paid for in tokens, stored in the canonical contract — and then dropped at the
last step.

Two prior mis-diagnoses in this same investigation are recorded here so the
audit trail is honest, and because both are instructive:

1. First claim: "`overview`, `practical`, and `closing` are `undefined` — the
   sections are missing entirely." **Wrong.** The canonical is nested under a
   `canonicalItinerary` key on the assembly node's output item; reading
   `json.overview` instead of `json.canonicalItinerary.overview` produced
   `undefined` for every section and looked exactly like catastrophic data
   loss. Corrected by inspecting the item's top-level keys before drawing any
   conclusion.
2. Second claim, made earlier in the session: recommendations about photo
   galleries, CTA buttons, pricing, and social proof. **Wrong framing.** This
   product is a guidance document for guests whose trip is already fixed, not
   a sales brochure. Recommendations premised on converting a prospect do not
   apply and were withdrawn.

Both errors shared a cause worth naming: concluding from a partial read instead
of verifying against the actual artifact. Every defect in this plan is
therefore stated with the specific evidence that confirms it, and none is
carried over from the earlier analysis.

---

## Clarifications and Decisions

Ask Question gate completed 2026-09-06 (`RULES.md` §4, §6.1).

| ID | Question | Decision |
|---|---|---|
| D1 | Split the revision per CP, or one combined plan? | **One combined plan.** Root cause is a single contract-drift theme; the fixes are only observable together in one rendered output. Per-CP completion logs still required. |
| D2 | Render the currently-discarded block fields (`mealsIncluded`, `transportNote`, `blockTip`, `blockRangeLabel`, `location`, `title`)? | **Yes, add all of them.** The data already exists in the canonical contract and costs no additional AI call. This is the single largest available gain in guidance completeness. |
| D3 | Section headings are hardcoded English ("Trip overview", "Know before you go") while body content is Indonesian. Localise them? | **No — leave English.** User decision: treat the English section furniture as a deliberate, consistent design choice. **Explicitly out of scope for this revision.** |
| D4 | `overview.routeSummary` arrives as a bare string in some runs and an array in others. How to handle? | **Tighten validation and make the renderer tolerant.** Close the validator's logic hole, restate the shape in the prompt, and additionally let the renderer accept a string by splitting it into stages. Defence in depth, matching the `[object Object]` fix pattern from CP006's 2026-09-04 revision. |

---

## Existing Behavior

All items below were confirmed against real execution data and the real
rendered HTML — not by reading source. Evidence column cites the artifact.

### Group A — Field-name mismatches between `SPEC.md` §11 and the renderer

`SPEC.md` §11 defines `activities[]` as
`{ timeLabel, type, title, description, durationLabel? }`. The AI complies
exactly. The renderer reads `activity.time` and `activity.duration`.

| # | Defect | Consequence | Evidence |
|---|---|---|---|
| A1 | `renderStop` reads `activity.time`; data has `timeLabel` | **Every activity time renders empty.** Not degraded — absent. | `cp013-full_day.html`: 3 of 3 `<time class="stop-time"></time>` empty. `cp013-multi_day_fixed.html`: 11 of 11 empty. |
| A2 | `renderStop` reads `activity.duration`; data has `durationLabel` | **No duration ever renders.** The `.stop-duration` element never appears in any output. | Both files: `class="stop-duration"` absent entirely. |
| A3 | `renderScheduled` routes transport activities via `activity?.type === 'transport' && !activity.time` | Because A1 makes `activity.time` permanently `undefined`, **every** transport activity becomes a thin dashed connector; the full-stop branch is dead code and unreachable. | `cp013-full_day.html`: 3 travel-connectors, 3 timeline-stops from 6 activities — all 3 transports demoted. |
| A4 | `blockLabel()` reads `block.dayLabel \|\| block.day`; data has `blockLabel` | Day headings fall back to the hardcoded English `Day N`, discarding the AI's Indonesian label. | `exec_multi_day_light_final.json`: `blockLabel: "Hari 1"`. `cp013-multi_day_fixed.html`: renders `>Day 1<`; `<h3>Hari 1</h3>` absent. |
| A5 | Day subtitle reads `block.area \|\| block.summary \|\| block.date`; data has `title` and `location` | Day subtitle is empty, and `block.title` — the day's editorial theme — is discarded. | `exec_multi_day_light_final.json`: `title: "Pengenalan budaya Ubud"`, `location: "Ubud, Bali"`; neither string appears in the rendered HTML. |
| A6 | `renderStop` reads `activity.area` / `activity.category` for `.stop-meta` | Schedule activities have no such fields (only `spots[]` do), so `.stop-meta` is always empty for scheduled modes. | `SPEC.md` §11 `activities[]` key list. |

### Group B — Data generated and then discarded by the renderer

Every field here is populated in the canonical contract and rendered nowhere.

| # | Field | Real value observed | Evidence |
|---|---|---|---|
| B1 | `schedule[].mealsIncluded` | `["Makan siang"]` | `exec_multi_day_light_final.json`, both blocks |
| B2 | `schedule[].transportNote` | *"Gunakan kendaraan dengan pengemudi untuk perpindahan antara Ubud dan Tegallalang; siapkan alas kaki…"* | `exec_full_day_final.json` |
| B3 | `schedule[].blockTip` | *"Bawa air minum, pelindung matahari, dan pakaian yang nyaman…"* | `exec_full_day_final.json`; string absent from `cp013-full_day.html` |
| B4 | `schedule[].title` | *"Pengenalan budaya Ubud"* | see A5 |
| B5 | `schedule[].location` | *"Ubud, Bali"* | see A5 |
| B6 | `schedule[].blockRangeLabel` | present in contract for condensed multi-day ranges (D6) | `SPEC.md` §11 |
| B7 | `practical.localTips[].topic` | `"Mobilitas"`, `"Jalur persawahan"`, `"Pakaian"`, `"Kuliner"`, `"Cuaca"`, `"Keluarga"` | `exec_full_day_final.json`; `renderPractical` passes `localTips` through `textList()`, which extracts only `.note` and drops `.topic`, so 6 well-categorised tips render as an uncategorised flat list |

B3 deserves emphasis: `blockTip` is per-day actionable guidance — precisely the
content this product exists to deliver — and it is generated on every run and
shown to nobody.

### Group C — AI-side shape inconsistency

| # | Defect | Consequence | Evidence |
|---|---|---|---|
| C1 | `overview.routeSummary` is a bare **string** in the `full_day` run and a 2-element **array** in the `multi_day` run | `renderOverview` guards with `Array.isArray(...) ? ... : []`, so when a string arrives **the entire Route line disappears** with no warning. | `exec_full_day_final.json`: `typeof routeSummary === 'string'`. `cp013-full_day.html`: `class="route-line"` absent. |
| C2 | `Parse Final Copy`'s validator has a logic hole: `!Array.isArray(x) \|\| x.every(isString)` short-circuits to **true** for a non-array | A string `routeSummary` passes validation silently. The guard added in CP006's 2026-09-04 revision blocks arrays-of-objects but not non-arrays. | Source of `Parse Final Copy`; C1 observed live. |
| C3 | `overview.highlights[].icon` returns emoji (`🌾`, `🍽️`, `🚶`, `🏛️`, `🎨`) | `icon()` looks the value up in `ICONS` (7 controlled keys per `SPEC.md` §11.1), misses, and falls back to `ICONS.activity` — so **every highlight renders the same generic icon**, defeating the visual differentiation the section exists for. | `exec_full_day_final.json` and `exec_multi_day_light_final.json` icon arrays; identical icons visible in `cp013-multi_day_fixed-top.png`. |

### Group D — Other confirmed defects

| # | Defect | Consequence | Evidence |
|---|---|---|---|
| D-1 | `accommodation.note` contains hardcoded English: *"Choose an overnight base near this day's location."* | English string leaks into an Indonesian brochure, in the accommodation card a guest actually reads. **Correction (execution note, not part of the original plan draft):** this fallback string is not in `Assemble canonicalItinerary` (CP006) as first assumed — it is in **`Parse Skeleton Result`, which belongs to CP003 (Body Skeleton)**. Fixed there; see CP003's completion log for its own revision entry. Recorded here because it was discovered as part of this investigation. | `exec_multi_day_light_final.json`, both blocks; confirmed by direct source inspection of `Parse Skeleton Result`'s `normalizeBlock()` |
| D-2 | `.fact-value` uses `white-space:nowrap` + `text-overflow:ellipsis`; `quickFacts.bestSeason` is a full sentence | Fact strip truncates mid-word — *"Pilih periode dengan pr…"*, *"2 hari di Ubud dan sekit…"* — reading as a broken layout. | `cp013-multi_day_fixed-top.png`, `cp013-destination_guide_light-top.png` |

### Explicitly *not* defects

Recorded so they are not "fixed" by mistake:

- **English section headings** — out of scope by D3.
- **No per-venue photography** — deliberate (`SPEC.md` §7.1, D3/D4): stock
  imagery must never be presented as depicting a named venue. `hero.photoUrl:
  null` with `gradientOnly: true` is the correct fallback, not a failure.
- **No prices, opening hours, or ticket costs** — deliberate (D7, D11).
- **Guide-mode `spots[]` field names** — verified to match the renderer
  exactly (`name`, `area`, `category`, `description`, `suggestedDuration`,
  `bestTimeToVisit`, `gettingThere`, `tips`, `nearbyPairing`). CP010's card
  body has **no** mismatch; only the shared shell defects (C1, C3, D-2) affect
  guide mode.

---

## Required Behavior

1. Every field the AI populates in `canonicalItinerary` either renders, or is
   documented in `SPEC.md` as intentionally non-rendered. No field is dropped
   silently.
2. Activity time and duration render for every activity that carries them.
3. A transport activity becomes a connector based on an explicit, intentional
   rule — not as a side effect of a field-name typo.
4. Day headings use the AI's own label; the English `Day N` remains only as a
   genuine fallback when no label exists.
5. `routeSummary` renders whether it arrives as an array or a string; a
   non-array is additionally rejected by the validator so the canonical data
   stays correct even though the renderer can cope.
6. Highlight icons differentiate visually; an emoji or unknown key maps to a
   sensible controlled icon rather than collapsing everything to one.
7. No hardcoded English string reaches an Indonesian brochure from a fallback
   path.
8. The fact strip shows its value or wraps it — never truncates mid-word.

---

## Proposed Changes

### 1. Renderer field contract — `render-itinerary-html.js`, `Render HTML`, `Guide Layout`

All three copies must change together. The two n8n Code nodes embed duplicates
of the same functions because the sandbox cannot import the file (established
in CP009/CP010).

- `renderStop`: read `activity.timeLabel ?? activity.time` and
  `activity.durationLabel ?? activity.duration`. Accept both names rather than
  swapping one typo for another, so a future contract change cannot blank the
  field again.
- `renderScheduled` transport branch: change the condition to
  `type === 'transport' && !(activity.timeLabel ?? activity.time)`, restoring
  the intended behaviour — a transport leg with an explicit time is a real
  stop; one without is a connector.
- `blockLabel()`: read `block.blockLabel ?? block.dayLabel ?? block.day`
  before the `Day N` fallback.
- Day header: render `block.title` as the heading text and
  `[block.location, block.blockRangeLabel, block.date]` as the subtitle,
  keeping the day label in the numbered marker.
- `renderTravel`: prefer `activity.durationLabel` in the connector label.

### 2. Render the discarded block fields (D2)

Add to each day/block, using existing components — no new visual language:

- `mealsIncluded` → a compact meal chip row in the day header (reuse
  `.stop-meta` styling).
- `transportNote` → a note directly under the day header, reusing
  `.travel-note`.
- `blockTip` → a `.tip-callout` at the end of the block, the same component
  already used for `activity.tip`.
- `location` / `blockRangeLabel` → day subtitle (see §1).

For `half_day` / `full_day` (single block, no day header), place
`transportNote` and `blockTip` at the top and bottom of the timeline
respectively so the content is not lost with the header.

### 3. `localTips[].topic` (B7) — `renderPractical`

Render `localTips` with its own small renderer instead of `textList()`, so each
entry shows `topic` as a label and `note` as the text. Leave every other
`practical` array on `textList()` — they are genuinely flat lists.

### 4. `routeSummary` — three layers (D4)

- `Parse Final Copy`: fix the validator hole. Require
  `Array.isArray(routeSummary) && routeSummary.every(isString)` when the field
  is present, so a string is rejected with the existing
  `FINAL_COPY_ROUTESUMMARY_SHAPE_INVALID` code.
- `Build Final Copy Request`: restate the shape and add an explicit negative —
  *not a single paragraph, not one long string* — since the observed failure is
  a string, which the current wording does not rule out.
- `renderOverview`: accept a string by splitting on sentence boundaries into
  stages, so a shape slip degrades to a readable route line instead of an
  absent section.

### 5. Highlight icons (C3)

- `icon()`: add an emoji→controlled-key map for the emoji the model actually
  emits (🌾/🍽️/🚶/🏛️/🎨 and near neighbours), plus a keyword fallback that
  matches the highlight `title` against the 7 controlled types. Unknown values
  still resolve to `activity`, but only after both attempts fail.
- `Build Final Copy Request`: state the 7 allowed `icon` values explicitly and
  forbid emoji. Prompt and renderer are fixed together — the prompt reduces the
  problem, the renderer guarantees the outcome.

### 6. English fallback leak (D-1)

In the assembly node, derive the accommodation fallback note in the resolved
`outputLanguage` (the field already exists on the item), or omit the note when
no localised text is available. Never emit a hardcoded English sentence.

### 7. Fact strip truncation (D-2)

Allow `.fact-value` to wrap to two lines (drop `nowrap`, add `-webkit-line-clamp:2`
or an equivalent max-height) so a sentence-length `bestSeason` stays readable.
Verify at 390px and 1440px, and in the PDF.

---

## Impact and Regression Risk

| Change | Risk | Mitigation |
|---|---|---|
| Field-name reads (§1) | Low. Additive `??` chains; no existing working read is removed. | Both old and new names accepted. |
| New block content (§2) | **Medium — the real risk in this revision.** More content per block can change PDF pagination and may break `break-inside: avoid` on day cards. | Verify rendered PDF page breaks for `multi_day` explicitly (`RULES.md` §11a). This is the one change that cannot be verified from HTML alone. |
| `localTips` renderer (§3) | Low, isolated to one section. | Fixture with `localTips` as plain strings must still render. |
| `routeSummary` validator (§4) | **Medium.** A stricter validator can reject responses the pipeline previously accepted, converting silent degradation into a hard failure. | Correct trade-off — a rejected response retries or fails loudly rather than shipping a brochure with a missing section. Must confirm the string case is actually rejected, and that the array case still passes. |
| Icon mapping (§5) | Low. Fallback chain only lengthens. | Confirm a controlled key still maps to itself. |
| English fallback (§6) | Low. | Confirm no English leaks in an `id` run and that an `en` run is unaffected. |
| Fact strip CSS (§7) | Low, but PDF-visible. | Visual verification in HTML and PDF at both widths. |

**Sequencing risk, previously realised in this project:** all n8n edits go
through full-workflow `PUT` via the REST API (n8n-mcp is currently
`ConnectionRefused`). A `PUT` built from a stale snapshot silently reverts
intervening fixes — this happened on 2026-09-04 and is recorded in CP006's
completion log. **Re-fetch immediately before each `PUT`, and before any live
test assert by string match that all previously deployed fixes are still
present.**

---

## Verification Plan

No claim of success without the cited artifact (`RULES.md` §5a phase 5, §11a).

### Unit / local

1. Render `exec_full_day_final.json`'s canonical through the patched
   `render-itinerary-html.js`; assert every `<time class="stop-time">` is
   non-empty and `.stop-duration` appears.
2. Assert `class="route-line"` is present for the string-`routeSummary`
   fixture that currently produces nothing.
3. Assert `blockTip`, `transportNote`, and `mealsIncluded` strings appear in
   the HTML.
4. Assert `<h3>` uses `block.title` and the day marker keeps the label.
5. Assert the 6 `localTips` `topic` labels appear.
6. Assert highlight icons resolve to at least three distinct SVG paths.
7. Negative fixtures: `localTips` as plain strings; `routeSummary` as a proper
   array; an activity with `time`/`duration` (old names) — all must still work.
8. `Parse Final Copy` in isolation: string `routeSummary` → rejected with
   `FINAL_COPY_ROUTESUMMARY_SHAPE_INVALID`; array of strings → accepted.

### Live

9. One live run per mode via the real form, workflow activated only for the
   run and deactivated immediately after (`RULES.md` §11): `half_day`,
   `full_day`, `multi_day`, `destination_guide`.
10. For each: `qaOk: true`, no new failure codes, and the rendered HTML
    satisfies checks 1–6.
11. Confirm no hardcoded English in the `id` runs (grep the rendered HTML for
    the known leak string and for stray English sentences in accommodation
    notes).

### Rendered visual (mandatory, `RULES.md` §11a)

12. PDF for all four modes with `printBackground: true`; open and look at each.
13. `multi_day` PDF specifically: confirm no day card splits across a page
    break after the added content, and that page count stays within
    `SPEC.md` §4.3.
14. Fact strip at 390px and 1440px and in the PDF: full value visible or
    cleanly wrapped, never truncated mid-word.
15. Screenshot evidence retained under `output/` and cited in each completion
    log.

---

## Updated Acceptance Criteria

| # | Criterion | How verified |
|---|---|---|
| 1 | Every activity with `timeLabel` renders its time | Check 1, 10 |
| 2 | Every activity with `durationLabel` renders its duration | Check 1, 10 |
| 3 | Transport-vs-connector routing is driven by an explicit rule, and a timed transport renders as a full stop | Check 7, source review |
| 4 | Day heading uses `block.title`; day label appears in the marker; no English `Day N` when a label exists | Check 4, 10 |
| 5 | `mealsIncluded`, `transportNote`, `blockTip`, `location`, `blockRangeLabel` all render | Check 3, 10 |
| 6 | `localTips` render with their `topic` labels | Check 5, 10 |
| 7 | Route line renders for both string and array `routeSummary` | Check 2, 7, 10 |
| 8 | A string `routeSummary` is rejected by `Parse Final Copy` | Check 8 |
| 9 | Highlight icons visually differentiate | Check 6, 12 |
| 10 | No hardcoded English string in an `id` brochure | Check 11 |
| 11 | Fact strip never truncates mid-word | Check 14 |
| 12 | All four modes complete with `qaOk: true` | Check 9, 10 |
| 13 | No day/spot card splits across a PDF page break | Check 13 |
| 14 | Workflow left `active: false`; no other product directory in this repo modified | Post-run check |

**Out of scope, must remain unchanged:** English section headings (D3),
gradient-only hero and absence of per-venue photos (`SPEC.md` §7.1), absence of
prices and opening hours (D7, D11).

---

## Rollback

- Fetch and store a full workflow JSON snapshot immediately before the first
  `PUT`, as `output/wf-prerevision-<date>.json`. Rollback is a single `PUT` of
  that snapshot.
- `render-itinerary-html.js` is under git; revert via git.
- CSS change (§7) is a one-line revert.
- Each change is independently revertible: if the added block content (§2)
  breaks PDF pagination and cannot be resolved, it can be dropped while the
  field-name fixes (§1) — the highest-value, lowest-risk part — are kept.
