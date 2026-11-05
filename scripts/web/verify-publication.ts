import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import puppeteer from 'puppeteer';
import { createApp } from '../../src/server/app.js';
import { createContent } from '../../tests/web/fixtures.js';

const managementHeaders = { origin: 'http://127.0.0.1:3000', 'x-engine-request': '1', 'content-type': 'application/json' };
async function availablePort() {
  const server = net.createServer();
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen({ port: 0, host: '127.0.0.1' }, resolve); });
  const port = (server.address() as net.AddressInfo).port;
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  return port;
}

async function main() {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'itinerary-cp025-browser-'));
  const port = await availablePort(); const origin = `http://127.0.0.1:${port}`;
  const app = await createApp({ dataDir, publicOrigin: origin, shareOrigin: origin, allowedOrigins: [origin], renderStylesheetPath: path.resolve('.runtime/web-render/brochure.css') });
  await app.listen({ host: '127.0.0.1', port });
  const browser = await puppeteer.launch({ headless: 'shell', args: ['--disable-background-networking', '--no-first-run'] });
  const page = await browser.newPage(); const failures: string[] = []; const external: string[] = [];
  const evidenceDir = path.resolve('output/web-publication'); await mkdir(evidenceDir, { recursive: true });
  page.on('console', message => { if (message.type() === 'error' && !message.text().includes('Failed to load resource')) failures.push(message.text()); });
  page.on('request', request => { const url = new URL(request.url()); if (['http:', 'https:'].includes(url.protocol) && url.origin !== origin) external.push(url.href); });
  page.on('dialog', dialog => dialog.accept());
  async function clickButton(text: string) {
    const clicked = await page.evaluate(text => { const button = [...document.querySelectorAll('button')].find(item => item.textContent?.trim() === text); if (!button) return false; (button as HTMLButtonElement).click(); return true; }, text);
    assert.ok(clicked, `button not found: ${text}`);
  }
  async function waitStatus(text: string) { await page.waitForFunction(expected => document.querySelector('[role="status"]')?.textContent?.includes(expected), {}, text); }
  async function readStatus() { return await page.evaluate(id => fetch(`/api/v1/itineraries/${id}/publication`).then(response => response.json()), itineraryId); }
  const content = createContent('full_day', 'en'); content.brochure.tripTitle = 'CP025 OG Fixture';
  const created = await app.inject({ method: 'POST', url: '/api/v1/itineraries', headers: { ...managementHeaders, origin }, payload: { mode: 'full_day' } });
  const blank = created.json();
  const saved = await app.inject({ method: 'PATCH', url: `/api/v1/itineraries/${blank.id}`, headers: { ...managementHeaders, origin }, payload: { expectedRevision: blank.revision, draftContent: content, languageContext: { requestedLanguage: 'en', outputLanguage: 'en', source: 'explicit' }, writingContext: { brief: 'Private verification brief.', notes: [] } } });
  assert.equal(saved.statusCode, 200, saved.body);
  const itineraryId = blank.id as string;
  try {
    await page.setViewport({ width: 1440, height: 1000 }); await page.goto(origin);
    await waitStatus('Engine tersambung');
    await page.evaluate(title => { const button = [...document.querySelectorAll('aside button')].find(item => item.textContent?.includes(title)); if (!button) throw new Error('seeded draft missing from list'); (button as HTMLButtonElement).click(); }, 'CP025 OG Fixture');
    await waitStatus('Draft dibuka');
    const inactive = await readStatus(); assert.equal(inactive.active, false);
    await clickButton('Publish itinerary'); await waitStatus('Itinerary berhasil dipublish');
    const first = await readStatus(); assert.equal(first.active, true);
    const stableUrl = first.shareUrl as string; const oldToken = stableUrl.split('/').at(-1)!;
    assert.ok(stableUrl.startsWith(origin));
    const publicPage = await browser.newPage();
    await publicPage.goto(stableUrl);
    assert.equal(await publicPage.title(), 'CP025 OG Fixture');
    const initialMetadata = await publicPage.evaluate(() => Object.fromEntries(['og:title', 'og:description', 'og:type', 'og:url', 'og:image'].map(name => [name, document.querySelector(`meta[property="${name}"]`)?.getAttribute('content') || ''])));
    assert.equal(initialMetadata['og:title'], 'CP025 OG Fixture');
    assert.equal(initialMetadata['og:url'], stableUrl);
    assert.ok(initialMetadata['og:image'].startsWith(`${stableUrl}/og-image`));
    assert.equal(await publicPage.$eval('meta[name="robots"]', element => element.getAttribute('content')), 'noindex,nofollow');
    assert.doesNotMatch(await publicPage.content(), /Private verification brief/);
    const imageResponse = await fetch(initialMetadata['og:image']);
    const imageBytes = Buffer.from(await imageResponse.arrayBuffer());
    const image = { status: imageResponse.status, type: imageResponse.headers.get('content-type'), bytes: imageBytes.byteLength };
    assert.equal(image.status, 200); assert.equal(image.type, 'image/jpeg'); assert.ok(image.bytes > 1000);
    await writeFile(path.join(evidenceDir, 'cp025-og-image.jpg'), imageBytes);
    await publicPage.setViewport({ width: 390, height: 844 }); await publicPage.screenshot({ path: path.join(evidenceDir, 'cp025-public-phone.png'), fullPage: true });
    await publicPage.setViewport({ width: 1440, height: 1000 }); await publicPage.screenshot({ path: path.join(evidenceDir, 'cp025-public-desktop.png'), fullPage: true });
    await publicPage.close();

    const titleId = await page.evaluate(() => document.querySelector<HTMLInputElement>('input[id$="-tripTitle"]')!.id);
    await page.locator(`[id="${titleId}"]`).fill('CP025 Updated Fixture'); await clickButton('Simpan draft'); await waitStatus('Tersimpan · revisi');
    await clickButton('Publish ulang'); await waitStatus('Itinerary berhasil dipublish');
    const updated = await readStatus(); assert.equal(updated.shareUrl, stableUrl); assert.equal(updated.draftDiffers, false);
    const updatedPage = await browser.newPage(); await updatedPage.goto(stableUrl);
    assert.equal(await updatedPage.title(), 'CP025 Updated Fixture'); await updatedPage.close();
    await clickButton('Cabut link'); await waitStatus('Link dicabut');
    assert.equal((await readStatus()).active, false);
    const old = await browser.newPage(); assert.equal((await old.goto(stableUrl))?.status(), 404); assert.equal((await old.goto(`${stableUrl}/og-image`))?.status(), 404); await old.close();
    await clickButton('Publish itinerary'); await waitStatus('Itinerary berhasil dipublish');
    const rotated = await readStatus(); assert.notEqual(rotated.shareUrl, stableUrl);
    const oldAgain = await browser.newPage(); assert.equal((await oldAgain.goto(stableUrl))?.status(), 404); await oldAgain.close();
    assert.deepEqual(external, []); assert.deepEqual(failures, []);
    const safeMetadata = { ...initialMetadata, 'og:url': `${origin}/i/[REDACTED]`, 'og:image': `${origin}/i/[REDACTED]/og-image` };
    const summary = { initialLinkStableOnRepublish: true, revokedTokenPermanentlyDenied: true, rotatedTokenAfterRevoke: rotated.shareUrl !== stableUrl, ogMetadata: safeMetadata, ogImage: image, privateBriefAbsent: true, externalRequests: external.length, consoleErrors: failures.length, mobileAndDesktop: true };
    await writeFile(path.join(evidenceDir, 'verification-summary.json'), JSON.stringify(summary, null, 2)); console.log(JSON.stringify(summary));
  } finally { await browser.close(); await app.close(); await rm(dataDir, { recursive: true, force: true }); }
}

await main();
