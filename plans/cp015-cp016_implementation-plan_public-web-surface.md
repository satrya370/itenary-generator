# CP015–CP016 Implementation Plan: Public Web Surface

**Chapter plan.** Per `RULES.md` §5a this document covers two CPs that share one
Ask Question round and one review pass. Each still gets its own completion log
(`RULES.md` §7). `TODOS.md` must record the CP015–CP016 grouping explicitly for
this shared plan to be valid.

**Filename note:** `RULES.md` §3 assumes one CP per plan file. A compound
`cp015-cp016` prefix is used here for the chapter. Flagged rather than silently
deviating; if the preference is one file per CP, split before execution.

| CP | Object | Result |
|---|---|---|
| CP015 | `landing-page` | A marketing page on `repeatable.co` that explains the product and links to the tool |
| CP016 | `web-form-and-webhook-intake` | A separate form page with per-day route inputs that submits into the workflow via a webhook |

**Path update (2026-09-03, post-plan):** while this plan sat as `pending`,
commit `5ef379b` ("Organize Repeatable website into dedicated folder")
relocated the deployable site from the repo root into `repeatable/` — a pure
rename (`index.html` → `repeatable/index.html`, `t/` → `repeatable/t/`,
`assets/` → `repeatable/assets/`, `sitemap.xml` → `repeatable/sitemap.xml`),
plus one unrelated catalog registration (POS Lite & Cashflow OS got its
`note-card` + a new `Retail` filter tag — the same pattern this plan uses for
`Travel`). No design or structure changed; verified 279/831/54/170 lines
identical to what this plan was originally written against. Every path below
is updated to the `repeatable/` prefix accordingly. `repeatable/` is the
deploy root — root-absolute links (`/t/…`) still resolve correctly once
deployed, unchanged.

## Objective

Give this product a proper public surface on the existing Repeatable site: a
subpage that explains what it is, what you get, and what it deliberately refuses
to do — plus a separate tool page whose form can do what the n8n Form Trigger
architecturally cannot (generate per-day route inputs from the chosen duration).

## Clarifications and Decisions

Ask Question gate completed 2026-09-03. Decisions:

| Decision | Answer | Consequence |
|---|---|---|
| Execution timing | **Plan only, do not execute** | Both CPs stay `pending`; no files written from this plan yet |
| CTA / model | **Free + email capture** | Email is required and doubles as `recipientEmail`; no pricing, no payment flow, no paywall copy anywhere on the page |
| Form placement | **Landing page + separate form page** | Marketing at `repeatable/t/itinerary-generator.html`, tool at `repeatable/app/itinerary-generator.html` |
| Route input format (from CP014) | **Day-labelled** | The form's per-day rows serialise into exactly the `Hari N: A, B` grammar CP014's parser accepts |

Decisions taken inside this plan:

- **The n8n Form Trigger is kept, not deleted.** It stays as the internal test
  surface. Both triggers converge on the same downstream path, so the pipeline
  is never forked.
- **The form page is `noindex`.** It is an app surface with no content value;
  indexing it would compete with the landing page for the same intent.
- **CP016 depends on CP014.** The form's whole purpose is producing a valid
  `routePlan`. Building it before CP014 defines the grammar would mean guessing
  the contract twice.

## Scope

**CP015**
1. `repeatable/t/itinerary-generator.html` following the existing `t/*.html` structure.
2. Catalog card in `repeatable/index.html` + a filter tag for the new niche.
3. `repeatable/sitemap.xml` entry.
4. Only additive CSS in `repeatable/assets/css/style.css`, and only for components that
   genuinely do not exist yet.

**CP016**
1. `repeatable/app/itinerary-generator.html` — full `SPEC.md` §12 field set plus the CP014
   `routePlan`, with duration-driven per-day rows.
2. Client-side serialisation into the CP014 grammar.
3. New Webhook node in `GRuSSwnW38U1HNgK`, normalised to the Form Trigger's
   output shape, converging into `Validate and Normalize Input`.
4. Immediate-acknowledgement response; delivery stays with CP012.
5. CORS/preflight, abuse controls, and client-side validation mirroring `LIMITS`.

## Out of Scope

- Payment, pricing, quota, or account systems. The decision is free + email
  capture; anything else is a separate CP.
- An email list store (CRM, Sheets, Airtable). Email is captured and used as
  `recipientEmail`; durable list-building is a follow-up so it does not quietly
  expand this chapter (`RULES.md` §10).
- Redesigning the site or introducing a second design language.
- Touching the other five product directories in this repo.
- Live progress streaming or a status page. Ack-then-email only.

## Current-State Findings

Verified against the repository:

- **The deployable site lives at `repeatable/`, not at the repo root** (see the
  path-update note above). All paths in this plan are `repeatable/`-relative.
- Design system ("Carbon Copy") lives in one 831-line
  `repeatable/assets/css/style.css`.
  Tokens: `--paper #FAFAF8`, `--ink #1E2440`, `--duplicate-yellow #F5C242`,
  `--triplicate-pink #F2A9C4`, `--carbon-gray #8A8778`, `--surface #FFFFFF`,
  `--border #E0DDD5`, `--radius 6px`, `--max-width 1100px`.
- Fonts are **self-hosted** IBM Plex Mono + IBM Plex Sans woff2 in
  `repeatable/assets/fonts/` via `@font-face`. No CDN, no Google Fonts — must stay that way.
- All five `repeatable/t/*.html` pages are **170 lines**, `lang="id"`, and share one
  structure: `site-header` → `back-link` → `template-hero`
  (`definition-lead` + `quick-answer`) → `template-stats` (3 × `stat-item`) →
  `section` with `template-layout` (`demo-embed` iframe + `feature-list`) →
  `section-sm` FAQ (`faq-list`) → `section-sm` `template-cta-row` →
  `site-footer`. Two JSON-LD blocks: `Product` and `FAQPage`.
- `repeatable/assets/js/main.js` (54 lines, vanilla, IIFE) already provides: catalog
  filtering via `.filter-bar` + `[data-niche]`, FAQ accordion via `.faq-item` /
  `.faq-question` / `.open` class toggle, and a `.btn-sobek` tear animation.
  **The FAQ needs no new JavaScript** — matching the existing markup is enough.
- `repeatable/index.html` already has precedent for exactly this plan's
  CP015 catalog step: the reorg commit added a `Retail` filter tag and a
  `note-card` for POS Lite & Cashflow OS in the same pattern this plan uses
  for `Travel`. Follow that as the concrete template.
- Useful existing classes not yet used by `t/pos-lite-cashflow-os.html`:
  `steps` / `step` / `step-title` / `step-desc`, `email-capture` /
  `email-capture-form`, `divider-perf`, `note-card`, `badge-free`, `mono-label`,
  `body-lg`, `body-sm`, `text-carbon`, `display-lg/md/sm`.
- Catalog cards use `note-card` with `data-niche` + `badge-free` / `badge-paid`,
  `note-card-price`, and root-absolute links (`/t/…`).
- `demo-embed` on the existing pages points at `about:blank` — a placeholder.
- Existing pages are Indonesian and specific, and they openly state what the
  product is *not* (the pos-lite FAQ opens with "Bukan. Ini bukan sistem
  checkout real-time…"). That candour is the house voice and this page should
  match it.
- Real product output already exists to use as honest proof:
  `itinerary-engine/e2e-pdf-results/itinerary-4267.pdf`,
  `itinerary-4267-page-1.png`, `itinerary-4267.html`.
- `n8n-nodes-base.formTrigger` v2.5 confirms the architectural limit motivating
  CP016: `displayOptions` on a form field can only key off that field's own
  `fieldType`, never another field's submitted value, and `n8n-nodes-base.form`
  pages are fixed at design time. Duration-driven field generation is therefore
  impossible on the Form Trigger — this is a real constraint, not a preference.

## Proposed Changes

### CP015 — `repeatable/t/itinerary-generator.html`

Section map, reusing existing classes:

| # | Section | Class | Content |
|---|---|---|---|
| 1 | Header | `site-header` | Copied verbatim from `t/pos-lite-cashflow-os.html` |
| 2 | Back link | `back-link` | "Kembali ke katalog" |
| 3 | Hero | `template-hero` | `definition-lead`: one sentence defining the product. `quick-answer`: what actually arrives, concretely — a self-contained HTML link plus a colour PDF, in Indonesian or English |
| 4 | Stats | `template-stats` | Three **verifiable** facts, not marketing numbers: "4 mode trip" (§4), "HTML + PDF" (§5, CP011), "Bahasa ID / EN otomatis" (D10) |
| 5 | Overview | `section` + `template-layout` | `demo-embed` showing the **real** rendered brochure; `feature-list` of what is included, each item traceable to a `SPEC.md` section |
| 6 | Modes | `section-sm` | The four trip modes as `note-card`s — `half_day`, `full_day`, `multi_day`, `destination_guide` (§4.2, §4.3). This is the product's actual differentiator |
| 7 | How it works | `section-sm` + `steps` | 4 `step`s: isi form → AI susun rute → QA otomatis menolak yang tidak lolos → HTML + PDF ke email |
| 8 | Guide's route | `section-sm` | The CP014 capability: the guide writes the order per day and the system enforces it. Ship this section only once CP014 is complete |
| 9 | What it is not | `section-sm` | Honest limits, matching the house voice: no prices/quotes (D7), no opening hours or ticket prices (D11), stock photos are region-level and never claimed as a specific venue (§7.1), not a booking engine, not an OTA product page (§6.1) |
| 10 | FAQ | `section-sm` + `faq-list` | 5–6 real questions + matching `FAQPage` JSON-LD |
| 11 | CTA | `section-sm` + `email-capture` | Free, email required, link to `/app/itinerary-generator.html` |
| 12 | Footer | `site-footer` | Copied verbatim |

JSON-LD: `SoftwareApplication` (not `Product` — this is a free tool, not a
one-off template purchase) with `offers.price: "0"`, plus `FAQPage` matching the
visible questions exactly.

`repeatable/index.html`: one `note-card` with `data-niche="Travel"`, `badge-free`,
`note-card-price` "Free", linking `/t/itinerary-generator.html`; add the
matching `Travel` tag to `.filter-bar` so the existing filter JS works — same
shape as the `Retail` tag the reorg commit just added.

`repeatable/sitemap.xml`: landing page at priority `0.8`, `changefreq monthly`, matching
the other `t/` entries. The form page is **not** listed.

#### Anti-slop rules (binding for CP015)

These are acceptance criteria, not style advice:

1. **No invented numbers or social proof.** No "dipercaya 500+ agen", no fake
   testimonials, no logo wall, no made-up time savings. Every figure on the page
   must be checkable in `SPEC.md` or in a real execution artifact.
2. **The demo must be real output.** `demo-embed` renders the actual generated
   brochure from `e2e-pdf-results/`, not a mockup and not `about:blank`.
3. **Every feature claim cites a `SPEC.md` section** in the plan's review notes,
   so a reviewer can check the page against the spec line by line.
4. **No new design language.** Existing tokens, existing classes, self-hosted
   IBM Plex only. No gradients, shadows, or accent colours foreign to the
   system. New CSS is additive, uses the existing custom properties, and is
   justified per rule in the completion log.
5. **Scale discipline.** Target ≈250–320 lines. The existing pages are 170; this
   one has more sections, but a 900-line page means padding.
6. **`lang="id"`**, matching all five existing subpages. Product output can be
   ID or EN (D10); the marketing page is Indonesian.
7. **State the limits plainly.** Section 9 is required, not optional. A page
   that only sells is off-voice for this site.
8. **No em-dash-and-superlative filler.** Short, concrete, specific sentences —
   the register of the existing pages, which describe mechanics rather than
   promising transformation.

### CP016 — `repeatable/app/itinerary-generator.html` + webhook intake

Page reuses the same header/footer/CSS so it does not feel like a different
site. `<meta name="robots" content="noindex">`.

Fields: the full `SPEC.md` §12 set (`agencyName`, `agencyContact`,
`destination`, `tripScope`, `durationDays`, `tripTitle`, `startDate`,
`travelerCount`, `travelerType`, `pace`, `themes`, `mustInclude`, `mustAvoid`,
`accommodationNote`, `heroPhotoUrl`, `outputLanguage`, `recipientEmail`) plus
CP014's `routePlan`.

**The duration-driven behaviour that justifies this CP:**

| `tripScope` | Route input rendered |
|---|---|
| `half_day`, `full_day` | One "Urutan destinasi" textarea, no day rows |
| `multi_day` | `durationDays` (2–14, D6); on change, generate exactly N rows labelled "Hari 1…N" |
| `destination_guide` | One ordered list, no day rows |

On submit, JS serialises the rows into the CP014 grammar verbatim:

```
Hari 1: Tegallalang Rice Terraces, Warung lokal Ubud
Hari 2: Uluwatu Temple, Pantai Padang-Padang
```

**Both input surfaces must converge on one contract.** The n8n Form Trigger
textarea and this form's generated rows produce the same `routePlan` string, so
`Parse Route Plan` stays the single authority. The form is a nicer keyboard for
the same grammar, never a second parser. Client-side validation mirrors
`config/config.json` `limits` but is **not trusted** — CP001 and CP014 re-check
everything server-side.

Webhook intake:

- New Webhook node (`POST`, JSON) → `Normalize Webhook Payload` → the existing
  `Validate and Normalize Input`. The normaliser maps the JSON body onto the
  same field shape the Form Trigger emits, so nothing downstream can tell the
  two apart.
- `responseMode` returns immediately with an acknowledgement; a full run takes
  minutes and must never hold the browser open. The page shows "sedang diproses,
  cek email" and CP012 does the delivery.
- CORS: `Access-Control-Allow-Origin` for the site origin, plus an `OPTIONS`
  preflight path. This is the most likely thing to break first and must be
  tested from the real page origin, not with `curl`.

## Data Flow or Control Flow

```
repeatable.co/t/itinerary-generator.html      (repeatable/t/…, CP015, static, indexed)
   └─ CTA → /app/itinerary-generator.html     (repeatable/app/…, CP016, static, noindex)
        └─ JS: tripScope + durationDays → N per-day rows
             └─ serialise → routePlan ("Hari N: A, B")
                  └─ POST JSON  ──► n8n Webhook (CP016)
                                      └─ Normalize Webhook Payload
                                           │
   n8n Form Trigger (internal testing) ─────┤   ← both converge here
                                           ▼
                                  Validate and Normalize Input  (CP001)
                                       └─ Parse Route Plan       (CP014)
                                            └─ CP002 … CP011
                                                 └─ CP012 delivery
                                                      └─ email + link to guide
        ◄── immediate ack response ("cek email"), not the finished brochure
```

## Files and n8n Workflows Affected

| Artifact | CP | Change |
|---|---|---|
| `repeatable/t/itinerary-generator.html` | CP015 | New landing page |
| `repeatable/index.html` | CP015 | Catalog card + `Travel` filter tag |
| `repeatable/sitemap.xml` | CP015 | Landing page entry |
| `repeatable/assets/css/style.css` | CP015 | Additive only, justified per rule |
| `repeatable/app/itinerary-generator.html` | CP016 | New form page (new `repeatable/app/` directory) |
| `repeatable/assets/js/` | CP016 | Form JS — separate file, `main.js` left untouched |
| n8n `GRuSSwnW38U1HNgK` | CP016 | Webhook node + `Normalize Webhook Payload` |
| `SPEC.md` | CP016 | Document the webhook as a second intake surface |
| `TODOS.md` | both | CP015/CP016 rows; record the chapter grouping |

**Repo-boundary note:** this chapter is the first `itinerary-engine` work that
edits the shared `repeatable/` site (`index.html`, `sitemap.xml`, `assets/`),
which now lives in its own top-level folder as of the reorg commit rather than
at the repo root. CP013's acceptance item "confirm the other five products in
this repo are unchanged" refers to *product directories*; the shared
`repeatable/` site is shared infrastructure and is in scope here. CP013 should
be read that way rather than treated as a conflict — worth confirming when
CP013 runs.

## Security and Failure Handling

- **A public webhook URL is an abuse surface, and its URL will be visible in
  page source.** Obscurity is not a control. Mitigations: server-side `LIMITS`
  re-validation, required and format-checked email, a honeypot field, and rate
  limiting at the reverse proxy / Cloudflare rather than in the workflow.
  Every run costs AI and photo-API calls, so this is a real cost risk, not a
  theoretical one — state the residual risk in the completion log rather than
  implying the endpoint is protected.
- No API key, token, or credential may appear in client-side JS or page source.
  The page talks only to the webhook.
- `heroPhotoUrl` is a user-supplied URL that the workflow will fetch (§7.5) —
  keep the existing 2048-char cap and scheme validation; do not widen it here.
- All user text must be HTML-escaped wherever it is echoed, on both pages.
- Webhook failures must not lose a submission silently: on non-2xx the page
  keeps the user's input and shows a retry, rather than clearing the form.
- Do not put the guide's or client's email into logs or screenshots taken as
  verification evidence (`RULES.md` §12) — use `qa@example.com`-style addresses.

## Verification Plan

Rendered visual verification is mandatory (`RULES.md` §11a) — actually opening
the pages and looking at them, at phone (390×844) and desktop (1440×1000).

**CP015**

| # | Check |
|---|---|
| 1 | Page renders at both widths; no horizontal scroll on phone |
| 2 | Visually consistent with an existing `repeatable/t/` page opened side by side |
| 3 | No external stylesheet, font, or script request (verify from the network log, not by reading the HTML) |
| 4 | FAQ accordion works with the existing `main.js`, unmodified |
| 5 | Catalog card appears and the `Travel` filter tag shows/hides it |
| 6 | Both JSON-LD blocks parse; `FAQPage` matches the visible questions exactly |
| 7 | `demo-embed` shows the real generated brochure |
| 8 | Every feature claim mapped to a `SPEC.md` section in the log |
| 9 | No invented number, testimonial, or logo anywhere |
| 10 | Line count within the stated range |

**CP016**

| # | Check |
|---|---|
| 11 | `multi_day` + `durationDays: 5` renders exactly 5 day rows; changing to 3 leaves 3, with no orphaned values submitted |
| 12 | `half_day`, `full_day`, `destination_guide` render no day rows |
| 13 | Serialised `routePlan` string is byte-identical to what `Parse Route Plan` accepts — asserted against CP014's own fixtures, not by eye |
| 14 | Real submit from the page triggers a live n8n execution |
| 15 | Webhook and Form Trigger submissions with equivalent input produce equivalent `Validate and Normalize Input` output |
| 16 | CORS preflight passes **from the real page origin in a browser** |
| 17 | Ack response returns immediately; browser is not held open |
| 18 | Oversized field is rejected server-side even with client JS disabled |
| 19 | Honeypot submission is rejected |
| 20 | Webhook failure preserves the user's input |
| 21 | Page source contains no credential or key |
| 22 | End-to-end: submit → email arrives with PDF + link, order matching the day rows |
| 23 | Workflow validates 0 errors / 0 warnings; left inactive until CP013 |

## Acceptance Criteria

**CP015**
1. `t/itinerary-generator.html` exists, `lang="id"`, and follows the `t/` structure.
2. Indistinguishable in visual language from existing subpages; additive CSS only.
3. Explains what the product is, what you get, the four modes, how it works,
   and what it deliberately does not do.
4. Every claim traceable to `SPEC.md`; zero invented figures or social proof.
5. Demo shows real generated output.
6. Catalog card + filter tag + sitemap entry all work.
7. Self-contained: no CDN, no external font, no new JS.
8. Verified visually at both widths, with evidence recorded.

**CP016**
9. Form page renders the full §12 field set plus `routePlan`.
10. Per-day rows are generated from `tripScope` + `durationDays` and produce a
    `routePlan` string that CP014's parser accepts unchanged.
11. Webhook and Form Trigger converge with no downstream fork.
12. Ack is immediate; delivery is by email via CP012.
13. CORS verified from a real browser at the real origin.
14. Server-side validation holds with client JS disabled.
15. No secret in client source; abuse controls in place and residual risk stated.
16. A real end-to-end submit produces a brochure honouring the day-row order.
17. Workflow validates clean and stays inactive until CP013.

## Risks and Rollback

| Risk | Mitigation |
|---|---|
| **CORS/preflight breaks on the real domain** — most likely first failure | Test from the deployed origin in a browser (check 16); `curl` does not exercise preflight |
| Public webhook abuse driving real AI/API cost | Proxy-level rate limit, honeypot, required email, `LIMITS`; residual risk stated honestly in the log |
| Form's serialiser and CP014's parser drift apart | Check 13 asserts against CP014's own fixtures; one grammar, one parser, no second implementation |
| Page becomes AI-slop marketing | The eight anti-slop rules are acceptance criteria; checks 8–10 enforce them |
| Design drift from Carbon Copy | Additive CSS only using existing tokens; check 2 is a side-by-side comparison |
| CP016 built before CP014's grammar is fixed | CP016 depends on CP014; do not start it earlier |
| Root-file edits mistaken for cross-product contamination at CP013 | Boundary note above; confirm the reading when CP013 runs |
| Guide expects the brochure in the browser | Ack copy states plainly that it arrives by email |

Rollback: CP015 is three additive files/edits — delete the page, the catalog
card, the filter tag, the sitemap entry, and any appended CSS. CP016 — delete
the form page and its JS, remove the Webhook and normaliser nodes. The Form
Trigger path is untouched throughout, so removing either CP leaves the workflow
exactly as CP014 left it.

## Follow-Ups (not part of this chapter)

- Durable email-list storage for captured addresses.
- A status/progress surface instead of ack-then-email.
- Reconsider pricing or quotas once real usage and per-run cost are known.
- Replace the `about:blank` `demo-embed` placeholders on the five existing
  `t/` pages, now that there is a pattern for a real embedded demo.
