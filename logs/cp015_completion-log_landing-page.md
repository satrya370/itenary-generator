# CP015 Completion Log: Landing Page

## Result

- Status: `completed`
- Summary: Published `repeatable/t/itinerary-generator.html`, a Carbon-Copy
  landing page for the Itinerary Brochure Engine, wired into the existing
  catalog and sitemap. No new CSS or JS was needed — the page reuses existing
  components exactly.

## Date

- Completed at: 2026-09-03 (session-local)

## Plan Reference

- Implementation plan: `../plans/cp015-cp016_implementation-plan_public-web-surface.md`
- Revision plan, if applicable: N/A

## Changes Made

- Built the page from the plan's 11-section map (§8 "Guide's route" was
  skipped per the plan's own instruction — CP014 is `blocked`, not
  `completed`).
- Reused `note-card` for the four trip-mode cards without its optional
  `note-card-meta`/`note-card-footer` sub-elements — a supported partial use
  of the existing component, not a new pattern.
- `demo-embed` iframe points at a real generated brochure, not a mockup:
  copied `itinerary-engine/e2e-pdf-results/itinerary-4267.html` to
  `repeatable/assets/demo/itinerary-demo.html` (verified self-contained, zero
  external references, before copying).
- Registered the product in `repeatable/index.html` (new `Travel` filter tag +
  `note-card`, same pattern the prior reorg commit used for `Retail`) and in
  `repeatable/sitemap.xml`.

## Files and n8n Workflows Changed

| Artifact | Change |
|---|---|
| `repeatable/t/itinerary-generator.html` | New landing page (276 lines) |
| `repeatable/assets/demo/itinerary-demo.html` | Copied real brochure output for the demo embed |
| `repeatable/index.html` | `Travel` filter tag + `note-card` catalog entry |
| `repeatable/sitemap.xml` | Landing page entry, priority 0.8, monthly |
| `TODOS.md` | CP015 status → `completed`; dependency-gap note recorded |

## Verification Performed

| Verification | Result | Evidence |
|---|---|---|
| Rendered visual check, phone (390×844) and desktop (1440×1000) | PASS | `itinerary-engine/output/cp015-{phone,desktop}-{top,mid,bottom}.png` |
| Side-by-side visual comparison with `repeatable/t/pos-lite-cashflow-os.html` | PASS — same header, hero, stats, footer, typography | `itinerary-engine/output/cp015-compare-poslite-top.png` |
| Zero external network requests (Playwright request log, not HTML inspection) | PASS — `externalRequests: []` on both viewports | `itinerary-engine/output/cp015-screenshot.cjs` run output |
| Zero browser console errors | PASS | Same run output |
| FAQ accordion functions with `main.js` **unmodified** | PASS — click toggled `.open`, verified via DOM state, not just visually | Same run output: `FAQ accordion opened on click: true` |
| Catalog filter: clicking `Travel` shows only the Travel card | PASS | `itinerary-engine/output/cp015-catalog-filtered.png` + DOM state dump |
| Both JSON-LD blocks parse; `FAQPage` question count matches visible FAQ count | PASS — 5 and 5 | Inline `node -e` JSON.parse check |
| Line count within 250–320 target | PASS — 276 lines | `wc -l` |
| No invented number, testimonial, or logo | PASS — every stat/claim is a `SPEC.md` fact, none are business-metric claims |  |

### Claim → `SPEC.md` traceability (anti-slop rule 3)

| Page claim | `SPEC.md` section |
|---|---|
| 4 trip modes: half_day / full_day / multi_day / destination_guide | §4 |
| HTML + PDF, self-contained | §5, §10.3 |
| Bahasa ID/EN otomatis | D10, §12 |
| Timeline vertikal (terjadwal) / kartu spot berkelompok (guide) | §10.2, §4.4 |
| Penjaga waktu tempuh, batas jam per mode | §9.3 |
| QA gate menolak harga/jam-buka/rating/booking CTA | §9.4, §6.1, D7, D11 |
| Palet menyesuaikan tipe destinasi | §10.1 |
| Foto region-level + atribusi + gradient fallback, tak pernah venue spesifik | §7, §7.1 |
| Trip >7 hari dipadatkan, bukan diulang | §4.4, D6 |
| half_day 6 jam / full_day 11 jam aktif | §9.3 table |
| multi_day 2–14 hari | D6, §12 |
| Grouping spot ≥9 | §4.4, D15 |

## Acceptance Criteria Results

| Criterion | Result | Evidence |
|---|---|---|
| 1. Page exists, `lang="id"`, follows `t/` structure | PASS | File itself |
| 2. Visually indistinguishable, additive CSS only | PASS — **zero new CSS was needed** | Side-by-side screenshot |
| 3. Explains product, 4 modes, how it works, what it isn't | PASS | Sections 6–9 of the page |
| 4. Every claim traceable; zero invented figures/social proof | PASS | Traceability table above |
| 5. Demo shows real generated output | PASS | `demo-embed` screenshot |
| 6. Catalog card + filter tag + sitemap entry all work | PASS | Filter-click DOM check |
| 7. Self-contained: no CDN, no external font, no new JS | PASS | `externalRequests: []`; no new JS file added |
| 8. Verified visually at both widths, evidence recorded | PASS | Screenshot set above |

## Deviations from Plan

1. **CTA does not link to `/app/itinerary-generator.html`.** The plan
   specified this (§Proposed Changes, row 11), but `repeatable/app/` (CP016)
   does not exist yet — linking to it now would ship a public 404. Shipped
   instead: an honest "coming soon, notify me" `email-capture` form (`mailto:`
   action) that still fulfils the "Free + email capture" decision without
   promising a live self-serve flow that doesn't exist yet. Revisit this CTA
   when CP016 ships — the original plan's design (direct link) is almost
   certainly the better end state once the form exists.
2. **§8 "Guide's route" section omitted**, exactly as the plan itself
   instructed, because CP014 is `blocked` not `completed`. Add it back once
   CP014's live end-to-end verification closes.
3. **No new CSS was written**, despite the plan budgeting for "additive CSS
   only, justified per rule." Every needed component (`note-card` without its
   optional sub-parts, `steps`, `email-capture`, `demo-embed`, `feature-list`)
   already existed. Recorded as a deviation because the plan anticipated some
   CSS work; the better outcome (none needed) doesn't require justification
   under the same rule, but is noted for completeness.

## Known Limitations and Follow-Ups

- CP011 (PDF Generation) is formally `pending`, not `completed` — this
  landing page's demo and copy rely on ad-hoc `e2e-pdf-results/` evidence
  (accepted explicitly by the user before this CP started, recorded in
  `TODOS.md`). If CP011's formal execution changes the HTML/PDF output shape,
  `repeatable/assets/demo/itinerary-demo.html` needs to be regenerated to
  match.
- The CTA deviation above needs revisiting once CP016 ships.
- No durable storage exists yet for emails collected via the `mailto:` CTA —
  already tracked as a `TODOS.md` follow-up.
