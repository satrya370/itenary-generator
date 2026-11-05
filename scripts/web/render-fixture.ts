import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import puppeteer from 'puppeteer';
import languageSamples from '../../tests/fixtures/web/language-samples.json' with { type: 'json' };
import { renderItineraryHtml, type RenderAsset } from '../../src/render/render.js';
import { loadInlineRenderResources } from '../../src/render/resources.js';
import { createContent } from '../../tests/web/fixtures.js';
import type { ItineraryMode } from '../../src/contracts/types.js';
import { normalizeCanonicalContent, validateForPublish } from '../../src/contracts/validator.js';

const root = process.cwd();
const outputDir = path.join(root, 'output/web-foundation');
const cssPath = path.join(root, '.runtime/web-render/brochure.css');
const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAKAAAABQCAIAAAARP+ljAAAC7ElEQVR4nO2T62oTURhF95NURERExIiICCIqIl7q/RbvV2KNIQ5pq1Wr1lJrkrZRa6mlFpQkfYr09iI+hG/gjwRNY5KZ2Dnnm/Nlw/o5zD5nLQ42nUgQxQaw+dQjotgAtpx+TBQbwNazSaLYALadf0IUG8D2iymi2AB2XE4TxQaw8+pTotgAdl3ziGID2H0jQxQbwJ5b/cSmgV8/f9Rjeg577wwQOwYa0tZjbhT77g0SCwba1K1iaBf7HzwnFgz4Bja0iwOJIWLagG/dKiamcbDvBTFtIGBgE9M4lHxFTBsIGNjENI6kholpAwEDm5jG0fRrYtpAwMAmpnHMe0ssGPCta2gXxzMjxIIB38CGdnFy4B2xY6BNXXOj6H02SmwaaEhreg5nhsaIYgM49/I9UWwAF4bHiWIDuPQmSxQbwJWRHFFsAPHRPFFsANfHJohiA7g5PkUUG8DtbIEoNoC7+Y9EsQHcn/xMFBvAw8I0UWwAiU9fiGID6JueIYoNIDkzSxQbQGr2K1FsAOm5OaLYALz5eaLYADIL34hiAxj8vkAUG8CHSlEfMS9uFPELBgfZSlEZputWEb9mQJCrFNVgJ+0fxO8bBOSWSjqwXLfWWPrWviC/VHIdkbT1iBtoA2pHXC65iHjav42lVbSiFjjmxSeWSw4hXvRfxJ00BeuOuFK2TxNTwT6LJiIO27AucMyLT66UjSIewA6mNQYHTQ63Wg4dm3J7eg+HQgiZQ7K0EfNNAse8+NRqOSwcKmq6d1hOOvKPln9ZW9wgCqKaix0KQSq0DFylsLb4H6iMGvHYrVr4BO6ocVd1jWzpBvwD+5bu8q4Rj91BYDuIt1FWOhKBxTMoLi0ZWFx6N5QWCCyuOCKoCixuM+I4GVjcmqOEHDjEP4qrUUkIgYliAwws34CB5TW5C1+wfAMGltfkLnzB8g0YWF6Tu/AFyzdgYHlN7sIXLN+AgeU1uQtfsHwDBpbX5C58wfINGFheU4+z/AZ9yROM0740tQAAAABJRU5ErkJggg==';
const rendererAsset: RenderAsset = { dataUri: png, mimeType: 'image/png' };
const failures: string[] = [];
const summaryRows: Array<Record<string, unknown>> = [];

function uuid(group: string, number: number) {
  return `${group}-0000-5000-8000-${String(number).padStart(12, '0')}`;
}

function fixtureRows() {
  const rows: Array<{ id: string; content: ReturnType<typeof createContent>; durationLabel: string | null; expectHeroImage: boolean; expectScheduleImage: boolean; guideOrder: boolean }> = [];
  const durationByLocale: Record<string, string> = { en: '90 minutes', la: '90 minuta', fr: '90 minutes', id: '90 menit', ja: '90分', zh: '90分钟' };
  const enrich = (content: any, sample: { locale: string; theme: string }) => {
    const locale = String(content.brochure.outputLanguage);
    content.brochure.agencyContact = `contact-${locale}@example.test`;
    content.closing.agencyContact = '';
    content.overview.quickFacts.themes = [];
    content.practical.included = ['Entry fees where required', 'Scheduled transfers'];
    content.practical.emergencyContacts = [{ label: 'Local emergency', value: '+62-000-0000' }];
    const duration = durationByLocale[locale] || durationByLocale.en;
    content.schedule.forEach((block: any) => block.activities.forEach((activity: any) => { activity.durationLabel = duration; }));
    return { durationLabel: content.schedule.length ? duration : null, theme: sample.theme };
  };
  for (const sample of languageSamples) {
    const content = createContent('full_day', sample.locale);
    content.brochure.tripTitle = sample.title;
    content.brochure.destination = sample.destination;
    content.brochure.region = sample.region;
    content.brochure.country = sample.country;
    content.brochure.travelerType = sample.travelerType;
    content.brochure.themes = [sample.theme];
    content.overview.summary = sample.brief;
    content.overview.quickFacts.bestSeason = sample.bestSeason;
    content.overview.quickFacts.themes = [sample.theme];
    content.overview.routeSummary = [sample.routeStage];
    content.overview.highlights = [{ icon: 'sightseeing', title: sample.highlightTitle, note: sample.highlightNote }];
    content.schedule[0].title = sample.destination;
    content.schedule[0].location = sample.destination;
    content.schedule[0].activities[0].title = sample.activityTitle;
    content.schedule[0].activities[0].description = sample.activityDescription;
    content.schedule[0].activities[0].area = sample.destination;
    content.schedule[0].activities[0].category = sample.theme;
    content.closing.closingNote = sample.closingNote;
    content.closing.disclaimer = sample.disclaimer;
    if (sample.locale === 'en') {
      content.hero.assetId = 'hero-region';
      content.hero.gradientOnly = false;
      content.hero.photoAttribution = { photographer: 'Synthetic test asset', photographerUrl: null, source: 'Generated landscape fixture' };
    }
    const meta = enrich(content, sample);
    rows.push({ id: `full-day-${sample.locale}`, content, durationLabel: meta.durationLabel, expectHeroImage: sample.locale === 'en', expectScheduleImage: false, guideOrder: false });
  }

  const halfDay = createContent('half_day', 'en');
  halfDay.brochure.tripTitle = 'A half-day in Ubud';
  halfDay.brochure.scopeLabel = 'Half day';
  halfDay.overview.quickFacts.scope = 'Half day';
  halfDay.hero.assetId = 'hero-region';
  halfDay.hero.gradientOnly = true;
  halfDay.hero.photoAttribution = { photographer: 'Synthetic test asset', photographerUrl: null, source: 'Generated landscape fixture' };
  halfDay.schedule[0].assetId = 'schedule-image';
  halfDay.schedule[0].photoAttribution = { photographer: 'Synthetic test asset', photographerUrl: null, source: 'Generated regional landscape fixture' };
  const halfMeta = enrich(halfDay, { locale: 'en', theme: 'culture' });
  rows.push({ id: 'half-day-en', content: halfDay, durationLabel: halfMeta.durationLabel, expectHeroImage: false, expectScheduleImage: true, guideOrder: false });

  const multi = createContent('multi_day', 'en');
  multi.brochure.tripTitle = 'Two weeks across Bali';
  multi.brochure.durationDays = 14;
  multi.brochure.scopeLabel = '14 days';
  multi.brochure.startDate = '2026-10-06';
  multi.brochure.endDate = '2026-10-19';
  multi.overview.quickFacts.scope = '14 days';
  const blockTemplate = multi.schedule[0];
  multi.schedule = Array.from({ length: 14 }, (_, index) => ({
    ...structuredClone(blockTemplate),
    id: uuid('41000000', index + 1),
    dayStart: index + 1,
    dayEnd: index + 1,
    date: new Date(Date.UTC(2026, 9, 6 + index)).toISOString().slice(0, 10),
    title: `Day ${String(index + 1).padStart(2, '0')} · Island exploration`,
    location: index % 2 ? 'Ubud' : 'Coastal Bali',
    isCondensed: false,
    activities: [{
      ...structuredClone(blockTemplate.activities[0]),
      id: uuid('51000000', index + 1),
      timeLabel: '08:00',
      title: `Guided walk · Day ${index + 1}`,
      description: index === 6 ? `Take time to notice the landscape and local details. ${'This long-form note explains the cultural context and practical walking considerations. '.repeat(34)}` : 'Follow the planned route and pause for local context along the way.'
    }],
    accommodation: { name: null, area: index % 2 ? 'Ubud' : 'Coastal Bali', note: 'Stay close to the next day’s route.' }
  }));
  const multiMeta = enrich(multi, { locale: 'en', theme: 'culture' });
  rows.push({ id: 'multi-day-14-en', content: multi, durationLabel: multiMeta.durationLabel, expectHeroImage: false, expectScheduleImage: false, guideOrder: false });

  const manySpots = createContent('destination_guide', 'en');
  manySpots.brochure.tripTitle = 'A regional guide to Bali';
  manySpots.spots = Array.from({ length: 60 }, (_, index) => ({
    ...structuredClone(manySpots.spots[0]),
    id: uuid('61000000', index + 1),
    groupLabel: `Area ${index % 6 + 1}`,
    name: `Place ${index + 1}`,
    description: `Place ${index + 1} offers a chance to understand the character of this area through its landscape, daily rhythms and local traditions. Walk at a comfortable pace, pay attention to how the setting changes, and leave time to pause rather than treating the visit as a checklist. Paths may be uneven after rain, so choose footwear with good grip.`
  }));
  manySpots.spots[0].assetId = 'region-image';
  manySpots.spots[0].photoAttribution = { photographer: 'Synthetic test asset', photographerUrl: null, source: 'Generated regional landscape fixture' };
  enrich(manySpots, { locale: 'en', theme: 'culture' });
  rows.push({ id: 'guide-many-en', content: manySpots, durationLabel: null, expectHeroImage: false, expectScheduleImage: false, guideOrder: true });

  for (const locale of ['ja', 'zh-Hans']) {
    const guide = createContent('destination_guide', locale);
    guide.brochure.tripTitle = locale === 'ja' ? '京都の庭園案内' : '京都庭园指南';
    guide.brochure.destination = '京都';
    guide.brochure.region = '京都府';
    guide.brochure.country = '日本';
    guide.brochure.travelerType = locale === 'ja' ? 'カップル' : '情侣';
    guide.brochure.themes = [locale === 'ja' ? '文化' : '文化'];
    guide.overview.summary = locale === 'ja' ? '庭園をゆっくり巡り、地域の景色と文化を楽しみます。' : '悠闲游览庭园，感受当地风景与文化。';
    guide.overview.quickFacts.bestSeason = locale === 'ja' ? '春' : '春季';
    guide.overview.quickFacts.themes = [locale === 'ja' ? '文化' : '文化'];
    guide.overview.routeSummary = [locale === 'ja' ? '庭園エリア' : '庭园区域'];
    guide.overview.highlights = [{ icon: 'sightseeing', title: locale === 'ja' ? '静かな庭園' : '静谧庭园', note: locale === 'ja' ? '季節の景色をゆっくり楽しめます。' : '在季节景色中悠闲漫步。' }];
    guide.spots[0].name = locale === 'ja' ? '嵐山の庭園' : '岚山庭园';
    guide.spots[0].groupLabel = locale === 'ja' ? '嵐山' : '岚山';
    guide.spots[0].area = locale === 'ja' ? '京都西部' : '京都西部';
    guide.spots[0].category = locale === 'ja' ? '庭園' : '庭园';
    guide.spots[0].description = locale === 'ja'
      ? '庭園の小道をゆっくり歩き、季節の草花や石庭の配置を眺めます。雨上がりは石が滑りやすいため、歩きやすい靴で訪れ、景色を楽しむ時間を十分に取りましょう。近くの寺院や川沿いの散策と組み合わせると、地域の雰囲気をより深く味わえます。'
      : '沿着庭园小径慢慢游览，欣赏季节花木和石庭布局。雨后石面可能较滑，建议穿舒适的鞋，并留出时间欣赏景色。还可以搭配附近的寺院或河畔散步，更深入感受当地氛围。';
    guide.spots[0].suggestedDuration = locale === 'ja' ? '約90分' : '约90分钟';
    guide.spots[0].bestTimeToVisit = locale === 'ja' ? '朝の涼しい時間' : '清晨较凉爽';
    guide.spots[0].gettingThere = locale === 'ja' ? '市内から車で移動し、帰りの集合場所を決めておきます。' : '从市区乘车前往，并提前约定返程集合地点。';
    guide.spots[0].tips = [locale === 'ja' ? '滑りにくい靴を履き、飲み水を持参してください。' : '穿防滑鞋并携带饮用水。'];
    guide.spots[0].nearbyPairing = locale === 'ja' ? '近くの寺院と組み合わせて訪問できます。' : '可与附近寺院安排在同一片区游览。';
    guide.closing.closingNote = locale === 'ja' ? 'よい旅をお楽しみください。' : '祝您旅途愉快。';
    guide.closing.disclaimer = locale === 'ja' ? '訪問時間は目安です。' : '游览时间仅供参考。';
    enrich(guide, { locale, theme: 'culture' });
    rows.push({ id: `guide-${locale}`, content: guide, durationLabel: null, expectHeroImage: false, expectScheduleImage: false, guideOrder: false });
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
    const { fontBytes, ...renderResources } = await loadInlineRenderResources(fixture.content.brochure.outputLanguage!, fixture.content.brochure.destinationType, cssPath);
    const assets: Record<string, RenderAsset> = {};
    if (fixture.id === 'guide-many-en') assets['region-image'] = rendererAsset;
    if (fixture.id === 'full-day-en') {
      assets['hero-region'] = rendererAsset;
      assets['agency-logo'] = rendererAsset;
      fixture.content.brochure.agencyLogoAssetId = 'agency-logo';
    }
    if (fixture.id === 'half-day-en') {
      assets['hero-region'] = rendererAsset;
      assets['schedule-image'] = rendererAsset;
    }
    const normalized = normalizeCanonicalContent(fixture.content);
    if (!normalized.ok) throw new Error(`${fixture.id}: normalization failed: ${JSON.stringify(normalized.errors)}`);
    const validated = validateForPublish(normalized.value);
    if (!validated.ok) throw new Error(`${fixture.id}: publish validation failed: ${JSON.stringify(validated.errors)}`);
    const rendered = renderItineraryHtml(validated.value, { ...renderResources, assets });
    if (rendered.errors.length) throw new Error(`${fixture.id}: ${JSON.stringify(rendered.errors)}`);
    if (!rendered.html.includes('SIL OPEN FONT LICENSE')) failures.push(`${fixture.id}: bundled font license notice missing`);
    if (Buffer.byteLength(rendered.html, 'utf8') > 64 * 1024 * 1024 || fontBytes > 16 * 1024 * 1024) failures.push(`${fixture.id}: self-contained bundle exceeds the configured size limit`);
    if (/\{\{[^}]+\}\}|undefined|\[object Object\]/i.test(rendered.html)) failures.push(`${fixture.id}: unresolved placeholder or object text`);
    const heroMarkup = (rendered.html.match(/class="hero-image"/g) || []).length;
    const scheduleMarkup = (rendered.html.match(/aspect-\[16\/7\]/g) || []).length;
    if (fixture.expectHeroImage && heroMarkup !== 1) failures.push(`${fixture.id}: expected hero photo markup missing (${heroMarkup})`);
    if (!fixture.expectHeroImage && heroMarkup !== 0) failures.push(`${fixture.id}: unexpected hero photo markup (${heroMarkup})`);
    if (fixture.expectScheduleImage && scheduleMarkup !== 1) failures.push(`${fixture.id}: expected schedule photo markup missing (${scheduleMarkup})`);
    if (!fixture.expectScheduleImage && scheduleMarkup !== 0) failures.push(`${fixture.id}: unexpected schedule photo markup (${scheduleMarkup})`);
    const contactSentinel = `contact-${fixture.content.brochure.outputLanguage}@example.test`;
    if (!rendered.html.includes(contactSentinel)) failures.push(`${fixture.id}: authoritative agency contact ${contactSentinel} missing from render`);
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
    const matchingFont = fixture.content.brochure.outputLanguage === 'ja' ? mobile.jpFont
      : fixture.content.brochure.outputLanguage === 'zh-Hans' ? mobile.scFont : mobile.latinFont;
    if (mobile.lang !== fixture.content.brochure.outputLanguage) failures.push(`${fixture.id}: document lang mismatch`);
    if (mobile.width > mobile.viewport + 1) failures.push(`${fixture.id}: mobile horizontal overflow ${mobile.width}/${mobile.viewport}`);
    if (mobile.brokenImages) failures.push(`${fixture.id}: ${mobile.brokenImages} broken image(s)`);
    if (!mobile.text.includes(fixture.content.brochure.tripTitle)) failures.push(`${fixture.id}: title missing from DOM`);
    if (!matchingFont) failures.push(`${fixture.id}: bundled locale font did not load or cover its sample glyphs`);
    if (externalRequests.length) failures.push(`${fixture.id}: external requests ${externalRequests.length}`);
    if (consoleErrors.length) failures.push(`${fixture.id}: console errors ${consoleErrors.length}`);

    const localeTag = String(fixture.content.brochure.outputLanguage);
    const expectedContact = `contact-${localeTag}@example.test`;
    const theme = String(fixture.content.brochure.themes[0]);
    if (!mobile.text.includes(expectedContact)) failures.push(`${fixture.id}: authoritative agency contact missing from DOM`);
    if (!mobile.text.includes('+62-000-0000')) failures.push(`${fixture.id}: emergency contact value missing from DOM`);
    if (!mobile.text.includes(theme)) failures.push(`${fixture.id}: brochure theme ${theme} missing from DOM`);
    if (fixture.durationLabel && !mobile.text.includes(fixture.durationLabel)) failures.push(`${fixture.id}: localized duration label ${fixture.durationLabel} missing from DOM`);
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
      const notdef = context.measureText('\uE000').width;
      const widths = [...sample].map((character) => ({ character, width: context.measureText(character).width }));
      return { faceCount: faces.length, loaded: faces.some((entry) => entry.status === 'loaded'), notdef, widths };
    }, { family: glyphFamily, sample: glyphSample });
    if (!glyphState.loaded) failures.push(`${fixture.id}: no loaded font face for ${glyphFamily}`);
    const tofu = glyphState.widths.filter((entry) => Math.abs(entry.width - glyphState.notdef) < 0.5).map((entry) => entry.character);
    if (tofu.length) failures.push(`${fixture.id}: glyphs render as notdef boxes: ${tofu.join('')}`);

    const mobilePath = path.join(outputDir, `${fixture.id}-mobile.png`);
    await page.screenshot({ path: mobilePath, type: 'png', fullPage: true });
    await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 });
    await page.screenshot({ path: path.join(outputDir, `${fixture.id}-desktop.png`), type: 'png', fullPage: true });
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
      fixture: fixture.id, locale: localeTag, htmlBytes, fontBytes, pdfBytes: pdf.length, pages,
      mobileOverflow: mobile.width > mobile.viewport + 1, desktopOverflow,
      externalRequests: externalRequests.length, consoleErrors: consoleErrors.length,
      glyphFaces: glyphState.faceCount, heroMarkup, scheduleMarkup, groupHeadings: fixture.guideOrder ? (mobile.text.match(/Area \d/g) || []).length : null
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
