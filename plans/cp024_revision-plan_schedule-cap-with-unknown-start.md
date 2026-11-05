# CP024 Revision Plan: Schedule Caps with Unknown Start Time

**Date:** 2026-10-07. **Status:** completed and verified; see revision section in CP024 completion log.
**Authority:** `SPEC.md` W12, `TODOS.md`, `RULES.md`; CP027 probe `output/web-e2e/cp027-probe-summary.json`.

## Reason for Revision

CP027 reproduced V27-01 against the real preview/publish API: a valid `half_day` draft with an unparseable/empty `timeLabel` and explicit `durationLabel: "7 hours"` returns `publishReady:true` and publishes with HTTP 200. The 6-hour maximum is provably exceeded from the duration alone. Existing logic warns then `continue`s on unknown start before adding known duration or evaluating the cap. Condensed multi-day blocks similarly skip all activity-level checks.

## Clarifications and Decisions

- Structured Ask Question 2026-10-07 authorized sequential revisions **CP024 then CP025**. CP027 remains blocked until both original-CP revision gates and chapter re-review pass.
- Preserve CP024 manual-save, preview/publish diagnostics split, ambiguous-time warning, no invented values, no duration inferred from adjacent activities, and the immutable CP020 renderer contract.
- Unknown start means overlap/span cannot be computed; it does **not** erase an explicit positive duration. For a non-condensed day block, sum every known activity duration and block when the sum exceeds its per-day cap.
- For condensed multi-day blocks, do not sum across days or claim daily distribution. Still block an individual duration proven to exceed the 11-hour daily limit; other daily allocation remains warning/partial.
- Zero/negative/contradictory known durations remain errors; unsupported/ambiguous labels remain warnings.
- No PDF work, fresh AI inference, budget reset, publication/token change or CP025 implementation in this revision.

## Existing Behavior

- `src/server/preview.ts` `scheduleDiagnostics()` derives `measuredDuration`, but when `start === null` it warns and continues before `knownTotal += measuredDuration`.
- Condensed `multi_day` blocks immediately warn and continue, so even a single 12-hour activity is not checked against the 11-hour per-day cap.
- CP027 probe uses an isolated temporary SQLite/filesystem root and reports the actual preview/publish statuses. No normal data, live token, AWS resource or AI ledger was involved.

## Required Behavior

- `half_day`, empty/ambiguous start, 7 hours → `SCHEDULE_DURATION_CAP`, `publishReady:false`, publish returns validation failure.
- `full_day`, empty/ambiguous start, 12 hours → same failure against the 11-hour cap.
- Known per-day sum above cap blocks even when some starts are unknown. Do not treat unknown starts as zero duration or invent intervals.
- Condensed multi-day with one known activity >11 hours blocks; an aggregate across a condensed span is not used to claim per-day overage.
- Missing/ambiguous start with known duration within cap remains warning/partial and may publish if all other readiness criteria pass. Unknown duration with known start remains warning unless its known interval/lower bound proves a cap/overlap violation.
- Exact boundary 6h/11h is allowed; 1 minute beyond is rejected. Existing recognized interval overlap, duration contradiction, guide mode, and input-preservation behavior remain.

## Proposed Changes

1. Mark only CP024 `in_progress (revision)`; leave CP025 completed until its authorized revision begins. Keep CP027 blocked.
2. Refactor `scheduleDiagnostics` minimally so known duration contributes to block-level known total before an unknown-start path exits. Check individual duration against mode/day cap independently.
3. Keep overlap checking limited to fully recognized intervals. For condensed multi-day blocks, retain `SCHEDULE_DAYS_NOT_FULLY_VERIFIED`, check only individually proven >11-hour activity, and do not aggregate activity durations across days.
4. Add focused API tests for unknown-start half/full-day caps, exact boundaries, allowed missing/ambiguous inputs, and condensed single-activity lower-bound violation. Promote the CP027 reproducer into a regression assertion that fails before the fix.
5. Run CP024 gates and inspect diagnostics/UI. Do not modify CP020 renderer or canonical CP019 schema. If another completed seam requires behavior changes, stop for that CP's revision gate.
6. Append a dated Revision section to `logs/cp024_completion-log_draft-preview-and-publish-validation.md` per `RULES.md` §8. Update TODO only after tests/log pass; then CP025 revision may start.

## Impact and Regression Risk

- Counting known durations when starts are unknown can expose valid-but-long manual schedules previously allowed. This is the intended cap rule; test exact boundary and missing duration controls.
- Condensed blocks must not be treated as one day; only a single known activity exceeding the daily cap is a guaranteed violation.
- Avoid interpreting arbitrary numeric text as minutes; reuse anchored `parseDuration` grammar only.
- Failure to preserve warnings for unknown times could silently claim verified feasibility; assert `scheduleVerification:'partial'` alongside allowed cases.

## Verification Plan

```text
npm run test:web-preview
npm run typecheck:web-app
npm run test:web-contracts
npm run test:web-render
npm run build:web-app
npm run verify:web-preview
npm run validate
npm test
npm audit --audit-level=moderate
git diff --check
```

Also run `npx tsx scripts/web/probe-cp027-findings.ts` and confirm V27-01 is no longer reproduced. Evidence must include expected/actual preview `publishReady`, diagnostic code/path, publish HTTP result and unchanged saved draft.

## Updated Acceptance Criteria

| ID | Required evidence |
|---|---|
| R24-V27-01 | Known duration alone exceeding half/full-day cap blocks with actionable schedule diagnostic, regardless of unknown start. |
| R24-condensed | Condensed 2+ day distribution stays unverifiable; individually provable >11h activity blocks without aggregate inference. |
| R24-regression | Unknown-but-in-cap schedules remain warnings/partial and allowed; exact cap boundary allowed, +1 minute fails; no draft mutation. |
| Revision close | CP024 original completion log has dated factual revision entry; tests/visual verification pass; CP027 stays blocked until CP025 revision and chapter review. |

## Rollback

Revert only CP024 revision changes after inspecting the diff; keep the regression test as evidence and CP027 blocked if behavior is unresolved. Preserve CP024 original completion record, CP025 state, live AI ledger, user data and historical ACCEPT log. Do not weaken/remove the cap finding to make E2E green.
