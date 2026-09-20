# CP009 Completion Log: HTML Shell and Scheduled Layout

## Result

- Status: `completed`
- Summary: Added a self-contained renderer and scheduled timeline layout with
  shared hero, overview, practical, and closing sections.

## Revision

- Revision plan: `../plans/cp009_revision-plan_modern-editorial-redesign.md`
- Result: replaced cream/warm card styling with the approved cool-neutral,
  ink-navy, emerald editorial system; scheduled behavior remains intact.

## Files and Workflow Changed

| Artifact | Change |
|---|---|
| `render-itinerary-html.js` | Mobile-first inline CSS/SVG renderer |
| `output/playwright/scheduled-fixture.json` | Visual verification fixture |
| `output/playwright/scheduled-fixture.html` | Rendered evidence |
| `output/playwright/scheduled-phone.png` | Phone viewport evidence |
| `output/playwright/scheduled-desktop.png` | Desktop viewport evidence |
| n8n `GRuSSwnW38U1HNgK` | Added CP009 request, render, and CP010 handoff nodes |

## Verification

| Check | Result |
|---|---|
| Renderer syntax and CLI output | PASS |
| Phone visual (390×844) | PASS: readable stacked timeline, continuous connector |
| Desktop visual (1280×900) | PASS: centered shell, four-column facts, spacious cards |
| Inline CSS/SVG/no CDN | PASS |
| Palette injection and empty-section omission | PASS |
| Runtime workflow validation | PASS: 57 nodes, 97 valid connections, 0 errors, 0 warnings |
| Workflow state | PASS: inactive |

## Known Limitation

The in-workflow Code renderer is a sandbox-safe compact renderer; the full
shared renderer source remains `render-itinerary-html.js` for later PDF use.

## Revision: 2026-08-28 — OTA-polished journey layout

### Revision Plan

`../plans/cp009_revision-plan_modern-editorial-redesign.md`

### Changes Made

- Rebuilt the scheduled experience around a three-part vertical journey:
  time rail, connected marker rail, and readable content rail.
- Added compact OTA-style hero metadata, route/fact strip, day index, day
  range labels, travel connectors, inline tips, and distinct overnight rows.
- Replaced the former warm editorial treatment with a cool neutral base,
  destination palette accents, modern sans-serif typography, restrained
  shadows, and tighter mobile spacing.
- Preserved the different scheduled behaviours: continuous half/full-day
  flow, day-indexed multi-day flow, and condensed long-trip blocks.

### Verification Performed

| Check | Result |
|---|---|
| `node --check render-itinerary-html.js` | PASS |
| Scheduled fixtures: half day, full day, 3 day, 7 day, 14 day | PASS: all contain the new timeline and no old style tokens |
| Phone visual evidence (390×844) | PASS: half-day, full-day, and 7-day routes are readable with a continuous vertical rail |
| Desktop visual evidence (1440×1000) | PASS: half-day, full-day, 7-day, and 14-day routes retain hierarchy and day scanning |
| Inline CSS/SVG and no external stylesheet/font import | PASS |
| Runtime workflow validation | PASS: 59 nodes, 102 valid connections, 0 errors, 0 warnings |
| Workflow state/settings | PASS: inactive; `saveDataSuccessExecution: all` |

### Outcome

The scheduled layout now borrows the information density and route hierarchy
of OTA product pages without adding ratings, prices, scarcity, or booking
calls-to-action prohibited by the product specification.

## Revision: 2026-08-28 - Unified rail-first scheduled timeline

### Revision Plan

`../plans/cp009_revision-plan_modern-editorial-redesign.md`

### Changes Made

- Removed the remaining regular-stop bottom borders and day-section divider
  treatment from `render-itinerary-html.js`.
- Applied the same changes to the n8n `Render HTML` Code node, eliminating
  the visual discrepancy between the browser fixture renderer and production
  workflow output.
- Retained explicitly exceptional panels only for overnight accommodation and
  slim inline tips; travel remains a dashed connector rather than a stop.

### Verification Performed

| Check | Result |
|---|---|
| Full renderer syntax and scheduled fixture regeneration | PASS |
| Exact saved n8n Code node exercised with a full-day fixture | PASS: `CP009_HTML_RENDERED`; regular stops unboxed and timeline rail present |
| Local rendered desktop inspection (1440×1000) | PASS: multi-day content reads as a continuous rail beneath day context, not card blocks |
| Local rendered phone inspection (390×844) | PASS: full-day content preserves the compact non-card visual rhythm |
| n8n runtime validation | PASS: 59 nodes, 102 valid connections, 0 errors, 0 warnings |
| Workflow safety state | PASS: inactive; `saveDataSuccessExecution: all` |

### Acceptance Criteria Results

- Scheduled stops are canvas-based timeline content in both renderer paths:
  PASS.
- Day labels are contextual navigation, not filled cards: PASS.
- Accommodation and tips remain the only intentionally bounded treatments:
  PASS.

### Remaining Limitations

The n8n Code node remains a compact copy of the renderer because the n8n
sandbox cannot import the workspace module directly; its core timeline CSS is
now intentionally kept in parity and was tested from the exact saved source.

## Revision: 2026-09-04 - Fix mojibake in the deployed n8n node (not the file)

### Revision Plan

None — direct fix authorized by user after a live-rendered brochure showed
visibly corrupted text (`RULES.md` §5a Working phase).

### Reason for Revision

The **first-ever live, real-model, real-render execution** of this workflow
(enabled by the CP002/CP005 model-name and repair fixes done the same day —
see those logs) produced a brochure with visibly broken punctuation:
`CURATED ROUTE Â· RELAXED` and `Ubud, Bali Â· Bali Â· Indonesia`, instead of
`Curated route · Relaxed` / `Ubud, Bali · Bali · Indonesia`.

Root cause: the **deployed n8n `Render HTML` Code node's stored
`jsCode` parameter** contained the literal mojibake sequence `Â·` (and
`âœ¦` for the tip-callout star icon) baked directly into the string — not a
runtime encoding issue. `render-itinerary-html.js` on disk was and is
correct (verified: proper `·` / `✦` characters). The corruption was
introduced at some earlier point when this node's content was written to n8n
through an API call that mishandled UTF-8 encoding, and has been sitting
latent in the workflow ever since — invisible until a real render actually
happened, because every execution before 2026-09-04 died earlier in the
pipeline (CP002's model-name bug, then CP005's repair-loop bug).

The same corruption existed identically in the `Guide Layout` node (which
embeds the same renderer for the `destination_guide` path) — never yet
exercised by a real execution, so never caught before either.

### Existing Behavior

Every `·` separator and the `✦` tip-callout icon rendered as mojibake
(`Â·`, `âœ¦`) in both the scheduled-layout and guide-layout HTML output.

### Required Behavior

Rendered HTML shows the correct literal characters: `·` (U+00B7) and `✦`
(U+2726).

### Changes Made

- Replaced all 9 occurrences of `Â·` → `·` and all 9 occurrences of
  `âœ¦` → `✦` in both the `Render HTML` and `Guide Layout` nodes' `jsCode`,
  via a direct string search-and-replace against the exact deployed source
  (not retyped from memory, to avoid reintroducing an encoding error).
- Applied via `PUT /api/v1/workflows/:id` with explicit
  `Content-Type: application/json; charset=utf-8`, since n8n-mcp was
  disconnected this session.
- `render-itinerary-html.js` on disk required no change — it was already
  correct; only the deployed node's stored copy was corrupted.

### Verification Performed

| Verification | Result | Evidence |
|---|---|---|
| Post-fix node source contains 0 remaining mojibake occurrences | PASS | Direct string search on the fetched, updated workflow JSON |
| Live execution, `half_day` trip, real render | PASS — `· ` renders correctly | Execution 4521, `Render HTML` output; rendered screenshot |
| Rendered visual verification | PASS | `itinerary-engine/output/webtest-final-render2-top.png` — "CURATED ROUTE · RELAXED" and "Ubud, Bali · Bali · Indonesia" both correct |
| QA Gate on the same execution | PASS — `qaOk: true`, 0 failures | Execution 4521 |

### Acceptance Criteria Results

| Criterion | Result | Evidence |
|---|---|---|
| No mojibake in rendered output | PASS | Screenshot + raw HTML string check |
| Fix applied to both nodes sharing the corrupted renderer copy | PASS | `Render HTML` and `Guide Layout` both fixed in the same pass |

### Remaining Limitations

- `Guide Layout`'s fix is verified by direct source inspection only — no live
  `destination_guide` execution has rendered through it yet this session.
  Follow-up: run a live `destination_guide` submission and visually confirm.
- This was found by a human visually inspecting a screenshot, not by an
  automated check. Consider adding a QA Gate or render-verification rule that
  scans for common mojibake byte sequences (`Â·`, `â€™`, `â€œ`, etc.) as a
  cheap automated guard against this recurring.

## Revision: 2026-08-29 - Live E2E PDF verification after renderer sync

### Verification Performed

| Check | Result |
|---|---|
| Published n8n workflow execution | PASS: execution `4325`, status `success` |
| Render HTML node output | PASS: 21,729-character self-contained HTML; title and timeline present |
| Playwright PDF generation | PASS: 3-page A4 PDF, 110,172 bytes |
| PDF visual inspection | PASS: hero, half-day timeline rail, practical section, and footer render without clipping |
| Artifact persistence | PASS: execution JSON, HTML, and PDF saved under `e2e-pdf-results/` |

### Artifacts

- `e2e-pdf-results/execution-4325.json`
- `e2e-pdf-results/itinerary-4325.html`
- `e2e-pdf-results/itinerary-4325.pdf`

## Revision: 2026-09-06 - Fix Field-Name Contract Drift Between Schema and Renderer

### Revision Plan

`plans/cp006-cp009-cp010_revision-plan_output-completeness-and-render-contract.md`

### Reason for Revision

User reported the rendered brochure looked thin ("penjelasan tiap itinerary
dikit banget"). Direct inspection of real execution data proved the AI output
was rich and complete — the renderer was silently discarding most of it because
its field reads had drifted from `SPEC.md` §11's `activities[]` contract
(`timeLabel`/`durationLabel`) to different names (`time`/`duration`), and from
the `schedule[]` block contract (`title`/`location`/`blockLabel`) to different
ones (`area`/`summary`/`dayLabel`/`day`). Confirmed against real rendered HTML,
not by reading source alone:

- `cp013-full_day.html`: 3 of 3 `<time class="stop-time">` empty; `.stop-duration`
  never present anywhere.
- `cp013-multi_day_fixed.html`: 11 of 11 empty; day headings showed the English
  `Day 1`/`Day 2` fallback although the AI supplied `blockLabel: "Hari 1"`.
- Because `activity.time` was permanently `undefined`, every transport activity
  (which the renderer routes to a full stop vs. a thin connector based on
  presence of a time) fell through to the thin-connector branch regardless of
  whether the model had given it a real time — the full-stop branch for timed
  transport was unreachable dead code.
- `schedule[].mealsIncluded`, `.transportNote`, `.blockTip`, `.title`,
  `.location`, `.blockRangeLabel` were all populated by the AI (confirmed in
  `exec_full_day_final.json` / `exec_multi_day_light_final.json`) and rendered
  nowhere.
- `practical.localTips[].topic` (6 well-categorised entries: "Mobilitas",
  "Jalur persawahan", "Pakaian", "Kuliner", "Cuaca", "Keluarga") was discarded
  by `textList()`, which only reads `.note`.
- `accommodationStop()` read `accommodation.description`; `SPEC.md` §11 defines
  `accommodation.note`. This bug was masking the separate CP003 English-fallback
  leak (see CP003's revision log) — the field was never rendered at all before
  this fix, correct or not.
- `.fact-value` used `white-space:nowrap` + `text-overflow:ellipsis`, truncating
  a full-sentence `quickFacts.bestSeason` mid-word.

### Changes Made

- `renderStop`/`renderTravel`: read `timeLabel ?? time` and
  `durationLabel ?? duration` (both names accepted, not swapped).
- Transport-vs-connector routing keyed off `timeLabel ?? time` so a timed
  transport activity renders as a full stop as originally intended.
- `blockLabel()`: read `blockLabel ?? dayLabel ?? day` before the `Day N`
  fallback.
- Day header: `block.title` (or the label, if no title) as the heading; a
  deduplicated `[location, blockRangeLabel, date, area, summary]` subtitle
  (deduplication added after discovering the AI populates `blockRangeLabel`
  and `date` with the same text as `blockLabel` for single/short trips,
  which produced a redundant "Hari 1 · Hari 1" subtitle until filtered).
- Added rendering for `mealsIncluded` (chip row), `transportNote` (reused
  `.travel-note` component), `blockTip` (reused `.tip-callout` component) —
  for `multi_day` in the day header/timeline boundary, and for single-block
  modes at the top/bottom of the timeline.
- `localTips` rendered with its own path showing `topic` as a label, distinct
  from the other flat `textList()`-rendered practical arrays.
- `accommodationStop()`: read `note ?? description`.
- `.fact-value`: removed `nowrap`/ellipsis truncation entirely in favour of
  natural wrapping (`overflow-wrap:break-word`, no line clamp) — a
  `-webkit-line-clamp:2` intermediate attempt was tried and rejected after
  visual verification showed it still cut a word mid-string ("lanska…"); the
  final approach never truncates.
- `icon()`: added an emoji→controlled-key map and a title-keyword fallback
  (CP006 prompt change is the paired fix; see CP006's revision log).

### Verification Performed

| Verification | Result | Evidence |
|---|---|---|
| Local re-render of real prior execution data through patched renderer | PASS | All 4 modes; `stop-time`/`stop-duration` fill, route line, meal/transport/tip content, distinct icons all confirmed present |
| Negative/compat fixtures (old field names, plain-string `localTips`, proper array `routeSummary`) | PASS | Manual fixture pass before deploy |
| All fixes present simultaneously in deployed workflow before live test | PASS | String-contains check across 7 nodes |
| Live run, all 4 modes | PASS | Executions 4931, 4932, 4933, 4936 — `qaOk: true` |
| **Rendered visual verification** (`RULES.md` §11a) | PASS | Screenshots at 900px width for all 4 modes; PDF for `full_day`/`multi_day` |
| PDF page-break integrity for `multi_day` (highest risk per plan) | PASS | 7-page PDF converted to per-page images (`pymupdf`); Hari 1's entire day-section (header, transport note, 5 timed stops, accommodation card, tip) fits on one page with no split; Hari 2 likewise |
| Fact strip no longer truncates mid-word | PASS | Full `bestSeason` sentence visible, wraps naturally, confirmed in re-rendered screenshot after the line-clamp attempt was found to still cut a word and was replaced |

### Acceptance Criteria Results

| Criterion | Result |
|---|---|
| Every activity with `timeLabel`/`durationLabel` renders its time/duration | PASS |
| Timed transport renders as a full stop, not a thin connector | PASS |
| Day heading uses the AI's label/title; no redundant subtitle | PASS |
| `mealsIncluded`, `transportNote`, `blockTip`, `location`, `blockRangeLabel` render | PASS |
| `localTips` render with topic labels | PASS |
| Accommodation note renders from the correct field, in the resolved language | PASS (paired with CP003's revision) |
| No day/spot card splits across a PDF page break | PASS, `multi_day` verified directly |
| Fact strip never truncates mid-word | PASS |
| Workflow left `active: false` | PASS, confirmed after final test |

### Deviations from Plan

- The plan's Group D-1 attributed the English accommodation-note leak to "the
  assembly node's fallback"; the actual node is `Parse Skeleton Result`
  (CP003), not `Assemble canonicalItinerary` (CP006). Corrected in the plan
  document and logged against CP003 instead. See CP003's revision log.
- The plan proposed `-webkit-line-clamp:2` for the fact-strip fix; visual
  verification showed this still truncates mid-word in practice (line-clamp
  clips at the character/line level, not the word level, when the box is
  narrow), so it was replaced with unrestricted natural wrapping instead — a
  stricter interpretation of the plan's own acceptance criterion #11 ("never
  truncates mid-word"), not a relaxation of it.
- Additionally fixed `accommodationStop()`'s `description`→`note` field-name
  mismatch, found during verification but not enumerated as its own item in
  the original plan (it falls squarely within the plan's Group A theme — field
  contract drift between `SPEC.md` §11 and the renderer).

### Known Limitations and Follow-Ups

- PDF pagination is content-inefficient (near-empty pages after the hero and
  after the day-index nav) independent of this revision — confirmed present in
  the pre-revision PDF too (5 pages vs. 7 post-revision, both with blank-page
  gaps). Does not violate the no-split acceptance criterion, but is real waste
  worth a dedicated CP011 pass rather than fixing opportunistically here.
- English section headings ("Trip overview", "Know before you go") remain
  unchanged — explicit user decision (D3), out of scope for this revision.
