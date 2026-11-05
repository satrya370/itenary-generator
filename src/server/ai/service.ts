import { createHash } from 'node:crypto';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { getLocaleCatalog } from '../../contracts/locale-catalogs.js';
import type { LanguageContext } from '../../contracts/types.js';
import { detectLanguage, explicitLanguage } from './language.js';
import { recoverInterruptedAiOperations } from './schema.js';
import { validateSuggestion } from './validation.js';
import { MODEL_ID, ProviderFailure, type AiProvider, type ModelPricing, type ProviderUsage, type SuggestionContext } from './provider.js';
import type { openStore } from '../store.js';

const DAILY_LIMIT = 30;
const RATE_PER_MINUTE = 2;
const MAX_IN_FLIGHT = 1;
const CONTEXT_MAX_BYTES = 16 * 1024;
const MAX_PROMPT_TOKENS = 65_536;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type Store = ReturnType<typeof openStore>;
interface AiRequest { operationId: string; expectedRevision: number; target?: { kind: 'activity' | 'place'; id: string }; }
interface OperationRow { operation_id: string; operation_kind: 'overview' | 'description'; target_kind: 'activity' | 'place' | 'spot' | null; target_id: string | null; fingerprint: string; status: string; attempts: number; suggestion_text: string | null; error_code: string | null; actual_usd: number; prompt_tokens: number; completion_tokens: number; }
interface ServiceError { status: number; code: string; message: string; fields?: unknown; }
export interface AiServiceLimits { dailyOperations?: number; operationsPerMinute?: number; maxInFlight?: number; contextBytes?: number; maxPromptTokens?: number; timeoutMs?: number; }
function isObject(value: unknown): value is Record<string, any> { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
function err(status: number, code: string, message: string, fields?: unknown): ServiceError { return { status, code, message, fields }; }
function nowIso() { return new Date().toISOString(); }
function utcDay() { return new Date().toISOString().slice(0, 10); }
function fingerprint(value: unknown) { return createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
function safeLocale(value: unknown): value is string { if (typeof value !== 'string') return false; try { return Intl.getCanonicalLocales(value).length === 1; } catch { return false; } }
function wait(ms: number) { return new Promise(resolve => setTimeout(resolve, ms)); }

function normalizedPricing(pricing: ModelPricing, inputCap: number, outputCap: number) {
  const base = inputCap * pricing.prompt + outputCap * pricing.completion;
  return Math.ceil(base * 2 * 1.1 * 1_000_000) / 1_000_000;
}
function costFromUsage(usage: ProviderUsage, pricing: ModelPricing): number | null {
  if (usage.costUsd !== null) return Number.isFinite(usage.costUsd) && usage.costUsd >= 0 ? usage.costUsd : null;
  const promptTokens = usage.promptTokens; const completionTokens = usage.completionTokens;
  if (promptTokens === null || completionTokens === null || !Number.isSafeInteger(promptTokens) || !Number.isSafeInteger(completionTokens) || promptTokens < 0 || completionTokens < 0) return null;
  return promptTokens * pricing.prompt + completionTokens * pricing.completion;
}

function findTarget(content: any, target?: AiRequest['target']) {
  if (!target) return null;
  if (target.kind === 'activity') {
    for (const day of content.days || []) {
      const activity = day.activities?.find((item: any) => item.id === target.id);
      if (activity) return { kind: 'activity' as const, item: activity, day };
    }
  }
  if (target.kind === 'place') {
    const place = (content.places || []).find((item: any) => item.id === target.id);
    if (place) return { kind: 'place' as const, item: place };
  }
  return null;
}

function buildSuggestionContext(record: any, task: 'overview' | 'description', target?: AiRequest['target'], contextMaxBytes = CONTEXT_MAX_BYTES): SuggestionContext['context'] | ServiceError {
  const content = record.draftContent;
  const relevantNotes = record.writingContext.notes.filter((note: any) => note.targetId === 'itinerary' || note.targetId === target?.id).map((note: any) => note.text);
  const common = {
    destination: content.trip.destination,
    region: content.trip.region,
    country: content.trip.country,
    itineraryMode: content.trip.mode,
    brief: record.writingContext.brief,
    factualNotes: relevantNotes
  };
  let context: Record<string, unknown>;
  if (task === 'overview') {
    context = {
      ...common,
      route: content.trip.mode === 'destination_guide'
        ? content.places.map((place: any) => ({ name: place.name, area: place.area }))
        : content.days.flatMap((day: any) => day.activities.map((activity: any) => ({ day: day.dayNumber, title: activity.title, area: activity.place, kind: activity.kind })))
    };
  } else {
    if (!target || !uuidPattern.test(target.id)) return err(422, 'AI_TARGET_INVALID', 'Select one existing activity or destination-guide place.');
    const found = findTarget(content, target);
    if (!found) return err(404, 'AI_TARGET_NOT_FOUND', 'The requested target no longer exists in this itinerary.');
    if (found.kind === 'activity') context = { ...common, target: { kind: 'activity', title: found.item.title, activityKind: found.item.kind, area: found.item.place, location: found.day.location } };
    else context = { ...common, target: { kind: 'place', name: found.item.name, area: found.item.area, suggestedDuration: found.item.suggestedDuration, bestTime: found.item.bestTime, gettingThere: found.item.gettingThere, tips: found.item.tips, nearby: found.item.nearby } };
  }
  if (Buffer.byteLength(JSON.stringify(context), 'utf8') > contextMaxBytes) return err(422, 'AI_CONTEXT_TOO_LARGE', 'Shorten the brief or factual notes before requesting AI copy.');
  return context;
}

export class AiService {
  private readonly limits: Required<AiServiceLimits>;
  constructor(private readonly store: Store, private readonly provider: AiProvider, private readonly liveTest: boolean, limits: AiServiceLimits = {}) {
    this.limits = { dailyOperations: limits.dailyOperations ?? DAILY_LIMIT, operationsPerMinute: limits.operationsPerMinute ?? RATE_PER_MINUTE, maxInFlight: limits.maxInFlight ?? MAX_IN_FLIGHT, contextBytes: limits.contextBytes ?? CONTEXT_MAX_BYTES, maxPromptTokens: limits.maxPromptTokens ?? MAX_PROMPT_TOKENS, timeoutMs: limits.timeoutMs ?? 45_000 };
    recoverInterruptedAiOperations(store.db);
  }

  contextSummary() {
    const row = this.store.db.prepare('SELECT accepted_operations,actual_usd FROM ai_daily_usage WHERE workspace_id=? AND day_utc=?').get(this.store.workspaceId, utcDay()) as { accepted_operations: number; actual_usd: number } | undefined;
    return { modelId: MODEL_ID, credentialState: this.provider.credentialState, dailyLimit: this.limits.dailyOperations, operationsPerMinute: this.limits.operationsPerMinute, usedToday: row?.accepted_operations || 0, remainingToday: Math.max(0, this.limits.dailyOperations - (row?.accepted_operations || 0)), activeOperations: Number((this.store.db.prepare("SELECT count(*) AS count FROM ai_operations WHERE workspace_id=? AND status='running'").get(this.store.workspaceId) as { count: number }).count) };
  }

  async preflight() {
    const provider = await this.provider.preflight();
    const liveBudget = this.liveTest ? this.liveBudgetStatus() : null;
    return { ...provider, daily: this.contextSummary(), ...(liveBudget ? { liveTestBudget: liveBudget } : {}) };
  }

  private liveBudgetStatus() {
    const row = this.store.db.prepare('SELECT limit_usd,committed_usd FROM ai_live_budget WHERE id=1').get() as { limit_usd: number; committed_usd: number };
    return { limitUsd: row.limit_usd, committedUsd: row.committed_usd, remainingUsd: Math.max(0, row.limit_usd - row.committed_usd) };
  }

  resolveLanguage(recordId: string, expectedRevision: number) {
    const record = this.store.getItinerary(recordId) as any;
    if (!record) return { error: err(404, 'NOT_FOUND', 'Itinerary not found.') };
    if (record.revision !== expectedRevision) return { error: err(409, 'REVISION_CONFLICT', 'Save or reload this itinerary before resolving its language.', { currentRevision: record.revision }) };
    if (record.languageContext.source === 'explicit' && safeLocale(record.languageContext.outputLanguage)) {
      const proposal = explicitLanguage(record.languageContext.outputLanguage);
      return { value: { itineraryId: record.id, revision: record.revision, ...proposal } };
    }
    const proposal = detectLanguage(record.writingContext.brief, record.writingContext.notes);
    if (proposal.status === 'resolved' && !getLocaleCatalog(proposal.locale)) return { value: { itineraryId: record.id, revision: record.revision, status: 'unresolved', locale: null, source: 'unresolved', code: 'LOCALE_UNSUPPORTED', reason: `No installed brochure catalog supports ${proposal.locale}; choose a supported locale or defer generation.` } };
    return { value: { itineraryId: record.id, revision: record.revision, ...proposal, ...(proposal.status === 'unresolved' ? { code: 'LANGUAGE_UNRESOLVED' } : {}) } };
  }

  async suggest(recordId: string, task: 'overview' | 'description', body: AiRequest) {
    const record = this.store.getItinerary(recordId) as any;
    if (!record) return { error: err(404, 'NOT_FOUND', 'Itinerary not found.') };
    if (record.revision !== body.expectedRevision) return { error: err(409, 'REVISION_CONFLICT', 'Save or reload this itinerary before requesting a suggestion.', { currentRevision: record.revision }) };
    const locale = record.languageContext.outputLanguage;
    if (record.languageContext.source === 'unresolved' || !safeLocale(locale)) return { error: err(422, 'LANGUAGE_UNRESOLVED', 'Choose or resolve the brochure language before requesting AI copy.') };
    if (!getLocaleCatalog(locale)) return { error: err(422, 'LOCALE_UNSUPPORTED', `No installed brochure catalog supports ${locale}.`) };
    if (task === 'overview' && body.target) return { error: err(422, 'AI_TARGET_INVALID', 'Overview generation does not accept a field target.') };
    if (task === 'description' && (!body.target || !['activity', 'place'].includes(body.target.kind))) return { error: err(422, 'AI_TARGET_INVALID', 'Description generation requires an activity or place ID.') };
    const target = task === 'description' ? findTarget(record.draftContent, body.target) : null;
    if (task === 'description' && !target) return { error: err(404, 'AI_TARGET_NOT_FOUND', 'The requested target no longer exists in this itinerary.') };
    if (target?.kind === 'activity' && !['half_day', 'full_day', 'multi_day'].includes(record.draftContent.trip.mode)) return { error: err(422, 'AI_TARGET_INVALID', 'Activities are not available in destination-guide mode.') };
    if (target?.kind === 'place' && record.draftContent.trip.mode !== 'destination_guide') return { error: err(422, 'AI_TARGET_INVALID', 'Guide places are not available in scheduled modes.') };
    const context = buildSuggestionContext(record, task, body.target, this.limits.contextBytes);
    if ('status' in context) return { error: context as ServiceError };
    const outputLimit = task === 'overview' ? 1536 : 1024;
    const operationFingerprint = fingerprint({ model: MODEL_ID, task, operationId: body.operationId, revision: record.revision, target: body.target || null, locale, context });
    const existing = this.store.db.prepare('SELECT * FROM ai_operations WHERE operation_id=? AND workspace_id=?').get(body.operationId, this.store.workspaceId) as OperationRow | undefined;
    if (existing) return this.replay(existing, operationFingerprint, record);

    const preflight = await this.provider.preflight();
    if (!preflight.authenticated || preflight.credentialState !== 'configured') return { error: err(503, 'PROVIDER_UNAVAILABLE', 'OpenRouter credentials are missing or could not be authenticated.') };
    if (preflight.modelState !== 'listed' || preflight.modelId !== MODEL_ID || !preflight.pricing || !preflight.supportedParameters.includes('max_tokens')) return { error: err(503, 'PROVIDER_UNAVAILABLE', 'The configured model or its current token pricing is unavailable.') };
    const reservedCost = normalizedPricing(preflight.pricing, this.limits.maxPromptTokens, outputLimit);
    const reservation = this.reserve(body, record, task, operationFingerprint, reservedCost);
    if ('error' in reservation) return reservation;
    if ('cached' in reservation) return { value: reservation.cached };
    if ('pending' in reservation) return { pending: reservation.pending };

    const request: SuggestionContext = { task, locale, targetKind: body.target?.kind, context, maxTokens: outputLimit };
    let lastFailure: ProviderFailure | null = null;
    let usage: ProviderUsage | null = null;
    let rawText: string | null = null;
    const deadline = Date.now() + this.limits.timeoutMs;
    for (let attempt = 1; attempt <= 2; attempt++) {
      this.markAttempt(body.operationId, attempt);
      try {
        const generated = await this.provider.generate(request, Math.max(1, deadline - Date.now()));
        usage = generated.usage; rawText = generated.text; lastFailure = null; break;
      } catch (cause) {
        const failure = cause instanceof ProviderFailure ? cause : new ProviderFailure('uncertain', null);
        lastFailure = failure;
        if (attempt !== 1 || failure.kind !== 'retryable' || Date.now() + failure.retryAfterMs + 1000 >= deadline) break;
        if (failure.retryAfterMs) await new Promise(resolve => setTimeout(resolve, Math.min(failure.retryAfterMs, Math.max(0, deadline - Date.now() - 1000))));
      }
    }
    if (lastFailure) {
      const definite = lastFailure.kind === 'auth' || lastFailure.kind === 'rejected' || lastFailure.kind === 'retryable';
      this.finish(body.operationId, reservation.reservedUsd, definite ? 0 : reservation.reservedUsd, null, null, definite ? 'failed' : 'uncertain', 'PROVIDER_UNAVAILABLE');
      return { error: err(503, lastFailure.kind === 'auth' ? 'PROVIDER_UNAVAILABLE' : 'PROVIDER_UNAVAILABLE', lastFailure.kind === 'uncertain' ? 'The provider response was interrupted; usage is conservatively reserved and this operation will not be replayed.' : 'The provider could not complete this suggestion.') };
    }
    const validation = validateSuggestion(rawText!, locale, task === 'overview' ? 'overview' : target!.kind);
    const actualCost = costFromUsage(usage!, preflight.pricing);
    if (actualCost === null) {
      this.finish(body.operationId, reservation.reservedUsd, reservation.reservedUsd, null, null, 'uncertain', 'PROVIDER_USAGE_UNKNOWN');
      return { error: err(503, 'PROVIDER_USAGE_UNKNOWN', 'The provider returned no usable billing data; its conservative reservation is retained and this operation will not be retried.') };
    }
    if (!validation.ok) {
      this.finish(body.operationId, reservation.reservedUsd, actualCost, usage!.promptTokens, usage!.completionTokens, 'failed', validation.code);
      return { error: err(502, validation.code, validation.message) };
    }
    const latest = this.store.getItinerary(recordId);
    if (!latest || latest.revision !== body.expectedRevision || (body.target && !findTarget(latest.draftContent, body.target))) {
      this.finish(body.operationId, reservation.reservedUsd, actualCost, usage!.promptTokens, usage!.completionTokens, 'stale', 'AI_RESULT_STALE', validation.text);
      return { error: err(409, 'AI_RESULT_STALE', 'The itinerary or target changed during generation. The draft was not modified.') };
    }
    this.finish(body.operationId, reservation.reservedUsd, actualCost, usage!.promptTokens, usage!.completionTokens, 'completed', null, validation.text);
    return { value: { operationId: body.operationId, itineraryId: record.id, revision: record.revision, target: body.target || { kind: 'overview' }, locale, text: validation.text, usage: { promptTokens: usage!.promptTokens, completionTokens: usage!.completionTokens, costUsd: actualCost } } };
  }

  private replay(row: OperationRow, expectedFingerprint: string, record: any) {
    if (row.fingerprint !== expectedFingerprint) return { error: err(409, 'AI_OPERATION_CONFLICT', 'This operation ID was already used for a different request.') };
    if (row.status === 'completed' && row.suggestion_text) {
      const target = row.operation_kind === 'overview' ? { kind: 'overview' as const } : { kind: row.target_kind!, id: row.target_id! };
      return { value: { operationId: row.operation_id, itineraryId: record.id, revision: record.revision, target, locale: record.languageContext.outputLanguage, text: row.suggestion_text, usage: { promptTokens: row.prompt_tokens, completionTokens: row.completion_tokens, costUsd: row.actual_usd }, replayed: true } };
    }
    if (row.status === 'running') return { pending: { operationId: row.operation_id, status: 'running', retryAfterMs: 250 } };
    if (row.status === 'stale') return { error: err(409, 'AI_RESULT_STALE', 'This operation completed for an obsolete revision and cannot be replayed.') };
    return { error: err(row.status === 'uncertain' ? 503 : 502, row.error_code || 'PROVIDER_UNAVAILABLE', row.status === 'uncertain' ? 'The provider outcome is uncertain; a new paid attempt requires a new operation ID.' : 'This operation previously failed; change the request to try again.') };
  }

  private reserve(body: AiRequest, record: any, task: string, operationFingerprint: string, reserveUsd: number): { reservedUsd: number } | { cached: unknown } | { pending: unknown } | { error: ServiceError } {
    const db = this.store.db; const now = nowIso(); const day = utcDay(); let result: any;
    db.exec('BEGIN IMMEDIATE');
    try {
      const existing = db.prepare('SELECT * FROM ai_operations WHERE operation_id=? AND workspace_id=?').get(body.operationId, this.store.workspaceId) as OperationRow | undefined;
      if (existing) {
        const replay = this.replay(existing, operationFingerprint, record);
        result = 'error' in replay ? { error: replay.error } : 'pending' in replay ? { pending: replay.pending } : { cached: replay.value };
        db.exec('COMMIT'); return result;
      }
      db.prepare('INSERT OR IGNORE INTO ai_daily_usage(workspace_id,day_utc) VALUES(?,?)').run(this.store.workspaceId, day);
      const daily = db.prepare('SELECT accepted_operations FROM ai_daily_usage WHERE workspace_id=? AND day_utc=?').get(this.store.workspaceId, day) as { accepted_operations: number };
      if (daily.accepted_operations >= this.limits.dailyOperations) { db.exec('ROLLBACK'); return { error: err(429, 'AI_DAILY_LIMIT', 'Daily local AI operation limit reached.', { limit: this.limits.dailyOperations, resetsAt: `${day}T23:59:59.999Z` }) }; }
      const recent = Number((db.prepare("SELECT count(*) AS count FROM ai_operations WHERE workspace_id=? AND created_at>=?").get(this.store.workspaceId, new Date(Date.now() - 60_000).toISOString()) as { count: number }).count);
      if (recent >= this.limits.operationsPerMinute) { db.exec('ROLLBACK'); return { error: err(429, 'AI_RATE_LIMIT', 'Wait before starting another AI operation.', { retryAfterSeconds: 60 }) }; }
      const inFlight = Number((db.prepare("SELECT count(*) AS count FROM ai_operations WHERE workspace_id=? AND status='running'").get(this.store.workspaceId) as { count: number }).count);
      if (inFlight >= this.limits.maxInFlight) { db.exec('ROLLBACK'); return { error: err(429, 'AI_OPERATION_IN_PROGRESS', 'Another AI operation is already running.', { retryAfterSeconds: 3 }) }; }
      if (this.liveTest) {
        const budget = db.prepare('SELECT limit_usd,committed_usd FROM ai_live_budget WHERE id=1').get() as { limit_usd: number; committed_usd: number };
        if (budget.committed_usd + reserveUsd > budget.limit_usd) { db.exec('ROLLBACK'); return { error: err(429, 'AI_LIVE_BUDGET_EXCEEDED', 'The remaining live-test budget cannot cover the worst-case request and retry.') }; }
        db.prepare('UPDATE ai_live_budget SET committed_usd=committed_usd+? WHERE id=1').run(reserveUsd);
      }
      db.prepare(`INSERT INTO ai_operations(operation_id,workspace_id,itinerary_id,operation_kind,target_kind,target_id,expected_revision,fingerprint,status,attempts,reserved_usd,day_utc,created_at,updated_at)
        VALUES(?,?,?,?,?,?,?,?,'running',0,?,?,?,?)`).run(body.operationId, this.store.workspaceId, record.id, task, body.target?.kind || null, body.target?.id || null, body.expectedRevision, operationFingerprint, reserveUsd, day, now, now);
      db.prepare('UPDATE ai_daily_usage SET accepted_operations=accepted_operations+1,reserved_usd=reserved_usd+? WHERE workspace_id=? AND day_utc=?').run(reserveUsd, this.store.workspaceId, day);
      if (this.liveTest) db.prepare("INSERT INTO ai_live_budget_entries(operation_id,reserved_usd,status,updated_at) VALUES(?,?,'reserved',?)").run(body.operationId, reserveUsd, now);
      db.exec('COMMIT');
      return { reservedUsd: reserveUsd };
    } catch (cause) {
      try { db.exec('ROLLBACK'); } catch { /* Transaction may already be closed. */ }
      throw cause;
    }
  }

  private markAttempt(operationId: string, attempt: number) {
    this.store.db.prepare("UPDATE ai_operations SET attempts=?,updated_at=? WHERE operation_id=? AND status='running'").run(attempt, nowIso(), operationId);
  }

  private finish(operationId: string, reserved: number, actual: number, promptTokens: number | null, completionTokens: number | null, status: string, errorCode: string | null, suggestion?: string) {
    const db = this.store.db; const now = nowIso();
    db.exec('BEGIN IMMEDIATE');
    try {
      const operation = db.prepare('SELECT day_utc FROM ai_operations WHERE operation_id=?').get(operationId) as { day_utc: string };
      db.prepare('UPDATE ai_operations SET status=?,actual_usd=?,prompt_tokens=?,completion_tokens=?,suggestion_text=?,error_code=?,updated_at=? WHERE operation_id=?')
        .run(status, actual, promptTokens ?? 0, completionTokens ?? 0, suggestion ?? null, errorCode, now, operationId);
      db.prepare('UPDATE ai_daily_usage SET reserved_usd=max(0,reserved_usd-?),actual_usd=actual_usd+? WHERE workspace_id=? AND day_utc=?')
        .run(reserved, actual, this.store.workspaceId, operation.day_utc);
      if (this.liveTest) {
        db.prepare('UPDATE ai_live_budget SET committed_usd=max(0,committed_usd-?+?) WHERE id=1').run(reserved, actual);
        db.prepare('UPDATE ai_live_budget_entries SET actual_usd=?,status=?,updated_at=? WHERE operation_id=?').run(actual, status === 'uncertain' ? 'uncertain' : status === 'completed' || status === 'stale' || status === 'failed' && actual > 0 ? 'settled' : 'released', now, operationId);
      }
      db.exec('COMMIT');
    } catch (cause) { try { db.exec('ROLLBACK'); } catch { /* Transaction may already be closed. */ } throw cause; }
  }
}

function sendError(reply: FastifyReply, error: ServiceError) {
  if (error.code === 'AI_RATE_LIMIT' && isObject(error.fields) && typeof error.fields.retryAfterSeconds === 'number') reply.header('retry-after', String(error.fields.retryAfterSeconds));
  return reply.code(error.status).send({ error: { code: error.code, message: error.message, ...(error.fields ? { fields: error.fields } : {}) } });
}
function hasOnlyKeys(body: Record<string, unknown>, keys: string[]) { return Object.keys(body).every(key => keys.includes(key)); }

export function registerAiRoutes(app: FastifyInstance, service: AiService) {
  app.get('/api/v1/itinerary-engine/ai/preflight', async (_request, reply) => {
    const result = await service.preflight();
    if (result.modelState !== 'listed' || !result.authenticated || !result.pricing) return reply.code(503).send({ error: { code: 'PROVIDER_UNAVAILABLE', message: 'The configured provider/model is not ready.', details: { credentialState: result.credentialState, authenticated: result.authenticated, modelState: result.modelState } } });
    return result;
  });
  app.post<{ Params: { id: string }; Body: unknown }>('/api/v1/itineraries/:id/language/resolve', async (request, reply) => {
    if (!isObject(request.body) || !hasOnlyKeys(request.body, ['expectedRevision']) || !Number.isInteger(request.body.expectedRevision)) return reply.code(422).send({ error: { code: 'INVALID_REQUEST', message: 'Expected revision is required.' } });
    const result = service.resolveLanguage(request.params.id, Number(request.body.expectedRevision));
    return 'error' in result && result.error ? sendError(reply, result.error) : { ...result.value, requestId: request.id };
  });
  app.post<{ Params: { id: string }; Body: unknown }>('/api/v1/itineraries/:id/ai/overview', async (request, reply) => {
    const body = request.body;
    if (!isObject(body) || !hasOnlyKeys(body, ['operationId', 'expectedRevision']) || typeof body.operationId !== 'string' || !uuidPattern.test(body.operationId) || !Number.isInteger(body.expectedRevision)) return reply.code(422).send({ error: { code: 'INVALID_REQUEST', message: 'Operation ID and expected revision are required.' } });
    const result = await service.suggest(request.params.id, 'overview', body as AiRequest);
    if ('error' in result && result.error) return sendError(reply, result.error);
    if ('pending' in result) return reply.code(202).send(result.pending);
    return result.value;
  });
  app.post<{ Params: { id: string }; Body: unknown }>('/api/v1/itineraries/:id/ai/description', async (request, reply) => {
    const body = request.body;
    if (!isObject(body) || !hasOnlyKeys(body, ['operationId', 'expectedRevision', 'target']) || typeof body.operationId !== 'string' || !uuidPattern.test(body.operationId) || !Number.isInteger(body.expectedRevision) || !isObject(body.target) || !hasOnlyKeys(body.target, ['kind', 'id']) || !['activity', 'place'].includes(String(body.target.kind)) || typeof body.target.id !== 'string') return reply.code(422).send({ error: { code: 'INVALID_REQUEST', message: 'Operation ID, expected revision and a stable target ID are required.' } });
    const result = await service.suggest(request.params.id, 'description', body as AiRequest);
    if ('error' in result && result.error) return sendError(reply, result.error);
    if ('pending' in result) return reply.code(202).send(result.pending);
    return result.value;
  });
}
