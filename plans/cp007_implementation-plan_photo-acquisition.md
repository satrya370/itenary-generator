# CP007 Implementation Plan: Photo Acquisition

## Objective

Acquire a safe, attributed destination-level hero image for the canonical
itinerary, honoring an agent-supplied override and falling back to a themed
gradient whenever confidence is below the strict threshold.

## Clarifications and Decisions

- The Ask Question gate selected a strict confidence threshold of `0.80`.
- Use the configured Unsplash provider for landmark-biased region queries.
- Agent-supplied `heroPhotoUrl` overrides search; it is labeled as
  agent-supplied and never presented as a venue documentary image.

## Scope

- Add request builder, override branch, Unsplash search, parser/confidence gate,
  required download/usage trigger, gradient fallback, photo assembly, and CP008
  handoff.
- Carry attribution for every photo used; keep activity/venue-specific photos
  absent.

## Out of Scope

- Final QA, HTML/PDF rendering, publishing, delivery, activation, or modifying
  other products.

## Current-State Findings

- CP006 emits `canonicalItinerary` with `hero.gradientOnly=true` and no credits.
- `config.json` identifies Unsplash and the access-key environment variable but
  currently has no secret value.

## Proposed Changes

1. Build a region-level, landmark-biased query and confidence threshold.
2. Bypass search for `heroPhotoUrl` override.
3. Accept only attributed results at confidence ≥0.80.
4. Trigger provider usage/download endpoint for accepted Unsplash photos.
5. Otherwise assemble a gradient-only hero without failing the run.

## Data Flow or Control Flow

```text
CP006 Handoff -> Build Photo Request -> Photo Override Supplied?
  true  -> Assemble Photos
  false -> Acquire Hero Photo -> Parse Photo Result -> Confidence ≥ 0.80?
              true  -> Trigger Photo Usage Download -> Assemble Photos
              false -> Use Gradient Fallback -> Assemble Photos
  -> Prepare CP008 Handoff
```

## Files and n8n Workflows Affected

- Update `config/config.json` with the threshold.
- Add this plan and later CP007 completion log.
- Update workflow `GRuSSwnW38U1HNgK` only.

## Security and Failure Handling

- Reference `UNSPLASH_ACCESS_KEY` by environment expression only; no secret is
  embedded.
- Region-level queries only; never query or caption a named venue.
- Missing/low-confidence/failed photos degrade to gradient and preserve the
  itinerary. Missing attribution prevents photo use.

## Verification Plan

- Validate graph with 0 runtime errors/warnings.
- Fixture-test override bypass, high-confidence attribution, low-confidence
  gradient fallback, missing-attribution fallback, usage URL preparation, and
  no per-activity photo assignment.
- Confirm inactive state, threshold, credential hygiene, and CP008 handoff.

## Acceptance Criteria

- Override bypasses search; search queries remain destination/region-level.
- No photo below 0.80 is used; fallback is gradient-only.
- Every used photo carries photographer, photographer URL, and source.
- Unsplash download/usage trigger is prepared for accepted photos.
- No activity or named-venue photo is introduced.

## Risks and Rollback

- Provider confidence may be absent or stale; absence fails safe to gradient.
- Provider download failures do not fail the itinerary; attribution remains
  attached and downstream QA can decide whether to retain the image.
- Roll back only CP007 nodes/connections and restore CP006 handoff terminal.
