# Itinerary Brochure Engine Execution Rules

## 1. Authority

- `SPEC.md` defines required behavior and acceptance criteria.
- `TODOS.md` defines CP order, status, and dependencies.
- `RULES.md` defines the mandatory execution process.
- If these files conflict, stop and use Ask Question to resolve the conflict before editing or implementation.

## 2. CP Identity

- Every checkpoint has one immutable unique ID: `CP001`, `CP002`, and so on.
- New work that produces a separately verifiable result receives a new CP ID.
- A revision to an existing CP reuses that CP ID.
- Never recycle, renumber, or silently merge CP IDs after work has started.
- One CP must produce one independently verifiable result.

## 3. Artifact Naming

All plan and log filenames use:

```text
[cp-id]_[action]_[object].md
```

Rules:

- CP ID is lowercase in filenames.
- Underscores separate ID, action, and object.
- Action and object use lowercase kebab-case.
- Object names must describe the CP result, not a generic word such as `task` or `work`.

Examples:

```text
plans/cp001_implementation-plan_workflow-foundation.md
plans/cp001_revision-plan_workflow-foundation.md
logs/cp001_completion-log_workflow-foundation.md
```

## 4. Mandatory Ask Question Gate

Before creating any implementation plan or revision plan:

1. Invoke the environment's structured question feature.
2. OpenCode must use `Ask Question`/`question`.
3. Claude Code must use `AskUserQuestion` or its structured equivalent.
4. Codex must use its structured interactive clarification mechanism.
5. Ask at least one meaningful clarification or decision question about scope, behavior, risk, verification, or tradeoffs.
6. Wait for and incorporate the user's answer.
7. Do not replace this gate with assumptions or a plain conversational question when a structured question feature is available.

Additional question rounds are required while material ambiguities remain.

## 5. Implementation Plan Gate

Before executing any CP from `TODOS.md`:

1. Confirm all dependency CPs are `completed`.
2. Complete the Ask Question gate.
3. Create `plans/cpNNN_implementation-plan_object-name.md`.
4. Ensure the plan contains all required sections.
5. Resolve open decisions that can change implementation behavior.
6. Change the CP status from `pending` to `in_progress` only when implementation actually starts.
7. Execute only the scope documented in the plan.

No code, workflow mutation, credential mutation, dependency installation, or production-affecting action for that CP may occur before its implementation plan exists.

### Required implementation plan sections

```text
# CPxxx Implementation Plan: Object

## Objective
## Clarifications and Decisions
## Scope
## Out of Scope
## Current-State Findings
## Proposed Changes
## Data Flow or Control Flow
## Files and n8n Workflows Affected
## Security and Failure Handling
## Verification Plan
## Acceptance Criteria
## Risks and Rollback
```

The plan must record the Ask Question decisions without recording secrets.

## 5a. CP and Chapter Execution Sequence

Every unit of work goes through six phases, **in this order, with no phase
skipped or reordered.** The unit is either a single CP, or a **chapter** —
a group of consecutive, related CPs that `TODOS.md` explicitly bundles
together (e.g. because they share one Ask Question round or one review
pass). Whether a given piece of work is one CP or a chapter of several is a
`TODOS.md` decision; this sequence applies identically either way.

1. **Diskusi (Discuss)** — the Ask Question gate (§4). Surface and resolve
   every scope, behavior, risk, and tradeoff question *before* a plan is
   written. For a chapter, this round covers all CPs in it at once.
2. **Planning** — the Implementation Plan Gate (§5). Write the plan(s),
   incorporating every answer from Discuss. A chapter may share one plan
   document covering all its CPs if `TODOS.md` says so; each CP inside it
   still needs its own completion log (§7).
3. **Working** — execute only what the plan describes (§10). No opportunistic
   scope expansion into later CPs or later chapters.
4. **Review** — **before** testing, re-read the finished work against
   `SPEC.md` and the plan's own acceptance criteria as if reviewing someone
   else's change. Check specifically for: silent deviation from the plan,
   scope drift, and anything the plan promised that was not actually done.
   This step exists because it is the one most often skipped in practice —
   going straight from Working to Test looks equivalent but is not: Review
   catches drift that Test only catches by coincidence, if a test happens to
   exercise it.
5. **Test** — execute the plan's Verification Plan for real: live execution,
   rendered/visual verification where §11a/§11b require it, actual command
   output — never a claim based on reading code alone.
6. **Revise** — fix every Review and Test finding here, then loop back to
   Review and Test until both pass clean. A CP or chapter may not be marked
   `completed` with a known, unresolved finding outstanding.

## 6. Revision Plan Gate

A revision is any requested change to a CP already marked `completed`, including bug fixes, behavior changes, acceptance-criteria changes, or material refactoring.

Before revising a completed CP:

1. Complete a new Ask Question gate for the revision.
2. Create or replace `plans/cpNNN_revision-plan_object-name.md` for the current revision.
3. Describe the observed behavior, reason for revision, changed scope, regression risk, and verification.
4. Change the CP status to `in_progress` while the revision is being executed.
5. Do not modify the original implementation plan to disguise the revision.

### Required revision plan sections

```text
# CPxxx Revision Plan: Object

## Reason for Revision
## Clarifications and Decisions
## Existing Behavior
## Required Behavior
## Proposed Changes
## Impact and Regression Risk
## Verification Plan
## Updated Acceptance Criteria
## Rollback
```

## 7. Completion Log Gate

Every completed CP must have a completion log. A CP cannot be marked `completed` until implementation and required verification have finished successfully and its log exists. **This is a hard blocking gate, not a formality:** no work on the next CP may begin until the current CP's log file exists in `logs/`.

- `logs/` is the dedicated completion-log directory.
- `logs/LOG_TEMPLATE.md` is the required format for every CP log.
- Each completed CP creates one separate log file inside `logs/`, named exactly `cpNNN_completion-log_<object-name>.md` (e.g. `logs/cp001_completion-log_foundation-and-input-intake.md`).
- Do not create an empty CP log before the CP is completed.
- **`TODOS.md` and `logs/` must always agree.** Before marking any CP `completed` in `TODOS.md`, confirm its log file already exists. Before starting any CP, confirm every prior CP marked `completed` in `TODOS.md` actually has a matching log file in `logs/` — if one is missing, stop and resolve the gap (write the missing log from verifiable evidence, or downgrade the status) before proceeding.
- **Known failure mode, do not repeat it:** in a sibling project in this repo (`website-research-engine`), a CP was implemented and its artifacts shipped to production, but it was never added to `TODOS.md` and never got a completion log — the gap went unnoticed for days because nothing forced the cross-check. That is exactly what the rule above exists to prevent.

Create:

```text
logs/cpNNN_completion-log_object-name.md
```

Copy the structure from `logs/LOG_TEMPLATE.md` and replace every placeholder with factual execution results.

### Required completion log sections

```text
# CPxxx Completion Log: Object

## Result
## Date
## Plan Reference
## Changes Made
## Files and n8n Workflows Changed
## Verification Performed
## Acceptance Criteria Results
## Deviations from Plan
## Known Limitations and Follow-Ups
```

Logs must be factual. Never claim a test passed if it was not executed.

## 8. Revision Logging

- A completed revision updates the existing CP completion log instead of creating a second log file.
- Append a dated `Revision` section.
- Reference the revision plan filename.
- Record changed behavior, affected artifacts, verification, and updated acceptance-criteria results.
- Preserve the original completion record; do not rewrite history.

Revision section format:

```text
## Revision: YYYY-MM-DD - Short Description

### Revision Plan
### Changes Made
### Verification Performed
### Acceptance Criteria Results
### Remaining Limitations
```

## 9. Status Rules

- Only one CP may be `in_progress` unless the user explicitly authorizes parallel CP execution.
- `pending` means no execution has started.
- `in_progress` requires an implementation or revision plan.
- `blocked` requires the blocker and next decision to be recorded in the active plan or completion log.
- `completed` requires successful verification and a completion log.
- If verification fails, keep the CP `in_progress` or mark it `blocked`; never mark it `completed`.

## 10. Scope and Change Control

- Implement the smallest correct change that satisfies the active CP.
- Do not execute future CP scope opportunistically.
- Record newly discovered work as a new pending CP or follow-up; do not silently expand the current CP.
- If a proposed change conflicts with `SPEC.md`, use Ask Question before changing the specification.
- Update `SPEC.md` and `TODOS.md` when an approved decision changes requirements or CP sequencing.

## 11. n8n Rules

- Use n8n MCP to inspect, create, update, validate, test, or debug n8n workflows.
- Validate the workflow after structural or expression changes.
- Test the smallest safe trigger path available.
- Never hardcode API keys, tokens, passwords, or credential values in workflow JSON.
- Reference n8n credentials or environment variables by name only.
- Do not activate a workflow until its CP acceptance criteria and safety checks pass, unless activation is explicitly part of the approved plan.
- Preserve bounded retries, timeouts, loop limits, and failure branches.
- Before any `update_workflow` call, confirm `settings.saveDataSuccessExecution`
  is not silently reset to `"none"` as a side effect; re-check it after the
  call. This product was built after that exact regression cost hours of
  debugging on a sibling workflow in this repo.

## 11a. HTML/PDF Rendering Rules (this product does not use the DOCX toolchain)

- This is the first product in this repo whose renderer is HTML/CSS →
  Playwright PDF, not docxtemplater. The `.docx`/`tcMar`/OOXML conventions
  used elsewhere in this repo do not apply here and must not be imported by
  habit.
- Every render (HTML and PDF) requires **rendered visual verification** —
  actually opening the output and looking at it — before a CP claims
  success. Code review or XML/HTML inspection alone is not sufficient; this
  was the exact gap that let real formatting defects ship in earlier
  products in this repo.
- The Playwright PDF call must set `printBackground: true`. Without it,
  every background color and gradient silently disappears — verify this
  explicitly for every rendering CP, not just once.
- Verify `break-inside: avoid` is actually effective on card/block elements
  by inspecting a rendered multi-page PDF, not by reading the CSS alone.
- Verify the HTML is genuinely self-contained (inline CSS, inline SVG, no
  external CDN dependency) by rendering it with network access disabled or
  by inspecting the request log during render.
- Temp and output file names use `$execution.id`, never `Date.now()` or any
  wall-clock-derived value (see `SPEC.md` §9.1.8).

## 11b. Photo Sourcing Rules (D3, D4 in `SPEC.md`)

- Never present a stock photo as depicting a specific named venue. Stock
  imagery is destination/region-level and decorative only (`SPEC.md` §7.1).
- Never ship a low-confidence photo match. Fall back to the themed gradient
  instead — verify the fallback path actually triggers under a fixture with
  no good match, not just that the code exists.
- Every photo used must carry attribution recorded in the canonical data and
  rendered in the closing section. Treat a missing attribution as a QA
  failure, not a cosmetic gap.
- Never invent or assert an opening hour or ticket price (D11). Verification
  guards for this must match an actual factual claim, not a bare word — see
  §11c.

## 11c. Validation Guard Rules (lesson from Web Project Scoping Engine)

- Any QA or parser guard intended to block a category of content (currency
  amounts, forbidden claims, etc.) must match the actual **pattern** that
  constitutes the violation (e.g. a currency symbol or code adjacent to a
  digit), never a bare **word** list.
- Before shipping such a guard, write a fixture containing the word in a
  legitimate context (e.g. "harga" with no figure, or "pricing" describing
  the client's own menu) and confirm it is **accepted**. A guard that cannot
  pass this fixture is not ready, regardless of how it performs on the
  violation case.
- This is not a style preference — a word-based guard of exactly this kind
  previously blocked nearly every valid AI output in a sibling product in
  this repo (`web-scoping-engine`) before being caught and fixed.

## 12. Security and Evidence

- Never place secrets in plans, logs, screenshots, examples, or source control.
- Redact personal data and tokens from diagnostic output.
- Record evidence for verification, such as validation result, execution ID, output path, or test command.
- Do not include raw scraped content in logs; record source URLs, counts, hashes, or summarized findings instead.
- Do not claim model confidence as statistical certainty.

## 13. Definition of CP Completion

A CP is complete only when all conditions are true:

- Its implementation or revision plan exists.
- The Ask Question decisions are reflected in the plan.
- Planned implementation is finished.
- Verification was executed and recorded.
- Acceptance criteria pass.
- The completion log exists or has been updated for a revision.
- `TODOS.md` status is updated to `completed`.
