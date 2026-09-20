# CP005 Implementation Plan: Travel-Time Guard

## Objective

Add a deterministic, mode-aware travel-time guard that catches impossible
scheduled itineraries, provides a bounded repair request, and fails closed.

## Clarifications and Decisions

- The chapter decision keeps one shared dynamic path.
- Use the seeded Bali coordinates and 25–30 km/h road guidance from
  `config/travel-rules.json`.
- Repair attempts are capped at 2; no unbounded loop or automatic activation.

## Scope

- Add rules/guard, pass branch, bounded repair request/AI/parser/apply loop,
  and CP006 handoff.
- Enforce half-day 6h, full-day 11h, and multi-day 11h/day caps.
- Detect Nusa Penida/island-hop hard rules and coordinate-based route sanity.
- Skip active-hour checks for guide mode while checking grouped geographic
  plausibility.

## Out of Scope

- Venue verification, final copy, canonical assembly, photos, QA, rendering,
  publishing, delivery, and activation.

## Current-State Findings

- CP004 emits reconciled `schedule`/`spots`, `verifiedVenueSet`, and CP005
  handoff; workflow remains inactive.

## Proposed Changes

1. Guard each block using parsed duration hours, hard rules, coordinates, and
   per-mode caps.
2. Route violations through a request to the model with a 45-second timeout.
3. Parse a repaired schedule, increment attempts, and re-run the guard.
4. Fail with `TRAVEL_TIME_GUARD_FAILED` after two attempts.

## Data Flow or Control Flow

```text
CP005 Handoff -> Travel-Time Guard -> Guard Passed?
  true -> Prepare CP006 Handoff
  false -> Repair Attempts Available?
             true -> Build Travel-Time Repair Request -> AI Repair -> Parse Repair
                   -> Apply Travel-Time Repair -> Travel-Time Guard (bounded loop)
             false -> Handle Travel-Time Guard Failure
```

## Files and n8n Workflows Affected

- Add this plan and later CP005 completion log.
- Update workflow `GRuSSwnW38U1HNgK` and CP005 status/checklist only.

## Security and Failure Handling

- No map/API secret is embedded; repair uses the named OpenRouter credential.
- Guard and repair attempts are bounded and preserve verified-venue context.
- Repair parser accepts schedule data only and never changes authoritative mode.

## Verification Plan

- Validate graph with 0 runtime errors/warnings.
- Fixture-test impossible Ubud → Nusa Penida → Uluwatu, 10-hour half-day,
  reasonable itinerary, destination-guide skip/sanity, and loop termination.
- Confirm inactive state, timeout, credential reference, and success retention.

## Acceptance Criteria

- Per-mode caps and Bali hard rules catch impossible schedules.
- Coordinate/region checks use realistic speeds.
- Guide mode has no schedule cap; repair loop terminates at 2 and fails closed.
- A reasonable itinerary passes untouched.

## Risks and Rollback

- Coordinate data is a seed, not a live routing service; retain conservative
  failure behavior and expand seeds in a future follow-up.
- Roll back only CP005 nodes/connections and restore CP004 handoff terminal.
