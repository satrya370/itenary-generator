# CP032 Revision Plan: Mode-specific hybrid import templates

**Status:** completed (2026-11-23).  
**Plan basis:** `plans/cp030-cp032_revision-plan_hybrid-parsing-accuracy.md`; CP031 backend revision is complete.  
**Related review:** `logs/cp030-cp032_review_hybrid-parsing-accuracy_2026-11-23.md`.

## Reason for Revision

The existing format panel offers three examples for half-day/full-day/multi-day but only one for destination-guide/activity. Examples are mode-aware in data, but tests verify deterministic parsing only, not the complete hybrid deterministic + AI extraction/mapping contract. The owner requests three examples per selected mode, distinct content for each trip mode, and a corpus-level 100% support target.

## Clarifications and Decisions

- The owner selected **three templates for each of all five modes**: `half_day`, `full_day`, `multi_day`, `destination_guide`, `activity`. Examples are available in Indonesian and English: 30 total.
- The owner clarified “10%” to mean **100% coverage for the labeled template corpus**, not a universal accuracy guarantee. Every template-authored, supported fact must be deterministically applied, AI-applied with exact permitted source evidence, or explicitly pending/rejected with reason. The templates should be authored so intended facts apply; no ambiguity is to be counted as a successful fill.
- Template content must respect the active CP030 parser and CP031 source-unit/path/target rules. Global AI-assisted fields use explicit recognized headings; activity details use allowed local owner context; destination-guide places use recognized place structure. Do not add unsupported lines merely to inflate coverage.
- Use three distinct syntax patterns per mode where supported: prose/label schedule, table, and time-of-day grouping for day modes; bullet/place-block/list patterns for destination guide; labeled/key-value, sectioned, and compact practical layouts for activity. Example contents and field populations must differ appropriately between half-day, full-day and multi-day.
- If an example cannot pass the current deterministic+AI contract without changing CP030/CP031 behavior, do not weaken guards or call it supported. Stop and report the specific missing parser capability before expanding scope.
- Existing AI mock gates are acceptance authority. No additional live-provider calls are planned in CP032.
- CP033–CP036 remain deferred and untouched.
- No commit, push, migration, dependency, credential, deploy, or canonical schema changes.

## Existing Behavior

- `ImportFormats.tsx` displays format tabs based on `FORMATS_BY_MODE`, but destination-guide and activity have one each.
- `import-templates.json` currently has 22 samples (11 per locale): three each for half-day/full-day/multi-day, one each for destination-guide/activity.
- `import-templates.test.ts` checks deterministic parser notes/conflicts/unknown labels and line consumption. It does not apply AI completions through CP031's source-unit guards, merge, final coverage or mock import API.
- CP031 now enforces section/path and activity-owner constraints, requires exact source-unit references when present, reports pending coverage, and separates batch completion from mapping completion.

## Required Behavior

1. Every itinerary mode shows exactly three clearly named examples, with content shaped for that mode. The chosen mode controls which three appear.
2. Example syntax and metadata are accurate to what the deterministic parser recognizes.
3. Any intended AI-assisted text has explicit section/owner context and is completed through CP031 guards in deterministic mock tests; no model-invented value is counted.
4. For each of the 30 locale/mode/template cases, all authored substantive facts have an expected deterministic or AI mapping. Final `review.pendingUnits`, rejected and omitted units are zero for the supported fixture (unless explicitly marked as an intentional unresolved case, which does not count toward “100% mapped”).
5. The examples teach a useful structure, not fake prices/safety claims. Dates, names, values and places are synthetic.
6. Format titles, selectors, sample text and copy instructions remain readable at 390px and 1280px; examples are copyable and do not require horizontal scrolling.

## Proposed Changes

- Expand `config/web/import-templates.json` to three samples per mode and locale; store a mode/locale-specific display label per template rather than reusing misleading global format names.
- Update `ImportFormats.tsx` to select three template IDs for every mode and display the template's localized label.
- Update `importCopy` only for brief instructions needed to distinguish examples; preserve the CP032 recommendation to display the examples immediately below text/PDF controls in a collapsible, mobile-first panel.
- Replace parser-only assertions with a two-part corpus contract: deterministic parse expectations and full import-apply mock extraction. Mock outputs must reference provided source-unit IDs and allowed paths/owners; assert exact canonical fields, source evidence, zero pending units, zero wrong mappings, and correct mode.
- Preserve existing UI flows, source retention, report privacy, user drafts, CP031 logic and CP033–CP036 code/status.

## Impact and Regression Risk

| Risk | Mitigation |
|---|---|
| Example appears supported but parser silently drops a line | Assert complete normalized parser output and final source-unit disposition for every template. |
| AI mock hides a bad source/target relationship | Build mock replies from the supplied IDs/allowedPaths; also include negative wrong-path/owner fixtures. |
| Three formats are repetitive or labels misdescribe their syntax | Mode-specific labels and content review, separate half-day/full-day/multi-day fixtures. |
| Large template configuration makes UI overflow on phones | Inspect actual screenshots at 390px and 1280px; use collapsed examples and scrollable preformatted sample area only. |
| Strong “100%” claim overgeneralizes | Scope the claim to the 30 checked-in synthetic templates and label it corpus coverage, not real-world universal accuracy. |

## Verification Plan

1. Cross-check all 30 templates through `parseDocument` with expected fields, activities/days/places, notes, unconsumed units and source IDs.
2. Run each through import API `intake → parse → apply → read saved draft` using a deterministic `ImportExtractor` double that cites exact unit IDs, paths and owners. Assert final mapping coverage and canonical data.
3. Add negative template-adjacent cases for wrong global assignment, wrong activity target, omitted source unit and ambiguous boundary; verify none is auto-applied and all remain pending.
4. Run `test:web-import`, `test:web-editor`, `test:web-preview`, `typecheck:web-app`, `typecheck:web-server`, `check:web-types`, and impacted schema/build gates under Node 24.
5. Use Playwright to inspect the template panel after choosing each mode at 390px and 1280px. Confirm three relevant examples, label/content match, readable controls, copy action, no overflow, and samples are below/near the source input.
6. Re-read final UI/config/test diff against SPEC and this plan before running the final gate. Append results to existing `logs/cp032_completion-log_import-review-hardening.md`; update `TODOS.md` only after all gates pass.

## Updated Acceptance Criteria

- Exactly three mode-appropriate examples are offered for each of five modes in Indonesian and English (30 templates total).
- Each template's deterministic facts and AI-eligible facts match explicit expected canonical values; source units have correct disposition and no unsupported fact is invented.
- All supported template facts are mapped in the mocked hybrid pipeline: 100% **of this labeled corpus**, with zero wrong-field/target assignments, zero unexplained loss and zero pending units for designed-supported cases.
- Parser/mock negative tests still preserve ambiguous cases for review and reject cross-scope evidence.
- UI examples and copy controls work and are visually inspected on phone and desktop.
- All required gates pass; no other CP's code/status is changed.

## Rollback

- Revert only CP032-owned template/config/UI/test changes if acceptance fails; preserve all existing local work and data.
- Do not weaken parser/evidence tests or relabel a failing template as supported. Remove or redesign that template and record why.
- No data migration is needed. Do not commit/push/deploy.


## Execution Record (2026-11-23)

- `config/web/import-templates.json` now holds 30 labeled examples: three per mode for each of Indonesian and English. Labels are mode-specific (for example `Tur berlabel + jam`, `Tabel per hari`, `Daftar tempat bernomor`, `Ringkasan fakta aktivitas`); half-day, full-day and multi-day content and schedules differ.
- The examples add only parser-supported syntax: recognized headings for Summary/Overview and list sections, table headers with known roles, labeled activity facts from the existing dictionaries, and place bullets/cards with adjacent description lines. No new parser capability was introduced.
- `src/editor/import/ImportFormats.tsx` shows the template's localized label in the tab and example pane, and wraps long example lines (`whitespace-pre-wrap break-words`) so phones do not scroll horizontally.
- `tests/web/import-templates.test.ts` renders each of the 30 examples through deterministic parse and a CP031-shaped mock AI apply. Assertions cover clean parsing, heading-bounded summary, exact canonical fields, source-unit disposition, zero pending/rejected/omitted units for the designed-supported corpus, and source-backed place descriptions or activity prose.
- Gates on Windows Node 24: `test:web-import` 213 pass, `test:web-editor` 34 pass, `test:web-preview` 12 pass, `typecheck:web-app` and `typecheck:web-server` 0 errors, `check:web-types` passes.
- Browser check in an isolated data directory on temporary ports: all five modes show exactly three distinct example labels at 390px and 1280px; the example pane and page report zero horizontal overflow; the per-mode examples match the selected mode. Temporary servers/data were removed.
- Limitation: “100%” means complete mapping of this synthetic, labeled 30-template corpus through the mocked AI contract. It is not a universal claim for arbitrary real documents; ambiguous or unsupported real input still goes to review. No live provider call, schema, dependency, migration, commit, push or deployment was made for CP032.
