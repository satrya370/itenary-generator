# CP010 Completion Log: Guide Layout

## Result

- Status: `completed`
- Summary: Added a distinct grouped/flat destination-guide card layout using
  the shared CP009 shell.

## Revision

- Revision plan: `../plans/cp010_revision-plan_modern-editorial-redesign.md`
- Result: guide cards now use the same cool-neutral editorial system with
  restrained borders and emerald accent rules.

## Files and Workflow Changed

| Artifact | Change |
|---|---|
| `render-itinerary-html.js` | Guide card grid with flat/grouped rendering |
| `output/playwright/guide-flat.*` | 5-spot fixture and visual evidence |
| `output/playwright/guide-grouped.*` | 15-spot grouped fixture and visual evidence |
| n8n `GRuSSwnW38U1HNgK` | Added `Guide Mode?` and `Guide Layout` branch |

## Verification

| Check | Result |
|---|---|
| 5-spot flat guide | PASS |
| 15-spot grouped guide | PASS: 3 group intros, all 15 cards retained |
| Phone visual (390×844) | PASS: readable single-column cards |
| Desktop visual (1280×900) | PASS: two-column cards with compact details |
| Required spot fields and actionable tips | PASS in fixtures |
| No clock-formatted time values in guide HTML | PASS (0 `HH:MM` matches) |
| No external CSS/CDN | PASS |
| Runtime workflow validation | PASS: 59 nodes, 102 valid connections, 0 errors, 0 warnings |
| Workflow state | PASS: inactive |

## Note

The guide retains the contract's human-readable `bestTimeToVisit` and
`suggestedDuration` fields while omitting scheduled clock values and any
timeline treatment.

## Revision: 2026-08-28 — OTA-polished guide discovery layout

### Revision Plan

`../plans/cp010_revision-plan_modern-editorial-redesign.md`

### Changes Made

- Restyled the guide under the same modern shell as CP009, with compact hero
  metadata, route/fact context, and a sharper content hierarchy.
- Retained the guide as a place-ordered grid: numbered discovery cards and
  group headers communicate exploration, not schedule chronology.
- Improved card scanability with prominent place names, area/category labels,
  concise descriptions, practical metadata, and a visually distinct tip.

### Verification Performed

| Check | Result |
|---|---|
| Flat guide fixture | PASS: 5 spot cards retained |
| Grouped guide fixture | PASS: 15 spot cards and group headings retained |
| No clock-formatted values | PASS |
| No timeline treatment in guide output | PASS |
| Phone visual evidence (390×844) | PASS: grouped guide stacks into a readable single column |
| Desktop visual evidence (1440×1000) | PASS: guide uses a two-column discovery grid with clear group separation |
| Runtime workflow validation | PASS: 59 nodes, 102 valid connections, 0 errors, 0 warnings |
| Workflow state/settings | PASS: inactive; `saveDataSuccessExecution: all` |

### Outcome

The guide has the visual confidence of a destination-discovery page while
remaining free of schedule clocks, ratings, review counts, prices, or booking
calls-to-action.

## Revision: 2026-09-04 - Fix mojibake in the deployed n8n node

### Revision Plan

None — direct fix authorized by user, same pass as the identical fix to
`Render HTML` (CP009). Full root-cause writeup is in
`cp009_completion-log_html-shell-and-scheduled-layout.md`'s matching revision
entry; not duplicated here.

### Changes Made

- `Guide Layout` node's `jsCode` had the same 9× `Â·` and 9× `âœ¦` mojibake as
  `Render HTML` (it embeds the same renderer for the `destination_guide`
  path). Replaced all occurrences with the correct `·` / `✦` characters via
  direct string search-and-replace against the deployed source.

### Verification Performed

| Verification | Result | Evidence |
|---|---|---|
| Post-fix node source contains 0 remaining mojibake occurrences | PASS | Direct string search on the fetched, updated workflow JSON |

### Acceptance Criteria Results

| Criterion | Result | Evidence |
|---|---|---|
| No mojibake in this node's source | PASS | Source inspection |

### Remaining Limitations

- **Not yet verified against a live `destination_guide` execution** — this
  session only exercised `Render HTML` (scheduled modes) live. Follow-up:
  submit a live `destination_guide` trip and visually confirm the rendered
  guide layout shows correct `·`/`✦` characters, not just that the source
  string was corrected.

## Revision: 2026-09-06 - Shared-Shell Fixes Carried Through to Guide Layout

### Revision Plan

`plans/cp006-cp009-cp010_revision-plan_output-completeness-and-render-contract.md`

### Reason for Revision

Bundled with the CP009 revision (see CP009's completion log for full root-cause
detail) because `Guide Layout`/`Render HTML` share one bundled renderer copy in
this n8n workflow and both had to change together. Direct inspection confirmed
CP010's own `spot-card` field reads (`name`, `area`, `category`, `description`,
`suggestedDuration`, `bestTimeToVisit`, `gettingThere`, `tips`,
`nearbyPairing`) already matched `SPEC.md` §11's `spots[]` contract exactly —
**no field-name defect existed in the guide card body itself.** The only
defects affecting `destination_guide` output were in the components CP010
shares with CP009's shell: highlight icon differentiation, the `routeSummary`
tolerance fix, and the fact-strip truncation fix (all CP006/CP009, detailed in
their own logs).

### Changes Made

No changes to `renderGuide()`'s own spot-card logic. The shared bundle
(`icon()`, `renderOverview()`, `facts()`) was updated identically to CP009; see
CP009's completion log for the change list.

### Verification Performed

| Verification | Result | Evidence |
|---|---|---|
| Live `destination_guide` run | PASS | Execution 4936 (first attempt, execution 4934/4935, failed on an unrelated CP008 QA Gate bug found and fixed in the same pass — see CP008's revision log) |
| `spot-card` rendering unaffected by the shared-shell changes | PASS | 2 `spot-card` elements rendered correctly, all fields present, confirmed in rendered HTML and screenshot |
| Highlight icons differentiate in guide mode too | PASS | Screenshot shows 4 distinct icons for the 4 highlights |
| Fact strip no longer truncates in guide mode | PASS | Full `bestSeason` text visible |

### Acceptance Criteria Results

| Criterion | Result |
|---|---|
| Guide layout unaffected by defects that were specific to the scheduled-mode body | PASS, confirmed no regression |
| Guide layout benefits from the shared-shell fixes (icons, route line, fact strip) | PASS |

### Known Limitations and Follow-Ups

- None specific to CP010. See CP009's completion log for shared-shell
  limitations (PDF pagination inefficiency, unchanged English headings).
