import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import registry from '../../config/web/field-registry.json' with { type: 'json' };
import { validateDraft } from '../../src/contracts/validator.js';
import type { ItineraryMode, Photo, WebItineraryContent } from '../../src/contracts/types.js';
import { EditorForm, type EditorProps } from '../../src/editor/EditorForm.js';
import type { FieldMeta } from '../../src/editor/schema-meta.js';
import { fieldLabels, pathLabels } from '../../src/editor/labels.js';
import { blankToNull, changeMode, ensureMeals, hasModeLoss, makeActivity, makeDay, makePlace, moveById, moveIndex, normalizeBlanks, normalizeHotel, setPhotoCredit, targetIdFor } from '../../src/editor/model.js';
import { appliesTo, fieldMeta } from '../../src/editor/schema-meta.js';
import { createContentV2 } from './fixtures-v2.js';

const MODES: ItineraryMode[] = ['half_day', 'full_day', 'multi_day', 'destination_guide'];
const noop = () => {};
const isRendered = (field: (typeof registry.fields)[number]) => field.control !== 'hidden' && field.control !== 'derived';

function editorProps(mode: ItineraryMode, content: WebItineraryContent): EditorProps {
  return {
    content, mode, recordId: 'rec', assets: [], meta: fieldMeta, patch: noop, onModeChange: noop, agencyName: '', onFocusProfile: noop,
    localeInput: 'en', localeError: '', language: { requestedLanguage: 'en', outputLanguage: 'en', source: 'explicit' }, localeNeedsSupport: false,
    languageProposal: null, onLocaleChange: noop, onDetectLanguage: noop, onAcceptLanguage: noop, busy: false, dirty: false, localeSupportedCheck: true,
    aiAction: () => null, writing: { brief: '', notes: [] }, onWritingChange: noop, aiAssistExtra: null, guides: [], onUploadAsset: async () => null
  };
}

function expandedDraft(mode: ItineraryMode): WebItineraryContent {
  const content = createContentV2(mode);
  const photo = (): Photo => ({ assetId: 'a1', credit: { photographer: 'P', url: 'https://example.test/p', source: 'S' } });
  content.cover = photo();
  for (const day of content.days) {
    day.photo = photo();
    day.hotel = mode === 'multi_day' ? { name: 'Hotel', area: 'Area', note: 'Note' } : null;
    day.meals = mode === 'half_day' ? null : { breakfast: true, lunch: true, dinner: true };
    day.transferNote = mode === 'multi_day' ? 'Transfer' : null;
  }
  for (const place of content.places) { place.tips = ['Tip']; place.photo = photo(); }
  if (mode !== 'destination_guide') content.pickup = { offered: true, area: 'A', time: '07:00', dropoffNote: 'N' };
  content.included = ['a']; content.notIncluded = ['b']; content.whatToBring = ['c']; content.localTips = ['d']; content.notSuitableFor = ['e']; content.notAllowed = ['f']; content.notSuitableFor = ['e'];
  content.emergencyContacts = [{ label: 'Polisi', value: '110' }];
  return content;
}

function listFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? listFiles(full) : [full];
  });
}

const errorsOf = (content: WebItineraryContent) => validateDraft(content).errors.map((e) => `${e.code}@${e.path}`);

for (const mode of MODES) {
  test(`1. every applicable registry path renders exactly for ${mode}`, () => {
    const html = renderToStaticMarkup(React.createElement(EditorForm, editorProps(mode, expandedDraft(mode))));
    const rendered = new Set([...html.matchAll(/data-field-path="([^"]+)"/g)].map((match) => match[1]));
    const expected = registry.fields.filter((field) => isRendered(field) && appliesTo(field, mode)).map((field) => field.path);
    assert.deepEqual(expected.filter((p) => !rendered.has(p)), [], `missing controls in ${mode}`);
    const notApplicable = registry.fields.filter((field) => !appliesTo(field, mode)).map((field) => field.path);
    assert.deepEqual(notApplicable.filter((p) => rendered.has(p)), [], `controls that must not render in ${mode}`);
  });
}

test('2. fieldMeta resolves every registry path, labels are Indonesian, limits come from the schema', () => {
  for (const field of registry.fields) {
    const mode = MODES.find((m) => appliesTo(field, m));
    assert.ok(mode, field.path);
    const meta = fieldMeta(field.path, mode);
    assert.equal(meta.path, field.path);
    if (isRendered(field)) {
      assert.ok(pathLabels[field.path] || fieldLabels[field.labelKey], `no Indonesian label for ${field.path} (${field.labelKey})`);
    }
  }
  assert.equal(fieldMeta('included[]', 'full_day').maxItems, 50);
  assert.equal(fieldMeta('included[]', 'full_day').maxLength, 500);
  assert.equal(fieldMeta('trip.title', 'full_day').maxLength, 200);
  assert.equal(fieldMeta('days[].title', 'multi_day').required, true);
  assert.equal(fieldMeta('days[].title', 'half_day').required, false);
  assert.throws(() => fieldMeta('days[].hotel.name', 'half_day'));
});

for (const mode of MODES) {
  test(`3. a draft built from the factories passes validateDraft (${mode})`, () => {
    const content = createContentV2(mode);
    if (mode === 'destination_guide') content.places = [makePlace()];
    else content.days = mode === 'multi_day' ? [makeDay(mode, 1), makeDay(mode, 2)] : [makeDay(mode, 1)];
    assert.deepEqual(errorsOf(content), []);
  });
}

const EXPECTED_LOSS: Record<string, string[]> = {
  'half_day>full_day': [],
  'half_day>multi_day': ['jam mulai/selesai'],
  'half_day>destination_guide': ['1 hari beserta aktivitasnya', 'tanggal mulai', 'jam mulai/selesai', 'titik kumpul'],
  'full_day>half_day': ['pilihan makan'],
  'full_day>multi_day': ['jam mulai/selesai'],
  'full_day>destination_guide': ['1 hari beserta aktivitasnya', 'tanggal mulai', 'jam mulai/selesai', 'titik kumpul'],
  'multi_day>half_day': ['1 hari selain hari pertama', 'info hotel', 'catatan perpindahan', 'pilihan makan'],
  'multi_day>full_day': ['1 hari selain hari pertama', 'info hotel', 'catatan perpindahan'],
  'multi_day>destination_guide': ['2 hari beserta aktivitasnya', 'tanggal mulai', 'titik kumpul'],
  'destination_guide>half_day': ['2 tempat'],
  'destination_guide>full_day': ['2 tempat'],
  'destination_guide>multi_day': ['2 tempat']
};

for (const from of MODES) {
  for (const to of MODES) {
    if (from === to) continue;
    test(`4. changeMode ${from} -> ${to} is valid, keeps shared copy and reports the loss`, () => {
      const source = createContentV2(from);
      const next = changeMode(source, to);
      assert.deepEqual(errorsOf(next), []);
      assert.equal(next.trip.mode, to);
      assert.equal(next.trip.title, source.trip.title);
      assert.equal(next.summary, source.summary);
      assert.deepEqual(next.included, source.included);
      assert.deepEqual(next.whatToBring, source.whatToBring);
      assert.deepEqual(next.localTips, source.localTips);
      assert.deepEqual(next.guide, source.guide);
      assert.equal(next.days.length, to === 'destination_guide' ? 0 : to === 'multi_day' ? 2 : 1);
      assert.equal(next.places.length, from === to ? source.places.length : 0);
      assert.deepEqual(next.days.map((day) => day.dayNumber), next.days.map((_, index) => index + 1));
      assert.deepEqual(hasModeLoss(source, to), EXPECTED_LOSS[`${from}>${to}`]);
      assert.equal(source.trip.mode, from, 'source is not mutated');
    });
  }
}

test('4b. leaving the guide keeps the places count in the loss message only; pickup shows up when offered', () => {
  const source = createContentV2('full_day');
  source.pickup = { offered: true, area: 'A', time: '07:00', dropoffNote: null };
  assert.ok(hasModeLoss(source, 'destination_guide').includes('penjemputan'));
  const next = changeMode(source, 'destination_guide');
  assert.deepEqual(next.pickup, { offered: false, area: null, time: null, dropoffNote: null });
  assert.deepEqual(errorsOf(next), []);
  const blank = createContentV2('destination_guide');
  blank.places = [makePlace()];
  assert.deepEqual(hasModeLoss(blank, 'full_day'), [], 'an empty place is not reported as lost data');
});

test('5. model helpers normalise blanks, photos, hotels and meals', () => {
  const content = createContentV2('multi_day');
  content.trip.region = '  '; content.meeting.note = ''; content.policies = ' ';
  content.days[0].location = ''; content.days[0].activities[0].durationMinutes = 0; content.days[0].activities[1].durationMinutes = 45;
  content.days[0].activities[0].place = ' '; content.days[0].hotel = { name: '', area: ' ', note: '' };
  const normalized = normalizeBlanks(content);
  assert.equal(normalized.trip.region, null);
  assert.equal(normalized.meeting.note, null);
  assert.equal(normalized.policies, null);
  assert.equal(normalized.days[0].location, null);
  assert.equal(normalized.days[0].activities[0].durationMinutes, null);
  assert.equal(normalized.days[0].activities[1].durationMinutes, 45);
  assert.equal(normalized.days[0].activities[0].place, null);
  assert.equal(normalized.days[0].hotel, null);
  assert.equal(content.trip.region, '  ', 'input is not mutated');
  assert.equal(blankToNull('x'), 'x');
  const listed = createContentV2('full_day');
  listed.included = ['Local guide', '', '   ', ' Entrance fee '];
  listed.notIncluded = ['  '];
  listed.whatToBring = [];
  listed.localTips = ['', 'Carry change'];
  listed.notSuitableFor = [' '];
  listed.notAllowed = [];
  listed.places = [];
  listed.emergencyContacts = [{ label: '', value: '' }, { label: 'Police', value: '' }, { label: '', value: '110' }, { label: ' ', value: ' ' }];
  const tidied = normalizeBlanks(listed);
  assert.deepEqual(tidied.included, ['Local guide', ' Entrance fee '], 'kept text is not trimmed');
  assert.deepEqual(tidied.notIncluded, []);
  assert.deepEqual(tidied.localTips, ['Carry change']);
  assert.deepEqual(tidied.notSuitableFor, []);
  assert.deepEqual(tidied.emergencyContacts, [{ label: 'Police', value: '' }, { label: '', value: '110' }], 'contacts with one side filled are kept');
  const withTips = createContentV2('destination_guide');
  withTips.places = [{ ...withTips.places[0], tips: ['  ', 'Wear shoes'] }];
  assert.deepEqual(normalizeBlanks(withTips).places[0].tips, ['Wear shoes']);

  assert.equal(setPhotoCredit(null, 'photographer', 'P'), null);
  const photo: Photo = { assetId: 'a1', credit: null };
  const withCredit = setPhotoCredit(photo, 'photographer', 'P');
  assert.equal(withCredit?.credit?.photographer, 'P');
  assert.equal(setPhotoCredit(withCredit, 'photographer', '')?.credit, null);
  assert.equal(normalizeHotel('', null, null), null);
  assert.deepEqual(normalizeHotel('', 'Area', ''), { name: '', area: 'Area', note: null });
  const day = makeDay('half_day', 1);
  assert.equal(day.meals, null);
  assert.deepEqual(ensureMeals(day).meals, { breakfast: false, lunch: false, dinner: false });
});

test('5b. targetIdFor maps an indexed path to the stable ID of its activity, day or place', () => {
  const trip = createContentV2('multi_day');
  assert.equal(targetIdFor(trip, 'days[1].activities[0].time'), trip.days[1].activities[0].id);
  assert.equal(targetIdFor(trip, 'days[1].activities[1].title'), trip.days[1].activities[1].id);
  assert.equal(targetIdFor(trip, 'days[0].hotel.name'), trip.days[0].id);
  const guide = createContentV2('destination_guide');
  assert.equal(targetIdFor(guide, 'places[1].tips[0]'), guide.places[1].id);
  assert.equal(targetIdFor(guide, 'places[9].name'), undefined, 'out-of-range index has no target');
  assert.equal(targetIdFor(trip, 'meeting.mapsUrl'), undefined);
  assert.equal(targetIdFor(trip, 'emergencyContacts[0].value'), undefined);
});

test('5c. the language field is a dropdown of the six content languages plus auto; no free text', () => {
  const content = createContentV2('full_day');
  const html = renderToStaticMarkup(React.createElement(EditorForm, editorProps('full_day', content)));
  const langField = html.match(/<(select|input)[^>]*data-field-path="trip\.language"[^>]*>/)?.[0] ?? '';
  assert.match(langField, /^<select/, 'trip.language is a select');
  for (const value of ['auto', 'id', 'en', 'fr', 'ja', 'zh-Hans', 'la']) assert.ok(html.includes(`value="${value}"`), `option ${value}`);
  const unsupported = { ...content, trip: { ...content.trip, language: 'inggris' } };
  const badProps = { ...editorProps('full_day', unsupported), localeInput: 'inggris' };
  const bad = renderToStaticMarkup(React.createElement(EditorForm, badProps));
  assert.ok(bad.includes('Bahasa tidak didukung: inggris'), 'an unsupported stored tag is shown, not hidden');
  assert.ok(!bad.includes('list="'), 'no datalist text input');
});

test('5d. the guide picker lists profile guides; a photo field offers upload', () => {
  const guides = [{ id: '40000000-0000-5000-8000-000000000001', name: 'Made', phone: '+62-000' }];
  const html = renderToStaticMarkup(React.createElement(EditorForm, { ...editorProps('full_day', createContentV2('full_day')), guides }));
  assert.ok(html.includes('Pilih guide'), 'picker shown when guides exist');
  assert.ok(html.includes('value="40000000-0000-5000-8000-000000000001"'), 'guide option has its id');
  assert.ok(html.includes('Unggah foto'), 'photo field has an upload action when a handler is given');
  const noGuides = renderToStaticMarkup(React.createElement(EditorForm, { ...editorProps('full_day', createContentV2('full_day')), guides: [] }));
  assert.ok(!noGuides.includes('Pilih guide'), 'no picker without guides; name and phone fields shown');
  assert.ok(noGuides.includes('data-field-path="guide.name"'));
});

test('5e. OTA option lists exist for id and en with matching counts and pass the preview content guards', async () => {
  const { readFileSync } = await import('node:fs');
  const options = JSON.parse(readFileSync('config/web/practical-options.json', 'utf8')) as { locales: Record<string, Record<string, string[]>> };
  const groups = ['included', 'notIncluded', 'whatToBring', 'notSuitableFor', 'notAllowed', 'localTips', 'policies'];
  for (const group of groups) assert.equal(options.locales.id[group].length, options.locales.en[group].length, `parity for ${group}`);
  const preview = readFileSync('src/server/preview.ts', 'utf8');
  const guards = ['moneyClaim', 'openingClaim', 'promotionalClaim'].map((name) => {
    const literal = new RegExp(`const ${name} = (/.*/[a-z]*);`).exec(preview)![1];
    const end = literal.lastIndexOf('/');
    return new RegExp(literal.slice(1, end), literal.slice(end + 1));
  });
  for (const locale of ['id', 'en']) for (const group of groups) for (const text of options.locales[locale][group])
    assert.ok(!guards.some((guard) => guard.test(text)), `${locale}/${group}: "${text}" matches a publish guard`);
});

test('5f. policy options add and remove exact lines and leave other text alone', async () => {
  const { policyLines } = await import('../../src/editor/sections/PolicyOptions.js');
  assert.deepEqual(policyLines('A' + String.fromCharCode(10) + String.fromCharCode(10) + 'B' + String.fromCharCode(10) + '  '), ['A', 'B']);
  assert.deepEqual(policyLines(null), []);
});

test('5g. publish issues map to Indonesian messages, wizard steps per mode, and one visible step at a time', async () => {
  const { publishIssues, stepsFor, stepFor } = await import('../../src/editor/validation.js');
  const empty = createContentV2('full_day');
  empty.trip.title = ''; empty.trip.language = null; empty.days[0].activities[0].title = '';
  const issues = publishIssues(empty);
  const titleIssue = issues.find((issue) => issue.path === 'trip.title');
  assert.ok(titleIssue, 'title is required before publish');
  assert.equal(titleIssue!.step, 'info');
  assert.equal(titleIssue!.message, 'Wajib diisi sebelum publish.');
  const activityIssue = issues.find((issue) => issue.path === 'days[0].activities[0].title');
  assert.equal(activityIssue!.key.split('|')[0], empty.days[0].activities[0].id, 'activity issues carry the stable activity id');
  assert.equal(stepFor('places[1].name'), 'plan');
  assert.equal(stepFor('emergencyContacts[0].value'), 'practical');
  assert.deepEqual(stepsFor('destination_guide'), ['info', 'guide', 'summary', 'plan', 'practical', 'terms', 'ai', 'publish']);
  assert.ok(stepsFor('full_day').includes('time'));
  assert.deepEqual(publishIssues(createContentV2('full_day')), [], 'a complete fixture has no issues');
  const html = renderToStaticMarkup(React.createElement(EditorForm, { ...editorProps('full_day', createContentV2('full_day')), activeStep: 'summary' }));
  const visible = [...html.matchAll(/<div data-step="([a-z]+)"( hidden="")?/g)].filter((match) => !match[2]).map((match) => match[1]);
  assert.deepEqual(visible, ['summary'], 'only the active step is visible');
  assert.ok(html.includes('data-step="info" hidden=""'), 'hidden steps stay mounted');
});

test('5h. a missing required field is marked red with its message, scoped to the right activity', async () => {
  const { IssuesContext } = await import('../../src/editor/issues.js');
  const content = createContentV2('multi_day');
  const target = content.days[1].activities[0];
  const messages = new Map([['|trip.title', 'Wajib diisi sebelum publish.'], [`${target.id}|days[].activities[].title`, 'Wajib diisi sebelum publish.']]);
  const api = { issueFor: (key: string) => messages.get(key) ?? null, touch: () => {} };
  const html = renderToStaticMarkup(React.createElement(IssuesContext.Provider, { value: api }, React.createElement(EditorForm, editorProps('multi_day', content))));
  assert.equal((html.match(/aria-invalid="true"/g) ?? []).length, 2, 'exactly the two flagged fields are invalid');
  assert.equal((html.match(/Wajib diisi sebelum publish\./g) ?? []).length, 2);
  const flagged = [...html.matchAll(/<input[^>]*id="([^"]*)"[^>]*aria-invalid="true"/g)].map((match) => match[1]);
  assert.ok(flagged.some((id) => id.endsWith(`activity-title-${target.id}`)), 'the flagged activity is the second day first activity');
  assert.ok(!flagged.some((id) => id.includes(content.days[0].activities[0].id)), 'the same field on another activity is not flagged');
  const clean = renderToStaticMarkup(React.createElement(EditorForm, editorProps('multi_day', content)));
  assert.ok(!clean.includes('aria-invalid="true"'), 'no issues without a provider');
});

test('5i. place autocomplete: Maps link keeps the place ID, language maps to supported tags only, combobox markup is accessible', async () => {
  const { mapsUrlFor, placeLanguageOf, PlaceAutocomplete } = await import('../../src/editor/fields/PlaceAutocomplete.js');
  const url = new URL(mapsUrlFor({ placeId: 'ChIJ abc', mainText: 'Ubud Palace', secondaryText: 'Ubud, Bali' }, 'google'));
  assert.equal(url.origin + url.pathname, 'https://www.google.com/maps/search/');
  assert.equal(url.searchParams.get('api'), '1');
  assert.equal(url.searchParams.get('query'), 'Ubud Palace, Ubud, Bali');
  assert.equal(url.searchParams.get('query_place_id'), 'ChIJ abc');
  assert.equal(new URL(mapsUrlFor({ placeId: 'P', mainText: 'Ubud', secondaryText: '' }, 'google')).searchParams.get('query'), 'Ubud');
  const osm = new URL(mapsUrlFor({ placeId: 'W260605192', mainText: 'Kuta Beach', secondaryText: 'Kuta, Bali' }, 'osm'));
  assert.equal(osm.searchParams.get('query'), 'Kuta Beach, Kuta, Bali');
  assert.equal(osm.searchParams.has('query_place_id'), false, 'an OpenStreetMap ID is not a Google place ID');
  assert.equal(placeLanguageOf('auto'), null);
  assert.equal(placeLanguageOf(null), null);
  assert.equal(placeLanguageOf('zh-Hans'), 'zh-Hans');
  assert.equal(placeLanguageOf('xx'), null);
  const meta: FieldMeta = { path: 'meeting.place', labelKey: 'meeting.place', label: 'Tempat', control: 'text', required: false, applies: true, maxLength: 160 };
  const markup = renderToStaticMarkup(React.createElement(PlaceAutocomplete, { id: 'p1', meta, value: 'Ubud', onChange: () => {}, languageCode: null }));
  assert.match(markup, /role="combobox"/);
  assert.match(markup, /aria-autocomplete="list"/);
  assert.match(markup, /aria-expanded="false"/);
  assert.doesNotMatch(markup, /role="listbox"/);
  assert.match(markup, /data-field-path="meeting.place"/);
});

test('6. reordering keeps stable IDs and does not mutate the input', () => {
  const rows = [makeActivity(), makeActivity(), makeActivity()];
  const ids = rows.map((row) => row.id);
  assert.deepEqual(moveById(rows, ids[1], -1).map((row) => row.id), [ids[1], ids[0], ids[2]]);
  assert.deepEqual(rows.map((row) => row.id), ids);
  assert.deepEqual(moveById(rows, 'missing', 1), rows);
  const names = [{ name: 'included' }, { name: 'not included' }, { name: 'bring' }];
  assert.deepEqual(moveIndex(names, 2, -1).map((row) => row.name), ['included', 'bring', 'not included']);
  assert.deepEqual(names.map((row) => row.name), ['included', 'not included', 'bring']);
  assert.deepEqual(moveIndex(names, 0, -1), names);
});

test('7. old developer-style status copy is gone and the plain-language copy is present', () => {
  const sources = listFiles('src/editor').filter((file) => /\.(ts|tsx)$/.test(file)).map((file) => readFileSync(file, 'utf8'));
  const oldCopy = ['pilihan auto belum di-resolve', 'Usage diperiksa saat preflight', 'Key tidak dikirim ke browser', 'asset ID disimpan di draft', 'Hero memakai gradien', 'Manual edit tetap tersedia'];
  for (const phrase of oldCopy) assert.ok(!sources.some((source) => source.includes(phrase)), `still present: ${phrase}`);
  const labels = readFileSync('src/editor/labels.ts', 'utf8');
  const newCopy = [
    "Bahasa belum dipilih. Pilih bahasa atau klik 'Deteksi otomatis'. Teks Anda tidak akan diterjemahkan.",
    'AI belum aktif: kunci API belum diatur di server. Semua field tetap bisa diisi manual.',
    'Model: GPT-6 Luna', '1 foto tersedia.',
    'Belum ada foto sampul — halaman memakai warna tema.',
    'Simpan draft dan pilih bahasa dulu untuk memakai AI.'
  ];
  for (const phrase of newCopy) assert.ok(labels.includes(phrase), `missing: ${phrase}`);
});
