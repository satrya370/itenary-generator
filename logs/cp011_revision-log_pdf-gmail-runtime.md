# CP011 Revision Log — PDF Renderer and Gmail Delivery Path

Date: 2026-09-20

## Implemented

- Added the ESM package contract in `package.json` with Puppeteer pinned to `25.1.0`.
- Added `scripts/render-pdf.mjs`; it connects to `CHROMIUM_WS_ENDPOINT`, uses print media, `printBackground: true`, `preferCSSPageSize: true`, A4 output, and validates the `%PDF-` signature.
- Added package validation and static renderer tests.
- Updated the live workflow with `Generate PDF`, `PDF Ready?`, and `Send Itinerary PDF - Gmail` nodes. The Gmail node uses the existing remote Gmail OAuth credential and the form's `recipientEmail`, with `satryanegara7@gmail.com` as the smoke-test fallback.
- Updated the AWS Dockerfile/Compose deployment to copy `/home/node/itinerary-engine`, install the package, expose Chromium/PDF environment variables, and persist `/home/node/itinerary-pdfs`.

## Verification

- `npm test` passed.
- `npm run validate` passed.
- Direct AWS container smoke test produced a valid 8,823-byte PDF from Browserless Chromium.
- Public AWS form is available at `/form/itinerary-brochure-intake-pdf` on `n8n.satryapudja.site`.

## Remaining gate

The end-to-end AWS form run reached the workflow but ended in CP001 with `Unexpected error`; Gmail attachment delivery was therefore not accepted as complete. The next action is to inspect the remote execution's upstream credential/API error, then rerun the smoke test and verify the email attachment. CP011 remains `in_progress` until that evidence exists.
