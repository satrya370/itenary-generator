import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { createApp } from '../../src/server/app.js';

// Opt-in live run for CP032 (real OpenRouter key from .env.web). Not part of the gate.
// Run: IMPORT_LIVE=1 npx tsx scripts/web/verify-import-live.ts
// It uses a fixed set of six imports and prints tokens and cost per import. There is no budget ceiling (D30-3).
if (process.env.IMPORT_LIVE !== '1') {
  console.log('Skipped: set IMPORT_LIVE=1 to run the live import check (uses the real model).');
  process.exit(0);
}
if (existsSync('.env.web')) process.loadEnvFile('.env.web');

const FIXTURES = path.resolve('tests/fixtures/web/import');
const CASES: Array<{ file: string; mode: 'half_day' | 'full_day' | 'multi_day' | 'destination_guide'; language: string }> = [
  { file: 'en-half-day-messy.txt', mode: 'half_day', language: 'en' },
  { file: 'id-full-day-tidy.txt', mode: 'full_day', language: 'id' },
  { file: 'id-multi-day-3.txt', mode: 'multi_day', language: 'id' },
  { file: 'id-destination-guide.txt', mode: 'destination_guide', language: 'id' },
  { file: 'id-whatsapp-injection.txt', mode: 'half_day', language: 'id' },
  { file: 'id-multi-day-15.txt', mode: 'multi_day', language: 'id' }
];

async function main() {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'itinerary-cp032-live-'));
  const origin = 'http://127.0.0.1:3000';
  const app = await createApp({ dataDir, publicOrigin: origin, allowedOrigins: [origin] });
  const headers = { origin, 'x-engine-request': '1', 'content-type': 'application/json' };
  const rows: Array<Record<string, unknown>> = [];
  let totalUsd = 0; let totalTokens = 0;
  try {
    for (const item of CASES) {
      const text = await readFile(path.join(FIXTURES, item.file), 'utf8');
      const source = (await app.inject({ method: 'POST', url: '/api/v1/imports/sources', headers, payload: { text } })).json();
      const applied = await app.inject({ method: 'POST', url: `/api/v1/imports/sources/${source.sourceId}/apply`, headers, payload: { operationId: randomUUID(), target: 'new', mode: item.mode, outputLanguage: item.language } });
      const body = applied.json();
      const usd = Number(body.usage?.actualUsd ?? 0);
      const tokens = Number(body.usage?.promptTokens ?? 0) + Number(body.usage?.completionTokens ?? 0);
      totalUsd += usd; totalTokens += tokens;
      rows.push({
        file: item.file, mode: item.mode, status: applied.statusCode, aiUsed: body.usage?.aiUsed, tokens, actualUsd: body.usage?.actualUsd,
        filled: body.report?.filled?.length, missing: body.report?.missingRequired?.length,
        skipped: (body.report?.skipped ?? []).map((skip: { path: string; message: string }) => skip.path), error: body.error?.code ?? null
      });
    }
    console.log(JSON.stringify({ rows, totalTokens, totalUsd }, null, 2));
  } finally {
    await app.close(); await rm(dataDir, { recursive: true, force: true });
  }
}

await main();
