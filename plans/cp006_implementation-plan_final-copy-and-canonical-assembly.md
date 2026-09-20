# CP006 Implementation Plan: Final Copy and Canonical Assembly

## Objective

Produce polished, mode-scoped overview/practical/closing copy from the
verified CP005 context and deterministically assemble the `canonicalItinerary`
contract for downstream photo and rendering checkpoints.

## Clarifications and Decisions

- The chapter Ask Question selected one shared dynamic path for CP004–CP006.
- The model writes only final copy sections; schedule/spot structure remains
  the reconciled CP004 skeleton and CP005-safe schedule.
- `hero.gradientOnly=true` is intentional until CP007 acquires attributed
  imagery.

## Scope

- Add final-copy request, AI call, robust parser, validity branch, distinct
  failure handler, deterministic canonical assembly, and CP007 handoff.
- Request and validate overview, practical, and closing keys by mode context.
- Reject monetary figures, opening-hour/ticket claims, and unverified venue
  names in final copy.

## Out of Scope

- New venue search, travel repair, photo acquisition, HTML/PDF rendering,
  publishing, delivery, activation, or QA beyond parser integrity checks.

## Current-State Findings

- CP005 emits a verified, travel-safe skeleton and `CP005_TRAVEL_TIME_SAFE`.
- The canonical schema and palettes already exist; CP007 will later fill photo
  fields and credits.

## Proposed Changes

1. Build a mode-aware final-copy prompt with every output key enumerated.
2. Call the configured model with verified/genericised places only.
3. Parse and validate final copy with §9.1 patterns and content guards.
4. Merge final copy with immutable brochure/schedule/spot context.

## Data Flow or Control Flow

```text
CP005 Handoff -> Build Final Copy Request -> AI Final Copy - GPT OSS 120B
  -> Parse Final Copy -> Final Copy Valid?
       true  -> Assemble canonicalItinerary -> Prepare CP007 Handoff
       false -> Handle Final Copy Failure
```

## Files and n8n Workflows Affected

- Add this plan and later CP006 completion log.
- Update workflow `GRuSSwnW38U1HNgK` and CP006 status/checklist only.

## Security and Failure Handling

- Reuse the named OpenRouter credential without writing its secret.
- Use a 45-second timeout and bounded diagnostics.
- Preserve CP004 verified set; reject final copy containing known unverified
  submitted names.
- Money detection matches currency/amount patterns, never bare words.

## Verification Plan

- Validate workflow with 0 runtime errors/warnings.
- Fixture-test all required section keys, Indonesian copy, malformed/fenced
  parsing, monetary/opening claims, unverified-name rejection, and canonical
  shape assembly for scheduled and guide modes.
- Confirm inactive state, photo gradient placeholder, and retention setting.

## Acceptance Criteria

- `overview`, `practical`, and `closing` are produced with mode-aware context.
- Canonical output merges the safe schedule/spots and preserves verified names.
- No monetary figure, opening-hour/ticket claim, or unverified venue survives.
- Canonical shape contains no photo claim before CP007 and is ready for handoff.

## Risks and Rollback

- Model may omit nested keys; parser fails closed rather than inventing copy.
- Final copy can be regenerated in CP006 without changing verified skeleton.
- Roll back only CP006 nodes/connections and restore CP005 handoff terminal.
