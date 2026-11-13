# CP031 Revision Plan: Split Import Model

## Reason for Revision
The provider hardcodes one model for import extraction and writing, ignoring the documented model environment variable.

## Clarifications and Decisions
On 2026-11-13 the owner selected separate models through structured clarification: anthropic/claude-haiku-5.5 for import, openai/gpt-oss-120b for writing, sharing one private OpenRouter credential. Run five real text imports with different formats and report usage and outcomes.

## Existing Behavior
Both provider methods use the fixed MODEL_ID. Missing credentials allow deterministic import fallback.

## Required Behavior
OPENROUTER_MODEL selects writing; OPENROUTER_IMPORT_MODEL selects extraction, defaulting to the writing model for compatibility. Private .env.web must remain ignored. Existing injected test providers remain unchanged.

## Proposed Changes
Read model settings from environment at provider module initialization, document separate settings, add model-routing regression tests, and run an isolated five-case real-provider API harness with private temporary data. Do not publish or modify user drafts.

## Impact and Regression Risk
Writing preflight and operation fingerprints must continue to use the writing MODEL_ID. Import must use only the import model. Environment must load before provider imports. Preserve current defaults when variables are absent.

## Verification Plan
Review changes, run provider regression tests and existing AI/import-apply suites without local env injection, then execute five text imports using actual configured credentials. Track provider request models, statuses, tokens, cost, deterministic facts and AI-extracted fields. Do not print credentials. Stop on authentication failures.

## Updated Acceptance Criteria
Separate configured models appear on outgoing requests; private env is ignored; five different text formats exercise live extraction with outcomes reported honestly; no secrets in tracked files. Known pre-existing CRLF/parser and missing PDF-fixture failures remain out of scope.

## Rollback
Unset model overrides to retain previous defaults; revert only changes from this revision. Remove only temporary test data created by this run.
