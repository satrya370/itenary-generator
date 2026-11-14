import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import puppeteer from 'puppeteer';
import { createApp } from '../../src/server/app.js';
import type { ImportExtractRequest, ImportExtractor } from '../../src/server/ai/provider.js';
import { completeSetup } from './complete-setup.js';

// Browser E2E for CP032: real server, SQLite, browser UI, and a deterministic extractor double (no network, no key).
const FIXTURES = path.resolve('tests/fixtures/web/import');
const SUMMARY_QUOTE = 'Perjalanan sehari ke sawah terasering dan pasar seni Ubud.';

const extractor: ImportExtractor = {
  credentialState: 'configured',
  async extract(request: ImportExtractRequest) {
    const joined = request.segments.join('\n');
    const reply = joined.includes('Review usulan tertentu.') ? { summary: { value: 'Pernyataan tanpa bukti.', quote: 'Pernyataan tanpa bukti.' } } : joined.includes(SUMMARY_QUOTE) ? { summary: { value: SUMMARY_QUOTE, quote: SUMMARY_QUOTE } } : {};
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
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'itinerary-cp032-browser-'));
  const port = await availablePort(); const origin = `http://127.0.0.1:${port}`;
  const app = await createApp({ dataDir, publicOrigin: origin, shareOrigin: origin, allowedOrigins: [origin], importExtractor: extractor, renderStylesheetPath: path.resolve('.runtime/web-render/brochure.css') });
  await completeSetup(app, origin);
  await app.listen({ host: '127.0.0.1', port });
  const browser = await puppeteer.launch({ headless: 'shell', args: ['--disable-background-networking', '--no-first-run'] });
  const evidenceDir = path.resolve('output/web-import'); await mkdir(evidenceDir, { recursive: true });
  const page = await browser.newPage(); const failures: string[] = []; const external: string[] = [];
  page.on('console', message => { if (message.type() === 'error' && !message.text().includes('Failed to load resource')) failures.push(message.text()); });
  page.on('request', request => { const url = new URL(request.url()); if (['http:', 'https:'].includes(url.protocol) && url.origin !== origin) external.push(request.url()); });
  page.on('dialog', dialog => dialog.accept());
  await page.setViewport({ width: 1280, height: 900 });

  const bodyText = () => page.evaluate(() => document.body.innerText);
  const waitText = (text: string) => page.waitForFunction(expected => document.body.innerText.includes(expected), { timeout: 20000 }, text);
  const status = () => page.evaluate(() => document.querySelector('[role="status"]')?.textContent ?? '');
  const waitStatus = async (text: string) => { try { await page.waitForFunction(expected => document.querySelector('[role="status"]')?.textContent?.includes(expected), { timeout: 20000 }, text); } catch (cause) { throw new Error(`Expected status ${text}; actual: ${await status()}; body: ${(await bodyText()).slice(-1800)}`, { cause }); } };
  const title = () => page.evaluate(() => document.querySelector('h2.text-xl')?.textContent ?? '');
  async function clickText(text: string, { tag = 'button' }: { tag?: string } = {}) {
    await page.waitForFunction((expected, selectorTag) => [...document.querySelectorAll<HTMLElement>(selectorTag)].some(item => item.textContent?.trim() === expected && !item.hasAttribute('disabled')), { timeout: 20000 }, text, tag);
    await page.evaluate((expected, selectorTag) => {
      const element = [...document.querySelectorAll<HTMLElement>(selectorTag)].find(item => item.textContent?.trim() === expected && !item.hasAttribute('disabled'));
      element?.click();
    }, text, tag);
  }
  async function setTextarea(value: string) {
    await page.evaluate((next) => {
      const element = document.querySelector<HTMLTextAreaElement>('#import-text');
      if (!element) throw new Error('import textarea missing');
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(element, next);
      element.dispatchEvent(new Event('input', { bubbles: true }));
    }, value);
  }
  async function setField(fieldPath: string, value: string) {
    await page.evaluate(({ selector, value }) => {
      const element = document.querySelector<HTMLInputElement | HTMLTextAreaElement>(selector);
      if (!element) throw new Error(`field not found: ${selector}`);
      const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(element, value);
      element.dispatchEvent(new Event('input', { bubbles: true }));
    }, { selector: `[data-field-path="${fieldPath}"]`, value });
  }
  const readFixture = (name: string) => readFile(path.join(FIXTURES, name), 'utf8');
  /** Create flow (CP037): step 1 picks the type, step 2 picks the method. */
  async function startCreate(mode: string, method: 'paste' | 'pdf') {
    await clickText('Buat itinerary baru');
    try { await page.waitForSelector(`[data-mode-card="${mode}"]`, { visible: true }); } catch (cause) { throw new Error(`create ${mode}: ${(await bodyText()).slice(0, 2500)}`, { cause }); }
    await page.click(`[data-mode-card="${mode}"]`);
    await page.waitForSelector(`[data-method="${method}"]`, { visible: true });
    await page.click(`[data-method="${method}"]`);
  }
  async function pasteAndProcess(name: string, mode = 'half_day', expectedTitle?: string) {
    await startCreate(mode, 'paste');
    await page.waitForSelector('#import-text');
    await setTextarea(await readFixture(name));
    await clickText('Baca teks');
    await page.waitForFunction(() => document.querySelector('#import-language') !== null || document.querySelector('[role="alert"]') !== null, { timeout: 20000 });
    const alertText = await page.evaluate(() => document.querySelector('[role="alert"]')?.textContent ?? '');
    assert.equal(alertText, '', `import failed for ${name}: ${alertText}`);
    await clickText('Lihat hasil baca');
    await waitText('Hasil baca otomatis');
    await clickText('Proses');
    await waitStatus('tersimpan');
    if (expectedTitle) { await page.waitForFunction(expected => document.querySelector('h2.text-xl')?.textContent === expected, { timeout: 20000 }, expectedTitle); }
  }

  try {
    await page.goto(origin); await waitStatus('Engine tersambung');

    // Private review: explicit source alternatives, revision-safe selection, reload and mobile layout.
    await startCreate('full_day', 'paste');
    await page.waitForSelector('#import-text');
    await setTextarea('Trip review\nDestinasi: Bali\nDestinasi: Lombok\nHari 1\n09:00 Museum');
    await clickText('Baca teks');
    await clickText('Lihat hasil baca');
    await waitText('konflik perlu dipilih');
    await clickText('Proses');
    await waitStatus('Draf baru dari import tersimpan');
    await waitText('Pilih Lombok');
    assert.match(await bodyText(), /baris 2:.*Destinasi: Bali/s);
    await screenshot('cp032-review-390.png', 390);
    await screenshot('cp032-review-1280.png', 1280);
    await clickText('Pilih Lombok');
    await waitStatus('Review tersimpan');
    await waitText('diselesaikan');
    const reviewedList = (await app.inject({ url: '/api/v1/itineraries' })).json().items as Array<{ id: string; title: string }>;
    const reviewed = reviewedList.find((item) => item.title === 'Trip review');
    assert.ok(reviewed);
    const savedReview = (await app.inject({ url: `/api/v1/imports/operations?itineraryId=${reviewed.id}` })).json();
    assert.equal(savedReview.operation.report.review.candidates[0].status, 'resolved');
    const destination = await page.$eval<HTMLInputElement, string>('[data-field-path="trip.destination"]', (node) => node.value);
    assert.equal(destination, 'Lombok');
    await startCreate('full_day', 'paste');
    await page.waitForSelector('#import-text');
    await setTextarea('Trip konflik usang\nDestinasi: Bali\nDestinasi: Lombok\nHari 1\n09:00 Museum');
    await clickText('Baca teks'); await clickText('Lihat hasil baca'); await clickText('Proses');
    await waitStatus('Draf baru dari import tersimpan'); await waitText('Pilih Lombok');
    const staleList = (await app.inject({ url: '/api/v1/itineraries' })).json().items as Array<{ id: string; title: string }>;
    const staleItem = staleList.find((item) => item.title === 'Trip konflik usang');
    assert.ok(staleItem);
    const before = (await app.inject({ url: `/api/v1/itineraries/${staleItem.id}` })).json();
    const changed = await app.inject({ method: 'PATCH', url: `/api/v1/itineraries/${staleItem.id}`, headers: { origin, 'x-engine-request': '1', 'content-type': 'application/json' }, payload: { expectedRevision: before.revision, draftContent: before.draftContent, languageContext: before.languageContext, writingContext: before.writingContext } });
    assert.equal(changed.statusCode, 200, changed.body);
    await clickText('Pilih Lombok'); await waitText('Draf sudah berubah sejak dibuka.');
    assert.equal((await app.inject({ url: `/api/v1/itineraries/${staleItem.id}` })).json().draftContent.trip.destination, '', 'stale review must not mutate the draft');
    await page.reload(); await waitStatus('Engine tersambung');
    await page.waitForFunction(() => [...document.querySelectorAll('button')].some(button => button.textContent?.includes('Trip review')), { timeout: 20000 });
    await page.evaluate(() => [...document.querySelectorAll('button')].find(button => button.textContent?.includes('Trip review'))?.click());
    await waitStatus('Draft dibuka'); await waitText('diselesaikan');
    assert.equal(await page.$eval<HTMLInputElement, string>('[data-field-path="trip.destination"]', node => node.value), 'Lombok');
    await startCreate('full_day', 'paste'); await page.waitForSelector('#import-text');
    await setTextarea('Review AI\nHari 1\n09:00 Museum\nReview usulan tertentu.');
    await clickText('Baca teks'); await clickText('Lihat hasil baca'); await clickText('Proses');
    await waitStatus('Draf baru dari import tersimpan');
    await page.waitForFunction(() => [...document.querySelectorAll('summary')].some(element => element.textContent?.includes('Usulan AI yang ditolak')));
    await page.evaluate(() => [...document.querySelectorAll('summary')].find(element => element.textContent?.includes('Usulan AI yang ditolak'))?.click());
    await waitText('Pernyataan tanpa bukti.'); await waitText('Usulan, bukan fakta');
    await screenshot('cp032-rejected-ai-390.png', 390);
    await screenshot('cp032-rejected-ai-1280.png', 1280);
    const aiItem = (await app.inject({ url: '/api/v1/itineraries' })).json().items.find((item: { title: string }) => item.title === 'Review AI');
    assert.ok(aiItem);
    assert.notEqual((await app.inject({ url: `/api/v1/itineraries/${aiItem.id}` })).json().draftContent.summary, 'Pernyataan tanpa bukti.');

    // 1. Paste import for the half-day fixture: the report appears and missing required fields are listed.
    await startCreate('half_day', 'paste');
    await page.waitForSelector('#import-text');
    await screenshot('cp032-import-screen-390.png', 390);
    await setTextarea(await readFixture('en-half-day-messy.txt'));
    await clickText('Baca teks');
    await clickText('Lihat hasil baca');
    await waitText('Hasil baca otomatis');
    await clickText('Proses');
    await waitStatus('Draf baru dari import tersimpan');
    assert.equal(await title(), 'Half day Kyoto walk 🌸', 'half-day title from the paste');
    await waitText('Hasil import');
    assert.ok((await bodyText()).includes('Masih kosong dan wajib diisi'), 'missing required fields are listed in the report');
    await page.evaluate(() => document.querySelector('section[aria-label="Hasil import"]')?.scrollIntoView());
    await screenshot('cp032-report-1280.png', 1280);
    const reportText = await page.evaluate(() => document.querySelector('section[aria-label="Hasil import"]')?.textContent ?? '');
    assert.ok(!/\w\[\d*\]|\w\.\w+\[/.test(reportText), `report shows labels, not developer paths: ${reportText.slice(0, 300)}`);
    const jumpTargets = await page.$$('section[aria-label="Hasil import"] ul button');
    assert.ok(jumpTargets.length > 0, 'report lists at least one missing field to jump to');
    await jumpTargets[jumpTargets.length - 1].click();
    await new Promise((resolve) => setTimeout(resolve, 400));
    const focused = await page.evaluate(() => { const el = document.activeElement as HTMLElement | null; return { tag: el?.tagName ?? '', path: el?.dataset?.fieldPath ?? el?.closest<HTMLElement>('[data-field-path]')?.dataset.fieldPath ?? '' }; });
    assert.ok(focused.path.length > 0, `a jump from the report lands on a field (got ${focused.tag})`);

    // 2. Four modes from paste (one draft each).
    await pasteAndProcess('id-full-day-tidy.txt', 'full_day', 'Tur Ubud dan Tegallalang');
    await pasteAndProcess('id-multi-day-3.txt', 'multi_day', 'Liburan Bali 3 Hari 2 Malam');
    await pasteAndProcess('id-destination-guide.txt', 'destination_guide', 'Panduan Yogyakarta');
    await pasteAndProcess('id-activity-rafting.txt', 'activity');

    // 3. Text-layer PDF in every mode; the full-day case last supplies the draft used below.
    for (const [mode, filename] of [['half_day', 'en-half-day-messy.pdf'], ['multi_day', 'id-multi-day-3.pdf'], ['destination_guide', 'id-destination-guide.pdf'], ['activity', 'id-activity-rafting.pdf']]) {
      await startCreate(mode, 'pdf');
      const input = await page.waitForSelector('input#import-pdf') as import('puppeteer').ElementHandle<HTMLInputElement>;
      await input.uploadFile(path.join(FIXTURES, filename));
      await clickText('Baca PDF'); await clickText('Lihat hasil baca'); await clickText('Proses');
      await waitStatus('Draf baru dari import tersimpan');
      await waitText('Hasil import');
    }
    // Cross-mode source: mode-inapplicable meeting facts are reported, not written or fatal.
    await startCreate('destination_guide', 'pdf');
    const crossModePdf = await page.waitForSelector('input#import-pdf') as import('puppeteer').ElementHandle<HTMLInputElement>;
    await crossModePdf.uploadFile(path.join(FIXTURES, 'id-full-day-tidy.pdf'));
    await clickText('Baca PDF'); await clickText('Lihat hasil baca'); await clickText('Proses');
    try { await page.waitForFunction(() => !document.querySelector('#import-pdf') && document.body.innerText.includes('tidak berlaku untuk mode panduan destinasi'), { timeout: 20000 }); } catch (cause) { throw new Error(`cross-mode import: ${(await bodyText()).slice(-2000)}`, { cause }); }
    await startCreate('full_day', 'pdf');
    const pdfInput = await page.waitForSelector('input#import-pdf') as import('puppeteer').ElementHandle<HTMLInputElement>;
    await pdfInput.uploadFile(path.join(FIXTURES, 'id-full-day-tidy.pdf'));
    await clickText('Baca PDF');
    await waitText('Lihat hasil baca');
    await clickText('Lihat hasil baca');
    await waitText('Hasil baca otomatis');
    await clickText('Proses');
    await waitStatus('tersimpan');
    await page.waitForFunction(() => document.querySelector('h2.text-xl')?.textContent === 'Tur Ubud dan Tegallalang', { timeout: 20000 });

    // 4. Scanned PDF is refused with the plain message and creates nothing.
    await startCreate('half_day', 'pdf');
    const scanInput = await page.waitForSelector('input#import-pdf') as import('puppeteer').ElementHandle<HTMLInputElement>;
    await scanInput.uploadFile(path.join(FIXTURES, 'image-only-scan.pdf'));
    await clickText('Baca PDF');
    await page.waitForSelector('[role="alert"]');
    assert.match(await page.$eval('[role="alert"]', (node) => node.textContent ?? ''), /berupa gambar\/scan/, 'scan message');
    await clickText('Kembali');
    await clickText('Batal');

    // 5. Overwrite the open draft: confirmation, then undo.
    await page.waitForFunction(() => document.querySelector('h2.text-xl')?.textContent === 'Tur Ubud dan Tegallalang', { timeout: 20000 });
    await clickText('Isi ulang dari teks/PDF');
    await page.waitForSelector('#import-text');
    await setTextarea(await readFixture('id-whatsapp-injection.txt'));
    await clickText('Baca teks');
    await clickText('Lihat hasil baca');
    await clickText('Proses');
    await page.waitForSelector('[role="alertdialog"]');
    assert.ok((await bodyText()).includes('Timpa draf ini?'), 'overwrite confirmation shown');
    await clickText('Ya, timpa draf');
    await waitStatus('Draf diganti dari import');
    assert.equal(await title(), 'Itinerary Bromo sunrise', 'overwrite replaced the title found in the document');
    await clickText('Batalkan import');
    await waitStatus('Import dibatalkan');
    assert.equal(await title(), 'Tur Ubud dan Tegallalang', 'undo restored the previous title');

    // 6. Import waits until edits are saved before opening.
    await setField('trip.title', 'Judul sementara');
    await clickText('Isi ulang dari teks/PDF');
    await page.waitForSelector('#import-text');
    const savedBeforeImport = (await app.inject({ url: '/api/v1/itineraries' })).json().items as Array<{ title: string }>;
    assert.ok(savedBeforeImport.some(item => item.title === 'Judul sementara'), 'import opens only after the edit is saved');
    await clickText('Kembali ke draf');
    await setField('trip.title', 'Tur Ubud dan Tegallalang');
    await clickText('Simpan draft');
    await waitStatus('Tersimpan · revisi');

    // 7. Publish is locked while required fields are empty; fill them, then publish and check the public page.
    const locked = await page.evaluate(() => [...document.querySelectorAll('button')].find(b => b.textContent?.trim() === 'Publish itinerary')?.disabled ?? null);
    assert.equal(locked, true, 'publish is locked while required fields are empty');
    await setField('summary', 'Ringkasan perjalanan untuk verifikasi.');
    await page.select('[data-field-path="trip.language"]', 'id');
    await page.evaluate(() => {
      for (const element of document.querySelectorAll<HTMLTextAreaElement>('[data-field-path="days[].activities[].description"]')) {
        if (element.value.trim()) continue;
        Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(element, 'Deskripsi aktivitas untuk verifikasi.');
        element.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });
    await clickText('Simpan draft');
    await waitStatus('Tersimpan · revisi');
    await clickText('Publish itinerary');
    await waitStatus('Itinerary berhasil dipublish');
    const list = (await app.inject({ url: '/api/v1/itineraries' })).json().items as Array<{ id: string; title: string }>;
    const current = list.find(item => item.title === 'Tur Ubud dan Tegallalang');
    assert.ok(current, 'published draft found');
    const publication = (await app.inject({ url: `/api/v1/itineraries/${current!.id}/publication` })).json();
    const html = await (await fetch(publication.shareUrl)).text();
    assert.equal(html.includes('Jam kumpul:'), false, 'source text does not appear on the public page');
    assert.equal(html.includes('Titik kumpul:'), false, 'source labels do not appear on the public page');
    assert.equal(external.length, 0, 'the browser made no external request');
    assert.equal(failures.length, 0, `console errors: ${failures.join(' | ')}`);

    const summary = { modes: ['half_day', 'full_day', 'multi_day', 'destination_guide', 'activity'], conflictReview: true, pdfText: true, scanRejected: true, overwriteUndo: true, importWaitsForSave: true, publishedNoSource: true, externalRequests: external.length, consoleErrors: failures.length };
    await writeFile(path.join(evidenceDir, 'verification-summary.json'), JSON.stringify(summary, null, 2));
    console.log(JSON.stringify(summary));
  } finally {
    await browser.close(); await app.close(); await rm(dataDir, { recursive: true, force: true });
  }

  async function screenshot(name: string, width: number) {
    await page.setViewport({ width, height: 900 });
    await page.screenshot({ path: path.join(evidenceDir, name), fullPage: false });
    await page.setViewport({ width: 1280, height: 900 });
  }
}

await main();
