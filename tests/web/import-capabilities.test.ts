import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { createApp } from '../../src/server/app.js';
import type { AiProvider, ImportExtractor } from '../../src/server/ai/provider.js';

const origin = 'http://127.0.0.1:3000';

function writingProvider(credentialState: 'configured' | 'missing'): AiProvider {
  return {
    credentialState,
    async preflight() { throw new Error('not called in this test'); },
    async generate() { throw new Error('not called in this test'); }
  };
}

function importExtractor(credentialState: 'configured' | 'missing'): ImportExtractor {
  return { credentialState, async extract() { throw new Error('not called in this test'); } };
}

async function capabilitiesFor(writing: 'configured' | 'missing', imports: 'configured' | 'missing') {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'itinerary-caps-'));
  const app = await createApp({ dataDir, publicOrigin: origin, allowedOrigins: [origin], aiProvider: writingProvider(writing), importExtractor: importExtractor(imports) });
  try {
    const response = await app.inject({ method: 'GET', url: '/api/v1/itinerary-engine/context' });
    assert.equal(response.statusCode, 200);
    return response.json().capabilities;
  } finally {
    await app.close();
    await rm(dataDir, { recursive: true, force: true });
  }
}

test('import AI status comes from the import extractor, not from the writing AI (both crossed states)', async () => {
  const writingOffImportOn = await capabilitiesFor('missing', 'configured');
  assert.equal(writingOffImportOn.ai.credentialState, 'missing');
  assert.equal(writingOffImportOn.import.aiConfigured, true);

  const writingOnImportOff = await capabilitiesFor('configured', 'missing');
  assert.equal(writingOnImportOff.ai.credentialState, 'configured');
  assert.equal(writingOnImportOff.import.aiConfigured, false);

  const bothOn = await capabilitiesFor('configured', 'configured');
  assert.equal(bothOn.import.aiConfigured, true);
});

test('import limits in capabilities are the same constants the intake enforces', async () => {
  const caps = await capabilitiesFor('missing', 'missing');
  assert.deepEqual(
    { maxTextChars: caps.import.maxTextChars, maxPdfBytes: caps.import.maxPdfBytes, maxPdfPages: caps.import.maxPdfPages },
    { maxTextChars: 120_000, maxPdfBytes: 10 * 1024 * 1024, maxPdfPages: 60 }
  );
  assert.equal(caps.import.retentionDays, 30);
});
