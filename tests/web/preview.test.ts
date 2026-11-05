import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import sharp from 'sharp';
import { createApp } from '../../src/server/app.js';
import type { ItineraryMode, WebItineraryContent } from '../../src/contracts/types.js';
import { activityV2, createContentV2, placeV2 } from './fixtures-v2.js';

const headers = { origin: 'http://127.0.0.1:3000', 'x-engine-request': '1', 'content-type': 'application/json' };
const language = (locale = 'en') => ({ requestedLanguage: locale, outputLanguage: locale, source: 'explicit' });
const writing = { brief: '', notes: [] };

async function setup(t: any, mode: ItineraryMode = 'full_day') {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'itinerary-cp024-'));
  const stylesheetPath = path.join(dataDir, 'brochure.css');
  await writeFile(stylesheetPath, 'body{font-family:sans-serif}.brochure{max-width:900px}');
  const app = await createApp({ dataDir, renderStylesheetPath: stylesheetPath, shareOrigin: 'https://share.example.test' });
  t.after(async () => { await app.close(); await rm(dataDir, { recursive: true, force: true }); });
  const created = await app.inject({ method: 'POST', url: '/api/v1/itineraries', headers, payload: { mode } });
  const blank = created.json();
  const content = createContentV2(mode, 'en');
  const f = {
    app, id: blank.id as string, revision: blank.revision as number, content, stylesheetPath, dataDir,
    async save(next: WebItineraryContent, languageContext: unknown = language(next.trip.language || 'en')) {
      const saved = await app.inject({ method: 'PATCH', url: `/api/v1/itineraries/${blank.id}`, headers, payload: { expectedRevision: f.revision, draftContent: next, languageContext, writingContext: writing } });
      assert.equal(saved.statusCode, 200, saved.body);
      f.revision = saved.json().revision;
      return saved;
    },
    preview: () => app.inject({ method: 'POST', url: `/api/v1/itineraries/${blank.id}/preview`, headers, payload: { expectedRevision: f.revision } }),
    publish: () => app.inject({ method: 'POST', url: `/api/v1/itineraries/${blank.id}/publish`, headers, payload: { operationId: randomUUID(), expectedRevision: f.revision } }),
    get: async () => (await app.inject({ url: `/api/v1/itineraries/${blank.id}` })).json(),
    async asset() {
      const image = await sharp({ create: { width: 8, height: 8, channels: 4, background: '#26aa66' } }).png().toBuffer();
      const storageKey = `${randomUUID()}.png`;
      await writeFile(path.join(dataDir, 'assets', storageKey), image);
      const record = (app as any).store.createAsset({ mime: 'image/png', bytes: image.length, width: 8, height: 8, filename: 'preview-fixture.png' }, storageKey);
      return { id: record.id as string, storageKey, image };
    }
  };
  await f.save(content);
  return f;
}
const find = (body: any, code: string, list: 'errors' | 'warnings' = 'errors') => body[list].find((item: any) => item.code === code);

test('a saved incomplete draft previews, separates publish errors and leaves the draft unchanged', async (t) => {
  const f = await setup(t);
  const incomplete = structuredClone(f.content);
  incomplete.trip.title = '';
  await f.save(incomplete);
  const before = await f.get();
  const response = await f.preview();
  assert.equal(response.statusCode, 200, response.body);
  const result = response.json();
  assert.equal(result.publishReady, false);
  assert.match(result.html, /<html lang="en">/);
  assert.deepEqual(find(result, 'PUBLISH_FIELD_REQUIRED').path, 'trip.title');
  assert.equal(find(result, 'PUBLISH_FIELD_REQUIRED').message, 'Lengkapi field ini sebelum publish.');
  assert.deepEqual(await f.get(), before);
});

test('overlap is an error with the activity target ID; half-day span over the cap is DURATION_CAP_EXCEEDED', async (t) => {
  const f = await setup(t);
  const content = structuredClone(f.content);
  content.days[0].activities = [activityV2(1, { time: '08:00', durationMinutes: 90 }), activityV2(2, { time: '09:00', durationMinutes: 30 })];
  await f.save(content);
  let result = (await f.preview()).json();
  const overlap = find(result, 'SCHEDULE_OVERLAP');
  assert.equal(overlap.path, 'days[0].activities[1].time'); assert.equal(overlap.targetId, content.days[0].activities[1].id);
  assert.equal(overlap.message, 'Aktivitas ini dimulai sebelum aktivitas sebelumnya selesai.');
  assert.equal(result.publishReady, false);
  content.days[0].activities[1].time = '09:30';
  await f.save(content);
  result = (await f.preview()).json();
  assert.equal(find(result, 'SCHEDULE_OVERLAP'), undefined, 'back-to-back activities do not overlap');
  assert.equal(result.publishReady, true, JSON.stringify(result.errors));

  const half = await setup(t, 'half_day');
  const halfContent = structuredClone(half.content);
  halfContent.days[0].activities = [activityV2(1, { time: '08:00', durationMinutes: 60 }), activityV2(2, { time: '14:30', durationMinutes: 60 })];
  halfContent.trip.endTime = null;
  await half.save(halfContent);
  const halfResult = (await half.preview()).json();
  assert.equal(find(halfResult, 'DURATION_CAP_EXCEEDED').path, 'days[0]');
  assert.equal(find(halfResult, 'DURATION_CAP_EXCEEDED').targetId, halfContent.days[0].id);
  assert.equal(halfResult.publishReady, false);
});

test('an unresolved or stale language context is 422 LOCALE_UNRESOLVED; benign price wording is allowed', async (t) => {
  const f = await setup(t);
  const benign = structuredClone(f.content);
  benign.summary = 'Ideal for price-conscious travellers; prices are not listed.';
  await f.save(benign);
  const ok = (await f.preview()).json();
  assert.equal(ok.publishReady, true, JSON.stringify(ok.errors));

  const stale = await f.app.inject({ method: 'POST', url: `/api/v1/itineraries/${f.id}/preview`, headers, payload: { expectedRevision: f.revision - 1 } });
  assert.equal(stale.statusCode, 409);

  const unresolved = structuredClone(benign);
  unresolved.trip.language = null;
  await f.save(unresolved, { requestedLanguage: 'auto', outputLanguage: null, source: 'unresolved' });
  const blocked = await f.preview();
  assert.equal(blocked.statusCode, 422);
  assert.equal(blocked.json().error.code, 'PREVIEW_BLOCKED');
  assert.deepEqual([blocked.json().error.fields.errors[0].code, blocked.json().error.fields.errors[0].path], ['LOCALE_UNRESOLVED', 'trip.language']);

  const record = await f.get();
  const staleContext = (f.app as any).store.updateItinerary(f.id, record.revision, benign, language('fr'), writing);
  assert.ok(staleContext);
  f.revision = staleContext.revision;
  const mismatch = await f.preview();
  assert.equal(mismatch.statusCode, 422);
  assert.equal(mismatch.json().error.fields.errors[0].code, 'LOCALE_UNRESOLVED');
});

test('an activity with no time is a SCHEDULE_TIME_UNKNOWN warning, publish stays ready, verification is partial', async (t) => {
  const f = await setup(t);
  const content = structuredClone(f.content);
  content.days[0].activities[0].time = null;
  await f.save(content);
  const result = (await f.preview()).json();
  assert.equal(result.publishReady, true, JSON.stringify(result.errors));
  const warning = find(result, 'SCHEDULE_TIME_UNKNOWN', 'warnings');
  assert.ok(warning); assert.equal(warning.path, 'days[0]'); assert.equal(warning.targetId, content.days[0].id);
  assert.equal(result.scheduleVerification, 'partial');
  const complete = await setup(t);
  assert.equal((await complete.preview()).json().scheduleVerification, 'complete');
  const guide = await setup(t, 'destination_guide');
  assert.equal((await guide.preview()).json().scheduleVerification, 'not_applicable');
});

test('pattern guards block price, opening hours, booking claims and placeholders with the right code and path', async (t) => {
  const f = await setup(t);
  const guide = await setup(t, 'destination_guide');
  const cases: Array<[typeof f, (c: WebItineraryContent) => void, string, string]> = [
    [f, (c) => { c.days[0].activities[0].tip = 'Entry IDR 150.000 per person.'; }, 'PUBLISH_CURRENCY_CLAIM', 'days[0].activities[0].tip'],
    [f, (c) => { c.meeting.note = 'Jam buka 08:00, tunggu di gerbang.'; }, 'PUBLISH_OPENING_HOURS_CLAIM', 'meeting.note'],
    [f, (c) => { c.policies = 'Book now to secure your place.'; }, 'PUBLISH_PROMOTIONAL_CLAIM', 'policies'],
    [guide, (c) => { c.places[0].description = '営業時間は09:00です。'; }, 'PUBLISH_OPENING_HOURS_CLAIM', 'places[0].description'],
    [f, (c) => { c.closingNote = 'Thank you, {{name}}!'; }, 'PUBLISH_UNRESOLVED_PLACEHOLDER', 'closingNote']
  ];
  for (const [fixture, mutate, code, field] of cases) {
    const content = structuredClone(fixture.content);
    mutate(content);
    await fixture.save(content);
    const result = (await fixture.preview()).json();
    assert.equal(result.publishReady, false, code);
    assert.equal(find(result, code)?.path, field, `${code} at ${field}`);
    await fixture.save(fixture.content);
  }
  const content = structuredClone(f.content);
  content.summary = 'Best visited in the morning, when the terraces are quiet.';
  content.days[0].activities[0].tip = 'Arrive early; it is quieter before 09:00.';
  await f.save(content);
  const benign = (await f.preview()).json();
  assert.equal(benign.publishReady, true, JSON.stringify(benign.errors));
});

test('duration caps hold without start times: 720 full-day and 960 multi-day are exact limits', async (t) => {
  const full = await setup(t);
  const timeless = (c: WebItineraryContent, durations: number[]) => { c.days[0].activities = durations.map((d, i) => activityV2(i + 1, { time: null, durationMinutes: d })); };
  const over = structuredClone(full.content); timeless(over, [400, 400]); await full.save(over);
  assert.equal(find((await full.preview()).json(), 'DURATION_CAP_EXCEEDED')?.path, 'days[0]');
  const exact = structuredClone(full.content); timeless(exact, [360, 360]); await full.save(exact);
  const exactResult = (await full.preview()).json();
  assert.equal(find(exactResult, 'DURATION_CAP_EXCEEDED'), undefined); assert.equal(exactResult.publishReady, true, JSON.stringify(exactResult.errors));

  const multi = await setup(t, 'multi_day');
  const multiOver = structuredClone(multi.content); timeless(multiOver, [500, 500]); await multi.save(multiOver);
  assert.equal(find((await multi.preview()).json(), 'DURATION_CAP_EXCEEDED')?.path, 'days[0]');
  const multiExact = structuredClone(multi.content); timeless(multiExact, [480, 480]); await multi.save(multiExact);
  assert.equal(find((await multi.preview()).json(), 'DURATION_CAP_EXCEEDED'), undefined);
});

test('a missing renderer stylesheet is 503 RENDER_RESOURCES_UNAVAILABLE and the draft is preserved', async (t) => {
  const f = await setup(t);
  const before = await f.get();
  await rm(f.stylesheetPath, { force: true });
  const response = await f.preview();
  assert.equal(response.statusCode, 503);
  assert.equal(response.json().error.code, 'PREVIEW_BLOCKED');
  assert.equal(response.json().error.fields.errors.at(-1).code, 'RENDER_RESOURCES_UNAVAILABLE');
  assert.deepEqual(await f.get(), before);
});

test('a same-size pixel-corrupt cover image is rejected before embedding and never replaces the published page', async (t) => {
  const f = await setup(t);
  const { id, storageKey, image } = await f.asset();
  const content = structuredClone(f.content);
  content.cover = { assetId: id, credit: { photographer: 'Synthetic photographer', url: null, source: 'Guide' } };
  await f.save(content);
  const valid = await f.preview();
  assert.equal(valid.statusCode, 200, valid.body); assert.equal(valid.json().publishReady, true, valid.body);
  assert.match(valid.json().html, /data:image\/png;base64,/);
  const published = await f.publish();
  assert.equal(published.statusCode, 200, published.body);
  const token = published.json().shareUrl.split('/').at(-1);
  const corrupt = Buffer.from(image);
  let offset = 8; let start = -1; let end = -1;
  while (offset + 8 <= corrupt.length) {
    const length = corrupt.readUInt32BE(offset);
    if (corrupt.toString('ascii', offset + 4, offset + 8) === 'IDAT') { start = offset + 8; end = start + length; break; }
    offset += length + 12;
  }
  assert.ok(start >= 0 && end > start);
  corrupt.fill(0xff, start, end);
  assert.equal(corrupt.length, image.length);
  await writeFile(path.join(f.dataDir, 'assets', storageKey), corrupt);
  const before = await f.get();
  const response = await f.preview();
  assert.equal(response.statusCode, 422);
  assert.equal(response.json().error.code, 'PREVIEW_BLOCKED');
  assert.ok(response.json().error.fields.errors.some((item: any) => item.code === 'ASSET_INVALID' && item.path === 'cover.assetId'));
  assert.equal(typeof response.json().html, 'undefined');
  assert.deepEqual(await f.get(), before);
  assert.deepEqual(await readFile(path.join(f.dataDir, 'assets', storageKey)), corrupt);
  const changed = structuredClone(before.draftContent); changed.trip.title = 'Changed after corrupt asset';
  await f.save(changed);
  assert.equal((await f.publish()).statusCode, 422);
  const page = await f.app.inject({ url: `/i/${token}` });
  assert.equal(page.statusCode, 200); assert.match(page.body, /Ubud in a day/);
});

test('missing required fields report the exact index and the stable target ID', async (t) => {
  const f = await setup(t);
  const content = structuredClone(f.content);
  const missing = activityV2(9, { title: '' });
  content.days[0].activities.push(missing);
  await f.save(content);
  const result = (await f.preview()).json();
  const diagnostic = result.errors.find((item: any) => item.code === 'PUBLISH_FIELD_REQUIRED' && item.targetId === missing.id);
  assert.ok(diagnostic, JSON.stringify(result.errors));
  assert.equal(diagnostic.path, 'days[0].activities[2].title');
  assert.ok(!result.errors.some((item: any) => item.path.includes('[]')));

  const guide = await setup(t, 'destination_guide');
  const places = structuredClone(guide.content);
  places.places[1] = placeV2(2, { name: '' });
  await guide.save(places);
  const placeResult = (await guide.preview()).json();
  const placeDiagnostic = placeResult.errors.find((item: any) => item.code === 'PUBLISH_FIELD_REQUIRED' && item.path === 'places[1].name');
  assert.ok(placeDiagnostic, JSON.stringify(placeResult.errors));
  assert.equal(placeDiagnostic.targetId, places.places[1].id);
});

test('a multi-day hotel with an empty name is a warning, not an error, and prints no empty name', async (t) => {
  const f = await setup(t);
  const multi = await setup(t, 'multi_day');
  const content = structuredClone(multi.content);
  content.days[0].hotel = { name: '', area: 'Ubud', note: null };
  await multi.save(content);
  const result = (await multi.preview()).json();
  const warning = find(result, 'HOTEL_NAME_EMPTY', 'warnings');
  assert.ok(warning); assert.equal(warning.path, 'days[0].hotel.name'); assert.equal(warning.targetId, content.days[0].id);
  assert.equal(warning.message, 'Nama hotel belum diisi.');
  assert.equal(find(result, 'HOTEL_NAME_EMPTY'), undefined);
  assert.equal(result.publishReady, true, JSON.stringify(result.errors));
  assert.match(result.html, /<b>Hotel<\/b><p class="mb-0 mt-1 text-sm">Ubud<\/p>/);
  assert.doesNotMatch(result.html, /<b>Hotel<\/b>: *<\/div>|<b>Hotel<\/b>:\s*<p/);
  assert.equal(find((await f.preview()).json(), 'HOTEL_NAME_EMPTY', 'warnings'), undefined, 'not reported for full_day');
});

test('the agency name and logo come from the workspace profile; a corrupt logo blocks with ASSET_INVALID', async (t) => {
  const f = await setup(t);
  const logo = await f.asset();
  const profile = (await f.app.inject({ url: '/api/v1/itinerary-engine/profile' })).json();
  const patched = await f.app.inject({ method: 'PATCH', url: '/api/v1/itinerary-engine/profile', headers, payload: { expectedRevision: profile.revision, profile: { agencyName: 'Sample Travel Studio', agencyContact: 'guide@example.test', agencyLogoAssetId: logo.id } } });
  assert.equal(patched.statusCode, 200, patched.body);
  const result = (await f.preview()).json();
  assert.match(result.html, /Sample Travel Studio/); assert.match(result.html, /guide@example\.test/);
  assert.match(result.html, /<img class="size-9[^>]*src="data:image\/png;base64,/);
  const corrupt = Buffer.from(logo.image);
  corrupt.fill(0xff, 41, corrupt.length - 16);
  await writeFile(path.join(f.dataDir, 'assets', logo.storageKey), corrupt);
  const blocked = await f.preview();
  assert.equal(blocked.statusCode, 422);
  assert.ok(blocked.json().error.fields.errors.some((item: any) => item.code === 'ASSET_INVALID' && item.path === 'profile.agencyLogoAssetId'), blocked.body);
});

test('a full-day with no meeting point and no pickup is a MEETING_POINT_MISSING warning only', async (t) => {
  const f = await setup(t);
  const content = structuredClone(f.content);
  content.meeting = { place: null, mapsUrl: null, time: null, note: null };
  await f.save(content);
  const result = (await f.preview()).json();
  const warning = find(result, 'MEETING_POINT_MISSING', 'warnings');
  assert.ok(warning); assert.equal(warning.path, 'meeting.place'); assert.equal(warning.message, 'Belum ada titik kumpul atau penjemputan.');
  assert.equal(result.publishReady, true, JSON.stringify(result.errors));
  content.pickup = { offered: true, area: 'Hotel lobby', time: null, dropoffNote: null };
  await f.save(content);
  assert.equal(find((await f.preview()).json(), 'MEETING_POINT_MISSING', 'warnings'), undefined);
});
