# CP001 Implementation Plan: Foundation and Input Intake

## Objective

Create the foundation for the Itinerary Brochure Engine: a new inactive n8n
intake workflow plus deterministic configuration artifacts for input limits,
trip modes, palettes, and travel rules. CP001 stops at normalized intake data;
AI interpretation, itinerary generation, rendering, and delivery remain later
checkpoints.

## Clarifications and Decisions

- The Ask Question gate selected option 1: one small monolithic workflow:
  `Form Trigger -> Validate and Normalize Input -> Derive Palette`.
- Configuration is stored as JSON files under `itinerary-engine/config/` and is
  treated as the source of truth for this foundation.
- `travel-rules.json` uses rules plus optional coordinates. It will include a
  Bali seed with per-mode active-hour caps, realistic regional speed guidance,
  and hard route rules; it will not call a map vendor in CP001.
- The workflow must remain inactive. CP001 does not activate it or perform
  live end-to-end testing.

## Scope

- Create the CP001 implementation plan and update CP001 status to `in_progress`
  only after this plan exists.
- Create `config/config.json` with schema version, model endpoint placeholders,
  photo provider configuration placeholders, and field limits.
- Create `config/itinerary-schema.json` representing the `canonicalItinerary`
  contract from SPEC.md §11 without prices.
- Create `config/palettes.json` with all seven deterministic destination-type
  palettes from SPEC.md §10.1.
- Create `config/travel-rules.json` with the selected rules-plus-coordinates
  shape and a minimum Bali seed.
- Create `config/mode-profiles.json` with the four mode section matrices,
  active-hour caps, and expected page ranges.
- Create a new inactive n8n workflow containing exactly these foundation nodes:
  `Scope Intake Form`, `Validate and Normalize Input`, and `Derive Palette`.
- Configure every input field from SPEC.md §12, including `tripScope` as the
  only mode source of truth.
- Normalize and length-cap all fields with a `LIMITS` object.
- Resolve mode, duration, scope label, pace, themes, and output language in the
  validation node. `durationDays` is read only for `multi_day`; other modes
  force a non-multi-day value.
- Derive palette deterministically from `destinationType` without an AI call.

## Out of Scope

- AI brief interpretation or any model call.
- Schedule/spot skeleton generation, venue verification, travel-time repair,
  final copy, photos, HTML, PDF, links, email, or delivery.
- Activation, live form testing, rendered visual verification, or completion log.
- Credentials, API keys, dependency installation, and changes to other product
  directories.
- Any word-list content guard. CP001 only uses structural validation and
  pattern-based field validation where needed.

## Current-State Findings

- `itinerary-engine/` currently contains the three governing Markdown files,
  the CP001 plan, and the log template; CP001 configuration files do not yet
  exist.
- CP001 is the first checkpoint and has no dependency CP.
- SPEC.md v2 defines four modes, the §12 input contract, seven palettes, the
  canonical itinerary shape, and Bali travel-time requirements, but does not
  define the JSON shapes for the configuration files.
- No itinerary workflow or itinerary-specific config artifacts currently exist
  in the repo or connected n8n instance.
- The five sibling product workflows consistently use descriptive Title Case
  node names, including `Scope Intake Form` and
  `Validate and Normalize Input`; CP001 follows that convention.
- Other product workflows exist elsewhere in the repository; they are
  reference-only and must not be modified.

## Proposed Changes

1. Add the five JSON configuration files under `config/`.
2. Build the new n8n workflow with one Form Trigger and two Code nodes.
3. Use the Form Trigger's `tripScope` field as the only mode input.
4. In `Validate and Normalize Input`:
   - map form labels/internal field names to canonical keys;
   - trim and cap fields using `LIMITS`;
   - reject missing required fields and invalid enum/date/email/URL values;
   - resolve `itineraryMode` from `tripScope`;
   - accept `durationDays` only for `multi_day` and enforce 2–14;
   - force `durationDays` to `null` for other modes;
   - derive `scopeLabel`, default pace, themes, and output language;
   - emit a distinct `ok: false` result for validation failures.
5. In `Derive Palette`, select the palette by the normalized
   `destinationType`, defaulting deterministically to `mixed` when the type is
   not supplied at CP001.
6. Leave the workflow inactive and without credentials or external calls.

## Data Flow or Control Flow

```text
Scope Intake Form
  -> Validate and Normalize Input
       -> normalized intake with itineraryMode, durationDays, scopeLabel,
          outputLanguage, and destinationType
  -> Derive Palette
       -> normalized intake plus paletteKey and palette
```

Validation failures return from `Validate and Normalize Input` with `ok:false`;
the palette node passes those failures through unchanged and performs no
derivation. There is no AI, network, file, or credential side effect in CP001.

## Files and n8n Workflows Affected

- Add `itinerary-engine/plans/cp001_implementation-plan_foundation-and-input-intake.md`.
- Add `itinerary-engine/config/config.json`.
- Add `itinerary-engine/config/itinerary-schema.json`.
- Add `itinerary-engine/config/palettes.json`.
- Add `itinerary-engine/config/travel-rules.json`.
- Add `itinerary-engine/config/mode-profiles.json`.
- Create one new n8n workflow named `Itinerary Brochure Engine - Foundation`
  and leave it inactive.
- Modify `itinerary-engine/TODOS.md` only to change CP001 from `pending` to
  `in_progress` after this plan is created and implementation begins.
- Do not modify any other product directory, workflow, credential, or log.

## Security and Failure Handling

- No secrets, API keys, tokens, or credential values are stored in JSON, plan,
  or workflow configuration.
- External model/photo endpoints are configuration placeholders only; CP001
  makes no external requests.
- Required fields, controlled vocabularies, bounded lengths, date syntax,
  email syntax, and URL schemes are validated before normalization is accepted.
- `tripScope` is authoritative; contradictory `durationDays` values are
  ignored for non-`multi_day` modes rather than trusted.
- Palette lookup is deterministic and has a safe `mixed` fallback.
- Validation returns a structured failure item rather than throwing for normal
  bad input. Unexpected Code-node errors remain subject to n8n runtime error
  handling.
- The workflow is inactive until later CPs complete their required review and
  testing.

## Verification Plan

The following is recorded for the later Review and Test phases and is not run
in this Working phase:

- Validate all five JSON files as valid JSON and check required keys against
  SPEC.md.
- Validate the new workflow with n8n strict validation and target zero errors
  and zero warnings.
- Verify all SPEC.md §12 fields exist on the form, including `tripScope`.
- Exercise each trip scope and confirm the resolved mode and scope label.
- Submit `half_day` with `durationDays=7` and confirm duration is null and no
  multi-day mode is produced.
- Submit `multi_day` with durations 1 and 15 and confirm rejection; submit 2
  and 14 and confirm acceptance.
- Confirm `Derive Palette` maps each destination type to the expected palette
  without an AI or HTTP node.
- Confirm the workflow remains inactive and no other product directory changes.

## Acceptance Criteria

- The implementation plan exists with all required RULES.md §5 sections.
- CP001 status is `in_progress` only after the plan exists.
- All five configuration files exist under `config/` and contain no secrets.
- A new workflow named `Itinerary Brochure Engine - Foundation` exists and is
  inactive.
- The workflow contains the three planned nodes and no AI/render/delivery
  nodes.
- The form includes every SPEC.md §12 field and uses `tripScope` as the sole
  mode source.
- Input limits and deterministic normalization are implemented.
- Non-multi-day inputs cannot produce a multi-day duration.
- Palette derivation is deterministic and independent of AI.
- No later checkpoint scope is implemented.

## Risks and Rollback

- Risk: n8n node type or form-version differences may produce validation
  warnings. Use the instance-supported Form Trigger version and adjust only
  CP001 fields without adding later-stage behavior.
- Risk: configuration shapes may need refinement for downstream CPs. Keep them
  explicit, versioned, and additive; later CPs can revise through a new plan.
- Risk: a malformed input mapping could silently drop form values. Preserve
  canonical and raw field mapping evidence and reject missing required values.
- Risk: accidental activation or unrelated workflow mutation. Verify workflow
  state and changed-workflow identity after creation.
- Rollback: delete the newly created foundation workflow and remove only the
  five CP001 config files and plan/status changes. Do not touch other products,
  workflows, credentials, or existing logs.
