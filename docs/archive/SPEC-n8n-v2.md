# Itinerary Brochure Engine — Specification

**Version:** 2
**Created:** 2026-08-27
**Revised:** 2026-08-27 — added trip modes (§4) and the Brochure-and-Guidance
Standard (§6); `days[]` replaced by `schedule[]` + `spots[]`
**Status:** Draft — awaiting CP001 implementation plan

---

## 1. Product Definition

**Name:** Itinerary Brochure Engine
**Deliverable:** `Digital Trip Brochure & Guide`
— HTML (primary, long-lived shareable link) + PDF (derived, email attachment)

**Who operates it:** travel agent / tour operator.
**Who reads the output:** that agent's client (the traveller).

**Job to be done:** turn trip details into a colourful, shareable digital
brochure that is *also* genuinely useful as practical guidance while the
client is travelling.

**This is a brochure and a guide, not a quotation and not a product
listing.** Two constraints follow, and they are the spine of this document:

- Per D7 there is **no pricing anywhere**. Price is negotiated separately by
  the agent.
- Per D14 the output must **carry real guidance value, not reproduce an OTA
  product page**. §6 defines what that means concretely and makes it
  enforceable rather than aspirational.

**Explicitly NOT this product's job:** price quotation, booking or payment
handling, contracts and terms, invoicing, availability checking,
seat/room reservation, review scores, or "book now" mechanics.

---

## 2. Relationship to the other products in this repo

This is the **sixth** product and the **first** whose output is not a DOCX.

| | Other five (SWOT, BMC, Business Plan, Website Research, Web Scoping) | This one |
|---|---|---|
| Renderer | docxtemplater + `.docx` template | HTML + CSS → PDF via Playwright |
| Primary artifact | DOCX file | HTML page (link), PDF derived |
| Visual ambition | clean business document | colourful visual brochure |
| Reader | business owner / client | traveller, often on a phone, mid-trip |

The DOCX toolchain (`postprocess-docx.js`, `tcMar` padding work, OOXML
surgery) is **not reused here** and its conventions do not apply.

---

## 3. Recorded Decisions

Confirmed by the user via structured questions on 2026-08-27. Binding for all
CPs unless a revision plan changes them.

| # | Decision | Rationale |
|---|---|---|
| D1 | **Travel agent / tour operator** operates it; their client reads the output. | Consistent with the rest of this repo: tools for freelancers and small operators to produce client-facing documents. |
| D2 | **HTML + PDF.** HTML is the single source; PDF is derived from it. | The HTML has to be built anyway to produce the PDF, so the shareable link is nearly free. Agents still need a PDF to attach to email/WhatsApp. |
| D3 | **Stock photo API (Unsplash / Pexels)** for imagery, under the strict constraints in §7. | User's choice, made after the wrong-location risk was flagged. §7 exists to make that choice safe rather than to revisit it. |
| D4 | **Hybrid data sourcing:** web search verifies high-risk named venues; model knowledge handles narrative, structure, and cultural guidance. | Verifying everything is slow and wasteful; verifying nothing ships fictional restaurants. Split by risk category (§8). |
| D5 | **Hosted on the n8n server behind an unguessable token, with a long lifetime (6–12 months).** | The 24-hour expiry pattern from Website Research Engine is *actively wrong* here — the traveller needs this link open during the trip, weeks or months after generation. |
| D6 | **`multi_day` mode supports 2–14 days.** Days 1–7 get full detail; days 8–14 may condense similar consecutive days into a range. | Prevents the document re-inflating into a 40-page monster — the exact failure just corrected in Website Research Engine. Applies to `multi_day` only; other modes are bounded by their own nature (§4). |
| D7 | **No pricing anywhere.** No package price, no per-item cost, no currency values at all. | The product is a digital brochure and guide, not a quotation. Also removes the risk of an AI-invented figure becoming a commitment. |
| D8 | **Verification scope: high-risk categories only,** batched at one search per block rather than per venue. | A 7-day trip costs roughly 7 searches + 3 AI calls instead of 20+ searches. |
| D13 | **Four trip modes in one product:** `half_day`, `full_day`, `multi_day`, `destination_guide` (§4). | The modes share the machinery (form, photo strategy, verification, palette, HTML/PDF pipeline, delivery) while keeping their data shapes cleanly separated. This is the opposite of the Website Research Engine tangle, where two products shared *content ambition*; here they share only *infrastructure*. |
| D14 | **No cap on spot or activity count. Instead, a quality floor (§6):** every entry must carry genuine guidance value. Content that reads like an OTA product listing is rejected. | User's framing, and a better rule than an arbitrary number. Applies product-wide, not just to `destination_guide`. |

### 3.1 Decisions taken by the assistant and recorded for confirmation

| # | Decision | Rationale |
|---|---|---|
| D9 | **Email goes to the agent, not directly to the client.** | Given the photo and accuracy risks, unreviewed AI content must not reach a paying client. The agent reviews, then forwards. |
| D10 | **Output language follows the input language.** | Same behaviour as the other five products. |
| D11 | **Never state specific opening hours or ticket prices.** | The two facts models get wrong most often, and the two whose wrongness most directly harms a traveller standing at a locked gate. |
| D12 | **Vertical connected timeline** is the reading of the user's "alur itinerary dari bawah ke atas". | Stated to the user and not corrected. Recorded so a later reader knows it was an interpretation, not a verbatim requirement. |
| D15 | **When spot/activity count grows large, group rather than thin.** | Direct consequence of D14: unlimited count and a quality floor can only coexist if structure absorbs the scale (§4.4). |

---

## 4. Trip Modes (D13)

The real fork in this product is **not how many days**. It is
**time-ordered versus place-ordered**.

- **Time-ordered family** (`half_day`, `full_day`, `multi_day`) — the same
  structure at three scales. Unit is a time block. Populates `schedule[]`.
- **Place-ordered family** (`destination_guide`) — a genuinely different
  document. Unit is a place. No times, no committed sequence.
  Populates `spots[]`.

`destination_guide` is **not "the timeline with times removed"**. It answers
different questions: what is here, why it matters, how long to spend, when
to come, how to get there.

### 4.1 Mode matrix

| Mode | Unit | Block label | Times | Accommodation | Layout |
|---|---|---|---|---|---|
| `half_day` | time block | — | ✓ | — | compact timeline |
| `full_day` | time block | — | ✓ | — | continuous timeline |
| `multi_day` (2–14) | day | "Hari 1", "Hari 2" | ✓ | ✓ | timeline + day markers |
| `destination_guide` | place | — | **—** | — | **card grid, not a timeline** |

**Exactly one** of `schedule[]` / `spots[]` is ever populated. Never both,
never neither. The QA gate enforces this (§9.4).

### 4.2 Mode-aware section requests

Sections are **not requested from the model at all** when the mode does not
need them. This is stronger than "empty array hides the section" — it avoids
spending tokens generating a fourteen-day packing list for a four-hour tour,
and stops the QA gate demanding fields that were never appropriate.

| Section | `half_day` | `full_day` | `multi_day` | `destination_guide` |
|---|---|---|---|---|
| Hero | ✓ | ✓ | ✓ | ✓ |
| Overview summary | ✓ short | ✓ | ✓ | ✓ |
| Quick facts | ✓ reduced | ✓ | ✓ | ✓ |
| Route summary | — | ✓ | ✓ | optional |
| Highlights | 2–3 | 3–5 | 3–5 | ✓ |
| Timeline (`schedule[]`) | ✓ compact | ✓ | ✓ + day markers | — |
| Spot cards (`spots[]`) | — | — | — | ✓ |
| Accommodation | — | — | ✓ | — |
| Meals included | optional | optional | ✓ | — |
| What to bring | minimal | day pack | full | general |
| Local tips | 2–3 | ✓ | ✓ | ✓ |
| Health & safety | — | optional | ✓ | optional |
| Emergency contacts | ✓ | ✓ | ✓ | ✓ |
| Closing | ✓ | ✓ | ✓ | ✓ |

### 4.3 Expected document length

| Mode | Pages |
|---|---|
| `half_day` | 2–3 |
| `full_day` | 3–5 |
| `multi_day` (7 days) | 8–12 |
| `multi_day` (14 days) | 12–18 (with condensing, D6) |
| `destination_guide` | 4–8 flat; more when grouped (§4.4) |

### 4.4 Scaling by grouping, not thinning (D15)

There is no product cap on spot or activity count (D14). But token budget is
finite, so more entries would ordinarily mean less depth each — which
collides with the §6 quality floor. Structure resolves the tension:

- **1–8 spots:** flat list, full depth per spot.
- **9+ spots:** group by area or theme. The **group introduction carries the
  narrative and guidance** ("why this region rewards a slow morning"), and
  each spot within it keeps its practical essentials. Guidance value is
  preserved at scale because it moves up a level rather than evaporating.

If a request would exceed what the token budget can serve at the quality
floor even after grouping, **fail with a clear message** rather than
silently shipping thin content.

---

## 5. Output Document Structure

Applies per the §4.2 matrix.

### 5.1 Hero
Full-width destination photo with overlay: trip title, destination, scope
label, dates, traveller count, agency name/logo. Falls back to a themed
gradient when no confident photo is available (§7).

### 5.2 Overview
Trip summary (2–3 sentences) · quick-facts strip · route summary
(`Denpasar → Ubud → Sidemen`) · 3–5 highlights with icons.

### 5.3 Time-ordered body — `schedule[]` (D12)
A connecting vertical line with a marker per block. Each block card carries:

- Block label (multi_day only), date, title/theme, location
- Activities in time order: time label, type icon, title, description,
  optional duration
- Accommodation for that night (`multi_day` only; named only if verified)
- Meals included · transport notes · one practical tip

Activity `type` drives the icon: `transport`, `sightseeing`, `food`,
`activity`, `rest`, `accommodation`, `free`.

For `multi_day` 8–14 days, consecutive similar days may collapse into one
card with a range label (e.g. "Hari 6–7 · Bebas di Ubud") per D6.

### 5.4 Place-ordered body — `spots[]`
A card grid, not a timeline. Each spot card carries name, area, category,
description, suggested visit duration, best time to visit, how to get there,
and at least one actionable tip. Grouped by area or theme when count is high
(§4.4).

### 5.5 Practical information
Weighted heavily — this is the "guide" half of the product. Included / not
included · what to bring · local tips (currency, tipping, dress code,
connectivity, local transport, etiquette) · health and safety · emergency
contacts. Scope varies by mode (§4.2).

### 5.6 Closing
Closing note, agency contact, the verification disclaimer required by D11,
and photo credits (§7.6 — licensing requirement, not optional).

---

## 6. The Brochure-and-Guidance Standard (D14)

The failure mode this section exists to prevent: producing something that
looks like an OTA product page — thin, transactional, a listing — instead of
a brochure that guides someone.

### 6.1 Forbidden — OTA product-page tells

Rejected by the QA gate wherever they appear:

- Any price, "mulai dari", or currency value (already D7)
- Per-spot "book now" / booking call-to-action
- Star ratings, review scores, review counts ("4.8 · 2,341 ulasan")
- Availability or scarcity claims ("sisa 3 slot", "hampir penuh")
- Bare feature checklists standing in for explanation
  ("✓ Hotel pickup ✓ Lunch included") with no surrounding guidance
- Superlative marketing filler carrying no information
  ("pengalaman tak terlupakan!", "wajib dikunjungi!")

### 6.2 Required — what makes it guidance

Every activity and every spot must carry at least the first item, and spots
must carry all four:

1. **Why it matters / what is distinct about it** — not a label, a reason.
2. **Practical logistics** — how to get there, how long to spend, when to go.
3. **Honest caveats where they exist** — crowded at sunset, slippery after
   rain, modest dress required, steep walk.
4. **Context** — what is nearby, what pairs well with it.

### 6.3 Quality floor (enforced, §9.4)

- Spot `description`: substantive prose about the actual experience,
  roughly 40–90 words. A name plus an adjective fails.
- Spot `suggestedDuration`, `bestTimeToVisit`, `gettingThere`: all required.
- At least one **actionable** tip per spot. "Bawa kamera" is not actionable.
- Activity `description`: must explain or orient, not restate the title.

An entry that cannot meet the floor should be **omitted or merged**, not
padded.

---

## 7. Photo Strategy and Its Constraints (D3)

Stock photo search can return an image of the wrong place — searching
"Sidemen Bali" can surface a rice terrace in Vietnam. In a brochure a paying
client receives, that is embarrassing at best and misleading at worst. These
are requirements, not guidelines:

1. **Destination and region level only. Never venue level.** A hero image
   captioned "Bali" for a Bali trip is decorative and low-risk. An image
   presented as a specific named restaurant that is actually a different
   restaurant is a false claim. Per-activity photos are forbidden — use type
   icons instead. **Spot cards in `destination_guide` may use a
   region-level image or an icon, never a claimed photo of that exact
   venue.**
2. **No captions asserting a specific place.** Imagery stays decorative,
   never documentary.
3. **Prefer well-known landmark queries over small place names.**
   "Ubud rice terrace" is far safer than "Sidemen".
4. **Fall back to a themed gradient, never to a low-confidence photo.**
   No image beats a wrong image.
5. **Optional `heroPhotoUrl` form field.** If the agent supplies their own
   photo — ideally from the actual trip — it overrides search entirely.
   Cheapest and most effective mitigation available.
6. **Attribution is mandatory.** Unsplash requires photographer credit with
   links and requires triggering its download endpoint when a photo is used;
   Pexels requires/strongly expects credit. This is a commercial document
   sent to a paying client, so credits appear in the closing section and the
   provider's usage requirements must be honoured.

---

## 8. Data Sourcing: What Gets Verified (D4, D8)

Web search verifies **named entities**. Model knowledge handles **narrative,
sequencing, and cultural guidance**. Split by how likely the fact is to be
wrong or stale:

| Information | Risk | Treatment |
|---|---|---|
| Major landmarks (temples, national parks, famous beaches) | Low — they do not move or close | Model knowledge sufficient |
| **Named restaurants / cafés / warungs** | **High — most frequent closures** | Verify, or genericise |
| Specifically named hotels | Medium | Verify when named |
| Small spas / tour operators / shops | High | Verify, or genericise |
| **Opening hours, ticket prices** | **Very high** | Never state them (D11) |
| **Travel time between points** | **High — models are consistently optimistic** | Deterministic guard (§9.3) |
| Destination character, cultural tips, best season, packing advice | Low | Model knowledge sufficient |

"Genericise" means replacing an unverified specific name with an honest
generic: *"makan siang di warung lokal sekitar Ubud"* rather than inventing
a restaurant that may not exist.

Verification is **batched one search per block** (D8).

**Mode note:** in `destination_guide` the spots *are* the named entities and
they are the entire point, so verification load is proportionally higher
there than in scheduled modes. Budget for it.

---

## 9. Pipeline Architecture

```text
Form Trigger
  -> Validate and Normalize Input        (resolves tripScope -> mode)
  -> Derive Palette                      (deterministic, from destinationType)
  -> AI Stage A: Interpret Brief         -> trip frame + destinationType + mode confirm
  -> AI Stage B: Body Skeleton           -> schedule[] OR spots[] per mode
  -> Collect High-Risk Venues            (deterministic filter, §8)
  -> Verify Venues                       (batched web search, 1 per block)
  -> Reconcile Verification              (deterministic: drop or genericise)
  -> Travel-Time Guard                   (scheduled modes only; bounded repair)
  -> AI Stage C: Final Copy              -> polished copy, verified places only
  -> Acquire Photos                      (hero + region level; gradient fallback; attribution)
  -> Assemble canonicalItinerary
  -> QA Gate                             (mode-aware, fail closed)
  -> Render HTML                         (shared shell + mode layout)
  -> Render PDF                          (Playwright, printBackground: true)
  -> Publish Link + Email Agent          (token, long-lived per D5; PDF attached)
```

Three AI calls plus N batched searches.

### 9.1 Mandatory reliability patterns

Every one of these is a bug already hit and fixed elsewhere in this
repository. They are requirements.

1. **Re-anchor after every HTTP Request node.** n8n `httpRequest` replaces
   the whole item `json`; recover context via
   `$('Build <Stage> Request').first().json`.
2. **Take the LAST `type: 'message'` output item** — multi-turn responses
   emit several; only the final one holds the answer.
3. **Strip markdown code fences** before `JSON.parse`, with a brace-scan
   fallback.
4. **Enumerate every required output key in the prompt.** Omitting the key
   list makes the model invent its own field names.
5. **A dedicated failure branch per AI call**, each with a distinct code.
6. **Fail closed at the QA gate.**
7. **No secrets in workflow JSON** — credentials by name only.
8. **Use `$execution.id`, never `Date.now()`,** in temp file names.
9. **Validation guards must match patterns, not bare words.** Learned the
   hard way in Web Project Scoping Engine: a word-list ban on
   `price`/`budget` rejected almost every valid AI output, because a café's
   own menu pricing and a legitimate client question both contain those
   words. Match an actual monetary figure (currency symbol or code adjacent
   to a digit) instead. **This applies with extra force here**, where the
   subject matter is restaurants and markets.

### 9.2 Mode resolution

`tripScope` from the form is the single source of truth (§12). `durationDays`
is read **only** when `tripScope = multi_day`; for the other modes it is
forced to 1 (or null for `destination_guide`) rather than trusted. Two
separate fields that can contradict each other are not permitted.

### 9.2a Guide-Ordered Route Anchors (`routePlan`, CP014)

When the guide provides `routePlan` (§12.1), it is parsed deterministically —
no AI — into `routePlanOrdered: [{ blockNumber, anchors[] }]` before CP002/CP003
run. Mode-aware acceptance:

| Mode | Day labels present | Day labels absent |
|---|---|---|
| `half_day`, `full_day` | Only `Hari 1` accepted | Accepted — whole input becomes block 1 |
| `multi_day` | Accepted | **Rejected** — `ROUTE_PLAN_MISSING_DAY_LABELS` |
| `destination_guide` | **Rejected** — `ROUTE_PLAN_DAY_LABELS_NOT_APPLICABLE` | Accepted — sets `spots[]` order |

Other fail-closed parse checks, each its own code: day numbers not a
contiguous `1..N` sequence (`ROUTE_PLAN_DAY_SEQUENCE_INVALID`), more days than
`durationDays` (`ROUTE_PLAN_EXCEEDS_DURATION` — fewer is fine, the model plans
the remaining days), more than 12 anchors in one day or 60 total
(`ROUTE_PLAN_TOO_MANY_ANCHORS`), and nothing left to parse
(`ROUTE_PLAN_EMPTY_AFTER_PARSE`). Leaving `routePlan` empty reproduces prior
behaviour exactly — nothing about this section changes when it is unused.

CP003's skeleton prompt then treats the anchors as a **fixed ordered spine**:
it may insert filler activities between anchors, but may not reorder an
anchor, move it to a different block, or drop it. The Travel-Time Guard
(§9.3) remains authoritative on feasibility — it may still fail a guide's
route if it is physically impossible, and nothing in this pipeline is allowed
to silently reorder a guide's anchors to make an infeasible route pass.

The QA Gate (§9.4) then verifies, deterministically, that the final
`schedule[]` (or `spots[]` for `destination_guide`) actually reproduces the
given anchors, in order, in the given block. Matching is **normalised, not
exact-string** — lowercased, diacritics and punctuation stripped, common
locality stopwords removed, matched by token overlap and containment. A
legitimate output that renders "Tegallalang Rice Terraces" as "Terasering
Tegallalang" under `outputLanguage: id` must be **accepted**; exact-string
matching would over-block valid runs, which is the failure mode this
normalisation exists to prevent (the same class of bug that shipped in
`web-scoping-engine`'s money-word guard before it was caught).

This section deliberately introduces no coordinate or geodata dependency —
see the `TODOS.md` follow-up for the case where `routePlan` is left empty.

### 9.3 Travel-Time Guard (deterministic, scheduled modes only)

The single most common way an AI itinerary becomes unusable: it will happily
schedule `Ubud → Nusa Penida → Uluwatu` in one day, when Nusa Penida alone
requires a boat crossing and most of a day.

**Thresholds are per-mode** — this is easy to get wrong. A "half day" tour
containing ten hours of activity would pass a generic 11-hour cap while no
longer being a half-day tour at all:

| Mode | Max active hours |
|---|---|
| `half_day` | 6 |
| `full_day` | 11 |
| `multi_day` | 11 per day |
| `destination_guide` | not applicable (no schedule) |

Other checks:
- **Hard rules table per destination** — island hop = minimum half day;
  Nusa Penida = full day.
- **Realistic speed by mode and region** — Bali road travel is roughly
  25–30 km/h in practice, not 60. Do not use generic highway speeds.
- Coordinate-based distance check where coordinates are available.
- For `destination_guide`, no schedule to validate, but still sanity-check
  that grouped spots are not geographically absurd together.

On failure: return that specific block to the model for repair, bounded to a
small retry cap, then fail closed rather than shipping an impossible
schedule.

### 9.4 QA Gate (mode-aware, fail closed)

**Structural**
- Exactly one of `schedule[]` / `spots[]` populated (§4.1)
- `multi_day`: block count reconciles with `durationDays`, accounting for
  condensed ranges (D6); accommodation present per night
- `half_day` / `full_day`: exactly one block; accommodation not required
- `destination_guide`: `spots[]` non-empty; **no time value anywhere**
- No block with zero activities (scheduled modes)
- Every enum value inside §11.1

**Quality floor (§6.3)**
- Spot descriptions meet the substance floor; required spot fields present
- At least one actionable tip per spot
- Activity descriptions do not merely restate their titles

**Forbidden content**
- Any monetary figure anywhere (D7) — matched as a **pattern** per §9.1.9
- Any specific opening-hours or ticket-price claim (D11)
- Any §6.1 OTA product-page tell
- `undefined`, `null`, `[object Object]`, unresolved template placeholder

**Integrity**
- Travel-Time Guard passed (scheduled modes)
- Every photo used carries attribution (§7.6)
- Every named high-risk venue is in the verified set (§8)
- When `routePlan` was provided (§9.2a): every anchor appears, in its given
  block, in the given order — normalised matching, fail closed on
  `ROUTE_ANCHOR_MISSING` / `ROUTE_ANCHOR_OUT_OF_ORDER` / `ROUTE_ANCHOR_WRONG_BLOCK`

---

## 10. Visual System

### 10.1 Palette derived deterministically from `destinationType`

Chosen in code, not by the model, so the same destination type always looks
consistent. One template that still feels designed per trip.

| `destinationType` | Direction |
|---|---|
| `beach` | teal + coral + sand |
| `mountain` | deep green + slate + warm cream |
| `city` | indigo + amber + light grey |
| `cultural` | terracotta + deep brown + cream |
| `nature` | forest green + lime + off-white |
| `desert` | burnt orange + ochre + sand |
| `mixed` | neutral navy + warm accent |

Each palette supplies `primary`, `secondary`, `accent`, `surface`,
`textDark`, `textMuted`, and gradient stops.

### 10.2 Two layout families, one shell

Hero, overview, practical information, and closing are **shared** across all
modes. Only the body differs:

- **Scheduled layout** — vertical connected timeline (§5.3). Day markers
  appear for `multi_day` only; `half_day`/`full_day` render one continuous
  timeline with no block header.
- **Guide layout** — card grid (§5.4), optionally grouped by area/theme
  (§4.4). Not a timeline with the times stripped out.

### 10.3 Rendering requirements

- **`printBackground: true`** on the Playwright PDF call. Without it every
  background colour and gradient silently disappears — the classic failure
  for a document whose entire point is being colourful.
- **`break-inside: avoid`** on block and spot cards.
- Explicit `@page` margins.
- **Self-contained HTML** — inline CSS, inline SVG icons. The shareable link
  and the PDF must both render correctly without external CSS or icon-font
  CDNs.
- Fonts: base64-embed at most one display font for headings; system sans
  stack for body. Avoids both licensing questions and load failure during
  PDF render.
- **Mobile-first.** The traveller reads this on a phone during the trip
  (D5), so the phone view is the primary view, not an afterthought.

---

## 11. Data Contract — `canonicalItinerary`

Arrays are loop-bearing. **No field anywhere carries a price** (D7).

```text
brochure
  agencyName, agencyLogoUrl?, agencyContact
  tripTitle, destination, region?, country
  itineraryMode        half_day | full_day | multi_day | destination_guide
  durationDays?        multi_day only (2-14)
  scopeLabel           human-readable, e.g. "Setengah hari", "7 hari"
  startDate?, endDate?, travelerCount?, travelerType?
  paceLevel            Relaxed | Balanced | Packed
  themes[]
  destinationType      beach | mountain | city | cultural | nature | desert | mixed
  generatedDate, outputLanguage

hero
  photoUrl?, photoAttribution? { photographer, photographerUrl, source }
  gradientOnly         true when no confident photo (§7.4)

overview
  summary
  quickFacts           { scope, bestSeason, pace, themes }
  routeSummary[]
  highlights[]         { icon, title, note }

schedule[]             scheduled modes only; empty for destination_guide
  blockNumber?, blockLabel?          blockLabel null for half_day/full_day
  blockRangeLabel?, date?, title, location
  isCondensed          bool (D6, multi_day only)
  photoUrl?, photoAttribution?       region level only (§7.1)
  activities[]         { timeLabel, type, title, description, durationLabel? }
  accommodation?       { name?, area, note }     multi_day only; name if verified
  mealsIncluded[]
  transportNote?
  blockTip?

spots[]                destination_guide only; empty for scheduled modes
  groupLabel?          set when grouped (§4.4)
  name, area, category
  description          40-90 words, substance floor (§6.3)
  suggestedDuration, bestTimeToVisit, gettingThere
  tips[]               at least one actionable (§6.3)
  nearbyPairing?       context requirement (§6.2.4)
  photoUrl?, photoAttribution?       region level or icon only (§7.1)

practical
  included[], notIncluded[], whatToBring[]
  localTips[]          { topic, note }
  healthSafety[]
  emergencyContacts[]  { label, value }

closing
  closingNote, agencyContact, disclaimer
  photoCredits[]       { photographer, photographerUrl, source }
```

### 11.1 Controlled vocabulary

| Field | Allowed values |
|---|---|
| `itineraryMode` | `half_day`, `full_day`, `multi_day`, `destination_guide` |
| `activities[].type` | `transport`, `sightseeing`, `food`, `activity`, `rest`, `accommodation`, `free` |
| `paceLevel` | `Relaxed`, `Balanced`, `Packed` |
| `destinationType` | `beach`, `mountain`, `city`, `cultural`, `nature`, `desert`, `mixed` |

---

## 12. Input Contract (Form)

| Field | Required | Notes |
|---|---|---|
| `agencyName` | yes | shown in hero and closing |
| `agencyContact` | yes | email / WhatsApp shown in the brochure |
| `agencyLogoUrl` | no | |
| `destination` | yes | |
| **`tripScope`** | **yes** | **single source of truth (§9.2):** `half_day` / `full_day` / `multi_day` / `destination_guide` |
| `durationDays` | conditional | required and read **only** when `tripScope = multi_day`; 2–14 (D6) |
| `tripTitle` | no | generated when omitted |
| `startDate` | no | enables real dates on block cards |
| `travelerCount` | no | |
| `travelerType` | no | couple / family / solo / group / honeymoon |
| `pace` | no | relaxed / balanced / packed, default balanced |
| `themes` | no | free text, e.g. "kuliner, budaya, pantai" |
| `mustInclude` | no | places the client specifically asked for |
| `mustAvoid` | no | e.g. "tidak mau hiking berat" |
| `accommodationNote` | no | hotels already booked, if any (`multi_day`) |
| `heroPhotoUrl` | no | §7.5 — overrides photo search entirely |
| `outputLanguage` | no | `auto` (default, D10) / `id` / `en` |
| `recipientEmail` | yes | **the agent's** address, per D9 |
| `routePlan` | no | the guide's own visiting order, per day (§9.2a) |

All fields length-capped at validation time, following the `LIMITS` pattern
used elsewhere in this repo.

### 12.1 `routePlan` — guide-ordered route anchors (§9.2a)

The guide who fills the form usually already knows the real route on the
ground. `routePlan` lets them state it directly instead of the model guessing
geography from scratch — and instead of adding an external geodata API. See
§9.2a for the parsing and enforcement contract.

Format, one line per day when day boundaries matter:

```text
Hari 1: Tegallalang Rice Terraces, Warung lokal Ubud
Hari 2: Uluwatu Temple, Pantai Padang-Padang
```

`Hari N:` or `Day N:` (case-insensitive). A bare comma-separated list with no
day marker is also accepted for `half_day`, `full_day`, and
`destination_guide`, where day boundaries do not apply.

---

## 13. Verification Requirements

Format-affecting CPs require **rendered visual verification**, not code
inspection alone:

1. Generate HTML from real pipeline output.
2. Render at phone width and desktop width.
3. Generate the PDF and confirm backgrounds/gradients survived (the
   `printBackground` trap).
4. Confirm no block or spot card splits across a page break.
5. Confirm no unresolved placeholder, no `undefined`, no empty section shell.

Additional required checks:

- **All four modes** produce a coherent document (D13).
- **D7:** no monetary value anywhere in HTML or PDF.
- **D11:** no specific opening hours or ticket prices.
- **D14 / §6:** no OTA product-page tell; quality floor holds.
- **§9.1.9 regression guard:** a fixture containing the word "harga" with no
  figure must be **accepted** — the Web Scoping Engine over-blocking bug
  must not recur here.
- **§7:** every photo carries attribution; no per-activity photo; no caption
  asserting a specific venue.
- **D6:** a 14-day trip stays within a sane page count via condensing.
- **§9.3:** an impossible-itinerary fixture is caught and repaired or
  rejected — never shipped. A 10-hour `half_day` fixture is rejected.
- **§4.4:** a high-spot-count `destination_guide` groups rather than thins.
- **D5:** the published link still resolves well beyond 24 hours.
- **D10:** an Indonesian submission produces an Indonesian brochure.

---

## 14. Out of Scope

- Pricing, quotations, invoicing, payment, currency of any kind (D7).
- Booking, availability checking, seat/room reservation, "book now" (D14).
- Review scores, ratings, or social proof metrics (§6.1).
- Contracts, terms and conditions, cancellation policy.
- Flight search or flight status.
- Live weather or live traffic.
- Real-time collaboration or client-side editing.
- Multi-currency or multi-language output in a single document.
- Any modification to the other five products in this repository.
