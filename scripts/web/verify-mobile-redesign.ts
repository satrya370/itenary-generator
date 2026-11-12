import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import puppeteer from 'puppeteer';
import { createApp } from '../../src/server/app.js';
import { createContentV2 } from '../../tests/web/fixtures-v2.js';
import { completeSetup } from './complete-setup.js';

const socket = net.createServer();
await new Promise<void>((resolve, reject) => { socket.once('error', reject); socket.listen(0, '127.0.0.1', resolve); });
const port = (socket.address() as net.AddressInfo).port;
await new Promise<void>((resolve, reject) => socket.close(error => error ? reject(error) : resolve()));
const origin = `http://127.0.0.1:${port}`;
const dataDir = await mkdtemp(path.join(os.tmpdir(), 'itinerary-mobile-'));
const app = await createApp({ dataDir, publicOrigin: origin, allowedOrigins: [origin] });
const evidence = path.resolve('output/web-cp5');
let browser: Awaited<ReturnType<typeof puppeteer.launch>> | undefined;
try {
  await mkdir(evidence, { recursive: true });
  await completeSetup(app, origin);
  await app.listen({ host: '127.0.0.1', port });
  browser = await puppeteer.launch({ headless: 'shell', args: ['--disable-background-networking'] });
  const page = await browser.newPage();
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const click = async (label: string) => {
    const found = await page.evaluate(label => {
      const button = [...document.querySelectorAll<HTMLButtonElement>('button')].find(item => item.textContent?.trim() === label && item.getClientRects().length > 0);
      if (!button || button.disabled) return false;
      button.click(); return true;
    }, label);
    assert.ok(found, `visible enabled button: ${label}`);
  };
  const capture = async (name: string) => {
    const size = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth }));
    assert.ok(size.document <= size.viewport, `${name}: ${JSON.stringify(size)}`);
    await page.screenshot({ path: path.join(evidence, `${name}.png`) });
  };
  await page.setViewport({ width: 390, height: 844 });
  await page.goto(origin);
  await page.waitForFunction(() => document.querySelector('[role="status"]')?.textContent?.includes('Engine tersambung'));
  assert.ok((await page.evaluate(() => document.body.innerText)).includes('Belum ada itinerary'));
  await capture('home-empty-390');

  const headers = { origin, 'x-engine-request': '1' };
  for (let i = 0; i < 56; i++) assert.equal((await app.inject({ method: 'POST', url: '/api/v1/itineraries', headers, payload: { mode: 'half_day' } })).statusCode, 201);
  const created = await app.inject({ method: 'POST', url: '/api/v1/itineraries', headers, payload: { mode: 'multi_day' } });
  const record = created.json();
  const content = createContentV2('multi_day');
  content.trip.title = 'Perjalanan keluarga ke Ubud dan Kintamani dengan nama yang sangat panjang untuk menguji tampilan mobile';
  const saved = await app.inject({ method: 'PATCH', url: `/api/v1/itineraries/${record.id}`, headers, payload: { expectedRevision: record.revision, draftContent: content, languageContext: { requestedLanguage: 'en', outputLanguage: 'en', source: 'explicit' }, writingContext: { brief: '', notes: [] } } });
  assert.equal(saved.statusCode, 200, saved.body);
  await page.reload();
  await page.waitForFunction(() => document.querySelector('[role="status"]')?.textContent?.includes('Engine tersambung'));
  assert.equal(await page.$$eval('aside li', items => items.length), 5);
  await capture('home-many-390');
  await page.setViewport({ width: 1280, height: 844 }); await capture('home-many-1280');
  await page.setViewport({ width: 390, height: 844 });
  await click('Muat lebih banyak');
  assert.equal(await page.$$eval('aside li', items => items.length), 10);
  await click('Buat itinerary baru');
  await page.waitForSelector('[data-mode-card="half_day"]');
  await capture('create-type-390');
  await page.setViewport({ width: 1280, height: 844 }); await capture('create-type-1280');
  await page.setViewport({ width: 390, height: 844 });
  await page.click('[data-mode-card="half_day"]');
  await page.waitForSelector('[data-method="manual"]');
  await capture('create-method-390');
  await page.setViewport({ width: 1280, height: 844 }); await capture('create-method-1280');
  await page.setViewport({ width: 390, height: 844 });
  await click('Kembali');
  await page.waitForSelector('[data-mode-card="half_day"]');
  await click('Batal');
  await page.waitForSelector('aside li button');
  await page.click('aside li button');
  await page.waitForFunction(() => document.querySelector('[role="status"]')?.textContent?.includes('Draft dibuka'));
  for (const [index, label] of ['Info perjalanan', 'Susun perjalanan', 'Detail & tampilan', 'Periksa & bagikan'].entries()) {
    await page.evaluate(label => [...document.querySelectorAll<HTMLButtonElement>('[aria-label="Langkah"] button')].find(button => button.textContent?.includes(label))?.click(), label);
    await capture(`step-${index + 1}-390`);
    assert.ok(await page.$('[aria-current="step"]'));
    await page.setViewport({ width: 1280, height: 844 }); await capture(`step-${index + 1}-1280`);
    await page.setViewport({ width: 390, height: 844 });
  }
  await page.evaluate(() => [...document.querySelectorAll<HTMLButtonElement>('[aria-label="Langkah"] button')].find(button => button.textContent?.includes('Info perjalanan'))?.click());
  const inputMetrics = await page.$eval('[data-field-path="trip.title"]', element => ({ height: element.getBoundingClientRect().height, fontSize: getComputedStyle(element).fontSize }));
  assert.ok(inputMetrics.height >= 44, `mobile input height: ${inputMetrics.height}`);
  assert.equal(inputMetrics.fontSize, '16px', 'mobile input avoids small-font zoom');
  await page.setRequestInterception(true);
  const failSave = (request: import('puppeteer').HTTPRequest) => {
    if (request.method() === 'PATCH' && request.url().includes(`/api/v1/itineraries/${record.id}`)) void request.respond({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { message: 'Koneksi terputus' } }) });
    else void request.continue();
  };
  page.on('request', failSave);
  await page.evaluate(() => {
    const input = document.querySelector<HTMLInputElement>('[data-field-path="trip.title"]')!;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'Perubahan saat koneksi terputus');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.waitForFunction(() => document.querySelector('[role="status"]')?.textContent?.includes('Gagal menyimpan'));
  await capture('save-error-390');
  await page.setViewport({ width: 1280, height: 844 }); await capture('save-error-1280');
  await page.setViewport({ width: 390, height: 844 });
  assert.ok((await page.evaluate(() => document.body.innerText)).includes('Coba lagi'));
  page.off('request', failSave);
  await page.setRequestInterception(false);
  await click('Coba lagi');
  await page.waitForFunction(() => document.querySelector('[role="status"]')?.textContent?.includes('Tersimpan · revisi'));
  for (const width of [320, 360, 390, 768, 1280]) {
    await page.setViewport({ width, height: 844 });
    await capture(`editor-${width}`);
  }
  await page.evaluate(() => { document.body.style.zoom = '2'; });
  const zoom = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth }));
  assert.ok(zoom.document <= zoom.viewport, `200% zoom: ${JSON.stringify(zoom)}`);
  await page.evaluate(() => { document.body.style.zoom = ''; });
  await page.setViewport({ width: 390, height: 844 });
  await page.keyboard.press('Tab');
  const focus = await page.evaluate(() => ({ tag: document.activeElement?.tagName, visible: Boolean((document.activeElement as HTMLElement | null)?.getClientRects().length) }));
  assert.ok(focus.visible && focus.tag !== 'BODY', 'keyboard focus reaches a visible control');
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ emptyHome: true, manyDrafts: 57, firstPage: 5, secondPage: 10, longTitle: true, steps: 4, widths: [320, 360, 390, 768, 1280], cssZoom200: true, inputMetrics, keyboardFocus: focus, pageErrors: errors.length, evidence }));
} finally {
  await browser?.close();
  await app.close();
  await rm(dataDir, { recursive: true, force: true });
}
