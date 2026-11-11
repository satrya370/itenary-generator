# Standalone Development

Requires Node.js 24+. Keep the editor private/local; the engine intentionally refuses a non-loopback bind. Never put provider credentials in a `VITE_*` variable or client bundle.

1. Install locked dependencies with `npm ci`.
2. In one terminal run `npm run start:web-app` to start the API at `http://127.0.0.1:3000`.
3. In another terminal run `npm run dev:web-app` and open `http://127.0.0.1:5173`.
4. `npm run build:web-app` creates the static shell in `dist/`; start the API after building to serve it from the same origin. The browser verify scripts test whatever was last built, so run `npm run build:web-app` before each `verify:web-*` browser script.

Runtime data defaults to `.runtime/engine.sqlite`, `.runtime/assets/`, `.runtime/published/` and `.runtime/tmp/`. Set `ENGINE_DATA_DIR` before start to select another server-side root. The initial profile/workspace is seeded once and survives restart. Do not serve the data root as static content.

For backup/restore, stop the engine cleanly, copy the entire configured data root, and restore that complete directory while stopped. Database-only copies may be inconsistent with files and are not supported. Verify restore by restarting the engine and opening a known draft and asset. Automatic retention, hot backup and production deployment are not part of CP021.

API request/response and local same-origin write rules are in `editor-ai-api-contract.md`. CP021 implements storage/API, CP022 the four-mode editor, CP023 field-scoped AI, CP024 saved-draft preview/diagnostics, and CP025 immutable web publishing with revocable share link and Open Graph image. Run `npm run build:brochure-css` before preview/publish. Set `SHARE_ORIGIN` to a trusted absolute origin; use a public HTTPS origin reachable by WhatsApp/Meta crawlers to test social cards. Localhost links are only locally reachable. No PDF render/export worker or download endpoint is part of the product. Configure `OPENROUTER_API_KEY` in the server process or point `OPENROUTER_CREDENTIAL_FILE` at a private server-side credential file. Never use a `VITE_*` variable for secrets. The model is fixed to `openai/gpt-6-luna`; provider errors leave manual editing available.

Place autocomplete (CP036) is optional. To turn it on, put one Google Places API (New) key in `GOOGLE_PLACES_API_KEY` in `.env.web` and restart; `GOOGLE_PLACES_DAILY_LIMIT` (default 300, 0-5000) caps Autocomplete requests per UTC day, which keeps the free monthly allowance safe. The key stays on the server; the browser only calls `POST /api/v1/places/autocomplete`. Without a key, or after the cap, the place fields stay plain text inputs. Public pages never call Google; the meeting-point Maps link is only a link. Check Google's caching and attribution terms (the "Powered by Google" logo) before a public launch.

For the bounded live verification, opt in with `OPENROUTER_LIVE_TEST=1` and run `npm run verify:web-ai -- --live --budget-usd=2`. The harness checks current catalog/auth/pricing before dispatch and persists its fixed US$2 ceiling in the dedicated live-test ledger; do not delete or reset that ledger between runs. `npm run verify:web-ai-ui` exercises Generate/Apply/Discard and stale-edit behavior with a deterministic provider double and no external provider requests. `npm run verify:web-readiness` needs a running Docker daemon (Linux containers) and network access; it is not part of the offline gate.
