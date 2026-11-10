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
import { fieldLabels, pathLabels } from '../../src/editor/labels.js';
import { blankToNull, changeMode, ensureMeals, hasModeLoss, makeActivity, makeDay, makePlace, moveById, moveIndex, normalizeBlanks, normalizeHotel, setPhotoCredit } from '../../src/editor/model.js';
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
    aiAction: () => null, writing: { brief: '', notes: [] }, onWritingChange: noop, aiAssistExtra: null
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
  content.included = ['a']; content.notIncluded = ['b']; content.whatToBring = ['c']; content.localTips = ['d']; content.healthSafety = ['e'];
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
