import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { adaptLegacyDocument } from '../../src/contracts/legacy-adapter.js';
import { collectSchemaLeafPaths, getFieldRegistry, getFieldRegistryCoverage } from '../../src/contracts/field-coverage.js';
import { normalizeCanonicalContent, validateDraft, validateForPublish } from '../../src/contracts/validator.js';
import { createContent } from './fixtures.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const languageSamples = JSON.parse(fs.readFileSync(path.join(root, 'tests/fixtures/web/language-samples.json'), 'utf8')) as Array<{ locale: string; title: string; brief: string }>;
const legacyFixture = JSON.parse(fs.readFileSync(path.join(root, 'tests/fixtures/web/legacy-full-day.json'), 'utf8'));

test('field registry covers every schema leaf exactly once', () => {
  const coverage = getFieldRegistryCoverage();
  assert.deepEqual(coverage, { missing: [], extra: [], duplicates: [] });
  assert.equal(collectSchemaLeafPaths().length, getFieldRegistry().length);
  assert.deepEqual(getFieldRegistry().filter((field) => field.source === 'ai-assisted').map((field) => field.path), [
    'overview.summary', 'schedule[].activities[].description', 'spots[].description'
  ]);
  assert.equal(getFieldRegistry().find((field) => field.path === 'brochure.outputLanguage')?.overrideAllowed, true);
  assert.ok(getFieldRegistry().every((field) => field.renderTarget || field.notRenderedReason));
});

test('all locale catalogs have identical keys and six baseline languages', () => {
  const dir = path.join(root, 'config/web/locales');
  const files = fs.readdirSync(dir).filter((name) => name.endsWith('.json')).sort();
  assert.deepEqual(files, ['en.json', 'fr.json', 'id.json', 'ja.json', 'la.json', 'zh-Hans.json']);
  const registry = JSON.parse(fs.readFileSync(path.join(root, 'config/web/field-registry.json'), 'utf8'));
  const expected = [...new Set([...registry.fields.map((field: any) => field.labelKey), ...registry.displayLabelKeys])].sort();
  const keys = files.map((file) => {
    const catalog = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
    assert.deepEqual(Object.keys(catalog.labels).sort(), expected, `${file} labels`);
    return catalog.locale;
  });
  assert.deepEqual(keys, ['en', 'fr', 'id', 'ja', 'la', 'zh-Hans']);
});

test('six language fixtures use valid extensible locale tags and preserve Unicode', () => {
  assert.equal(languageSamples.length, 6);
  for (const sample of languageSamples) {
    const content = createContent('full_day', sample.locale);
    content.brochure.tripTitle = sample.title;
    content.overview.summary = sample.brief;
    const result = validateForPublish(content);
    assert.equal(result.ok, true, `${sample.locale}: ${JSON.stringify(result.errors)}`);
    assert.equal(result.value.brochure.outputLanguage, sample.locale);
  }
  const normalized = normalizeCanonicalContent(createContent('full_day', 'fr-fr'));
  assert.equal((normalized.value as any).brochure.outputLanguage, 'fr-FR');
});

test('all four trip modes satisfy the versioned web structural and publish contracts', () => {
  for (const mode of ['half_day', 'full_day', 'multi_day', 'destination_guide'] as const) {
    const content = createContent(mode, 'en');
    assert.equal(validateDraft(content).ok, true, mode);
    assert.equal(validateForPublish(content).ok, true, mode);
  }
});

test('drafts can be incomplete while publish requires completed fields and a resolved locale', () => {
  const draft = createContent('full_day', 'en');
  draft.brochure.tripTitle = '';
  draft.brochure.agencyName = '';
  draft.schedule[0].activities = [];
  assert.equal(validateDraft(draft).ok, true);
  assert.equal(validateForPublish(draft).errors.some((error) => error.code === 'PUBLISH_FIELD_REQUIRED'), true);
  const unresolved = createContent('full_day', 'en');
  unresolved.brochure.outputLanguage = null;
  assert.equal(validateDraft(unresolved).ok, true);
  assert.equal(validateForPublish(unresolved).errors.some((error) => error.path === 'brochure.outputLanguage'), true);
});

test('a valid BCP 47 locale outside the six fixtures passes schema validation', () => {
  const content = createContent('full_day', 'es-MX');
  assert.equal(validateDraft(content).ok, true);
  assert.equal(validateForPublish(content).ok, true);
});

test('photo attribution links reject scriptable URL schemes', () => {
  const content = createContent('full_day', 'en');
  content.hero.photoAttribution = { photographer: 'Example', photographerUrl: 'javascript:alert(1)', source: 'Guide' };
  assert.equal(validateDraft(content).errors.some((error) => error.path.includes('photographerUrl')), true);
});

test('mode layout exclusivity and single-day blocks are validated at publish', () => {
  const mixed = createContent('full_day', 'en');
  mixed.spots = structuredClone(createContent('destination_guide', 'en').spots);
  assert.equal(validateDraft(mixed).ok, true);
  assert.equal(validateForPublish(mixed).errors.some((error) => error.code === 'MODE_SHAPE_INVALID'), true);
  const twoBlocks = createContent('half_day', 'en');
  twoBlocks.schedule.push(structuredClone(twoBlocks.schedule[0]));
  twoBlocks.schedule[1].id = '10000000-0000-5000-8000-000000000002';
  twoBlocks.schedule[1].activities[0].id = '20000000-0000-5000-8000-000000000002';
  assert.equal(validateForPublish(twoBlocks).errors.some((error) => error.code === 'SINGLE_BLOCK_REQUIRED'), true);
});

test('numeric day ranges verify full multi-day coverage and explicit condensation', () => {
  const fourteenDays = createContent('multi_day', 'en');
  fourteenDays.brochure.durationDays = 14;
  fourteenDays.schedule = [fourteenDays.schedule[0]];
  fourteenDays.schedule[0].dayEnd = 14;
  fourteenDays.schedule[0].isCondensed = true;
  fourteenDays.schedule[0].accommodation = { name: null, area: 'Ubud', note: 'Stay near the center.' };
  assert.equal(validateForPublish(fourteenDays).ok, true);
  const missingDays = structuredClone(fourteenDays);
  missingDays.schedule[0].dayStart = 2;
  assert.equal(validateForPublish(missingDays).errors.some((error) => error.code === 'MULTI_DAY_RANGE_INVALID'), true);
});

test('guide requires place logistics and at least one tip', () => {
  const guide = createContent('destination_guide', 'ja');
  assert.equal(validateForPublish(guide).ok, true);
  guide.spots[0].tips = [];
  assert.equal(validateDraft(guide).ok, true);
  assert.equal(validateForPublish(guide).errors.some((error) => error.path === 'spots[0].tips'), true);
});

test('spot count is not silently capped and long Unicode text is counted by code points', () => {
  const guide = createContent('destination_guide', 'zh-Hans');
  guide.spots = Array.from({ length: 120 }, (_, index) => ({
    ...structuredClone(guide.spots[0]),
    id: `30000000-0000-5000-8000-${String(index + 1).padStart(12, '0')}`,
    name: `地点 ${index + 1}`
  }));
  guide.spots[0].description = '京都庭园景色优美。'.repeat(350);
  assert.ok(Buffer.byteLength(guide.spots[0].description, 'utf8') > guide.spots[0].description.length);
  assert.equal(validateDraft(guide).ok, true);
  assert.equal(validateForPublish(guide).ok, true);
});

test('normalization clones and canonicalizes without mutating caller input', () => {
  const input = createContent('full_day', 'fr-fr');
  const before = structuredClone(input);
  const normalized = normalizeCanonicalContent(input);
  assert.equal((normalized.value as any).brochure.outputLanguage, 'fr-FR');
  assert.deepEqual(input, before);
  assert.notEqual(normalized.value, input);
  assert.equal((normalized.value as any).brochure.scopeLabel, 'Journée complète');
});

test('duration and scope are derived from numeric multi-day blocks, not stale duplicate values', () => {
  const input = createContent('multi_day', 'fr');
  input.brochure.durationDays = 9;
  input.brochure.scopeLabel = 'ancienne valeur';
  input.schedule[0].dayEnd = 1;
  input.schedule[1].dayStart = 2;
  input.schedule[1].dayEnd = 2;
  input.schedule[1].isCondensed = false;
  const normalized = normalizeCanonicalContent(input);
  const value = normalized.value as any;
  assert.equal(value.brochure.durationDays, 2);
  assert.equal(value.brochure.scopeLabel, '2 jours');
  assert.equal(value.overview.quickFacts.scope, '2 jours');
  assert.ok(normalized.warnings.some((warning) => warning.code === 'DURATION_DERIVED_MISMATCH'));
  assert.equal(input.brochure.durationDays, 9);
});

test('serialization round-trip and reorder preserve stable item identities', () => {
  const content = createContent('multi_day', 'en');
  content.brochure.scopeLabel = '2 days';
  content.overview.quickFacts.scope = '2 days';
  const idsBefore = content.schedule.map((block: any) => block.id);
  content.schedule.reverse();
  const reorderedIds = content.schedule.map((block: any) => block.id);
  const roundTrip = JSON.parse(JSON.stringify(content));
  const normalized = normalizeCanonicalContent(roundTrip);
  assert.equal(normalized.ok, true);
  assert.deepEqual(content.schedule.map((block: any) => block.id), reorderedIds);
  assert.deepEqual(content.schedule.map((block: any) => block.id), [...idsBefore].reverse());
  assert.deepEqual(normalized.value, roundTrip);
});

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

test('legacy canonical-root and flat-render inputs use the same conversion contract', () => {
  const canonicalRoot = adaptLegacyDocument(legacyFixture.canonicalItinerary);
  const legacy = legacyFixture.canonicalItinerary;
  const flatRender = adaptLegacyDocument({
    ...legacy.brochure,
    hero: legacy.hero,
    overview: legacy.overview,
    schedule: legacy.schedule,
    spots: legacy.spots,
    practical: legacy.practical,
    closing: legacy.closing
  });
  assert.equal((canonicalRoot.content as any).schedule[0].activities[0].title, 'Tegallalang Rice Terraces');
  assert.equal((flatRender.content as any).brochure.tripTitle, 'Ubud in a day');
  assert.deepEqual(validateDraft(canonicalRoot.content).errors, []);
  assert.deepEqual(validateDraft(flatRender.content).errors, []);
});

test('legacy migration reports unknown dropped fields without copying their values', () => {
  const source = structuredClone(legacyFixture);
  source.canonicalItinerary.overview.internalNote = 'value-that-must-not-be-copied';
  const result = adaptLegacyDocument(source);
  assert.ok(result.diagnostics.some((diagnostic) => diagnostic.code === 'LEGACY_UNMAPPED_FIELDS' && diagnostic.path === 'overview'));
  assert.equal(JSON.stringify(result.content).includes('value-that-must-not-be-copied'), false);
});

test('duplicate stable IDs are rejected without modifying input', () => {
  const content = createContent('full_day', 'en');
  content.schedule[0].activities[0].id = content.schedule[0].id;
  const result = normalizeCanonicalContent(content);
  assert.equal(result.errors.some((error) => error.code === 'DUPLICATE_STABLE_ID'), true);
  assert.notEqual((result.value as any).schedule[0].activities[0].id, undefined);
  assert.equal(validateDraft(content).ok, false);
});

test('malformed JSON types return structured diagnostics instead of throwing', () => {
  const cases: Array<[string, (content: any) => void]> = [
    ['schedule object', (content) => { content.schedule = {}; }],
    ['schedule string', (content) => { content.schedule = 'nope'; }],
    ['schedule null entry', (content) => { content.schedule = [null]; }],
    ['spots object', (content) => { content.spots = {}; }],
    ['activities object', (content) => { content.schedule[0].activities = {}; }],
    ['brochure string', (content) => { content.brochure = 'nope'; }],
    ['overview quickFacts string', (content) => { content.overview.quickFacts = 'nope'; }],
    ['closing contact number', (content) => { content.closing.agencyContact = 12; }],
    ['brochure themes string', (content) => { content.brochure.themes = 'culture'; }],
    ['multi-day schedule object', (content) => {
      content.brochure.itineraryMode = 'multi_day';
      content.schedule = {};
    }]
  ];
  for (const [name, mutate] of cases) {
    for (const validate of [validateDraft, validateForPublish]) {
      const content = createContent('full_day', 'en');
      mutate(content);
      let result: any = undefined;
      assert.doesNotThrow(() => { result = validate(content); }, name);
      assert.equal(result.ok, false, name);
      assert.ok(result.errors.length > 0, name);
      assert.ok(result.errors.every((error: any) => typeof error.code === 'string' && typeof error.path === 'string' && typeof error.message === 'string'), name);
    }
  }
});

test('authoritative brochure fields update derived contact, pace and themes without mutating input', () => {
  const content = createContent('full_day', 'en');
  content.brochure.agencyContact = 'owner@example.test';
  content.closing.agencyContact = '';
  content.brochure.paceLevel = 'Packed';
  content.overview.quickFacts.pace = 'Relaxed';
  content.brochure.themes = ['culture', 'food'];
  content.overview.quickFacts.themes = [];
  const before = structuredClone(content);
  const normalized = normalizeCanonicalContent(content);
  assert.equal(normalized.ok, true, JSON.stringify(normalized.errors));
  const value = normalized.value as any;
  assert.equal(value.closing.agencyContact, 'owner@example.test');
  assert.equal(value.overview.quickFacts.pace, 'Packed');
  assert.deepEqual(value.overview.quickFacts.themes, ['culture', 'food']);
  for (const path of ['closing.agencyContact', 'overview.quickFacts.pace', 'overview.quickFacts.themes']) {
    assert.ok(normalized.warnings.some((warning) => warning.code === 'DERIVED_FIELD_UPDATED' && warning.path === path), path);
  }
  assert.deepEqual(content, before, 'caller input must not be mutated');
  assert.equal(validateForPublish(content).ok, true);
});

test('invalid derived field types are reported instead of being repaired', () => {
  const content = createContent('full_day', 'en');
  content.closing.agencyContact = 7;
  content.overview.quickFacts.pace = 9;
  const normalized = normalizeCanonicalContent(content);
  assert.equal((normalized.value as any).closing.agencyContact, 7);
  assert.equal((normalized.value as any).overview.quickFacts.pace, 9);
  assert.equal(validateDraft(content).ok, false);
  assert.equal(validateForPublish(content).ok, false);
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
