import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import puppeteer, { type Browser, type HTTPRequest } from 'puppeteer';
import { createContentV2 } from '../../tests/web/fixtures-v2.js';

async function availablePort() {
  const server = net.createServer();
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen({ port: 0, host: '127.0.0.1' }, resolve); });
  const port = (server.address() as net.AddressInfo).port;
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  return port;
}

async function main() {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'itinerary-cp027-pending-retry-'));
  const port = await availablePort(); const origin = `http://127.0.0.1:${port}`;
  const outputDir = path.resolve('output/web-e2e'); await mkdir(outputDir, { recursive: true });
  const child: ChildProcess = spawn(process.execPath, ['--import', 'tsx', 'scripts/web/e2e-server.ts'], {
    cwd: process.cwd(), stdio: 'ignore',
    env: { ...process.env, CP027_E2E: '1', HOST: '127.0.0.1', PORT: String(port), PUBLIC_ORIGIN: origin, SHARE_ORIGIN: origin, ENGINE_DATA_DIR: dataDir, ENGINE_RENDER_CSS: path.resolve('.runtime/web-render/brochure.css') }
  });
  let browser: Browser | null = null;
  try {
    const deadline = Date.now() + 20_000;
    while (Date.now() < deadline) {
      if (child.exitCode !== null) throw new Error('Synthetic E2E child exited before readiness.');
      try { if ((await fetch(`${origin}/api/health`)).ok) break; } catch { /* startup pending */ }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.equal((await fetch(`${origin}/api/health`)).ok, true, 'test child ready');
    browser = await puppeteer.launch({ headless: 'shell', args: ['--disable-background-networking', '--no-first-run'] });
    const page = await browser.newPage(); await page.goto(origin);
    await page.waitForFunction(() => document.querySelector('[role="status"]')?.textContent?.includes('Engine tersambung') || document.querySelector('[role="status"]')?.textContent?.includes('Setup'));
    await page.evaluate(async () => {
      const current = await (await fetch('/api/v1/itinerary-engine/profile')).json();
      const response = await fetch('/api/v1/itinerary-engine/profile', { method: 'PATCH', headers: { 'content-type': 'application/json', 'x-engine-request': '1' }, body: JSON.stringify({ expectedRevision: current.revision, profile: { agencyName: 'Probe Guide', agencyContact: 'guide@example.test', agencyLogoAssetId: null, defaultCountry: '', defaultLanguage: null, guides: [], setupCompleted: true } }) });
      if (response.status !== 200) throw new Error(`setup not completed: ${response.status}`);
    });
    await page.reload();
    await page.waitForFunction(() => document.querySelector('[role="status"]')?.textContent?.includes('Engine tersambung'));
    const content = createContentV2('full_day', 'en'); content.trip.title = 'CP027 pending retry probe';
    const created = await page.evaluate(async ({ content }: { content: unknown }) => {
      const response = await fetch('/api/v1/itineraries', { method: 'POST', headers: { 'content-type': 'application/json', 'x-engine-request': '1' }, body: JSON.stringify({ mode: 'full_day', draftContent: content, languageContext: { requestedLanguage: 'en', outputLanguage: 'en', source: 'explicit' }, writingContext: { brief: '', notes: [] } }) });
      return { status: response.status, body: await response.json() };
    }, { content });
    assert.equal(created.status, 201);
    await page.reload(); await page.waitForFunction(() => document.querySelector('[role="status"]')?.textContent?.includes('Engine tersambung'));
    await page.evaluate((title: string) => { const button = [...document.querySelectorAll('aside button')].find(item => item.textContent?.includes(title)); if (!button) throw new Error('probe draft not listed'); (button as HTMLButtonElement).click(); }, content.trip.title);
    await page.waitForFunction(() => document.querySelector('[role="status"]')?.textContent?.includes('Draft dibuka'));

    const operationIds: string[] = []; let responseMode: 'pending' | 'network-error' | 'http-error' = 'pending';
    const intercept = async (request: HTTPRequest) => {
      if (request.url() === `${origin}/api/v1/itineraries/${created.body.id}/publish` && request.method() === 'POST') {
        const body = JSON.parse(request.postData() || '{}'); operationIds.push(body.operationId);
        if (responseMode === 'network-error') await request.abort();
        else if (responseMode === 'http-error') await request.respond({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { code: 'SERVER_RESTARTED', message: 'Synthetic definitive failure.' } }) });
        else await request.respond({ status: 202, contentType: 'application/json', body: JSON.stringify({ status: 'pending', operationId: body.operationId }) });
      } else await request.continue();
    };
    await page.setRequestInterception(true); page.on('request', intercept);
    const clickPublish = async (expected: 'pending' | 'failed') => {
      await page.waitForFunction(() => [...document.querySelectorAll('button')].some(item => item.textContent?.trim() === 'Publish itinerary' && !(item as HTMLButtonElement).disabled));
      const clicked = await page.evaluate(() => { const button = [...document.querySelectorAll('button')].find(item => item.textContent?.trim() === 'Publish itinerary'); if (!button || (button as HTMLButtonElement).disabled) return false; (button as HTMLButtonElement).click(); return true; });
      assert.equal(clicked, true);
      await page.waitForFunction((kind: 'pending' | 'failed') => {
        const status = document.querySelector('[role="status"]')?.textContent || '';
        return kind === 'pending' ? status.includes('Publish masih berjalan; ulangi pemeriksaan status sebentar lagi.') : status.startsWith('Publish gagal:');
      }, {}, expected);
    };
    await clickPublish('pending'); await clickPublish('pending');
    assert.equal(await page.$$('[data-field-path="trip.title"]').then(elements => elements.length), 1);
    await page.locator('[data-field-path="trip.title"]').fill('CP027 pending retry after revision');
    const saveClicked = await page.evaluate(() => { const button = [...document.querySelectorAll('button')].find(item => item.textContent?.trim() === 'Simpan draft'); if (!button) return false; (button as HTMLButtonElement).click(); return true; });
    assert.equal(saveClicked, true); await page.waitForFunction(() => document.querySelector('[role="status"]')?.textContent?.includes('Tersimpan · revisi'));
    await clickPublish('pending'); responseMode = 'network-error'; await clickPublish('failed');
    responseMode = 'http-error'; await clickPublish('failed'); responseMode = 'pending'; await clickPublish('pending');
    page.off('request', intercept); await page.setRequestInterception(false);
    assert.equal(operationIds.length, 6);
    const samePendingRetry = operationIds[0] === operationIds[1];
    const revisionStartsNewIntent = operationIds[2] !== operationIds[0];
    const networkFailureKeepsIntent = operationIds[2] === operationIds[3];
    const definitiveFailureUsesPendingIntent = operationIds[3] === operationIds[4];
    const definitiveFailureClearsIntent = operationIds[5] !== operationIds[4];
    assert.equal(samePendingRetry, true); assert.equal(revisionStartsNewIntent, true);
    assert.equal(networkFailureKeepsIntent, true); assert.equal(definitiveFailureUsesPendingIntent, true); assert.equal(definitiveFailureClearsIntent, true);
    const summary = { finding: 'V27-05-pending-publish-retry', reproduced: false, attempts: operationIds.length, samePendingRetry, revisionStartsNewIntent, networkFailureKeepsIntent, definitiveFailureClearsIntent, provider: 'deterministic test double', liveInference: false };
    await writeFile(path.join(outputDir, 'cp027-pending-retry-probe.json'), JSON.stringify(summary, null, 2));
    console.log(JSON.stringify(summary));
  } finally {
    if (browser) await browser.close();
    if (child.exitCode === null) { child.kill('SIGTERM'); await new Promise<void>(resolve => child.once('exit', () => resolve())); }
    await rm(dataDir, { recursive: true, force: true });
  }
}

await main();
