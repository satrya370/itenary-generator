# CP018‚ÄìCP020 Planner Review: Standalone Engine Foundation

## Verdict

**REVISE ‚Äî 2026-10-06.** CP018 is accepted at its documented availability/feasibility scope; CP019 and CP020 have reproduced defects and need revision before CP021 planning/execution proceeds. This review creates plans, not implementation fixes.

## Evidence Reviewed

- Chapter implementation plan, SPEC, RULES, TODOS and individual completion logs.
- Canonical validator, registry, locale catalogs, legacy adapter, renderer, resource loader, print styles, fixture builder and targeted tests.
- Worker-produced screenshots and PDFs opened during the preceding final verification: six mobile locale screenshots, English desktop renderer, half-day, 14-day, Japanese/Chinese guide and 60-place guide PDFs. Later-page visual coverage is insufficiently documented; see F20-6.
- Planner executed `npm run typecheck:web-contracts`, `npm run test:web-contracts` (18 PASS), `npm run test:web-render` (8 PASS) and the targeted `.runtime/planner-review.ts` probe. Existing passing tests did not exercise the reproduced defects.

## Findings

| Severity | CP | Finding | Reproduction/source |
|---|---|---|---|
| High | CP019 | Malformed JSON collection types throw before schema diagnostics. | Probe: `schedule:{}`, `spots:{}`, `schedule[0].activities:{}` each throws `.forEach is not a function`; `validator.ts:87‚Äì98`. |
| High | CP019/CP020 | Publish-valid required contact/manual themes vanish when derived copies are empty. | Probe: `publishOk:true`, `contact:false`, `themes:false`; registry declares authoritative manual sources and derived copies. |
| Medium | CP020 | Script-incompatible Chinese catalog accepted; supported region fallback inconsistent. | Probe renders `zh-Hant` with `zh-Hans` catalog without errors; `getLocaleCatalog` falls back to `zh` rather than `zh-Hans` for `zh-Hans-CN`. |
| Medium | CP020 | Grouping changes spot order and diagnostics index; accumulator spreading creates quadratic per-group copying. | Probe input groups `A,B,A` outputs `UniquePlace0,UniquePlace2,UniquePlace1`; `render.ts:173‚Äì185`. |
| Medium | CP020 | `gradientOnly:true` ignored when asset is retained/resolved. | Publish-valid probe reports `gradientOnlyStillUsesPhoto:true`; `render.ts:215‚Äì217`. |
| Medium | CP020 | PDF headings can orphan before first activity; later-page long-content evidence incomplete. | Opened half-day PDF page 1 ends with day heading, first activity is page 2; print rules avoid splitting heading but do not keep next block. |
| Medium | CP020 | Mapping/locale visual fixtures do not prove claimed coverage. | Practical/emergency fixture arrays are empty; non-English samples inherit `90 minutes`; desktop capture conditional allows only four English fixtures. |
| Low | CP020 | Font path and emergency screenshot claims inaccurate in log. | `assets/fonts/` contains only `FONT-LICENSES.md`; actual font resources/LICENSE loaded from Fontsource packages; full-day fixture practical contacts empty. |
| Low | Chapter docs | Status overview says all pending; CP018/CP019 rows disagree with completed sections/logs. | `TODOS.md:6,30‚Äì31`; corrected in this review, with CP019/CP020 blocked pending revision. |

## Acceptance Assessment

- CP018: no new implementation defect identified. Public model listing and credential presence are not authentication/inference proof; existing log already states that limitation. Do not enlarge the acceptance claim.
- CP019: R19-1/R19-2 incomplete due derived mapping and malformed-input behavior. Existing migration, locale extensibility and stable-ID tests are positive regression evidence, not proof of the missing cases.
- CP020: R20-1/R20-2/R20-4/R20-5 require revision; existing escaping/offline/image safety tests provide useful R20-3 evidence. R20-6 cannot close the chapter while these findings remain.

## Approved Planning Scope

Structured clarification offered full revisions to CP019 and CP020. User answered **‚Äúbuat revision plannya‚Äù**. Separate revision plans were created:

- `plans/cp019_revision-plan_canonical-schema-and-field-registry.md`
- `plans/cp020_revision-plan_portable-html-renderer.md`

Sequence: execute CP019 revision, log/verify/complete ‚Üí execute CP020 revision, log/verify/complete ‚Üí planner re-review chapter. Only one CP in progress. No worker fix, provider call, dependency installation, deployment or CP021 work is authorized by this planning artifact alone.

## Revision Re-evaluation: 2026-10-06

**Verdict: ACCEPT ó chapter CP018ñCP020.** Both revision plans were executed in the mandated order (CP019 first, then CP020), each with a dated revision section appended to its existing completion log, and CP021 may now proceed to Ask Question + implementation plan.

### Findings disposition

| Finding | Status | Evidence |
|---|---|---|
| F19-1 High ó malformed JSON collections throw before schema diagnostics | FIXED | `logs/cp019_completion-log_...md` ß Revision; probe `.runtime/planner-review.ts` returns structured diagnostics for `schedule:{}`/`spots:{}`/nested activity collections; 22 contract tests pass. |
| F19/20-2 High ó derived contact/themes vanish when derived copies empty | FIXED | CP019 syncs derived copies at clone with `DERIVED_FIELD_UPDATED` warning; renderer falls back to `closing.agencyContact \|\| brochure.agencyContact` and `quickFacts.themes \|\| brochure.themes`; render test asserts the sentinel contact/theme/emergency values in DOM. |
| F20-3 Medium ó script-incompatible Chinese accepted; `zh-Hans-CN` resolution wrong | FIXED | Script-aware `getLocaleCatalog`; test `script incompatible, unknown and incomplete label catalogs fail closed`; probe: `zh-Hant` ? `LOCALE_UNSUPPORTED`, `zh-Hans-CN` ? `zh-Hans` catalog. |
| F20-4 Medium ó guide grouping reorders spots and uses accumulator spreading | FIXED | Contiguous-run grouping with original indexes; test + harness assert `A,B,A` order and 60 interleaved headings with numbering preserved. |
| F20-5 Medium ó `gradientOnly` ignored when asset retained | FIXED | No hero `<img>` emitted and no credit for unrestrained photo; probe `gradientOnlyStillUsesPhoto:false`; dedicated render test. |
| F20-6 Medium ó PDF headings orphan; later-page evidence thin | FIXED | Print `break-after/break-inside: avoid-page` rules (semantic `<header>` for single-day blocks); `scripts/web/print-pagination.py` reports `failures: []` on 11 PDFs with a negative control that reproduces the original stranded-`Multi-day` defect when rules are stripped; targeted page PNGs opened for short-mode boundary, long-activity continuation, later day/group headings and footer credits (see CP020 log ß Targeted PDF Page Evidence). |
| F20-7 Medium ó fixtures do not prove mapping/locale coverage | FIXED | `enrich()` populates practical/emergency, localizes duration labels and contact per locale; desktop screenshots + overflow for all 11 fixtures; DOM assertions for contact, emergency, themes, duration, hero/schedule markup, credit absence. |
| F20-8 Low ó font path and emergency screenshot claims inaccurate | FIXED | CP020 log ß Corrections to Historical Claims retracts and replaces both claims; harness now waits for fonts and image decode and records `browserVersion` (`HeadlessChrome/149.0.7827.22`). |
| F-docs Low ó TODOS status overview inconsistent | FIXED | `TODOS.md` status line and overview table now show CP018ñCP020 `completed` with revision notes. |

### Verification re-run by planner

- `npm run check:web-types`, `npm run typecheck:web-contracts`, `npm run test:web-contracts` (22 pass), `npm run test:web-render` (12 pass), `npm run build:brochure-css`, `npm run verify:web-render` (11 fixtures, `failures: []`), `npm run validate`, `npm test`, `npm audit --audit-level=moderate` (0 vulnerabilities), `git diff --check` ó all green.
- `python scripts/web/print-pagination.py` ? 0 failures; deliberate CSS-stripped run reported 5 defects including the original finding, confirming the check has teeth.
- Visual spot-checks: `half-day-en` p1?p2 boundary, `multi-day-14-en` p5?p6 continuation, `guide-many-en` p10 group transitions and p33 credits, `full-day-en` p2 practical/emergency/credits, `guide-ja` desktop CJK.

### Scope notes retained

- CP018 stays accepted at its documented availability/feasibility scope; the earlier limitation (listing/credential presence is not auth/inference proof) still stands.
- Palette fields `surface`/`textMuted`/`gradientStops` remain intentionally unmapped and are documented as such ó not claimed as covered.
- Fixtures are synthetic; production assets and real copy arrive with workspace integration (CP021+). Rendered fixture output is never to be described as live AI output.
