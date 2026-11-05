import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import puppeteer from 'puppeteer';
import { createApp } from '../../src/server/app.js';
import type { RecordDto } from '../../src/api/client.js';

async function availablePort() {
  const server = net.createServer();
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen({ port: 0, host: '127.0.0.1' }, () => resolve()); });
  const port = (server.address() as net.AddressInfo).port;
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  return port;
}

async function main() {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'itinerary-cp022-browser-'));
  const port = await availablePort(); const origin = `http://127.0.0.1:${port}`;
  const app = await createApp({ dataDir, publicOrigin: origin, allowedOrigins: [origin] });
  await app.listen({ host: '127.0.0.1', port });
  const browser = await puppeteer.launch({ headless: 'shell', args: ['--disable-background-networking', '--no-first-run'] });
  const evidenceDir = path.resolve('output/web-editor'); await mkdir(evidenceDir, { recursive: true });
  const page = await browser.newPage(); const failures: string[] = []; const external: string[] = [];
  const viewportResults: Array<{ mode: string; viewport: number; document: number }> = [];
  page.on('console', message => { if (message.type() === 'error' && !message.text().includes('Failed to load resource')) failures.push(message.text()); });
  page.on('request', request => { const url = new URL(request.url()); if (['http:', 'https:'].includes(url.protocol) && url.origin !== origin) external.push(request.url()); });
  page.on('dialog', dialog => dialog.accept());

  async function labelId(labelText: string, index = 0) {
    const id = await page.evaluate(({ labelText, index }) => {
      const labels = [...document.querySelectorAll('label')].filter(label => label.textContent?.trim().replace(/\s*\*$/, '') === labelText);
      return labels[index]?.htmlFor || null;
    }, { labelText, index });
    assert.ok(id, `field label not found: ${labelText}[${index}]`);
    return `[id="${id}"]`;
  }
  async function fill(labelText: string, value: string, index = 0) {
    const selector = await labelId(labelText, index);
    const type = await page.$eval(selector, element => (element as HTMLInputElement).type).catch(() => '');
    if (type === 'date' || /[^\u0000-\u007f]/.test(value)) {
      await page.evaluate(({ selector, value }) => {
        const input = document.querySelector<HTMLInputElement | HTMLTextAreaElement>(selector)!;
        const prototype = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(input, value);
        input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true }));
      }, { selector, value });
    } else await page.locator(selector).fill(value);
  }
  async function select(labelText: string, value: string, index = 0) { await page.select(await labelId(labelText, index), value); }
  async function values(labelText: string) {
    return await page.evaluate(labelText => [...document.querySelectorAll('label')]
      .filter(label => label.textContent?.trim().replace(/\s*\*$/, '') === labelText)
      .map(label => (document.getElementById(label.htmlFor) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement)?.value || ''), labelText);
  }
  async function groupValues(title: string) {
    return await page.evaluate(title => {
      const group = [...document.querySelectorAll('fieldset')].find(item => item.querySelector('legend')?.textContent?.trim() === title);
      return [...(group?.querySelectorAll('textarea') || [])].map(item => (item as HTMLTextAreaElement).value);
    }, title);
  }
  async function clickButton(text: string, index = 0) {
    const found = await page.evaluate(({ text, index }) => {
      const buttons = [...document.querySelectorAll('button')].filter(button => button.textContent?.trim() === text || button.getAttribute('aria-label') === text);
      if (!buttons[index]) return false;
      (buttons[index] as HTMLButtonElement).click(); return true;
    }, { text, index });
    assert.ok(found, `button not found: ${text}[${index}]`);
  }
  async function waitStatus(text: string) {
    await page.waitForFunction(expected => document.querySelector('[role="status"]')?.textContent?.includes(expected), {}, text);
  }
  async function createMode(mode: string) {
    await page.select('#new-mode', mode);
    await clickButton('Buat');
    await waitStatus('Draft baru tersimpan');
  }
  async function save() { await clickButton('Simpan draft'); await waitStatus('Tersimpan · revisi'); }
  async function openTitle(title: string) {
    await page.evaluate(text => {
      const buttons = [...document.querySelectorAll('aside button')];
      const button = buttons.find(item => item.textContent?.includes(text));
      if (!button) throw new Error(`draft list item not found: ${text}; rows=${buttons.map(item => item.textContent?.trim()).join(' | ')}`);
      (button as HTMLButtonElement).click();
    }, title);
    await waitStatus('Draft dibuka');
  }
  async function captureMode(mode: string) {
    for (const [name, width, height] of [['mobile', 390, 844], ['desktop', 1440, 1000]] as const) {
      await page.setViewport({ width, height });
      const size = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth }));
      viewportResults.push({ mode, ...size });
      assert.ok(size.document <= size.viewport, `${mode} ${name} overflow: ${JSON.stringify(size)}`);
      await page.screenshot({ path: path.join(evidenceDir, `cp022-${mode}-${name}.png`), fullPage: true });
    }
  }
  async function records() { return await page.evaluate(async () => (await (await fetch('/api/v1/itineraries')).json()).items); }
  async function getRecord(id: string): Promise<RecordDto> { return await page.evaluate(async id => await (await fetch(`/api/v1/itineraries/${id}`)).json(), id); }

  try {
    await page.setViewport({ width: 1440, height: 1000 });
    await page.goto(origin); await waitStatus('Engine tersambung');

    await createMode('half_day');
    await fill('Judul perjalanan', 'CP022 itinerary'); await fill('Destinasi', 'Kyoto'); await fill('Negara', 'Japan');
    await fill('Nama agensi', 'Kyoto Guides'); await fill('Kontak agensi', 'guide@example.test');
    await fill('Bahasa konten', 'ja'); await fill('Ringkasan itinerary', 'A relaxed walk through Kyoto gardens.');
    await fill('Waktu', '08:30'); await fill('Judul aktivitas', 'Garden visit'); await fill('Deskripsi', 'Learn about the garden with a local guide.');
    await clickButton('Tambah aktivitas'); await fill('Judul aktivitas', 'Tea ceremony', 1); await fill('Waktu', '10:00', 1);
    await page.evaluate(() => [...document.querySelectorAll('button')].filter(button => button.textContent?.trim() === 'Naikkan')[1]?.focus());
    await page.keyboard.press('Enter');
    assert.deepEqual(await values('Judul aktivitas'), ['Tea ceremony', 'Garden visit']);
    const halfId = await page.evaluate(() => document.querySelector<HTMLInputElement>('input[id$="-tripTitle"]')!.id.replace(/-tripTitle$/, ''));
    await save();
    const halfSaved = await getRecord(halfId);
    const activityIds = halfSaved.draftContent.schedule[0].activities.map(item => item.id);
    await captureMode('half-day');
    await page.reload(); await waitStatus('Engine tersambung'); await openTitle('CP022 itinerary');
    assert.deepEqual(await values('Judul aktivitas'), ['Tea ceremony', 'Garden visit']);
    assert.deepEqual((await getRecord(halfId)).draftContent.schedule[0].activities.map(item => item.id), activityIds);
    await fill('Musim terbaik', 'Local conflict copy');
    const conflictRequest = await page.evaluate(async id => {
      const current = await (await fetch(`/api/v1/itineraries/${id}`)).json();
      const content = structuredClone(current.draftContent); content.overview.quickFacts.bestSeason = 'Server latest copy';
      return (await fetch(`/api/v1/itineraries/${id}`, { method: 'PATCH', headers: { 'content-type': 'application/json', 'x-engine-request': '1' }, body: JSON.stringify({ expectedRevision: current.revision, draftContent: content, languageContext: current.languageContext, writingContext: current.writingContext }) })).status;
    }, halfId);
    assert.equal(conflictRequest, 200);
    await clickButton('Simpan draft'); await waitStatus('Konflik:');
    assert.equal((await values('Musim terbaik'))[0], 'Local conflict copy');
    await clickButton('Muat revisi terbaru');
    await waitStatus('Versi terbaru dimuat');
    assert.equal((await values('Musim terbaik'))[0], 'Server latest copy');

    await createMode('full_day');
    assert.equal(await page.$$eval('input[id*="accommodation-name"]', inputs => inputs.length), 0);
    await fill('Judul perjalanan', 'CP022 full-day fixture'); await fill('Destinasi', 'Kyoto');
    const fullId = await page.evaluate(() => document.querySelector<HTMLInputElement>('input[id$="-tripTitle"]')!.id.replace(/-tripTitle$/, ''));
    await save(); assert.equal((await getRecord(fullId)).draftContent.schedule.length, 1);
    await captureMode('full-day');
    await page.reload(); await waitStatus('Engine tersambung'); await openTitle('CP022 full-day fixture');
    assert.equal((await values('Judul perjalanan'))[0], 'CP022 full-day fixture');
    await page.reload(); await waitStatus('Engine tersambung'); await openTitle('CP022 full-day fixture');
    assert.equal((await values('Judul perjalanan'))[0], 'CP022 full-day fixture');
    await createMode('multi_day');
    await fill('Judul perjalanan', 'CP022 multi-day fixture');
    await clickButton('Tambah hari'); await page.waitForFunction(() => [...document.querySelectorAll('label')].filter(label => label.textContent?.trim() === 'Judul blok').length === 1);
    await clickButton('Tambah hari'); await page.waitForFunction(() => [...document.querySelectorAll('label')].filter(label => label.textContent?.trim() === 'Judul blok').length === 2);
    await fill('Judul blok', 'Day one', 0); await fill('Judul blok', 'Day two', 1);
    await fill('Tanggal blok', '2026-10-07', 0); await fill('Tanggal blok', '2026-10-08', 1);
    assert.deepEqual(await values('Tanggal blok'), ['2026-10-07', '2026-10-08']);
    await select('Hari selesai (rentang)', '2', 0); await clickButton('Konfirmasi rentang');
    await fill('Bahasa konten', 'en');
    const multiId = await page.evaluate(() => document.querySelector<HTMLInputElement>('input[id$="-tripTitle"]')!.id.replace(/-tripTitle$/, ''));
    await save();
    const beforeReorder = await getRecord(multiId);
    await clickButton('Naikkan hari', 1);
    assert.deepEqual(await values('Judul blok'), ['Day two', 'Day one']);
    await save();
    const multiSaved = await getRecord(multiId);
    assert.deepEqual(multiSaved.draftContent.schedule.map(block => [block.dayStart, block.dayEnd]), [[1, 1], [2, 3]]);
    assert.deepEqual(multiSaved.draftContent.schedule.map(block => block.date), ['2026-10-08', '2026-10-07']);
    assert.deepEqual(multiSaved.draftContent.schedule.map(block => block.id).sort(), beforeReorder.draftContent.schedule.map(block => block.id).sort());
    await captureMode('multi-day');
    await page.reload(); await waitStatus('Engine tersambung'); await openTitle('CP022 multi-day fixture');
    assert.deepEqual(await values('Judul blok'), ['Day two', 'Day one']);

    await createMode('destination_guide'); await clickButton('Tambah tempat');
    await fill('Judul perjalanan', 'CP022 guide fixture');
    await fill('Nama tempat', 'East Garden'); await fill('Grup/tema area', 'Eastern Kyoto'); await fill('Area', 'Higashiyama');
    await fill('Deskripsi', 'Quiet paths and local heritage.'); await fill('Durasi yang disarankan', '90 minutes');
    await fill('Waktu kunjungan yang disarankan', 'Morning'); await fill('Cara menuju lokasi', 'Take the local bus.');
    await fill('Tips lokal *, baris 1', 'Wear comfortable shoes.');
    await clickButton('Tambah termasuk'); await fill('Termasuk, baris 1', 'Local guide');
    await clickButton('Tambah termasuk'); await fill('Termasuk, baris 2', 'Entrance fee');
    assert.deepEqual(await groupValues('Termasuk'), ['Local guide', 'Entrance fee']);
    page.removeAllListeners('dialog'); page.once('dialog', dialog => { void dialog.dismiss(); });
    await clickButton('Hapus Termasuk 2');
    assert.deepEqual(await groupValues('Termasuk'), ['Local guide', 'Entrance fee']);
    page.removeAllListeners('dialog'); page.on('dialog', dialog => dialog.accept());
    await clickButton('Hapus Termasuk 2');
    assert.deepEqual(await groupValues('Termasuk'), ['Local guide']);
    await clickButton('Tambah kontak darurat'); await fill('Label kontak darurat 1', 'Police'); await fill('Nilai kontak darurat 1', '110');
    await fill('Brief perjalanan', 'A quiet garden trip for two.'); await clickButton('Tambah catatan fakta itinerary'); await fill('Catatan fakta itinerary, baris 1', 'Guide confirmed the north entrance.');
    await fill('Bahasa konten', 'zh-Hant');
    await page.waitForFunction(() => document.body.innerText.includes('Katalog/font render untuk zh-Hant belum tersedia'));

    await page.evaluate(async () => {
      const canvas = document.createElement('canvas'); canvas.width = 16; canvas.height = 12;
      const context = canvas.getContext('2d')!; context.fillStyle = '#147d92'; context.fillRect(0, 0, 16, 12);
      const blob = await new Promise<Blob>(resolve => canvas.toBlob(value => resolve(value!), 'image/png'));
      const transfer = new DataTransfer(); transfer.items.add(new File([blob], 'verify-editor.png', { type: 'image/png' }));
      const input = document.querySelector<HTMLInputElement>('#asset-upload')!; input.files = transfer.files; input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await waitStatus('Aset tersimpan');
    const assetList = await page.evaluate(async () => await (await fetch('/api/v1/assets')).json());
    const assetId = assetList.items[0].id as string;
    await select('Foto wilayah', assetId);
    await fill('Fotografer', 'Fixture photographer', 1); await fill('Sumber foto', 'Synthetic guide photo', 1);
    await fill('Judul perjalanan', 'CP022 guide fixture');
    const guideId = await page.evaluate(() => document.querySelector<HTMLInputElement>('input[id$="-tripTitle"]')!.id.replace(/-tripTitle$/, ''));
    await save(); const guide = await getRecord(guideId);
    assert.equal(guide.draftContent.spots[0].name, 'East Garden');
    assert.equal(guide.draftContent.spots[0].description, 'Quiet paths and local heritage.');
    assert.equal(guide.draftContent.spots[0].assetId, assetId);
    assert.equal(guide.draftContent.practical.emergencyContacts[0].value, '110');
    assert.equal(guide.writingContext.brief, 'A quiet garden trip for two.');
    assert.equal(guide.writingContext.notes[0].targetId, 'itinerary');
    await captureMode('destination-guide');
    await page.reload(); await waitStatus('Engine tersambung'); await openTitle('CP022 guide fixture');
    assert.equal((await values('Nama tempat'))[0], 'East Garden');

    await select('Mode perjalanan', 'full_day');
    await clickButton('Batal');
    assert.equal(await values('Nama tempat').then(items => items[0]), 'East Garden');
    await select('Mode perjalanan', 'full_day'); await clickButton('Konfirmasi dan ubah mode');
    assert.equal(await values('Nama tempat').then(items => items.length), 0);
    await page.reload(); await waitStatus('Engine tersambung'); await openTitle('destination guide');

    await createMode('multi_day');
    await fill('Judul perjalanan', 'CP022 14-day fixture');
    for (let day = 1; day <= 14; day++) {
      await clickButton('Tambah hari');
      await page.waitForFunction(expected => [...document.querySelectorAll('label')].filter(label => label.textContent?.trim() === 'Judul blok').length === expected, {}, day);
    }
    assert.equal(await page.evaluate(() => [...document.querySelectorAll('button')].find(button => button.textContent?.trim() === 'Tambah hari')?.disabled), true);
    const fourteenDayId = await page.evaluate(() => document.querySelector<HTMLInputElement>('input[id$="-tripTitle"]')!.id.replace(/-tripTitle$/, ''));
    await save();
    const fourteenDay = await getRecord(fourteenDayId);
    assert.equal(fourteenDay.draftContent.schedule.length, 14);
    assert.equal(fourteenDay.draftContent.brochure.durationDays, 14);
    assert.equal(new Set(fourteenDay.draftContent.schedule.map(block => block.id)).size, 14);
    await page.reload(); await waitStatus('Engine tersambung'); await openTitle('CP022 14-day fixture');
    assert.equal(await values('Judul blok').then(items => items.length), 14);

    await openTitle('CP022 guide fixture');
    for (let index = 1; index < 60; index++) {
      await clickButton('Tambah tempat');
      await page.waitForFunction(expected => [...document.querySelectorAll('legend')].filter(legend => legend.textContent?.startsWith('Tempat ')).length === expected, {}, index + 1);
    }
    const longJapanese = '静かな庭園を歩き、地域の文化と景色を楽しみます。'.repeat(12);
    await fill('Nama tempat', '庭園入口', 0);
    await fill('Nama tempat', '茶室', 1); await clickButton('Turunkan', 0);
    assert.deepEqual(await values('Nama tempat').then(items => items.slice(0, 2)), ['茶室', '庭園入口']);
    await fill('Deskripsi', longJapanese, 1);
    const manySpotId = await page.evaluate(() => document.querySelector<HTMLInputElement>('input[id$="-tripTitle"]')!.id.replace(/-tripTitle$/, ''));
    await save();
    const manySpots = await getRecord(manySpotId);
    assert.equal(manySpots.draftContent.spots.length, 60);
    assert.equal(manySpots.draftContent.spots[0].name, '茶室');
    assert.equal(manySpots.draftContent.spots[1].description, longJapanese);
    assert.equal(new Set(manySpots.draftContent.spots.map(spot => spot.id)).size, 60);
    await page.reload(); await waitStatus('Engine tersambung'); await openTitle('CP022 guide fixture');
    assert.equal(await values('Nama tempat').then(items => items.length), 60);

    const mobileWidth = viewportResults.filter(result => result.viewport === 390).every(result => result.document <= result.viewport);
    const desktopWidth = viewportResults.filter(result => result.viewport === 1440).every(result => result.document <= result.viewport);
    assert.deepEqual(external, []);
    assert.deepEqual(failures, []);
    const summary = { modes: ['half_day', 'full_day', 'multi_day', 'destination_guide'], activityOrder: ['Tea ceremony', 'Garden visit'], scheduleRanges: [[1, 1], [2, 3]], scheduleIdsPreserved: true, fourteenDayBlocks: fourteenDay.draftContent.schedule.length, guideSpots: manySpots.draftContent.spots.length, desktopWidth, mobileWidth, viewports: viewportResults, externalRequests: external.length, consoleErrors: failures.length };
    await writeFile(path.join(evidenceDir, 'verification-summary.json'), JSON.stringify(summary, null, 2));
    console.log(JSON.stringify(summary));
  } finally {
    await browser.close(); await app.close(); await rm(dataDir, { recursive: true, force: true });
  }
}

await main();
