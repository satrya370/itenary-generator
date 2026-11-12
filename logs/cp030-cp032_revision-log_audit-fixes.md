# CP030-CP032 Revision Log: audit fixes (A1-A9)

Executor: Claude Sonnet 5.5 (inline). Date: 2026-11-12. Fixes the findings in `logs/cp030-cp032_audit-log_import-chapter.md`. Not yet re-audited by a separate reviewer.

| ID | Fix | Proof |
|---|---|---|
| A1 | `unpdf` added to `runtimePackages` in `scripts/web/build-release.mjs`. `validate-release.mjs` now fails when shipped server code imports a package the release does not list. | Mutation: removing `unpdf` from the release manifest and lock fails with "server imports unpdf ... does not ship it". Release valid, 11 dependencies. |
| A2 | `fitToLimits` (`merge.ts`) cuts over-long values at a word boundary, moves the cut part of an activity title to its description, caps activities (30/day), list items (50) and contacts (30), and reports each cut in the notes. A failed validation names the field. | Unit test: 250-char line, 31 activities and a 600-char bullet now import (201) with notes. |
| A3 | Sentence fields (summary, closing note, policies, descriptions, tips) must equal the whole quote; only names, areas and an activity place may be a part. Prompt says so. | Unit test: "termasuk tiket masuk" from "Tidak termasuk tiket masuk" is dropped. |
| A4 | New imports no longer copy the source into the writing brief (empty). | Unit test. |
| A5 | The guard checks the plain document text, not the text with engine `[section]` hints. | Unit test: a quoted "[summary] ..." is dropped. |
| A6 | Report shows Indonesian field labels (skipped items carry a `label`), jump passes `targetIdFor`. | Browser E2E now asserts no developer paths in the report and that a jump lands on a field. |
| A7 | Closing the report is remembered per operation (localStorage). | Code. |
| A8 | The 422 message names the first failing field. | Code. |
| A9 | maxTokens raised from 1500 to 3000. | Code; not reproduced. |
| A10 | Not changed: source retention rule still needs an owner decision. | |

## CP028 revision note
A1 touches CP028 files (`build-release.mjs`, `validate-release.mjs`). Reason: the release omitted a runtime dependency the server needs, and the validator could not see it. Behaviour of existing checks is unchanged; one check was added.

## Gates (2026-11-12)
typecheck (app, contracts, contracts-v2, server), check:web-types: rc 0. Tests: import 41, places, store, contracts, api, ai, render, editor, preview, publication: 0 fail. Browser: verify:web-import, editor, ai-ui, e2e, publication, preview, render: rc 0. build and validate release: valid.

## Limits
- The server running on this machine still predates CP030-CP032; it must be restarted (back up `.runtime` first) to use import.
- No live-model rerun after the prompt change (whole-quote rule); the opt-in live check is still available.
- Commits since `10eeb5b` are not pushed.
