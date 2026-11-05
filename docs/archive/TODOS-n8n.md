# Itinerary Brochure Engine — Checkpoints

**Authority:** `SPEC.md` defines behaviour, `RULES.md` defines process, this
file defines CP order and status.

**Legend:** `pending` | `in_progress` | `blocked` | `completed`

Per `RULES.md` §4 and §5, every CP requires an Ask Question gate and an
implementation plan at `plans/cpNNN_implementation-plan_<object>.md` before
any code, workflow mutation, or template work for that CP.

**Revised 2026-08-27** for `SPEC.md` v2 — four trip modes (§4) and the
Brochure-and-Guidance Standard (§6). CP009 split into two layout CPs;
downstream CPs renumbered.

---

## Status Overview

| CP | Object | Depends on | Status |
|---|---|---|---|
| CP001 | foundation-and-input-intake | — | completed |
| CP002 | brief-interpretation-and-mode-resolution | CP001 | completed |
| CP003 | body-skeleton | CP002 | completed |
| CP004 | venue-verification | CP003 | completed |
| CP005 | travel-time-guard | CP004 | completed |
| CP006 | final-copy-and-canonical-assembly | CP005 | completed |
| CP007 | photo-acquisition | CP006 | completed |
| CP008 | qa-gate | CP007 | completed |
| CP009 | html-shell-and-scheduled-layout | CP008 | completed |
| CP010 | guide-layout | CP009 | completed |
| CP011 | pdf-generation | CP010 | pending |
| CP012 | publish-link-and-delivery | CP011 | pending |
| CP013 | end-to-end-verification | CP012 | pending |
| CP014 | guide-ordered-route-anchors | CP008 | completed |
| CP015 | landing-page | CP011 | completed |
| CP016 | web-form-and-webhook-intake | CP014, CP015 | pending |
| CP017 | github-package-and-aws-deployment | CP013, CP016 | pending |

Only one CP may be `in_progress` at a time (`RULES.md` §9).

**Chapter grouping (`RULES.md` §5a):** CP015 and CP016 form one chapter —
"public web surface" — sharing a single Ask Question round, a single plan
document (`plans/cp015-cp016_implementation-plan_public-web-surface.md`), and
one review pass. Each still requires its own completion log (`RULES.md` §7).

---

## CP001 — Foundation and Input Intake

**Status:** completed

- [x] Ask Question gate
- [x] Implementation plan
- [x] Create new n8n workflow (leave inactive)
- [x] `config/config.json` — model slugs, endpoints, photo API config, limits, schema version
- [x] `config/itinerary-schema.json` from `SPEC.md` §11
- [x] `config/palettes.json` — the 7 palettes from §10.1
- [x] `config/travel-rules.json` — hard travel-time rules (§9.3), seeded with at least Bali
- [x] `config/mode-profiles.json` — per-mode section matrix (§4.2), active-hour caps (§9.3), page expectations (§4.3)
- [x] Form trigger with all fields from §12, including **`tripScope`**
- [x] `Validate and Normalize Input` with per-field `LIMITS` caps
- [x] **Mode resolution per §9.2:** `tripScope` is the single source of truth;
      `durationDays` read **only** for `multi_day`, forced otherwise —
      never trust two fields that can contradict
- [x] Reject `durationDays` outside 2–14 when `multi_day` (D6)
- [x] Derive `scopeLabel` from the resolved mode
- [x] Resolve output language: `auto` from input text (D10)
- [x] `Derive Palette` node — deterministic, from `destinationType`, no AI
- [x] Verify: each of the 4 `tripScope` values resolves to the right mode
- [x] Verify: `half_day` + `durationDays=7` cannot produce a 7-day trip
- [x] Verify: workflow validates with 0 errors and 0 warnings
- [x] Verify: workflow left **inactive**
- [x] Verify: no other product directory in this repo modified
- [x] Completion log

## CP002 — Brief Interpretation and Mode Resolution

**Status:** completed · **Depends on:** CP001

Smallest AI stage: free-text brief → structured trip frame.

- [x] Ask Question gate
- [x] Implementation plan
- [x] `Build Brief Request` — enumerate every required output key (§9.1.4)
- [x] AI call node
- [x] `Parse Brief Result` implementing all of §9.1:
  - [x] Re-anchor via `$('Build Brief Request').first().json`
  - [x] Take the LAST `type: 'message'` item
  - [x] Strip markdown fences, brace-scan fallback
- [x] `Handle Brief Call Failure` with a distinct failure code
- [x] Produce `destinationType`, `paceLevel`, `themes`, `tripTitle`, `region`, `country`
- [x] Model may **confirm** but never **override** the resolved mode (§9.2)
- [x] Verify: every enum value inside §11.1
- [x] Verify: `destinationType` never empty (it drives the palette)
- [x] Verify: Indonesian input yields Indonesian values (D10)
- [x] Completion log

## CP003 — Body Skeleton

**Status:** completed · **Depends on:** CP002

Produces `schedule[]` **or** `spots[]` depending on mode — never both.

- [x] Ask Question gate
- [x] Implementation plan
- [x] `Build Skeleton Request`, branching on mode:
  - [x] Scheduled modes → `schedule[]` with `activities[]`
  - [x] `destination_guide` → `spots[]`
  - [x] Request **only** the sections the mode needs, per the §4.2 matrix
  - [x] Enumerate every required key for the chosen shape
  - [x] State §11.1 controlled vocabulary explicitly
  - [x] Instruct: honour `mustInclude` / `mustAvoid`
  - [x] Instruct: **no monetary values at all** (D7)
  - [x] Instruct: **no opening hours, no ticket prices** (D11)
  - [x] Instruct: **§6 standard** — required guidance elements, forbidden
        OTA product-page tells, stated explicitly not implied
  - [x] Instruct: condense similar consecutive days when `multi_day > 7` (D6)
  - [x] Instruct: group spots by area/theme when count ≥ 9 (§4.4, D15)
  - [x] `max_tokens` sized for the largest supported shape
- [x] AI call node
- [x] `Parse Skeleton Result` with all §9.1 patterns
- [x] `Handle Skeleton Call Failure` branch
- [x] Verify: exactly one of `schedule[]` / `spots[]` populated
- [x] Verify: `multi_day` block count reconciles with `durationDays`
- [x] Verify: no block has zero activities
- [x] Verify: a 14-day fixture produces condensed ranges, not 14 full cards
- [x] Verify: a 12-spot guide fixture comes back **grouped**, not thinned (§4.4)
- [x] Verify: `destination_guide` output contains no time values
- [x] Completion log

## CP004 — Venue Verification

**Status:** completed · **Depends on:** CP003

- [ ] Ask Question gate
- [ ] Implementation plan
- [ ] `Collect High-Risk Venues` — deterministic filter per §8 risk table
- [ ] Batch **one search per block** (D8)
- [ ] Budget for `destination_guide` carrying a higher verification load —
      the spots *are* the named entities (§8 mode note)
- [ ] Search call node(s) + parse with all §9.1 patterns
- [ ] `Handle Verification Failure` branch
- [ ] `Reconcile Verification` — deterministic:
  - [ ] Verified venues keep their names
  - [ ] Unverified venues are **genericised**, never silently kept (§8)
  - [ ] Record a verified-venue set for the QA gate
- [ ] Verify: a fixture with an invented restaurant gets genericised
- [ ] Verify: major landmarks are NOT sent for verification (cost control)
- [ ] Verify: search count scales per block, not per venue
- [ ] Completion log

## CP005 — Travel-Time Guard

**Status:** completed · **Depends on:** CP004

Deterministic. Scheduled modes only.

- [ ] Ask Question gate
- [ ] Implementation plan
- [ ] Load hard rules from `config/travel-rules.json`
- [ ] **Per-mode active-hour caps** from `config/mode-profiles.json`:
      `half_day` 6 · `full_day` 11 · `multi_day` 11/day (§9.3)
- [ ] Region-realistic speeds, not highway speeds (§9.3)
- [ ] Coordinate-distance check where coordinates exist
- [ ] Skip cleanly for `destination_guide`; still sanity-check that grouped
      spots are not geographically absurd together
- [ ] Bounded repair loop: return the failing block to the model, small cap
- [ ] Fail closed after the cap — never ship an impossible schedule
- [ ] Verify: `Ubud → Nusa Penida → Uluwatu` same-day fixture is caught
- [ ] Verify: **a 10-hour `half_day` fixture is rejected** — a generic
      11-hour cap would have wrongly passed it
- [ ] Verify: a reasonable itinerary passes untouched
- [ ] Verify: repair loop terminates and cannot spin
- [ ] Completion log

## CP006 — Final Copy and Canonical Assembly

**Status:** completed · **Depends on:** CP005

- [ ] Ask Question gate
- [ ] Implementation plan
- [ ] `Build Final Copy Request` — verified places only, all keys enumerated,
      §6 standard restated
- [ ] AI call node + parse with all §9.1 patterns
- [ ] `Handle Final Copy Failure` branch
- [ ] Produce `overview`, `practical`, `closing` scoped by the §4.2 matrix
- [ ] `Assemble canonicalItinerary` — deterministic merge to §11 shape
- [ ] Verify: `practical` scope matches the mode (no 14-day packing list on a
      half-day tour)
- [ ] Verify: no venue name outside the CP004 verified set
- [ ] Verify: no monetary value (D7), no hours/ticket claims (D11)
- [ ] Completion log

## CP007 — Photo Acquisition

**Status:** completed · **Depends on:** CP006

All of `SPEC.md` §7 is binding.

- [ ] Ask Question gate
- [ ] Implementation plan
- [ ] Honour `heroPhotoUrl` override when supplied (§7.5) — skip search
- [ ] Hero photo search using landmark-biased queries (§7.3)
- [ ] Region-level images only — **never per-activity, never a claimed photo
      of a specific spot** (§7.1)
- [ ] Gradient fallback on low confidence — never a doubtful photo (§7.4)
- [ ] Capture attribution for every photo (§7.6)
- [ ] Trigger the provider's required download/usage endpoint (§7.6)
- [ ] `Handle Photo Failure` — degrade to gradient, do not fail the run
- [ ] Verify: no caption asserts a specific venue (§7.2)
- [ ] Verify: attribution present for every photo used
- [ ] Verify: an obscure destination yields gradients, not wrong photos
- [ ] Completion log

## CP008 — QA Gate

**Status:** completed · **Depends on:** CP007

Deterministic, mode-aware, fail closed. Implements all of §9.4.

- [x] Ask Question gate
- [x] Implementation plan
- [ ] Structural rules, branching per mode (§9.4)
- [ ] **Quality floor checks (§6.3)** — spot description substance, required
      spot fields, actionable tip, activity description not a restatement
- [ ] **OTA product-page tell detection (§6.1)** — ratings, review counts,
      scarcity claims, per-spot booking CTA, bare feature checklists
- [ ] **Money check must be pattern-based, not word-based** (§9.1.9)
- [ ] Integrity checks: guard passed, attribution present, venues verified
- [ ] Distinct failure code per rule
- [ ] Verify: fixture with `Rp 500.000` is rejected
- [ ] Verify: **fixture with the word "harga" but no figure is accepted** —
      regression guard for the Web Scoping Engine over-blocking bug
- [ ] Verify: fixture with "4.8 ★ (2,341 ulasan)" is rejected (§6.1)
- [ ] Verify: fixture with a one-line spot description is rejected (§6.3)
- [ ] Verify: `destination_guide` fixture containing a time value is rejected
- [ ] Verify: fixture with both `schedule[]` and `spots[]` is rejected
- [ ] Verify: a valid fixture in each of the 4 modes passes
- [ ] Completion log

## CP009 — HTML Shell and Scheduled Layout

**Status:** completed · **Depends on:** CP008

Shared shell + the timeline body (`SPEC.md` §5, §10).

- [x] Ask Question gate
- [x] Implementation plan
- [ ] Write `render-itinerary-html.js` (no DOCX tooling)
- [ ] Shared shell: hero, overview, practical, closing (§10.2)
- [ ] Hero with photo/gradient overlay
- [ ] Overview: quick-facts strip, route summary, highlights with icons
- [ ] **Vertical connected timeline** with block markers (D12)
- [ ] Day markers for `multi_day` only; continuous timeline for
      `half_day`/`full_day` with no block header (§10.2)
- [ ] Inline SVG icon set for all 7 activity types (§11.1)
- [ ] Palette injected from `config/palettes.json` (§10.1)
- [ ] Section visibility driven by `config/mode-profiles.json` (§4.2)
- [ ] Self-contained output: inline CSS, inline SVG, no CDN (§10.3)
- [ ] At most one base64-embedded display font; system stack for body
- [ ] Mobile-first — phone view is the primary view (§10.3)
- [ ] Empty arrays remove their section entirely, no empty shells
- [ ] **Rendered visual verification** at phone and desktop width, for all
      three scheduled modes (§13)
- [ ] Completion log recording the visual evidence

## CP010 — Guide Layout

**Status:** completed · **Depends on:** CP009

The place-ordered body (`SPEC.md` §5.4). **Not** the timeline with times
removed — a distinct component.

- [x] Ask Question gate
- [x] Implementation plan
- [ ] Spot card grid, reusing the CP009 shell unchanged
- [ ] Card shows name, area, category, description, suggested duration,
      best time, getting there, tips, nearby pairing
- [ ] Grouped rendering with group intro when `groupLabel` present (§4.4)
- [ ] Region-level image or icon per card — never a claimed venue photo (§7.1)
- [ ] Verify: a 5-spot flat guide renders correctly
- [ ] Verify: a 15-spot grouped guide renders correctly and stays readable
- [ ] Verify: no time value appears anywhere in the rendered output
- [ ] **Rendered visual verification** at phone and desktop width (§13)
- [ ] Completion log recording the visual evidence

## CP011 — PDF Generation

**Status:** in_progress · **Depends on:** CP010

**Plan:** `plans/cp011_implementation-plan_pdf-generation.md`

- [ ] Ask Question gate
- [ ] Implementation plan
- [ ] Playwright HTML → PDF
- [ ] **`printBackground: true`** — without it all colour is lost (§10.3)
- [ ] `break-inside: avoid` verified effective on block and spot cards
- [ ] Explicit `@page` margins
- [ ] Temp files use `$execution.id`, never `Date.now()` (§9.1.8)
- [ ] `Handle PDF Failure` — HTML retained
- [ ] **Rendered visual verification of the PDF specifically** — confirm
      gradients and backgrounds actually survived (§13.3)
- [ ] Verify: no card splits across a page break (§13.4)
- [ ] Verify: page count within §4.3 expectations for each mode
- [ ] Completion log

## CP012 — Publish Link and Delivery

**Status:** pending · **Depends on:** CP011

- [ ] Ask Question gate
- [ ] Implementation plan
- [ ] Serve HTML behind an unguessable token (D5)
- [ ] **Long lifetime, 6–12 months — NOT the 24-hour pattern** from
      Website Research Engine (D5 rationale)
- [ ] Decide and document the retention/cleanup policy
- [ ] Email to **the agent's** address (D9), PDF attached, link included
- [ ] Attachment verified present and non-zero length
- [ ] Email body in the resolved output language (D10)
- [ ] `Handle Delivery Failure` — generated files retained
- [ ] Verify: link resolves; token cannot be guessed or enumerated
- [ ] Verify: link still resolves well beyond 24 hours
- [ ] Verify: attachment opens as a valid PDF
- [ ] Completion log

## CP013 — End-to-End Verification

**Status:** pending · **Depends on:** CP012

- [ ] Ask Question gate
- [ ] Implementation plan
- [ ] Full run in **each of the 4 modes** (D13)
- [ ] Full run, Indonesian submission (D10)
- [ ] Full run, English submission (D10)
- [ ] `multi_day` 14-day run — condensing verified (D6)
- [ ] High-spot-count guide run — grouping verified, not thinned (§4.4)
- [ ] Run with `heroPhotoUrl` supplied — search skipped (§7.5)
- [ ] Run with an obscure destination — gradients, not wrong photos (§7.4)
- [ ] Impossible-itinerary fixture — caught by the guard (§9.3)
- [ ] 10-hour `half_day` fixture — rejected (§9.3)
- [ ] Confirm no monetary value anywhere (D7)
- [ ] Confirm no opening hours or ticket prices (D11)
- [ ] Confirm no OTA product-page tell; quality floor holds (§6)
- [ ] Confirm photo attribution present (§7.6)
- [ ] Rendered visual verification of final HTML and PDF (§13)
- [ ] Confirm the other five products in this repo are unchanged
- [ ] Activate the workflow only after all criteria pass
- [ ] Completion log

---

## CP014 — Guide-Ordered Route Anchors

**Status:** completed · **Depends on:** CP008
**Plan:** `plans/cp014_implementation-plan_guide-ordered-route-anchors.md`
**Log:** `logs/cp014_completion-log_guide-ordered-route-anchors.md`

Previously `blocked` on an external CP002 bug (invalid AI model name); fixed
2026-09-04 (see CP002's revision log) which unblocked a full live
end-to-end proof — see the completion log for evidence.

The guide states the visiting order per day; the pipeline enforces it
deterministically. No geodata API — the guide's input *is* the ground truth.

- [x] Ask Question gate (2026-09-03: day-labelled format, plan-only)
- [x] Implementation plan
- [x] Form Trigger field `routePlan` (textarea, optional)
- [x] `config/config.json` → `limits.routePlan: 4000`
- [~] `config/itinerary-schema.json` — **deviation:** this file is the
      `canonicalItinerary` **output/rendering** schema
      (`additionalProperties: false`), not an intake schema; `routePlanOrdered`
      is a pipeline-internal field never rendered, so adding it there would be
      unjustified scope creep. Not changed; documented in the plan.
- [x] New deterministic `Parse Route Plan` node (no separate failure branch —
      **deviation:** reuses the existing `ok:false`/`errorCode` cascade
      pattern that CP001's own `Validate and Normalize Input` already uses,
      for consistency rather than introducing a second error-handling shape)
  - [x] Day-marker grammar accepts `Hari N:` **and** `Day N:` (D10)
  - [x] Mode-aware acceptance table (bare list ok for half/full day and guide;
        rejected for `multi_day`)
  - [x] Distinct code per validation rule, fail closed
  - [x] `routePlanBlockCount < durationDays` allowed; model fills the rest
- [x] CP003 `Build Skeleton Request`: anchors are a fixed ordered spine —
      fill between, never reorder, never move block, never drop
- [x] CP008 QA Gate: anchor subsequence check per block
  - [x] **Normalised matching, not exact-string** (§11c)
  - [x] `ROUTE_ANCHOR_MISSING` / `_OUT_OF_ORDER` / `_WRONG_BLOCK`
- [x] CP005 stays authoritative on feasibility; no path reorders guide anchors
      (verified by construction — CP005 node untouched)
- [x] Verify: guide's order reproduced exactly, per block — confirmed live
      for `Parse Route Plan` (execution 4476); confirmed deterministically
      for the QA Gate anchor check and the CP003 prompt injection (local
      fixtures, `output/cp014-test-*.{js,cjs}`)
- [x] Verify: reorder / drop / wrong-block fixtures all rejected
- [x] **Verify: translated anchor ("Terasering Tegallalang" for "Tegallalang
      Rice Terraces") is ACCEPTED** — regression guard for the
      `web-scoping-engine` over-blocking bug
- [x] Verify: `routePlan` empty reproduces current behaviour exactly
- [x] Verify: `multi_day` bare list rejected; day gaps rejected; over-duration
      rejected
- [x] Verify: `destination_guide` ordered list sets `spots[]` order
- [x] Verify: workflow validates 0 errors / 0 warnings, left inactive
      (confirmed `active: false` after every operation)
- [x] Live end-to-end run through a real AI-generated schedule — CP002's
      model-name bug fixed 2026-09-04 (external, see CP002's revision log);
      live execution 4521 (`half_day`, real web form submission) produced
      `routePlanProvided: true`, the anchor correctly placed and rendered,
      and `qaOk: true` with **zero** `ROUTE_ANCHOR_*` failures
- [x] Completion log

## CP015 — Landing Page

**Status:** completed · **Depends on:** CP011 (gap accepted 2026-09-03: proceeded
with ad-hoc `e2e-pdf-results/` evidence as the demo, before CP011 formally
completes — see plan's Execution Status and the completion log's Known
Limitations)
**Plan:** `plans/cp015-cp016_implementation-plan_public-web-surface.md`
**Chapter:** CP015–CP016 (public web surface)
**Log:** `logs/cp015_completion-log_landing-page.md`

Subpage on `repeatable.co` in the existing Carbon Copy system. Site relocated
to `repeatable/` mid-plan (commit `5ef379b`) — plan updated to match before
execution.

- [x] Ask Question gate (2026-09-03: free + email capture, separate form page)
- [x] Implementation plan (chapter)
- [x] `repeatable/t/itinerary-generator.html`, `lang="id"`, following the `t/*.html` structure
- [x] Sections: hero, stats, overview, four modes, how it works, what it is
      **not**, FAQ, CTA (guide's route section deferred — needs CP014
      `completed`, currently `blocked`)
- [x] `SoftwareApplication` + `FAQPage` JSON-LD
- [x] `demo-embed` shows **real** output from `e2e-pdf-results/`
- [x] Catalog card in `repeatable/index.html` + `Travel` filter tag
- [x] `repeatable/sitemap.xml` entry (landing page only; form page stays out)
- [x] Additive CSS only, existing tokens, self-hosted IBM Plex, no CDN
      (in the end, **zero new CSS was needed** — every component already existed)
- [x] Anti-slop rules hold: no invented figures, no testimonials, no logo wall;
      every claim traceable to a `SPEC.md` section (see completion log table)
- [x] Verify: FAQ accordion works with `main.js` **unmodified**
- [x] Verify: no external stylesheet/font/script request (from the network log)
- [x] **Rendered visual verification** at 390×844 and 1440×1000, side by side
      with an existing `t/` page (§13, §11a)
- [x] Completion log recording the visual evidence and the claim→spec mapping

## CP016 — Web Form and Webhook Intake

**Status:** pending · **Depends on:** CP014, CP015
**Plan:** `plans/cp015-cp016_implementation-plan_public-web-surface.md`
**Chapter:** CP015–CP016 (public web surface)

The form the n8n Form Trigger architecturally cannot be: per-day route rows
generated from the chosen duration. (`formTrigger` v2.5 `displayOptions` can
only key off a field's own `fieldType`, never another field's submitted value.)

- [x] Ask Question gate (2026-09-03, shared with CP015)
- [x] Implementation plan (chapter)
- [ ] `app/itinerary-generator.html`, `noindex`, same header/footer/CSS
- [ ] Full `SPEC.md` §12 field set plus `routePlan`
- [ ] Per-day rows from `tripScope` + `durationDays`; none for half/full day
      and `destination_guide`
- [ ] Serialise rows into the **exact** CP014 grammar — one grammar, one parser
- [ ] Client validation mirrors `LIMITS` but is never trusted
- [ ] New Webhook node + `Normalize Webhook Payload` converging into
      `Validate and Normalize Input`; Form Trigger kept for internal testing
- [ ] Immediate ack response; delivery stays with CP012
- [ ] CORS + `OPTIONS` preflight
- [ ] Honeypot, required email, proxy-level rate limit; residual risk stated
- [ ] Verify: 5 day rows for `durationDays: 5`; no orphaned values after change
- [ ] Verify: serialised `routePlan` asserted against CP014's own fixtures
- [ ] Verify: webhook and Form Trigger produce equivalent normalised output
- [ ] Verify: **CORS preflight from the real page origin in a browser**, not curl
- [ ] Verify: oversized field rejected server-side with client JS disabled
- [ ] Verify: webhook failure preserves the user's input
- [ ] Verify: no credential in page source
- [ ] Verify: end-to-end submit → email with PDF + link, order matching the rows
- [ ] **Rendered visual verification** at both widths (§13, §11a)
- [ ] Completion log

---

## CP017 — GitHub Package and AWS Deployment

**Status:** pending · **Depends on:** CP013, CP016  
**Plan:** plans/cp017_implementation-plan_github-package-and-aws-deployment.md

- [x] Ask Question gate (2026-09-20: repository fixed to
      https://github.com/satrya370/itenary-generator.git; package files and
      supporting deployment artifacts belong in that repository)
- [x] Implementation plan
- [ ] Confirm CP011, CP012, CP013, and CP016 are completed with matching logs
- [ ] Export the exact live workflow GRuSSwnW38U1HNgK and sanitize it
- [ ] Create a reproducible npm package and lockfile for HTML/PDF rendering
- [ ] Add package validation, fixtures, tests, CI, deployment, verification,
      and rollback scripts
- [ ] Push the sanitized package to satrya370/itenary-generator
- [ ] Back up the existing AWS n8n deployment before mutation
- [ ] Merge the itinerary package into the existing Docker image and Compose
      stack without disrupting active products
- [ ] Configure credential remapping and secret environment injection without
      committing credential values
- [ ] Import under a production workflow ID, verify inactive, then activate
      only after smoke tests pass
- [ ] Verify all four modes, Indonesian and English output, HTML/PDF visual
      quality, persistent public link, and email delivery
- [ ] Verify all pre-existing workflows remain active and healthy
- [ ] Completion log

---

## Follow-ups (not yet CPs)

Recorded so they are not silently absorbed into an active CP
(`RULES.md` §10).

- Seed `config/travel-rules.json` beyond Bali as real usage reveals which
  regions matter.
- Agent-facing regenerate/swap-photo action, rather than requiring a whole
  new submission to change one image.
- Embedded map or click-to-open-Maps links per activity/spot — natural fit
  for the long-lived link (D5), out of scope for the PDF.
- Coordinate-based backtrack detection for the case where the guide leaves
  `routePlan` empty (CP014 covers the case where they fill it). Checked
  2026-09-03: Google's flat $200/month credit was retired in March 2025 and
  Text/Nearby Search now bills from a 5,000-call Pro tier at $32/1,000 with
  billing mandatory, so **OpenStreetMap Nominatim first** — free, no key, no
  billing, and its 1 req/s public limit is ample at one lookup per block.
  Google Places only as a paid fallback where OSM coverage is thin. Would also
  sharpen the travel-time guard (§9.3).
- Bounded model-repair loop for CP014 anchor violations, instead of
  fail-closed only.
- Durable storage for emails captured by CP016 (currently the address is only
  used as `recipientEmail`).
- Replace the `about:blank` `demo-embed` placeholders on the five existing
  `t/*.html` pages once CP015 establishes a real embedded-demo pattern.
- Consider whether `destination_guide` should support a "pick your own days"
  hand-off into a scheduled mode once both are stable.
