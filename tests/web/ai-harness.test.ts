import assert from 'node:assert/strict';
import { test } from 'node:test';
import { aiRateWindowWaitMs } from '../../scripts/web/ai-live-rate.js';

test('live harness rate window resumes from persisted operation timestamps', () => {
  const now = Date.parse('2026-10-07T12:00:00.000Z');
  assert.equal(aiRateWindowWaitMs([], now), 0);
  assert.equal(aiRateWindowWaitMs([new Date(now - 61_000).toISOString(), new Date(now - 30_000).toISOString()], now), 0);
  assert.equal(aiRateWindowWaitMs([new Date(now - 30_000).toISOString(), new Date(now - 10_000).toISOString()], now), 31_000);
  assert.equal(aiRateWindowWaitMs([new Date(now - 30_000).toISOString(), new Date(now - 10_000).toISOString()], now + 31_001), 0);
});
