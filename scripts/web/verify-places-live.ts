import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createApp } from '../../src/server/app.js';

// Opt-in network check (not part of the gate): the real default provider (Photon, no key) behind the real route.
// Run with: npx tsx scripts/web/verify-places-live.ts
const dataDir = await mkdtemp(path.join(os.tmpdir(), 'itinerary-places-live-'));
const origin = 'http://127.0.0.1:3000';
const app = await createApp({ dataDir, publicOrigin: origin, allowedOrigins: [origin] });
try {
  const cases: Array<{ text: string; languageCode: string | null; expect: RegExp }> = [
    { text: 'ubud palace', languageCode: 'en', expect: /Ubud/i },
    { text: 'tanah lot', languageCode: 'id', expect: /Tanah Lot/i },
    { text: 'kiyomizu', languageCode: 'ja', expect: /Kiyomizu|清水/i },
    { text: 'kuta beach', languageCode: null, expect: /Kuta Beach/i }
  ];
  for (const item of cases) {
    const response = await app.inject({ method: 'POST', url: '/api/v1/places/autocomplete', headers: { origin, 'x-engine-request': '1', 'content-type': 'application/json' }, payload: { text: item.text, sessionToken: randomUUID(), languageCode: item.languageCode } });
    assert.equal(response.statusCode, 200, `${item.text}: HTTP ${response.statusCode} ${response.body.slice(0, 160)}`);
    const body = response.json() as { source: string; remainingToday: number; suggestions: Array<{ placeId: string; mainText: string; secondaryText: string }> };
    assert.equal(body.source, 'osm');
    assert.ok(body.suggestions.length > 0 && body.suggestions.length <= 5, `${item.text}: ${body.suggestions.length} suggestions`);
    assert.ok(body.suggestions.some((suggestion) => item.expect.test(suggestion.mainText)), `${item.text}: no suggestion matches ${item.expect}`);
    assert.equal(new Set(body.suggestions.map((suggestion) => suggestion.placeId)).size, body.suggestions.length, `${item.text}: repeated places`);
    console.log(`${item.text} [${item.languageCode ?? 'auto'}] ->`, body.suggestions.map((suggestion) => `${suggestion.mainText} (${suggestion.secondaryText})`).join(' | '), `| left today ${body.remainingToday}`);
  }
  console.log('live check passed');
} finally {
  await app.close(); await rm(dataDir, { recursive: true, force: true });
}
