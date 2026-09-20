# CP010 Implementation Plan: Guide Layout

## Objective

Add a distinct place-ordered guide-card layout for `destination_guide`, while
reusing the CP009 shell and keeping time values out of the output.

## Scope

- Extend `render-itinerary-html.js` with flat and grouped spot-card rendering.
- Include name, area, category, description, suggested duration, best time,
  getting there, tips, nearby pairing, and region-level image/icon treatment.
- Add a guide branch in the workflow and CP011 handoff.

## Out of Scope

PDF generation, publishing, delivery, activation, and venue-level imagery.

## Verification

Render 5-spot flat and 15-spot grouped fixtures at phone and desktop widths;
verify group introductions, readable cards, and absence of any time value in
the generated HTML.

