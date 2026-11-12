import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import puppeteer from 'puppeteer';
import { createApp } from '../../src/server/app.js';
import type { PlaceSuggestion, PlacesAutocompleteInput, PlacesProvider, PlacesSource } from '../../src/server/places/provider.js';
import { completeSetup } from './complete-setup.js';

// Provider double: records every call and answers without any network access.
const CATALOG: Record<string, PlaceSuggestion[]> = {
  ubud: [{ placeId: 'PLACE-UBUD-PALACE', mainText: 'Ubud Palace', secondaryText: 'Ubud, Bali' }, { placeId: 'PLACE-UBUD-MARKET', mainText: 'Ubud Market', secondaryText: 'Ubud, Bali' }],
  kuta: [{ placeId: 'PLACE-KUTA-BEACH', mainText: 'Kuta Beach', secondaryText: 'Kuta, Bali' }, { placeId: 'PLACE-KUTA-SQUARE', mainText: 'Kuta Square', secondaryText: 'Kuta, Bali' }],
  sanur: [{ placeId: 'PLACE-SANUR', mainText: 'Sanur Beach', secondaryText: 'Sanur, Bali' }]
};
const calls: PlacesAutocompleteInput[] = [];
const doubleProviderFor = (source: PlacesSource): PlacesProvider => ({
  source,
  configured: true,
  async autocomplete(input) {
    calls.push(input);
    const key = Object.keys(CATALOG).find((name) => input.text.toLowerCase().includes(name));
    return key ? CATALOG[key] : [];
  }
});

async function availablePort() {
  const server = net.createServer();
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen({ port: 0, host: '127.0.0.1' }, () => resolve()); });
  const port = (server.address() as net.AddressInfo).port;
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  return port;
}

async function main(source: PlacesSource) {
  calls.length = 0;
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'itinerary-cp036-browser-'));
  const port = await availablePort(); const origin = `http://127.0.0.1:${port}`;
  const app = await createApp({ dataDir, publicOrigin: origin, allowedOrigins: [origin], placesProvider: doubleProviderFor(source), placesDailyLimit: 4 });
  await completeSetup(app, origin);
  await app.listen({ host: '127.0.0.1', port });
  const browser = await puppeteer.launch({ headless: 'shell', args: ['--disable-background-networking', '--no-first-run'] });
  const evidenceDir = path.resolve('output/web-places', source); await mkdir(evidenceDir, { recursive: true });
  const page = await browser.newPage(); const failures: string[] = []; const external: string[] = [];
  page.on('console', message => { if (message.type() === 'error' && !message.text().includes('Failed to load resource')) failures.push(message.text()); });
  page.on('request', request => { const url = new URL(request.url()); if (['http:', 'https:'].includes(url.protocol) && url.origin !== origin) external.push(request.url()); });
  page.on('dialog', dialog => dialog.accept());
  await page.setViewport({ width: 1280, height: 900 });

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
  const valueOf = (fieldPath: string) => page.evaluate(selector => document.querySelector<HTMLInputElement>(selector)?.value ?? null, sel(fieldPath));
  const waitStatus = (text: string) => page.waitForFunction(expected => document.querySelector('[role="status"]')?.textContent?.includes(expected), {}, text);
  async function clickButton(text: string) {
    const found = await page.evaluate((expected) => {
      const button = [...document.querySelectorAll('button')].find(item => item.textContent?.trim() === expected);
      if (!button) return false;
      button.click(); return true;
    }, text);
    assert.ok(found, `button not found: ${text}`);
  }
  async function openStep(titleStart: string) {
    titleStart = ({ Jadwal: 'Susun perjalanan', Waktu: 'Info perjalanan' } as Record<string, string>)[titleStart] ?? titleStart;
    const found = await page.evaluate((expected) => {
      const button = [...document.querySelectorAll('button')].find(item => item.textContent?.replace(/^\d+\.\s*/, '').trim().startsWith(expected));
      if (!button) return false;
      button.click(); return true;
    }, titleStart);
    assert.ok(found, `step not found: ${titleStart}`);
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  const listOptions = () => page.evaluate(() => [...document.querySelectorAll<HTMLElement>('[role="listbox"] [role="option"]')].map(item => item.querySelector('.font-medium')?.textContent ?? ''));
  const noteText = (id: string) => page.evaluate(noteId => document.querySelector(`[id="${noteId}"]`)?.textContent ?? '', id);
  const searchNote = (fieldId: string) => `${fieldId}-places-note`;
  const fieldIdOf = (fieldPath: string) => page.evaluate(selector => document.querySelector<HTMLElement>(selector)?.id ?? '', sel(fieldPath));

  try {
    await page.goto(origin); await waitStatus('Engine tersambung');
    await page.evaluate(() => [...document.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim() === 'Buat itinerary baru' && !b.disabled)?.click()); await page.waitForSelector('[data-mode-card]:not([disabled])'); await page.click('[data-mode-card="full_day"]'); await page.waitForSelector('[data-method="manual"]'); await page.click('[data-method="manual"]'); await page.evaluate(() => [...document.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim() === 'Mulai isi')?.click());
    await waitStatus('Draft baru tersimpan');
    await set('trip.title', 'Bali places'); await set('trip.destination', 'Bali'); await set('trip.country', 'Indonesia'); await set('trip.language', 'en');
    await set('summary', 'A day around Ubud and the south coast.');
    await set('days[].activities[].title', 'Palace visit', 0); await set('days[].activities[].time', '09:00', 0);

    // Activity place: keyboard only (type, ArrowDown, Enter).
    await openStep('Jadwal');
    await page.click(sel('days[].activities[].place'));
    await page.keyboard.type('Ubud');
    await page.waitForSelector('[role="listbox"] [role="option"]', { timeout: 5000 });
    assert.deepEqual(await listOptions(), ['Ubud Palace', 'Ubud Market'], 'suggestions for Ubud');
    assert.equal(await page.evaluate(() => document.querySelector('[data-field-path="days[].activities[].place"]')?.getAttribute('aria-expanded')), 'true', 'combobox reports the open list');
    await page.setViewport({ width: 390, height: 844 });
    await page.evaluate(() => document.querySelector<HTMLElement>('[data-field-path="days[].activities[].place"]')?.scrollIntoView({ block: 'center' }));
    await page.screenshot({ path: path.join(evidenceDir, 'cp036-dropdown-390.png') });
    await page.setViewport({ width: 1280, height: 900 });
    assert.equal(await page.evaluate(() => document.querySelector('[data-field-path="days[].activities[].place"]')?.getAttribute('aria-expanded')), 'true', 'list still open at 1280');
    const attribution = await page.evaluate(() => { const element = document.querySelector('[data-places-attribution]'); return element ? { source: element.getAttribute('data-places-attribution'), text: element.textContent?.trim() ?? '', link: element.querySelector('a')?.getAttribute('href') ?? null } : null; });
    assert.ok(attribution, 'attribution is shown with the suggestions');
    assert.equal(attribution!.source, source);
    assert.equal(attribution!.text, source === 'google' ? 'Powered by Google' : '© OpenStreetMap contributors');
    assert.equal(attribution!.link, source === 'google' ? null : 'https://www.openstreetmap.org/copyright');
    await page.evaluate(() => document.querySelector<HTMLElement>('[data-field-path="days[].activities[].place"]')?.scrollIntoView({ block: 'center' }));
    await page.screenshot({ path: path.join(evidenceDir, 'cp036-dropdown-1280.png') });
    await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter');
    assert.equal(await valueOf('days[].activities[].place'), 'Ubud Palace', 'Enter fills the activity place with the main text');
    assert.equal(await page.evaluate(() => document.querySelector('[role="listbox"]')), null, 'the list closes after a pick');

    // Free text still works: a typed place that the provider does not know is kept as typed.
    await set('days[].activities[].place', 'Warung dekat pasar');
    await page.click(sel('days[].activities[].place'));
    await page.keyboard.press('End'); await page.keyboard.type('!');
    await new Promise(resolve => setTimeout(resolve, 800));
    assert.equal(await valueOf('days[].activities[].place'), 'Warung dekat pasar!', 'free text is never overwritten by a suggestion list');
    assert.equal(await page.evaluate(() => document.querySelector('[role="listbox"]')), null, 'no suggestions means no list');
    // A query longer than the server accepts (100) is typed, not searched: no request and no misleading note.
    const callsBeforeLong = calls.length;
    await set('days[].activities[].place', 'x'.repeat(120));
    await page.click(sel('days[].activities[].place'));
    await page.keyboard.press('End'); await page.keyboard.type('y');
    await new Promise(resolve => setTimeout(resolve, 800));
    assert.equal(calls.length, callsBeforeLong, 'no provider call for an over-long query');
    assert.equal(await page.evaluate(() => document.querySelector('[data-field-path="days[].activities[].place"]')?.getAttribute('aria-describedby')), null, 'no note for an over-long query');
    await set('days[].activities[].place', 'Ubud Palace');

    // Meeting point: pick with the keyboard (second option) and check the Maps link.
    await openStep('Waktu');
    await page.click(sel('meeting.place'));
    await page.keyboard.type('Kuta');
    await page.waitForSelector('[role="listbox"] [role="option"]', { timeout: 5000 });
    await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter');
    assert.equal(await valueOf('meeting.place'), 'Kuta Square', 'second option picked with the keyboard');
    const mapsUrl = await valueOf('meeting.mapsUrl');
    assert.ok(mapsUrl, 'meeting Maps link is filled from the pick');
    const link = new URL(mapsUrl!);
    assert.equal(link.searchParams.get('query_place_id'), source === 'google' ? 'PLACE-KUTA-SQUARE' : null, 'only Google picks carry a Maps place ID');
    assert.equal(link.searchParams.get('query'), 'Kuta Square, Kuta, Bali');
    assert.equal((await valueOf('meeting.mapsUrl'))?.includes('query_place_id='), source === 'google', 'Maps link keeps the place ID after a Google pick only');

    // Escape closes the list without picking.
    await set('meeting.place', '');
    await page.click(sel('meeting.place'));
    await page.keyboard.type('Sanur');
    await page.waitForSelector('[role="listbox"] [role="option"]', { timeout: 5000 });
    await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(() => document.querySelector('[role="listbox"]')), null, 'Escape closes the list');

    // Four searches so far (Ubud, Warung, Kuta, Sanur) use up the cap of 4: the next search shows the plain message and makes no provider call.
    const callsBefore = calls.length;
    assert.equal(callsBefore, 4, 'four Google searches before the cap: Ubud, Warung, Kuta, Sanur');
    await page.keyboard.press('Backspace');
    await page.keyboard.type('r');
    await new Promise(resolve => setTimeout(resolve, 900));
    const capNote = await noteText(searchNote(await fieldIdOf('meeting.place')));
    assert.equal(capNote, 'Batas harian autocomplete tercapai; ketik manual sampai besok.', 'cap message is shown in Indonesian');
    assert.equal(calls.length, callsBefore, 'no provider call after the cap');
    const serverHitsAfterCap = await page.evaluate(() => performance.getEntriesByType('resource').filter(entry => entry.name.includes('/places/autocomplete')).length);
    await page.keyboard.type('bc'); await new Promise(resolve => setTimeout(resolve, 800));
    assert.equal(await page.evaluate(() => performance.getEntriesByType('resource').filter(entry => entry.name.includes('/places/autocomplete')).length), serverHitsAfterCap, 'the browser stops asking the server once the cap is reported');
    assert.equal(await noteText(searchNote(await fieldIdOf('meeting.place'))), 'Batas harian autocomplete tercapai; ketik manual sampai besok.', 'the cap message stays on screen');
    await page.keyboard.press('Backspace'); await page.keyboard.press('Backspace');
    await page.keyboard.type('a');
    assert.equal(await valueOf('meeting.place'), 'Sanura', 'typing continues as free text after the cap');

    await clickButton('Simpan draft');
    await waitStatus('Tersimpan · revisi');
    const list = (await app.inject({ url: '/api/v1/itineraries' })).json();
    const record = (await app.inject({ url: `/api/v1/itineraries/${list.items[0].id}` })).json();
    assert.equal(record.draftContent.days[0].activities[0].place, 'Ubud Palace', 'saved activity place');
    assert.equal(record.draftContent.meeting.place, 'Sanura', 'saved meeting place is the typed free text');
    assert.equal(String(record.draftContent.meeting.mapsUrl).includes('query_place_id=PLACE-KUTA-SQUARE'), source === 'google', 'saved Maps link matches the source');
    assert.ok(String(record.draftContent.meeting.mapsUrl).startsWith('https://www.google.com/maps/search/?api=1&query=Kuta%20Square'), 'saved Maps link is a plain search link');
    assert.equal(external.length, 0, 'the browser never calls Google directly');
    assert.equal(failures.length, 0, `console errors: ${failures.join(' | ')}`);

    const summary = { provider: 'double', source, calls: calls.length, dailyLimit: 4, externalRequests: external.length, consoleErrors: failures.length, cap: 'checked', keyboardPick: 'checked', screenshots: ['cp036-dropdown-390.png', 'cp036-dropdown-1280.png'] };
    await writeFile(path.join(evidenceDir, 'verification-summary.json'), JSON.stringify(summary, null, 2));
    console.log(JSON.stringify(summary));
  } finally {
    await browser.close(); await app.close(); await rm(dataDir, { recursive: true, force: true });
  }
}

await main('osm');
await main('google');
