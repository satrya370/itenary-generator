# CP011 Implementation Plan: PDF Generation

## Objective

Add deterministic HTML-to-PDF generation to the existing Itinerary Brochure
Engine without rebuilding its 60-node foundation. HTML remains the source
artifact; PDF is derived from rendered HTML and attached to the later CP012
delivery flow.

## Clarifications and Decisions

- The existing workflow remains the source of truth; only the missing PDF
  stage and its failure branch are added.
- The existing browserless Chromium service is reused through
  CHROMIUM_WS_ENDPOINT.
- The PDF renderer uses Puppeteer with printBackground true, A4 output,
  explicit margins, and preferCSSPageSize.
- Temporary names use the n8n execution ID, never Date.now().
- HTML is retained when PDF generation fails.
- The first smoke-test recipient is satryanegara7@gmail.com; production
  recipient selection remains the form's recipientEmail.

## Scope

- Add a package-local renderer script and dependency lockfile.
- Add a node after Render HTML that writes execution-scoped HTML, connects to
  Chromium, renders the PDF, validates its signature, and returns binary
  attachment metadata.
- Add a bounded failure branch that retains HTML and returns a stable
  pdf_generation_failed code.
- Keep all existing mode-aware HTML and QA behavior unchanged.
- Add fixtures/tests for all four modes and representative multi-page output.

## Out of Scope

- Public tokenized link and Gmail delivery (CP012).
- Public webhook intake (CP016).
- Changes to AI prompts except the CP008 QA revision.
- Replacing Chromium or changing the existing n8n image family.

## Current-State Findings

- Render HTML succeeds in execution 4936 with a 25,566-character HTML result.
- No PDF node, binary attachment, persistent output, or delivery node exists.
- AWS already runs browserless Chromium at ws://chromium:3000.
- Existing IG templates already prove Puppeteer WebSocket connectivity in the
  deployed stack.

## Proposed Changes

1. Add package.json/package-lock.json with pinned Puppeteer and
   PUPPETEER_SKIP_DOWNLOAD support.
2. Copy the renderer and config into /home/node/itinerary-engine.
3. Add Generate PDF Code/Execute Command node after Render HTML.
4. Write HTML to /tmp/n8n-itinerary-<execution-id>.html, render PDF to a
   sibling path, validate %PDF-, and expose binary attachment metadata.
5. Add Handle PDF Failure branch; never discard successful HTML.
6. Keep node timeout bounded and clean temporary files in finally.
7. Set NODE_FUNCTION_ALLOW_BUILTIN only for required fs/path/os/crypto and
   child_process modules, or run the package script through a controlled
   Execute Command node.

## Data Flow or Control Flow

Render HTML → PDF input preparation → Chromium PDF render → PDF validation →
binary attachment + HTML metadata → CP012 publish/delivery.

Failure: Render HTML → PDF failure handler → retained HTML + stable error.

## Files and n8n Workflows Affected

| Artifact | Change |
|---|---|
| package.json/package-lock.json | Pinned PDF runtime |
| scripts/render-pdf.mjs | Chromium PDF renderer |
| tests/fixtures/* | Four mode fixtures |
| tests/render-pdf.test.mjs | Signature and visual/runtime checks |
| Workflow GRuSSwnW38U1HNgK | Add PDF node and failure branch in a revision |
| VPS Dockerfile/Compose | Copy package and retain Chromium endpoint |

## Security and Failure Handling

- User content is written only to execution-scoped temp paths.
- Paths are resolved and constrained; no shell concatenation.
- HTML is self-contained and network requests are blocked during rendering.
- PDF errors are normalized; provider responses and secrets are not returned.
- printBackground true and break-inside avoid are asserted in tests and
  verified visually.

## Verification Plan

- Clean npm install and package validation.
- Render four mode fixtures to HTML and PDF.
- Inspect multi-page PDF visually for backgrounds, clipping, and card splits.
- Run the existing half-day form submission after the QA revision.
- Confirm PDF binary is non-empty and begins with %PDF-.
- Confirm failed Chromium path retains HTML and produces the stable error code.
- Confirm existing workflow nodes/settings/credentials remain intact.

## Acceptance Criteria

- CP008 QA revision passes its regression cases.
- All four modes produce valid PDFs from self-contained HTML.
- PDF backgrounds/gradients survive and card splitting is controlled.
- Temporary files use execution IDs and are cleaned.
- HTML is retained on PDF failure.
- Completion log records execution IDs, file hashes, and visual evidence.

## Risks and Rollback

- Browser incompatibility: revert PDF nodes/package and retain HTML-only flow.
- Memory spike: cap browser concurrency and measure the largest fixture.
- Node timeout: increase only from recorded runtime evidence.
- Rollback to the pre-CP011 workflow version and Docker backup without
  changing unrelated active workflows.
