# CP002 Implementation Plan: Brief Interpretation and Mode Resolution

## Objective

Extend the inactive foundation workflow with the smallest AI stage that turns
normalized intake into a structured trip frame while preserving `tripScope` as
the authoritative itinerary mode.

## Clarifications and Decisions

- The user delegated the palette-order conflict to the best technical choice.
- Keep CP001 `Derive Palette` as the initial fallback and deterministically
  re-derive the palette after Stage A produces `destinationType`.
- The model may confirm the mode in `modeConfirm`, but code always overwrites
  any disagreement with the already-normalized `itineraryMode`.
- Reuse the existing named OpenRouter credential; store no credential value.

## Scope

- Add `Build Brief Request`, the Stage A HTTP call, `Parse Brief Result`, a
  result branch, a distinct failure result, deterministic palette refresh, and
  a CP003 handoff.
- Enumerate every required Stage A key and controlled vocabulary in the prompt.
- Implement re-anchoring, final-message selection, fence stripping, brace-scan
  fallback, enum validation, and bounded output fields.
- Produce `destinationType`, `paceLevel`, `themes`, `tripTitle`, `region`, and
  `country` in the resolved output language.

## Out of Scope

- Schedule or spot generation, venue verification, travel-time guards, final
  copy, photos, rendering, publishing, email, or workflow activation.

## Current-State Findings

- CP001 is completed with its matching completion log.
- Workflow `GRuSSwnW38U1HNgK` is inactive and ends at `Derive Palette`.
- The connected n8n instance already has a named OpenRouter HTTP-header
  credential used by sibling workflows; no secret needs to enter workflow JSON.

## Proposed Changes

1. Connect CP001 palette output to `Build Brief Request`.
2. Call the Responses endpoint with a low-temperature structured prompt.
3. Parse only the last message item and validate every requested key.
4. Fail with `BRIEF_INTERPRETATION_FAILED` through a dedicated branch.
5. Preserve resolved mode/duration, normalize Stage A enums, refresh palette,
   and emit a deterministic CP003 handoff.

## Data Flow or Control Flow

```text
Derive Palette -> Build Brief Request -> AI Brief - GPT OSS 120B
  -> Parse Brief Result -> Brief Result Valid?
       true  -> Re-Derive Palette -> Prepare CP003 Handoff
       false -> Handle Brief Call Failure
```

Unexpected node errors route to the existing fail-closed foundation handler.

## Files and n8n Workflows Affected

- Add this plan.
- Update workflow `GRuSSwnW38U1HNgK` only.
- Update CP002 status/checklist in `TODOS.md` and create its completion log only
  after successful verification.

## Security and Failure Handling

- Reference the existing n8n credential by ID/name only.
- Use a 30-second request timeout and no retry loop in this small stage.
- Never trust model output for mode, duration, or controlled vocabulary.
- Bound diagnostic text and fail closed with a distinct CP002 error code.

## Verification Plan

- Validate the completed workflow with 0 runtime errors/warnings.
- Fixture-test final-message selection, fenced JSON, brace-scan fallback,
  invalid enums, mode-conflict resistance, palette refresh, and Indonesian
  output values.
- Confirm all required output keys, credential reference, inactive state, and
  unchanged successful-execution retention.

## Acceptance Criteria

- Stage A outputs all six required trip-frame fields with valid enums.
- The model cannot override `itineraryMode` or `durationDays`.
- Parsing implements every SPEC §9.1 reliability pattern applicable to Stage A.
- Failure uses `BRIEF_INTERPRETATION_FAILED`.
- Palette follows the accepted `destinationType` without another AI call.
- Workflow remains inactive and contains no secret literal or CP003 behavior.

## Risks and Rollback

- Model response shapes may vary; support Responses output and the compatible
  choices fallback, then fail closed.
- Roll back by removing only the CP002 nodes/connections and restoring the
  CP001 terminal connection; do not modify CP001 files or other workflows.
