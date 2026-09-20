# CP009 Revision Plan: OTA-Polished Scheduled Itinerary System

## Reason for Revision

The current scheduled renderer is cleaner than the original cream/card-heavy
version, but it is still too plain, uses weak typography, and does not reach
the visual polish or scanning efficiency of modern travel products such as
Klook or TourRadar. Its timeline is technically connected, yet time, travel
segments, destination stops, tips, and day boundaries do not form a strong
journey narrative.

This revision must improve visual polish without copying forbidden OTA
product-page behavior. Prices, ratings, review counts, scarcity, availability,
and per-stop booking calls-to-action remain prohibited by `SPEC.md §6`.

## Clarifications and Decisions

- User confirmed the correction scope: the shipped n8n HTML must match the
  Playwright timeline treatment; normal scheduled stops must not read as
  separate blocks. Day labels remain navigational context, not cards.
- User clarified the product requirement further: `destination_guide` may
  keep its place-grid discovery treatment, but every scheduled scale must
  look intentionally different rather than being one timeline template with
  more blocks. The contract remains four input modes: half day, full day,
  multi day (including week and longer trips), and destination guide.
- This is a shared revision chapter for CP009 and CP010. CP009 owns the shared
  shell and all time-ordered modes; CP010 owns `destination_guide`.
- The four user-mentioned scales map to the existing modes:
  - half day → `half_day`
  - one day → `full_day`
  - week or multiple days → `multi_day` (2–14 days)
  - single-destination discovery → `destination_guide` under CP010
- Per `SPEC.md §4`, only `half_day`, `full_day`, and `multi_day` use a
  chronological timeline. `destination_guide` must remain place-ordered and
  must not imply a committed sequence.
- “Timeline dari bawah ke atas” is implemented as one continuous vertical rail
  connecting every chronological stop. Normal reading and screen scrolling
  remain top-to-bottom; the rail visually connects the complete journey.
- Scheduled activities are not individual cards. The canvas, rail, spacing,
  and dividers provide structure. Small tinted panels are reserved for tips,
  warnings, accommodation, or exceptional guidance.
- Visual quality may borrow hierarchy, density, and interaction patterns from
  polished OTA interfaces, but not transactional content or social proof.
- Design-pattern references: Klook for timed activity density, TourRadar for
  multi-day hierarchy/range labels, and Wanderlog for travel connectors and
  route grouping. These are reference patterns, never copied markup or copy.
- Use one modern sans-serif family throughout. Preferred display font is
  `Plus Jakarta Sans`, self-contained as the single permitted embedded font;
  body fallback is the system sans stack.
- No cream surface and no serif headings.
- The workflow remains inactive throughout the revision.

## Existing Behavior

- Shared shell uses a large gradient/photo hero, overview facts, highlights,
  practical information, and closing.
- Scheduled modes render on a vertical rail, but every stop has limited
  distinction between time, destination content, travel movement, and tips.
- Headings still use Georgia, producing an editorial-print character instead
  of a contemporary travel-product interface.
- The neutral redesign removed much of the visual clutter, but also removed
  depth, accent rhythm, and product-level hierarchy.
- `half_day` and `full_day` share the same layout with almost no deliberate
  density difference.
- `multi_day` adds day markers but has no strong week navigation, day summary,
  accommodation ending, or long-trip scaling treatment.
- The n8n `Render HTML` node contains a compact renderer separate from the full
  `render-itinerary-html.js`; both must stay visually aligned.

## Required Behavior

### Shared visual shell

- Neutral canvas `#F5F7FA`, white primary surface, dark ink `#1D2433`, muted
  text `#667085`, and border `#E4E7EC`.
- Destination-derived palette continues to control hero gradient, rail, day
  marker, and small accents. The neutral shell stays consistent across all
  seven destination types.
- Hero is compact and product-like, not a full-page magazine cover:
  - mobile: approximately 240–280 px;
  - desktop: approximately 340–380 px;
  - strong photo/gradient overlay;
  - agency, scope, destination, and title only;
  - no “Travel Brief” badge.
- A single quick-facts strip may overlap the hero boundary. It is one shared
  component, not a collection of competing cards.
- Overview contains only a short summary, mode-appropriate facts, optional
  route summary, and supplied highlights.
- Typography hierarchy:
  - hero title: 40–56 px desktop, 32–40 px mobile, 700 weight;
  - section heading: 24–30 px, 700;
  - activity title: 17–19 px, 650–700;
  - body: 14–16 px, 400–450;
  - metadata: 12–13 px, 500–600.
- Limit competing emphasis: one primary color, one small accent, one tip tint,
  and one muted text level per section.

### Timeline anatomy shared by scheduled modes

- Each chronological stop uses three zones:
  1. time column;
  2. icon/dot on a continuous rail;
  3. content column.
- Activity content is placed directly on the canvas, not inside a filled card.
- Stop content order: title → description → compact metadata → optional tip.
- Time is visually prominent but never larger than the activity title.
- Travel between places is a dashed connector segment with duration or
  transport note when supplied; it must not look like a destination stop.
- Type icons remain inline SVG and use the existing seven-value vocabulary.
- Tips use a slim, tinted inline callout with one icon and short text.
- Accommodation in `multi_day` is the final stop of the corresponding day and
  receives a distinct but restrained treatment.
- Timeline rail continuity must survive long descriptions, page breaks, and
  mobile wrapping.

### `half_day`

- Compact timeline with no `Day 1` header.
- Reduced quick-facts strip and 2–3 highlights per the mode matrix.
- No route-summary section; current SPEC says it is absent.
- Tighter vertical rhythm than full day while preserving readable body text.
- Minimal practical section: essentials, emergency contact, and 2–3 local
  notes only when present.
- Expected output remains 2–3 PDF pages.

### `full_day`

- One continuous timeline with no day header.
- Route summary appears once above the timeline.
- Travel segments between major stops become first-class rail elements.
- Practical section may include day-pack, transport, local tips, optional
  health/safety, and emergency information.
- Expected output remains 3–5 PDF pages.

### `multi_day` — 2–7 days, including a week

- Add a compact day index below the hero:
  - HTML: horizontally scrollable day labels on mobile and one-line index on
    desktop;
  - print: static day index with no sticky behavior.
- Each day begins with a strong day section containing day number, area/theme,
  short summary, and optional date.
- Timeline resets visually per day but maintains the same anatomy.
- Accommodation appears as the final rail stop for each required night.
- Meals and transport notes remain secondary metadata, not separate large
  cards.
- A seven-day fixture must remain easy to scan and land within the existing
  8–12-page expectation after CP011 PDF rendering.

### `multi_day` — 8–14 days

- Respect D6 condensing: consecutive similar/free days may use a range such as
  `Day 6–7` without expanding into redundant full sections.
- The day index must support range labels.
- Condensed ranges still expose key guidance, accommodation implications, and
  practical notes for the covered days.
- A 14-day fixture must target the existing 12–18-page expectation.

### Shared practical and closing sections

- Practical information uses clean rows or columns with section icons and
  dividers; it must not become a wall of bordered cards.
- Empty arrays remove their row and heading entirely.
- Closing becomes a compact dark footer band with agency contact, disclaimer,
  and photo credits; it must not dominate a full page.

## Proposed Changes

1. Refactor `shellStyles()` in `render-itinerary-html.js` into documented
   token groups for color, typography, spacing, and responsive breakpoints.
2. Replace Georgia headings with the selected sans-serif hierarchy and embed
   at most one locally stored display font as permitted by `SPEC.md §10.3`.
3. Redesign `renderHero()` and `renderOverview()` around a compact hero and
   one quick-facts strip.
4. Rebuild `renderScheduled()` using semantic helpers for:
   - day index;
   - day header;
   - destination/activity stop;
   - travel connector;
   - tip callout;
   - accommodation stop.
5. Add explicit mode classes on the root and scheduled body so spacing and
   section visibility can differ without duplicating templates.
6. Preserve the seven inline SVG activity icons while simplifying their visual
   container and stroke system.
7. Align the n8n `Render HTML` Code node with the full renderer output; do not
   leave an old compact style path in production data flow.
8. Update `config/palettes.json` and the n8n `Derive Palette` node only where
   needed to support the unified neutral shell and destination accents.
9. Regenerate all scheduled-mode fixture HTML and screenshots.
10. Append completed revision evidence to the existing CP009 completion log;
    do not rewrite the original record.
11. Remove the remaining stop and day-divider panel cues from both renderers;
    preserve only the rail, node, typography rhythm, travel connector, and
    the intentionally exceptional accommodation/tip treatments.
12. Add explicit scheduled scale variants: compact half-day agenda, full-day
    route timeline, short multi-day chapters, week itinerary navigator, and
    long-trip range treatment. These must share the rail system but not the
    same visual rhythm.

### Expected affected artifacts

- `render-itinerary-html.js`
- `config/palettes.json`
- n8n workflow `GRuSSwnW38U1HNgK`:
  - `Derive Palette`
  - `Render HTML`
  - related CP009 handoff fields only if required
- `output/playwright/` scheduled fixtures and visual evidence
- `logs/cp009_completion-log_html-shell-and-scheduled-layout.md`
- `TODOS.md` status during execution

## Impact and Regression Risk

- **Mode leakage:** day navigation or accommodation could accidentally appear
  in half/full-day output. Prevent with explicit mode classes and assertions.
- **SPEC drift:** OTA inspiration could reintroduce price, rating, scarcity,
  booking, or availability UI. Reject these during review and keep QA rules.
- **Timeline breaks:** long copy or print page breaks could interrupt the rail.
  Verify long activities in browser and later in CP011 PDF.
- **Dual-renderer drift:** local renderer and n8n renderer may diverge. Compare
  their semantic structure and core tokens in tests.
- **Font loading:** embedded font may increase HTML size or fail in PDF. Use one
  WOFF2 only, provide system fallbacks, and verify offline rendering.
- **Page inflation:** stronger spacing may push seven- and fourteen-day output
  beyond expectations. Test both and tune mode-specific spacing.
- **Palette contrast:** all seven palettes must remain readable on neutral and
  hero surfaces.
- **Existing data compatibility:** missing optional fields must degrade
  gracefully without empty shells.

## Verification Plan

### Static and structural checks

- `node --check render-itinerary-html.js` passes.
- HTML contains inline CSS and SVG only; no CDN or external stylesheet.
- Exactly one font may be base64 embedded.
- Old cream and serif tokens are absent from renderer and generated HTML.
- Scheduled HTML contains no per-activity card class or filled stop container.
- Root mode class and visibility logic match `mode-profiles.json`.

### Fixture matrix

| Fixture | Required evidence |
|---|---|
| `half_day` | Compact timeline, reduced facts, no day header/accommodation |
| `full_day` | Continuous timeline, route summary, travel connectors |
| `multi_day` 3-day | Day index, three day sections, accommodation endings |
| `multi_day` 7-day | Week scanability and day navigation at both widths |
| `multi_day` 14-day | Condensed ranges and bounded length target |

Each fixture includes a long description, optional-field omission, tip, and
representative activity types.

### Rendered visual verification

- Render every fixture at 390×844 and 1440×1000.
- Inspect full-page screenshots for hierarchy, rail continuity, overflow,
  awkward whitespace, repeated borders, and small text.
- Confirm half/full-day do not look like shortened week pages.
- Confirm seven-day navigation is usable on mobile and compact on desktop.
- Confirm no unresolved placeholder, `undefined`, `[object Object]`, or empty
  section shell.
- Capture evidence under `output/playwright/`.

### Workflow and regression verification

- Execute exact saved Code-node sources with deterministic scheduled fixtures.
- Run n8n runtime validation with 0 errors and 0 warnings.
- Confirm `saveDataSuccessExecution` remains `all` and workflow stays inactive.
- Re-run CP008 QA fixtures so design changes do not alter content rules.
- Record results in the existing CP009 completion-log revision section.

## Updated Acceptance Criteria

- Shared shell looks like a modern travel product at phone and desktop widths
  without transactional OTA tells.
- No cream surface, serif heading, generic “Travel Brief” badge, or large empty
  editorial area remains.
- `half_day` is a compact continuous timeline with no day header.
- `full_day` is a continuous timeline with route and travel connectors.
- `multi_day` provides day navigation, day hierarchy, daily timelines, and
  accommodation endings.
- Seven-day output is easily scannable; 8–14-day output supports condensed day
  ranges.
- Scheduled activities are canvas-based timeline stops, not filled cards.
- One continuous rail connects stops correctly on mobile, desktop, and print.
- Typography uses one modern sans family with coherent hierarchy.
- Empty/optional fields disappear without gaps or shells.
- All seven destination palettes remain deterministic and readable.
- Renderer is self-contained and print-safe.
- n8n validation returns 0 errors and 0 warnings; workflow stays inactive.

## Rollback

- Restore pre-revision `render-itinerary-html.js` and palette changes from the
  revision diff.
- Restore prior saved source for `Derive Palette` and `Render HTML` only; do
  not roll back unrelated workflow nodes.
- Regenerate previous fixtures if visual comparison is required.
- Re-run n8n validation and confirm inactive state after rollback.
