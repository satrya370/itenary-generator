# CP030-CP032 Audit Log: Import chapter

Auditor: Claude Opus 5.5. Date: 2026-11-11. Scope: commits `4e08bac`..`6ad7133` (CP030 intake and parser, CP031 AI completion, merge and undo, CP032 UI and E2E), read from disk. The earlier reviews of all three CPs were done in the same session as the work (the separate reviewer was blocked by a hook), so this is the first audit not anchored on the executor's logs.

## Verdict

**REVISE before accepting CP032 and closing the chapter.** Gates are green, and the core design holds: code-first parsing, nothing invented by the parser, undo and replay, and the writing-AI ledger untouched. But three high findings are confirmed by probes or by build output, and they break the feature on realistic input or in the release package.

## Findings

| ID | Severity | Where | Finding | Evidence |
|---|---|---|---|---|
| A1 | High | `scripts/web/build-release.mjs` (`runtimePackages`) | The release package does not include `unpdf`. The list is hard-coded; `unpdf` was never added. `validate:web-release` still says "valid" because it does not check imports. A server deployed from the release cannot read PDFs. | `build:web-release` output lists 10 dependencies, none is `unpdf`. The CP030 log claimed "unpdf must not break the release package; valid". |
| A2 | High | `service.ts` run / `merge.ts` | One value over a schema limit makes the whole import fail with a generic `422 IMPORT_DRAFT_INVALID`, and nothing is saved. Limits that real text hits: activity title 200 chars, 30 activities per day, list item 500 chars (also day title, meeting place 240, guide name 160, phone 80). | Probes: one 250-char activity line, 31 time lines in a day, one 600-char "Termasuk" bullet each returned 422 with no draft. |
| A3 | High | `complete.ts` `quoteHolds` | The guard only checks that the value is a substring of the quote. A fragment can flip meaning: quote "Tidak termasuk tiket masuk", value "termasuk tiket masuk" is accepted into `policies`. | Probe: draft `policies` = "termasuk tiket masuk". |
| A4 | Medium | `service.ts` (`writing.brief`) with `ai/service.ts:83` | New imports copy up to 20,000 characters of source text into `writingContext.brief`. The writing AI rejects contexts over 16 KB (`AI_CONTEXT_TOO_LARGE`, English message), so every "Buat dengan AI" on a draft from a large document fails. The brief also carries any instruction text in the document into the writing-AI prompt, which does not mark it untrusted. | Code: brief set at `service.ts:145`; context limit `CONTEXT_MAX_BYTES = 16 * 1024`; brief included at `ai/service.ts:65`. |
| A5 | Medium | `complete.ts` `segmentsOf` / guard | Segments are sent as `[section] text` and the guard checks against that prefixed text, so a model that echoes the engine's marker passes. The marker then lands in the draft. | Probe: summary saved as "[summary] Perjalanan santai di Ubud." |
| A6 | Medium | `ImportReport.tsx`, `main.tsx` onJump | The report lists raw developer paths ("days[0].activities[0].description", "trip.language", "places[].name") instead of the Indonesian labels the editor uses elsewhere. The jump links call `focusDiagnostic({ path })` without `targetIdFor`, the same defect fixed in R5: nested paths jump to the first activity. | Screenshot `cp032-report-1280.png`; code `main.tsx` onJump; R5 review log. The E2E never clicks a jump link. |
| A7 | Low | `main.tsx` open() | "Tutup" on the report is not remembered; the panel comes back every time the draft is reopened, for any old import. | Code. |
| A8 | Low | `IMPORT_DRAFT_INVALID` message | The 422 says only "tidak sesuai bentuk draf"; it does not say which value. | Code; related to A2. |
| A9 | Low | `complete.ts` (`maxTokens: 1500`) | A long destination guide may need more than 1,500 output tokens; a cut reply fails JSON parsing and all places are lost (with a note). Not reproduced. | Code. |
| A10 | Low | `.runtime/imports` | Source text (may hold phone numbers) is kept indefinitely, and again in the brief; there is no retention rule. | Code. |

## Checked and fine

- Parser copies text only; the traceability test and the mutation (invented country) hold.
- Injected instruction text never became a field in fixtures, tests, or the live run.
- Undo restores only when the draft is untouched; replay does not call the model twice; stale overwrite writes nothing; interrupted runs become `uncertain`.
- Writing-AI daily ledger and live budget are untouched by imports (test).
- No `as any`, `: any`, or ts-ignore in new code; `.env.web` and credentials not committed.
- Public page does not contain source labels (E2E).

## Process notes

- All three CP reviews were self-reviews; the plan's Haiku-execute, Opus-review split did not happen.
- The CP032 live run used the real key (about US$0.0007). It was in the plan's gate, but it was not confirmed in that turn.
- Commits after `10eeb5b` are local and unpushed.

## Recommended revision (for the owner to approve)

1. A1: add `unpdf` to the release runtime list and make `validate:web-release` fail when a server import is missing from the package. This touches CP028 files, so per the plan it needs a CP028 revision note.
2. A2: never fail the whole import on length. Cap activities at 30 per day and lists at their maximum with a report line. Move the rest of an over-long activity line into `description`, and keep over-long list items in "Yang perlu diketahui" with a note. Name the field in the error if validation still fails.
3. A3: for sentences (summary, closing note, policies, descriptions, tips), the value must equal the whole quote. Only names and areas may be a part of a quote.
4. A4: do not copy the source into the brief. Or cap it well under the 16 KB context, and mark the brief as untrusted in the writing prompt.
5. A5: send segments without engine markers (or strip them before the guard), and reject values that contain them.
6. A6: show Indonesian labels in the report and pass `targetIdFor` on jump; add an E2E click on a nested path.
7. A7 to A10: small follow-ups.
