import Fastify, { type FastifyInstance } from 'fastify';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import sharp, { type Metadata } from 'sharp';
import { access, mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { validateDraft } from '../contracts/validator.js';
import type { ItineraryMode, LanguageContext } from '../contracts/types.js';
import { createBlankDraft } from './draft.js';
import { openStore } from './store.js';
import { renderSavedDraftPreview } from './preview.js';
import { listPublishedVersions, publicationStatus, publishSavedRevision, readPublicOgImage, readPublicPage, recoverPublication, revokePublication } from './publication.js';
import { loadOpenRouterCredential } from './ai/credentials.js';
import { OpenRouterProvider, type AiProvider } from './ai/provider.js';
import { AiService, registerAiRoutes, type AiServiceLimits } from './ai/service.js';

export interface AppOptions {
  dataDir?: string; publicOrigin?: string; shareOrigin?: string; allowedOrigins?: string[]; renderStylesheetPath?: string;
  /** Test-only deterministic barrier for exercising revoke/republish during an artifact read. */
  afterPublicArtifactRead?: () => Promise<void>;
  /** Test-only crash seam after artifacts are promoted but before the publication transaction. */
  afterPublicationPromote?: () => Promise<void>;
  aiProvider?: AiProvider; liveAiTest?: boolean; aiLimits?: AiServiceLimits;
  /** Test-only renderer seam; production always uses the saved-draft preview renderer. */
  renderPreview?: typeof renderSavedDraftPreview;
}
const profileKeys = new Set(['agencyName', 'agencyContact', 'agencyLogoAssetId']);
const modes = new Set<ItineraryMode>(['half_day', 'full_day', 'multi_day', 'destination_guide']);
const defaultLanguage: LanguageContext = { requestedLanguage: 'auto', outputLanguage: null, source: 'unresolved' };
const defaultWriting = { brief: '', notes: [] as Array<{ targetId: string; text: string }> };
function envLimit(name: string, fallback: number, min: number, max: number) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) throw new Error(`${name} must be an integer between ${min} and ${max}.`);
  return value;
}

function error(code: string, message: string, fields?: unknown, requestId?: string) { return { error: { code, message, ...(fields ? { fields } : {}), ...(requestId ? { requestId } : {}) } }; }
function object(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
function validLanguage(value: unknown, contentLocale: unknown): boolean {
  if (!object(value) || Object.keys(value).some((key) => !['requestedLanguage', 'outputLanguage', 'source'].includes(key))) return false;
  const { requestedLanguage, outputLanguage, source } = value;
  const validTag = (tag: unknown) => typeof tag === 'string' && (() => { try { return Intl.getCanonicalLocales(tag).length === 1; } catch { return false; } })();
  return (requestedLanguage === 'auto' || validTag(requestedLanguage)) && (outputLanguage === null || validTag(outputLanguage)) && outputLanguage === contentLocale && ['detected', 'explicit', 'unresolved'].includes(String(source)) && ((source === 'unresolved') === (outputLanguage === null)) && (source !== 'explicit' || requestedLanguage === outputLanguage) && (source !== 'detected' || requestedLanguage === 'auto');
}
function validWriting(value: unknown): boolean {
  return object(value) && Object.keys(value).every((key) => ['brief', 'notes'].includes(key)) && typeof value.brief === 'string' && value.brief.length <= 20000 && Array.isArray(value.notes) && value.notes.length <= 100 && value.notes.every((note) => object(note) && Object.keys(note).every((key) => ['targetId', 'text'].includes(key)) && typeof note.targetId === 'string' && typeof note.text === 'string' && note.text.length <= 4000);
}
function assetIds(content: any): string[] {
  return [content.cover?.assetId, ...(content.days || []).map((item: any) => item?.photo?.assetId), ...(content.places || []).map((item: any) => item?.photo?.assetId)].filter((id): id is string => typeof id === 'string' && id.length > 0);
}
async function cleanUploadOrphans(dataDir: string, referenced: string[]) {
  const known = new Set(referenced);
  for (const [directory, pattern] of [['assets', /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(?:jpeg|png|webp)$/i], ['tmp', /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.upload$/i]] as const) {
    const root = path.join(dataDir, directory);
    await mkdir(root, { recursive: true });
    for (const entry of await readdir(root, { withFileTypes: true })) {
      if (entry.isFile() && pattern.test(entry.name) && (directory === 'tmp' || !known.has(entry.name))) await rm(path.join(root, entry.name), { force: true });
    }
  }
}
export async function createApp(options: AppOptions = {}): Promise<FastifyInstance> {
  const dataDir = path.resolve(options.dataDir || process.env.ENGINE_DATA_DIR || '.runtime');
  const origin = options.publicOrigin || process.env.PUBLIC_ORIGIN || 'http://127.0.0.1:3000';
  const shareOrigin = options.shareOrigin || process.env.SHARE_ORIGIN || origin;
  const shareUrl = new URL(shareOrigin);
  if (!['http:', 'https:'].includes(shareUrl.protocol) || shareUrl.username || shareUrl.password || shareUrl.pathname !== '/' || shareUrl.search || shareUrl.hash) throw new Error('SHARE_ORIGIN must be an absolute HTTP(S) origin without path, credentials, query or fragment.');
  const trustedShareOrigin = shareUrl.origin;
  const allowedOrigins = new Set(options.allowedOrigins || [origin, 'http://127.0.0.1:5173']);
  const store = openStore({ dataDir });
  await cleanUploadOrphans(dataDir, store.storageKeys());
  await recoverPublication(store, dataDir);
  const provider = options.aiProvider || new OpenRouterProvider(await loadOpenRouterCredential());
  const aiLimits = options.aiLimits || {
    dailyOperations: envLimit('OPENROUTER_DAILY_LIMIT', 30, 1, 30),
    operationsPerMinute: envLimit('OPENROUTER_RATE_PER_MINUTE', 2, 1, 2),
    maxInFlight: envLimit('OPENROUTER_MAX_IN_FLIGHT', 1, 1, 1),
    contextBytes: envLimit('OPENROUTER_CONTEXT_BYTES', 16 * 1024, 1024, 16 * 1024),
    timeoutMs: envLimit('OPENROUTER_TIMEOUT_MS', 45_000, 5000, 45_000)
  };
  const ai = new AiService(store, provider, options.liveAiTest ?? process.env.OPENROUTER_LIVE_TEST === '1', aiLimits);
  const app = Fastify({ logger: false, bodyLimit: 2 * 1024 * 1024, genReqId: () => randomUUID() });
  app.decorate('store', store);
  await app.register(multipart, { limits: { files: 1, fileSize: 5 * 1024 * 1024, fields: 0, parts: 1 } });
  const distDir = path.resolve('dist');
  try {
    await access(path.join(distDir, 'index.html'));
    await app.register(fastifyStatic, { root: distDir, prefix: '/', wildcard: true });
  } catch { /* Development serves the React shell through Vite. */ }
  app.addHook('onRequest', async (request, reply) => {
    if (['POST', 'PATCH', 'PUT', 'DELETE'].includes(request.method)) {
      const requestOrigin = request.headers.origin;
      if (!requestOrigin || !allowedOrigins.has(requestOrigin) || request.headers['x-engine-request'] !== '1') return reply.code(403).send(error('ORIGIN_FORBIDDEN', 'This local management request is not allowed.'));
    }
  });
  app.addHook('onClose', async () => store.close());
  app.setErrorHandler((cause, request, reply) => {
    const statusCode = typeof cause === 'object' && cause !== null && 'statusCode' in cause ? Number(cause.statusCode) : 500;
    const status = statusCode === 413 ? 413 : statusCode === 400 ? 400 : 500;
    const code = status === 413 ? 'PAYLOAD_TOO_LARGE' : status === 400 ? 'INVALID_REQUEST' : 'INTERNAL_ERROR';
    request.log.error({ requestId: request.id, code });
    void reply.code(status).send(error(code, status === 500 ? 'The request could not be completed.' : 'The request is invalid.', undefined, request.id));
  });
  app.setNotFoundHandler((request, reply) => reply.code(404).send(error('NOT_FOUND', 'Route not found.', undefined, request.id)));
  app.addHook('onSend', async (request, reply, payload) => {
    if (!reply.getHeader('content-type')?.toString().includes('application/json') || typeof payload !== 'string') return payload;
    try {
      const body = JSON.parse(payload);
      if (body?.error && !body.error.requestId) return JSON.stringify({ ...body, error: { ...body.error, requestId: request.id } });
    } catch { /* Preserve non-JSON output. */ }
    return payload;
  });

  app.get('/api/v1/itinerary-engine/context', async () => ({
    workspace: store.workspace(), accessMode: 'loopback', limits: { jsonBytes: 2 * 1024 * 1024, imageBytes: 5 * 1024 * 1024, imagePixels: 16_000_000 },
    capabilities: { locales: ['la', 'fr', 'en', 'id', 'ja', 'zh-Hans'], render: 'available', ai: ai.contextSummary() }
  }));
  app.get('/api/v1/itinerary-engine/profile', async () => store.workspace());
  app.patch<{ Body: unknown }>('/api/v1/itinerary-engine/profile', async (request, reply) => {
    const body = request.body;
    if (!object(body) || Object.keys(body).some((key) => !['expectedRevision', 'profile'].includes(key)) || !Number.isInteger(body.expectedRevision) || !object(body.profile) || Object.keys(body.profile).some((key) => !profileKeys.has(key))) return reply.code(422).send(error('INVALID_PROFILE', 'Profile fields or revision are invalid.'));
    const p = body.profile;
    if (typeof p.agencyName !== 'string' || p.agencyName.length > 160 || typeof p.agencyContact !== 'string' || p.agencyContact.length > 320 || (p.agencyLogoAssetId !== null && typeof p.agencyLogoAssetId !== 'string')) return reply.code(422).send(error('INVALID_PROFILE', 'Profile values are invalid.'));
    if (p.agencyLogoAssetId && !store.getAsset(p.agencyLogoAssetId)) return reply.code(422).send(error('ASSET_INVALID', 'The profile logo must reference an uploaded workspace asset.'));
    if (!store.updateProfile(p, Number(body.expectedRevision))) return reply.code(409).send(error('REVISION_CONFLICT', 'The profile changed since it was loaded.', { currentRevision: store.workspace().revision }));
    return store.workspace();
  });

  app.get<{ Querystring: { cursor?: string; limit?: string } }>('/api/v1/itineraries', async (request, reply) => {
    const limit = Math.max(1, Math.min(100, Number(request.query.limit) || 50));
    const page = store.listItineraries(request.query.cursor || null, limit);
    return page || reply.code(422).send(error('INVALID_CURSOR', 'The list cursor is not valid.'));
  });
  app.post<{ Body: unknown }>('/api/v1/itineraries', async (request, reply) => {
    const body = request.body;
    if (!object(body) || Object.keys(body).some((key) => !['mode', 'draftContent', 'languageContext', 'writingContext'].includes(key))) return reply.code(422).send(error('INVALID_REQUEST', 'Create request fields are invalid.'));
    if (body.mode !== undefined && !modes.has(body.mode as ItineraryMode)) return reply.code(422).send(error('INVALID_MODE', 'Choose a supported itinerary mode.'));
    const content = body.draftContent === undefined ? createBlankDraft((body.mode || 'half_day') as ItineraryMode) : body.draftContent;
    const checked = validateDraft(content);
    if (!checked.ok) return reply.code(422).send(error('INVALID_DOCUMENT', 'The draft does not match the canonical content schema.', checked.errors));
    if (body.mode !== undefined && checked.value.trip.mode !== body.mode) return reply.code(422).send(error('MODE_MISMATCH', 'The requested mode must match the canonical draft mode.'));
    const language = body.languageContext === undefined ? { ...defaultLanguage, outputLanguage: checked.value.trip.language } : body.languageContext;
    const writing = body.writingContext === undefined ? defaultWriting : body.writingContext;
    if (!validLanguage(language, checked.value.trip.language)) return reply.code(422).send(error('INVALID_LANGUAGE_CONTEXT', 'Language metadata must match the canonical output locale.'));
    if (!validWriting(writing)) return reply.code(422).send(error('INVALID_WRITING_CONTEXT', 'Writing context is invalid.'));
    if (assetIds(checked.value).some((id) => !store.getAsset(id))) return reply.code(422).send(error('ASSET_INVALID', 'Every draft asset reference must belong to this workspace.'));
    const record = store.createItinerary(checked.value, language, writing);
    return reply.code(201).send({ ...record, warnings: checked.warnings });
  });
  app.get<{ Params: { id: string } }>('/api/v1/itineraries/:id', async (request, reply) => {
    const record = store.getItinerary(request.params.id);
    return record ? record : reply.code(404).send(error('NOT_FOUND', 'Itinerary not found.'));
  });
  app.patch<{ Params: { id: string }; Body: unknown }>('/api/v1/itineraries/:id', async (request, reply) => {
    const body = request.body;
    if (!object(body) || Object.keys(body).some((key) => !['expectedRevision', 'draftContent', 'languageContext', 'writingContext'].includes(key)) || !Number.isInteger(body.expectedRevision) || !('draftContent' in body) || !('languageContext' in body) || !('writingContext' in body)) return reply.code(422).send(error('INVALID_REQUEST', 'Expected revision and the complete draft metadata are required.'));
    const previous = store.getItinerary(request.params.id);
    if (!previous) return reply.code(404).send(error('NOT_FOUND', 'Itinerary not found.'));
    const checked = validateDraft(body.draftContent);
    if (!checked.ok) return reply.code(422).send(error('INVALID_DOCUMENT', 'The draft does not match the canonical content schema.', checked.errors));
    if (!validLanguage(body.languageContext, checked.value.trip.language)) return reply.code(422).send(error('INVALID_LANGUAGE_CONTEXT', 'Language metadata must match the canonical output locale.'));
    if (!validWriting(body.writingContext)) return reply.code(422).send(error('INVALID_WRITING_CONTEXT', 'Writing context is invalid.'));
    if (assetIds(checked.value).some((id) => !store.getAsset(id))) return reply.code(422).send(error('ASSET_INVALID', 'Every draft asset reference must belong to this workspace.'));
    const record = store.updateItinerary(request.params.id, Number(body.expectedRevision), checked.value, body.languageContext, body.writingContext);
    if (!record) return reply.code(409).send(error('REVISION_CONFLICT', 'The itinerary changed since it was loaded.', { currentRevision: store.getItinerary(request.params.id)?.revision ?? previous.revision }));
    return { ...record, warnings: checked.warnings };
  });

  app.post<{ Params: { id: string }; Body: unknown }>('/api/v1/itineraries/:id/preview', async (request, reply) => {
    const body = request.body;
    if (!object(body) || Object.keys(body).some((key) => key !== 'expectedRevision') || !Number.isInteger(body.expectedRevision)) return reply.code(422).send(error('INVALID_REQUEST', 'Expected revision is required.'));
    const record = store.getItinerary(request.params.id);
    if (!record) return reply.code(404).send(error('NOT_FOUND', 'Itinerary not found.'));
    if (record.revision !== body.expectedRevision) return reply.code(409).send(error('REVISION_CONFLICT', 'Save the current draft before previewing.', { currentRevision: record.revision }));
    const result = await (options.renderPreview ?? renderSavedDraftPreview)(record, store, dataDir, options.renderStylesheetPath);
    if (!result.ok) return reply.code(result.status).send(error('PREVIEW_BLOCKED', 'Preview cannot be rendered safely.', { errors: result.errors, warnings: result.warnings }));
    if (store.getItinerary(record.id)?.revision !== record.revision) return reply.code(409).send(error('REVISION_CONFLICT', 'The draft changed while preview was rendering; save and preview again.'));
    return { itineraryId: record.id, revision: record.revision, html: result.html, publishReady: result.publishReady, errors: result.errors, warnings: result.warnings, scheduleVerification: result.scheduleVerification };
  });

  app.post<{ Params: { id: string }; Body: unknown }>('/api/v1/itineraries/:id/publish', async (request, reply) => {
    const body = request.body;
    if (!object(body) || Object.keys(body).some((key) => !['operationId', 'expectedRevision'].includes(key)) || typeof body.operationId !== 'string' || !/^[0-9a-f-]{36}$/i.test(body.operationId) || !Number.isInteger(body.expectedRevision)) return reply.code(422).send(error('INVALID_REQUEST', 'Publish operation ID and expected revision are required.'));
    const result = await publishSavedRevision({ store, itineraryId: request.params.id, expectedRevision: Number(body.expectedRevision), operationId: body.operationId, dataDir, stylesheetPath: options.renderStylesheetPath, shareOrigin: trustedShareOrigin, afterPromote: options.afterPublicationPromote, render: options.renderPreview });
    if (result.kind === 'missing') return reply.code(404).send(error('NOT_FOUND', 'Itinerary not found.'));
    if (result.kind === 'stale') return reply.code(409).send(error('REVISION_CONFLICT', 'Save the current draft before publishing.', { currentRevision: result.revision }));
    if (result.kind === 'operation_conflict') return reply.code(409).send(error('PUBLISH_OPERATION_CONFLICT', 'This operation ID was already used with different publication state.'));
    if (result.kind === 'pending') return reply.code(202).send({ status: 'pending', operationId: body.operationId });
    if (result.kind === 'invalid') return reply.code(result.status).send(error('PUBLISH_VALIDATION_FAILED', 'The saved draft is not ready to publish.', { errors: result.errors, warnings: result.warnings }));
    if (result.kind === 'failed') return reply.code(result.code === 'REVISION_CONFLICT' || result.code === 'PUBLICATION_CONFLICT' ? 409 : 503).send(error(result.code, 'Publication could not be completed; the previous published version remains available.'));
    return { status: 'published', operationId: body.operationId, itineraryId: request.params.id, versionId: result.versionId, sourceRevision: result.sourceRevision, createdAt: result.createdAt, shareUrl: result.shareUrl, replayed: result.replayed };
  });
  app.get<{ Params: { id: string } }>('/api/v1/itineraries/:id/publication', async (request, reply) => {
    const status = publicationStatus(store, request.params.id, trustedShareOrigin);
    return status || reply.code(404).send(error('NOT_FOUND', 'Itinerary not found.'));
  });
  app.get<{ Params: { id: string }; Querystring: { cursor?: string; limit?: string } }>('/api/v1/itineraries/:id/versions', async (request, reply) => {
    const limit = Math.max(1, Math.min(100, Number(request.query.limit) || 25));
    const versions = listPublishedVersions(store, request.params.id, request.query.cursor || null, limit);
    return versions || reply.code(404).send(error('NOT_FOUND', 'Itinerary not found.'));
  });
  app.post<{ Params: { id: string }; Body: unknown }>('/api/v1/itineraries/:id/unpublish', async (request, reply) => {
    const body = request.body;
    if (!object(body) || Object.keys(body).some((key) => key !== 'expectedPublicationEpoch') || !Number.isInteger(body.expectedPublicationEpoch)) return reply.code(422).send(error('INVALID_REQUEST', 'Expected publication epoch is required.'));
    const result = revokePublication(store, request.params.id, Number(body.expectedPublicationEpoch));
    if (result.kind === 'missing') return reply.code(404).send(error('NOT_FOUND', 'Itinerary not found.'));
    if (result.kind === 'conflict') return reply.code(409).send(error('PUBLICATION_CONFLICT', 'Publication changed since it was loaded.', { currentEpoch: result.epoch }));
    return { itineraryId: request.params.id, active: result.active, epoch: result.epoch };
  });
  app.get<{ Params: { token: string } }>('/i/:token', async (request, reply) => {
    const html = await readPublicPage(store, dataDir, request.params.token, options.afterPublicArtifactRead);
    if (!html) return reply.code(404).send(error('NOT_FOUND', 'Published page not found.'));
    return reply.type('text/html; charset=utf-8').header('cache-control', 'no-store').header('x-robots-tag', 'noindex, nofollow').header('referrer-policy', 'no-referrer').header('x-content-type-options', 'nosniff').header('content-security-policy', "default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src data:; script-src 'none'; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'").send(html);
  });
  app.get<{ Params: { token: string } }>('/i/:token/og-image', async (request, reply) => {
    const image = await readPublicOgImage(store, dataDir, request.params.token, options.afterPublicArtifactRead);
    if (!image) return reply.code(404).send(error('NOT_FOUND', 'Published image not found.'));
    return reply.type('image/jpeg').header('content-length', String(image.length)).header('cache-control', 'no-store').header('x-robots-tag', 'noindex, nofollow').header('x-content-type-options', 'nosniff').header('referrer-policy', 'no-referrer').send(image);
  });

  app.get<{ Querystring: { cursor?: string; limit?: string } }>('/api/v1/assets', async (request) => {
    const limit = Math.max(1, Math.min(100, Number(request.query.limit) || 50));
    const items = store.listAssets(request.query.cursor || null, limit);
    return { items, nextCursor: items.length === limit ? items.at(-1)?.id || null : null };
  });
  app.post('/api/v1/assets', async (request, reply) => {
    const part = await request.file();
    if (!part) return reply.code(422).send(error('ASSET_INVALID', 'Upload one image file.'));
    const input = await part.toBuffer();
    let metadata: Metadata;
    try { metadata = await sharp(input, { limitInputPixels: 16_000_000, failOn: 'error' }).metadata(); }
    catch { return reply.code(422).send(error('ASSET_INVALID', 'The uploaded file is not a supported image.')); }
    if (!['jpeg', 'png', 'webp'].includes(metadata.format || '') || !metadata.width || !metadata.height || metadata.width > 8192 || metadata.height > 8192 || metadata.width * metadata.height > 16_000_000) return reply.code(422).send(error('ASSET_INVALID', 'Use a JPEG, PNG or WebP image no larger than 16 megapixels.'));
    const idKey = randomUUID(); const temp = path.join(dataDir, 'tmp', `${idKey}.upload`); const final = path.join(dataDir, 'assets', `${idKey}.${metadata.format}`);
    await mkdir(path.dirname(temp), { recursive: true }); await mkdir(path.dirname(final), { recursive: true });
    let output: Buffer;
    try { output = await sharp(input, { limitInputPixels: 16_000_000, failOn: 'error' }).rotate().toFormat(metadata.format as 'jpeg'|'png'|'webp').toBuffer(); }
    catch { return reply.code(422).send(error('ASSET_INVALID', 'The uploaded image could not be decoded safely.')); }
    if (output.length > 5 * 1024 * 1024) return reply.code(413).send(error('PAYLOAD_TOO_LARGE', 'The processed image exceeds 5 MiB.'));
    try {
      await writeFile(temp, output, { flag: 'wx' }); await rename(temp, final);
      const info = await sharp(output).metadata();
      const asset = store.createAsset({ mime: `image/${metadata.format === 'jpeg' ? 'jpeg' : metadata.format}`, bytes: output.length, width: info.width!, height: info.height!, filename: part.filename.replace(/[\\/\x00-\x1f]/g, '_').slice(0, 180) || 'image' }, `${idKey}.${metadata.format}`);
      return reply.code(201).send(asset);
    } catch (cause) {
      await rm(temp, { force: true }); await rm(final, { force: true }); throw cause;
    }
  });
  app.get<{ Params: { id: string } }>('/api/v1/assets/:id', async (request, reply) => {
    const asset = store.getAsset(request.params.id);
    if (!asset) return reply.code(404).send(error('NOT_FOUND', 'Asset not found.'));
    let bytes: Buffer;
    try { bytes = await readFile(path.join(dataDir, 'assets', asset.storage_key)); }
    catch (cause) {
      if ((cause as NodeJS.ErrnoException)?.code === 'ENOENT') return reply.code(404).send(error('ASSET_FILE_MISSING', 'The asset record exists but its file is missing from storage.'));
      throw cause;
    }
    return reply.header('content-type', asset.mime).header('content-length', String(bytes.length)).header('x-content-type-options', 'nosniff').send(bytes);
  });

  app.get('/api/health', async () => ({ status: 'ok' }));
  registerAiRoutes(app, ai);
  return app;
}
