import test from 'node:test';
import assert from 'node:assert/strict';
import paletteConfig from '../../config/palettes.json' with { type: 'json' };
import { renderItineraryHtml, type RenderOptions } from '../../src/render/render.js';
import { getLocaleCatalog } from '../../src/contracts/locale-catalogs.js';
import type { ItineraryMode, WebItineraryContent } from '../../src/contracts/types.js';
import { activityV2, createContentV2, idsV2, placeV2 } from './fixtures-v2.js';

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const assets = Object.fromEntries(['cover-1', 'day-1', 'logo-1', 'place-1'].map((id) => [id, { dataUri: PNG, mimeType: 'image/png' as const }]));
const credit = { photographer: 'Jane Doe', url: 'https://photos.example.test/jane', source: 'Own photo' };
const MODES: ItineraryMode[] = ['half_day', 'full_day', 'multi_day', 'destination_guide'];

function options(locale = 'en', extra: Partial<RenderOptions> = {}): RenderOptions {
  return {
    stylesheet: 'body{font-family:sans-serif}.brochure{max-width:900px}', fontCss: '', catalog: getLocaleCatalog(locale)!,
    palette: (paletteConfig as any).palettes.cultural, assets,
    agency: { name: 'Sample Travel Studio', contact: 'guide@example.test', logoAssetId: null }, generatedDate: '2026-11-05', ...extra
  };
}
const render = (content: WebItineraryContent, extra: Partial<RenderOptions> = {}) => renderItineraryHtml(content, options(content.trip.language || 'en', extra));
const labels = (locale = 'en') => getLocaleCatalog(locale)!.labels;
const hotelBoxes = (html: string) => html.match(/<b>Hotel<\/b>/g)?.length ?? 0;

test('all four modes render cleanly with the right lang, title and mode eyebrow', () => {
  for (const mode of MODES) {
    const result = render(createContentV2(mode, 'fr'));
    assert.deepEqual(result.errors, [], mode);
    assert.match(result.html, /<html lang="fr">/);
    assert.match(result.html, /<title>Ubud in a day<\/title>/);
    assert.doesNotMatch(result.html, /undefined|\[object Object\]|\{\{|<script|<iframe/i, mode);
  }
  const guide = render(createContentV2('destination_guide', 'en')).html;
  assert.match(guide, new RegExp(`>${labels().modeDestinationGuide}</p><h1`));
  assert.doesNotMatch(guide, new RegExp(labels().modeFullDay));
  assert.match(render(createContentV2('multi_day', 'en')).html, /2 days/);
});

test('user copy is escaped and emergency contacts render as label: value', () => {
  const content = createContentV2('full_day', 'en');
  content.trip.title = '<script>alert("x")</script>';
  content.days[0].activities[0].description = '<img src=x onerror=alert(1)>';
  const html = render(content).html;
  assert.match(html, /&lt;script&gt;alert\(&quot;x&quot;\)&lt;\/script&gt;/);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.match(html, /<li>Guide: \+62-000-0000<\/li>/);
  assert.doesNotMatch(html, /<script|<img src=x/i);
  const guide = createContentV2('destination_guide', 'en');
  guide.places[0].description = '<b onmouseover=x>hi</b>';
  assert.match(render(guide).html, /&lt;b onmouseover=x&gt;hi&lt;\/b&gt;/);
});

test('mode sections: half has no meals/hotel/transfer, full has meals only, multi has everything, guide has no schedule', () => {
  const extras = (content: WebItineraryContent) => {
    content.days[0].meals = { breakfast: true, lunch: true, dinner: false };
    content.days[0].hotel = { name: 'Stray Hotel', area: 'Ubud', note: null };
    content.days[0].transferNote = 'Stray transfer';
    return content;
  };
  const half = render(extras(createContentV2('half_day', 'en'))).html;
  for (const text of ['Lunch', 'Breakfast', 'Hotel', 'Stray', 'Transfer note']) assert.doesNotMatch(half, new RegExp(text), `half_day: ${text}`);
  const full = render(extras(createContentV2('full_day', 'en'))).html;
  assert.match(full, /<b>Meals:<\/b> Breakfast · Lunch/);
  for (const text of ['Hotel', 'Stray', 'Transfer note']) assert.doesNotMatch(full, new RegExp(text), `full_day: ${text}`);
  const multi = render(createContentV2('multi_day', 'en')).html;
  assert.match(multi, /Ubud Garden Hotel/);
  assert.match(multi, /Private car between towns\./);
  assert.match(multi, />Day 1<\/span>[\s\S]*>Day 2<\/span>/);
  assert.match(multi, /Dec 2, 2026/);
  const guide = render(createContentV2('destination_guide', 'en')).html;
  assert.match(guide, /data-section="guide"/);
  assert.doesNotMatch(guide, /data-section="schedule"/);
  assert.doesNotMatch(guide, /data-section="summary"[^]*data-section="guide"[^]*Explore the landscape/);
  for (const mode of MODES) {
    const html = render(createContentV2(mode, 'en')).html;
    assert.match(html, /data-section="hero"/); assert.match(html, /data-section="closing"/); assert.match(html, /data-section="practical"/);
  }
});

test('route summary only for full/multi with at least two distinct stops', () => {
  const full = createContentV2('full_day', 'en');
  assert.doesNotMatch(render(full).html, /data-section="route"/, 'one distinct stop');
  full.days[0].activities[1].place = 'Tegallalang';
  const withRoute = render(full).html;
  assert.match(withRoute, /data-section="route"[^]*>Ubud<\/span><span[^>]*>Tegallalang<\/span>/);
  const multi = createContentV2('multi_day', 'en');
  assert.doesNotMatch(render(multi).html, /data-section="route"/, 'same location both days');
  multi.days[1].location = 'Sidemen';
  assert.match(render(multi).html, /data-section="route"[^]*Sidemen/);
  const half = createContentV2('half_day', 'en');
  half.days[0].activities[1].place = 'Tegallalang';
  assert.doesNotMatch(render(half).html, /data-section="route"/);
  assert.doesNotMatch(render(createContentV2('destination_guide', 'en')).html, /data-section="route"/);
});

test('a hotel with an empty name never prints an empty name or a dangling separator', () => {
  const content = createContentV2('multi_day', 'en');
  content.days[0].hotel = { name: '', area: 'Ubud', note: 'Quiet' };
  const html = render(content).html;
  assert.match(html, /<b>Hotel<\/b><p class="mb-0 mt-1 text-sm">Ubud · Quiet<\/p>/);
  assert.doesNotMatch(html, /<b>Hotel<\/b>:\s*<\/|<b>Hotel<\/b>:\s*<p|· <\/p>|<p[^>]*> · /);
  content.days[0].hotel = { name: '', area: null, note: null };
  assert.equal(hotelBoxes(render(content).html), 1, 'empty hotel box is omitted; day 2 keeps its own');
  content.days[0].hotel = { name: ' ', area: null, note: 'Late check-in' };
  assert.match(render(content).html, /<b>Hotel<\/b><p class="mb-0 mt-1 text-sm">Late check-in<\/p>/);
});

test('trip info strip: meeting, https-only map link, pickup only when offered, guide in every mode', () => {
  const content = createContentV2('full_day', 'en');
  content.meeting.note = 'Look for the blue sign';
  let html = render(content).html;
  assert.match(html, /data-section="trip-info"/);
  assert.match(html, /Meeting point<\/dt><dd class="m-0">Ubud Palace/);
  assert.match(html, /<a href="https:\/\/maps\.example\.test\/ubud" target="_blank" rel="noopener noreferrer">Map link<\/a>/);
  assert.match(html, /Look for the blue sign/);
  assert.match(html, /Guide name<\/dt><dd class="m-0">Made/);
  assert.match(html, /Guide phone<\/dt><dd class="m-0">\+62-000-0000/);
  content.meeting.mapsUrl = 'http://maps.example.test/ubud';
  html = render(content).html;
  assert.doesNotMatch(html, /Map link|href="http:/);
  content.pickup = { offered: false, area: 'Hotel lobby', time: '07:00', dropoffNote: 'Back by dusk' };
  assert.doesNotMatch(render(content).html, /Hotel lobby|07:00|Back by dusk/);
  content.pickup.offered = true;
  html = render(content).html;
  assert.match(html, /Pickup<\/dt><dd class="m-0">Hotel lobby/); assert.match(html, /Pickup time<\/dt><dd class="m-0">07:00/); assert.match(html, /Back by dusk/);
  const guide = createContentV2('destination_guide', 'en');
  guide.meeting.place = 'Should not show'; guide.pickup = { offered: true, area: 'Nor this', time: null, dropoffNote: null };
  html = render(guide).html;
  assert.doesNotMatch(html, /Should not show|Nor this|Meeting point|Pickup/);
  assert.match(html, /Guide name<\/dt>/);
  const bare = createContentV2('destination_guide', 'en');
  bare.guide = { name: null, phone: null };
  assert.doesNotMatch(render(bare).html, /data-section="trip-info"/, 'empty strip is omitted');
});

test('agency comes from options only; empty values leave no empty elements', () => {
  const content = createContentV2('full_day', 'en');
  (content as any).agency = { name: 'Injected Agency' };
  const withLogo = render(content, { agency: { name: 'Custom Agency', contact: 'custom@test.example', logoAssetId: 'logo-1' } }).html;
  assert.match(withLogo, /Custom Agency/); assert.match(withLogo, /custom@test\.example/);
  assert.match(withLogo, /<img class="size-9[^>]*src="data:image\/png;base64,/);
  assert.doesNotMatch(withLogo, /Injected Agency/);
  const empty = render(content, { agency: { name: '', contact: '', logoAssetId: null } }).html;
  assert.doesNotMatch(empty, /class="flex items-center gap-2"/);
  assert.doesNotMatch(empty, /<p class="font-semibold"><\/p>|<p class="font-semibold">/);
});

test('optional place fields appear only when present', () => {
  const guide = createContentV2('destination_guide', 'en');
  const bare = render(guide).html;
  assert.doesNotMatch(bare, /Best time|Suggested duration|Getting there|Nearby/);
  assert.doesNotMatch(bare.slice(bare.indexOf('data-section="guide"'), bare.indexOf('data-section="practical"')), /<dl/);
  guide.places[0] = placeV2(1, { bestTime: 'Early morning', nearby: 'Campuhan Ridge', tips: ['Bring water'] });
  const html = render(guide).html;
  assert.match(html, /Best time<\/dt><dd class="m-0">Early morning/); assert.match(html, /Nearby<\/dt><dd class="m-0">Campuhan Ridge/);
  assert.doesNotMatch(html, /Suggested duration|Getting there/);
  assert.match(html, /Local tip<\/b> · Bring water/);
});

test('photo credits: only used photos are credited; incomplete credits fail closed; source may be empty', () => {
  const content = createContentV2('full_day', 'en');
  content.cover = { assetId: 'cover-1', credit };
  let result = render(content);
  assert.deepEqual(result.errors, []);
  assert.match(result.html, /<img class="hero-image" src="data:image\/png/);
  assert.match(result.html, /Photo credits: <a href="https:\/\/photos\.example\.test\/jane"[^>]*>Jane Doe<\/a> · Own photo/);

  content.cover = { assetId: 'cover-1', credit: { photographer: 'Solo', url: null, source: '' } };
  result = render(content);
  assert.deepEqual(result.errors, [], 'empty source is allowed');
  assert.match(result.html, /Photo credits: Solo<\/div>/);

  content.cover = null; content.days[0].photo = { assetId: 'day-1', credit: null };
  result = render(content);
  assert.equal(result.html, '');
  assert.deepEqual(result.errors.map((e) => [e.code, e.path]), [['PHOTO_ATTRIBUTION_REQUIRED', 'days[0].photo.credit']]);

  for (const bad of [{ photographer: ' ', url: null, source: 'Own' }, { photographer: 'X', url: 'http://insecure.test', source: 'Own' }, { photographer: 'X', url: null, source: 'Unsplash' }, { photographer: 'X', url: null, source: 'pexels' }]) {
    content.days[0].photo = { assetId: 'day-1', credit: bad };
    assert.equal(render(content).errors[0]?.code, 'PHOTO_ATTRIBUTION_REQUIRED', JSON.stringify(bad));
  }
  content.days[0].photo = { assetId: 'day-1', credit: { photographer: 'X', url: 'https://unsplash.com/@x', source: 'Unsplash' } };
  assert.deepEqual(render(content).errors, []);

  const places = createContentV2('destination_guide', 'en');
  places.places[1] = placeV2(2, { photo: { assetId: 'place-1', credit: null } });
  assert.equal(render(places).errors[0]?.path, 'places[1].photo.credit');

  const missing = createContentV2('full_day', 'en');
  missing.cover = { assetId: 'not-supplied', credit };
  result = render(missing);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.warnings.map((w) => [w.code, w.path]), [['RENDER_ASSET_MISSING', 'cover.assetId']]);
  assert.doesNotMatch(result.html, /hero-image|Jane Doe|Photo credits/);
});

test('unsupported, mismatched or incomplete catalogs and unsafe resources fail closed', () => {
  const content = createContentV2('full_day', 'en');
  const unsupported = renderItineraryHtml({ ...content, trip: { ...content.trip, language: 'de' } }, options('en'));
  assert.equal(unsupported.html, ''); assert.deepEqual(unsupported.errors.map((e) => [e.code, e.path]), [['LOCALE_UNSUPPORTED', 'trip.language']]);
  const mismatched = renderItineraryHtml({ ...content, trip: { ...content.trip, language: 'fr' } }, options('en'));
  assert.equal(mismatched.errors[0].code, 'LOCALE_UNSUPPORTED'); assert.equal(mismatched.html, '');
  const scriptMismatch = renderItineraryHtml({ ...content, trip: { ...content.trip, language: 'zh-Hant' } }, options('zh-Hans'));
  assert.equal(scriptMismatch.errors[0].code, 'LOCALE_UNSUPPORTED');
  const noLanguage = renderItineraryHtml({ ...content, trip: { ...content.trip, language: null } }, options('en'));
  assert.equal(noLanguage.errors[0].code, 'LOCALE_UNSUPPORTED');
  const catalog = getLocaleCatalog('en')!;
  const incomplete = renderItineraryHtml(content, options('en', { catalog: { ...catalog, labels: { ...catalog.labels, hotel: '' } } }));
  assert.deepEqual(incomplete.errors.map((e) => e.code), ['LOCALE_LABELS_INCOMPLETE']); assert.equal(incomplete.html, '');
  for (const stylesheet of ['@import url(x.css);', 'a{background:url(https://evil.test/x.png)}', '']) {
    const result = render(content, { stylesheet });
    assert.equal(result.html, '', stylesheet); assert.equal(result.errors[0].code, 'RENDER_STYLES_INVALID');
  }
  const fonts = render(content, { fontCss: '@font-face{src:url(https://evil.test/f.woff2)}' });
  assert.equal(fonts.errors[0].code, 'RENDER_FONTS_EXTERNAL'); assert.equal(fonts.html, '');
  const badAsset = render(content, { agency: { name: 'A', contact: '', logoAssetId: 'bad' }, assets: { bad: { dataUri: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=', mimeType: 'image/svg+xml' as any } } });
  assert.equal(badAsset.errors[0].code, 'ASSET_INVALID');
});

test('unsupported Intl locales (la) render numeric ISO dates and numeric durations', () => {
  const content = createContentV2('multi_day', 'la');
  content.trip.startDate = '2026-10-06';
  const html = render(content).html;
  assert.match(html, /2026-10-06/); assert.match(html, /2026-10-07/); assert.match(html, /2026-11-05/);
  assert.match(html, /90 min/); assert.doesNotMatch(html, /1 hr/);
});

test('interleaved guide groups repeat their heading in source order', () => {
  const guide = createContentV2('destination_guide', 'en');
  guide.places = [placeV2(1, { group: 'North', name: 'Alpha' }), placeV2(2, { group: 'South', name: 'Bravo' }), placeV2(3, { group: 'North', name: 'Charlie' }), placeV2(4, { group: null, name: 'Delta' })];
  const html = render(guide).html;
  assert.equal(html.match(/guide-group-title[^>]*>North</g)?.length, 2);
  assert.equal(html.match(/guide-group-title[^>]*>South</g)?.length, 1);
  assert.ok(html.indexOf('Alpha') < html.indexOf('Bravo') && html.indexOf('Bravo') < html.indexOf('Charlie') && html.indexOf('Charlie') < html.indexOf('Delta'));
  assert.match(html, new RegExp(`data-place-id="${idsV2.place(3)}"`));
});

test('scale, duration formatting and CJK labels', () => {
  const big = createContentV2('multi_day', 'en');
  big.days = Array.from({ length: 14 }, (_, d) => ({ ...big.days[0], id: idsV2.day(d + 1), dayNumber: d + 1, title: `Day ${d + 1}`, activities: [1, 2, 3].map((n) => activityV2((d + 1) * 10 + n, { time: `${7 + n * 2}:00`.padStart(5, '0') })) }));
  let result = render(big);
  assert.deepEqual(result.errors, []); assert.equal(result.html.match(/data-activity-id/g)?.length, 42); assert.equal(result.html.match(/data-day-id/g)?.length, 14);
  const guide = createContentV2('destination_guide', 'en');
  guide.places = Array.from({ length: 60 }, (_, i) => placeV2(i + 1, { name: `Place ${i + 1}` }));
  result = render(guide);
  assert.deepEqual(result.errors, []); assert.equal(result.html.match(/data-place-id/g)?.length, 60); assert.match(result.html, />60</);

  const timed = createContentV2('full_day', 'en');
  timed.days[0].activities = [45, 120, 90, null].map((minutes, i) => activityV2(i + 1, { durationMinutes: minutes, title: `Stop ${i + 1}` }));
  const html = render(timed).html;
  for (const text of ['45 min', '2 hr', '1 hr 30 min']) assert.ok(html.includes(`>${text}</span>`), text);
  assert.equal(html.match(/<span class="text-xs text-slate-500">\d/g)?.length, 3, 'null duration renders nothing');

  for (const [locale, key] of [['ja', 'modeDestinationGuide'], ['zh-Hans', 'modeDestinationGuide'], ['ja', 'modeFullDay'], ['zh-Hans', 'modeFullDay']] as const) {
    const mode = key === 'modeFullDay' ? 'full_day' : 'destination_guide';
    const out = render(createContentV2(mode, locale));
    assert.deepEqual(out.errors, []);
    assert.match(out.html, new RegExp(`>${labels(locale)[key]}</p><h1`));
    assert.doesNotMatch(out.html, /Full day|Destination guide|Itinerary/);
  }
});

test('long copy and multi-line policies keep their line breaks; closing order is stable', () => {
  const content = createContentV2('full_day', 'en');
  const long = '山'.repeat(2000) + 'é'.repeat(2000);
  content.days[0].activities[0].description = long;
  content.policies = 'Cancellation: 48 hours.\nChildren under 5 free.\n\nBring ID.';
  content.cover = { assetId: 'cover-1', credit };
  const html = render(content).html;
  assert.ok(html.includes(long));
  assert.match(html, /data-section="policies"[^]*whitespace-pre-line[^>]*>Cancellation: 48 hours\.\nChildren under 5 free\.\n\nBring ID\./);
  const closing = html.slice(html.indexOf('data-section="closing"'));
  assert.ok(closing.indexOf('Enjoy your journey.') < closing.indexOf('guide@example.test'));
  assert.ok(closing.indexOf('guide@example.test') < closing.indexOf('Visit times are suggestions.'));
  assert.ok(closing.indexOf('Visit times are suggestions.') < closing.indexOf('Photo credits'));
  assert.ok(closing.indexOf('Photo credits') < closing.indexOf('Created on: Nov 5, 2026'));
  content.policies = '   ';
  assert.doesNotMatch(render(content).html, /data-section="policies"/);
});
