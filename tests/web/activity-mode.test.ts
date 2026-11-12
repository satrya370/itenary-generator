import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateDraft, validateForPublish, normalizeCanonicalContent } from '../../src/contracts/validator.js';
import { blankActivityMode } from '../../src/contracts/activity.js';
import type { WebItineraryContent } from '../../src/contracts/types.js';
import { createBlankDraft } from '../../src/server/draft.js';
import { changeMode, hasModeLoss } from '../../src/editor/model.js';

/** Mode "activity" (SI1, web-2.2.0): one activity of a few hours, no day schedule. */

function activityDraft(): WebItineraryContent {
  const content = createBlankDraft('activity', { defaultCountry: 'Indonesia', defaultLanguage: 'en' });
  content.trip.title = 'Ayung River rafting';
  content.trip.destination = 'Ubud';
  content.trip.region = 'Bali';
  content.summary = 'A morning of rafting on the Ayung river with a licensed river guide.';
  content.trip.language = 'en';
  content.activity = { ...blankActivityMode(), category: 'water', durationMinutes: 180 };
  return content;
}

const codes = (result: { errors: Array<{ code: string; path: string }> }) => result.errors.map((item) => `${item.code}:${item.path}`);

test('a blank activity draft is a structurally valid draft with no day schedule', () => {
  const blank = createBlankDraft('activity', { defaultCountry: 'Indonesia' });
  assert.equal(blank.trip.mode, 'activity');
  assert.equal(blank.schemaVersion, 'web-2.2.0');
  assert.deepEqual(blank.days, []);
  assert.deepEqual(blank.places, []);
  assert.deepEqual(blank.activity, blankActivityMode());
  assert.equal(validateDraft(blank).ok, true, JSON.stringify(validateDraft(blank).errors));
});

test('an activity with category and duration publishes; a missing category or duration is reported by path', () => {
  assert.equal(validateForPublish(activityDraft()).ok, true, JSON.stringify(validateForPublish(activityDraft()).errors));

  const noCategory = activityDraft();
  noCategory.activity!.category = null;
  assert.ok(codes(validateForPublish(noCategory)).includes('PUBLISH_FIELD_REQUIRED:activity.category'));

  const noDuration = activityDraft();
  noDuration.activity!.durationMinutes = null;
  assert.ok(codes(validateForPublish(noDuration)).includes('PUBLISH_FIELD_REQUIRED:activity.durationMinutes'));
});

test('an activity cannot carry days or places, and other modes cannot carry an activity block', () => {
  const withDay = activityDraft();
  withDay.days = createBlankDraft('full_day', {}).days;
  assert.ok(codes(validateDraft(withDay)).some((item) => item.startsWith('FIELD_NOT_APPLICABLE:days')));

  const withPlace = activityDraft();
  withPlace.places = [{ id: '00000000-0000-4000-8000-000000000001', group: null, name: 'Tegallalang', area: 'Ubud', description: '', tips: [], gettingThere: null, suggestedDuration: null, bestTime: null, nearby: null, photo: null }];
  assert.ok(codes(validateDraft(withPlace)).some((item) => item.startsWith('FIELD_NOT_APPLICABLE:places')));

  const fullDay = createBlankDraft('full_day', { defaultCountry: 'Indonesia' });
  fullDay.activity = { ...blankActivityMode(), category: 'culture' };
  assert.ok(codes(validateDraft(fullDay)).some((item) => item.startsWith('FIELD_NOT_APPLICABLE:activity')));
});

test('an activity itinerary without its activity block is refused', () => {
  const missing = activityDraft();
  missing.activity = null;
  assert.ok(codes(validateDraft(missing)).includes('ACTIVITY_DETAILS_REQUIRED:activity'));
});

test('session times and step minutes are checked by the schema, not by hand', () => {
  const badSession = activityDraft();
  badSession.activity!.sessionTimes = ['25:00'];
  assert.equal(validateDraft(badSession).ok, false);

  const longDuration = activityDraft();
  longDuration.activity!.durationMinutes = 10;
  assert.equal(validateDraft(longDuration).ok, false, 'durations below 15 minutes are refused');
});

test('a web-2.1.0 document reads as web-2.2.0 with an empty activity block', () => {
  const legacy = createBlankDraft('full_day', { defaultCountry: 'Indonesia' }) as unknown as Record<string, unknown>;
  legacy.schemaVersion = 'web-2.1.0';
  delete legacy.activity;
  const normalized = normalizeCanonicalContent(legacy);
  assert.equal((normalized.value as Record<string, unknown>).schemaVersion, 'web-2.2.0');
  assert.equal((normalized.value as Record<string, unknown>).activity, null);
});

test('switching into activity clears days and places; switching out of it reports the activity details', () => {
  const day = createBlankDraft('full_day', { defaultCountry: 'Indonesia' });
  day.days[0].activities = [{ id: '00000000-0000-4000-8000-000000000002', time: '09:00', durationMinutes: 60, kind: 'sightseeing', title: 'Sawah', place: null, description: '', tip: null }];
  assert.ok(hasModeLoss(day, 'activity').some((item) => item.includes('hari')), 'the day schedule is named as lost');

  const into = changeMode(day, 'activity');
  assert.equal(into.trip.mode, 'activity');
  assert.deepEqual(into.days, []);
  assert.deepEqual(into.activity, blankActivityMode());

  const filled = activityDraft();
  assert.ok(hasModeLoss(filled, 'half_day').includes('detail aktivitas'));
  assert.deepEqual(hasModeLoss(createBlankDraft('activity', {}), 'half_day'), [], 'a blank activity loses nothing');
});

test('an activity renders its facts, highlights and steps, with no day schedule, in each supported language', async () => {
  const { renderItineraryHtml } = await import('../../src/render/render.js');
  const { getLocaleCatalog } = await import('../../src/contracts/locale-catalogs.js');
  const paletteConfig = (await import('../../config/palettes.json', { with: { type: 'json' } })).default;
  const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
  const options = (locale: string) => ({
    stylesheet: 'body{font-family:sans-serif}', fontCss: '', catalog: getLocaleCatalog(locale)!,
    palette: (paletteConfig as any).palettes.cultural, assets: {},
    agency: { name: 'Sample Travel Studio', contact: 'guide@example.test', logoAssetId: null }, generatedDate: '2026-11-12'
  });
  const content = activityDraft();
  content.activity = {
    ...blankActivityMode(), category: 'water', durationMinutes: 180, sessionTimes: ['08:00', '13:00'], difficulty: 'moderate',
    ageMin: 8, ageMax: 60, weightMaxKg: 120, guideLanguages: ['English', 'Bahasa Indonesia'], highlights: ['Grade III rapids'],
    steps: [{ title: 'Safety briefing', minutes: 15, note: null }, { title: 'River run', minutes: 90, note: 'Helmet and life jacket provided.' }]
  };
  const en = renderItineraryHtml(content, options('en'));
  assert.deepEqual(en.errors, [], JSON.stringify(en.errors));
  assert.match(en.html, /data-section="activity"/);
  assert.doesNotMatch(en.html, /data-section="schedule"/);
  assert.match(en.html, /Grade III rapids/);
  assert.match(en.html, /Safety briefing/);
  assert.match(en.html, /8–60/);

  const id = renderItineraryHtml({ ...content, trip: { ...content.trip, language: 'id' } }, options('id'));
  assert.deepEqual(id.errors, [], JSON.stringify(id.errors));
  assert.match(id.html, /Air/);
  assert.match(id.html, /Sedang/);
});
