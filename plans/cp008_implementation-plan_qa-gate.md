# CP008 Implementation Plan: QA Gate

## Objective

Add a deterministic, mode-aware, fail-closed QA gate after photo assembly.
The selected option is to aggregate every detected failure in one result so
the operator can repair all issues in a single pass.

## Ask Question Decision

Option 1 selected: aggregate all failure codes/details instead of stopping at
the first rule.

## Scope

- Add structural, quality-floor, forbidden-content, and integrity checks from
  `SPEC.md §9.4`.
- Preserve all failures in `qaFailures` and route failures to the existing
  foundation error handler.
- Add a clean CP009 handoff only when `qaOk` is true.

## Out of Scope

HTML/PDF rendering, guide/timeline layout, publishing, delivery, activation,
and live model/provider execution.

## Verification

Use exact Code-node fixtures for all four modes plus money, `harga` regression,
ratings, one-line spot, guide time, both-array, attribution, and aggregate
failure cases. Validate the inactive n8n graph with zero runtime errors/warnings.

