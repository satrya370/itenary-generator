import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import puppeteer from 'puppeteer';
import { createApp } from '../../src/server/app.js';
import type { ImportExtractor } from '../../src/server/ai/provider.js';
import { sweepImportSources } from '../../src/server/import/retention.js';
import { completeSetup } from './complete-setup.js';

// Isolated browser/API regression for CP032 F05-F07. Provider is explicitly unavailable.
process.env.OPENROUTER_API_KEY = 'disabled-review-race-test';
const origin = 'http://127.0.0.1:3194';
const headers = { origin, 'x-engine-request': '1', 'content-type': 'application/json' };
const dataDir = await mkdtemp(path.join(os.tmpdir(), 'review-races-'));
const extractor: ImportExtractor = { credentialState: 'missing', async extract() { throw new Error('No provider calls expected'); } };
const app = await createApp({ dataDir, publicOrigin: origin, allowedOrigins: [origin], importExtractor: extractor });
const browser = await puppeteer.launch({ headless: 'shell', args: ['--disable-background-networking', '--no-first-run'] });

async function makeSource(text: string): Promise<string> {
  const result = await app.inject({ method: 'POST', url: '/api/v1/imports/sources', headers, payload: { text } });
  assert.equal(result.statusCode, 201, result.body);
  return result.json().sourceId;
}
async function apply(sourceId: string, payload: Record<string, unknown>) {
  return app.inject({ method: 'POST', url: `/api/v1/imports/sources/${sourceId}/apply`, headers, payload });
}
async function clickText(page: import('puppeteer').Page, text: string) {
  await page.waitForFunction((value) => [...document.querySelectorAll('button')].some((button) => button.textContent?.includes(value) && !button.disabled), {}, text);
  await page.evaluate((value) => [...document.querySelectorAll('button')].find((button) => button.textContent?.includes(value) && !button.disabled)?.click(), text);
}

try {
  await completeSetup(app, origin);

  // A's completed report is delayed until B has been opened and B's null report has landed.
  const sourceA = await makeSource('Trip Race A\nDestinasi: Bali\nHari 1\n09:00 Museum');
  const importedA = await apply(sourceA, { operationId: randomUUID(), target: 'new', mode: 'full_day', outputLanguage: 'id' });
  assert.equal(importedA.statusCode, 201, importedA.body);
  const itineraryA = importedA.json().itinerary;
  const blankB = (await app.inject({ method: 'POST', url: '/api/v1/itineraries', headers, payload: { mode: 'full_day' } })).json();
  const contentB = structuredClone(blankB.draftContent); contentB.trip.title = 'Trip Race B';
  const itineraryB = (await app.inject({ method: 'PATCH', url: `/api/v1/itineraries/${blankB.id}`, headers, payload: { expectedRevision: blankB.revision, draftContent: contentB, languageContext: blankB.languageContext, writingContext: blankB.writingContext } })).json();

  await app.listen({ host: '127.0.0.1', port: 3194 });
  const page = await browser.newPage();
  const external: string[] = [];
  page.on('dialog', (dialog) => void dialog.accept());
  page.on('request', (request) => { const url = new URL(request.url()); if (['http:', 'https:'].includes(url.protocol) && url.origin !== origin) external.push(request.url()); });
  let heldA: import('puppeteer').HTTPRequest | null = null;
  let heldB: import('puppeteer').HTTPRequest | null = null;
  let activeReviewId: string | null = null;
  let heldResolve: import('puppeteer').HTTPRequest | null = null;
  let heldPatch: import('puppeteer').HTTPRequest | null = null;
  let releaseResolve!: () => void; let releasePatch!: () => void;
  const interceptedResolve = new Promise<void>((resolve) => { releaseResolve = resolve; });
  const interceptedPatch = new Promise<void>((resolve) => { releasePatch = resolve; });
  let releaseA!: () => void; let releaseB!: () => void;
  const interceptedA = new Promise<void>((resolve) => { releaseA = resolve; });
  const interceptedB = new Promise<void>((resolve) => { releaseB = resolve; });
  await page.setRequestInterception(true);
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.pathname === '/api/v1/imports/operations' && url.searchParams.get('itineraryId') === itineraryA.id) { heldA = request; releaseA(); return; }
    if (url.pathname === '/api/v1/imports/operations' && url.searchParams.get('itineraryId') === itineraryB.id) { heldB = request; releaseB(); return; }
    if (activeReviewId && !heldResolve && request.method() === 'POST' && url.pathname.endsWith('/resolve')) { heldResolve = request; releaseResolve(); return; }
    if (activeReviewId && !heldPatch && request.method() === 'PATCH' && url.pathname === `/api/v1/itineraries/${activeReviewId}`) { heldPatch = request; releasePatch(); return; }
    void request.continue();
  });
  await page.goto(origin); await page.waitForFunction(() => document.body.innerText.includes('Engine tersambung'));
  await clickText(page, 'Trip Race A');
  await Promise.race([interceptedA, new Promise((_, reject) => setTimeout(() => reject(new Error('did not intercept A report request')), 5000))]);
  await clickText(page, 'Draf saya'); await clickText(page, 'Trip Race B');
  await page.waitForFunction((title) => document.querySelector('h2.text-xl')?.textContent === title, {}, 'Trip Race B');
  await Promise.race([interceptedB, new Promise((_, reject) => setTimeout(() => reject(new Error('did not intercept B report request')), 5000))]);
  assert.ok(heldA && heldB);
  await heldB.continue(); await new Promise((resolve) => setTimeout(resolve, 250));
  await heldA.continue(); await new Promise((resolve) => setTimeout(resolve, 500));
  const f05 = await page.evaluate(() => ({ title: document.querySelector('h2.text-xl')?.textContent, reportVisible: document.body.innerText.includes('Hasil import') }));
  assert.equal(f05.title, 'Trip Race B');
  assert.equal(f05.reportVisible, false, 'late report A must not attach to draft B');

  // An autosaved empty local list row normalizes out of canonical state but is not a semantic edit.
  const sourceC = await makeSource('Trip False Conflict\nDestinasi: Bali\nDestinasi: Lombok\nHari 1\n09:00 Museum');
  const importedC = await apply(sourceC, { operationId: randomUUID(), target: 'new', mode: 'full_day', outputLanguage: 'id' });
  assert.equal(importedC.statusCode, 201, importedC.body);
  await page.reload(); await page.waitForFunction(() => document.body.innerText.includes('Engine tersambung'));
  await clickText(page, 'Trip False Conflict');
  await page.waitForFunction(() => document.body.innerText.includes('Pilih Bali'));
  await clickText(page, 'Detail & tampilan');
  await page.$eval('[data-option-list="included"]', (root) => [...root.querySelectorAll('button')].find((button) => button.textContent?.startsWith('Tambah '))?.click());
  const emptyRow = '[data-option-list="included"] textarea[data-field-path="included[]"]';
  await page.waitForSelector(emptyRow);
  await clickText(page, '1. Info perjalanan');
  const titleSelector = '[data-field-path="trip.title"]';
  const setInput = async (selector: string, value: string) => page.$eval(selector, (element, next) => {
    const input = element as HTMLInputElement | HTMLTextAreaElement;
    const prototype = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(input, next);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);
  await setInput(titleSelector, 'Temporary title'); await setInput(titleSelector, 'Trip False Conflict');
  await page.select('[data-field-path="trip.language"]', 'en'); await page.select('[data-field-path="trip.language"]', 'id');
  await clickText(page, '2. Susun perjalanan');
  await page.evaluate(() => [...document.querySelectorAll('summary')].find((summary) => summary.textContent?.includes('Bantuan AI'))?.click());
  const brief = '[data-field-path="writing.brief"]';
  await setInput(brief, 'Temporary writing note'); await setInput(brief, '');
  await page.waitForFunction(() => document.querySelector('[role="status"]')?.textContent?.includes('Tersimpan · revisi'));
  assert.deepEqual((await app.inject({ url: `/api/v1/itineraries/${importedC.json().itinerary.id}` })).json().draftContent.included, [], 'empty row is normalized out of saved content');
  await clickText(page, '3. Detail & tampilan');
  await clickText(page, 'Pilih Bali');
  await page.waitForFunction(() => document.body.innerText.includes('Review tersimpan'));
  assert.equal(await page.$('[aria-label="Konflik revisi"]'), null, 'normalization alone must not raise a conflict');
  assert.ok(await page.$(emptyRow), 'transient empty row stays available in the editor');
  assert.equal((await app.inject({ url: `/api/v1/itineraries/${importedC.json().itinerary.id}` })).json().draftContent.trip.destination, 'Bali');

  // Real local content/language/writing edits during a delayed decision must not be overwritten.
  const sourceE = await makeSource('Trip Concurrent Edit\nDestinasi: Bali\nDestinasi: Lombok\nHari 1\n09:00 Museum');
  const importedE = await apply(sourceE, { operationId: randomUUID(), target: 'new', mode: 'full_day', outputLanguage: 'id' });
  assert.equal(importedE.statusCode, 201, importedE.body);
  await page.reload(); await page.waitForFunction(() => document.body.innerText.includes('Engine tersambung'));
  await clickText(page, 'Trip Concurrent Edit');
  await page.waitForFunction(() => document.body.innerText.includes('Pilih Bali'));
  activeReviewId = importedE.json().itinerary.id;
  await clickText(page, 'Pilih Bali');
  await Promise.race([interceptedResolve, new Promise((_, reject) => setTimeout(() => reject(new Error('review request not intercepted')), 5000))]);
  await clickText(page, '1. Info perjalanan');
  await page.$eval('[data-field-path="trip.title"]', (element) => {
    const input = element as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    setter.call(input, 'Edited while review was pending'); input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.select('[data-field-path="trip.language"]', 'ja');
  await clickText(page, '2. Susun perjalanan');
  await page.evaluate(() => [...document.querySelectorAll('summary')].find((summary) => summary.textContent?.includes('Bantuan AI'))?.click());
  await page.type('[data-field-path="writing.brief"]', 'Catatan lokal yang harus dipertahankan');
  await Promise.race([interceptedPatch, new Promise((_, reject) => setTimeout(() => reject(new Error('autosave patch not intercepted')), 8000))]);
  assert.ok(heldResolve && heldPatch);
  await heldResolve.continue();
  await page.waitForFunction(() => document.body.innerText.includes('Review tersimpan, tetapi draf lokal berubah'));
  await heldPatch.continue();
  await page.waitForFunction(() => document.body.innerText.includes('Draft berubah di server'));
  assert.equal(await page.$eval('[data-field-path="trip.title"]', (element) => (element as HTMLInputElement).value), 'Edited while review was pending');
  assert.equal(await page.$eval('[data-field-path="trip.language"]', (element) => (element as HTMLSelectElement).value), 'ja');
  assert.equal(await page.$eval('[data-field-path="writing.brief"]', (element) => (element as HTMLTextAreaElement).value), 'Catatan lokal yang harus dipertahankan');
  const concurrentServer = (await app.inject({ url: `/api/v1/itineraries/${activeReviewId}` })).json();
  assert.equal(concurrentServer.draftContent.trip.destination, 'Bali', 'server review choice persists');
  assert.notEqual(concurrentServer.draftContent.trip.title, 'Edited while review was pending', 'unsaved local title does not overwrite the server review');

  // Newer failed attempt and last successful report are both visible when reopening.
  const sourceD = await makeSource('Trip Last Success\nDestinasi: Bali\nDestinasi: Lombok\nHari 1\n09:00 Museum\nKode privat: SECRET_EXPIRED_REPORT');
  const importedD = await apply(sourceD, { operationId: randomUUID(), target: 'new', mode: 'full_day', outputLanguage: 'id' });
  assert.equal(importedD.statusCode, 201, importedD.body);
  assert.ok(importedD.json().report.review.unknownLabels.length > 0, 'fixture has source-backed unknown-label review data');
  const failedSource = await makeSource('Missing source simulation');
  await rm(path.join(dataDir, 'imports', `${failedSource}.txt`), { force: true });
  const failed = await app.inject({ method: 'POST', url: `/api/v1/imports/sources/${failedSource}/apply`, headers, payload: { operationId: randomUUID(), target: 'overwrite', itineraryId: importedD.json().itinerary.id, expectedRevision: importedD.json().itinerary.revision, outputLanguage: 'id' } });
  assert.equal(failed.statusCode, 404);
  await page.reload(); await page.waitForFunction(() => document.body.innerText.includes('Engine tersambung'));
  await clickText(page, 'Trip Last Success');
  await page.waitForFunction(() => document.body.innerText.includes('Hasil import') && document.body.innerText.includes('Percobaan import terbaru gagal'));
  assert.equal((await app.inject({ url: `/api/v1/imports/operations?itineraryId=${importedD.json().itinerary.id}` })).json().lastSuccessfulOperation.operationId, importedD.json().operationId);
  const store = (app as unknown as { store: { db: { prepare(sql: string): { run(...args: unknown[]): unknown } }; workspaceId: string } }).store;
  store.db.prepare('UPDATE import_sources SET created_at=? WHERE id=?').run('2000-01-01T00:00:00.000Z', sourceD);
  await sweepImportSources(store as any, dataDir, 30, new Date());
  await page.reload(); await page.waitForFunction(() => document.body.innerText.includes('Engine tersambung'));
  await clickText(page, 'Trip Last Success');
  await page.waitForFunction(() => document.body.innerText.includes('Teks sumber sudah dihapus sesuai kebijakan penyimpanan'));
  const visibleButtons = await page.$$eval('button', (buttons) => buttons.map((button) => button.textContent ?? ''));
  assert.equal(visibleButtons.some((text) => text.includes('Pilih Bali')), false, 'expired source candidates cannot be selected');
  assert.ok(!(await page.evaluate(() => document.body.innerText)).includes('SECRET_EXPIRED_REPORT'));
  await page.$eval('section[aria-label="Hasil import"]', (element) => element.scrollIntoView({ block: 'start' }));
  await mkdir('output/import-review-races', { recursive: true });
  await page.setViewport({ width: 390, height: 900 }); await page.screenshot({ path: 'output/import-review-races/f07-expired-390.png' });
  await page.setViewport({ width: 1280, height: 900 }); await page.screenshot({ path: 'output/import-review-races/f07-expired-1280.png' });
  assert.equal(external.length, 0);
  console.log(JSON.stringify({ F05: 'PASS', F06: 'PASS', F07: 'PASS', F03ExpiryUi: 'PASS', externalRequests: external.length }));
} finally { await browser.close(); await app.close(); await rm(dataDir, { recursive: true, force: true }); }
