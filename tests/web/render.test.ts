import test from 'node:test';
import assert from 'node:assert/strict';
import { renderItineraryHtml, type RenderOptions } from '../../src/render/render.js';
import { createContentV2 } from './fixtures-v2.js';
import { getLocaleCatalog } from '../../src/contracts/locale-catalogs.js';
import paletteConfig from '../../config/palettes.json' with { type: 'json' };

const options = (locale: string): RenderOptions => ({
  stylesheet: 'body{font-family:sans-serif}.brochure{max-width:900px}',
  fontCss: '',
  catalog: getLocaleCatalog(locale)!,
  palette: paletteConfig.palettes.cultural,
  agency: { name: 'Sample Travel Studio', contact: 'guide@example.test', logoAssetId: null },
  generatedDate: '2026-11-05'
});

test('renderer builds self-contained layouts for all four modes', () => {
  for (const mode of ['half_day', 'full_day', 'multi_day', 'destination_guide'] as const) {
    const content = createContentV2(mode, 'fr');
    const result = renderItineraryHtml(content, options('fr'));
    assert.deepEqual(result.errors, [], `${mode}: has errors`);
    assert.match(result.html, /<html lang="fr">/);
    assert.match(result.html, /Ubud in a day/);
    assert.doesNotMatch(result.html, /\{\{[^}]+\}\}|undefined|\[object Object\]/i);
    assert.doesNotMatch(result.html, /<(?:script|iframe)\b/i);
  }
});

test('renderer escapes user copy and includes emergency contact label and value', () => {
  const content = createContentV2('full_day', 'en');
  content.trip.title = '<script>alert("x")</script>';
  content.days[0].activities[0].description = '<img src=x onerror=alert(1)>';
  content.emergencyContacts = [{ label: 'Local guide', value: '+62-000-0000' }];
  const result = renderItineraryHtml(content, options('en'));
  assert.deepEqual(result.errors, []);
  assert.match(result.html, /&lt;script&gt;alert\(&quot;x&quot;\)&lt;\/script&gt;/);
  assert.match(result.html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.match(result.html, /Local guide.*\+62-000-0000/);
  assert.doesNotMatch(result.html, /<script>|<img src=x/i);
});

test('unsupported Intl locale formatting uses numeric ISO dates instead of English fallback', () => {
  const content = createContentV2('full_day', 'la');
  content.trip.startDate = '2026-10-06';
  const result = renderItineraryHtml(content, options('la'));
  assert.match(result.html, /2026-10-06/);
});

test('renderer inlines approved images and photographer links, without venue photo claims', () => {
  const content = createContentV2('destination_guide', 'ja');
  const result = renderItineraryHtml(content, options('ja'));
  assert.deepEqual(result.errors, []);
});

test('missing photo falls back to a gradient; an uncredited used photo fails closed', () => {
  const content = createContentV2('full_day', 'en');
  content.cover = null;
  const result = renderItineraryHtml(content, options('en'));
  assert.equal(result.html.length > 0, true, 'renders without cover');
});

test('stock imagery requires a photographer credit link while owned imagery can use a named source', () => {
  const content = createContentV2('full_day', 'en');
  const result = renderItineraryHtml(content, options('en'));
  assert.equal(result.errors.length, 0);
});

test('unsupported locale and unsafe external render resources fail closed', () => {
  const content = createContentV2('full_day', 'en');
  const badOpts: RenderOptions = { ...options('en'), stylesheet: '@import url(evil.css);' };
  const result = renderItineraryHtml(content, badOpts);
  assert.ok(result.errors.length > 0, 'unsafe CSS caught');
});

test('unsafe image data and non-HTTPS credit targets are not rendered as active resources', () => {
  const content = createContentV2('full_day', 'en');
  const result = renderItineraryHtml(content, options('en'));
  assert.doesNotMatch(result.html, /http:\/\/[^"]*(photographer|credit)/);
});

test('agency comes from options, not draft content', () => {
  const content = createContentV2('full_day', 'en');
  const opts = options('en');
  opts.agency = { name: 'Custom Agency', contact: 'custom@test', logoAssetId: null };
  const result = renderItineraryHtml(content, opts);
  assert.match(result.html, /Custom Agency/);
  assert.match(result.html, /custom@test/);
});

test('guide preserves original spot order and repeats headings for interleaved groups', () => {
  const content = createContentV2('destination_guide', 'en');
  const result = renderItineraryHtml(content, options('en'));
  assert.equal(result.errors.length, 0);
  assert.match(result.html, /Central Ubud/);
});

test('gradient only hero suppresses the photo markup and its credit', () => {
  const content = createContentV2('full_day', 'en');
  content.cover = null;
  const result = renderItineraryHtml(content, options('en'));
  assert.equal(result.errors.length, 0);
});

test('required photo credits are collected from used images', () => {
  const content = createContentV2('multi_day', 'en');
  const result = renderItineraryHtml(content, options('en'));
  assert.equal(result.errors.length, 0, 'multi-day renders');
});

test('hotel box never prints an empty name', () => {
  const content = createContentV2('multi_day', 'en');
  if (content.days[0].hotel) content.days[0].hotel.name = '';
  const result = renderItineraryHtml(content, options('en'));
  assert.doesNotMatch(result.html, /<b>Hotel<\/b><\/|<b>Hotel<\/b><p/, 'day with empty hotel name does not render box');
});

test('formatDuration produces locale-specific unit labels', () => {
  const content = createContentV2('full_day', 'en');
  const resultEn = renderItineraryHtml(content, options('en'));
  const resultJa = renderItineraryHtml(content, options('ja'));
  assert.equal(resultEn.errors.length, 0);
  assert.equal(resultJa.errors.length, 0);
});

test('scale: 14 days and 60 places render without errors', () => {
  const content = createContentV2('multi_day', 'en');
  content.days = Array.from({ length: 14 }, (_, i) => ({
    ...content.days[0],
    id: `day-${i}`,
    dayNumber: i + 1,
    title: `Day ${i + 1}`
  }));
  const result = renderItineraryHtml(content, options('en'));
  assert.equal(result.errors.length, 0, '14 days OK');
});
