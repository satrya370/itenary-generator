import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { test, type TestContext } from 'node:test';
import { createApp } from '../../src/server/app.js';
import type { ImportExtractor } from '../../src/server/ai/provider.js';

const FIXTURES = path.resolve('tests/fixtures/web/import');
const origin = 'http://127.0.0.1:3000';
const headers = { origin, 'x-engine-request': '1', 'content-type': 'application/json' };
const CODE = 'IMPORT_SOURCE_TEXT_REMOVED';

const extractor: ImportExtractor = {
  credentialState: 'missing',
  async extract() { throw new Error('the extractor is not used when AI is missing'); }
};

async function setup(t: TestContext) {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'itinerary-removed-'));
  const app = await createApp({ dataDir, publicOrigin: origin, allowedOrigins: [origin], importExtractor: extractor });
  t.after(async () => { await app.close(); await rm(dataDir, { recursive: true, force: true }); });
  return { app, dataDir };
}

async function sourceFrom(app: Awaited<ReturnType<typeof createApp>>, text: string): Promise<string> {
  const response = await app.inject({ method: 'POST', url: '/api/v1/imports/sources', headers, payload: { text } });
  assert.equal(response.statusCode, 201, response.body);
  return response.json().sourceId;
}

const apply = (app: Awaited<ReturnType<typeof createApp>>, sourceId: string, operationId: string) =>
  app.inject({ method: 'POST', url: `/api/v1/imports/sources/${sourceId}/apply`, headers, payload: { operationId, target: 'new', mode: 'full_day', outputLanguage: 'id' } });

test('a removed source answers the same structured message on GET, parse and apply, and never a 500', async (t) => {
  const { app, dataDir } = await setup(t);
  const sourceId = await sourceFrom(app, await readFile(path.join(FIXTURES, 'id-full-day-tidy.txt'), 'utf8'));
  await rm(path.join(dataDir, 'imports', `${sourceId}.txt`));

  const get = await app.inject({ method: 'GET', url: `/api/v1/imports/sources/${sourceId}`, headers });
  assert.equal(get.statusCode, 404);
  assert.equal(get.json().error.code, CODE);
  assert.match(get.json().error.message, /Tempel ulang|upload ulang/);

  const parse = await app.inject({ method: 'POST', url: `/api/v1/imports/sources/${sourceId}/parse`, headers, payload: { mode: 'full_day' } });
  assert.equal(parse.statusCode, 404, parse.body);
  assert.equal(parse.json().error.code, CODE);

  const first = await apply(app, sourceId, randomUUID());
  assert.equal(first.statusCode, 404, first.body);
  assert.equal(first.json().error.code, CODE);

  // The failed run must not stay "running": a second attempt with a new operationId gets the same clear answer, not a busy error.
  const second = await apply(app, sourceId, randomUUID());
  assert.equal(second.statusCode, 404, second.body);
  assert.equal(second.json().error.code, CODE);
});

test('a completed import keeps its report after the source text is removed, and its replay still answers', async (t) => {
  const { app, dataDir } = await setup(t);
  const sourceId = await sourceFrom(app, await readFile(path.join(FIXTURES, 'id-full-day-tidy.txt'), 'utf8'));
  const operationId = randomUUID();
  const done = await apply(app, sourceId, operationId);
  assert.equal(done.statusCode, 201, done.body);
  const itineraryId = done.json().itinerary.id;

  await rm(path.join(dataDir, 'imports', `${sourceId}.txt`));

  const latest = await app.inject({ method: 'GET', url: `/api/v1/imports/operations?itineraryId=${itineraryId}`, headers });
  assert.equal(latest.statusCode, 200, latest.body);
  const operation = latest.json().operation;
  assert.ok(operation.report, 'the report stays in the ledger');
  assert.equal(operation.sourceId, sourceId);

  const replay = await apply(app, sourceId, operationId);
  assert.equal(replay.statusCode, 200, 'a replay of a completed run still returns the stored result');
});
