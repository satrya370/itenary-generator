import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { adaptLegacyDocument } from '../../src/contracts/legacy-adapter.js';
import { collectSchemaLeafPaths, getFieldRegistry, getFieldRegistryCoverage } from '../../src/contracts/field-coverage.js';
import { normalizeCanonicalContent, validateDraft, validateForPublish } from '../../src/contracts/validator.js';
import { upgradeV1ToV2 } from '../../src/contracts/upgrade-v1.js';
import { createBlankDraft } from '../../src/server/draft.js';
import type { ItineraryMode } from '../../src/contracts/types.js';
import { createContent as createContentV1, ids as idsV1 } from './fixtures.js';
import { activityV2, createContentV2, idsV2, placeV2 } from './fixtures-v2.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const languageSamples = JSON.parse(fs.readFileSync(path.join(root, 'tests/fixtures/web/language-samples.json'), 'utf8')) as Array<{ locale: string; title: string; brief: string }>;
const legacyFixture = JSON.parse(fs.readFileSync(path.join(root, 'tests/fixtures/web/legacy-full-day.json'), 'utf8'));
const MODES: ItineraryMode[] = ['half_day', 'full_day', 'multi_day', 'destination_guide'];
const NEW_LOCALE_KEYS = ['meetingPoint', 'meetingTime', 'meetingNote', 'mapsLink', 'pickup', 'pickupArea', 'pickupTime', 'dropoffNote', 'guideName', 'guidePhone', 'policies', 'startTime', 'endTime', 'meals', 'breakfast', 'lunch', 'dinner', 'hotel', 'transferNote', 'durationMinutes', 'colorTheme', 'dayTitle', 'placeGroup', 'bestTime', 'nearby'];

const codes = (items: Array<{ code: string }>) => items.map((item) => item.code);
const hasError = (result: { errors: Array<{ code: string; path: string }> }, code: string, errorPath?: string) =>
  result.errors.some((error) => error.code === code && (errorPath === undefined || error.path === errorPath));

test('field registry covers every schema leaf exactly once', () => {
  const coverage = getFieldRegistryCoverage();
  assert.deepEqual(coverage, { missing: [], extra: [], duplicates: [] });
  assert.equal(collectSchemaLeafPaths().length, getFieldRegistry().length);
  assert.deepEqual(getFieldRegistry().filter((field) => field.source === 'ai-assisted').map((field) => field.path).sort(), [
    'days[].activities[].description', 'places[].description', 'summary'
  ]);
  assert.equal((getFieldRegistry().find((field) => field.path === 'trip.language') as { overrideAllowed?: boolean }).overrideAllowed, true);
  assert.ok(getFieldRegistry().every((field) => (field as { renderTarget?: string }).renderTarget || (field as { notRenderedReason?: string }).notRenderedReason));
});

test('registry mode applicability matches the guide-centric design', () => {
  const modesOf = (fieldPath: string) => getFieldRegistry().find((field) => field.path === fieldPath)!.modes;
  assert.equal(modesOf('trip.startDate'), 'scheduled');
  assert.deepEqual(modesOf('trip.startTime'), ['half_day', 'full_day']);
  assert.deepEqual(modesOf('days[].meals.lunch'), ['full_day', 'multi_day']);
  assert.deepEqual(modesOf('days[].hotel.name'), ['multi_day']);
  assert.deepEqual(modesOf('places[].name'), ['destination_guide']);
  const dayTitle = getFieldRegistry().find((field) => field.path === 'days[].title') as { modes: unknown; requiredOnPublish: boolean; requiredModes?: string[] };
  assert.deepEqual([dayTitle.modes, dayTitle.requiredOnPublish, dayTitle.requiredModes], ['scheduled', true, ['multi_day']]);
  const required = getFieldRegistry().filter((field) => field.requiredOnPublish && field.modes !== 'all').map((field) => field.path);
  assert.ok(required.includes('places[].name') && required.includes('places[].area') && required.includes('places[].description'));
  for (const optional of ['places[].tips[]', 'places[].gettingThere', 'places[].suggestedDuration', 'places[].bestTime']) {
    assert.equal(getFieldRegistry().find((field) => field.path === optional)!.requiredOnPublish, false, optional);
  }
});

test('all locale catalogs have identical keys, include every new v2 key, and cover six baseline languages', () => {
  const dir = path.join(root, 'config/web/locales');
  const files = fs.readdirSync(dir).filter((name) => name.endsWith('.json')).sort();
  assert.deepEqual(files, ['en.json', 'fr.json', 'id.json', 'ja.json', 'la.json', 'zh-Hans.json']);
  const registry = JSON.parse(fs.readFileSync(path.join(root, 'config/web/field-registry.json'), 'utf8'));
  const expected = [...new Set([...registry.fields.map((field: any) => field.labelKey), ...registry.displayLabelKeys, ...registry.legacyLabelKeys])].sort();
  const keys = files.map((file) => {
    const catalog = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
    assert.deepEqual(Object.keys(catalog.labels).sort(), expected, `${file} labels`);
    for (const key of NEW_LOCALE_KEYS) assert.ok(typeof catalog.labels[key] === 'string' && catalog.labels[key].length > 0, `${file} ${key}`);
    return catalog.locale;
  });
  assert.deepEqual(keys, ['en', 'fr', 'id', 'ja', 'la', 'zh-Hans']);
});

test('six language fixtures use valid extensible locale tags and preserve Unicode', () => {
  assert.equal(languageSamples.length, 6);
  for (const sample of languageSamples) {
    const content = createContentV2('full_day', sample.locale);
    content.trip.title = sample.title;
    content.summary = sample.brief;
    const result = validateForPublish(content);
    assert.equal(result.ok, true, `${sample.locale}: ${JSON.stringify(result.errors)}`);
    assert.equal(result.value.trip.language, sample.locale);
    assert.equal(result.value.summary, sample.brief);
  }
  const normalized = normalizeCanonicalContent(createContentV2('full_day', 'fr-fr'));
  assert.equal((normalized.value as any).trip.language, 'fr-FR');
});

test('all four trip modes satisfy the versioned structural and publish contracts without warnings', () => {
  for (const mode of MODES) {
    const content = createContentV2(mode, 'en');
    assert.equal(validateDraft(content).ok, true, mode);
    const published = validateForPublish(content);
    assert.equal(published.ok, true, `${mode}: ${JSON.stringify(published.errors)}`);
    assert.deepEqual(published.warnings, [], mode);
  }
});

test('blank drafts per mode are valid drafts with mode-correct shape and fail publish with concrete errors', () => {
  for (const mode of MODES) {
    const blank = createBlankDraft(mode, {});
    assert.equal(blank.schemaVersion, 'web-2.0.0');
    assert.equal(validateDraft(blank).ok, true, mode);
    assert.equal(validateForPublish(blank).ok, false, mode);
    assert.ok(codes(validateForPublish(blank).errors).includes('PUBLISH_FIELD_REQUIRED'), mode);
  }
  assert.equal(createBlankDraft('half_day').days[0].meals, null);
  assert.deepEqual(createBlankDraft('full_day').days[0].meals, { breakfast: false, lunch: false, dinner: false });
  assert.equal(createBlankDraft('multi_day').days.length, 2);
  assert.deepEqual([createBlankDraft('destination_guide').days.length, createBlankDraft('destination_guide').places.length], [0, 0]);
  const ids = new Set(createBlankDraft('multi_day').days.flatMap((day) => [day.id, ...day.activities.map((activity) => activity.id)]));
  assert.equal(ids.size, 4);
});

test('drafts can be incomplete while publish requires completed fields and a resolved locale', () => {
  const draft = createContentV2('full_day', 'en');
  draft.trip.title = '';
  draft.days[0].activities = [];
  assert.equal(validateDraft(draft).ok, true);
  const published = validateForPublish(draft);
  assert.ok(hasError(published, 'PUBLISH_FIELD_REQUIRED', 'trip.title'));
  assert.ok(hasError(published, 'EMPTY_DAY', 'days[0].activities'));
  const unresolved = createContentV2('full_day', 'en');
  unresolved.trip.language = null;
  assert.equal(validateDraft(unresolved).ok, true);
  assert.ok(hasError(validateForPublish(unresolved), 'PUBLISH_FIELD_REQUIRED', 'trip.language'));
});

test('a valid BCP 47 locale outside the six fixtures passes validation and warns that no label catalog exists', () => {
  const content = createContentV2('full_day', 'es-MX');
  assert.equal(validateDraft(content).ok, true);
  const published = validateForPublish(content);
  assert.equal(published.ok, true);
  assert.ok(codes(published.warnings).includes('LOCALE_CATALOG_UNAVAILABLE'));
  const invalid = createContentV2('full_day', 'not a locale');
  assert.ok(hasError(validateDraft(invalid), 'INVALID_LOCALE_TAG', 'trip.language'));
});

test('photo credit and meeting links accept https only and reject scriptable or plain-http URLs', () => {
  for (const url of ['javascript:alert(1)', 'http://example.test/a']) {
    const credit = createContentV2('full_day', 'en');
    credit.cover = { assetId: 'asset-1', credit: { photographer: 'Example', url, source: 'Guide' } };
    assert.equal(validateDraft(credit).errors.some((error) => error.path.endsWith('credit.url')), true, url);
    const maps = createContentV2('full_day', 'en');
    maps.meeting.mapsUrl = url;
    assert.equal(validateDraft(maps).errors.some((error) => error.path === 'meeting.mapsUrl'), true, url);
  }
});

test('FIELD_NOT_APPLICABLE blocks hidden data in the wrong mode so it can never be saved', () => {
  const cases: Array<[string, ItineraryMode, (content: any) => void, string]> = [
    ['guide start date', 'destination_guide', (c) => { c.trip.startDate = '2026-12-01'; }, 'trip.startDate'],
    ['guide start time', 'destination_guide', (c) => { c.trip.startTime = '08:00'; }, 'trip.startTime'],
    ['guide end time', 'destination_guide', (c) => { c.trip.endTime = '12:00'; }, 'trip.endTime'],
    ['guide meeting place', 'destination_guide', (c) => { c.meeting.place = 'Gate'; }, 'meeting.place'],
    ['guide maps link', 'destination_guide', (c) => { c.meeting.mapsUrl = 'https://maps.example.test/a'; }, 'meeting.mapsUrl'],
    ['guide pickup offered', 'destination_guide', (c) => { c.pickup.offered = true; }, 'pickup.offered'],
    ['guide with days', 'destination_guide', (c) => { c.days = [createContentV2('full_day').days[0]]; }, 'days'],
    ['half-day meals', 'half_day', (c) => { c.days[0].meals = { breakfast: false, lunch: false, dinner: false }; }, 'days[0].meals'],
    ['half-day hotel', 'half_day', (c) => { c.days[0].hotel = { name: '', area: null, note: null }; }, 'days[0].hotel'],
    ['half-day transfer note', 'half_day', (c) => { c.days[0].transferNote = 'Car'; }, 'days[0].transferNote'],
    ['half-day with places', 'half_day', (c) => { c.places = [placeV2(1)]; }, 'places'],
    ['full-day hotel', 'full_day', (c) => { c.days[0].hotel = { name: 'Hotel', area: null, note: null }; }, 'days[0].hotel'],
    ['full-day transfer note', 'full_day', (c) => { c.days[0].transferNote = 'Car'; }, 'days[0].transferNote'],
    ['multi-day start time', 'multi_day', (c) => { c.trip.startTime = '08:00'; }, 'trip.startTime'],
    ['multi-day end time', 'multi_day', (c) => { c.trip.endTime = '18:00'; }, 'trip.endTime'],
    ['pickup details without an offer', 'half_day', (c) => { c.pickup.area = 'Hotel lobby'; }, 'pickup.area']
  ];
  for (const [name, mode, mutate, errorPath] of cases) {
    const content: any = createContentV2(mode, 'en');
    mutate(content);
    const result = validateDraft(content);
    assert.equal(result.ok, false, name);
    assert.ok(hasError(result, 'FIELD_NOT_APPLICABLE', errorPath), `${name}: ${JSON.stringify(result.errors)}`);
  }
  const allowed: Array<[string, ItineraryMode, (content: any) => void]> = [
    ['half-day window', 'half_day', (c) => { c.trip.startTime = '08:00'; c.trip.endTime = '11:00'; }],
    ['full-day meals', 'full_day', (c) => { c.days[0].meals = { breakfast: true, lunch: true, dinner: true }; }],
    ['multi-day hotel and transfer', 'multi_day', (c) => { c.days[0].hotel = { name: 'Hotel', area: 'Ubud', note: 'Quiet' }; c.days[0].transferNote = 'Car'; }],
    ['pickup with an offer', 'half_day', (c) => { c.pickup = { offered: true, area: 'Hotel lobby', time: '07:30', dropoffNote: 'Same place' }; }]
  ];
  for (const [name, mode, mutate] of allowed) {
    const content: any = createContentV2(mode, 'en');
    mutate(content);
    assert.equal(validateDraft(content).ok, true, `${name}: ${JSON.stringify(validateDraft(content).errors)}`);
  }
});

test('day and place counts follow each mode at publish while drafts stay saveable', () => {
  const twoDays: any = createContentV2('half_day', 'en');
  twoDays.days.push(structuredClone(createContentV2('half_day').days[0]));
  twoDays.days[1].id = idsV2.day(2);
  twoDays.days[1].activities.forEach((activity: any, index: number) => { activity.id = idsV2.activity(900 + index); });
  assert.equal(validateDraft(twoDays).ok, true);
  assert.ok(hasError(validateForPublish(twoDays), 'SINGLE_DAY_REQUIRED', 'days'));
  const oneDay: any = createContentV2('multi_day', 'en');
  oneDay.days = [oneDay.days[0]];
  assert.ok(hasError(validateForPublish(oneDay), 'MULTI_DAY_COUNT_INVALID', 'days'));
  const noPlaces: any = createContentV2('destination_guide', 'en');
  noPlaces.places = [];
  assert.equal(validateDraft(noPlaces).ok, true);
  assert.ok(hasError(validateForPublish(noPlaces), 'PLACES_REQUIRED', 'places'));
  const fifteen: any = createContentV2('multi_day', 'en');
  fifteen.days = Array.from({ length: 15 }, (_, index) => ({ ...structuredClone(fifteen.days[0]), id: idsV2.day(100 + index), activities: [activityV2(1000 + index)] }));
  assert.equal(validateDraft(fifteen).ok, false);
});

test('a day title may be filled in any scheduled mode but is required to publish only for multi-day', () => {
  for (const mode of ['half_day', 'full_day'] as const) {
    const titled: any = createContentV2(mode, 'en');
    titled.days[0].title = 'Morning walk';
    assert.equal(validateDraft(titled).ok, true, `${mode} titled`);
    const untitled: any = createContentV2(mode, 'en');
    untitled.days[0].title = '';
    assert.equal(validateForPublish(untitled).ok, true, `${mode} untitled`);
  }
  const multi: any = createContentV2('multi_day', 'en');
  multi.days[1].title = '';
  assert.equal(validateDraft(multi).ok, true);
  assert.ok(hasError(validateForPublish(multi), 'PUBLISH_FIELD_REQUIRED', 'days[1].title'));
});

test('destination-guide places require only name, area and description', () => {
  const guide: any = createContentV2('destination_guide', 'ja');
  guide.places = [placeV2(1, { group: null, tips: [], gettingThere: null, suggestedDuration: null, bestTime: null, nearby: null })];
  assert.equal(validateForPublish(guide).ok, true, JSON.stringify(validateForPublish(guide).errors));
  guide.places[0].area = '';
  assert.ok(hasError(validateForPublish(guide), 'PUBLISH_FIELD_REQUIRED', 'places[0].area'));
  guide.places[0].area = 'North';
  guide.places[0].description = '  ';
  assert.ok(hasError(validateForPublish(guide), 'PUBLISH_FIELD_REQUIRED', 'places[0].description'));
});

test('place count is not silently capped and long Unicode text is counted by code points', () => {
  const guide: any = createContentV2('destination_guide', 'zh-Hans');
  guide.places = Array.from({ length: 120 }, (_, index) => placeV2(index + 1, { name: `地点 ${index + 1}` }));
  guide.places[0].description = '京都庭园景色优美。'.repeat(350);
  assert.ok(Buffer.byteLength(guide.places[0].description, 'utf8') > guide.places[0].description.length);
  assert.equal(validateDraft(guide).ok, true);
  assert.equal(validateForPublish(guide).ok, true);
});

function withActivities(mode: ItineraryMode, activities: any[]) {
  const content: any = createContentV2(mode, 'en');
  content.days[0].activities = activities;
  return content;
}

test('span caps are 360 / 720 / 960 minutes and only provable violations are errors', () => {
  const boundaries: Array<[ItineraryMode, number]> = [['half_day', 360], ['full_day', 720], ['multi_day', 960]];
  for (const [mode, cap] of boundaries) {
    const atCap = validateForPublish(withActivities(mode, [activityV2(1, { time: null, durationMinutes: cap })]));
    assert.equal(atCap.ok, true, `${mode} at cap: ${JSON.stringify(atCap.errors)}`);
    const over = validateForPublish(withActivities(mode, [activityV2(1, { time: null, durationMinutes: cap - 59 }), activityV2(2, { time: null, durationMinutes: 60 })]));
    assert.ok(hasError(over, 'DURATION_CAP_EXCEEDED', 'days[0]'), `${mode} over cap with unknown start times`);
  }
  const unknown = validateForPublish(withActivities('half_day', [activityV2(1, { time: null, durationMinutes: null }), activityV2(2, { time: null, durationMinutes: null })]));
  assert.equal(unknown.ok, true);
  assert.ok(codes(unknown.warnings).includes('SCHEDULE_TIME_UNKNOWN'));
});

test('timed spans and the trip start/end window are checked against the mode cap', () => {
  const longDay = validateForPublish(withActivities('half_day', [activityV2(1, { time: '08:00', durationMinutes: 60 }), activityV2(2, { time: '14:30', durationMinutes: 60 })]));
  assert.ok(hasError(longDay, 'DURATION_CAP_EXCEEDED', 'days[0]'));
  const window: any = createContentV2('half_day', 'en');
  window.trip.startTime = '08:00';
  window.trip.endTime = '15:00';
  assert.ok(hasError(validateForPublish(window), 'DURATION_CAP_EXCEEDED', 'trip.endTime'));
  const fullDayWindow: any = createContentV2('full_day', 'en');
  fullDayWindow.trip.startTime = '08:00';
  fullDayWindow.trip.endTime = '20:00';
  assert.equal(validateForPublish(fullDayWindow).ok, true);
  const backwards: any = createContentV2('full_day', 'en');
  backwards.trip.startTime = '17:00';
  backwards.trip.endTime = '08:00';
  assert.ok(hasError(validateForPublish(backwards), 'TIME_RANGE_INVALID', 'trip.endTime'));
});

test('activity times must not go backwards within a day', () => {
  const backwards = validateForPublish(withActivities('full_day', [activityV2(1, { time: '10:00', durationMinutes: null }), activityV2(2, { time: '09:00', durationMinutes: null })]));
  assert.ok(hasError(backwards, 'ACTIVITY_ORDER', 'days[0].activities[1].time'));
  const sameTime = validateForPublish(withActivities('full_day', [activityV2(1, { time: '10:00', durationMinutes: null }), activityV2(2, { time: '10:00', durationMinutes: null })]));
  assert.equal(hasError(sameTime, 'ACTIVITY_ORDER'), false);
  const withGap = validateForPublish(withActivities('full_day', [activityV2(1, { time: '10:00', durationMinutes: null }), activityV2(2, { time: null, durationMinutes: null }), activityV2(3, { time: '11:00', durationMinutes: null })]));
  assert.equal(hasError(withGap, 'ACTIVITY_ORDER'), false);
});

test('a missing meeting point is only a warning, and pickup or guide mode removes it', () => {
  for (const mode of ['half_day', 'full_day', 'multi_day'] as const) {
    const content: any = createContentV2(mode, 'en');
    content.meeting = { place: null, mapsUrl: null, time: null, note: null };
    const result = validateForPublish(content);
    assert.equal(result.ok, true, mode);
    assert.ok(codes(result.warnings).includes('MEETING_POINT_MISSING'), mode);
    content.pickup = { offered: true, area: 'Hotel lobby', time: null, dropoffNote: null };
    assert.equal(codes(validateForPublish(content).warnings).includes('MEETING_POINT_MISSING'), false, `${mode} with pickup`);
  }
  assert.equal(codes(validateForPublish(createContentV2('destination_guide', 'en')).warnings).includes('MEETING_POINT_MISSING'), false);
});

test('a used photo needs a credit with a photographer before publish', () => {
  const content: any = createContentV2('full_day', 'en');
  content.cover = { assetId: 'asset-1', credit: null };
  assert.equal(validateDraft(content).ok, true);
  assert.ok(hasError(validateForPublish(content), 'PHOTO_ATTRIBUTION_REQUIRED', 'cover.credit'));
  content.cover.credit = { photographer: '  ', url: null, source: 'Guide' };
  assert.ok(hasError(validateForPublish(content), 'PHOTO_ATTRIBUTION_REQUIRED', 'cover.credit'));
  content.cover.credit = { photographer: 'Made', url: 'https://example.test/made', source: 'Guide' };
  assert.equal(validateForPublish(content).ok, true);
  const dayPhoto: any = createContentV2('multi_day', 'en');
  dayPhoto.days[1].photo = { assetId: 'asset-2', credit: null };
  assert.ok(hasError(validateForPublish(dayPhoto), 'PHOTO_ATTRIBUTION_REQUIRED', 'days[1].photo.credit'));
  const placePhoto: any = createContentV2('destination_guide', 'en');
  placePhoto.places[0].photo = { assetId: 'asset-3', credit: null };
  assert.ok(hasError(validateForPublish(placePhoto), 'PHOTO_ATTRIBUTION_REQUIRED', 'places[0].photo.credit'));
});

test('normalization clones, canonicalizes and recomputes day numbers without mutating caller input', () => {
  const input: any = createContentV2('multi_day', 'fr-fr');
  input.days[0].dayNumber = 5;
  const before = structuredClone(input);
  const normalized = normalizeCanonicalContent(input);
  const value = normalized.value as any;
  assert.equal(value.trip.language, 'fr-FR');
  assert.deepEqual(value.days.map((day: any) => day.dayNumber), [1, 2]);
  assert.ok(normalized.warnings.some((warning) => warning.code === 'DERIVED_FIELD_UPDATED' && warning.path === 'days[0].dayNumber'));
  assert.deepEqual(input, before);
  assert.notEqual(normalized.value, input);
});

test('serialization round-trip and reorder preserve stable item identities and renumber days', () => {
  const content: any = createContentV2('multi_day', 'en');
  const idsBefore = content.days.map((day: any) => day.id);
  content.days.reverse();
  const roundTrip = JSON.parse(JSON.stringify(content));
  const normalized = normalizeCanonicalContent(roundTrip);
  assert.equal(normalized.ok, true);
  const value = normalized.value as any;
  assert.deepEqual(value.days.map((day: any) => day.id), [...idsBefore].reverse());
  assert.deepEqual(value.days.map((day: any) => day.dayNumber), [1, 2]);
  assert.deepEqual(normalizeCanonicalContent(value).value, value);
});

test('duplicate stable IDs are rejected without modifying input', () => {
  const content: any = createContentV2('full_day', 'en');
  content.days[0].activities[0].id = content.days[0].id;
  const before = structuredClone(content);
  const result = normalizeCanonicalContent(content);
  assert.equal(result.errors.some((error) => error.code === 'DUPLICATE_STABLE_ID'), true);
  assert.deepEqual(content, before);
  assert.equal(validateDraft(content).ok, false);
});

test('malformed JSON types return structured diagnostics instead of throwing', () => {
  const cases: Array<[string, (content: any) => void]> = [
    ['days object', (content) => { content.days = {}; }],
    ['days string', (content) => { content.days = 'nope'; }],
    ['days null entry', (content) => { content.days = [null]; }],
    ['places object', (content) => { content.places = {}; }],
    ['activities object', (content) => { content.days[0].activities = {}; }],
    ['trip string', (content) => { content.trip = 'nope'; }],
    ['meeting string', (content) => { content.meeting = 'nope'; }],
    ['pickup null', (content) => { content.pickup = null; }],
    ['local tips string', (content) => { content.localTips = 'carry water'; }],
    ['wrong schema version', (content) => { content.schemaVersion = 'web-1.0.0'; }],
    ['root array', () => undefined]
  ];
  for (const [name, mutate] of cases) {
    for (const validate of [validateDraft, validateForPublish]) {
      let content: any = createContentV2('full_day', 'en');
      mutate(content);
      if (name === 'root array') content = [];
      let result: any;
      assert.doesNotThrow(() => { result = validate(content); }, name);
      assert.equal(result.ok, false, name);
      assert.ok(result.errors.length > 0, name);
      assert.ok(result.errors.every((error: any) => typeof error.code === 'string' && typeof error.path === 'string' && typeof error.message === 'string'), name);
    }
  }
});

// ---- v1 -> v2 upgrade ----

const matchingProfile = { agencyName: 'Sample Travel Studio', agencyContact: 'guide@example.test', agencyLogoAssetId: '' };

test('every v1 fixture mode upgrades to a valid v2 draft, preserving stable IDs and reporting dropped data', () => {
  for (const mode of MODES) {
    const v1 = createContentV1(mode, 'en');
    const before = structuredClone(v1);
    const upgraded = upgradeV1ToV2(v1, matchingProfile);
    assert.deepEqual(v1, before, `${mode} input must not be mutated`);
    const checked = validateDraft(upgraded.value);
    assert.equal(checked.ok, true, `${mode}: ${JSON.stringify(checked.errors)}`);
    assert.equal(upgraded.value.schemaVersion, 'web-2.0.0');
    assert.equal(upgraded.value.trip.mode, mode);
    assert.equal(upgraded.value.trip.title, 'Ubud in a day');
    assert.equal(upgraded.value.trip.colorTheme, 'cultural');
    assert.equal(upgraded.value.summary, 'Explore the landscape and culture at an unhurried pace.');
    const dropped = upgraded.warnings.filter((warning) => warning.code === 'FIELD_DROPPED').map((warning) => warning.path).sort();
    assert.deepEqual(dropped, ['brochure.themes', 'brochure.travelerCount', 'brochure.travelerType', 'overview.highlights', 'overview.quickFacts.bestSeason', 'overview.routeSummary'], mode);
    assert.equal(codes(upgraded.warnings).includes('AGENCY_VALUE_DROPPED'), false, `${mode} with a matching profile`);
  }
  const full = upgradeV1ToV2(createContentV1('full_day', 'en'), matchingProfile).value;
  assert.equal(full.days[0].id, idsV1.block1);
  assert.equal(full.days[0].activities[0].id, idsV1.activity1);
  assert.deepEqual(full.days[0].activities[0], {
    id: idsV1.activity1, time: '08:00', durationMinutes: 90, kind: 'sightseeing', title: 'Rice terraces', place: 'Ubud',
    description: 'Walk through cultivated terraces and learn how local irrigation traditions shape the landscape.', tip: null
  });
  assert.equal(full.days[0].dayNumber, 1);
  assert.equal(full.days[0].hotel, null);
  assert.deepEqual(full.days[0].meals, { breakfast: false, lunch: false, dinner: false });
  const guide = upgradeV1ToV2(createContentV1('destination_guide', 'en'), matchingProfile).value;
  assert.equal(guide.places[0].id, idsV1.spot1);
  assert.equal(guide.places[0].group, 'Central Ubud');
  assert.equal(guide.places[0].bestTime, 'Early morning for cooler air');
  assert.equal(guide.places[0].nearby, 'Pair with a relaxed lunch in Ubud.');
  const multi = upgradeV1ToV2(createContentV1('multi_day', 'en'), matchingProfile);
  assert.deepEqual(multi.value.days.map((day) => day.id), [idsV1.block1, idsV1.block2]);
  assert.deepEqual(multi.value.days[0].hotel, { name: '', area: 'Ubud', note: 'Stay near the town center.' });
  assert.equal(multi.warnings.filter((warning) => warning.code === 'HOTEL_NAME_EMPTY').length, 2);
});

test('v1 agency values that differ from the workspace profile are reported, not silently lost', () => {
  const result = upgradeV1ToV2(createContentV1('full_day', 'en'), { agencyName: 'Another Agency', agencyContact: 'guide@example.test' });
  assert.deepEqual(result.warnings.filter((warning) => warning.code === 'AGENCY_VALUE_DROPPED').map((warning) => warning.path), ['brochure.agencyName']);
});

test('time and duration text is parsed, and unreadable text is kept in the tip with a warning', () => {
  const v1: any = createContentV1('full_day', 'en');
  const labels: Array<[string, string, string | null, number | null]> = [
    ['8.30', '1.5 hours', '08:30', 90], ['09:15', '1 jam 30 menit', '09:15', 90], ['10:00 - 12:00', '45 menit', '10:00', 45], ['Sunrise', 'half a day', null, null]
  ];
  v1.schedule[0].activities = labels.map(([timeLabel, durationLabel], index) => ({ ...structuredClone(createContentV1('full_day').schedule[0].activities[0]), id: `20000000-0000-5000-8000-${String(100 + index).padStart(12, '0')}`, timeLabel, durationLabel, category: null }));
  const result = upgradeV1ToV2(v1, matchingProfile);
  labels.forEach(([, , time, minutes], index) => {
    assert.equal(result.value.days[0].activities[index].time, time, `time ${index}`);
    assert.equal(result.value.days[0].activities[index].durationMinutes, minutes, `duration ${index}`);
  });
  const unreadable = result.value.days[0].activities[3];
  assert.equal(unreadable.tip, null, 'unparsed text moved to notes');
  const activityNote = result.notes.find((n: any) => n.targetId === unreadable.id);
  assert.ok(activityNote, 'unparsed labels collected to notes');
  assert.match(activityNote?.text || '', /timeLabel.*Sunrise/);
  assert.match(activityNote?.text || '', /durationLabel.*half a day/);
  assert.ok(result.warnings.some((warning) => warning.code === 'TIME_UNPARSED' && warning.path === 'days[0].activities[3].time'));
  assert.ok(result.warnings.some((warning) => warning.code === 'DURATION_UNPARSED' && warning.path === 'days[0].activities[3].durationMinutes'));
});

test('collapsed day ranges become one day with a warning that states the old and new day counts', () => {
  const v1: any = createContentV1('multi_day', 'en');
  v1.brochure.durationDays = 14;
  v1.schedule = [v1.schedule[0]];
  v1.schedule[0].dayEnd = 14;
  v1.schedule[0].isCondensed = true;
  const result = upgradeV1ToV2(v1, matchingProfile);
  assert.equal(result.value.days.length, 1);
  assert.equal(result.value.days[0].title, '1–14: Day 1');
  const warning = result.warnings.find((item) => item.code === 'DAY_RANGE_COLLAPSED')!;
  assert.match(warning.message, /1 days instead of 14/);
  assert.equal(validateDraft(result.value).ok, true);
});

test('block dates seed the trip start date, and conflicting dates are reported', () => {
  const seeded: any = createContentV1('multi_day', 'en');
  seeded.schedule[0].date = '2026-05-01';
  seeded.schedule[1].date = '2026-05-02';
  const seededResult = upgradeV1ToV2(seeded, matchingProfile);
  assert.equal(seededResult.value.trip.startDate, '2026-05-01');
  assert.equal(codes(seededResult.warnings).includes('DAY_DATE_DROPPED'), false);
  const conflicting: any = createContentV1('multi_day', 'en');
  conflicting.brochure.startDate = '2026-05-01';
  conflicting.schedule[1].date = '2026-06-09';
  assert.ok(upgradeV1ToV2(conflicting, matchingProfile).warnings.some((warning) => warning.code === 'DAY_DATE_DROPPED' && warning.path === 'days[1].date'));
});

test('mode mismatches in old drafts are cleaned with warnings so the upgraded draft is valid', () => {
  const guide: any = createContentV1('destination_guide', 'en');
  guide.brochure.startDate = '2026-05-01';
  guide.schedule = structuredClone(createContentV1('full_day').schedule);
  const guideResult = upgradeV1ToV2(guide, matchingProfile);
  assert.ok(codes(guideResult.warnings).includes('START_DATE_DROPPED'));
  assert.ok(codes(guideResult.warnings).includes('SCHEDULE_DROPPED_FOR_GUIDE'));
  assert.equal(validateDraft(guideResult.value).ok, true);
  const scheduled: any = createContentV1('full_day', 'en');
  scheduled.spots = structuredClone(createContentV1('destination_guide').spots);
  scheduled.schedule[0].accommodation = { name: 'Hotel', area: 'Ubud', note: 'Quiet' };
  const scheduledResult = upgradeV1ToV2(scheduled, matchingProfile);
  assert.ok(codes(scheduledResult.warnings).includes('SPOTS_DROPPED_FOR_MODE'));
  assert.ok(codes(scheduledResult.warnings).includes('ACCOMMODATION_DROPPED'));
  assert.equal(scheduledResult.value.days[0].hotel, null);
  assert.equal(validateDraft(scheduledResult.value).ok, true);
  const half: any = createContentV1('half_day', 'en');
  half.schedule[0].mealsIncluded = ['Lunch'];
  const halfResult = upgradeV1ToV2(half, matchingProfile);
  assert.equal(halfResult.value.days[0].meals, null);
  assert.ok(codes(halfResult.warnings).includes('MEALS_DROPPED_HALF_DAY'));
  assert.equal(validateDraft(halfResult.value).ok, true);
});

test('meals, transport notes and empty days map without data loss', () => {
  const v1: any = createContentV1('multi_day', 'en');
  v1.schedule[0].mealsIncluded = ['Breakfast', 'Makan malam', 'Picnic'];
  v1.schedule[0].transportNote = 'Private car';
  v1.schedule[0].blockTip = 'Leave early';
  v1.schedule[1].activities = [];
  const multi = upgradeV1ToV2(v1, matchingProfile);
  assert.deepEqual(multi.value.days[0].meals, { breakfast: true, lunch: false, dinner: true });
  assert.ok(multi.warnings.some((warning) => warning.code === 'MEAL_UNMATCHED'));
  assert.equal(multi.value.days[0].transferNote, 'Private car\nLeave early');
  assert.equal(multi.value.days[1].activities.length, 0);
  assert.equal(validateDraft(multi.value).ok, true);
  assert.ok(hasError(validateForPublish(multi.value), 'EMPTY_DAY', 'days[1].activities'));
  const single: any = createContentV1('full_day', 'en');
  single.schedule[0].transportNote = 'Hotel pickup';
  single.schedule[0].blockTip = 'Bring cash';
  const singleResult = upgradeV1ToV2(single, matchingProfile);
  assert.equal(singleResult.value.days[0].activities[0].tip, 'Hotel pickup\nBring cash');
  assert.equal(singleResult.value.days[0].transferNote, null);
});

test('photos map to cover/day/place photos; non-https links and orphan credits are reported', () => {
  const v1: any = createContentV1('full_day', 'en');
  v1.hero = { assetId: 'asset-hero', photoAttribution: { photographer: 'Made', photographerUrl: 'https://example.test/made', source: 'Guide' }, gradientOnly: false };
  v1.schedule[0].assetId = 'asset-day';
  v1.schedule[0].photoAttribution = { photographer: 'Wayan', photographerUrl: 'http://example.test/wayan', source: 'Guide' };
  const result = upgradeV1ToV2(v1, matchingProfile);
  assert.deepEqual(result.value.cover, { assetId: 'asset-hero', credit: { photographer: 'Made', url: 'https://example.test/made', source: 'Guide' } });
  assert.deepEqual(result.value.days[0].photo, { assetId: 'asset-day', credit: { photographer: 'Wayan', url: null, source: 'Guide' } });
  assert.ok(result.warnings.some((warning) => warning.code === 'PHOTO_URL_DROPPED' && warning.path === 'days[0].photo.credit.url'));
  const orphan: any = createContentV1('full_day', 'en');
  orphan.hero = { assetId: null, photoAttribution: { photographer: 'Made', photographerUrl: null, source: 'Guide' }, gradientOnly: true };
  const orphanResult = upgradeV1ToV2(orphan, matchingProfile);
  assert.equal(orphanResult.value.cover, null);
  assert.ok(codes(orphanResult.warnings).includes('PHOTO_CREDIT_WITHOUT_PHOTO'));
  assert.equal(validateDraft(result.value).ok, true);
});

test('v1 maximum field sizes carry over without truncation so migration cannot fail on valid old data', () => {
  const v1: any = createContentV1('destination_guide', 'en');
  Object.assign(v1.spots[0], { description: 'd'.repeat(6000), suggestedDuration: 's'.repeat(120), bestTimeToVisit: 'b'.repeat(240), nearbyPairing: 'n'.repeat(500), gettingThere: 'g'.repeat(1000), tips: Array.from({ length: 20 }, () => 't'.repeat(1000)) });
  v1.practical = {
    included: Array.from({ length: 50 }, () => 'i'.repeat(500)), notIncluded: [], whatToBring: [], healthSafety: Array.from({ length: 50 }, () => 'h'.repeat(500)),
    localTips: Array.from({ length: 50 }, () => ({ topic: 'p'.repeat(120), note: 'q'.repeat(1000) })),
    emergencyContacts: Array.from({ length: 30 }, () => ({ label: 'l'.repeat(120), value: 'v'.repeat(240) }))
  };
  v1.closing.disclaimer = 'x'.repeat(1200);
  const result = upgradeV1ToV2(v1, matchingProfile);
  assert.equal(codes(result.warnings).includes('VALUE_TRUNCATED'), false);
  const checked = validateDraft(result.value);
  assert.equal(checked.ok, true, JSON.stringify(checked.errors.slice(0, 3)));
  const multi: any = createContentV1('multi_day', 'en');
  multi.schedule[0].transportNote = 'a'.repeat(1000);
  multi.schedule[0].blockTip = 'b'.repeat(1000);
  assert.equal(validateDraft(upgradeV1ToV2(multi, matchingProfile).value).ok, true);
});

test('upgrade never throws, even on garbage input', () => {
  for (const input of [null, undefined, 'text', 7, [], {}, { brochure: 'x', schedule: 'y', spots: 3 }]) {
    let result: any;
    assert.doesNotThrow(() => { result = upgradeV1ToV2(input); }, JSON.stringify(input));
    assert.equal(result.value.schemaVersion, 'web-2.0.0');
    assert.ok(Array.isArray(result.warnings));
  }
});

// ---- legacy n8n adapter (still outputs v1; tests pipe it through the upgrade) ----

test('legacy wrapper maps manual copy and stable IDs, reports unsafe remote assets, excludes execution metadata', () => {
  const before = structuredClone(legacyFixture);
  const first = adaptLegacyDocument(legacyFixture);
  const second = adaptLegacyDocument(legacyFixture);
  const content = first.content as any;
  assert.deepEqual(legacyFixture, before);
  assert.equal(content.schemaVersion, 'web-1.0.0');
  assert.equal(content.brochure.tripTitle, 'Ubud in a day');
  assert.equal(content.schedule[0].activities[0].description, 'Walk among the cultivated terraces and learn how the subak irrigation system shapes the landscape.');
  assert.equal(content.practical.emergencyContacts[0].value, '+62-000-0000');
  assert.equal(content.schedule[0].activities[0].id, (second.content as any).schedule[0].activities[0].id);
  assert.equal(content.hero.assetId, null);
  assert.equal(content.hero.gradientOnly, true);
  assert.ok(first.diagnostics.some((diagnostic) => diagnostic.code === 'LEGACY_REMOTE_ASSET_NOT_IMPORTED'));
  assert.ok(first.diagnostics.some((diagnostic) => diagnostic.code === 'LEGACY_PRIVATE_METADATA_EXCLUDED'));
  assert.equal(JSON.stringify(content).includes('hello@example.test'), true);
  assert.equal(JSON.stringify(content).includes('guide@example.test'), false);
  assert.equal(JSON.stringify(content).includes('private execution value'), false);
  assert.equal(JSON.stringify(content).includes('fixture-execution-id'), false);
});

test('legacy canonical-root and flat-render inputs convert and then upgrade to valid v2 drafts that keep manual copy', () => {
  const canonicalRoot = adaptLegacyDocument(legacyFixture.canonicalItinerary);
  const legacy = legacyFixture.canonicalItinerary;
  const flatRender = adaptLegacyDocument({
    ...legacy.brochure, hero: legacy.hero, overview: legacy.overview, schedule: legacy.schedule, spots: legacy.spots, practical: legacy.practical, closing: legacy.closing
  });
  assert.equal((canonicalRoot.content as any).schedule[0].activities[0].title, 'Tegallalang Rice Terraces');
  assert.equal((flatRender.content as any).brochure.tripTitle, 'Ubud in a day');
  for (const converted of [canonicalRoot, flatRender]) {
    const upgraded = upgradeV1ToV2(converted.content);
    const checked = validateDraft(upgraded.value);
    assert.deepEqual(checked.errors, []);
    assert.equal(upgraded.value.trip.title, 'Ubud in a day');
    assert.equal(upgraded.value.days[0].activities[0].title, 'Tegallalang Rice Terraces');
  }
});

test('legacy migration reports unknown dropped fields without copying their values', () => {
  const source = structuredClone(legacyFixture);
  source.canonicalItinerary.overview.internalNote = 'value-that-must-not-be-copied';
  const result = adaptLegacyDocument(source);
  assert.ok(result.diagnostics.some((diagnostic) => diagnostic.code === 'LEGACY_UNMAPPED_FIELDS' && diagnostic.path === 'overview'));
  assert.equal(JSON.stringify(result.content).includes('value-that-must-not-be-copied'), false);
});

test('legacy contact and theme conflicts are reported instead of silently dropped', () => {
  const contactSource = structuredClone(legacyFixture);
  contactSource.canonicalItinerary.closing.agencyContact = 'closing-conflict@example.test';
  const contactResult = adaptLegacyDocument(contactSource);
  assert.ok(contactResult.diagnostics.some((diagnostic) => diagnostic.code === 'LEGACY_CONTACT_CONFLICT' && diagnostic.path === 'closing.agencyContact'));
  assert.equal((contactResult.content as any).brochure.agencyContact, 'hello@example.test');

  const themeSource = structuredClone(legacyFixture);
  themeSource.canonicalItinerary.overview.quickFacts = { ...themeSource.canonicalItinerary.overview.quickFacts, themes: ['conflicting-theme'] };
  const themeResult = adaptLegacyDocument(themeSource);
  assert.ok(themeResult.diagnostics.some((diagnostic) => diagnostic.code === 'LEGACY_THEME_CONFLICT' && diagnostic.path === 'overview.quickFacts.themes'));

  const untouched = adaptLegacyDocument(legacyFixture);
  assert.equal(untouched.diagnostics.some((diagnostic) => diagnostic.code === 'LEGACY_CONTACT_CONFLICT'), false);
});
