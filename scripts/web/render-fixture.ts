import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import puppeteer from 'puppeteer';
import languageSamples from '../../tests/fixtures/web/language-samples.json' with { type: 'json' };
import { renderItineraryHtml, type RenderAsset } from '../../src/render/render.js';
import { loadInlineRenderResources } from '../../src/render/resources.js';
import { activityV2, createContentV2, idsV2, placeV2 } from '../../tests/web/fixtures-v2.js';
import type { ItineraryMode, WebItineraryContent } from '../../src/contracts/types.js';
import { normalizeCanonicalContent, validateForPublish } from '../../src/contracts/validator.js';

const root = process.cwd();
const outputDir = path.join(root, 'output/web-foundation');
const cssPath = path.join(root, '.runtime/web-render/brochure.css');
const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAKAAAABQCAIAAAARP+ljAAAC7ElEQVR4nO2T62oTURhF95NURERExIiICCIqIl7q/RbvV2KNIQ5pq1Wr1lJrkrZRa6mlFpQkfYr09iI+hG/gjwRNY5KZ2Dnnm/Nlw/o5zD5nLQ42nUgQxQaw+dQjotgAtpx+TBQbwNazSaLYALadf0IUG8D2iymi2AB2XE4TxQaw8+pTotgAdl3ziGID2H0jQxQbwJ5b/cSmgV8/f9Rjeg577wwQOwYa0tZjbhT77g0SCwba1K1iaBf7HzwnFgz4Bja0iwOJIWLagG/dKiamcbDvBTFtIGBgE9M4lHxFTBsIGNjENI6kholpAwEDm5jG0fRrYtpAwMAmpnHMe0ssGPCta2gXxzMjxIIB38CGdnFy4B2xY6BNXXOj6H02SmwaaEhreg5nhsaIYgM49/I9UWwAF4bHiWIDuPQmSxQbwJWRHFFsAPHRPFFsANfHJohiA7g5PkUUG8DtbIEoNoC7+Y9EsQHcn/xMFBvAw8I0UWwAiU9fiGID6JueIYoNIDkzSxQbQGr2K1FsAOm5OaLYALz5eaLYADIL34hiAxj8vkAUG8CHSlEfMS9uFPELBgfZSlEZputWEb9mQJCrFNVgJ+0fxO8bBOSWSjqwXLfWWPrWviC/VHIdkbT1iBtoA2pHXC65iHjav42lVbSiFjjmxSeWSw4hXvRfxJ00BeuOuFK2TxNTwT6LJiIO27AucMyLT66UjSIewA6mNQYHTQ63Wg4dm3J7eg+HQgiZQ7K0EfNNAse8+NRqOSwcKmq6d1hOOvKPln9ZW9wgCqKaix0KQSq0DFylsLb4H6iMGvHYrVr4BO6ocVd1jWzpBvwD+5bu8q4Rj91BYDuIt1FWOhKBxTMoLi0ZWFx6N5QWCCyuOCKoCixuM+I4GVjcmqOEHDjEP4qrUUkIgYliAwws34CB5TW5C1+wfAMGltfkLnzB8g0YWF6Tu/AFyzdgYHlN7sIXLN+AgeU1uQtfsHwDBpbX5C58wfINGFheU4+z/AZ9yROM0740tQAAAABJRU5ErkJggg==';
const rendererAsset: RenderAsset = { dataUri: png, mimeType: 'image/png' };
const credit = { photographer: 'Synthetic test asset', url: null, source: 'Generated landscape fixture' };
const failures: string[] = [];
const summaryRows: Array<Record<string, unknown>> = [];
const MODE_FILE: Record<ItineraryMode, string> = { half_day: 'half_day', full_day: 'full_day', multi_day: 'multi_day', destination_guide: 'destination_guide', activity: 'activity' };

interface FixtureRow {
  id: string; mode: ItineraryMode; content: WebItineraryContent; logo: boolean; screenshotMode: boolean;
  expectHeroImages: number; expectDayImages: number; expectPlaceImages: number; guideOrder: boolean; assetIds: string[];
}

function durationText(locale: string, minutes: number) {
  const requested = new Intl.Locale(locale).language.toLowerCase();
  const hour = new Intl.NumberFormat(locale, { style: 'unit', unit: 'hour', unitDisplay: 'short' });
  const minute = new Intl.NumberFormat(locale, { style: 'unit', unit: 'minute', unitDisplay: 'short' });
  if (new Intl.Locale(hour.resolvedOptions().locale).language.toLowerCase() !== requested) return `${minutes} min`;
  return `${hour.format(Math.floor(minutes / 60))} ${minute.format(minutes % 60)}`;
}

function withPhotos(content: WebItineraryContent) {
  content.cover = { assetId: 'cover-image', credit };
  if (content.trip.mode === 'destination_guide') content.places[0].photo = { assetId: 'place-image', credit };
  else content.days[0].photo = { assetId: 'day-image', credit };
}

function fixtureRows() {
  const rows: FixtureRow[] = [];
  for (const sample of languageSamples) {
    const content = createContentV2('full_day', sample.locale);
    Object.assign(content.trip, { title: sample.title, destination: sample.destination, region: sample.region, country: sample.country });
    content.summary = sample.brief;
    content.days[0].title = sample.destination;
    content.days[0].location = sample.destination;
    Object.assign(content.days[0].activities[0], { title: sample.activityTitle, description: sample.activityDescription, place: sample.destination });
    Object.assign(content.days[0].activities[1], { title: sample.highlightTitle, description: sample.highlightNote, place: sample.routeStage });
    content.localTips = [sample.highlightNote];
    content.closingNote = sample.closingNote;
    content.disclaimer = sample.disclaimer;
    content.policies = `${sample.title}\n${sample.disclaimer}`;
    const isEnglish = sample.locale === 'en';
    if (isEnglish) withPhotos(content);
    rows.push({ id: `full-day-${sample.locale}`, mode: 'full_day', content, logo: isEnglish, screenshotMode: isEnglish, expectHeroImages: isEnglish ? 1 : 0, expectDayImages: isEnglish ? 1 : 0, expectPlaceImages: 0, guideOrder: false, assetIds: isEnglish ? ['cover-image', 'day-image', 'agency-logo'] : [] });
  }

  const half = createContentV2('half_day', 'en');
  half.trip.title = 'A half-day in Ubud';
  withPhotos(half);
  rows.push({ id: 'half-day-en', mode: 'half_day', content: half, logo: true, screenshotMode: true, expectHeroImages: 1, expectDayImages: 1, expectPlaceImages: 0, guideOrder: false, assetIds: ['cover-image', 'day-image', 'agency-logo'] });

  const multi = createContentV2('multi_day', 'en');
  multi.trip.title = 'Three days around Ubud';
  multi.days.push({ ...structuredClone(multi.days[1]), id: idsV2.day(3), dayNumber: 3, title: 'Day 3', location: 'Sidemen', hotel: { name: '', area: 'Sidemen', note: 'Quiet valley stay.' }, activities: [activityV2(31), activityV2(32, { time: '10:00', kind: 'food' })] });
  withPhotos(multi);
  rows.push({ id: 'multi-day-en', mode: 'multi_day', content: multi, logo: true, screenshotMode: true, expectHeroImages: 1, expectDayImages: 1, expectPlaceImages: 0, guideOrder: false, assetIds: ['cover-image', 'day-image', 'agency-logo'] });

  const guide = createContentV2('destination_guide', 'en');
  guide.trip.title = 'A regional guide to Bali';
  guide.places[1] = placeV2(2, { group: 'North Ubud', bestTime: 'Early morning', suggestedDuration: '90 minutes', nearby: 'Campuhan Ridge', tips: ['Bring water.'] });
  withPhotos(guide);
  rows.push({ id: 'guide-en', mode: 'destination_guide', content: guide, logo: true, screenshotMode: true, expectHeroImages: 1, expectDayImages: 0, expectPlaceImages: 1, guideOrder: false, assetIds: ['cover-image', 'place-image', 'agency-logo'] });

  const long = createContentV2('multi_day', 'en');
  long.trip.title = 'Two weeks across Bali';
  long.trip.startDate = '2026-10-06';
  long.days = Array.from({ length: 14 }, (_, index) => ({
    id: idsV2.day(index + 1), dayNumber: index + 1, title: `Day ${String(index + 1).padStart(2, '0')} · Island exploration`, location: index % 2 ? 'Ubud' : 'Coastal Bali', photo: null,
    activities: [1, 2, 3].map((n) => activityV2((index + 1) * 10 + n, {
      time: `${String(6 + n * 2).padStart(2, '0')}:00`, title: `Guided walk · Day ${index + 1}.${n}`,
      description: index === 6 && n === 1 ? `Take time to notice the landscape and local details. ${'This long-form note explains the cultural context and practical walking considerations. '.repeat(34)}` : 'Follow the planned route and pause for local context along the way.'
    })),
    hotel: index % 2 ? { name: '', area: 'Ubud', note: 'Stay close to the next day’s route.' } : { name: 'Coastal Garden Hotel', area: 'Coastal Bali', note: null },
    meals: { breakfast: true, lunch: index % 3 === 0, dinner: false }, transferNote: index % 4 === 0 ? 'Private car transfer.' : null
  }));
  rows.push({ id: 'multi-day-14-en', mode: 'multi_day', content: long, logo: false, screenshotMode: false, expectHeroImages: 0, expectDayImages: 0, expectPlaceImages: 0, guideOrder: false, assetIds: [] });

  const many = createContentV2('destination_guide', 'en');
  many.trip.title = 'A regional guide with sixty places';
  many.places = Array.from({ length: 60 }, (_, index) => placeV2(index + 1, {
    group: `Area ${index % 6 + 1}`, name: `Place ${index + 1}`, bestTime: index % 3 ? null : 'Early morning',
    description: `Place ${index + 1} offers a chance to understand the character of this area through its landscape, daily rhythms and local traditions. Walk at a comfortable pace and leave time to pause rather than treating the visit as a checklist.`,
    tips: index % 2 ? [] : ['Wear shoes with grip; paths can be uneven after rain.']
  }));
  many.places[0].photo = { assetId: 'place-image', credit };
  rows.push({ id: 'guide-many-en', mode: 'destination_guide', content: many, logo: false, screenshotMode: false, expectHeroImages: 0, expectDayImages: 0, expectPlaceImages: 1, guideOrder: true, assetIds: ['place-image'] });

  for (const locale of ['ja', 'zh-Hans']) {
    const ja = locale === 'ja';
    const cjk = createContentV2('destination_guide', locale);
    Object.assign(cjk.trip, { title: ja ? '京都の庭園案内' : '京都庭园指南', destination: '京都', region: '京都府', country: '日本' });
    cjk.summary = ja ? '庭園をゆっくり巡り、地域の景色と文化を楽しみます。' : '悠闲游览庭园，感受当地风景与文化。';
    cjk.places = [placeV2(1, {
      group: ja ? '嵐山' : '岚山', name: ja ? '嵐山の庭園' : '岚山庭园', area: '京都西部',
      description: ja ? '庭園の小道をゆっくり歩き、季節の草花や石庭の配置を眺めます。雨上がりは石が滑りやすいため、歩きやすい靴で訪れましょう。' : '沿着庭园小径慢慢游览，欣赏季节花木和石庭布局。雨后石面可能较滑，建议穿舒适的鞋。',
      suggestedDuration: ja ? '約90分' : '约90分钟', bestTime: ja ? '朝の涼しい時間' : '清晨较凉爽', gettingThere: ja ? '市内から車で移動します。' : '从市区乘车前往。',
      tips: [ja ? '滑りにくい靴を履き、飲み水を持参してください。' : '穿防滑鞋并携带饮用水。'], nearby: ja ? '近くの寺院と組み合わせて訪問できます。' : '可与附近寺院安排在同一片区游览。'
    })];
    cjk.closingNote = ja ? 'よい旅をお楽しみください。' : '祝您旅途愉快。';
    cjk.disclaimer = ja ? '訪問時間は目安です。' : '游览时间仅供参考。';
    rows.push({ id: `guide-${locale}`, mode: 'destination_guide', content: cjk, logo: false, screenshotMode: false, expectHeroImages: 0, expectDayImages: 0, expectPlaceImages: 0, guideOrder: false, assetIds: [] });
  }
  return rows;
}

function decodePageCount(pdf: Buffer) {
  const text = pdf.toString('latin1');
  return [...text.matchAll(/\/Type\s*\/Page\b/g)].length;
}

await fs.mkdir(outputDir, { recursive: true });
const fixtures = fixtureRows();
const browser = await puppeteer.launch({
  headless: 'shell',
  args: ['--disable-background-networking', '--disable-sync', '--no-first-run', '--disable-extensions']
});
const browserVersion = await browser.version();

try {
  for (const fixture of fixtures) {
    const content = fixture.content;
    const localeTag = String(content.trip.language);
    const { fontBytes, ...renderResources } = await loadInlineRenderResources(localeTag, content.trip.colorTheme, cssPath);
    const assets: Record<string, RenderAsset> = Object.fromEntries(fixture.assetIds.map((id) => [id, rendererAsset]));
    const contactSentinel = `contact-${localeTag}@example.test`;
    const agency = { name: 'Sample Travel Studio', contact: contactSentinel, logoAssetId: fixture.logo ? 'agency-logo' : null };
    const normalized = normalizeCanonicalContent(content);
    if (!normalized.ok) throw new Error(`${fixture.id}: normalization failed: ${JSON.stringify(normalized.errors)}`);
    const validated = validateForPublish(normalized.value);
    if (!validated.ok) throw new Error(`${fixture.id}: publish validation failed: ${JSON.stringify(validated.errors)}`);
    const rendered = renderItineraryHtml(validated.value, { ...renderResources, assets, agency, generatedDate: '2026-11-05' });
    if (rendered.errors.length) throw new Error(`${fixture.id}: ${JSON.stringify(rendered.errors)}`);
    if (rendered.warnings.length) failures.push(`${fixture.id}: unexpected render warnings ${JSON.stringify(rendered.warnings)}`);
    if (!rendered.html.includes('SIL OPEN FONT LICENSE')) failures.push(`${fixture.id}: bundled font license notice missing`);
    if (Buffer.byteLength(rendered.html, 'utf8') > 64 * 1024 * 1024 || fontBytes > 16 * 1024 * 1024) failures.push(`${fixture.id}: self-contained bundle exceeds the configured size limit`);
    if (/\{\{[^}]+\}\}|undefined|\[object Object\]/i.test(rendered.html)) failures.push(`${fixture.id}: unresolved placeholder or object text`);
    const heroMarkup = (rendered.html.match(/class="hero-image"/g) || []).length;
    const dayPhotoMarkup = (rendered.html.match(/aspect-\[16\/7\]/g) || []).length;
    const placePhotoMarkup = (rendered.html.match(/aspect-\[16\/9\]/g) || []).length;
    if (heroMarkup !== fixture.expectHeroImages) failures.push(`${fixture.id}: hero photo markup ${heroMarkup}, expected ${fixture.expectHeroImages}`);
    if (dayPhotoMarkup !== fixture.expectDayImages) failures.push(`${fixture.id}: day photo markup ${dayPhotoMarkup}, expected ${fixture.expectDayImages}`);
    if (placePhotoMarkup !== fixture.expectPlaceImages) failures.push(`${fixture.id}: place photo markup ${placePhotoMarkup}, expected ${fixture.expectPlaceImages}`);
    if (fixture.expectHeroImages + fixture.expectDayImages + fixture.expectPlaceImages > 0 && !rendered.html.includes('Synthetic test asset')) failures.push(`${fixture.id}: photo credit missing from closing`);
    if (fixture.logo !== rendered.html.includes('alt="Agency logo"')) failures.push(`${fixture.id}: agency logo presence does not match the fixture`);
    const sections = [...rendered.html.matchAll(/data-section="([a-z-]+)"/g)].map((match) => match[1]);
    const expectedSections = fixture.mode === 'destination_guide' ? ['guide'] : ['schedule'];
    for (const section of ['hero', 'closing', ...expectedSections]) if (!sections.includes(section)) failures.push(`${fixture.id}: data-section="${section}" missing`);
    if (fixture.mode === 'destination_guide' && sections.includes('schedule')) failures.push(`${fixture.id}: guide rendered a schedule section`);
    const htmlPath = path.join(outputDir, `${fixture.id}.html`);
    const pdfPath = path.join(outputDir, `${fixture.id}.pdf`);
    await fs.writeFile(htmlPath, rendered.html, 'utf8');

    const page = await browser.newPage();
    const externalRequests: string[] = [];
    const consoleErrors: string[] = [];
    page.on('request', (request) => {
      const url = request.url();
      if (url.startsWith('data:') || url === 'about:blank') request.continue();
      else {
        externalRequests.push(url);
        request.abort();
      }
    });
    page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
    page.on('pageerror', (error) => consoleErrors.push(String(error)));
    await page.setRequestInterception(true);
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
    await page.setContent(rendered.html, { waitUntil: 'load', timeout: 60000 });
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(() => Promise.all([...document.images].map((image) => image.decode().catch(() => null))));
    const mobile = await page.evaluate(() => ({
      lang: document.documentElement.lang,
      width: document.documentElement.scrollWidth,
      viewport: window.innerWidth,
      text: document.body.innerText,
      brokenImages: [...document.images].filter((image) => image.complete && image.naturalWidth === 0).length,
      latinFont: document.fonts.check('12px "Noto Sans Variable"'),
      jpFont: document.fonts.check('12px "Noto Sans JP Variable"', '京都の庭園'),
      scFont: document.fonts.check('12px "Noto Sans SC Variable"', '京都庭园')
    }));
    const matchingFont = localeTag === 'ja' ? mobile.jpFont : localeTag === 'zh-Hans' ? mobile.scFont : mobile.latinFont;
    if (mobile.lang !== localeTag) failures.push(`${fixture.id}: document lang mismatch`);
    if (mobile.width > mobile.viewport + 1) failures.push(`${fixture.id}: mobile horizontal overflow ${mobile.width}/${mobile.viewport}`);
    if (mobile.brokenImages) failures.push(`${fixture.id}: ${mobile.brokenImages} broken image(s)`);
    if (!mobile.text.includes(content.trip.title)) failures.push(`${fixture.id}: title missing from DOM`);
    if (!matchingFont) failures.push(`${fixture.id}: bundled locale font did not load or cover its sample glyphs`);
    if (externalRequests.length) failures.push(`${fixture.id}: external requests ${externalRequests.length}`);
    if (consoleErrors.length) failures.push(`${fixture.id}: console errors ${consoleErrors.length}`);
    if (!mobile.text.includes(contactSentinel)) failures.push(`${fixture.id}: agency contact missing from DOM`);
    if (!mobile.text.includes('+62-000-0000')) failures.push(`${fixture.id}: emergency contact value missing from DOM`);
    if (fixture.mode !== 'destination_guide') {
      const expectedDuration = durationText(localeTag, 90);
      if (!mobile.text.includes(expectedDuration)) failures.push(`${fixture.id}: localized duration "${expectedDuration}" missing from DOM`);
    }
    if (fixture.id === 'multi-day-14-en') {
      const emptyHotelBox = (rendered.html.match(/<b>Hotel<\/b>(?=<p)/g) || []).length;
      if (emptyHotelBox !== 7) failures.push(`multi-day-14-en: expected 7 nameless hotel boxes without a name, found ${emptyHotelBox}`);
      if (/<b>Hotel<\/b>: *<|<b>Hotel<\/b>:\s*·/.test(rendered.html)) failures.push('multi-day-14-en: dangling hotel separator');
    }
    if (fixture.guideOrder) {
      let cursor = -1;
      for (let place = 1; place <= 60; place += 1) {
        const at = mobile.text.indexOf(`Place ${place}`, cursor + 1);
        if (at <= cursor) {
          failures.push(`${fixture.id}: Place ${place} missing or out of input order in DOM`);
          break;
        }
        cursor = at;
      }
      const groupHeadings = (mobile.text.match(/Area \d/g) || []).length;
      if (groupHeadings !== 60) failures.push(`${fixture.id}: expected 60 interleaved group headings, found ${groupHeadings}`);
    }

    const glyphSample = localeTag === 'ja' ? '京都の庭園' : localeTag === 'zh-Hans' ? '京都庭园' : 'UbudBali90';
    const glyphFamily = localeTag === 'ja' ? '"Noto Sans JP Variable"' : localeTag === 'zh-Hans' ? '"Noto Sans SC Variable"' : '"Noto Sans Variable"';
    const glyphState = await page.evaluate(({ family, sample }) => {
      const bare = family.replace(/"/g, '');
      const faces = [...document.fonts].filter((entry) => entry.family === bare);
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d')!;
      context.font = `32px ${family}`;
      const notdef = context.measureText('').width;
      const widths = [...sample].map((character) => ({ character, width: context.measureText(character).width }));
      return { faceCount: faces.length, loaded: faces.some((entry) => entry.status === 'loaded'), notdef, widths };
    }, { family: glyphFamily, sample: glyphSample });
    if (!glyphState.loaded) failures.push(`${fixture.id}: no loaded font face for ${glyphFamily}`);
    const tofu = glyphState.widths.filter((entry) => Math.abs(entry.width - glyphState.notdef) < 0.5).map((entry) => entry.character);
    if (tofu.length) failures.push(`${fixture.id}: glyphs render as notdef boxes: ${tofu.join('')}`);

    await page.screenshot({ path: path.join(outputDir, `${fixture.id}-mobile.png`), type: 'png', fullPage: true });
    if (fixture.screenshotMode) await page.screenshot({ path: path.join(outputDir, `r3-${MODE_FILE[fixture.mode]}-390.png`), type: 'png', fullPage: true });
    await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
    await page.screenshot({ path: path.join(outputDir, `${fixture.id}-desktop.png`), type: 'png', fullPage: true });
    if (fixture.screenshotMode) await page.screenshot({ path: path.join(outputDir, `r3-${MODE_FILE[fixture.mode]}-1280.png`), type: 'png', fullPage: true });
    const desktop = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, viewport: window.innerWidth }));
    const desktopOverflow = desktop.width > desktop.viewport + 1;
    if (desktopOverflow) failures.push(`${fixture.id}: desktop horizontal overflow ${desktop.width}/${desktop.viewport}`);

    await page.emulateMediaType('print');
    const printNav = await page.evaluate(() => {
      const nav = document.querySelector('.day-index');
      return nav ? { items: nav.children.length, flexWrap: getComputedStyle(nav).flexWrap, overflowX: getComputedStyle(nav).overflowX } : null;
    });
    if (fixture.id === 'multi-day-14-en' && (!printNav || printNav.items !== 14 || printNav.flexWrap !== 'wrap' || printNav.overflowX !== 'visible')) {
      failures.push('multi-day-14-en: print day index was clipped or did not wrap.');
    }
    await page.screenshot({ path: path.join(outputDir, `${fixture.id}-print.png`), type: 'png', fullPage: true });
    await page.pdf({ path: pdfPath, format: 'A4', printBackground: true, preferCSSPageSize: true, margin: { top: '12mm', right: '12mm', bottom: '12mm', left: '12mm' } });
    const pdf = await fs.readFile(pdfPath);
    const pages = decodePageCount(pdf);
    if (!pdf.subarray(0, 5).toString().startsWith('%PDF-') || pdf.length === 0 || pages === 0) failures.push(`${fixture.id}: invalid/empty PDF`);
    const htmlBytes = Buffer.byteLength(rendered.html, 'utf8');
    summaryRows.push({
      fixture: fixture.id, locale: localeTag, mode: fixture.mode, htmlBytes, fontBytes, pdfBytes: pdf.length, pages,
      mobileOverflow: mobile.width > mobile.viewport + 1, desktopOverflow,
      externalRequests: externalRequests.length, consoleErrors: consoleErrors.length,
      glyphFaces: glyphState.faceCount, heroMarkup, dayPhotoMarkup, placePhotoMarkup, sections: sections.join(','),
      groupHeadings: fixture.guideOrder ? (mobile.text.match(/Area \d/g) || []).length : null
    });
    console.log(JSON.stringify(summaryRows[summaryRows.length - 1]));
    await page.close();
  }
} finally {
  await browser.close();
}

const indexRows = fixtures.map(({ id }) => `<li><strong>${id}</strong> · <a href="${id}.html">HTML</a> · <a href="${id}.pdf">PDF</a> · <a href="${id}-mobile.png">Mobile</a> · <a href="${id}-desktop.png">Desktop</a> · <a href="${id}-print.png">Print</a></li>`).join('\n');
await fs.writeFile(path.join(outputDir, 'index.html'), `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Web renderer fixtures</title><body><main><h1>Web renderer fixtures</h1><ul>${indexRows}</ul></main></body></html>`, 'utf8');
await fs.writeFile(path.join(outputDir, 'verification-summary.json'), JSON.stringify({ fixtureCount: fixtures.length, browserVersion, failures, fixtures: summaryRows }, null, 2));
if (failures.length) {
  console.error(JSON.stringify({ failures }, null, 2));
  process.exitCode = 1;
}
