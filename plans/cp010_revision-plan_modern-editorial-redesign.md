# CP010 Revision Plan: OTA-Polished Destination Guide

## Reason for Revision

The destination-guide renderer needs the same product polish as the scheduled
itinerary while preserving its different information model. The current
neutral grid is visually repetitive and too plain at both five and fifteen
spots. It does not provide enough group hierarchy, discovery rhythm, or
distinction between narrative context and practical logistics.

## Clarifications and Decisions

- `destination_guide` is the user’s single-destination/discovery mode.
- Per `SPEC.md §4.1`, §5.4, and §10.2, it is place-ordered and must remain a
  card grid; it is not a scheduled timeline with times removed.
- No clock time or committed visit sequence may be invented.
- For visual consistency, cards may use a numbered place index and a subtle
  group rail, but these are discovery/navigation devices—not chronology.
- One to eight spots render as a flat discovery grid. Nine or more spots are
  grouped by area or theme without thinning.
- Cards may use a region-level decorative image or category icon, never a
  claimed photo of the named venue.
- The shared shell, font, color tokens, practical section, and closing come
  from the CP009 revision unchanged.
- OTA visual inspiration is limited to hierarchy and polish. Ratings, reviews,
  price, scarcity, availability, and booking CTAs remain forbidden.
- Design-pattern references: Airbnb Experiences for destination discovery and
  Wanderlog for grouped place planning; neither reference authorizes use of
  ratings, social proof, or venue-specific imagery.
- The workflow remains inactive throughout the revision.

## Existing Behavior

- The guide uses a one-column mobile/two-column desktop card grid.
- Group labels and generic introductions are present, but compete weakly with
  repeated card content.
- Every card has similar weight and visual treatment, producing a monotonous
  page at high spot counts.
- Metadata is dense and typography is tied to the old shared shell.
- The n8n `Guide Layout` node carries a separate compact renderer that must be
  aligned with `render-itinerary-html.js`.

## Required Behavior

### Shared shell

- Reuse CP009’s compact hero, quick-facts strip, modern sans typography,
  neutral canvas, destination accent, practical rows, and compact closing.
- Do not duplicate or fork shared-shell CSS between scheduled and guide modes.

### Flat guide — 1–8 spots

- Introduce the destination with one short summary and optional area context.
- Desktop uses a balanced two-column discovery grid; mobile uses one column.
- First spot may span both desktop columns only when source data marks it as a
  highlight; do not invent priority based on array order.
- Every card displays:
  - place index;
  - name;
  - area and category;
  - substantive description;
  - suggested duration;
  - textual best time to visit, never a clock value;
  - getting there;
  - actionable tip;
  - nearby pairing when present.
- Metadata uses a compact two-column definition layout on desktop and one
  column on narrow mobile screens.
- Hierarchy comes from typography, whitespace, and one accent edge; avoid
  nested boxes and badge clusters.

### Grouped guide — 9+ spots

- Group by area or theme as required by D15; never thin the spot list.
- Each group begins with:
  - ordinal and group label;
  - short group introduction carrying higher-level narrative;
  - spot count or category mix only when derived from data.
- Use a subtle group rail or section rule to aid long-page navigation without
  implying chronological order.
- Cards inside a group remain consistent; incomplete final rows must not look
  broken.
- A fifteen-spot fixture retains all fifteen spots and all group introductions.

### Imagery and icons

- Hero remains the primary destination image.
- A group may use one region-level image only when attribution exists.
- Individual named spots default to category icons; per-venue documentary
  imagery is prohibited.
- All used photos retain mandatory credits in the closing section.

### Information density

- Description is primary, practical metadata secondary, tip tertiary.
- Repeated labels are shortened visually but remain accessible.
- Avoid oversized cards, large empty gaps, excessive radii, heavy shadows, and
  colored backgrounds on every item.
- Cards use `break-inside: avoid` and remain legible in the later PDF.

## Proposed Changes

1. Reuse the revised CP009 typography and shell tokens directly.
2. Refactor `renderGuide()` into helpers for group header, spot card, category
   icon, practical metadata, and tip.
3. Add semantic classes for flat, grouped, highlighted, and image-supported
   guide states.
4. Introduce stable visual numbering that does not imply scheduled time.
5. Improve one-column/two-column behavior and incomplete-row balance.
6. Align the n8n `Guide Layout` Code node with the full renderer.
7. Preserve the CP008 rule rejecting clock-formatted values in guide content.
8. Regenerate flat five-spot and grouped fifteen-spot fixtures/screenshots.
9. Append completed evidence to the existing CP010 completion log.

### Expected affected artifacts

- `render-itinerary-html.js`
- n8n workflow `GRuSSwnW38U1HNgK`:
  - `Guide Mode?` only if routing requires a non-behavioral field adjustment
  - `Guide Layout`
- `output/playwright/` guide fixtures and visual evidence
- `logs/cp010_completion-log_guide-layout.md`
- `TODOS.md` status during execution

## Impact and Regression Risk

- **False chronology:** numbering or a group rail could look scheduled. Use
  “place” language, omit clocks, and avoid travel connectors between cards.
- **Contract loss:** simplification could hide required spot fields. Assert
  every contract field in DOM snapshots.
- **High-count monotony:** fifteen or more spots may still feel repetitive.
  Strengthen group intros and spacing instead of thinning data.
- **Image claim risk:** card imagery could imply a venue photo. Default to
  icons and require region-level labeling plus attribution for group images.
- **Grid fragmentation:** long descriptions create uneven rows. Use regular
  grid flow unless a masonry approach proves deterministic in print.
- **Shared-shell drift:** CP010 must not fork hero, practical, or closing styles
  from CP009.
- **Page inflation:** padding stays restrained so flat output remains near the
  4–8-page expectation; grouped guides may grow as specified.

## Verification Plan

### Static checks

- `node --check render-itinerary-html.js` passes.
- Guide output contains no schedule/timeline/time-column class.
- Guide output contains no clock pattern such as `09:00`, `9 AM`, or `14.30`.
- CSS and SVG are inline; no CDN or external icon/font stylesheet.
- No cream surface, serif heading, rating, review count, price, scarcity, or
  booking CTA appears.

### Fixture matrix

| Fixture | Required evidence |
|---|---|
| 1 spot | No awkward empty grid or oversized card |
| 5 spots flat | All fields visible; balanced phone/desktop layout |
| 8 spots flat | No unintended grouping |
| 9 spots grouped | Grouping begins at the required threshold |
| 15 spots grouped | All spots and group intros retained; readable long page |

Fixtures include missing optional nearby pairing, long descriptions, multiple
categories, actionable tips, and one region-level attribution case.

### Rendered visual verification

- Render every boundary fixture at 390×844 and 1440×1000.
- Inspect screenshots for hierarchy, overflow, monotony, incomplete rows, and
  excessively small metadata.
- Confirm the five-spot guide looks intentional rather than incomplete.
- Confirm the fifteen-spot guide is navigable by group and retains every spot.
- Confirm no named spot visually claims a venue-specific photo.
- Confirm no unresolved placeholder, `undefined`, `[object Object]`, or empty
  section shell.

### Workflow and regression verification

- Execute exact saved `Guide Layout` source with 1-, 5-, 8-, 9-, and 15-spot
  fixtures.
- Re-run CP008 guide fixtures, including clock-value rejection and actionable
  tip requirements.
- Run n8n runtime validation with 0 errors and 0 warnings.
- Confirm `saveDataSuccessExecution` remains `all` and workflow stays inactive.
- Record results in the existing CP010 completion-log revision section.

## Updated Acceptance Criteria

- `destination_guide` remains a distinct place-ordered card grid and never
  masquerades as a scheduled timeline.
- Flat guides support 1–8 spots; grouping begins at 9+ spots.
- Five-spot and fifteen-spot fixtures look deliberate and readable at phone
  and desktop widths.
- All supplied spots remain; no thinning or arbitrary cap occurs.
- Every card retains required description, duration, textual best time,
  getting-there guidance, actionable tip, and nearby pairing when supplied.
- No clock time appears anywhere in destination-guide output.
- No venue-specific photo claim is introduced; every region-level image used
  is attributed.
- Modern sans typography and revised shell match CP009.
- Card treatment is restrained: no nested stacks, badge clutter, or shadows.
- Output remains self-contained and print-safe with `break-inside: avoid`.
- n8n validation returns 0 errors and 0 warnings; workflow stays inactive.

## Rollback

- Restore only CP010-related `renderGuide()` and guide CSS changes while
  preserving CP009’s shared shell if it has passed.
- Restore the previous `Guide Layout` source without modifying routing or
  unrelated nodes.
- Regenerate previous guide fixture HTML for comparison if required.
- Re-run n8n validation and confirm inactive state after rollback.
