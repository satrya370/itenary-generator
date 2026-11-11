# CP036 Review Log (Google Places autocomplete)

Reviewer: Claude Sonnet 5.5. Date: 2026-11-11. Reviewed: commit `f69c914` (executor: Haiku 5.5). Findings were fixed in the same pass.

## Checked and fine

- Route sits behind the same-origin write guard (now covered by a test); key only in a request header, never in a body, response or log; provider errors give no upstream text; usage reserved atomically before the call; limit 0 refuses; public pages never call Google; Maps link is built with `encodeURIComponent` and keeps `query_place_id`.
- Migration 5 only adds a table; no draft data touched.
- Free text always works; stale responses are ignored; session token resets after a pick.

## Findings and fixes

| ID | Severity | Finding | Fix |
|---|---|---|---|
| P1 | Medium | After a 503 (no key) the explanation note was shown and then erased in the same render cycle: `setDisabled(true)` re-ran the effect, whose first branch cleared the note. The user would see nothing. Not covered by any test. | The disabled branch keeps the note. |
| P2 | Medium | After the daily cap (429) the editor kept calling the server on every pause in typing. No Google cost, but needless traffic and repeated errors. | 429 now disables search for the page session, like 503; the cap message stays visible. |
| P3 | Medium | Place fields allow 200-240 characters but the server accepts 3-100. A longer place name got a 400 and the misleading note "Tulis minimal 3 huruf". | The editor does not search above 100 characters (typed as free text, no note). |
| P4 | Low | The setup docs never mentioned the Google key, the cap, or the attribution requirement; the API contract had no section for the route. | Added a paragraph to `docs/standalone-development.md` and "Added by CP036" to `docs/editor-ai-api-contract.md`. |
| P5 | Low | Test gaps: foreign origin and missing marker header, provider timeout/network failure. | Two tests added (places suite now 12). |

## Tests added

- `places.test.ts`: refused origin (403, nothing counted, provider not called); timeout error answers 502 with no key or upstream text.
- `verify-places.ts`: over-long query makes no request and shows no note; after the cap the browser stops requesting (resource-timing count unchanged) and the cap message stays on screen.
- Mutation: the old effect branch brought back made `verify:web-places` fail ("cap message is shown in Indonesian", actual empty); restored, it passes.

## Gate after fixes

`typecheck:web-app`, `-contracts`, `-contracts-v2`, `-server`, `check:web-types` rc 0; unit suites contracts 43, api 13, store 12, ai 28, render 14, editor 33, preview 12, publication 12, places 12, all pass; `verify:web-places`, `-editor`, `-preview`, `-publication`, `-ai-ui`, `-e2e`, `-publish-retry`, `-render` rc 0; `build:web-release` and `validate:web-release` valid (41 files).

## Still open (owner)

- **Google logo.** The dropdown shows the text "Powered by Google". The plan asks for the official logo asset and says to stop and ask if it cannot be obtained; the executor continued with text. The owner must supply the asset or accept the text. Not a code defect.
- Live check with a real key (one search per field) not done.
- Meeting-point pick overwrites an existing Maps link without asking (plan PD-1 behaviour); the field stays editable. Consider a confirmation only if the owner finds it surprising.

## Verdict

CP036: **ACCEPT after fixes P1-P5**, with the logo decision and the live key check pending on the owner.
