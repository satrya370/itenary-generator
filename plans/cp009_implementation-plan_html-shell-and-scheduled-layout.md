# CP009 Implementation Plan: HTML Shell and Scheduled Layout

## Objective

Create a self-contained, mobile-first HTML renderer with the shared brochure
shell and connected scheduled timeline for `half_day`, `full_day`, and
`multi_day` itineraries.

## Scope

- Add `render-itinerary-html.js` with inline CSS/SVG, palette injection,
  responsive phone-first layout, hero/overview/practical/closing sections,
  and scheduled timeline rules.
- Add n8n render request, render, and CP010 handoff nodes without activating
  the workflow.
- Empty sections are omitted; activity icons are inline and type-safe.

## Out of Scope

Guide-card body, PDF generation, publishing, delivery, and activation.

## Verification

Render real canonical fixtures for all three scheduled modes at phone and
desktop viewports in the in-app browser; check no CDN/external stylesheet,
timeline continuity, day markers, and empty-section omission.

