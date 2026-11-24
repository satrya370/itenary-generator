import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { test, type TestContext } from 'node:test';
import { createApp } from '../../src/server/app.js';
import { parseDocument } from '../../src/server/import/parse/extract.js';

/** Revision real-world-text-coverage, tahap 2: unknown "Label: value" lines are reported and the guide decides their field. */
const origin = 'http://127.0.0.1:3000';
const headers = { origin, 'x-engine-request': '1', 'content-type': 'application/json' };
const noAi = { credentialState: 'missing' as const, async extract() { throw new Error('AI must not be called'); } };

async function fixture(t: TestContext) {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'itinerary-labels-'));
  const app = await createApp({ dataDir, publicOrigin: origin, allowedOrigins: [origin], importExtractor: noAi as never });
  t.after(async () => { await app.close(); await rm(dataDir, { recursive: true, force: true }); });
  return app;
}

const TEXT = ['Tur Lombok', 'Pickup area: Hotel Senggigi', 'Tgl: 5 Januari 2027', 'Spot kumpul: Pasar Bringharjo', 'Email: info@tur.id', '', '08:00 Pantai Kuta'].join('\n');

test('the parser records unknown labels with the kind of value, and keeps the lines for the AI step', () => {
  const r = parseDocument(TEXT, 'full_day');
  const labels = r.unknownLabels.map((item) => [item.label, item.valueType]);
  assert.deepEqual(labels, [['Pickup area', 'text'], ['Spot kumpul', 'text'], ['Email', 'email']]);
  assert.ok(r.unconsumed.some((line) => line.text === 'Pickup area: Hotel Senggigi'), 'the line is still available to the AI step');
});

test('a known label is never reported as unknown', () => {
  const r = parseDocument(lines('Tur Bali', 'Tgl: 5 Januari 2027', 'WA: 0812-3456-7890', '08:00 Pura'), 'full_day');
  assert.equal(r.unknownLabels.length, 0);
});

test('a date and a time under unknown labels are typed from their shape', () => {
  const r = parseDocument(lines('Tur Bali', 'Dibuat: 12 Des 2026', 'Jam mulai: 08:00', '08:00 Pura'), 'full_day');
  assert.deepEqual(r.unknownLabels.map((item) => item.valueType), ['date', 'time']);
});

test('the apply report lists each unknown label with the fields it may go to, and a destination guide has no schedule fields', async (t) => {
  const app = await fixture(t);
  const created = await app.inject({ method: 'POST', url: '/api/v1/imports/sources', headers, payload: { text: TEXT } });
  const sourceId = created.json().sourceId;
  const applied = await app.inject({ method: 'POST', url: `/api/v1/imports/sources/${sourceId}/apply`, headers, payload: { operationId: randomUUID(), target: 'new', mode: 'full_day', outputLanguage: 'id' } });
  assert.equal(applied.statusCode, 201, applied.body);
  const candidates = applied.json().report.review.unknownLabels;
  assert.equal(candidates.length, 3);
  assert.deepEqual(candidates[0].targets, ['guide.name', 'meeting.place', 'trip.destination', 'trip.country', 'policies']);
  assert.deepEqual(candidates[2].targets, [], 'an email has no field and can only be ignored');
  const guideTargets = await app.inject({ method: 'POST', url: `/api/v1/imports/sources/${sourceId}/apply`, headers, payload: { operationId: randomUUID(), target: 'new', mode: 'destination_guide', outputLanguage: 'id' } });
  assert.ok(!guideTargets.json().report.review.unknownLabels[0].targets.includes('meeting.place'));
});

test('a guide sends an unknown label to one field; the value is copied from the source and the draft is revised', async (t) => {
  const app = await fixture(t);
  const sourceId = (await app.inject({ method: 'POST', url: '/api/v1/imports/sources', headers, payload: { text: TEXT } })).json().sourceId;
  const applied = (await app.inject({ method: 'POST', url: `/api/v1/imports/sources/${sourceId}/apply`, headers, payload: { operationId: randomUUID(), target: 'new', mode: 'full_day', outputLanguage: 'id' } })).json();
  const operationId = applied.operationId;
  const revision = applied.itinerary.revision;
  const resolved = await app.inject({ method: 'POST', url: `/api/v1/imports/operations/${operationId}/resolve`, headers, payload: { expectedRevision: revision, candidateId: 'label-1', action: 'select', target: 'meeting.place' } });
  assert.equal(resolved.statusCode, 200, resolved.body);
  assert.equal(resolved.json().itinerary.draftContent.meeting.place, 'Hotel Senggigi');
  assert.equal(resolved.json().report.review.unknownLabels[0].status, 'resolved');
  assert.equal(resolved.json().report.review.unknownLabels[0].decision.provenance, 'source');
});

test('a target that was not offered for the label is refused; nothing changes', async (t) => {
  const app = await fixture(t);
  const sourceId = (await app.inject({ method: 'POST', url: '/api/v1/imports/sources', headers, payload: { text: TEXT } })).json().sourceId;
  const applied = (await app.inject({ method: 'POST', url: `/api/v1/imports/sources/${sourceId}/apply`, headers, payload: { operationId: randomUUID(), target: 'new', mode: 'full_day', outputLanguage: 'id' } })).json();
  const refused = await app.inject({ method: 'POST', url: `/api/v1/imports/operations/${applied.operationId}/resolve`, headers, payload: { expectedRevision: applied.itinerary.revision, candidateId: 'label-3', action: 'select', target: 'guide.phone' } });
  assert.equal(refused.statusCode, 422);
  assert.equal(refused.json().error.code, 'IMPORT_REVIEW_UNSUPPORTED');
});

test('a value that does not fit the field is refused with a clear code', async (t) => {
  const app = await fixture(t);
  const sourceId = (await app.inject({ method: 'POST', url: '/api/v1/imports/sources', headers, payload: { text: lines('Tur Bali', 'Titik temu: Pura Tirta', 'Nomor kantor: sudah tutup', '08:00 Pura') } })).json().sourceId;
  const applied = (await app.inject({ method: 'POST', url: `/api/v1/imports/sources/${sourceId}/apply`, headers, payload: { operationId: randomUUID(), target: 'new', mode: 'full_day', outputLanguage: 'id' } })).json();
  const refused = await app.inject({ method: 'POST', url: `/api/v1/imports/operations/${applied.operationId}/resolve`, headers, payload: { expectedRevision: applied.itinerary.revision, candidateId: 'label-2', action: 'select', target: 'trip.startDate' } });
  assert.equal(refused.statusCode, 422);
});

test('an ignored label changes nothing in the draft; a second decision on it is refused', async (t) => {
  const app = await fixture(t);
  const sourceId = (await app.inject({ method: 'POST', url: '/api/v1/imports/sources', headers, payload: { text: TEXT } })).json().sourceId;
  const applied = (await app.inject({ method: 'POST', url: `/api/v1/imports/sources/${sourceId}/apply`, headers, payload: { operationId: randomUUID(), target: 'new', mode: 'full_day', outputLanguage: 'id' } })).json();
  const ignored = await app.inject({ method: 'POST', url: `/api/v1/imports/operations/${applied.operationId}/resolve`, headers, payload: { expectedRevision: applied.itinerary.revision, candidateId: 'label-2', action: 'ignore' } });
  assert.equal(ignored.statusCode, 200, ignored.body);
  assert.equal(ignored.json().report.review.unknownLabels[1].status, 'ignored');
  const again = await app.inject({ method: 'POST', url: `/api/v1/imports/operations/${applied.operationId}/resolve`, headers, payload: { expectedRevision: ignored.json().itinerary.revision, candidateId: 'label-2', action: 'ignore' } });
  assert.equal(again.statusCode, 409);
});

test('a stale revision is refused; nothing is written', async (t) => {
  const app = await fixture(t);
  const sourceId = (await app.inject({ method: 'POST', url: '/api/v1/imports/sources', headers, payload: { text: TEXT } })).json().sourceId;
  const applied = (await app.inject({ method: 'POST', url: `/api/v1/imports/sources/${sourceId}/apply`, headers, payload: { operationId: randomUUID(), target: 'new', mode: 'full_day', outputLanguage: 'id' } })).json();
  const stale = await app.inject({ method: 'POST', url: `/api/v1/imports/operations/${applied.operationId}/resolve`, headers, payload: { expectedRevision: applied.itinerary.revision + 5, candidateId: 'label-1', action: 'select', target: 'guide.name' } });
  assert.equal(stale.statusCode, 409);
  assert.equal(stale.json().error.code, 'REVISION_CONFLICT');
});

function lines(...rows: string[]) { return rows.join('\n'); }
