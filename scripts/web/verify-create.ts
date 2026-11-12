import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import puppeteer, { type ElementHandle, type HTTPRequest } from 'puppeteer';
import { createApp } from '../../src/server/app.js';
import type { ImportExtractRequest, ImportExtractor } from '../../src/server/ai/provider.js';
import { completeSetup } from './complete-setup.js';

// Browser E2E for CP037: the three-step create flow, on three paths (manual, text, PDF).
// Real server and SQLite; the extractor is a deterministic double (no network, no key). The apply request is delayed on purpose
// to prove that navigation is locked while the server works and that a late answer does not change the screen.
const FIXTURES = path.resolve('tests/fixtures/web/import');
const SUMMARY_QUOTE = 'Perjalanan sehari ke sawah terasering dan pasar seni Ubud.';
const TEXT_TITLE = 'Tur Ubud dan Tegallalang';

const extractor: ImportExtractor = {
  credentialState: 'configured',
  async extract(request: ImportExtractRequest) {
    const reply = request.segments.join('\n').includes(SUMMARY_QUOTE) ? { summary: { value: SUMMARY_QUOTE, quote: SUMMARY_QUOTE } } : {};
    return { text: JSON.stringify(reply), usage: { promptTokens: 120, completionTokens: 40, costUsd: 0.0002 } };
  }
};

async function availablePort() {
  const server = net.createServer();
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen({ port: 0, host: '127.0.0.1' }, () => resolve()); });
  const port = (server.address() as net.AddressInfo).port;
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  return port;
}

async function main() {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'itinerary-cp037-browser-'));
  const port = await availablePort(); const origin = `http://127.0.0.1:${port}`;
  const app = await createApp({ dataDir, publicOrigin: origin, shareOrigin: origin, allowedOrigins: [origin], importExtractor: extractor, renderStylesheetPath: path.resolve('.runtime/web-render/brochure.css') });
  await completeSetup(app, origin);
  await app.listen({ host: '127.0.0.1', port });
  const browser = await puppeteer.launch({ headless: 'shell', args: ['--disable-background-networking', '--no-first-run'] });
  const evidenceDir = path.resolve('output/web-create'); await mkdir(evidenceDir, { recursive: true });
  const page = await browser.newPage();
  const failures: string[] = []; const external: string[] = []; const dialogs: string[] = [];
  let acceptDialogs = true;
  let delayApplyMs = 0;
  let applySeen = 0;
  page.on('console', message => { if (message.type() === 'error' && !message.text().includes('Failed to load resource')) failures.push(message.text()); });
  page.on('request', request => { const url = new URL(request.url()); if (['http:', 'https:'].includes(url.protocol) && url.origin !== origin) external.push(request.url()); });
  page.on('dialog', dialog => { dialogs.push(dialog.message()); if (acceptDialogs) void dialog.accept(); else void dialog.dismiss(); });
  await page.setRequestInterception(true);
  page.on('request', (request: HTTPRequest) => {
    if (request.method() === 'POST' && /\/imports\/sources\/[^/]+\/apply$/.test(request.url()) && delayApplyMs > 0) {
      applySeen += 1;
      const wait = delayApplyMs;
      setTimeout(() => { void request.continue().catch(() => undefined); }, wait);
      return;
    }
    void request.continue().catch(() => undefined);
  });
  await page.setViewport({ width: 1280, height: 900 });

  const waitText = (text: string) => page.waitForFunction(expected => document.body.innerText.includes(expected), { timeout: 20000 }, text);
  const waitStatus = (text: string) => page.waitForFunction(expected => document.querySelector('[role="status"]')?.textContent?.includes(expected), { timeout: 20000 }, text);
  const title = () => page.evaluate(() => document.querySelector('h2.text-xl')?.textContent ?? '');
  const itineraryCount = () => page.evaluate(async () => {
    const response = await fetch('/api/v1/itineraries?limit=200');
    const body = await response.json() as { items?: unknown[] };
    return (body.items ?? []).length;
  });
  const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  /** Clicks an enabled button by its exact text. The first match in the page is used. */
  async function clickButton(text: string) {
    await page.waitForFunction(expected => [...document.querySelectorAll<HTMLButtonElement>('button')].some(item => item.textContent?.trim() === expected && !item.disabled), { timeout: 20000 }, text);
    await page.evaluate(expected => [...document.querySelectorAll<HTMLButtonElement>('button')].find(item => item.textContent?.trim() === expected && !item.disabled)?.click(), text);
  }
  async function buttonDisabled(text: string) {
    return page.evaluate(expected => { const item = [...document.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent?.trim() === expected); return item ? item.disabled : null; }, text);
  }
  async function openFlow() {
    await clickButton('Buat itinerary baru');
    await page.waitForSelector('[data-mode-card]');
  }
  async function chooseMode(key: string) {
    await page.waitForSelector(`[data-mode-card="${key}"]:not([disabled])`);
    await page.click(`[data-mode-card="${key}"]`);
    await page.waitForSelector('[data-method]');
  }
  async function chooseMethod(id: string) {
    await page.waitForSelector(`[data-method="${id}"]:not([disabled])`);
    await page.click(`[data-method="${id}"]`);
  }
  async function textareaValue() { return page.evaluate(() => document.querySelector<HTMLTextAreaElement>('#import-text')?.value ?? ''); }
  /** Sets the textarea the way a paste does (one input event), so a long fixture does not need thousands of key presses. */
  async function typeText(value: string) {
    await page.waitForSelector('#import-text');
    await page.evaluate((next) => {
      const element = document.querySelector<HTMLTextAreaElement>('#import-text');
      if (!element) return;
      element.focus();
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(element, next);
      element.dispatchEvent(new Event('input', { bubbles: true }));
    }, value);
  }
  async function historyStep(delta: number) {
    await page.evaluate(d => history.go(d), delta);
    await sleep(300);
  }
  const onStepOne = () => page.evaluate(() => document.querySelectorAll('[data-mode-card]').length > 0 && document.querySelectorAll('[data-method]').length === 0);
  const onStepTwo = () => page.evaluate(() => document.querySelectorAll('[data-method]').length > 0);
  const overflowAt = async (width: number) => {
    await page.setViewport({ width, height: 800 });
    await sleep(150);
    const result = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
    return result.scroll <= result.client;
  };
  const shot = async (name: string, width: number) => {
    await page.setViewport({ width, height: 900 }); await sleep(200);
    await page.screenshot({ path: path.join(evidenceDir, name), fullPage: false });
    await page.setViewport({ width: 1280, height: 900 });
  };
  const report: Record<string, unknown> = {};

  try {
    await page.goto(origin);
    await page.waitForFunction(() => document.querySelector('[role="status"]')?.textContent?.includes('Engine tersambung'), { timeout: 20000 });
    const start = await itineraryCount();

    // 1. Selecting a type and a method creates nothing; Batal (with nothing typed) leaves no draft.
    await openFlow();
    await chooseMode('full_day');
    assert.equal(await onStepTwo(), true, 'choosing a type moves to step 2');
    await chooseMethod('manual');
    await clickButton('Kembali');
    assert.equal(await onStepOne(), true, 'Kembali returns to step 1');
    acceptDialogs = true;
    await clickButton('Batal');
    await page.waitForFunction(() => document.querySelectorAll('[data-mode-card]').length === 0, { timeout: 20000 });
    assert.equal(await itineraryCount(), start, 'selecting a type and a method creates no draft');
    report.selectingCreatesNothing = true;

    // 2. Text path: typing survives Back, Forward, method switches and returning to step 1; a typed text asks before it is thrown away.
    await openFlow();
    await chooseMode('full_day');
    await chooseMethod('paste');
    await typeText(await readFile(path.join(FIXTURES, 'id-full-day-tidy.txt'), 'utf8'));
    const typed = await textareaValue();
    assert.ok(typed.length > 100, 'text typed');
    assert.match(await page.evaluate(() => document.body.innerText), /karakter/, 'character counter is shown');
    await chooseMethod('pdf');
    await chooseMethod('paste');
    assert.equal(await textareaValue(), typed, 'switching the method keeps the typed text');
    await historyStep(-1);
    assert.equal(await onStepOne(), true, 'browser Back goes one step, not out of the flow');
    await historyStep(1);
    assert.equal(await onStepTwo(), true, 'browser Forward returns to step 2');
    assert.equal(await textareaValue(), typed, 'browser Back and Forward keep the typed text');
    await clickButton('Kembali');
    await chooseMode('half_day');
    await chooseMethod('paste');
    assert.equal(await textareaValue(), typed, 'going back, choosing a type again and returning keeps the text');
    report.textSurvivesNavigation = true;

    // Leaving with typed text asks first: dismiss keeps the flow open, accept closes it.
    acceptDialogs = false;
    dialogs.length = 0;
    await clickButton('Kembali');
    await page.waitForSelector('[data-mode-card]');
    await clickButton('Batal');
    await sleep(300);
    assert.ok(dialogs.length >= 1, 'a confirmation was asked before discarding typed text');
    assert.ok(await page.evaluate(() => document.querySelectorAll('[data-mode-card]').length > 0), 'dismissing the confirmation keeps the flow open');
    acceptDialogs = true;
    await clickButton('Batal');
    await page.waitForFunction(() => document.querySelectorAll('[data-mode-card]').length === 0, { timeout: 20000 });
    report.discardAsksFirst = true;

    // Text path again, with a slow apply: navigation is locked and the late answer creates exactly one draft.
    await openFlow();
    await chooseMode('full_day');
    await chooseMethod('paste');
    await typeText(await readFile(path.join(FIXTURES, 'id-full-day-tidy.txt'), 'utf8'));
    await clickButton('Baca teks');
    await page.waitForFunction(() => [...document.querySelectorAll('button')].some(item => item.textContent?.trim() === 'Lihat hasil baca'), { timeout: 20000 });
    await clickButton('Lihat hasil baca');
    await page.waitForFunction(() => [...document.querySelectorAll('button')].some(item => item.textContent?.trim() === 'Proses' && !item.disabled), { timeout: 20000 });
    delayApplyMs = 2500;
    const before = applySeen;
    await clickButton('Proses');
    await sleep(200);
    assert.equal(await buttonDisabled('Kembali'), true, 'Kembali is locked while the import runs');
    assert.equal(await buttonDisabled('Mulai isi'), null, 'no manual start button in the text path');
    await page.evaluate(() => history.back());
    await sleep(300);
    assert.equal(await onStepTwo(), true, 'browser Back is blocked while the import runs');
    assert.ok(applySeen > before, 'the apply request was sent');
    await waitStatus('Draf baru dari import tersimpan');
    delayApplyMs = 0;
    await page.waitForFunction(expected => document.querySelector('h2.text-xl')?.textContent === expected, { timeout: 20000 }, TEXT_TITLE);
    assert.equal(await itineraryCount(), start + 1, 'the slow import created exactly one draft');
    report.slowRequestLocksNavigation = true;

    // 3. PDF path: the file is read, previewed, then applied from the footer.
    await openFlow();
    await chooseMode('full_day');
    await chooseMethod('pdf');
    const pdfInput = await page.waitForSelector('input#import-pdf') as ElementHandle<HTMLInputElement>;
    await pdfInput.uploadFile(path.join(FIXTURES, 'id-full-day-tidy.pdf'));
    await page.waitForFunction(() => [...document.querySelectorAll('button')].some(item => item.textContent?.trim() === 'Baca PDF' && !item.disabled), { timeout: 20000 });
    await clickButton('Baca PDF');
    await page.waitForFunction(() => [...document.querySelectorAll('button')].some(item => item.textContent?.trim() === 'Lihat hasil baca'), { timeout: 20000 });
    await clickButton('Lihat hasil baca');
    await clickButton('Proses');
    await waitStatus('Draf baru dari import tersimpan');
    await page.waitForFunction(expected => document.querySelector('h2.text-xl')?.textContent === expected, { timeout: 20000 }, TEXT_TITLE);
    assert.equal(await itineraryCount(), start + 2, 'PDF import created one more draft');
    report.pdfPath = true;

    // 3b. Activity by text (SI1): code reads the facts, sessions, highlights and steps; the editor shows them.
    await openFlow();
    await chooseMode('activity');
    assert.equal(await page.evaluate(() => (document.querySelector('[data-method="paste"]') as HTMLButtonElement | null)?.disabled), false, 'text import is available for an activity');
    await chooseMethod('paste');
    await typeText(await readFile(path.join(FIXTURES, 'id-activity-rafting.txt'), 'utf8'));
    await clickButton('Baca teks');
    await page.waitForFunction(() => [...document.querySelectorAll('button')].some(item => item.textContent?.trim() === 'Lihat hasil baca'), { timeout: 20000 });
    await clickButton('Lihat hasil baca');
    await clickButton('Proses');
    await waitStatus('Draf baru dari import tersimpan');
    await page.waitForFunction(() => document.querySelector('h2.text-xl')?.textContent === 'Rafting Sungai Ayung', { timeout: 20000 });
    const activityFields = await page.evaluate(() => ({
      duration: (document.querySelector('[data-field-path="activity.durationMinutes"]') as HTMLInputElement | null)?.value,
      category: (document.querySelector('[data-field-path="activity.category"]') as HTMLSelectElement | null)?.value,
      sessions: [...document.querySelectorAll<HTMLInputElement>('[data-field-path="activity.sessionTimes[]"]')].map((item) => item.value),
      highlights: [...document.querySelectorAll<HTMLInputElement>('[data-field-path="activity.highlights[]"]')].map((item) => item.value),
      dayFields: document.querySelectorAll('[data-field-path="days[].title"]').length
    }));
    assert.deepEqual(activityFields, { duration: '180', category: 'water', sessions: ['08:00', '13:00'], highlights: ['Jeram grade II-III', 'Pemandangan tebing hijau', 'Makan siang buffet termasuk'], dayFields: 0 });
    assert.equal(await itineraryCount(), start + 3, 'activity import created one more draft');
    report.activityImport = true;

    // 4. Manual path: Mulai isi opens the editor (step 3) with one new draft.
    await openFlow();
    await chooseMode('destination_guide');
    await chooseMethod('manual');
    await clickButton('Mulai isi');
    await waitStatus('Draft baru tersimpan');
    await page.waitForFunction(() => document.body.textContent?.includes('Editor itinerary'), { timeout: 20000 });
    assert.equal(await itineraryCount(), start + 4, 'manual path created one more draft');
    report.manualPath = true;

    // The last type and method are remembered and shown again.
    await clickButton('Buat itinerary baru').catch(() => undefined);
    await page.waitForSelector('[data-mode-card]').catch(() => undefined);
    const remembered = await page.evaluate(() => document.body.innerText.includes('Terakhir dipakai'));
    assert.equal(remembered, true, 'the last type is remembered');
    report.rememberedLastChoice = true;
    await page.evaluate(() => history.replaceState(null, '', location.pathname));
    await page.reload();
    await page.waitForFunction(() => document.querySelector('[role="status"]')?.textContent?.includes('Engine tersambung'), { timeout: 20000 });

    // 5. Layout: 390 and 1280 screenshots, no horizontal overflow at 360.
    await openFlow();
    await shot('cp037-step1-390.png', 390);
    await chooseMode('full_day');
    await chooseMethod('paste');
    await typeText('Hari 1\n09:00 Jemput di hotel');
    await shot('cp037-step2-paste-390.png', 390);
    await shot('cp037-step2-paste-1280.png', 1280);
    assert.equal(await overflowAt(360), true, 'no horizontal overflow at 360 px on step 2');
    assert.equal(await overflowAt(360), true);
    report.noOverflowAt360 = true;

    // Keyboard evidence (approximation): a shorter viewport with the field focused must not put the fixed footer over the field.
    await page.setViewport({ width: 390, height: 520 }); await sleep(200);
    const covered = await page.evaluate(() => {
      const area = document.querySelector<HTMLTextAreaElement>('#import-text');
      const footer = document.querySelector<HTMLElement>('.fixed.inset-x-0.bottom-0');
      area?.scrollIntoView({ block: 'center' });
      if (!area || !footer) return true;
      const a = area.getBoundingClientRect(); const f = footer.getBoundingClientRect();
      return !(a.bottom <= f.top || a.top >= f.bottom);
    });
    assert.equal(covered, false, 'the footer does not cover the text field on a short viewport');
    report.footerDoesNotCoverField = true;
    await shot('cp037-keyboard-short-390.png', 390);

    assert.deepEqual(external, [], 'no external requests');
    assert.deepEqual(failures, [], 'no console errors');
    report.externalRequests = external.length;
    report.consoleErrors = failures.length;
    report.applyRequestsSeen = applySeen;
    console.log(JSON.stringify(report));
  } finally {
    await browser.close(); await app.close(); await rm(dataDir, { recursive: true, force: true });
  }
}

await main();
