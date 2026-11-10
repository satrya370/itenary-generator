import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import puppeteer from 'puppeteer';
import { ProviderFailure, type AiProvider, type SuggestionContext } from '../../src/server/ai/provider.js';
import { createApp } from '../../src/server/app.js';
import { completeSetup } from './complete-setup.js';

function withOnlyTextChange(draft: any, pathParts: string[], text: string) {
  const copy = structuredClone(draft); let target = copy;
  for (const part of pathParts.slice(0, -1)) target = target[part];
  target[pathParts.at(-1)!] = text; return copy;
}

async function availablePort() {
  const server = net.createServer();
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen({ port: 0, host: '127.0.0.1' }, () => resolve()); });
  const port = (server.address() as net.AddressInfo).port;
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  return port;
}

async function main() {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'itinerary-cp023-browser-'));
  const port = await availablePort(); const origin = `http://127.0.0.1:${port}`; let calls = 0; let credentialConfigured = true;
  const provider: AiProvider = {
    get credentialState() { return credentialConfigured ? 'configured' : 'missing'; },
    async preflight() { return { credentialState: this.credentialState, authenticated: credentialConfigured, modelState: 'listed', modelId: 'openai/gpt-6-luna', pricing: { prompt: 0, completion: 0, webSearch: 0 }, contextLength: 100_000, maxCompletionTokens: 2_000, supportedParameters: ['max_tokens'] }; },
    async generate(request: SuggestionContext) {
      calls++;
      if (calls === 4) await new Promise(resolve => setTimeout(resolve, 500));
      if (calls === 7) throw new ProviderFailure('auth', 401);
      const text = request.task === 'overview' ? 'A calm local journey through Kyoto gardens.' : 'Enjoy a quiet, guided visit through this garden.';
      return { text: JSON.stringify({ text }), usage: { promptTokens: 10, completionTokens: 12, costUsd: 0 } };
    }
  };
  const app = await createApp({ dataDir, publicOrigin: origin, allowedOrigins: [origin], aiProvider: provider, aiLimits: { dailyOperations: 7, operationsPerMinute: 30, maxInFlight: 1, contextBytes: 16 * 1024, timeoutMs: 45_000 } });
  await completeSetup(app, origin);
  await app.listen({ host: '127.0.0.1', port });
  const browser = await puppeteer.launch({ headless: 'shell', args: ['--disable-background-networking', '--no-first-run'] });
  const evidenceDir = path.resolve('output/web-ai'); await mkdir(evidenceDir, { recursive: true });
  const page = await browser.newPage(); const errors: string[] = []; const external: string[] = [];
  page.on('console', message => { if (message.type() === 'error' && !message.text().includes('Failed to load resource')) errors.push(message.text()); });
  page.on('request', request => { const url = new URL(request.url()); if (['http:', 'https:'].includes(url.protocol) && url.origin !== origin) external.push(request.url()); });

  async function field(labelText: string) {
    const id = await page.evaluate(text => [...document.querySelectorAll('label')].find(label => label.textContent?.trim().replace(/\s*\*$/, '') === text)?.htmlFor || null, labelText);
    assert.ok(id, `field label not found: ${labelText}`); return `[id="${id}"]`;
  }
  async function value(labelText: string) { return page.$eval(await field(labelText), element => (element as HTMLInputElement | HTMLTextAreaElement).value); }
  async function fillTextArea(labelText: string, text: string) {
    const selector = await field(labelText);
    await page.evaluate(({ selector, text }) => {
      const textarea = document.querySelector<HTMLTextAreaElement>(selector)!;
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(textarea, text);
      textarea.dispatchEvent(new Event('input', { bubbles: true })); textarea.dispatchEvent(new Event('change', { bubbles: true }));
    }, { selector, text });
  }
  async function click(text: string, scope?: string) {
    const found = await page.evaluate(({ expected, scope }) => { const root = scope ? document.querySelector(`[data-editor-section="${scope}"]`) : document; const buttons = [...(root?.querySelectorAll('button') ?? [])].filter(button => button.textContent?.trim() === expected); if (buttons.length !== 1) return false; (buttons[0] as HTMLButtonElement).click(); return true; }, { expected: text, scope });
    assert.ok(found, `button not found: ${text}${scope ? ` in ${scope}` : ''}`);
  }
  async function pressButton(text: string, scope?: string) {
    const focused = await page.evaluate(({ expected, scope }) => { const root = scope ? document.querySelector(`[data-editor-section="${scope}"]`) : document; const buttons = [...(root?.querySelectorAll('button') ?? [])].filter(button => button.textContent?.trim() === expected); if (buttons.length !== 1) return false; (buttons[0] as HTMLButtonElement).focus(); return document.activeElement === buttons[0]; }, { expected: text, scope });
    assert.ok(focused, `could not focus button: ${text}`); await page.keyboard.press('Enter');
  }
  async function status(text: string) {
    try { await page.waitForFunction(expected => document.querySelector('[role="status"]')?.textContent?.includes(expected), {}, text); }
    catch { throw new Error(`Expected status "${text}"; saw "${await page.$eval('[role="status"]', element => element.textContent)}".`); }
  }
  async function goStep(title: string) {
    await page.evaluate(text => { const b = [...document.querySelectorAll('button')].find(item => item.textContent?.includes(text)); if (!b) throw new Error(`step not found: ${text}`); b.click(); }, title);
  }
  async function save() {
    try {
      await page.waitForFunction(() => { const button = [...document.querySelectorAll('button')].find(item => item.textContent?.trim() === 'Simpan draft') as HTMLButtonElement | undefined; return Boolean(button && !button.disabled); }, { timeout: 5000 });
    } catch {
      const state = await page.evaluate(() => {
        const label = [...document.querySelectorAll('label')].find(item => item.textContent?.trim() === 'Brief perjalanan');
        return { status: document.querySelector('[role="status"]')?.textContent, buttons: [...document.querySelectorAll('button')].filter(item => item.textContent?.trim() === 'Simpan draft').map(item => (item as HTMLButtonElement).disabled), editorState: document.querySelector('main > div > section')?.textContent?.slice(0, 100), briefId: label?.htmlFor, briefValue: label ? (document.getElementById(label.htmlFor) as HTMLTextAreaElement)?.value : null };
      });
      throw new Error(`Save stayed disabled: ${JSON.stringify(state)}.`);
    }
    const before = await page.evaluate(() => ({ status: document.querySelector('[role="status"]')?.textContent, buttons: [...document.querySelectorAll('button')].filter(button => button.textContent?.trim() === 'Simpan draft').map(button => ({ disabled: (button as HTMLButtonElement).disabled })), brief: [...document.querySelectorAll('label')].find(label => label.textContent?.trim() === 'Brief perjalanan')?.htmlFor }));
    await click('Simpan draft');
    try { await status('Tersimpan · revisi'); } catch (error) { throw new Error(`${String(error)} State before click: ${JSON.stringify(before)}`); }
    await page.waitForFunction(() => {
      const button = [...document.querySelectorAll('button')].find(item => ['Publish itinerary', 'Publish ulang'].includes(item.textContent?.trim() || '')) as HTMLButtonElement | undefined;
      return Boolean(button);
    });
  }
  async function storedDraft() {
    const title = await value('Judul perjalanan');
    return page.evaluate(async title => { const items = await (await fetch('/api/v1/itineraries')).json(); const row = items.items.find((item: any) => item.title === title); if (!row) throw new Error(`Saved browser fixture not found: ${title}`); return (await (await fetch(`/api/v1/itineraries/${row.id}`)).json()).draftContent; }, title);
  }

  try {
    await page.setViewport({ width: 1440, height: 1000 }); await page.goto(origin); await status('Engine tersambung');
    assert.equal(await page.$$eval('aside h2', headings => headings.filter(item => item.textContent?.trim() === 'Penulisan AI').length), 0, 'the old sidebar AI box is gone');
    await page.click('[data-mode-card="full_day"]'); await status('Draft baru tersimpan');
    assert.equal(await page.$$eval('[data-editor-section="ai-assist"] summary', items => items.filter(item => item.textContent?.trim() === 'Bantuan AI').length), 1);
    await page.locator(await field('Judul perjalanan')).fill('CP023 browser activity');
    await fillTextArea('Brief perjalanan', 'A relaxed visit through quiet gardens and historic lanes with a local guide sharing the culture and traditions of the region.'); await save();
    await page.evaluate(() => {
      const target = window as any; const original = window.fetch.bind(window); let release!: () => void;
      const gate = new Promise<void>(resolve => { release = resolve; }); target.__languageStarted = false; target.__releaseLanguage = release;
      window.fetch = async (input, init) => {
        const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
        if (url.includes('/language/resolve')) { target.__languageStarted = true; await gate; }
        return original(input, init);
      };
    });
    await click('Deteksi otomatis'); await page.waitForFunction(() => (window as any).__languageStarted === true);
    await fillTextArea('Brief perjalanan', 'Une promenade tranquille dans les jardins et les ruelles historiques avec un guide local qui présente la culture de la région.');
    await page.evaluate(() => (window as any).__releaseLanguage());
    await status('Hasil deteksi bahasa usang karena draft atau brief berubah. Deteksi ulang.');
    assert.equal(await page.evaluate(() => document.body.innerText.includes('Proposal bahasa:')), false);
    await save(); await click('Deteksi otomatis'); await status('Bahasa terdeteksi: fr. Konfirmasi sebelum menyimpan.');
    await click('Konfirmasi bahasa'); await save(); assert.equal(await value('Bahasa konten'), 'fr');
    assert.equal(await value('Judul perjalanan'), 'CP023 browser activity');
    await page.select(await field('Bahasa konten'), 'en'); await save();

    await goStep('Ringkasan');
    const overview = await field('Ringkasan');
    const beforeOverview = await storedDraft();
    await pressButton('Buat dengan AI', 'summary'); await status('Usulan AI siap ditinjau; draft belum berubah.');
    await page.screenshot({ path: path.join(evidenceDir, 'cp023-ai-proposal-desktop.png'), fullPage: true });
    assert.equal(await page.$eval(overview, element => (element as HTMLTextAreaElement).value), '');
    await click('Buang saran'); assert.equal(await page.$$('[aria-label="Usulan AI"]').then(items => items.length), 0); assert.deepEqual(await storedDraft(), beforeOverview);
    await click('Buat dengan AI', 'summary'); await status('Usulan AI siap ditinjau; draft belum berubah.'); await pressButton('Terapkan ke field ini');
    const overviewText = 'A calm local journey through Kyoto gardens.';
    assert.equal(await page.$eval(overview, element => (element as HTMLTextAreaElement).value), overviewText);
    assert.deepEqual(await storedDraft(), beforeOverview);
    await save(); assert.deepEqual(await storedDraft(), withOnlyTextChange(beforeOverview, ['summary'], overviewText));

    await goStep('Jadwal');
    const description = await field('Deskripsi');
    const beforeActivityDescription = await storedDraft();
    await click('Buat dengan AI', 'schedule'); await status('Usulan AI siap ditinjau; draft belum berubah.'); await click('Terapkan ke field ini'); assert.deepEqual(await storedDraft(), beforeActivityDescription); await save();
    const savedDescription = 'Enjoy a quiet, guided visit through this garden.';
    const afterActivityApply = withOnlyTextChange(beforeActivityDescription, ['days', '0', 'activities', '0', 'description'], savedDescription);
    assert.deepEqual(await storedDraft(), afterActivityApply);
    
    await click('Buat dengan AI', 'schedule'); await status('Meminta usulan AI…');
    await page.locator(description).fill('Local edit made during generation.');
    await status('Hasil AI usang karena draft/target berubah; tidak ada perubahan yang diterapkan.');
    assert.equal(await value('Deskripsi'), 'Local edit made during generation.');
    assert.deepEqual(await storedDraft(), afterActivityApply);
    await save();

    await page.setViewport({ width: 390, height: 844 });
    await page.evaluate(() => [...document.querySelectorAll('button')].find(b => b.textContent?.trim() === 'Draf saya')?.click());
    await page.click('[data-mode-card="destination_guide"]'); await status('Draft baru tersimpan');
    await page.locator(await field('Judul perjalanan')).fill('CP023 browser spot'); await page.select(await field('Bahasa konten'), 'en'); await goStep('Tempat'); await click('Tambah tempat');
    await goStep('Tempat');
    await goStep('Tempat');
    await page.locator(await field('Nama tempat')).fill('East Garden'); await page.locator(await field('Area')).fill('East Kyoto'); await save();
    const beforeSpotDescription = await storedDraft();
    await click('Buat dengan AI', 'places'); await status('Usulan AI siap ditinjau; draft belum berubah.'); await click('Terapkan ke field ini');
    const spotDescription = 'Enjoy a quiet, guided visit through this garden.';
    assert.deepEqual(await storedDraft(), beforeSpotDescription);
    await save(); assert.deepEqual(await storedDraft(), withOnlyTextChange(beforeSpotDescription, ['places', '0', 'description'], spotDescription));

    await page.setViewport({ width: 1440, height: 1000 });
    await page.evaluate(() => {
      const target = window as any; const original = window.fetch.bind(window); target.__pendingIds = [] as string[];
      window.fetch = async (input, init) => {
        const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
        if (url.includes('/ai/overview') && init?.method === 'POST') {
          const operationId = JSON.parse(String(init.body)).operationId as string; target.__pendingIds.push(operationId);
          if (target.__pendingIds.length === 1) { target.__pendingStarted = true; return Response.json({ operationId, status: 'running', retryAfterMs: 600 }, { status: 202 }); }
        }
        return original(input, init);
      };
    });
    await page.setViewport({ width: 390, height: 844 });
    await click('Buat dengan AI', 'summary'); await page.waitForFunction(() => (window as any).__pendingStarted === true);
    await page.screenshot({ path: path.join(evidenceDir, 'cp023-ai-pending-mobile.png'), fullPage: true });
    await status('Usulan AI siap ditinjau; draft belum berubah.');
    const pendingIds = await page.evaluate(() => (window as any).__pendingIds as string[]);
    assert.equal(pendingIds.length, 2); assert.equal(pendingIds[0], pendingIds[1]); await click('Buang saran'); await page.setViewport({ width: 1440, height: 1000 });
    await click('Buat dengan AI', 'summary'); await page.waitForFunction(() => document.querySelector('[role="status"]')?.textContent?.includes('AI tidak tersedia:'));
    await page.screenshot({ path: path.join(evidenceDir, 'cp023-ai-error-desktop.png'), fullPage: true });
    await click('Buat dengan AI', 'summary'); await status('Daily local AI operation limit reached.'); assert.equal(calls, 7);
    credentialConfigured = false;
    await click('Periksa model dan koneksi'); await page.waitForFunction(() => document.querySelector('[role="status"]')?.textContent?.includes('configured provider/model is not ready'));
    await goStep('Info trip');
    await page.locator(await field('Judul perjalanan')).fill('Manual edit after AI error'); await save();
    assert.equal((await storedDraft()).trip.title, 'Manual edit after AI error');
    assert.deepEqual(external, []); assert.deepEqual(errors, []);

    await page.setViewport({ width: 1440, height: 1000 });
    const desktop = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth }));
    assert.ok(desktop.document <= desktop.viewport); await page.screenshot({ path: path.join(evidenceDir, 'cp023-ai-desktop.png'), fullPage: true });
    await page.setViewport({ width: 390, height: 844 });
    const mobile = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth }));
    assert.ok(mobile.document <= mobile.viewport); await page.screenshot({ path: path.join(evidenceDir, 'cp023-ai-mobile.png'), fullPage: true });
    const summary = { modelId: 'openai/gpt-6-luna', provider: 'deterministic browser-test double', generatedWithoutDraftMutation: true, applyRequiredExplicitSave: true, discardPreservedDraft: true, exactOverviewAndDescriptionFieldDiffs: true, activityAndSpotApplyVerified: true, pendingResponsePolledWithSameOperationId: pendingIds[0] === pendingIds[1], languageProposalInvalidatedAfterBriefEdit: true, languageProposalConfirmedBeforeSave: true, manualCopyPreservedAcrossLanguageResolution: true, localEditDuringGenerationRejected: true, providerErrorDisplayed: true, dailyLimitDisplayedWithoutDispatch: true, credentialMissingPreflightSafe: true, manualEditingAndSavingAfterProviderError: true, savedDescriptionPreserved: true, desktop, mobile, consoleErrors: errors.length, externalRequests: external.length };
    await writeFile(path.join(evidenceDir, 'browser-verification-summary.json'), JSON.stringify(summary, null, 2));
    console.log(JSON.stringify(summary));
  } finally { await browser.close(); await app.close(); await rm(dataDir, { recursive: true, force: true }); }
}

await main();
