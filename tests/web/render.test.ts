import test from 'node:test';
import assert from 'node:assert/strict';
import { renderItineraryHtml, type RenderOptions } from '../../src/render/render.js';
import { createContent } from './fixtures.js';
import { getLocaleCatalog } from '../../src/contracts/locale-catalogs.js';
import paletteConfig from '../../config/palettes.json' with { type: 'json' };

const options = (locale: string): RenderOptions => ({
  stylesheet: 'body{font-family:sans-serif}.brochure{max-width:900px}',
  fontCss: '',
  catalog: getLocaleCatalog(locale)!,
  palette: paletteConfig.palettes.cultural
});

test('renderer builds self-contained layouts for all four modes', () => {
  for (const mode of ['half_day', 'full_day', 'multi_day', 'destination_guide'] as const) {
    const content = createContent(mode, 'fr');
    const result = renderItineraryHtml(content, options('fr'));
    assert.deepEqual(result.errors, [], mode);
    assert.match(result.html, /<html lang="fr">/);
    assert.match(result.html, /Ubud in a day/);
    assert.match(result.html, /Tegallalang Rice Terraces|Rice terraces/);
    assert.doesNotMatch(result.html, /\{\{[^}]+\}\}|undefined|\[object Object\]/i);
    assert.doesNotMatch(result.html, /<(?:script|iframe)\b/i);
  }
});

test('renderer escapes user copy and includes emergency contact label and value', () => {
  const content = createContent('full_day', 'en');
  content.brochure.tripTitle = '<script>alert("x")</script>';
  content.schedule[0].activities[0].description = '<img src=x onerror=alert(1)>';
  content.practical.emergencyContacts = [{ label: 'Local guide', value: '+62-000-0000' }];
  const result = renderItineraryHtml(content, options('en'));
  assert.deepEqual(result.errors, []);
  assert.match(result.html, /&lt;script&gt;alert\(&quot;x&quot;\)&lt;\/script&gt;/);
  assert.match(result.html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.match(result.html, /Local guide: \+62-000-0000/);
  assert.doesNotMatch(result.html, /<script>|<img src=x/i);
});

test('unsupported Intl locale formatting uses numeric ISO dates instead of English fallback', () => {
  const content = createContent('full_day', 'la');
  content.brochure.startDate = '2026-10-06';
  const result = renderItineraryHtml(content, options('la'));
  assert.match(result.html, /2026-10-06/);
  assert.doesNotMatch(result.html, /Oct 6, 2026/);
});

test('renderer inlines approved images and photographer links, without venue photo claims', () => {
  const content = createContent('destination_guide', 'ja');
  content.hero.assetId = 'hero-photo';
  content.hero.gradientOnly = false;
  content.hero.photoAttribution = { photographer: 'A. Photographer', photographerUrl: 'https://credits.example.test/a', source: 'Guide' };
  content.spots[0].assetId = 'region-photo';
  content.spots[0].photoAttribution = { photographer: 'B. Photographer', photographerUrl: 'https://credits.example.test/b', source: 'Guide' };
  const dataUri = 'data:image/png;base64,iVBORw0KGgo=';
  const result = renderItineraryHtml(content, { ...options('ja'), assets: {
    'hero-photo': { dataUri, mimeType: 'image/png' },
    'region-photo': { dataUri, mimeType: 'image/png' }
  } });
  assert.deepEqual(result.errors, []);
  assert.equal((result.html.match(/data:image\/png;base64,/g) || []).length, 2);
  assert.match(result.html, /href="https:\/\/credits\.example\.test\/a"/);
  assert.match(result.html, /alt="地域の写真"/);
  assert.match(result.html, /lang="ja"/);
});

test('missing photo falls back to a gradient; an uncredited used photo fails closed', () => {
  const missing = createContent('full_day', 'en');
  missing.hero.assetId = 'unavailable-photo';
  missing.hero.gradientOnly = false;
  missing.hero.photoAttribution = null;
  const fallback = renderItineraryHtml(missing, options('en'));
  assert.equal(fallback.html.length > 0, true);
  assert.ok(fallback.warnings.some((warning) => warning.code === 'RENDER_ASSET_MISSING'));

  const uncredited = createContent('full_day', 'en');
  uncredited.hero.assetId = 'hero-photo';
  uncredited.hero.gradientOnly = false;
  const result = renderItineraryHtml(uncredited, { ...options('en'), assets: {
    'hero-photo': { dataUri: 'data:image/png;base64,iVBORw0KGgo=', mimeType: 'image/png' }
  } });
  assert.equal(result.html, '');
  assert.ok(result.errors.some((error) => error.code === 'PHOTO_ATTRIBUTION_REQUIRED'));
});

test('stock imagery requires a photographer credit link while owned imagery can use a named source', () => {
  const content = createContent('full_day', 'en');
  content.hero.assetId = 'stock-photo';
  content.hero.gradientOnly = false;
  content.hero.photoAttribution = { photographer: 'Photographer', photographerUrl: null, source: 'Unsplash' };
  const result = renderItineraryHtml(content, { ...options('en'), assets: {
    'stock-photo': { dataUri: 'data:image/png;base64,iVBORw0KGgo=', mimeType: 'image/png' }
  } });
  assert.ok(result.errors.some((error) => error.code === 'PHOTO_ATTRIBUTION_REQUIRED'));
});

test('unsupported locale and unsafe external render resources fail closed', () => {
  const unsupported = renderItineraryHtml(createContent('full_day', 'es-MX'), { ...options('en'), catalog: null as any });
  assert.equal(unsupported.html, '');
  assert.ok(unsupported.errors.some((error) => error.code === 'LOCALE_UNSUPPORTED'));

  const externalCss = renderItineraryHtml(createContent('full_day', 'en'), {
    stylesheet: '@import url(https://example.test/style.css);',
    fontCss: '', catalog: options('en').catalog, palette: options('en').palette
  });
  assert.equal(externalCss.html, '');
  assert.ok(externalCss.errors.some((error) => error.code === 'RENDER_STYLES_INVALID'));
});

test('unsafe image data and non-HTTPS credit targets are not rendered as active resources', () => {
  const content = createContent('destination_guide', 'fr');
  content.hero.assetId = 'hero-photo';
  content.hero.gradientOnly = false;
  content.hero.photoAttribution = { photographer: 'Photographe', photographerUrl: 'http://credits.example.test/a', source: 'Guide' };
  const unsafe = renderItineraryHtml(content, { ...options('fr'), assets: {
    'hero-photo': { dataUri: 'data:image/svg+xml,<svg onload=alert(1)>', mimeType: 'image/png' }
  } });
  assert.equal(unsafe.html, '');
  assert.ok(unsafe.errors.some((error) => error.code === 'ASSET_INVALID'));
});

test('authoritative brochure contact and themes are rendered when derived copies are empty', () => {
  const content = createContent('full_day', 'en');
  content.brochure.agencyContact = 'owner@example.test';
  content.closing.agencyContact = '';
  content.brochure.themes = ['culture', 'food'];
  content.overview.quickFacts.themes = [];
  const result = renderItineraryHtml(content, options('en'));
  assert.deepEqual(result.errors, []);
  assert.match(result.html, /owner@example\.test/);
  assert.match(result.html, /culture · food/);
});

test('script incompatible, unknown and incomplete label catalogs fail closed', () => {
  const wrongScript = renderItineraryHtml(createContent('full_day', 'ja'), { ...options('ja'), catalog: getLocaleCatalog('zh-Hans')! });
  assert.equal(wrongScript.html, '');
  assert.ok(wrongScript.errors.some((error) => error.code === 'LOCALE_UNSUPPORTED'));

  const traditional = renderItineraryHtml(createContent('full_day', 'zh-Hant-TW'), { ...options('en'), catalog: null as any });
  assert.equal(traditional.html, '');
  assert.ok(traditional.errors.some((error) => error.code === 'LOCALE_UNSUPPORTED'));

  const simplifiedRegional = renderItineraryHtml(createContent('full_day', 'zh-Hans-CN'), { ...options('zh-Hans-CN') });
  assert.deepEqual(simplifiedRegional.errors, []);

  const complete = getLocaleCatalog('en')!;
  const incomplete = { ...complete, labels: { ...complete.labels, modeFullDay: '' } };
  const missingLabels = renderItineraryHtml(createContent('full_day', 'en'), { ...options('en'), catalog: incomplete as any });
  assert.equal(missingLabels.html, '');
  assert.ok(missingLabels.errors.some((error) => error.code === 'LOCALE_LABELS_INCOMPLETE'));
});

test('guide preserves original spot order and repeats headings for interleaved groups', () => {
  const content = createContent('destination_guide', 'en');
  const base = content.spots[0];
  const extra = ['Place B', 'Place C'].map((name, index) => ({
    ...base,
    id: `30000000-0000-5000-8000-00000000000${index + 2}`,
    name
  }));
  content.spots = [base, ...extra];
  content.spots.forEach((spot: any, index: number) => { spot.groupLabel = `Area ${index % 2}`; });
  const result = renderItineraryHtml(content, options('en'));
  assert.deepEqual(result.errors, []);
  let cursor = -1;
  for (const spot of content.spots) {
    const at = result.html.indexOf(spot.name, cursor + 1);
    assert.ok(at > cursor, `${spot.name} rendered out of input order`);
    cursor = at;
  }
  assert.equal((result.html.match(/guide-group-title/g) || []).length, 3);
});

test('gradient only hero suppresses the photo markup and its credit', () => {
  const content = createContent('full_day', 'en');
  content.hero.assetId = 'hero-photo';
  content.hero.gradientOnly = true;
  content.hero.photoAttribution = { photographer: 'A. Photographer', photographerUrl: 'https://credits.example.test/a', source: 'Guide' };
  const result = renderItineraryHtml(content, { ...options('en'), assets: {
    'hero-photo': { dataUri: 'data:image/png;base64,iVBORw0KGgo=', mimeType: 'image/png' }
  } });
  assert.deepEqual(result.errors, []);
  assert.doesNotMatch(result.html, /class="hero-image"/);
  assert.doesNotMatch(result.html, /credits\.example\.test/);
  assert.equal(result.warnings.some((warning) => warning.code === 'RENDER_ASSET_MISSING'), false);
});
