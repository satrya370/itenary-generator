import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import puppeteer from 'puppeteer';
import { createApp } from '../../src/server/app.js';
import { completeSetup } from './complete-setup.js';

async function availablePort() {
  const server = net.createServer();
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen({ port: 0, host: '127.0.0.1' }, resolve); });
  const port = (server.address() as net.AddressInfo).port;
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  return port;
}

async function main() {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'itinerary-cp024-browser-'));
  const port = await availablePort(); const origin = `http://127.0.0.1:${port}`;
  const app = await createApp({ dataDir, publicOrigin: origin, allowedOrigins: [origin], renderStylesheetPath: path.resolve('.runtime/web-render/brochure.css') });
  await completeSetup(app, origin);
  await app.listen({ host: '127.0.0.1', port });
  const browser = await puppeteer.launch({ headless: 'shell', args: ['--disable-background-networking', '--no-first-run'] });
  const page = await browser.newPage(); const consoleErrors: string[] = []; const external: string[] = [];
  const evidenceDir = path.resolve('output/web-preview'); await mkdir(evidenceDir, { recursive: true });
  page.on('console', message => { if (message.type() === 'error' && !message.text().includes('Failed to load resource')) consoleErrors.push(message.text()); });
  page.on('request', request => { const url = new URL(request.url()); if (['http:', 'https:'].includes(url.protocol) && url.origin !== origin) external.push(url.href); });
  async function clickButton(text: string) {
    const clicked = await page.evaluate(text => {
      const button = [...document.querySelectorAll('button')].find(item => item.textContent?.trim() === text);
      if (!button) return false;
      (button as HTMLButtonElement).click(); return true;
    }, text);
    assert.ok(clicked, `button not found: ${text}`);
  }
  try {
    await page.setViewport({ width: 1440, height: 1000 });
    await page.goto(origin); await page.waitForFunction(() => document.querySelector('[role="status"]')?.textContent?.includes('Engine tersambung'));
    await page.click('[data-mode-card="half_day"]');
    await page.waitForFunction(() => document.querySelector('[role="status"]')?.textContent?.includes('Draft baru tersimpan'));
    await clickButton('Tambah aktivitas');
    const activityTitleSelector = '[data-field-path="days[].activities[].title"]';
    const activityTitleFields = await page.$$(activityTitleSelector);
    await activityTitleFields[0].type('Known activity one');
    await page.evaluate(() => {
      const activity = [...document.querySelectorAll('fieldset')].find(item => item.querySelector('legend')?.textContent?.startsWith('Aktivitas 2'));
      const moveUp = [...(activity?.querySelectorAll('button') || [])].find(item => item.textContent?.trim() === 'Naikkan') as HTMLButtonElement | undefined;
      moveUp?.click();
    });
    const activityFieldIds = await page.$$eval(activityTitleSelector, elements => elements.map(element => (element as HTMLInputElement).id));
    await clickButton('Simpan draft'); await page.waitForFunction(() => document.querySelector('[role="status"]')?.textContent?.includes('Tersimpan · revisi'));
    await clickButton('Preview');
    await page.waitForFunction(() => document.querySelector('[role="status"]')?.textContent?.includes('Preview belum tersedia: Pilih atau deteksi bahasa'));
    const localeId = await page.evaluate(() => [...document.querySelectorAll('label')].find(label => label.textContent?.trim().startsWith('Bahasa konten'))?.htmlFor);
    assert.ok(localeId);
    await page.select(`[id="${localeId}"]`, 'en');
    await clickButton('Simpan draft');
    await page.waitForFunction(() => document.querySelector('[role="status"]')?.textContent?.includes('Tersimpan · revisi'));
    await page.waitForFunction(() => [...document.querySelectorAll('button')].some(button => button.textContent?.trim() === 'Preview' && !(button as HTMLButtonElement).disabled));
    await clickButton('Preview');
    await page.waitForFunction(() => document.querySelector('iframe[title="Preview itinerary tersimpan"]') !== null);
    await page.waitForFunction(() => document.querySelector('[aria-label="Publish diagnostics"] [data-diagnostic-path="days[0].activities[0].title"]') !== null);
    const frame = page.frames().find(candidate => candidate.url() === 'about:srcdoc');
    assert.ok(frame, 'sandboxed srcdoc preview frame exists');
    await frame!.waitForFunction(() => Boolean(document.body?.innerText.trim()));
    assert.match(await frame!.content(), /<html lang="en">/);
    const previewText = await frame!.evaluate(() => document.body.innerText);
    assert.ok(previewText.trim().length > 0, 'rendered preview displays visible itinerary content');
    await (await page.$('iframe[title="Preview itinerary tersimpan"]'))!.screenshot({ path: path.join(evidenceDir, 'cp024-preview-frame.png') });
    assert.equal(await page.$eval('iframe[title="Preview itinerary tersimpan"]', element => (element as HTMLIFrameElement).getAttribute('sandbox')), '');
    assert.ok(await page.$('[aria-label="Publish diagnostics"] [data-diagnostic-path="days[0].activities[0].title"]'), 'activity title diagnostic is listed');
    const focusProbe = await page.evaluate(() => {
      const button = document.querySelector<HTMLButtonElement>('[aria-label="Publish diagnostics"] [data-diagnostic-path="days[0].activities[0].title"]');
      button?.click(); return (document.activeElement as HTMLElement)?.id || '';
    });
    const exactActivityFocus = focusProbe === activityFieldIds[0];
    assert.ok(exactActivityFocus, 'diagnostic action focuses the missing activity after reorder');
    for (const [mode, width, height] of [['phone', 390, 844], ['desktop', 1440, 1000]] as const) {
      await page.setViewport({ width, height });
      await clickButton(mode === 'phone' ? 'Phone' : 'Desktop');
      const size = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth }));
      assert.ok(size.document <= size.viewport, `${mode} overflow ${JSON.stringify(size)}`);
      await page.screenshot({ path: path.join(evidenceDir, `cp024-preview-${mode}.png`), fullPage: true });
    }
    assert.deepEqual(external, []);
    assert.deepEqual(consoleErrors, []);
    const summary = { preview: 'saved revision only', publishReady: false, sandbox: true, diagnosticsVisible: true, activityDiagnosticFocus: exactActivityFocus ? 'exact-missing-activity-after-reorder' : 'wrong-target', previewTextLength: previewText.length, externalRequests: external.length, consoleErrors: consoleErrors.length, evidence: ['cp024-preview-phone.png', 'cp024-preview-desktop.png'] };
    await writeFile(path.join(evidenceDir, 'verification-summary.json'), JSON.stringify(summary, null, 2));
    console.log(JSON.stringify({ ...summary, previewText: previewText.trim().slice(0, 200) }));
  } finally {
    await browser.close(); await app.close(); await rm(dataDir, { recursive: true, force: true });
  }
}

await main();
