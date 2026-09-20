# CP008 Revision Plan: Actionable-Tip Guard Over-Blocking

## Reason for Revision

Discovered while live-testing the CP006/CP009/CP010 output-completeness revision
(`plans/cp006-cp009-cp010_revision-plan_output-completeness-and-render-contract.md`).
`destination_guide` failed QA Gate twice in a row with
`SPOT_ACTIONABLE_TIP_MISSING` on the exact same spot
(`exec4934`, `exec4935`; both `spots[1].tips`). Inspection of the actual tip
showed it was clearly actionable: *"Simpan kacamata, makanan, dan barang kecil
di dalam tas tertutup; jangan menyentuh atau memberi makan monyet, serta ikuti
arahan petugas di area pura."* The rule rejected it anyway.

Root cause: the check is a bare word list —
`/\b(?:bawa|gunakan|hindari|datang|pesan|pakai|siapkan|kenakan|bring|use|avoid|
arrive|wear|carry|prepare|follow|dress|keep|stay|ask|confirm)\b/i` — that mixes
English action verbs with only a partial set of Indonesian ones. The rejected
tip uses "simpan" (store/keep) and "ikuti" (follow), neither of which is in the
list; only their English counterparts ("keep", "follow") are present. This is
the exact failure mode `RULES.md` §11c warns about by name (the
`web-scoping-engine` over-blocking bug): a word-based content guard that
doesn't match the actual pattern of a legitimate case.

## Clarifications and Decisions

Ask Question gate completed 2026-09-06 via structured question during the
CP006/CP009/CP010 revision, since this CP008 bug was found mid-execution of
that work and blocks two of the four required live-mode verifications.

| ID | Question | Decision |
|---|---|---|
| D1 | Fix now (out of the current revision's named scope) or record as a separate follow-up and leave `destination_guide` failing live verification? | **Fix now.** A guard that rejects a demonstrably actionable Indonesian tip is a functional defect blocking real usage; deferring it only because it carries a different CP number produces no benefit and leaves the pipeline unable to complete `destination_guide` reliably. |

## Existing Behavior

`SPOT_ACTIONABLE_TIP_MISSING` fires on legitimate actionable tips that use
Indonesian verbs outside its partial list (confirmed: "simpan", "ikuti"; likely
also "jaga", "waspada", "hati-hati", "perhatikan", "periksa", "cek", "jangan",
"pastikan" — common in real AI-generated safety/etiquette tips).

## Required Behavior

The guard must accept a tip that instructs the reader to do, avoid, or watch
for something, regardless of which of the common Indonesian or English
phrasings it uses — and must still reject a tip that is purely descriptive
with no instruction at all.

## Proposed Changes

Extend the word list in `QA Gate`'s `SPOT_ACTIONABLE_TIP_MISSING` check with
the missing common Indonesian actionable-tip verbs: `simpan`, `ikuti`, `jaga`,
`waspada`, `hati-hati`, `perhatikan`, `periksa`, `cek`, `jangan`, `pastikan`,
`tanya`, `konfirmasi`, `tunjukkan`; and two missing English ones, `check` and
`ensure`, for symmetry with the Indonesian side.

## Impact and Regression Risk

Low. The change only adds alternatives to an existing alternation — it cannot
newly reject anything it previously accepted. The only risk is the opposite
direction (becoming too permissive); mitigated by the negative fixture below,
per `RULES.md` §11c's explicit requirement to test a legitimate no-action
sentence before shipping.

## Verification Plan

1. Regex test against the real failing tip — must now match.
2. Regex test against a purely descriptive sentence with no instruction
   ("Tempat ini memiliki suasana yang tenang dan cocok untuk foto.") — must
   still fail to match (negative fixture, `RULES.md` §11c).
3. Regex test against an already-passing tip using an original list word
   ("Datang lebih pagi untuk menghindari keramaian...") — must still match.
4. Live re-run of `destination_guide` through the real form after deploying
   the fix — must reach `qaOk: true`.

## Updated Acceptance Criteria

| Criterion | Result |
|---|---|
| The originally-rejected real tip now passes | Confirmed by direct regex test before deploy |
| A non-actionable sentence is still rejected | Confirmed by direct regex test before deploy |
| A previously-passing tip still passes | Confirmed by direct regex test before deploy |
| Live `destination_guide` run reaches `qaOk: true` | Confirmed, execution 4936 |

## Rollback

Single-line regex revert; prior full-workflow snapshot retained at
`output/wf-fresh4.json` (pre-fix) for full rollback if needed.
