import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import sharp from 'sharp';
import { createApp } from '../../src/server/app.js';
import { createContent } from './fixtures.js';

const headers = { origin: 'http://127.0.0.1:3000', 'x-engine-request': '1', 'content-type': 'application/json' };

async function setup(t: any, mode: 'half_day' | 'full_day' | 'multi_day' | 'destination_guide' = 'full_day') {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'itinerary-cp024-'));
  const stylesheetPath = path.join(dataDir, 'brochure.css');
  await writeFile(stylesheetPath, 'body{font-family:sans-serif}.brochure{max-width:900px}');
  const app = await createApp({ dataDir, renderStylesheetPath: stylesheetPath });
  t.after(async () => { await app.close(); await rm(dataDir, { recursive: true, force: true }); });
  const created = await app.inject({ method: 'POST', url: '/api/v1/itineraries', headers, payload: { mode } });
  const blank = created.json();
  const content = createContent(mode, 'en');
  const saved = await app.inject({ method: 'PATCH', url: `/api/v1/itineraries/${blank.id}`, headers, payload: { expectedRevision: blank.revision, draftContent: content, languageContext: { requestedLanguage: 'en', outputLanguage: 'en', source: 'explicit' }, writingContext: blank.writingContext } });
  assert.equal(saved.statusCode, 200, saved.body);
  return { app, id: blank.id, revision: saved.json().revision, content, stylesheetPath, dataDir };
}

test('preview renders a saved incomplete draft and separates publish diagnostics without mutation', async (t) => {
  const f = await setup(t);
  const incomplete = structuredClone(f.content);
  incomplete.brochure.tripTitle = '';
  incomplete.overview.summary = '';
  incomplete.schedule[0].activities[0].timeLabel = 'morning';
  incomplete.schedule[0].activities[0].durationLabel = null;
  const saved = await f.app.inject({ method: 'PATCH', url: `/api/v1/itineraries/${f.id}`, headers, payload: { expectedRevision: f.revision, draftContent: incomplete, languageContext: { requestedLanguage: 'en', outputLanguage: 'en', source: 'explicit' }, writingContext: { brief: '', notes: [] } } });
  assert.equal(saved.statusCode, 200, saved.body);
  const before = saved.json();
  const response = await f.app.inject({ method: 'POST', url: `/api/v1/itineraries/${f.id}/preview`, headers, payload: { expectedRevision: before.revision } });
  assert.equal(response.statusCode, 200, response.body);
  const result = response.json();
  assert.equal(result.publishReady, false);
  assert.match(result.html, /<html lang="en">/);
  assert.ok(result.errors.some((item: any) => item.path === 'brochure.tripTitle'));
  assert.ok(result.warnings.some((item: any) => item.code === 'SCHEDULE_NOT_FULLY_VERIFIED'));
  const reopened = (await f.app.inject({ url: `/api/v1/itineraries/${f.id}` })).json();
  assert.equal(reopened.revision, before.revision);
  assert.deepEqual(reopened.draftContent, before.draftContent);
  assert.deepEqual(reopened.languageContext, before.languageContext);
  assert.deepEqual(reopened.writingContext, before.writingContext);
});

test('preview marks an explicit interval overlap and provable half-day cap as blocking errors', async (t) => {
  const f = await setup(t);
  const content = structuredClone(f.content);
  content.brochure.itineraryMode = 'half_day';
  content.brochure.scopeLabel = 'Half day';
  const base = content.schedule[0].activities[0];
  content.schedule[0].activities = Array.from({ length: 7 }, (_, index) => ({ ...base, id: randomUUID(), timeLabel: `${String(index).padStart(2, '0')}:00`, durationLabel: '60 minutes' }));
  content.schedule[0].activities[1].timeLabel = '00:30';
  const saved = await f.app.inject({ method: 'PATCH', url: `/api/v1/itineraries/${f.id}`, headers, payload: { expectedRevision: f.revision, draftContent: content, languageContext: { requestedLanguage: 'en', outputLanguage: 'en', source: 'explicit' }, writingContext: { brief: '', notes: [] } } });
  assert.equal(saved.statusCode, 200, saved.body);
  const response = await f.app.inject({ method: 'POST', url: `/api/v1/itineraries/${f.id}/preview`, headers, payload: { expectedRevision: saved.json().revision } });
  const diagnostics = response.json();
  assert.equal(response.statusCode, 200);
  assert.equal(diagnostics.publishReady, false);
  assert.ok(diagnostics.errors.some((item: any) => item.code === 'SCHEDULE_OVERLAP'));
  assert.ok(diagnostics.errors.some((item: any) => item.code === 'SCHEDULE_DURATION_CAP'));
});

test('preview rejects stale and unresolved locale; benign price wording remains allowed', async (t) => {
  const f = await setup(t);
  const stale = await f.app.inject({ method: 'POST', url: `/api/v1/itineraries/${f.id}/preview`, headers, payload: { expectedRevision: f.revision - 1 } });
  assert.equal(stale.statusCode, 409);
  const content = structuredClone(f.content);
  content.overview.summary = 'Prices are not listed; ask the guide for current details.';
  const saved = await f.app.inject({ method: 'PATCH', url: `/api/v1/itineraries/${f.id}`, headers, payload: { expectedRevision: f.revision, draftContent: content, languageContext: { requestedLanguage: 'en', outputLanguage: 'en', source: 'explicit' }, writingContext: { brief: '', notes: [] } } });
  assert.equal(saved.statusCode, 200);
  const ok = await f.app.inject({ method: 'POST', url: `/api/v1/itineraries/${f.id}/preview`, headers, payload: { expectedRevision: saved.json().revision } });
  assert.equal(ok.statusCode, 200, ok.body);
  assert.equal(ok.json().publishReady, true);
  content.overview.summary = 'The guide suggests starting at 08:00; prices are not listed.';
  content.schedule[0].activities[0].description = 'The visit begins at 08:00 with a local guide.';
  const benignCopy = await f.app.inject({ method: 'PATCH', url: `/api/v1/itineraries/${f.id}`, headers, payload: { expectedRevision: saved.json().revision, draftContent: content, languageContext: { requestedLanguage: 'en', outputLanguage: 'en', source: 'explicit' }, writingContext: { brief: '', notes: [] } } });
  const benignPreview = await f.app.inject({ method: 'POST', url: `/api/v1/itineraries/${f.id}/preview`, headers, payload: { expectedRevision: benignCopy.json().revision } });
  assert.equal(benignPreview.json().publishReady, true, benignPreview.body);
  content.overview.summary = 'The ticket costs Rp 250.000.';
  const invalidCopy = await f.app.inject({ method: 'PATCH', url: `/api/v1/itineraries/${f.id}`, headers, payload: { expectedRevision: benignCopy.json().revision, draftContent: content, languageContext: { requestedLanguage: 'en', outputLanguage: 'en', source: 'explicit' }, writingContext: { brief: '', notes: [] } } });
  const blockedCopy = await f.app.inject({ method: 'POST', url: `/api/v1/itineraries/${f.id}/preview`, headers, payload: { expectedRevision: invalidCopy.json().revision } });
  assert.equal(blockedCopy.json().publishReady, false);
  assert.ok(blockedCopy.json().errors.some((item: any) => item.code === 'PUBLISH_CURRENCY_CLAIM'));
  const unresolved = structuredClone(content);
  unresolved.brochure.outputLanguage = null;
  const unresolvedSave = await f.app.inject({ method: 'PATCH', url: `/api/v1/itineraries/${f.id}`, headers, payload: { expectedRevision: invalidCopy.json().revision, draftContent: unresolved, languageContext: { requestedLanguage: 'auto', outputLanguage: null, source: 'unresolved' }, writingContext: { brief: '', notes: [] } } });
  assert.equal(unresolvedSave.statusCode, 200);
  const blocked = await f.app.inject({ method: 'POST', url: `/api/v1/itineraries/${f.id}/preview`, headers, payload: { expectedRevision: unresolvedSave.json().revision } });
  assert.equal(blocked.statusCode, 422);
  assert.equal(blocked.json().error.fields.errors[0].code, 'LOCALE_UNRESOLVED');
});

test('missing time remains a schedule warning, not a publish blocker by itself', async (t) => {
  const f = await setup(t);
  const content = structuredClone(f.content);
  content.schedule[0].activities[0].timeLabel = '';
  content.schedule[0].activities[0].durationLabel = null;
  const saved = await f.app.inject({ method: 'PATCH', url: `/api/v1/itineraries/${f.id}`, headers, payload: { expectedRevision: f.revision, draftContent: content, languageContext: { requestedLanguage: 'en', outputLanguage: 'en', source: 'explicit' }, writingContext: { brief: '', notes: [] } } });
  assert.equal(saved.statusCode, 200, saved.body);
  const response = await f.app.inject({ method: 'POST', url: `/api/v1/itineraries/${f.id}/preview`, headers, payload: { expectedRevision: saved.json().revision } });
  assert.equal(response.statusCode, 200, response.body);
  assert.equal(response.json().publishReady, true, JSON.stringify(response.json().errors));
  assert.ok(response.json().warnings.some((item: any) => item.code === 'SCHEDULE_NOT_FULLY_VERIFIED'));
  assert.ok(!response.json().errors.some((item: any) => item.path.endsWith('.timeLabel')));
});

test('pattern guards catch localized price/opening/booking claims without blocking guide visit-time copy', async (t) => {
  const f = await setup(t);
  const cases = [
    ['la', 'Iter initium hora 08:00; Rp 20.000.'],
    ['fr', "Horaires d’ouverture 09:00. Réservez maintenant pour €20."],
    ['en', 'Opening hours 09:00. Book now for $20.'],
    ['id', 'Jam buka 09:00; pesan sekarang seharga Rp 20.000.'],
    ['ja', '営業時間は09:00です。今すぐ予約、¥1000。'],
    ['zh-Hans', '营业时间为09:00。立即预订，¥100。']
  ] as const;
  let revision = f.revision;
  for (const [locale, claim] of cases) {
    const content = structuredClone(f.content);
    content.brochure.outputLanguage = locale;
    content.overview.summary = claim;
    content.schedule[0].activities[0].timeLabel = '08:00';
    const saved = await f.app.inject({ method: 'PATCH', url: `/api/v1/itineraries/${f.id}`, headers, payload: { expectedRevision: revision, draftContent: content, languageContext: { requestedLanguage: locale, outputLanguage: locale, source: 'explicit' }, writingContext: { brief: '', notes: [] } } });
    assert.equal(saved.statusCode, 200, `${locale}: ${saved.body}`);
    revision = saved.json().revision;
    const response = await f.app.inject({ method: 'POST', url: `/api/v1/itineraries/${f.id}/preview`, headers, payload: { expectedRevision: revision } });
    assert.equal(response.statusCode, 200, `${locale}: ${response.body}`);
    assert.equal(response.json().publishReady, false, locale);
    assert.ok(response.json().errors.some((item: any) => item.code === 'PUBLISH_CURRENCY_CLAIM' || item.code === 'PUBLISH_OPENING_HOURS_CLAIM' || item.code === 'PUBLISH_PROMOTIONAL_CLAIM'), locale);
  }
  for (const [locale, text] of [['la', 'Iter incipit hora 08:00.'], ['fr', 'La visite commence à 08:00; prix non indiqué.'], ['en', 'The guide suggests a visit at 08:00; prices are not listed.'], ['id', 'Pemandu menyarankan kunjungan pukul 08:00; harga tidak dicantumkan.'], ['ja', '訪問は08:00に始まります。料金は記載されていません。'], ['zh-Hans', '参观从08:00开始，价格未列出。']] as const) {
    const content = structuredClone(f.content);
    content.brochure.outputLanguage = locale; content.overview.summary = text; content.schedule[0].activities[0].timeLabel = '08:00';
    const saved = await f.app.inject({ method: 'PATCH', url: `/api/v1/itineraries/${f.id}`, headers, payload: { expectedRevision: revision, draftContent: content, languageContext: { requestedLanguage: locale, outputLanguage: locale, source: 'explicit' }, writingContext: { brief: '', notes: [] } } });
    assert.equal(saved.statusCode, 200, `${locale}: ${saved.body}`); revision = saved.json().revision;
    const response = await f.app.inject({ method: 'POST', url: `/api/v1/itineraries/${f.id}/preview`, headers, payload: { expectedRevision: revision } });
    assert.equal(response.statusCode, 200, `${locale}: ${response.body}`);
    assert.equal(response.json().publishReady, true, locale);
  }
});

test('known duration caps block even when start time is missing or a multi-day block is condensed', async (t) => {
  const half = await setup(t, 'half_day');
  const halfBoundary = structuredClone(half.content);
  halfBoundary.schedule[0].activities[0].timeLabel = '';
  halfBoundary.schedule[0].activities[0].durationLabel = '360 minutes';
  const boundarySave = await half.app.inject({ method: 'PATCH', url: `/api/v1/itineraries/${half.id}`, headers, payload: { expectedRevision: half.revision, draftContent: halfBoundary, languageContext: { requestedLanguage: 'en', outputLanguage: 'en', source: 'explicit' }, writingContext: { brief: '', notes: [] } } });
  const boundaryPreview = await half.app.inject({ method: 'POST', url: `/api/v1/itineraries/${half.id}/preview`, headers, payload: { expectedRevision: boundarySave.json().revision } });
  assert.equal(boundaryPreview.json().publishReady, true);

  const halfContent = structuredClone(half.content);
  halfContent.schedule[0].activities[0].timeLabel = '';
  halfContent.schedule[0].activities[0].durationLabel = '7 hours';
  const halfSave = await half.app.inject({ method: 'PATCH', url: `/api/v1/itineraries/${half.id}`, headers, payload: { expectedRevision: boundarySave.json().revision, draftContent: halfContent, languageContext: { requestedLanguage: 'en', outputLanguage: 'en', source: 'explicit' }, writingContext: { brief: '', notes: [] } } });
  const halfPreview = await half.app.inject({ method: 'POST', url: `/api/v1/itineraries/${half.id}/preview`, headers, payload: { expectedRevision: halfSave.json().revision } });
  assert.equal(halfPreview.json().publishReady, false);
  assert.ok(halfPreview.json().errors.some((item: any) => item.code === 'SCHEDULE_DURATION_CAP'));
  const halfPublish = await half.app.inject({ method: 'POST', url: `/api/v1/itineraries/${half.id}/publish`, headers, payload: { operationId: randomUUID(), expectedRevision: halfSave.json().revision } });
  assert.equal(halfPublish.statusCode, 422);

  const full = await setup(t, 'full_day');
  const fullContent = structuredClone(full.content);
  fullContent.schedule[0].activities[0].timeLabel = 'morning';
  fullContent.schedule[0].activities[0].durationLabel = '12 hours';
  const fullSave = await full.app.inject({ method: 'PATCH', url: `/api/v1/itineraries/${full.id}`, headers, payload: { expectedRevision: full.revision, draftContent: fullContent, languageContext: { requestedLanguage: 'en', outputLanguage: 'en', source: 'explicit' }, writingContext: { brief: '', notes: [] } } });
  const fullPreview = await full.app.inject({ method: 'POST', url: `/api/v1/itineraries/${full.id}/preview`, headers, payload: { expectedRevision: fullSave.json().revision } });
  assert.ok(fullPreview.json().errors.some((item: any) => item.code === 'SCHEDULE_DURATION_CAP'));
  const fullBoundary = structuredClone(full.content);
  fullBoundary.schedule[0].activities[0].timeLabel = '';
  fullBoundary.schedule[0].activities[0].durationLabel = '660 minutes';
  const fullBoundarySave = await full.app.inject({ method: 'PATCH', url: `/api/v1/itineraries/${full.id}`, headers, payload: { expectedRevision: fullSave.json().revision, draftContent: fullBoundary, languageContext: { requestedLanguage: 'en', outputLanguage: 'en', source: 'explicit' }, writingContext: { brief: '', notes: [] } } });
  const fullBoundaryPreview = await full.app.inject({ method: 'POST', url: `/api/v1/itineraries/${full.id}/preview`, headers, payload: { expectedRevision: fullBoundarySave.json().revision } });
  assert.equal(fullBoundaryPreview.json().publishReady, true);
  const overBoundary = structuredClone(full.content);
  overBoundary.schedule[0].activities[0].timeLabel = '';
  overBoundary.schedule[0].activities[0].durationLabel = '661 minutes';
  const overBoundarySave = await full.app.inject({ method: 'PATCH', url: `/api/v1/itineraries/${full.id}`, headers, payload: { expectedRevision: fullBoundarySave.json().revision, draftContent: overBoundary, languageContext: { requestedLanguage: 'en', outputLanguage: 'en', source: 'explicit' }, writingContext: { brief: '', notes: [] } } });
  const overBoundaryPreview = await full.app.inject({ method: 'POST', url: `/api/v1/itineraries/${full.id}/preview`, headers, payload: { expectedRevision: overBoundarySave.json().revision } });
  assert.ok(overBoundaryPreview.json().errors.some((item: any) => item.code === 'SCHEDULE_DURATION_CAP'));

  const multi = await setup(t, 'multi_day');
  const condensed = structuredClone(multi.content);
  condensed.schedule = [condensed.schedule[0]];
  condensed.schedule[0].dayEnd = 2; condensed.schedule[0].isCondensed = true;
  condensed.schedule[0].activities[0].timeLabel = 'afternoon';
  condensed.schedule[0].activities[0].durationLabel = '12 hours';
  const multiSave = await multi.app.inject({ method: 'PATCH', url: `/api/v1/itineraries/${multi.id}`, headers, payload: { expectedRevision: multi.revision, draftContent: condensed, languageContext: { requestedLanguage: 'en', outputLanguage: 'en', source: 'explicit' }, writingContext: { brief: '', notes: [] } } });
  assert.equal(multiSave.statusCode, 200, multiSave.body);
  const multiPreview = await multi.app.inject({ method: 'POST', url: `/api/v1/itineraries/${multi.id}/preview`, headers, payload: { expectedRevision: multiSave.json().revision } });
  assert.ok(multiPreview.json().errors.some((item: any) => item.code === 'SCHEDULE_DURATION_CAP'));
  assert.ok(multiPreview.json().warnings.some((item: any) => item.code === 'SCHEDULE_DAYS_NOT_FULLY_VERIFIED'));
});

test('missing renderer stylesheet reports an actionable service error and preserves the draft', async (t) => {
  const f = await setup(t);
  const before = await f.app.inject({ url: `/api/v1/itineraries/${f.id}` });
  await rm(f.stylesheetPath, { force: true });
  const response = await f.app.inject({ method: 'POST', url: `/api/v1/itineraries/${f.id}/preview`, headers, payload: { expectedRevision: f.revision } });
  assert.equal(response.statusCode, 503);
  assert.equal(response.json().error.code, 'PREVIEW_BLOCKED');
  assert.equal(response.json().error.fields.errors[0].code, 'RENDER_RESOURCES_UNAVAILABLE');
  assert.deepEqual((await f.app.inject({ url: `/api/v1/itineraries/${f.id}` })).json(), before.json());
});

test('preview rejects same-size pixel-corrupt stored image before embedding it', async (t) => {
  const f = await setup(t);
  const image = await sharp({ create: { width: 8, height: 8, channels: 4, background: '#26aa66' } }).png().toBuffer();
  const storageKey = `${randomUUID()}.png`;
  await writeFile(path.join(f.dataDir, 'assets', storageKey), image);
  const asset = (f.app as any).store.createAsset({ mime: 'image/png', bytes: image.length, width: 8, height: 8, filename: 'preview-pixel-fixture.png' }, storageKey);
  const content = structuredClone(f.content);
  content.hero.assetId = asset.id; content.hero.gradientOnly = false;
  content.hero.photoAttribution = { photographer: 'Synthetic photographer', photographerUrl: null, source: 'Guide' };
  const saved = await f.app.inject({ method: 'PATCH', url: `/api/v1/itineraries/${f.id}`, headers, payload: { expectedRevision: f.revision, draftContent: content, languageContext: { requestedLanguage: 'en', outputLanguage: 'en', source: 'explicit' }, writingContext: { brief: '', notes: [] } } });
  assert.equal(saved.statusCode, 200, saved.body);
  const validPreview = await f.app.inject({ method: 'POST', url: `/api/v1/itineraries/${f.id}/preview`, headers, payload: { expectedRevision: saved.json().revision } });
  assert.equal(validPreview.statusCode, 200, validPreview.body); assert.equal(validPreview.json().publishReady, true);
  assert.match(validPreview.json().html, /data:image\/png;base64,/);
  const initialPublish = await f.app.inject({ method: 'POST', url: `/api/v1/itineraries/${f.id}/publish`, headers, payload: { operationId: randomUUID(), expectedRevision: saved.json().revision } });
  assert.equal(initialPublish.statusCode, 200, initialPublish.body);
  const activeToken = initialPublish.json().shareUrl.split('/').at(-1);
  const corrupt = Buffer.from(image);
  let chunkOffset = 8; let idatStart = -1; let idatEnd = -1;
  while (chunkOffset + 8 <= corrupt.length) {
    const length = corrupt.readUInt32BE(chunkOffset);
    const type = corrupt.toString('ascii', chunkOffset + 4, chunkOffset + 8);
    if (type === 'IDAT') { idatStart = chunkOffset + 8; idatEnd = idatStart + length; break; }
    chunkOffset += length + 12;
  }
  assert.ok(idatStart >= 0 && idatEnd > idatStart, 'synthetic PNG has an IDAT chunk');
  corrupt.fill(0xff, idatStart, idatEnd);
  assert.equal(corrupt.length, image.length);
  assert.deepEqual(await sharp(corrupt).metadata().then(({ width, height }) => [width, height]), [8, 8]);
  await writeFile(path.join(f.dataDir, 'assets', storageKey), corrupt);
  const before = (await f.app.inject({ url: `/api/v1/itineraries/${f.id}` })).json();
  const response = await f.app.inject({ method: 'POST', url: `/api/v1/itineraries/${f.id}/preview`, headers, payload: { expectedRevision: before.revision } });
  assert.equal(response.statusCode, 422);
  assert.equal(response.json().error.code, 'PREVIEW_BLOCKED');
  assert.ok(response.json().error.fields.errors.some((item: any) => item.code === 'ASSET_INVALID' && item.path === 'hero.assetId'));
  assert.equal(typeof response.json().html, 'undefined');
  assert.deepEqual((await f.app.inject({ url: `/api/v1/itineraries/${f.id}` })).json(), before);
  assert.deepEqual(await readFile(path.join(f.dataDir, 'assets', storageKey)), corrupt);
  const changedDraft = structuredClone(before.draftContent); changedDraft.brochure.tripTitle = 'Changed after corrupt asset';
  const changed = await f.app.inject({ method: 'PATCH', url: `/api/v1/itineraries/${f.id}`, headers, payload: { expectedRevision: before.revision, draftContent: changedDraft, languageContext: before.languageContext, writingContext: before.writingContext } });
  const blockedPublish = await f.app.inject({ method: 'POST', url: `/api/v1/itineraries/${f.id}/publish`, headers, payload: { operationId: randomUUID(), expectedRevision: changed.json().revision } });
  assert.equal(blockedPublish.statusCode, 422);
  const oldPage = await f.app.inject({ url: `/i/${activeToken}` });
  assert.equal(oldPage.statusCode, 200); assert.match(oldPage.body, /Ubud in a day/);
});

test('required repeated-field diagnostics return the exact missing index and stable target ID', async (t) => {
  const f = await setup(t);
  const content = structuredClone(f.content);
  const missing = { ...content.schedule[0].activities[0], id: randomUUID(), title: '' };
  content.schedule[0].activities[0].title = 'Valid first activity';
  content.schedule[0].activities.push(missing);
  const saved = await f.app.inject({ method: 'PATCH', url: `/api/v1/itineraries/${f.id}`, headers, payload: { expectedRevision: f.revision, draftContent: content, languageContext: { requestedLanguage: 'en', outputLanguage: 'en', source: 'explicit' }, writingContext: { brief: '', notes: [] } } });
  assert.equal(saved.statusCode, 200, saved.body);
  const response = await f.app.inject({ method: 'POST', url: `/api/v1/itineraries/${f.id}/preview`, headers, payload: { expectedRevision: saved.json().revision } });
  assert.equal(response.statusCode, 200, response.body);
  const diagnostic = response.json().errors.find((item: any) => item.code === 'PUBLISH_FIELD_REQUIRED' && item.targetId === missing.id);
  assert.ok(diagnostic);
  assert.equal(diagnostic.path, 'schedule[0].activities[1].title');
  assert.ok(!response.json().errors.some((item: any) => item.code === 'PUBLISH_FIELD_REQUIRED' && item.path.includes('[]')));
});
