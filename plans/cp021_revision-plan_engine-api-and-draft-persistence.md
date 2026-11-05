# CP021 Revision Plan: Engine API and Draft Persistence

**Date:** 2026-10-07. **Status:** completed; executed and verified 2026-10-07 (see appended CP021 revision log).
**Authority:** `SPEC.md`, `RULES.md`, `TODOS.md`; review `../logs/cp021-cp023_review-log_bug-and-evidence-audit.md`.

## Reason for Revision

F21-01: truncated PNG with readable metadata historically returned HTTP 500 when Sharp re-encode failed. The fix already exists, but CP021 was completed and the change was recorded only as an unformalized follow-up. A formal revision/reverification is now required under `RULES.md` §6; this plan does not retroactively claim the gate was followed.

F21-02: the chapter plan requires failure cleanup and image-dimension/pixel boundaries, but current API tests lack injected upload persistence failures and those boundary cases. This is a verification gap, not proof that cleanup currently fails.

## Clarifications and Decisions

- Structured Ask Question on 2026-10-07: user selected **“Bug + gap (Recommended)”**, authorizing separate CP021 and CP023 plans covering recorded bugs and code/evidence gaps.
- Reuse CP021; keep the original implementation plan, completion record and PNG follow-up. Append a dated executed revision only after this verification passes.
- Execute CP021 before CP023 revision, one CP `in_progress`. Planning alone does not start revision execution or establish chapter acceptance.
- Prefer retaining the existing catch at the decode/re-encode boundary if correct. No dependency upgrade or image-format expansion.

## Existing Behavior

- `src/server/app.ts:164–172` separately validates metadata and catches decode/re-encode failure as `422 ASSET_INVALID`.
- Processed-size overflow is 413; writes/rename/database persistence have cleanup in `:174–180` and propagate server errors.
- `tests/web/api.test.ts:99–100` uses a malformed/truncated PNG but asserts only HTTP 422. It does not assert error code or absence of stored artifacts for this fixture.
- Seven historical API tests pass; normal assets/restart/restore/orphan cleanup are covered. Injected storage failure and dimension/pixel tests are missing.
- CP021 log has all mandatory headings and an explicit, dated unformalized follow-up.

## Required Behavior

- Valid metadata followed by failed pixel decode/re-encode returns 422 with `ASSET_INVALID`, never generic HTTP 500 or a successful asset record.
- Invalid upload leaves no new metadata row, temporary upload or final image; existing assets and draft/profile data remain intact.
- Valid image persistence failures remain server errors, not invalid-image errors; compensating cleanup is verified after temp-write/rename or DB failure.
- JPEG/PNG/WebP support, 5 MiB input/output limits, 8,192px per-axis and 16-megapixel ceilings, owned-asset lookup and manual editing remain unchanged.

## Proposed Changes

1. At revision execution, set only CP021 `in_progress`; add a current-revision note in its log/TODOS. Inspect existing modifications before patching.
2. Confirm the fixture reaches metadata success followed by re-encode failure. Assert response code/envelope, asset-row count and temp/final-directory contents before/after. Verify a valid PNG upload immediately afterward still works.
3. Add narrow dimension and pixel-limit fixtures that are rejected before persistence. Validate existing supported formats still succeed; avoid gratuitous large image fixtures if a small encoded fixture can exercise the boundary.
4. Inject a persistence failure with the smallest existing test seam (e.g. controlled test-store failure); exercise failure after a temporary or final write. If file-write failure requires a new seam, keep it test-local/minimal and cross-platform. Assert cleanup and preservation of referenced assets.
5. Modify upload code only if review/test exposes an actual defect. Keep image validation catches separate from storage failures; do not catch every exception as `ASSET_INVALID`.
6. Review against SPEC and this plan before running gates. Revise and repeat only affected verification if findings remain.
7. Append `## Revision: YYYY-MM-DD - Upload Error and Persistence Verification` using `LOG_TEMPLATE.md` revision subsections; record actual commands/counts/results. Link this plan and the review; keep the original follow-up text.
8. Return CP021 to `completed` only after all revision gates and the appended log pass; CP023 revision can then begin.

Affected artifacts: `src/server/app.ts` only if needed; `tests/web/api.test.ts`/targeted fixtures; existing CP021 completion log; `TODOS.md`. No n8n workflow, credential, canonical schema, renderer or Laravel change.

## Impact and Regression Risk

- A broad catch could mislabel disk/DB failures as client errors. Test validation errors separately from persistence failures.
- Cleanup must never delete existing referenced files or user-owned unrelated files; compare baseline directory contents and owned metadata.
- Large image fixtures can waste memory; use bounded fixtures and retain Sharp pixel limits.
- Shared app tests must inject a provider double or unavailable-provider stub: upload verification does not require credentials or network inference.
- CP022 editor and CP023 service depend on the same API/store; rerun focused API/editor regression without changing their completed contracts.

## Verification Plan

Targeted assertions above must execute; existing passing counts alone are insufficient.

```text
npm run test:web-api
npm run typecheck:web-app
npm run check:web-types
npm run test:web-contracts
npm run test:web-editor
npm run build:web-app
npm run verify:web-editor
npm run validate
git diff --check
```

- Browser asset upload/rejection is verified against the real API; error leaves current unsaved editor input intact. Inspect the relevant output if UI error behavior changes.
- If renderer/canonical changes appear necessary, stop for their own revision gate; they are outside this plan.
- New verification evidence belongs in the existing CP021 log with dates and explicit per-fixture assertions; do not relabel old evidence as a new run.

## Updated Acceptance Criteria

| ID | Required evidence |
|---|---|
| R21-3a | Metadata-readable but undecodable PNG returns `422 ASSET_INVALID`; no stored row/file; valid upload afterward succeeds. |
| R21-3b | Oversized dimensions/pixel count are rejected before persistence; existing JPEG/PNG/WebP and byte-limit behavior remain correct. |
| R21-3c | Injected persistence failures return safe server errors and clean new files without deleting baseline assets or changing drafts/profile. |
| R21-1/2/4 regression | Standalone API, valid incomplete drafts, CAS/restart/restore and retained-input behavior remain passing. |
| Revision close | Existing completion log has a dated executed revision; TODOS agrees; CP021 follow-up is resolved with evidence rather than erased. |

## Rollback

Revert only intended revision changes after diff inspection; preserve pre-existing user work and all historical logs. Tests use isolated roots, not the live or normal workspace. If failures persist, keep the active revision `in_progress` or `blocked`, document the failure and hold CP023 revision/CP024. Do not delete the live AI ledger or rewrite historical completion.

## Execution Outcome: 2026-10-07

- User requested execution of all revision plans. CP021 executed first and passed the targeted API, type, contract/editor, build, browser and package gates.
- Evidence is appended under `Revision: 2026-10-07 - Upload Error and Persistence Verification` in `../logs/cp021_completion-log_engine-api-and-draft-persistence.md`.
- No upload runtime change was required; the previously made PNG fix was formally regression-tested. CP023 execution followed only after this log was updated.
