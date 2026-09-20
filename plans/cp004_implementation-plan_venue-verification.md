# CP004 Implementation Plan: Venue Verification

## Objective

Add one dynamic, mode-aware venue-verification path that batches high-risk
named entities by block/group and never silently preserves an unverified name.

## Clarifications and Decisions

- The chapter Ask Question selected one shared dynamic path for scheduled and
  guide modes.
- Scheduled blocks receive one search query per block; guide spots are grouped
  by `groupLabel` (or one batch when ungrouped).
- Named high-risk entities that are not verified are deterministicly
  genericised, not retained.

## Scope

- Add collector, batch request, search HTTP node, robust parser, validity branch,
  reconcile, failure handler, and CP005 handoff.
- Verify restaurants/cafes/warungs, named accommodation, spas/operators/shops,
  and all `destination_guide` spots; skip generic activities and landmarks.
- Preserve a `verifiedVenueSet` for downstream QA/final-copy checks.

## Out of Scope

- Travel feasibility/repair, final copy, canonical assembly, photos, QA,
  rendering, publishing, delivery, and activation.

## Current-State Findings

- CP003 emits a validated skeleton and `CP003_SKELETON_READY` handoff.
- `ITINERARY_SEARCH_BASE_URL` is the configured endpoint reference; no search
  secret is stored in workflow JSON.

## Proposed Changes

1. Collect high-risk candidates deterministically.
2. Build one query batch per scheduled block or guide group.
3. Parse provider responses using final-message/fence/brace fallbacks.
4. Reconcile verified names and genericise every unverified candidate.

## Data Flow or Control Flow

```text
CP003 Handoff -> Collect High-Risk Venues -> Build Verification Request
  -> Verify Venues -> Parse Verification Result -> Verification Result Valid?
       true  -> Reconcile Verification -> Prepare CP005 Handoff
       false -> Handle Verification Failure
```

## Files and n8n Workflows Affected

- Add this plan and later CP004 completion log.
- Update workflow `GRuSSwnW38U1HNgK` only.
- Update CP004 status/checklist in `TODOS.md` after the plan exists.

## Security and Failure Handling

- Use the configured endpoint expression and no credential literal.
- Batch and bound queries/results; use a 30-second timeout.
- Search failure is distinct and fail closed; a successful empty result still
  genericises candidates deterministically.
- No word-list monetary guard is introduced.

## Verification Plan

- Validate graph with 0 runtime errors/warnings.
- Fixture-test scheduled batching per block, guide grouping, landmark skipping,
  invented restaurant genericisation, verified-name retention, parser fallbacks,
  and distinct failure handling.
- Confirm inactive state, credential/secret hygiene, and CP005 handoff.

## Acceptance Criteria

- High-risk filter and batching follow §8/D8.
- Unverified names are genericised and recorded outside the verified set.
- Verified names remain intact; generic/major landmarks are not unnecessarily
  sent for verification.
- Parser follows applicable §9.1 patterns and failure is explicit.

## Risks and Rollback

- Provider response schemas differ; support direct `results` and JSON text
  envelopes, then fail closed on malformed transport responses.
- Roll back only CP004 nodes/connections and restore CP003 handoff terminal.
