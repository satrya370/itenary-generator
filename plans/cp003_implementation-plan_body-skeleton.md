# CP003 Implementation Plan: Body Skeleton

## Objective

Extend the inactive itinerary workflow with one mode-aware skeleton stage that
produces exactly one valid body shape: `schedule[]` for scheduled modes or
`spots[]` for `destination_guide`.

## Clarifications and Decisions

- The user selected option 1: one dynamic `Build Skeleton Request`, one AI
  call, and one mode-aware parser instead of duplicated scheduled/guide paths.
- The prompt changes its required schema and applicable sections before the
  request is sent; irrelevant sections are not requested.
- Use a 12,000-token output ceiling for the largest 14-day/grouped-guide shape.

## Scope

- Add dynamic request construction, one skeleton HTTP call, robust parsing,
  mode-aware structural checks, a validity branch, distinct failure handling,
  and a CP004 handoff.
- Enumerate all required schedule/activity or spot keys and controlled enums.
- Encode D6 condensing, §4.4 grouping, `mustInclude`/`mustAvoid`, D7, D11, and
  the §6 brochure-and-guidance standard in the prompt.
- Validate exactly one body array, scheduled block/activity basics, multi-day
  coverage, guide no-clock-time rules, and grouping for 9+ spots.

## Out of Scope

- Venue verification, travel-time feasibility/repair, final copy, canonical
  assembly, photos, QA gate, rendering, publishing, delivery, and activation.

## Current-State Findings

- CP001 and CP002 are completed with matching completion logs.
- Workflow `GRuSSwnW38U1HNgK` is inactive and terminates successfully at
  `Prepare CP003 Handoff`.
- The existing named OpenRouter credential can be reused without exposing its
  value.

## Proposed Changes

1. Build a scheduled or guide prompt from the authoritative mode.
2. Call the Responses endpoint once with a bounded timeout/output budget.
3. Re-anchor and parse the final message with fence and brace fallbacks.
4. Normalize bounded fields while enforcing mode-specific body invariants.
5. Route invalid output to `SKELETON_GENERATION_FAILED`; otherwise emit the
   accepted skeleton for CP004.

## Data Flow or Control Flow

```text
Prepare CP003 Handoff -> Build Skeleton Request -> AI Skeleton - GPT OSS 120B
  -> Parse Skeleton Result -> Skeleton Result Valid?
       true  -> Prepare CP004 Handoff
       false -> Handle Skeleton Call Failure
```

Unexpected Code-node failures use the shared fail-closed error handler.

## Files and n8n Workflows Affected

- Add this plan.
- Update workflow `GRuSSwnW38U1HNgK` only.
- Update CP003 status/checklist and add its completion log after verification.

## Security and Failure Handling

- Reference the existing n8n credential; never store its secret.
- Use a 45-second timeout, no unbounded retries, bounded raw diagnostics, and a
  distinct fail-closed code.
- Reject monetary figures by actual currency-plus-digit patterns, never by bare
  words. Legitimate prose containing “harga” remains acceptable.
- Do not trust model-controlled mode, activity enums, or body shape.

## Verification Plan

- Validate the workflow with 0 runtime errors/warnings and confirm inactivity.
- Execute exact saved Code-node sources against all four modes, a 14-day
  condensed fixture, a 12-spot grouped guide, both/neither-array failures,
  guide clock-time failure, invalid activity enum, monetary figure failure,
  and legitimate “harga” prose acceptance.
- Confirm prompt key enumeration, mode-specific requests, credential reference,
  timeout/token bounds, and unchanged success retention.

## Acceptance Criteria

- Scheduled modes populate only `schedule[]`; guide populates only `spots[]`.
- Half/full day have one block; multi-day coverage matches `durationDays` and
  trips over seven days include a condensed range.
- Guide outputs contain no clock time and 9+ spots are grouped, not thinned.
- Required keys/enums and §6/D7/D11 instructions are explicit.
- Parser implements applicable §9.1 reliability patterns and fails closed.
- Workflow remains inactive and no CP004+ behavior is implemented.

## Risks and Rollback

- Large output may truncate; 12,000 tokens is bounded but sized for the largest
  supported skeleton. Parsing fails closed on incomplete JSON.
- Model range labels may vary; accept Indonesian/English day labels only when
  numeric coverage can be deterministically extracted.
- Roll back by removing only CP003 nodes/connections and restoring CP002 as the
  terminal successful node.
