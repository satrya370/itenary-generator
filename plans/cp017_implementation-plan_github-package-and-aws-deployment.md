# CP017 Implementation Plan: GitHub Package and AWS Deployment

## Objective

Package the Itinerary Brochure Engine as a reproducible, credential-safe npm
project, publish it to https://github.com/satrya370/itenary-generator.git,
and deploy the completed workflow to the existing AWS n8n stack at
/home/ubuntu/n8n-deploy.

The production result must generate self-contained HTML, derive a visually
verified PDF, retain both artifacts behind an unguessable long-lived URL, and
deliver the link plus PDF through email. Deployment must preserve the active
Meeting Notes, Receipt OCR, IG Content Builder, and SWOT Generator workflows.

## Clarifications and Decisions

- Ask Question decision, 2026-09-20: the GitHub target is exactly
  satrya370/itenary-generator. The spelling itenary is retained because it is
  the actual repository URL supplied by the user.
- Package JSON, lockfile, workflow JSON, renderer, configuration, tests, and
  deployment documentation belong in that repository.
- The supplied workflow ID omitted its final character. Read-only API checks
  established that GRuSSwnW38U1HNg returns 404, while the live workflow is
  GRuSSwnW38U1HNgK, named Itinerary Brochure Engine - Foundation.
- This is a production deployment, not an HTML-only archival migration.
  CP011 (PDF), CP012 (publish link and email), CP013 (end-to-end verification),
  and CP016 (public webhook intake) are hard readiness gates. CP017 may be
  planned now but may not enter in_progress until those CPs are completed and
  their logs exist.
- Reuse the existing browserless Chromium service. Do not introduce a second
  browser container.
- Serve generated output under
  https://n8n.satryapudja.site/itinerary-output/<token>/ to avoid a new DNS
  dependency. The nginx route is more specific than the existing root proxy.
- Default artifact retention is 365 days, within SPEC D5's 6–12 month window.
- Credentials are remapped on the target by approved name and type. IDs and
  credential payloads never enter source control.

## Scope

1. Audit and export the exact current workflow from local n8n.
2. Sanitize the export into a portable, inactive workflow JSON.
3. Create a minimal npm package for deterministic HTML rendering and PDF
   generation through the existing browserless Chromium endpoint.
4. Package configuration, fixtures, tests, validation, deployment scripts,
   CI, and documentation.
5. Push an allowlisted, secret-scanned commit to the GitHub repository.
6. Back up and merge the package into the existing AWS Docker/Compose stack.
7. Add persistent output storage and an nginx static route.
8. Remap credentials and inject environment-only secrets.
9. Import, verify, activate, and test the production workflow.
10. Produce factual deployment and completion evidence.

Execution follows Discuss → Planning → Working → Review → Test → Revise.
CP017 remains pending during this planning-only turn.

## Out of Scope

- Redesigning the brochure or landing page.
- Changing the four itinerary modes or their content contract.
- Adding pricing, opening-hour claims, OTA behavior, maps, or geocoding.
- Exporting credential values, n8n encryption keys, databases, execution
  payloads, customer emails, PEM keys, or generated client output.
- Replacing the existing n8n, nginx, or Chromium architecture.
- Migrating unrelated workflows or changing their credentials.
- Creating a second public hostname unless path-based static serving proves
  impossible during implementation.

## Current-State Findings

### Workflow

- Verified live local workflow: GRuSSwnW38U1HNgK.
- Current state: active, 60 nodes.
- Composition: 41 Code, 10 IF, 7 HTTP Request, one Form Trigger, and one
  Stop-and-Error node.
- The current workflow ends at HTML layout (Render HTML / Guide Layout).
  It has no PDF node, static publish stage, Gmail node, or public webhook.
- Current Form Trigger path is itinerary-brochure-intake; its webhook ID is
  instance-specific.
- Success execution data is currently saved as all. Production privacy and
  storage retention must be explicitly reviewed before activation.

### Dependencies and credentials

- AI endpoints: Koboillm and OpenRouter.
- Photo endpoint: Unsplash. The workflow references
  $env.UNSPLASH_ACCESS_KEY; AWS Compose does not currently provide it.
- Local credential names do not exactly match target credential names:
  KobiLLM OSS 120B (httpHeaderAuth) and OpenRouter - GPT 5.6 Luna need an
  explicit target mapping.
- AWS has compatible httpHeaderAuth credentials, but each needs a
  non-destructive provider probe before assignment.
- AWS has Gmail OAuth credentials, but only an actual send-to-self attachment
  test can prove the selected OAuth credential remains valid.

### Repository and package

- git ls-remote returned no visible branch/ref, so initialize main with a
  clean root commit after verification.
- itinerary-engine has no product-level package.json or package-lock.json.
- render-itinerary-html.js uses Node built-ins only and is ESM.
- Development evidence directories contain execution payloads, screenshots,
  PDFs, temporary workflow exports, Playwright caches, and test emails. These
  must not enter the deployable package.

### AWS runtime

- Deployment root: /home/ubuntu/n8n-deploy.
- n8n is pinned to 2.38.5 with FFmpeg and existing package layers.
- Chromium is ghcr.io/browserless/chromium:latest at ws://chromium:3000,
  timeout 120 seconds, concurrency 2.
- Host nginx terminates TLS and proxies n8n.satryapudja.site to
  127.0.0.1:5678.
- Audit capacity: 7.6 GiB RAM, about 6.2 GiB available, and 67 GiB disk
  available. No swap exists; this is a recorded risk, not a blocker at the
  measured capacity.

## Proposed Changes

### 1. Production-readiness gate

Before CP017 Working:

1. Complete CP011 with browserless PDF generation and visual proof.
2. Complete CP012 with tokenized links, email, retention, and fallback.
3. Complete CP016 with public webhook/form convergence and rate limiting.
4. Complete CP013 after the above behavior exists, exercising all modes and
   languages.
5. Verify matching completion logs. A failed or missing gate keeps CP017
   pending; a partial workflow is not promoted.

### 2. Repository layout

The public repository will contain only deployment-ready artifacts:

    itenary-generator/
    ├── .dockerignore
    ├── .env.example
    ├── .gitignore
    ├── README.md
    ├── package.json
    ├── package-lock.json
    ├── config/
    │   ├── config.json
    │   ├── itinerary-schema.json
    │   ├── mode-profiles.json
    │   ├── palettes.json
    │   └── travel-rules.json
    ├── src/
    │   └── render-itinerary-html.js
    ├── scripts/
    │   ├── render-html.mjs
    │   ├── render-pdf.mjs
    │   ├── publish-output.mjs
    │   ├── prepare-workflow.mjs
    │   ├── validate-package.mjs
    │   ├── remap-credentials.py
    │   ├── deploy-vps.sh
    │   ├── verify-vps.sh
    │   └── rollback-vps.sh
    ├── workflows/
    │   └── itinerary-generator.json
    ├── tests/
    │   ├── fixtures/
    │   │   ├── half-day.json
    │   │   ├── full-day.json
    │   │   ├── multi-day.json
    │   │   └── destination-guide.json
    │   ├── render-html.test.mjs
    │   ├── render-pdf.test.mjs
    │   └── package-security.test.mjs
    ├── deploy/
    │   ├── Dockerfile.fragment
    │   ├── docker-compose.override.yml
    │   ├── nginx-itinerary-output.conf
    │   └── manifest.json
    ├── docs/
    │   ├── architecture.md
    │   ├── deployment.md
    │   ├── verification.md
    │   └── rollback.md
    └── .github/workflows/ci.yml

Explicit exclusions:

- output/, e2e-pdf-results/, .playwright-cli/, .sites-runtime/
- exec*.json, wf-*.json, screenshots, generated HTML/PDF
- .env files except .env.example
- PEM files, Credential_information.md, n8n databases/config, credential
  exports, API keys, OAuth tokens, and raw submissions

### 3. package.json and lockfile

Create a product-level package with:

- name itenary-generator, matching the repository slug;
- private true, because this is a deployment package;
- type module;
- Node engine compatible with the target n8n image (minimum 22, rechecked
  against the candidate image);
- puppeteer pinned through the lockfile and aligned with the already proven IG
  renderer version;
- PUPPETEER_SKIP_DOWNLOAD=true in Docker, so the package reuses the separate
  Chromium service;
- no DOCX dependencies.

Planned npm scripts:

    validate          node scripts/validate-package.mjs
    test              node --test tests/*.test.mjs
    render:html       node scripts/render-html.mjs
    render:pdf        node scripts/render-pdf.mjs
    prepare:workflow  node scripts/prepare-workflow.mjs
    check             npm run validate && npm test

Generate the lockfile with the same npm major used in the target image.
npm ci --omit=dev must work from a clean directory.

### 4. PDF and artifact scripts

render-pdf.mjs will:

- connect to CHROMIUM_WS_ENDPOINT rather than launch a browser;
- accept explicit input/output paths and never interpolate shell commands;
- use execution-scoped temp names based on $execution.id passed by n8n;
- load self-contained HTML and block unexpected network requests;
- emulate print media;
- generate A4 with printBackground true, explicit margins, and
  preferCSSPageSize true;
- validate the PDF signature and non-trivial size;
- close page/browser connections in finally;
- return stable error codes without secret or internal path disclosure.

publish-output.mjs will:

- generate or accept a cryptographically random token with at least 128 bits
  of entropy;
- create /home/node/itinerary-output/<token>/ with safe permissions;
- atomically write index.html and itinerary.pdf;
- reject traversal and symlink targets;
- return only public URL, PDF path, token, and artifact metadata;
- never publish canonical input JSON or recipient email.

### 5. Workflow export and sanitization

prepare-workflow.mjs will:

- require source ID GRuSSwnW38U1HNgK;
- remove workflow/version IDs, active-version metadata, sharing/ownership,
  timestamps, tags, pin/static data, and execution metadata;
- set active false;
- preserve node names, graph, error branches, timeouts, and bounded retries;
- replace credential objects with approved names and types only;
- preserve the Unsplash environment reference without resolving its value;
- reject Windows paths, localhost callbacks, tunnel URLs, bearer tokens,
  API keys, OAuth values, and credential IDs;
- assign a stable production form/webhook path only in the deploy copy;
- keep public and deploy JSON separate; deploy JSON remains ignored.

The deploy remapper resolves remote credential IDs by exact approved name and
type. Zero or multiple matches fail closed.

### 6. GitHub publication

1. Initialize an isolated Git repository inside the staging package, not the
   dirty parent workspace.
2. Add only the allowlisted tree above.
3. Run npm ci --omit=dev, npm run check, workflow schema checks, and a staged
   secret scan.
4. Review git diff --cached --stat and the complete staged file list.
5. Commit to main and push to the supplied repository.
6. Confirm git ls-remote equals the reviewed local commit.
7. Run GitHub Actions on Node versions matching development and production.
   CI renders HTML and runs package/security tests; PDF testing uses a service
   Chromium or remains a separately named production-runtime job.

### 7. AWS Docker and Compose merge

Dockerfile changes are additive:

- keep n8n 2.38.5, FFmpeg, IG packages, and SWOT package unchanged;
- copy itinerary package manifests first for layer caching;
- run npm ci --omit=dev under /home/node/itenary-generator with browser
  download disabled;
- copy src/, scripts/, and config/ with node ownership;
- do not install a second browser binary.

Compose changes:

- add ./itinerary-output:/home/node/itinerary-output;
- retain CHROMIUM_WS_ENDPOINT=ws://chromium:3000;
- inject UNSPLASH_ACCESS_KEY from a root-owned deployment environment file,
  never the repository;
- extend NODE_FUNCTION_ALLOW_BUILTIN only as required, adding crypto to the
  existing fs,path,os,child_process list;
- preserve all current ports, volumes, services, and workflow mounts;
- add an explicit runner timeout only if CP011 measurements require it;
- validate the merged model with docker compose config.

### 8. Persistent static route

Create /home/ubuntu/n8n-deploy/itinerary-output with n8n-write/nginx-read
permissions. Add a specific nginx location before the general proxy:

    location ^~ /itinerary-output/ {
        alias /home/ubuntu/n8n-deploy/itinerary-output/;
        index index.html;
        autoindex off;
        add_header X-Robots-Tag "noindex, nofollow, noarchive" always;
        add_header X-Content-Type-Options "nosniff" always;
        try_files $uri $uri/ =404;
    }

Also deny dotfiles and malformed token paths, prove traversal returns 404, run
nginx -t, and reload rather than restart nginx. Output files must be readable
by nginx without making the directory world-writable.

### 9. Credential and environment mapping

| Workflow requirement | Candidate target | Gate |
|---|---|---|
| Koboillm httpHeaderAuth | Existing KobiLLM authorization | Minimal authenticated model request |
| OpenRouter httpHeaderAuth | Existing OpenRouter authorization | Minimal request for each configured model |
| Gmail OAuth2 | Selected existing Gmail credential | Send-to-self with small attachment |
| Unsplash | UNSPLASH_ACCESS_KEY environment secret | Search plus usage/download callback |

Credential IDs exist only in ignored deploy JSON. A missing, ambiguous, or
expired credential blocks activation and never triggers a credential export.

### 10. AWS deployment sequence

1. Record image IDs, active workflows, hashes, disk, and memory.
2. Back up Dockerfile, Compose, nginx site, SQLite plus WAL/SHM, n8n config,
   and package manifests with restricted permissions.
3. Upload package to /home/ubuntu/n8n-deploy/itenary-generator.
4. Create and chown the persistent output directory.
5. Build the candidate image without recreating running n8n.
6. Run candidate-container smoke tests for npm, HTML, Chromium, PDF, and
   persistent writes.
7. Validate and reload nginx static routing.
8. Recreate only n8n; keep Chromium running.
9. Confirm n8n health/version, existing modules, Chromium, and all existing
   active workflows.
10. Generate deploy JSON with a new production ID, target credential IDs, and
    collision-free webhook/form identifiers.
11. Import inactive. Export back and compare nodes, graph, settings,
    credential types/names, and code hashes.
12. Activate only after all pre-activation checks pass.
13. Submit tests with actual rendered form field names or the CP016 webhook
    contract, not guessed internal field names.
14. On any critical failure, unpublish and rollback before continuing.

## Data Flow or Control Flow

    Public form/webhook
      → validation and mode resolution
      → brief interpretation
      → schedule/guide skeleton
      → venue verification
      → travel-time guard / bounded repair
      → final copy and canonical itinerary
      → photo acquisition / gradient fallback
      → deterministic QA gate
      → self-contained HTML
      → execution-scoped HTML temp file
      → browserless Chromium PDF
      → tokenized persistent output
      → public HTML/PDF URL
      → Gmail delivery
      → safe success or retained-artifact failure response

Failure rules:

- AI, verification, or QA failures fail closed before publishing.
- Photo failure uses the approved gradient fallback.
- PDF failure retains HTML and returns a stable code.
- Email failure retains artifacts and returns the public link where possible.
- Publish failure prevents email from claiming a valid public link.

## Files and n8n Workflows Affected

| Artifact | Planned change |
|---|---|
| itinerary-engine/TODOS.md | Register CP017 and dependencies |
| This plan | Define package/GitHub/AWS execution |
| Staging repository itenary-generator/ | New sanitized public package |
| Workflow GRuSSwnW38U1HNgK | Read-only source export in CP017 |
| New AWS itinerary workflow | Imported deploy copy, initially inactive |
| VPS Dockerfile | Add itinerary package layer |
| VPS docker-compose.yml | Output mount, env, required built-ins |
| VPS itinerary-output/ | Persistent generated artifacts |
| nginx n8n site | Specific static output route |
| satrya370/itenary-generator | New main branch package commit |

No other product source directory is modified. Existing deployment files are
edited only after timestamped backups exist.

## Security and Failure Handling

- Never commit API keys, OAuth data, credential IDs, databases, .env files,
  PEM keys, execution exports, recipient emails, or generated itineraries.
- Secret-scan both the public package and ignored deploy JSON.
- Delete deploy JSON from upload staging after successful import.
- Use execFile argument arrays; never concatenate user input into shell.
- Resolve and validate every path inside approved temp/output roots.
- Use 128-bit-or-stronger tokens, no directory listing, and noindex headers.
- Escape every user/model field before HTML insertion.
- Normalize email/provider errors; raw responses never reach the form.
- Preserve provider timeouts, bounded retries, and fail-closed QA.
- Configure rate limiting for public intake before promotion.
- Start the 365-day cleanup in dry-run/report mode. Destructive cleanup only
  follows target-root validation and a reviewed retention fixture.
- Keep the workflow inactive on credential, image, nginx, package, or visual
  verification failure.

## Verification Plan

### A. Package and repository

1. Fresh clone main into an empty directory.
2. npm ci --omit=dev succeeds.
3. npm run validate verifies required files, schema, expected workflow nodes,
   inactivity, and forbidden-pattern scans.
4. npm test passes HTML, PDF, path-safety, token, schema, and security tests.
5. Each fixture renders self-contained HTML with network access blocked.
6. Staged files contain no excluded evidence/output.
7. GitHub Actions passes and remote main equals the reviewed commit.

### B. Standalone AWS runtime

1. docker compose config passes.
2. Candidate image builds without browser download.
3. Node/npm versions and package import are recorded.
4. Browserless WebSocket connection succeeds.
5. Four fixture PDFs have valid signatures and non-zero size.
6. Visually inspect representative pages: gradients, no split cards, readable
   typography, expected page counts, and unclipped closing sections.
7. HTML request logging proves no CDN/unexpected asset dependency.

### C. Workflow import and configuration

1. Imported node/connection count matches the deploy artifact.
2. Export-after-import has no local credential IDs or tunnel URLs.
3. Koboillm, OpenRouter, Gmail, and Unsplash probes pass.
4. Workflow starts inactive and has no webhook collision.
5. Production path resolves only after intended activation.
6. saveDataSuccessExecution is intentionally set and rechecked after every
   workflow update.

### D. End-to-end production matrix

| Case | Required result |
|---|---|
| half_day, Indonesian | Valid HTML, PDF, link, email |
| full_day, English | Valid HTML, PDF, link, email |
| multi_day, 14 days | Condensed layout, expected page count |
| destination_guide, many spots | Grouped guide, no schedule times |
| Hero override | Unsplash search skipped |
| Obscure destination | Gradient fallback |
| Impossible itinerary | Guard blocks or bounded repair succeeds |
| 10-hour half-day | Rejected |
| Malformed/oversized input | Safe validation response |
| Invalid AI JSON/timeout | Stable failure; no publish/email |
| PDF renderer unavailable | HTML retained; no false PDF claim |
| Gmail failure | Files retained and link recoverable |
| Traversal/enumeration attempt | 404 or denied |

For every success, inspect HTML and PDF visually, verify no monetary claims,
opening-hour/ticket claims, or OTA tells, and verify email attachment opens.

### E. Regression and operations

1. n8n and Chromium containers are healthy.
2. n8n health and public HTTPS paths return expected status.
3. Meeting Notes, Receipt OCR, IG Content Builder, and SWOT remain active and
   pass their smallest safe health check.
4. Existing volumes and output files remain present.
5. nginx -t passes, TLS remains valid, and editor/form proxy still works.
6. Record disk and memory during the largest PDF.
7. Validate rollback commands and backup hashes.

## Acceptance Criteria

- CP011, CP012, CP013, and CP016 are completed with matching logs.
- GitHub main contains the reviewed sanitized package and CI passes.
- Clean npm ci --omit=dev and npm run check pass.
- No secret, credential value/ID, PII dump, generated client output, or local
  path is committed.
- Candidate image builds and connects to existing Chromium.
- Existing n8n products remain operational.
- Production workflow has its own ID and collision-free paths, and activates
  only after gates pass.
- All four modes pass live end-to-end tests.
- HTML/PDF visual checks pass; PDF preserves backgrounds and card integrity.
- Each successful run produces an unguessable link and valid PDF.
- Gmail sends the correct link and non-empty attachment.
- Unsplash attribution/fallback passes.
- Static route blocks listing, traversal, and malformed paths.
- Timestamped backup and validated rollback exist.
- Completion log records commands, execution IDs, hashes, and token-redacted
  URLs.

## Risks and Rollback

| Risk | Mitigation |
|---|---|
| Partial workflow mistaken as ready | Hard gate on CP011/12/13/16 |
| Credential mismatch | Exact name/type mapping and probes |
| Missing Unsplash env | Pre-activation check and fallback test |
| Browser incompatibility | Pin package and smoke-test existing Chromium |
| PDF memory spike | Chromium concurrency 2 and largest-fixture measurement |
| Task timeout | Set timeout only from CP011 measurements |
| Public link enumeration | 128-bit token, no listing, strict routing |
| Storage growth | 365-day retention and disk monitoring |
| nginx route shadows n8n | Exact route, nginx -t, regression tests |
| Import overwrites workflow | New ID, inactive import, export-back comparison |
| Existing products break | Targeted recreation and immediate rollback |

Rollback:

1. Deactivate only the new itinerary workflow.
2. Restore Dockerfile/Compose backup and recreate only n8n.
3. Restore nginx backup, run nginx -t, and reload.
4. Restore SQLite plus WAL/SHM and n8n config only if import/credential
   metadata is corrupted; stop n8n before database restoration.
5. Quarantine rather than delete itinerary output so artifacts are recoverable.
6. Verify existing workflow IDs/states against the pre-deployment inventory.
7. Record rollback evidence; keep CP017 in_progress or blocked, never
   completed.
