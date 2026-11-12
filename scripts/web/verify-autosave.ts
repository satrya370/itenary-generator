import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import puppeteer from 'puppeteer';
import { createApp } from '../../src/server/app.js';
import { completeSetup } from './complete-setup.js';
import type { AiProvider } from '../../src/server/ai/provider.js';
import { createContentV2 } from '../../tests/web/fixtures-v2.js';

const socket = net.createServer();
await new Promise<void>((resolve, reject) => { socket.once('error', reject); socket.listen(0, '127.0.0.1', resolve); });
const port = (socket.address() as net.AddressInfo).port;
await new Promise<void>((resolve, reject) => socket.close(error => error ? reject(error) : resolve()));
const origin = `http://127.0.0.1:${port}`;
const dataDir = await mkdtemp(path.join(os.tmpdir(), 'itinerary-autosave-'));
const provider: AiProvider = {
  credentialState: 'configured',
  async preflight() { return { credentialState: 'configured', authenticated: true, modelState: 'listed', modelId: 'openai/gpt-6-luna', pricing: { prompt: 0, completion: 0, webSearch: 0 }, contextLength: 100_000, maxCompletionTokens: 2_000, supportedParameters: ['max_tokens'] }; },
  async generate() { return { text: JSON.stringify({ text: 'A relaxed journey through gardens and local culture.' }), usage: { promptTokens: 10, completionTokens: 10, costUsd: 0 } }; }
};
const app = await createApp({ dataDir, publicOrigin: origin, allowedOrigins: [origin], aiProvider: provider });
let browser: Awaited<ReturnType<typeof puppeteer.launch>> | undefined;
try {
  await completeSetup(app, origin);
  await app.listen({ host: '127.0.0.1', port });
  const other = await app.inject({ method: 'POST', url: '/api/v1/itineraries', headers: { origin, 'x-engine-request': '1' }, payload: { mode: 'full_day' } });
  assert.equal(other.statusCode, 201);
  const otherId = other.json().id as string;
  const created = await app.inject({ method: 'POST', url: '/api/v1/itineraries', headers: { origin, 'x-engine-request': '1' }, payload: { mode: 'half_day' } });
  assert.equal(created.statusCode, 201);
  const id = created.json().id as string;
  browser = await puppeteer.launch({ headless: 'shell', args: ['--disable-background-networking'] });
  const page = await browser.newPage();
  await page.goto(origin);
  await page.waitForSelector('aside ul li button');
  await page.click('aside ul li button');
  await page.waitForFunction(() => document.querySelector('[role="status"]')?.textContent?.includes('Draft dibuka'));
  await page.evaluate(() => {
    const state = window as any;
    const original = window.fetch.bind(window);
    state.saves = 0; state.active = 0; state.maxActive = 0; state.delayNext = true; state.failNext = false;
    window.fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
      if (init?.method === 'POST' && url.endsWith('/ai/overview')) state.aiRevision = JSON.parse(String(init.body)).expectedRevision;
      if (init?.method === 'POST' && url.endsWith('/preview')) {
        state.previewRevision = JSON.parse(String(init.body)).expectedRevision;
        return new Response(JSON.stringify({ itineraryId: url.split('/').at(-2), revision: state.previewRevision, html: '<p>Preview</p>', errors: [], warnings: [], publishReady: true }), { headers: { 'content-type': 'application/json' } });
      }
      if (init?.method !== 'PATCH' || !/\/api\/v1\/itineraries\//.test(url)) return original(input, init);
      state.saves++; state.active++; state.maxActive = Math.max(state.maxActive, state.active);
      try {
        if (state.delayNext) { state.delayNext = false; state.started = true; await new Promise<void>(resolve => { state.release = resolve; }); }
        if (state.failNext) { state.failNext = false; return new Response(JSON.stringify({ error: { message: 'Koneksi terputus' } }), { status: 503, headers: { 'content-type': 'application/json' } }); }
        if (state.invalidNext) { state.invalidNext = false; return new Response(JSON.stringify({ error: { message: 'Periksa judul', fields: [{ path: 'trip.title', code: 'INVALID', message: 'Periksa judul' }] } }), { status: 422, headers: { 'content-type': 'application/json' } }); }
        return await original(input, init);
      } finally { state.active--; }
    };
  });
  const setTitle = async (value: string) => page.evaluate(value => {
    const input = document.querySelector<HTMLInputElement>('[data-field-path="trip.title"]')!;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);
  const stored = async () => (await app.inject({ url: `/api/v1/itineraries/${id}` })).json();
  await setTitle('Pertama');
  await page.waitForFunction(() => (window as any).started === true);
  await setTitle('Perubahan terbaru');
  await page.evaluate(() => [...document.querySelectorAll('button')].find(button => button.textContent?.trim() === 'Preview')?.click());
  await page.evaluate(() => (window as any).release());
  await page.waitForFunction(() => (window as any).saves >= 2 && Number.isInteger((window as any).previewRevision));
  assert.equal((await stored()).draftContent.trip.title, 'Perubahan terbaru');
  assert.equal(await page.evaluate(() => (window as any).previewRevision), (await stored()).revision);
  assert.equal(await page.evaluate(() => (window as any).maxActive), 1, 'save requests do not overlap');
  await page.waitForSelector('[role="dialog"][aria-modal="true"]');
  await page.click('[role="dialog"] button');

  await setTitle('Preview terbaru');
  await page.evaluate(() => { (window as any).previewRevision = null; });
  await page.evaluate(() => [...document.querySelectorAll('button')].find(button => button.textContent?.trim() === 'Preview')?.click());
  await page.waitForFunction(() => Number.isInteger((window as any).previewRevision));
  const previewSaved = await stored();
  assert.equal(previewSaved.draftContent.trip.title, 'Preview terbaru');
  assert.equal(await page.evaluate(() => (window as any).previewRevision), previewSaved.revision, 'preview waits for the latest revision');
  await page.waitForFunction(() => document.querySelector('[role="status"]')?.textContent?.includes('Preview siap'));
  await page.click('[role="dialog"] button');

  await page.evaluate(() => { (window as any).failNext = true; (window as any).previewRevision = null; });
  await setTitle('Pulih setelah gagal');
  await page.evaluate(() => [...document.querySelectorAll('button')].find(button => button.textContent?.trim() === 'Preview')?.click());
  await page.waitForFunction(() => document.querySelector('[role="status"]')?.textContent?.includes('Gagal menyimpan'));
  assert.equal(await page.evaluate(() => (window as any).previewRevision), null, 'failed save does not produce a stale preview');
  const count = await page.evaluate(() => (window as any).saves);
  await new Promise(resolve => setTimeout(resolve, 1500));
  assert.equal(await page.evaluate(() => (window as any).saves), count, 'failure does not retry in a loop');
  await page.evaluate(() => [...document.querySelectorAll('button')].find(button => button.textContent?.trim() === 'Coba lagi')?.click());
  await page.waitForFunction(() => document.querySelector('[role="status"]')?.textContent?.includes('Tersimpan · revisi'));
  assert.equal((await stored()).draftContent.trip.title, 'Pulih setelah gagal');
  assert.equal(await page.evaluate(() => (window as any).previewRevision), null, 'failed preview request is not replayed after retry');

  await page.evaluate(() => { (window as any).invalidNext = true; });
  await setTitle('Judul tidak valid');
  await page.waitForSelector('[aria-label="Kesalahan draft"]');
  const invalidCount = await page.evaluate(() => (window as any).saves);
  await new Promise(resolve => setTimeout(resolve, 1500));
  assert.equal(await page.evaluate(() => (window as any).saves), invalidCount, 'validation failure does not retry in a loop');
  await setTitle('Judul diperbaiki');
  await page.waitForFunction(() => document.querySelector('[role="status"]')?.textContent?.includes('Tersimpan · revisi'));
  assert.equal((await stored()).draftContent.trip.title, 'Judul diperbaiki');

  await page.evaluate(() => [...document.querySelectorAll<HTMLButtonElement>('[aria-label="Langkah"] button')].find(button => button.textContent?.includes('Info perjalanan'))?.click());
  await page.select('[data-field-path="trip.language"]', 'en');
  await page.waitForFunction(() => document.querySelector('[role="status"]')?.textContent?.includes('Tersimpan · revisi'));
  await page.evaluate(() => [...document.querySelectorAll<HTMLButtonElement>('[aria-label="Langkah"] button')].find(button => button.textContent?.includes('Susun perjalanan'))?.click());
  await setTitle('Sebelum AI');
  await page.evaluate(() => document.querySelector<HTMLButtonElement>('[data-editor-section="summary"] button')?.click());
  await page.waitForSelector('[aria-label="Usulan AI"]');
  assert.equal((await stored()).draftContent.trip.title, 'Sebelum AI', 'AI waits for save');
  assert.equal(await page.evaluate(() => (window as any).aiRevision), (await stored()).revision, 'AI uses the latest revision');

  await setTitle('Sebelum import');
  await page.evaluate(() => [...document.querySelectorAll('button')].find(button => button.textContent?.trim() === 'Isi ulang dari teks/PDF')?.click());
  await page.waitForSelector('#import-text');
  assert.equal((await stored()).draftContent.trip.title, 'Sebelum import', 'import waits for save');
  await page.evaluate(() => [...document.querySelectorAll('button')].find(button => button.textContent?.trim() === 'Kembali ke draf')?.click());
  await page.waitForSelector('[data-field-path="trip.title"]');

  await page.evaluate(() => { (window as any).failNext = true; });
  await setTitle('Tetap di draft saat gagal');
  await page.evaluate(() => [...document.querySelectorAll('button')].find(button => button.textContent?.trim() === 'Draf saya')?.click());
  page.once('dialog', dialog => void dialog.dismiss());
  await page.evaluate(() => [...document.querySelectorAll('aside ul li button')].find(button => button.textContent?.includes('Tanpa judul'))?.click());
  await page.waitForFunction(() => document.querySelector('[role="status"]')?.textContent?.includes('Gagal menyimpan'));
  await page.evaluate(() => [...document.querySelectorAll('button')].find(button => button.textContent?.trim() === 'Lanjutkan draft')?.click());
  assert.equal(await page.$eval('[data-field-path="trip.title"]', element => (element as HTMLInputElement).value), 'Tetap di draft saat gagal');
  await page.evaluate(() => [...document.querySelectorAll('button')].find(button => button.textContent?.trim() === 'Coba lagi')?.click());
  await page.waitForFunction(() => document.querySelector('[role="status"]')?.textContent?.includes('Tersimpan · revisi'));

  await page.evaluate(() => { const state = window as any; state.delayNext = true; state.started = false; });
  await setTitle('Sebelum pindah');
  await page.waitForFunction(() => (window as any).started === true);
  await page.evaluate(() => [...document.querySelectorAll('button')].find(button => button.textContent?.trim() === 'Draf saya')?.click());
  await page.waitForSelector('aside:not(.hidden) ul li button');
  await page.evaluate(() => [...document.querySelectorAll('aside ul li button')].find(button => button.textContent?.includes('Tanpa judul'))?.click());
  await page.evaluate(() => (window as any).release());
  await page.waitForFunction(id => document.querySelector<HTMLInputElement>('[data-field-path="trip.title"]')?.id.startsWith(id), {}, otherId);
  assert.equal((await stored()).draftContent.trip.title, 'Sebelum pindah', 'draft switch waits for save');
  await page.evaluate(() => [...document.querySelectorAll('button')].find(button => button.textContent?.trim() === 'Draf saya')?.click());
  await page.waitForSelector('aside:not(.hidden) ul li button');
  await page.evaluate(() => [...document.querySelectorAll('aside ul li button')].find(button => button.textContent?.includes('Sebelum pindah'))?.click());
  await page.waitForFunction(id => document.querySelector<HTMLInputElement>('[data-field-path="trip.title"]')?.id.startsWith(id), {}, id);

  const current = await stored();
  const serverDraft = structuredClone(current.draftContent); serverDraft.trip.title = 'Versi server';
  const changed = await app.inject({ method: 'PATCH', url: `/api/v1/itineraries/${id}`, headers: { origin, 'x-engine-request': '1' }, payload: { expectedRevision: current.revision, draftContent: serverDraft, languageContext: current.languageContext, writingContext: current.writingContext } });
  assert.equal(changed.statusCode, 200);
  await setTitle('Versi lokal');
  await page.waitForSelector('[aria-label="Konflik revisi"]');
  assert.equal((await stored()).draftContent.trip.title, 'Versi server');
  assert.equal(await page.$eval('[data-field-path="trip.title"]', element => (element as HTMLInputElement).value), 'Versi lokal');

  const newest = await stored();
  const ready = await app.inject({ method: 'PATCH', url: `/api/v1/itineraries/${id}`, headers: { origin, 'x-engine-request': '1' }, payload: { expectedRevision: newest.revision, draftContent: createContentV2('half_day'), languageContext: newest.languageContext, writingContext: newest.writingContext } });
  assert.equal(ready.statusCode, 200);
  page.on('dialog', dialog => void dialog.accept());
  await page.reload();
  await page.waitForSelector('aside ul li button');
  await page.click('aside ul li button');
  await page.waitForFunction(id => document.querySelector<HTMLInputElement>('[data-field-path="trip.title"]')?.id.startsWith(id), {}, id);
  await page.evaluate(() => {
    const original = window.fetch.bind(window); const state = window as any;
    window.fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
      if (init?.method === 'POST' && url.endsWith('/publish')) {
        const body = JSON.parse(String(init.body)); state.publishRevision = body.expectedRevision;
        return new Response(JSON.stringify({ status: 'pending', operationId: body.operationId }), { headers: { 'content-type': 'application/json' } });
      }
      return original(input, init);
    };
  });
  await page.evaluate(() => [...document.querySelectorAll<HTMLButtonElement>('[aria-label="Langkah"] button')].find(button => button.textContent?.includes('Periksa & bagikan'))?.click());
  await setTitle('Publish terbaru');
  await page.evaluate(() => [...document.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent?.trim() === 'Publish itinerary')?.click());
  await page.waitForFunction(() => Number.isInteger((window as any).publishRevision));
  assert.equal((await stored()).draftContent.trip.title, 'Publish terbaru');
  assert.equal(await page.evaluate(() => (window as any).publishRevision), (await stored()).revision, 'publish waits for the latest revision');
  console.log(JSON.stringify({ sequentialSaves: true, latestEditPreserved: true, previewWaits: true, publishWaits: true, aiWaits: true, importWaits: true, draftSwitchWaits: true, failureRetry: true, validationRecovery: true, conflictPreservesLocal: true }));
} finally {
  await browser?.close();
  await app.close();
  await rm(dataDir, { recursive: true, force: true });
}
