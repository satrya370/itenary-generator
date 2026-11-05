# CP024 Revision Plan: Full Raster Decode Before Preview

**Date:** 2026-10-07. **Status:** completed and planner-accepted; see revision section in CP024 completion log.
**Authority:** `SPEC.md` W11/W14, `RULES.md`, `TODOS.md`; CP027 V27-03 probe `output/web-e2e/cp027-probe-summary.json`.
**Sequence:** CP024 V27-03 revision now; CP025 V27-05 revision remains completed/logged. CP027 blocked until this revision and affected E2E rerun pass.

## Reason for Revision

CP027 probe reproduced V27-03 using a valid 8×8 PNG asset, then flipping one byte in its compressed pixel data without changing total byte length or IHDR metadata. `renderSavedDraftPreview()` checked `sharp(...).metadata()`, metadata/MIME/length matched, renderer accepted the syntactically valid data URI, and the response returned `publishReady:true` with a broken/corrupt image embedded. Thus a same-size pixel-corrupt stored raster is not fail-closed in preview.

## Clarifications and Decisions

- Structured Ask Question 2026-10-07: user authorized a separate CP024 revision for full pixel-decode validation. This is distinct from the previously completed CP024 V27-01 revision.
- Resolve full raster decode before embedding any owned asset into preview or allowing publish. Metadata/header parsing alone does not prove usable pixel bytes.
- Preserve current supported JPEG/PNG/WebP formats, 5 MiB per-asset / 20 MiB per-render / 16 MP caps, asset attribution policy, renderer output and decorative missing-asset fallback behavior.
- Keep all decode work server-side; return an actionable `422 ASSET_INVALID` field diagnostic. Do not return corrupt bytes in preview HTML or mutate/delete stored asset/draft as an automatic repair.
- Use a bounded full-decode validation result that does not retain expanded raw pixels or create a second long-lived asset copy. If the decoder exposes only a safe small-output decode path, verify it fails on corrupt compressed data as well as valid formats before use.
- Do not modify CP021 upload persistence, CP020 renderer contract, canonical schema, CP025 publication/token lifecycle or release scope as part of this revision. If a completed seam requires behavior change, stop for its own revision.

## Existing Behavior

- `src/server/preview.ts` reads an owned storage file, checks safe filename, uses `sharp(bytes,{limitInputPixels,failOn:'error'}).metadata()`, matches format/MIME/byte count and embeds original bytes as a data URI.
- Metadata parse succeeds for the reproduced same-length PNG with corrupted IDAT data. The CP020 HTML renderer validates data URI syntax, not raster pixel decoding.
- Repro script and redacted result use a temporary root; latest result reports `embeddedCorruptImage:true` and `publishReady:true`.

## Required Behavior

- Valid pixel data for JPEG/PNG/WebP is fully decoded/validated before preview embedding; existing limits and byte-for-byte stored source remain unchanged.
- Same-size corrupt/truncated compressed pixels, invalid CRC/decode and metadata mismatch return structured `ASSET_INVALID` for the canonical asset field, `422 PREVIEW_BLOCKED`, no HTML containing the corrupt image, and no mutation to draft, asset row or stored asset bytes.
- Valid upload/save/preview still renders and preserves asset hash/attribution; an unavailable asset follows only the CP020 documented missing-asset fallback path.
- Publish via CP025 uses the same preview service and therefore cannot persist a corrupt image. A rejected publish must leave any prior public version/link intact.
- Decode is bounded by already-enforced input byte/pixel limits and does not retain raw pixel arrays in memory.

## Proposed Changes

1. Mark only CP024 `in_progress (revision)`; keep CP025 completed and CP027 blocked. Preserve original CP024 completion/revision history.
2. Reproduce V27-03 in `tests/web/preview.test.ts` with a synthetic PNG and a one-byte same-length compressed-data mutation. Assert the fixture's metadata still parses before the preview call so the regression specifically covers full pixel decoding.
3. Add a narrow full-decode probe in `renderSavedDraftPreview()` after owned-file/MIME/size checks and before data-URI construction. Prefer `sharp(...).stats()` or another proven non-retaining decode path with `failOn:'error'` and `limitInputPixels`; choose based on executed corruption fixture, not assumption.
4. Map decode failure to `ASSET_INVALID` at the actual canonical field path (`hero.assetId`, profile logo or specific schedule/spot asset), without returning image data or changing files/database. Keep text fields in the error payload token/path safe.
5. Verify pixel corruption, wrong bytes/MIME/size, valid JPEG/PNG/WebP, 16MP/5MiB bounds, publish rejection and prior public snapshot preservation. Check repeated calls don't leak temporary files or grow retained raw buffers.
6. Run CP024 Review → Test → Revise. Append a second dated `Revision` section to `logs/cp024_completion-log_draft-preview-and-publish-validation.md`, referencing this plan and factual evidence. Return CP024 to completed only after the revision gates pass.
7. Rerun `npx tsx scripts/web/probe-cp027-findings.ts`; V27-01, V27-03 and V27-05 must all report not reproduced before unblocking the full CP027 matrix.

## Impact and Regression Risk

- Full decode adds bounded CPU work per unique image; 5 MiB and 16MP caps constrain inputs. Decode each distinct asset once per render and release probe results promptly.
- Some malformed files may produce warnings but still decode; accepted formats need positive test fixtures. Truncated byte-length mismatch and same-size compressed corruption are distinct test cases.
- Error mapping must identify the exact asset field while keeping store keys/paths private. No broad catch should relabel I/O errors as corrupt image; missing/read errors retain their safe storage classification.
- Failed validation must not erase previously uploaded assets, alter drafts, or affect current published snapshots.

## Verification Plan

```text
npm run test:web-preview
npm run test:web-api
npm run test:web-render
npm run typecheck:web-app
npm run build:web-app
npm run verify:web-preview
npm run test:web-publication
npm run verify:web-publication
npm run validate
npm test
npm audit --audit-level=moderate
git diff --check
npx tsx scripts/web/probe-cp027-findings.ts
```

Inspect the preview frame and relevant mobile/desktop evidence. Confirm corrupt assets never enter HTML, image hash/DB row/draft are unchanged, and CP025 public GET continues serving the pre-existing good version on rejection. Do not run live AI or AWS commands.

## Updated Acceptance Criteria

| ID | Required evidence |
|---|---|
| R24-V27-03 | Same-length PNG with valid dimensions but corrupted compressed pixels fails preview with `ASSET_INVALID`; no unsafe image HTML, draft/artifact mutation or asset data mutation. |
| R24-raster-positive | Valid JPEG/PNG/WebP full-decode preview, dimensions/pixel/byte limits and existing decorative fallback regressions pass. |
| R24-publish-propagation | CP025 publish rejects corrupted asset and leaves current immutable HTML/image/token state intact. |
| Revision close | Existing CP024 completion log has dated revision evidence; tests/browser/security gates pass; V27-01/V27-03 no longer reproduce. V27-05 was already closed in CP025. |

## Rollback

Revert only this revision's decoder/test changes if they regress supported formats, retaining the reproducer and CP027 blocker. Do not weaken decode assertions or silently discard the photo. Preserve existing assets/published versions and completion history; CP027 remains blocked until V27-03 is conclusively closed.
