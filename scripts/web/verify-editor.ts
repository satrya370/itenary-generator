import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import puppeteer from 'puppeteer';
import { createApp } from '../../src/server/app.js';
import type { RecordDto } from '../../src/api/client.js';
import type { ItineraryMode } from '../../src/contracts/types.js';
import { modeCopy } from '../../src/editor/labels.js';
import { completeSetup } from './complete-setup.js';

const SCHEDULED_BASE = ['trip-info', 'time-meeting', 'trip-guide', 'cover', 'summary'];
const TAIL = ['practical', 'closing', 'ai-assist'];
const SECTIONS: Record<ItineraryMode, string[]> = {
  half_day: [...SCHEDULED_BASE, 'schedule', ...TAIL],
  full_day: [...SCHEDULED_BASE, 'schedule', ...TAIL],
  multi_day: [...SCHEDULED_BASE, 'days', ...TAIL],
  destination_guide: ['trip-info', 'trip-guide', 'cover', 'summary', 'places', ...TAIL]
};

async function availablePort() {
  const server = net.createServer();
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen({ port: 0, host: '127.0.0.1' }, () => resolve()); });
  const port = (server.address() as net.AddressInfo).port;
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  return port;
}

async function main() {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'itinerary-r5-browser-'));
  const port = await availablePort(); const origin = `http://127.0.0.1:${port}`;
  const app = await createApp({ dataDir, publicOrigin: origin, allowedOrigins: [origin] });
  await completeSetup(app, origin);
  await app.listen({ host: '127.0.0.1', port });
  const browser = await puppeteer.launch({ headless: 'shell', args: ['--disable-background-networking', '--no-first-run'] });
  const evidenceDir = path.resolve('output/web-editor'); await mkdir(evidenceDir, { recursive: true });
  const page = await browser.newPage(); const failures: string[] = []; const external: string[] = [];
  const viewportResults: Array<{ mode: string; viewport: number; document: number }> = [];
  page.on('console', message => { if (message.type() === 'error' && !message.text().includes('Failed to load resource')) failures.push(message.text()); });
  page.on('request', request => { const url = new URL(request.url()); if (['http:', 'https:'].includes(url.protocol) && url.origin !== origin) external.push(request.url()); });
  page.on('dialog', dialog => dialog.accept());

  const sel = (fieldPath: string) => `[data-field-path="${fieldPath}"]`;
  async function set(fieldPath: string, value: string, index = 0) {
    await page.evaluate(({ selector, value, index }) => {
      const element = document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(selector)[index];
      if (!element) throw new Error(`field not found: ${selector}[${index}]`);
      const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : element instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(element, value);
      element.dispatchEvent(new Event(element instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }));
    }, { selector: sel(fieldPath), value, index });
  }
  const values = (fieldPath: string) => page.evaluate(selector => [...document.querySelectorAll<HTMLInputElement>(selector)].map(element => element.value), sel(fieldPath));
  const count = (selector: string) => page.evaluate(selector => document.querySelectorAll(selector).length, selector);
  async function clickButton(text: string, index = 0) {
    const found = await page.evaluate(({ text, index }) => {
      const buttons = [...document.querySelectorAll('button')].filter(button => button.textContent?.trim() === text || button.getAttribute('aria-label') === text);
      if (!buttons[index]) return false;
      buttons[index].click(); return true;
    }, { text, index });
    assert.ok(found, `button not found: ${text}[${index}]`);
  }
  const waitStatus = (text: string) => page.waitForFunction(expected => document.querySelector('[role="status"]')?.textContent?.includes(expected), {}, text);
  const currentId = () => page.evaluate(() => document.querySelector<HTMLElement>('[data-field-path="trip.title"]')?.id.replace(/-trip-title$/, '') ?? '');
  const sections = () => page.evaluate(() => [...document.querySelectorAll<HTMLElement>('[data-editor-section]')].map(element => element.dataset.editorSection));
  async function createMode(mode: ItineraryMode) {
    const before = await currentId();
    await page.click(`[data-mode-card="${mode}"]`);
    await page.waitForFunction(previous => {
      const id = document.querySelector<HTMLElement>('[data-field-path="trip.title"]')?.id.replace(/-trip-title$/, '');
      return Boolean(id) && id !== previous && document.querySelector('[role="status"]')?.textContent?.includes('Draft baru tersimpan');
    }, {}, before);
    assert.deepEqual(await sections(), SECTIONS[mode], `${mode} sections`);
    const badge = await page.evaluate(() => document.querySelector('h2.text-xl')?.nextElementSibling?.textContent);
    assert.equal(badge, modeCopy[mode].title, `${mode} badge`);
    return currentId();
  }
  async function save() { await clickButton('Simpan draft'); await waitStatus('Tersimpan · revisi'); }
  async function openTitle(title: string) {
    await page.evaluate(text => {
      const button = [...document.querySelectorAll('aside button')].find(item => item.textContent?.includes(text));
      if (!button) throw new Error(`draft list item not found: ${text}`);
      (button as HTMLButtonElement).click();
    }, title);
    await waitStatus('Draft dibuka');
  }
  async function reopen(title: string) { await page.reload(); await waitStatus('Engine tersambung'); await openTitle(title); }
  async function captureMode(mode: ItineraryMode) {
    for (const [width, height] of [[390, 844], [1280, 900]] as const) {
      await page.setViewport({ width, height });
      const size = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth }));
      viewportResults.push({ mode, ...size });
      assert.ok(size.document <= size.viewport, `${mode} ${width}px overflow: ${JSON.stringify(size)}`);
      await page.screenshot({ path: path.join(evidenceDir, `r5-${mode}-${width}.png`), fullPage: true });
    }
    await page.setViewport({ width: 1280, height: 900 });
  }
  const getRecord = (id: string): Promise<RecordDto> => page.evaluate(async id => await (await fetch(`/api/v1/itineraries/${id}`)).json(), id);

  try {
    await page.setViewport({ width: 1280, height: 900 });
    await page.goto(origin); await waitStatus('Engine tersambung');

    // 1-2. Half day: sections, save/reopen identical, reorder keeps IDs, 409 conflict flow.
    const halfId = await createMode('half_day');
    await page.setViewport({ width: 1280, height: 900 });
    await page.evaluate(() => { document.querySelector<HTMLInputElement>('[data-field-path="trip.region"]')?.focus(); });
    await page.keyboard.press('Tab');
    const focusRing = await page.evaluate(() => {
      const radio = document.activeElement as HTMLInputElement | null;
      const label = radio?.closest('label');
      return { focused: radio?.dataset.fieldPath ?? null, outlineWidth: label ? getComputedStyle(label).outlineWidth : '0px' };
    });
    assert.equal(focusRing.focused, 'trip.colorTheme', 'keyboard focus reaches a theme swatch');
    assert.notEqual(focusRing.outlineWidth, '0px', 'focused theme swatch shows a visible outline');
    await page.evaluate(() => document.querySelector<HTMLInputElement>('[data-field-path="trip.colorTheme"]')?.closest('fieldset')?.scrollIntoView({ block: 'center' }));
    await page.screenshot({ path: path.join(evidenceDir, 'r5-theme-focus.png') });
    await set('trip.title', 'R5 half day'); await set('trip.destination', 'Kyoto'); await set('trip.country', 'Japan'); await set('trip.language', 'ja');
    await set('summary', 'A relaxed walk through Kyoto gardens.');
    await set('days[].activities[].title', 'Garden visit', 0); await set('days[].activities[].time', '08:30', 0);
    await clickButton('Tambah aktivitas');
    await set('days[].activities[].title', 'Tea ceremony', 1); await set('days[].activities[].time', '10:00', 1);
    await clickButton('Naikkan', 1);
    assert.deepEqual(await values('days[].activities[].title'), ['Tea ceremony', 'Garden visit']);
    await save();
    const halfSaved = await getRecord(halfId);
    const activityIds = halfSaved.draftContent.days[0].activities.map(item => item.id);
    assert.deepEqual(halfSaved.draftContent.days[0].activities.map(item => item.title), ['Tea ceremony', 'Garden visit']);
    await captureMode('half_day');
    await reopen('R5 half day');
    assert.deepEqual(await values('days[].activities[].title'), ['Tea ceremony', 'Garden visit']);
    assert.deepEqual(await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('[data-editor-section="schedule"] fieldset[data-target-id]')].map(element => element.dataset.targetId)), activityIds);
    assert.equal((await values('trip.title'))[0], 'R5 half day');
    assert.equal((await values('summary'))[0], 'A relaxed walk through Kyoto gardens.');
    assert.deepEqual((await getRecord(halfId)).draftContent, halfSaved.draftContent, 'reopen does not change the saved draft');

    // A 422 on save: readable labels, and the button focuses the exact activity (second one), not the first.
    await set('summary', 'Edit that triggers a rejected save');
    const rejectSave = async (request: import('puppeteer').HTTPRequest) => {
      if (request.method() === 'PATCH' && request.url().includes(`/api/v1/itineraries/${halfId}`)) {
        await request.respond({ status: 422, contentType: 'application/json', body: JSON.stringify({ error: { code: 'INVALID_DOCUMENT', message: 'Synthetic rejection', fields: [{ code: 'SCHEMA_VALIDATION_FAILED', path: 'days[0].activities[1].time', message: 'pattern: invalid value' }] } }) });
      } else await request.continue();
    };
    page.on('request', rejectSave); await page.setRequestInterception(true);
    await clickButton('Simpan draft'); await page.waitForSelector('[aria-label="Kesalahan draft"] button');
    page.off('request', rejectSave); await page.setRequestInterception(false);
    assert.equal(await page.$eval('[aria-label="Kesalahan draft"] button', element => element.textContent), 'Jam: pattern: invalid value');
    await page.click('[aria-label="Kesalahan draft"] button');
    assert.equal(await page.evaluate(() => document.activeElement?.id), `${halfId}-activity-time-${activityIds[1]}`, 'save error focuses the exact activity');
    await set('summary', 'Local conflict copy');
    const conflictStatus = await page.evaluate(async id => {
      const current = await (await fetch(`/api/v1/itineraries/${id}`)).json();
      const content = structuredClone(current.draftContent); content.summary = 'Server latest copy';
      return (await fetch(`/api/v1/itineraries/${id}`, { method: 'PATCH', headers: { 'content-type': 'application/json', 'x-engine-request': '1' }, body: JSON.stringify({ expectedRevision: current.revision, draftContent: content, languageContext: current.languageContext, writingContext: current.writingContext }) })).status;
    }, halfId);
    assert.equal(conflictStatus, 200);
    await clickButton('Simpan draft'); await waitStatus('Konflik:');
    assert.equal((await values('summary'))[0], 'Local conflict copy');
    await clickButton('Muat revisi terbaru'); await waitStatus('Versi terbaru dimuat');
    assert.equal((await values('summary'))[0], 'Server latest copy');

    // 3. Mode change: cancel changes nothing; confirm clears start/end time and gives two days.
    await set('trip.startTime', '09:00');
    await set('trip.mode', 'multi_day');
    await page.waitForSelector('[role="dialog"] ul li');
    assert.deepEqual(await page.$$eval('[role="dialog"] ul li', items => items.map(item => item.textContent)), ['jam mulai/selesai']);
    await clickButton('Batal');
    assert.equal(await page.$('[role="dialog"]'), null);
    assert.equal((await values('trip.mode'))[0], 'half_day');
    assert.equal((await values('trip.startTime'))[0], '09:00');
    assert.deepEqual(await sections(), SECTIONS.half_day);
    await set('trip.mode', 'multi_day'); await clickButton('Ganti tipe');
    assert.deepEqual(await sections(), SECTIONS.multi_day);
    assert.equal(await count('[data-editor-section="days"] div[data-target-id]'), 2);
    assert.equal(await count(sel('trip.startTime')), 0);
    await save();
    const converted = await getRecord(halfId);
    assert.equal(converted.draftContent.trip.mode, 'multi_day');
    assert.equal(converted.draftContent.trip.startTime, null);
    assert.equal(converted.draftContent.days.length, 2);

    // Full day.
    const fullId = await createMode('full_day');
    assert.equal(await count(sel('days[].hotel.name')), 0);
    assert.equal(await count(sel('days[].meals.lunch')), 1);
    await set('trip.title', 'R5 full day'); await set('trip.destination', 'Kyoto');
    await save();
    assert.equal((await getRecord(fullId)).draftContent.days.length, 1);
    await captureMode('full_day');
    await reopen('R5 full day');
    assert.equal((await values('trip.title'))[0], 'R5 full day');

    // 4. Multi day: reorder keeps IDs, 14-day limit, reopen.
    const multiId = await createMode('multi_day');
    assert.equal(await count(sel('days[].hotel.name')), 2);
    await set('trip.title', 'R5 multi day'); await set('trip.language', 'en');
    await set('days[].title', 'Day one', 0); await set('days[].title', 'Day two', 1);
    await save();
    const beforeReorder = await getRecord(multiId);
    await clickButton('Naikkan hari', 1);
    assert.deepEqual(await values('days[].title'), ['Day two', 'Day one']);
    await save();
    const afterReorder = await getRecord(multiId);
    assert.deepEqual(afterReorder.draftContent.days.map(day => day.dayNumber), [1, 2]);
    assert.deepEqual(afterReorder.draftContent.days.map(day => day.title), ['Day two', 'Day one']);
    assert.deepEqual(afterReorder.draftContent.days.map(day => day.id).sort(), beforeReorder.draftContent.days.map(day => day.id).sort());
    await captureMode('multi_day');
    for (let days = 3; days <= 14; days++) {
      await clickButton('Tambah hari');
      await page.waitForFunction(expected => document.querySelectorAll('[data-editor-section="days"] div[data-target-id]').length === expected, {}, days);
    }
    assert.equal(await page.evaluate(() => [...document.querySelectorAll('button')].find(button => button.textContent?.trim() === 'Tambah hari')?.disabled), true);
    await save();
    const fourteen = await getRecord(multiId);
    assert.equal(fourteen.draftContent.days.length, 14);
    assert.deepEqual(fourteen.draftContent.days.map(day => day.dayNumber), Array.from({ length: 14 }, (_, index) => index + 1));
    assert.equal(new Set(fourteen.draftContent.days.map(day => day.id)).size, 14);
    await reopen('R5 multi day');
    assert.equal(await count('[data-editor-section="days"] div[data-target-id]'), 14);

    // 5. Guide: details, lists, photo credit, language note, mode change, then the 60-place limit.
    const guideId = await createMode('destination_guide');
    assert.equal(await count(sel('places[].name')), 0);
    await clickButton('Tambah tempat');
    await set('trip.title', 'R5 guide');
    await set('places[].name', 'East Garden'); await set('places[].group', 'Eastern Kyoto'); await set('places[].area', 'Higashiyama');
    await set('places[].description', 'Quiet paths and local heritage.');
    await set('places[].suggestedDuration', '90 minutes'); await set('places[].bestTime', 'Morning'); await set('places[].gettingThere', 'Take the local bus.');
    await clickButton('Tambah tips'); await set('places[].tips[]', 'Wear comfortable shoes.');
    await clickButton('Tambah termasuk'); await set('included[]', 'Local guide', 0);
    await clickButton('Tambah termasuk'); await set('included[]', 'Entrance fee', 1);
    assert.deepEqual(await values('included[]'), ['Local guide', 'Entrance fee']);
    page.removeAllListeners('dialog'); page.once('dialog', dialog => { void dialog.dismiss(); });
    await clickButton('Hapus Termasuk 2');
    assert.deepEqual(await values('included[]'), ['Local guide', 'Entrance fee']);
    page.removeAllListeners('dialog'); page.on('dialog', dialog => dialog.accept());
    await clickButton('Hapus Termasuk 2');
    assert.deepEqual(await values('included[]'), ['Local guide']);
    await clickButton('Tambah tidak termasuk');
    await clickButton('Tambah kontak darurat (nama)'); await set('emergencyContacts[].label', 'Police'); await set('emergencyContacts[].value', '110');
    await set('writing.brief', 'A quiet garden trip for two.'); await clickButton('Tambah catatan fakta itinerary'); await set('writing.notes[]', 'Guide confirmed the north entrance.');
    assert.equal(await page.$eval('[data-field-path="trip.language"]', element => element.tagName), 'SELECT', 'language is a dropdown');
    assert.equal(await page.$eval('[data-field-path="trip.language"]', element => (element as HTMLSelectElement).querySelector('option[value="zh-Hant"]')), null, 'zh-Hant is not offered');
    await set('trip.language', 'zh-Hans');
    await page.waitForFunction(() => document.querySelector('[data-field-path="trip.language"]')?.getAttribute('value') !== 'zh-Hant');
    await page.evaluate(async () => {
      const canvas = document.createElement('canvas'); canvas.width = 16; canvas.height = 12;
      const context = canvas.getContext('2d')!; context.fillStyle = '#147d92'; context.fillRect(0, 0, 16, 12);
      const blob = await new Promise<Blob>(resolve => canvas.toBlob(value => resolve(value!), 'image/png'));
      const transfer = new DataTransfer(); transfer.items.add(new File([blob], 'verify-editor.png', { type: 'image/png' }));
      const input = document.querySelector<HTMLInputElement>('#asset-upload')!; input.files = transfer.files; input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await waitStatus('Aset tersimpan');
    const assetId = (await page.evaluate(async () => await (await fetch('/api/v1/assets')).json())).items[0].id as string;
    assert.equal(await count(sel('cover.credit.photographer')), 0, 'credit fields appear only after a photo is chosen');
    await set('cover.assetId', assetId);
    await set('cover.credit.photographer', 'Fixture photographer'); await set('cover.credit.source', 'Synthetic guide photo');
    await save();
    const guide = await getRecord(guideId);
    assert.deepEqual(guide.draftContent.notIncluded, [], 'an empty list row is not saved');
    assert.equal(guide.draftContent.places[0].name, 'East Garden');
    assert.equal(guide.draftContent.places[0].description, 'Quiet paths and local heritage.');
    assert.deepEqual(guide.draftContent.places[0].tips, ['Wear comfortable shoes.']);
    assert.equal(guide.draftContent.cover?.assetId, assetId);
    assert.equal(guide.draftContent.cover?.credit?.photographer, 'Fixture photographer');
    assert.equal(guide.draftContent.emergencyContacts[0].value, '110');
    assert.deepEqual(guide.draftContent.included, ['Local guide']);
    assert.equal(guide.writingContext.brief, 'A quiet garden trip for two.');
    assert.equal(guide.writingContext.notes[0].targetId, 'itinerary');
    await captureMode('destination_guide');
    await reopen('R5 guide');
    assert.equal((await values('places[].name'))[0], 'East Garden');

    await set('trip.mode', 'full_day');
    await page.waitForSelector('[role="dialog"] ul li');
    assert.deepEqual(await page.$$eval('[role="dialog"] ul li', items => items.map(item => item.textContent)), ['1 tempat']);
    await clickButton('Batal');
    assert.equal((await values('places[].name'))[0], 'East Garden');
    await set('trip.mode', 'full_day'); await clickButton('Ganti tipe');
    assert.equal(await count(sel('places[].name')), 0);
    assert.deepEqual(await sections(), SECTIONS.full_day);

    const manyId = await createMode('destination_guide');
    await set('trip.title', 'R5 60 places');
    for (let places = 1; places <= 60; places++) {
      await clickButton('Tambah tempat');
      await page.waitForFunction(expected => document.querySelectorAll('[data-editor-section="places"] fieldset[data-target-id]').length === expected, {}, places);
    }
    assert.equal(await page.evaluate(() => [...document.querySelectorAll('button')].find(button => button.textContent?.trim() === 'Tambah tempat')?.disabled), false, 'no place cap: the button stays enabled at 60');
    const longJapanese = '静かな庭園を歩き、地域の文化と景色を楽しみます。'.repeat(12);
    await page.evaluate(({ longJapanese }) => {
      const writes: Array<[string, number, string]> = [];
      for (let index = 0; index < 60; index++) {
        writes.push(['[data-field-path="places[].name"]', index, index === 0 ? '茶室' : `Place ${index + 1}`]);
        writes.push(['[data-field-path="places[].area"]', index, 'Kyoto']);
        writes.push(['[data-field-path="places[].group"]', index, index < 30 ? 'Eastern Kyoto' : 'Western Kyoto']);
        writes.push(['[data-field-path="places[].description"]', index, index === 1 ? longJapanese : 'Short description.']);
      }
      for (const [selector, index, value] of writes) {
        const element = document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(selector)[index];
        const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(element, value);
        element.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }, { longJapanese });
    assert.equal(await count('[data-editor-section="places"] h4'), 2, 'one group heading per run of equal groups');
    await save();
    const many = await getRecord(manyId);
    assert.equal(many.draftContent.places.length, 60);
    assert.equal(many.draftContent.places[0].name, '茶室');
    assert.equal(many.draftContent.places[1].description, longJapanese);
    assert.equal(new Set(many.draftContent.places.map(place => place.id)).size, 60);
    await clickButton('Turunkan', 0);
    assert.deepEqual((await values('places[].name')).slice(0, 2), ['Place 2', '茶室']);
    await save();
    assert.deepEqual((await getRecord(manyId)).draftContent.places.slice(0, 2).map(place => place.name), ['Place 2', '茶室']);
    await reopen('R5 60 places');
    assert.equal(await count(sel('places[].name')), 60);

    // 6-7. No overflow at 390/1280, no console errors, no external requests.
    assert.deepEqual(['half_day', 'full_day', 'multi_day', 'destination_guide'].filter(mode => viewportResults.filter(result => result.mode === mode).length !== 2), []);
    assert.deepEqual(external, []);
    assert.deepEqual(failures, []);
    const summary = {
      modes: Object.keys(SECTIONS), sections: SECTIONS, activityOrder: ['Tea ceremony', 'Garden visit'], reorderedDayTitles: ['Day two', 'Day one'],
      fourteenDays: fourteen.draftContent.days.length, sixtyPlaces: many.draftContent.places.length, modeChangeLosses: { toMultiDay: ['jam mulai/selesai'], fromGuide: ['1 tempat'] },
      viewportResults, externalRequests: external.length, consoleErrors: failures.length
    };
    await writeFile(path.join(evidenceDir, 'verification-summary.json'), JSON.stringify(summary, null, 2));
    console.log(JSON.stringify(summary));
  } finally {
    await browser.close(); await app.close(); await rm(dataDir, { recursive: true, force: true });
  }
}

await main();
