import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { test, type TestContext } from 'node:test';
import { createApp } from '../../src/server/app.js';
import { OpenRouterProvider, ProviderFailure, type ImportExtractRequest, type ImportExtractor } from '../../src/server/ai/provider.js';
import type { WebItineraryContent } from '../../src/contracts/types.js';

const FIXTURES = path.resolve('tests/fixtures/web/import');
const origin = 'http://127.0.0.1:3000';
const headers = { origin, 'x-engine-request': '1', 'content-type': 'application/json' };
const fixtureText = (name: string) => readFile(path.join(FIXTURES, name), 'utf8');

/** Deterministic provider double: replies come from a queue; every call is recorded. */
function double(replies: Array<string | Error>, credentialState: 'configured' | 'missing' = 'configured') {
  const calls: ImportExtractRequest[] = [];
  let gate: Promise<void> | null = null;
  let release: (() => void) | null = null;
  const extractor: ImportExtractor = {
    credentialState,
    async extract(request) {
      calls.push(request);
      if (gate) await gate;
      const next = replies.shift();
      if (next instanceof Error) throw next;
      return { text: next ?? '{}', usage: { promptTokens: 100, completionTokens: 50, costUsd: 0.001 } };
    }
  };
  return { extractor, calls, hold() { gate = new Promise<void>((resolve) => { release = resolve; }); }, let() { release?.(); gate = null; } };
}

async function fixture(t: TestContext, extractor: ImportExtractor) {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'itinerary-cp031-'));
  const app = await createApp({ dataDir, publicOrigin: origin, allowedOrigins: [origin], importExtractor: extractor });
  t.after(async () => { await app.close(); await rm(dataDir, { recursive: true, force: true }); });
  return app;
}

async function source(app: Awaited<ReturnType<typeof createApp>>, text: string): Promise<string> {
  const response = await app.inject({ method: 'POST', url: '/api/v1/imports/sources', headers, payload: { text } });
  assert.equal(response.statusCode, 201, response.body);
  return response.json().sourceId;
}

const apply = (app: Awaited<ReturnType<typeof createApp>>, sourceId: string, payload: Record<string, unknown>) =>
  app.inject({ method: 'POST', url: `/api/v1/imports/sources/${sourceId}/apply`, headers, payload });

const op = () => randomUUID();

test('the extraction prompt names the exact reply keys, so the model cannot invent its own shape', async () => {
  const bodies: Array<{ messages: Array<{ role: string; content: string }> }> = [];
  const fakeFetch = (async (_url: string | URL | Request, init?: RequestInit) => {
    bodies.push(JSON.parse(String(init?.body)));
    return new Response(JSON.stringify({ choices: [{ message: { content: '{}' } }], usage: {} }), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  const provider = new OpenRouterProvider({ state: 'configured', source: 'environment', key: 'sk-or-test-key' }, fakeFetch);
  await provider.extract({ mode: 'destination_guide', locale: 'id', segments: ['- Candi Prambanan'], maxTokens: 100 }, 5000);
  const system = bodies[0].messages[0].content;
  for (const key of ['places', 'activityDetails', 'summary', 'closingNote', 'policies']) assert.ok(system.includes(`"${key}"`), `prompt names ${key}`);
  assert.ok(system.includes('Do not use any other key names'));
});

test('a fully structured document never calls the model; the new draft has the parsed fields and the chosen language', async (t) => {
  const d = double([]);
  const app = await fixture(t, d.extractor);
  const sourceId = await source(app, await fixtureText('en-half-day-messy.txt'));
  const response = await apply(app, sourceId, { operationId: op(), target: 'new', mode: 'half_day', outputLanguage: 'en' });
  assert.equal(response.statusCode, 201, response.body);
  const body = response.json();
  assert.equal(d.calls.length, 0, 'zero model calls when code read everything');
  assert.equal(body.usage.aiUsed, 0);
  const draft = body.itinerary.draftContent as WebItineraryContent;
  assert.equal(draft.trip.title, 'Half day Kyoto walk 🌸');
  assert.equal(draft.trip.language, 'en');
  assert.equal(body.itinerary.languageContext.outputLanguage, 'en');
  assert.deepEqual(draft.days[0].activities.map((a) => a.time), ['08:00', '10:00', '12:00', '14:00']);
  assert.equal(draft.guide.name, 'Hiro');
  assert.equal(draft.meeting.time, '08:00');
  assert.ok(body.report.filled.includes('trip.title'));
  assert.ok(Array.isArray(body.report.missingRequired), 'missing required fields are listed, not hidden');
});

test('model completion fills only what the document says; quotes that are not in the text are dropped', async (t) => {
  const d = double([JSON.stringify({
    summary: { value: 'Perjalanan sehari ke sawah terasering dan pasar seni Ubud.', quote: 'Perjalanan sehari ke sawah terasering dan pasar seni Ubud.' },
    closingNote: { value: 'Pesan wisata bersama kami.', quote: 'Pesan wisata bersama kami.' }
  })]);
  const app = await fixture(t, d.extractor);
  const sourceId = await source(app, await fixtureText('id-full-day-tidy.txt'));
  const response = await apply(app, sourceId, { operationId: op(), target: 'new', mode: 'full_day', outputLanguage: 'id' });
  assert.equal(response.statusCode, 201, response.body);
  const body = response.json();
  assert.equal(d.calls.length, 1);
  assert.equal(body.itinerary.draftContent.summary, 'Perjalanan sehari ke sawah terasering dan pasar seni Ubud.');
  assert.equal(body.itinerary.draftContent.closingNote, null, 'a quote that is not in the document is dropped');
  assert.ok(body.report.skipped.some((item: { path: string }) => item.path === 'closingNote'));
  assert.equal(body.usage.aiUsed, 1);
  assert.equal(body.usage.promptTokens, 100);
});

test('the model cannot override code values or add a time: an extra key makes the reply invalid and code results stay', async (t) => {
  const bad = JSON.stringify({ activityDetails: [{ title: 'Jemput di hotel', time: '09:00', place: null, description: null, tip: null }] });
  const d = double([bad, bad]);
  const app = await fixture(t, d.extractor);
  const sourceId = await source(app, await fixtureText('id-full-day-tidy.txt'));
  const response = await apply(app, sourceId, { operationId: op(), target: 'new', mode: 'full_day', outputLanguage: 'id' });
  const body = response.json();
  assert.equal(d.calls.length, 2, 'one repair retry on invalid output');
  assert.equal(body.itinerary.draftContent.days[0].activities[0].time, '07:30', 'the code time is kept');
  assert.ok(body.report.notes.some((note: string) => note.includes('tidak sesuai bentuk')));
});

test('an injected place in the document is never accepted without a quote from the text', async (t) => {
  const d = double([JSON.stringify({
    places: [{ name: { value: 'Raja Ampat', quote: 'Raja Ampat' } }],
    summary: null
  })]);
  const app = await fixture(t, d.extractor);
  const sourceId = await source(app, await fixtureText('id-destination-guide.txt'));
  const response = await apply(app, sourceId, { operationId: op(), target: 'new', mode: 'destination_guide', outputLanguage: 'id' });
  const body = response.json();
  assert.equal(body.itinerary.draftContent.places.length, 0, 'the place has no quote in the text');
  assert.ok(body.report.skipped.some((item: { path: string }) => item.path === 'places[].name'));
});

test('destination guide: a place with a quote from the text is accepted with a fresh id', async (t) => {
  const d = double([JSON.stringify({ places: [{ name: { value: 'Candi Prambanan', quote: 'Candi Prambanan (Sleman)' }, area: { value: 'Sleman', quote: 'Candi Prambanan (Sleman)' }, description: null }] })]);
  const app = await fixture(t, d.extractor);
  const sourceId = await source(app, await fixtureText('id-destination-guide.txt'));
  const body = (await apply(app, sourceId, { operationId: op(), target: 'new', mode: 'destination_guide', outputLanguage: 'id' })).json();
  assert.equal(body.itinerary.draftContent.places.length, 1);
  assert.equal(body.itinerary.draftContent.places[0].name, 'Candi Prambanan');
  assert.match(body.itinerary.draftContent.places[0].id, /^[0-9a-f-]{36}$/);
});

test('provider failure: the code-only draft is still written and the report says AI could not finish', async (t) => {
  const d = double([new ProviderFailure('rejected', 400)]);
  const app = await fixture(t, d.extractor);
  const sourceId = await source(app, await fixtureText('id-full-day-tidy.txt'));
  const response = await apply(app, sourceId, { operationId: op(), target: 'new', mode: 'full_day', outputLanguage: 'id' });
  assert.equal(response.statusCode, 201);
  assert.equal(response.json().itinerary.draftContent.summary, '', 'the summary stays empty, nothing invented');
  assert.ok(response.json().report.notes.some((note: string) => note.includes('AI tidak bisa')));
});

test('no credential: the code-only draft is written with the AI-off note and no model call', async (t) => {
  const d = double([], 'missing');
  const app = await fixture(t, d.extractor);
  const sourceId = await source(app, await fixtureText('id-full-day-tidy.txt'));
  const body = (await apply(app, sourceId, { operationId: op(), target: 'new', mode: 'full_day', outputLanguage: 'id' })).json();
  assert.equal(d.calls.length, 0);
  assert.ok(body.report.notes.some((note: string) => note.includes('AI tidak aktif')));
});

test('overwrite: found sections are replaced, a field the document lacks keeps its value, and the revision moves once', async (t) => {
  const d = double([]);
  const app = await fixture(t, d.extractor);
  const existing = (await app.inject({ method: 'POST', url: '/api/v1/itineraries', headers, payload: { mode: 'multi_day' } })).json();
  const patched = structuredClone(existing.draftContent as WebItineraryContent);
  patched.trip.title = 'Judul lama';
  patched.closingNote = 'Sampai jumpa lagi.';
  patched.days[0].title = 'Hari lama';
  const saved = (await app.inject({ method: 'PATCH', url: `/api/v1/itineraries/${existing.id}`, headers, payload: { expectedRevision: existing.revision, draftContent: patched, languageContext: existing.languageContext, writingContext: existing.writingContext } })).json();
  const sourceId = await source(app, await fixtureText('id-whatsapp-injection.txt'));
  const response = await apply(app, sourceId, { operationId: op(), target: 'overwrite', itineraryId: existing.id, expectedRevision: saved.revision, outputLanguage: 'id' });
  assert.equal(response.statusCode, 200, response.body);
  const result = response.json().itinerary;
  assert.equal(result.revision, saved.revision + 1);
  assert.equal(result.draftContent.trip.title, 'Itinerary Bromo sunrise', 'title found in the document is replaced');
  assert.equal(result.draftContent.closingNote, 'Sampai jumpa lagi.', 'a field the document lacks keeps its value');
  assert.equal(result.draftContent.days[0].title, 'Bromo');
  assert.equal(result.draftContent.trip.mode, 'multi_day', 'the mode is never changed by an import');
});

test('overwrite refuses a stale revision and changes nothing', async (t) => {
  const d = double([]);
  const app = await fixture(t, d.extractor);
  const existing = (await app.inject({ method: 'POST', url: '/api/v1/itineraries', headers, payload: { mode: 'half_day' } })).json();
  const sourceId = await source(app, await fixtureText('en-half-day-messy.txt'));
  const response = await apply(app, sourceId, { operationId: op(), target: 'overwrite', itineraryId: existing.id, expectedRevision: existing.revision + 5 });
  assert.equal(response.statusCode, 409);
  assert.equal(response.json().error.code, 'REVISION_CONFLICT');
  const after = (await app.inject({ url: `/api/v1/itineraries/${existing.id}` })).json();
  assert.equal(after.revision, existing.revision);
});

test('undo restores the previous draft once; after a later edit undo is refused', async (t) => {
  const d = double([]);
  const app = await fixture(t, d.extractor);
  const existing = (await app.inject({ method: 'POST', url: '/api/v1/itineraries', headers, payload: { mode: 'half_day' } })).json();
  const before = existing.draftContent.trip.title;
  const sourceId = await source(app, await fixtureText('en-half-day-messy.txt'));
  const applied = (await apply(app, sourceId, { operationId: op(), target: 'overwrite', itineraryId: existing.id, expectedRevision: existing.revision, outputLanguage: 'en' })).json();
  const operationId = (await app.inject({ url: `/api/v1/imports/operations?itineraryId=${existing.id}` })).json().operation.operationId;
  assert.equal((await app.inject({ url: `/api/v1/imports/operations?itineraryId=${existing.id}` })).json().operation.undoAvailable, true);
  const undone = await app.inject({ method: 'POST', url: `/api/v1/imports/operations/${operationId}/undo`, headers, payload: { expectedRevision: applied.itinerary.revision } });
  assert.equal(undone.statusCode, 200, undone.body);
  assert.equal(undone.json().itinerary.draftContent.trip.title, before);
  assert.equal(undone.json().itinerary.revision, applied.itinerary.revision + 1);
  const again = await app.inject({ method: 'POST', url: `/api/v1/imports/operations/${operationId}/undo`, headers, payload: { expectedRevision: undone.json().itinerary.revision } });
  assert.equal(again.json().error.code, 'IMPORT_UNDO_UNAVAILABLE');

  const second = (await apply(app, sourceId, { operationId: op(), target: 'overwrite', itineraryId: existing.id, expectedRevision: undone.json().itinerary.revision, outputLanguage: 'en' })).json();
  const edited = structuredClone(second.itinerary.draftContent as WebItineraryContent);
  edited.summary = 'Diedit setelah import.';
  const patched = await app.inject({ method: 'PATCH', url: `/api/v1/itineraries/${existing.id}`, headers, payload: { expectedRevision: second.itinerary.revision, draftContent: edited, languageContext: second.itinerary.languageContext, writingContext: second.itinerary.writingContext } });
  assert.equal(patched.statusCode, 200);
  const latest = (await app.inject({ url: `/api/v1/imports/operations?itineraryId=${existing.id}` })).json().operation;
  assert.equal(latest.undoAvailable, false, 'undo is off after an edit');
  const refused = await app.inject({ method: 'POST', url: `/api/v1/imports/operations/${latest.operationId}/undo`, headers, payload: { expectedRevision: patched.json().revision } });
  assert.equal(refused.json().error.code, 'IMPORT_UNDO_UNAVAILABLE');
});

test('a duplicated activity title on two days is dropped from the model reply instead of guessed', async (t) => {
  const d = double([JSON.stringify({ activityDetails: [{ title: 'Ubud', description: { value: 'sawah bagus', quote: 'sawah bagus' }, place: null, tip: null }] })]);
  const app = await fixture(t, d.extractor);
  const text = ['Liburan dua hari', 'Hari 1', '09:00 Ubud', 'Hari 2', '09:00 Ubud', 'Ubud: sawah bagus'].join('\n');
  const sourceId = await source(app, text);
  const body = (await apply(app, sourceId, { operationId: op(), target: 'new', mode: 'multi_day', outputLanguage: 'id' })).json();
  assert.equal(d.calls.length, 1);
  assert.equal(body.itinerary.draftContent.days[0].activities[0].description, '');
  assert.equal(body.itinerary.draftContent.days[1].activities[0].description, '');
  assert.ok(body.report.skipped.some((item: { path: string }) => item.path.startsWith('activityDetails[Ubud]')));
});

test('text beyond the 20,000 character limit is not sent to the model, and the report says how many lines were left out', async (t) => {
  const d = double([JSON.stringify({})]);
  const app = await fixture(t, d.extractor);
  const long = Array.from({ length: 400 }, (_, i) => `Catatan panjang nomor ${i} yang tidak terbaca kode ${'x'.repeat(60)}`);
  const sourceId = await source(app, ['Judul trip', 'Hari 1', '09:00 Ubud', ...long].join('\n'));
  const body = (await apply(app, sourceId, { operationId: op(), target: 'new', mode: 'multi_day', outputLanguage: 'id' })).json();
  assert.equal(d.calls.length, 1);
  assert.ok(d.calls[0].segments.join('\n').length <= 20_000 + 200);
  assert.ok(body.report.notes.some((note: string) => /tidak dikirim ke AI/.test(note)));
});

test('the same operationId replays the stored result without a second model call; a running one is busy', async (t) => {
  const d = double([JSON.stringify({ summary: { value: 'Perjalanan sehari ke sawah terasering dan pasar seni Ubud.', quote: 'Perjalanan sehari ke sawah terasering dan pasar seni Ubud.' } })]);
  const app = await fixture(t, d.extractor);
  const sourceId = await source(app, await fixtureText('id-full-day-tidy.txt'));
  const key = op();
  const first = (await apply(app, sourceId, { operationId: key, target: 'new', mode: 'full_day', outputLanguage: 'id' })).json();
  const replay = await apply(app, sourceId, { operationId: key, target: 'new', mode: 'full_day', outputLanguage: 'id' });
  assert.equal(replay.statusCode, 200);
  assert.equal(replay.json().itinerary.id, first.itinerary.id, 'no second draft');
  assert.equal(d.calls.length, 1, 'no second model call');
});

test('one import in flight: a second import while the first waits on the model answers IMPORT_BUSY', async (t) => {
  const d = double([JSON.stringify({})]);
  d.hold();
  const app = await fixture(t, d.extractor);
  const sourceId = await source(app, await fixtureText('id-full-day-tidy.txt'));
  const first = apply(app, sourceId, { operationId: op(), target: 'new', mode: 'full_day', outputLanguage: 'id' });
  await new Promise((resolve) => setTimeout(resolve, 50));
  const second = await apply(app, sourceId, { operationId: op(), target: 'new', mode: 'full_day', outputLanguage: 'id' });
  assert.equal(second.statusCode, 409);
  assert.equal(second.json().error.code, 'IMPORT_BUSY');
  d.let();
  assert.equal((await first).statusCode, 201);
});

test('a run that was interrupted is marked uncertain on the next start, and its operationId cannot be replayed', async (t) => {
  const d = double([]);
  const app = await fixture(t, d.extractor);
  const sourceId = await source(app, await fixtureText('en-half-day-messy.txt'));
  const key = op();
  const store = (app as unknown as { store: { db: { prepare(sql: string): { run(...args: unknown[]): unknown } } } }).store;
  const workspaceId = (store as unknown as { workspaceId: string }).workspaceId;
  store.db.prepare("INSERT INTO import_operations(operation_id,workspace_id,source_id,itinerary_id,target,mode,status,ai_used,created_at,updated_at) VALUES(?,?,?,?,?,?,'running',0,?,?)")
    .run(key, workspaceId, sourceId, null, 'new', 'half_day', new Date().toISOString(), new Date().toISOString());
  const dataDir = (app as unknown as { store: { dataDir: string } }).store.dataDir;
  await app.close();
  const restarted = await createApp({ dataDir, publicOrigin: origin, allowedOrigins: [origin], importExtractor: d.extractor });
  try {
    const status = (restarted as unknown as { store: { db: { prepare(sql: string): { get(...args: unknown[]): unknown } } } }).store.db.prepare('SELECT status FROM import_operations WHERE operation_id=?').get(key) as { status: string };
    assert.equal(status.status, 'uncertain');
    const retry = await apply(restarted, sourceId, { operationId: key, target: 'new', mode: 'half_day', outputLanguage: 'en' });
    assert.equal(retry.statusCode, 409);
    assert.equal(retry.json().error.code, 'IMPORT_NOT_REPEATABLE');
  } finally {
    await restarted.close();
  }
});

test('import does not touch the writing-AI daily ledger', async (t) => {
  const d = double([JSON.stringify({ summary: { value: 'Perjalanan sehari ke sawah terasering dan pasar seni Ubud.', quote: 'Perjalanan sehari ke sawah terasering dan pasar seni Ubud.' } })]);
  const app = await fixture(t, d.extractor);
  const store = (app as unknown as { store: { db: { prepare(sql: string): { all(): unknown[] } } } }).store;
  const before = JSON.stringify(store.db.prepare('SELECT * FROM ai_daily_usage').all());
  const sourceId = await source(app, await fixtureText('id-full-day-tidy.txt'));
  await apply(app, sourceId, { operationId: op(), target: 'new', mode: 'full_day', outputLanguage: 'id' });
  assert.equal(JSON.stringify(store.db.prepare('SELECT * FROM ai_daily_usage').all()), before);
});

test('validation: unknown fields, a bad operation id, and a missing target are refused before any work', async (t) => {
  const d = double([]);
  const app = await fixture(t, d.extractor);
  const sourceId = await source(app, await fixtureText('en-half-day-messy.txt'));
  assert.equal((await apply(app, sourceId, { operationId: 'not-a-uuid', target: 'new', mode: 'half_day' })).statusCode, 400);
  assert.equal((await apply(app, sourceId, { operationId: op(), target: 'both', mode: 'half_day' })).statusCode, 400);
  assert.equal((await apply(app, sourceId, { operationId: op(), target: 'new', mode: 'half_day', extra: 1 })).statusCode, 400);
  assert.equal((await apply(app, sourceId, { operationId: op(), target: 'new', mode: 'auto' })).statusCode, 422);
  assert.equal(d.calls.length, 0);
});
