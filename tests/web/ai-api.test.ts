import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { createBlankDraft } from '../../src/server/draft.js';
import { createApp } from '../../src/server/app.js';
import { ProviderFailure, type AiProvider, type PreflightResult, type SuggestionContext } from '../../src/server/ai/provider.js';
import type { WebItineraryContent } from '../../src/contracts/types.js';

const origin = 'http://127.0.0.1:3000';
const headers = { origin, 'x-engine-request': '1', 'content-type': 'application/json' };
const preflight: PreflightResult = { credentialState: 'configured', authenticated: true, modelState: 'listed', modelId: 'openai/gpt-6-luna', pricing: { prompt: 0.0000001, completion: 0.0000005, webSearch: 0 }, contextLength: 1_050_000, maxCompletionTokens: 128_000, supportedParameters: ['max_tokens'] };
const englishSuggestion = 'A quiet, thoughtful journey through gardens and historic streets, guided by local stories and practical details for a comfortable visit.';

class FakeProvider implements AiProvider {
  readonly credentialState = 'configured';
  calls: SuggestionContext[] = [];
  response = JSON.stringify({ text: englishSuggestion });
  beforeReturn?: () => Promise<void>;
  outcomes: Array<Error | string> = [];
  async preflight() { return preflight; }
  async generate(request: SuggestionContext) {
    this.calls.push(structuredClone(request));
    await this.beforeReturn?.();
    const outcome = this.outcomes.shift();
    if (outcome instanceof Error) throw outcome;
    return { text: typeof outcome === 'string' ? outcome : this.response, usage: { promptTokens: 900, completionTokens: 80, costUsd: 0.0002 } };
  }
}

async function fixture(t: any, options: { dailyOperations?: number; operationsPerMinute?: number; liveAiTest?: boolean; provider?: FakeProvider } = {}) {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'itinerary-cp023-ai-'));
  const provider = options.provider || new FakeProvider();
  const app = await createApp({ dataDir, publicOrigin: origin, allowedOrigins: [origin], aiProvider: provider, liveAiTest: options.liveAiTest, aiLimits: { dailyOperations: options.dailyOperations, ...(options.operationsPerMinute === undefined ? {} : { operationsPerMinute: options.operationsPerMinute }), maxInFlight: 1 } });
  t.after(async () => { await app.close(); await rm(dataDir, { recursive: true, force: true }); });
  return { app, provider };
}

async function createDraft(app: Awaited<ReturnType<typeof createApp>>, mode: 'full_day' | 'destination_guide' = 'full_day') {
  const content = createBlankDraft(mode, {}) as WebItineraryContent;
  content.brochure.outputLanguage = 'en';
  content.brochure.tripTitle = 'AI test'; content.brochure.destination = 'Kyoto'; content.brochure.country = 'Japan';
  if (mode === 'destination_guide') content.spots.push({ id: crypto.randomUUID(), groupLabel: 'Kyoto', name: 'Garden', area: 'East', category: 'garden', description: '', suggestedDuration: '', bestTimeToVisit: '', gettingThere: '', tips: [''], nearbyPairing: null, assetId: null, photoAttribution: null } as any);
  const response = await app.inject({ method: 'POST', url: '/api/v1/itineraries', headers, payload: { mode, draftContent: content, languageContext: { requestedLanguage: 'en', outputLanguage: 'en', source: 'explicit' }, writingContext: { brief: 'A quiet garden trip with local cultural context and practical transit notes for a couple visiting the region.', notes: [{ targetId: 'itinerary', text: 'The north entrance is quiet in the morning.' }] } } });
  assert.equal(response.statusCode, 201, response.body);
  return response.json();
}

test('overview/description return proposals and never mutate canonical draft; operation IDs are idempotent', async (t) => {
  const { app, provider } = await fixture(t);
  const record = await createDraft(app);
  const before = await app.inject({ url: `/api/v1/itineraries/${record.id}` });
  const operationId = crypto.randomUUID();
  const request = { operationId, expectedRevision: 1 };
  const first = await app.inject({ method: 'POST', url: `/api/v1/itineraries/${record.id}/ai/overview`, headers, payload: request });
  assert.equal(first.statusCode, 200, first.body);
  assert.equal(first.json().text, englishSuggestion);
  assert.equal(first.json().target.kind, 'overview');
  assert.deepEqual(provider.calls[0].context.factualNotes, ['The north entrance is quiet in the morning.']);
  assert.equal('agencyContact' in provider.calls[0].context, false);
  const replay = await app.inject({ method: 'POST', url: `/api/v1/itineraries/${record.id}/ai/overview`, headers, payload: request });
  assert.equal(replay.statusCode, 200); assert.equal(replay.json().replayed, true); assert.deepEqual(replay.json().target, { kind: 'overview' });
  assert.equal(provider.calls.length, 1);
  assert.deepEqual((await app.inject({ url: `/api/v1/itineraries/${record.id}` })).json().draftContent, before.json().draftContent);

  const description = await app.inject({ method: 'POST', url: `/api/v1/itineraries/${record.id}/ai/description`, headers, payload: { ...request, operationId: crypto.randomUUID(), target: { kind: 'activity', id: record.draftContent.schedule[0].activities[0].id } } });
  assert.equal(description.statusCode, 200, description.body);
  assert.deepEqual(description.json().target, { kind: 'activity', id: record.draftContent.schedule[0].activities[0].id });
  assert.deepEqual(provider.calls[1].context.target, { kind: 'activity', title: '', type: 'sightseeing', area: null, category: null, location: '' });
  assert.equal((await app.inject({ url: `/api/v1/itineraries/${record.id}` })).json().draftContent.overview.summary, '');
});

test('unresolved locale, stale revision and nonexistent targets are rejected before provider dispatch', async (t) => {
  const { app, provider } = await fixture(t);
  const record = await createDraft(app);
  const badRevision = await app.inject({ method: 'POST', url: `/api/v1/itineraries/${record.id}/ai/overview`, headers, payload: { operationId: crypto.randomUUID(), expectedRevision: 8 } });
  assert.equal(badRevision.statusCode, 409);
  const missingTarget = await app.inject({ method: 'POST', url: `/api/v1/itineraries/${record.id}/ai/description`, headers, payload: { operationId: crypto.randomUUID(), expectedRevision: 1, target: { kind: 'activity', id: crypto.randomUUID() } } });
  assert.equal(missingTarget.statusCode, 404);
  assert.equal(provider.calls.length, 0);
  const resolve = await app.inject({ method: 'POST', url: `/api/v1/itineraries/${record.id}/language/resolve`, headers, payload: { expectedRevision: 1 } });
  assert.equal(resolve.statusCode, 200); assert.equal(resolve.json().locale, 'en'); assert.equal(resolve.json().source, 'explicit');
});

test('language resolution uses only saved brief and factual notes and returns unresolved on short input', async (t) => {
  const { app } = await fixture(t);
  const record = await createDraft(app);
  const unresolved = await app.inject({ method: 'PATCH', url: `/api/v1/itineraries/${record.id}`, headers, payload: { expectedRevision: 1, draftContent: { ...record.draftContent, brochure: { ...record.draftContent.brochure, outputLanguage: null } }, languageContext: { requestedLanguage: 'auto', outputLanguage: null, source: 'unresolved' }, writingContext: { brief: 'Kyoto', notes: [] } } });
  assert.equal(unresolved.statusCode, 200);
  const resolve = await app.inject({ method: 'POST', url: `/api/v1/itineraries/${record.id}/language/resolve`, headers, payload: { expectedRevision: 2 } });
  assert.equal(resolve.statusCode, 200); assert.equal(resolve.json().status, 'unresolved'); assert.equal(resolve.json().code, 'LANGUAGE_UNRESOLVED');
});

test('daily quota and persistent live budget reserve before provider dispatch', async (t) => {
  const limitedProvider = new FakeProvider();
  const { app, provider } = await fixture(t, { dailyOperations: 1, provider: limitedProvider });
  const record = await createDraft(app);
  const first = await app.inject({ method: 'POST', url: `/api/v1/itineraries/${record.id}/ai/overview`, headers, payload: { operationId: crypto.randomUUID(), expectedRevision: 1 } });
  assert.equal(first.statusCode, 200);
  const limited = await app.inject({ method: 'POST', url: `/api/v1/itineraries/${record.id}/ai/overview`, headers, payload: { operationId: crypto.randomUUID(), expectedRevision: 1 } });
  assert.equal(limited.statusCode, 429); assert.equal(limited.json().error.code, 'AI_DAILY_LIMIT'); assert.equal(provider.calls.length, 1);

  const expensiveProvider = new FakeProvider();
  const expensive = await fixture(t, { liveAiTest: true, provider: expensiveProvider });
  const pricey = await createDraft(expensive.app);
  (expensiveProvider as any).preflight = async () => ({ ...preflight, pricing: { prompt: 0.0001, completion: 0.0001, webSearch: 0 } });
  const blocked = await expensive.app.inject({ method: 'POST', url: `/api/v1/itineraries/${pricey.id}/ai/overview`, headers, payload: { operationId: crypto.randomUUID(), expectedRevision: 1 } });
  assert.equal(blocked.statusCode, 429); assert.equal(blocked.json().error.code, 'AI_LIVE_BUDGET_EXCEEDED'); assert.equal(expensiveProvider.calls.length, 0);
});

test('default two-per-minute guard rejects the third new operation before provider dispatch', async (t) => {
  const { app, provider } = await fixture(t);
  const record = await createDraft(app);
  for (let index = 0; index < 2; index++) {
    const response = await app.inject({ method: 'POST', url: `/api/v1/itineraries/${record.id}/ai/overview`, headers, payload: { operationId: crypto.randomUUID(), expectedRevision: 1 } });
    assert.equal(response.statusCode, 200);
  }
  const blocked = await app.inject({ method: 'POST', url: `/api/v1/itineraries/${record.id}/ai/overview`, headers, payload: { operationId: crypto.randomUUID(), expectedRevision: 1 } });
  assert.equal(blocked.statusCode, 429); assert.equal(blocked.json().error.code, 'AI_RATE_LIMIT'); assert.equal(provider.calls.length, 2);
});

test('live-test budget ledger and idempotent suggestion survive server restart', async (t) => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'itinerary-ai-budget-'));
  const provider = new FakeProvider();
  let app = await createApp({ dataDir, publicOrigin: origin, allowedOrigins: [origin], aiProvider: provider, liveAiTest: true });
  t.after(async () => { await app.close(); await rm(dataDir, { recursive: true, force: true }); });
  const record = await createDraft(app);
  const operationId = crypto.randomUUID();
  const request = { operationId, expectedRevision: 1 };
  const first = await app.inject({ method: 'POST', url: `/api/v1/itineraries/${record.id}/ai/overview`, headers, payload: request });
  assert.equal(first.statusCode, 200);
  await app.close();
  app = await createApp({ dataDir, publicOrigin: origin, allowedOrigins: [origin], aiProvider: provider, liveAiTest: true });
  const preflight = await app.inject({ url: '/api/v1/itinerary-engine/ai/preflight' });
  assert.ok(preflight.json().liveTestBudget.committedUsd > 0);
  const replay = await app.inject({ method: 'POST', url: `/api/v1/itineraries/${record.id}/ai/overview`, headers, payload: request });
  assert.equal(replay.statusCode, 200); assert.equal(replay.json().replayed, true); assert.deepEqual(replay.json().target, { kind: 'overview' }); assert.equal(provider.calls.length, 1);
});

test('spot description replay preserves the stable target ID', async (t) => {
  const { app, provider } = await fixture(t); const record = await createDraft(app, 'destination_guide');
  const operationId = crypto.randomUUID(); const target = { kind: 'spot' as const, id: record.draftContent.spots[0].id };
  const payload = { operationId, expectedRevision: 1, target }; const route = `/api/v1/itineraries/${record.id}/ai/description`;
  const first = await app.inject({ method: 'POST', url: route, headers, payload }); assert.equal(first.statusCode, 200); assert.deepEqual(first.json().target, target);
  const replay = await app.inject({ method: 'POST', url: route, headers, payload });
  assert.equal(replay.statusCode, 200); assert.equal(replay.json().replayed, true); assert.deepEqual(replay.json().target, target); assert.equal(provider.calls.length, 1);
});

test('restart converts a running provider reservation to uncertain once and prevents redispatch', async (t) => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'itinerary-ai-interrupted-')); const provider = new FakeProvider();
  let app = await createApp({ dataDir, publicOrigin: origin, allowedOrigins: [origin], aiProvider: provider, liveAiTest: true });
  t.after(async () => { await app.close(); await rm(dataDir, { recursive: true, force: true }); });
  const record = await createDraft(app); const operationId = crypto.randomUUID(); const payload = { operationId, expectedRevision: 1 };
  const original = await app.inject({ method: 'POST', url: `/api/v1/itineraries/${record.id}/ai/overview`, headers, payload }); assert.equal(original.statusCode, 200);
  const store = (app as any).store; const op = store.db.prepare('SELECT workspace_id,day_utc,reserved_usd FROM ai_operations WHERE operation_id=?').get(operationId);
  const reserve = 0.25;
  store.db.prepare("UPDATE ai_operations SET status='running',actual_usd=0,reserved_usd=? WHERE operation_id=?").run(reserve, operationId);
  store.db.prepare('UPDATE ai_daily_usage SET reserved_usd=?,actual_usd=0 WHERE workspace_id=? AND day_utc=?').run(reserve, op.workspace_id, op.day_utc);
  store.db.prepare('UPDATE ai_live_budget SET committed_usd=? WHERE id=1').run(reserve);
  store.db.prepare("UPDATE ai_live_budget_entries SET reserved_usd=?,actual_usd=0,status='reserved' WHERE operation_id=?").run(reserve, operationId);
  await app.close();
  app = await createApp({ dataDir, publicOrigin: origin, allowedOrigins: [origin], aiProvider: provider, liveAiTest: true });
  const recovered = (app as any).store.db.prepare('SELECT status,error_code,actual_usd FROM ai_operations WHERE operation_id=?').get(operationId);
  assert.equal(recovered.status, 'uncertain'); assert.equal(recovered.error_code, 'AI_OPERATION_INTERRUPTED'); assert.equal(recovered.actual_usd, reserve);
  const usage = (app as any).store.db.prepare('SELECT reserved_usd,actual_usd FROM ai_daily_usage WHERE workspace_id=? AND day_utc=?').get(op.workspace_id, op.day_utc);
  assert.equal(usage.reserved_usd, 0); assert.equal(usage.actual_usd, reserve);
  const ledger = (app as any).store.db.prepare('SELECT status,actual_usd FROM ai_live_budget_entries WHERE operation_id=?').get(operationId);
  assert.equal(ledger.status, 'uncertain'); assert.equal(ledger.actual_usd, reserve);
  assert.equal((await app.inject({ url: '/api/v1/itinerary-engine/ai/preflight' })).json().liveTestBudget.committedUsd, reserve);
  const replay = await app.inject({ method: 'POST', url: `/api/v1/itineraries/${record.id}/ai/overview`, headers, payload });
  assert.equal(replay.statusCode, 503); assert.equal(replay.json().error.code, 'AI_OPERATION_INTERRUPTED'); assert.equal(provider.calls.length, 1);
});

test('duplicate inflight request returns pending, then replay returns the complete target without redispatch', async (t) => {
  const provider = new FakeProvider(); let finish!: () => void; let entered!: () => void;
  const gate = new Promise<void>(resolve => { finish = resolve; }); const started = new Promise<void>(resolve => { entered = resolve; });
  provider.beforeReturn = async () => { entered(); await gate; };
  const { app } = await fixture(t, { provider }); const record = await createDraft(app);
  const operationId = crypto.randomUUID(); const request = { operationId, expectedRevision: 1, target: { kind: 'activity' as const, id: record.draftContent.schedule[0].activities[0].id } };
  const route = `/api/v1/itineraries/${record.id}/ai/description`;
  const first = app.inject({ method: 'POST', url: route, headers, payload: request }); await started;
  const pending = await app.inject({ method: 'POST', url: route, headers, payload: request });
  assert.equal(pending.statusCode, 202); assert.deepEqual(pending.json(), { operationId, status: 'running', retryAfterMs: 250 });
  finish(); const completed = await first; assert.equal(completed.statusCode, 200);
  assert.deepEqual(completed.json().target, request.target);
  const replay = await app.inject({ method: 'POST', url: route, headers, payload: request });
  assert.equal(replay.statusCode, 200); assert.equal(replay.json().replayed, true); assert.deepEqual(replay.json().target, request.target);
  assert.equal(provider.calls.length, 1);
});

test('missing provider billing usage retains the full reservation as uncertain and never redispatches', async (t) => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'itinerary-ai-unknown-usage-')); const provider = new FakeProvider();
  let app = await createApp({ dataDir, publicOrigin: origin, allowedOrigins: [origin], aiProvider: provider, liveAiTest: true });
  t.after(async () => { await app.close(); await rm(dataDir, { recursive: true, force: true }); });
  const record = await createDraft(app); const operationId = crypto.randomUUID();
  (provider as any).generate = async (request: SuggestionContext) => { provider.calls.push(structuredClone(request)); return { text: JSON.stringify({ text: englishSuggestion }), usage: { promptTokens: null, completionTokens: null, costUsd: null } }; };
  const route = `/api/v1/itineraries/${record.id}/ai/overview`; const payload = { operationId, expectedRevision: 1 };
  const response = await app.inject({ method: 'POST', url: route, headers, payload });
  assert.equal(response.statusCode, 503); assert.equal(response.json().error.code, 'PROVIDER_USAGE_UNKNOWN'); assert.equal(provider.calls.length, 1);
  const operation = (app as any).store.db.prepare('SELECT status,error_code,reserved_usd,actual_usd FROM ai_operations WHERE operation_id=?').get(operationId);
  assert.equal(operation.status, 'uncertain'); assert.equal(operation.error_code, 'PROVIDER_USAGE_UNKNOWN'); assert.equal(operation.actual_usd, operation.reserved_usd);
  const budget = (app as any).store.db.prepare('SELECT limit_usd,committed_usd FROM ai_live_budget WHERE id=1').get();
  assert.equal(budget.committed_usd, operation.reserved_usd); assert.ok(budget.committed_usd > 0);
  await app.close(); app = await createApp({ dataDir, publicOrigin: origin, allowedOrigins: [origin], aiProvider: provider, liveAiTest: true });
  const afterRestart = await app.inject({ url: '/api/v1/itinerary-engine/ai/preflight' });
  assert.equal(afterRestart.json().liveTestBudget.committedUsd, operation.reserved_usd);
  const replay = await app.inject({ method: 'POST', url: route, headers, payload });
  assert.equal(replay.statusCode, 503); assert.equal(replay.json().error.code, 'PROVIDER_USAGE_UNKNOWN'); assert.equal(provider.calls.length, 1);
});

test('invalid negative provider cost is not replaced by a zero or token-based refund', async (t) => {
  const provider = new FakeProvider(); const { app } = await fixture(t, { provider, liveAiTest: true });
  const record = await createDraft(app); const operationId = crypto.randomUUID();
  (provider as any).generate = async (request: SuggestionContext) => { provider.calls.push(structuredClone(request)); return { text: JSON.stringify({ text: englishSuggestion }), usage: { promptTokens: 10, completionTokens: 5, costUsd: -1 } }; };
  const response = await app.inject({ method: 'POST', url: `/api/v1/itineraries/${record.id}/ai/overview`, headers, payload: { operationId, expectedRevision: 1 } });
  assert.equal(response.statusCode, 503); assert.equal(response.json().error.code, 'PROVIDER_USAGE_UNKNOWN');
  const operation = (app as any).store.db.prepare('SELECT status,reserved_usd,actual_usd FROM ai_operations WHERE operation_id=?').get(operationId);
  assert.equal(operation.status, 'uncertain'); assert.equal(operation.actual_usd, operation.reserved_usd);
  assert.equal((await app.inject({ url: '/api/v1/itinerary-engine/ai/preflight' })).json().liveTestBudget.committedUsd, operation.reserved_usd);
  assert.equal(provider.calls.length, 1);
});

test('malformed provider output is rejected and replay does not dispatch twice', async (t) => {
  const provider = new FakeProvider(); provider.response = JSON.stringify({ text: 'The garden opens at 09:00.' });
  const { app } = await fixture(t, { provider });
  const record = await createDraft(app); const operationId = crypto.randomUUID();
  const route = `/api/v1/itineraries/${record.id}/ai/overview`;
  const first = await app.inject({ method: 'POST', url: route, headers, payload: { operationId, expectedRevision: 1 } });
  assert.equal(first.statusCode, 502); assert.equal(first.json().error.code, 'AI_POLICY_REJECTED'); assert.equal(provider.calls.length, 1);
  const replay = await app.inject({ method: 'POST', url: route, headers, payload: { operationId, expectedRevision: 1 } });
  assert.equal(replay.statusCode, 502); assert.equal(provider.calls.length, 1);
});

test('one definite retry uses a single daily operation reservation', async (t) => {
  const provider = new FakeProvider(); provider.outcomes = [new ProviderFailure('retryable', 503), JSON.stringify({ text: englishSuggestion })];
  const { app } = await fixture(t, { provider });
  const record = await createDraft(app);
  const response = await app.inject({ method: 'POST', url: `/api/v1/itineraries/${record.id}/ai/overview`, headers, payload: { operationId: crypto.randomUUID(), expectedRevision: 1 } });
  assert.equal(response.statusCode, 200); assert.equal(provider.calls.length, 2);
  const context = await app.inject({ url: '/api/v1/itinerary-engine/context' });
  assert.equal(context.json().capabilities.ai.usedToday, 1);
});

test('ambiguous provider timeout is not retried or double-dispatched', async (t) => {
  const provider = new FakeProvider(); provider.outcomes = [new ProviderFailure('uncertain', null)];
  const { app } = await fixture(t, { provider });
  const record = await createDraft(app); const operationId = crypto.randomUUID();
  const route = `/api/v1/itineraries/${record.id}/ai/overview`;
  const response = await app.inject({ method: 'POST', url: route, headers, payload: { operationId, expectedRevision: 1 } });
  assert.equal(response.statusCode, 503); assert.equal(response.json().error.code, 'PROVIDER_UNAVAILABLE'); assert.equal(provider.calls.length, 1);
  const replay = await app.inject({ method: 'POST', url: route, headers, payload: { operationId, expectedRevision: 1 } });
  assert.equal(replay.statusCode, 503); assert.equal(provider.calls.length, 1);
});

test('same operation ID with different target conflicts without another provider call', async (t) => {
  const { app, provider } = await fixture(t);
  const record = await createDraft(app);
  const changed = structuredClone(record.draftContent); changed.schedule[0].activities.push({ ...changed.schedule[0].activities[0], id: crypto.randomUUID(), title: 'Second activity' });
  const saved = await app.inject({ method: 'PATCH', url: `/api/v1/itineraries/${record.id}`, headers, payload: { expectedRevision: 1, draftContent: changed, languageContext: record.languageContext, writingContext: record.writingContext } });
  assert.equal(saved.statusCode, 200);
  const operationId = crypto.randomUUID(); const route = `/api/v1/itineraries/${record.id}/ai/description`;
  const first = await app.inject({ method: 'POST', url: route, headers, payload: { operationId, expectedRevision: 2, target: { kind: 'activity', id: changed.schedule[0].activities[0].id } } });
  assert.equal(first.statusCode, 200);
  const mismatch = await app.inject({ method: 'POST', url: route, headers, payload: { operationId, expectedRevision: 2, target: { kind: 'activity', id: changed.schedule[0].activities[1].id } } });
  assert.equal(mismatch.statusCode, 409); assert.equal(mismatch.json().error.code, 'AI_OPERATION_CONFLICT'); assert.equal(provider.calls.length, 1);
});

test('server rechecks target after generation and rejects a deleted target', async (t) => {
  const provider = new FakeProvider();
  const { app } = await fixture(t, { provider }); const record = await createDraft(app, 'destination_guide'); const store = (app as any).store;
  provider.beforeReturn = async () => {
    const latest = store.getItinerary(record.id); const changed = structuredClone(latest.draftContent); changed.spots = [];
    store.updateItinerary(record.id, latest.revision, changed, latest.languageContext, latest.writingContext);
  };
  const response = await app.inject({ method: 'POST', url: `/api/v1/itineraries/${record.id}/ai/description`, headers, payload: { operationId: crypto.randomUUID(), expectedRevision: 1, target: { kind: 'spot', id: record.draftContent.spots[0].id } } });
  assert.equal(response.statusCode, 409); assert.equal(response.json().error.code, 'AI_RESULT_STALE');
});

test('only one workspace provider operation may be in flight', async (t) => {
  const provider = new FakeProvider(); let finish!: () => void; let entered!: () => void;
  const gate = new Promise<void>(resolve => { finish = resolve; }); const started = new Promise<void>(resolve => { entered = resolve; });
  provider.beforeReturn = async () => { entered(); await gate; };
  const { app } = await fixture(t, { provider }); const record = await createDraft(app);
  const route = `/api/v1/itineraries/${record.id}/ai/overview`;
  const first = app.inject({ method: 'POST', url: route, headers, payload: { operationId: crypto.randomUUID(), expectedRevision: 1 } });
  await started;
  const second = await app.inject({ method: 'POST', url: route, headers, payload: { operationId: crypto.randomUUID(), expectedRevision: 1 } });
  assert.equal(second.statusCode, 429); assert.equal(second.json().error.code, 'AI_OPERATION_IN_PROGRESS');
  finish(); assert.equal((await first).statusCode, 200); assert.equal(provider.calls.length, 1);
});

test('stale target result is rejected after provider work and canonical data remains independent', async (t) => {
  const provider = new FakeProvider();
  const { app } = await fixture(t, { provider });
  const record = await createDraft(app, 'destination_guide');
  const stored = (app as any).store;
  provider.beforeReturn = async () => {
    const latest = stored.getItinerary(record.id);
    const changed = structuredClone(latest.draftContent);
    changed.spots = [];
    stored.updateItinerary(record.id, latest.revision, changed, latest.languageContext, latest.writingContext);
  };
  const response = await app.inject({ method: 'POST', url: `/api/v1/itineraries/${record.id}/ai/description`, headers, payload: { operationId: crypto.randomUUID(), expectedRevision: 1, target: { kind: 'spot', id: record.draftContent.spots[0].id } } });
  assert.equal(response.statusCode, 409); assert.equal(response.json().error.code, 'AI_RESULT_STALE');
  assert.equal(provider.calls.length, 1);
  assert.deepEqual((await app.inject({ url: `/api/v1/itineraries/${record.id}` })).json().draftContent.spots, []);
});
