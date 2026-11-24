import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import puppeteer from 'puppeteer';
import { createApp } from '../../src/server/app.js';
import { completeSetup } from './complete-setup.js';

process.env.OPENROUTER_API_KEY = 'disabled-local-test';
const origin = 'http://127.0.0.1:3198';
const headers = { origin, 'x-engine-request': '1', 'content-type': 'application/json' };
const dataDir = await mkdtemp(path.join(os.tmpdir(), 'stable-inputs-'));
const app = await createApp({ dataDir, publicOrigin: origin, allowedOrigins: [origin] });
const browser = await puppeteer.launch({ headless: 'shell' });
try {
  await completeSetup(app, origin);
  await app.listen({ host: '127.0.0.1', port: 3198 });
  const page = await browser.newPage();
  const click = async (text: string) => {
    await page.waitForFunction(text => [...document.querySelectorAll('button')].some(b => b.textContent?.includes(text) && !b.disabled), {}, text);
    await page.evaluate(text => [...document.querySelectorAll('button')].find(b => b.textContent?.includes(text) && !b.disabled)?.click(), text);
  };
  for (const mode of ['activity', 'half_day', 'full_day', 'multi_day', 'destination_guide']) {
    const created = (await app.inject({ method: 'POST', url: '/api/v1/itineraries', headers, payload: { mode } })).json();
    const draft = created.draftContent; draft.trip.title = `Input check ${mode}`;
    await app.inject({ method: 'PATCH', url: `/api/v1/itineraries/${created.id}`, headers, payload: { expectedRevision: created.revision, draftContent: draft, languageContext: created.languageContext, writingContext: created.writingContext } });
    await page.goto(origin);
    await click(`Input check ${mode}`);
    await click('Detail & tampilan');
    for (const field of ['included', 'notIncluded', 'whatToBring', 'notSuitableFor', 'notAllowed', 'localTips']) {
      await page.$eval(`[data-option-list="${field}"]`, (root) => [...root.querySelectorAll('button')].find((button) => button.textContent?.startsWith('Tambah '))?.click());
      const selector = `[data-option-list="${field}"] textarea[data-field-path="${field}[]"]`;
      await page.waitForSelector(selector);
      await new Promise(r => setTimeout(r, 1500));
      assert.ok(await page.$(selector), `${mode}/${field}: empty row survived autosave`);
      await page.click(selector);
      if (field === 'included') {
        await page.type(selector, 'Air mineral', { delay: 80 });
        await new Promise(r => setTimeout(r, 1500));
        assert.ok(await page.$(selector), `${mode}/${field}: row remains editable while its value exactly matches a preset`);
        assert.equal(await page.$eval(selector, el => (el as HTMLTextAreaElement).value), 'Air mineral');
        await page.type(selector, ' tambahan', { delay: 80 });
      } else await page.type(selector, `Custom ${field}`, { delay: 80 });
      assert.equal(await page.$eval(selector, el => document.activeElement === el), true, `${mode}/${field}: focus retained`);
      await new Promise(r => setTimeout(r, 1600));
      assert.equal(await page.$eval(selector, el => (el as HTMLTextAreaElement).value), field === 'included' ? 'Air mineral tambahan' : `Custom ${field}`);
    }
    assert.ok(await page.$('[data-editor-section="practical"] input[type="checkbox"]'), 'presets visible without resolved language');
    const presetSelector = '[data-editor-section="practical"] input[type="checkbox"]';
    await page.click(presetSelector);
    await new Promise(r => setTimeout(r, 1500));
    assert.equal(await page.$eval(presetSelector, el => (el as HTMLInputElement).checked), true);
    await page.evaluate(() => [...document.querySelectorAll('summary')].find(el => el.textContent?.includes('Ketentuan & penutup'))?.click());
    await new Promise(r => setTimeout(r, 1200));
    assert.equal(await page.evaluate(() => [...document.querySelectorAll('details')].find(el => el.querySelector('summary')?.textContent?.includes('Ketentuan & penutup'))?.open), true);
    if (mode === 'activity') {
      await click('Susun');
      const category = '[data-field-path="activity.category"]';
      await page.waitForSelector(category, { visible: true }); await page.type(category, 'Wisata astronomi');
      await new Promise(r => setTimeout(r, 1700));
      assert.equal((await app.inject({ url: `/api/v1/itineraries/${created.id}` })).json().draftContent.activity.category, 'Wisata astronomi');
    }
    await page.reload(); await click(`Input check ${mode}`); await click('Detail & tampilan');
    assert.equal(await page.$eval(`[data-editor-section="practical"] textarea`, el => (el as HTMLTextAreaElement).value), 'Air mineral tambahan');
    assert.equal(await page.$eval(presetSelector, el => (el as HTMLInputElement).checked), true);
    await mkdir('output/stable-inputs', { recursive: true });
    await page.setViewport({ width: 390, height: 900 });
    await page.$eval('[data-editor-section="practical"]', el => el.scrollIntoView({ block: 'start' }));
    await page.screenshot({ path: `output/stable-inputs/${mode}-390.png` });
    if (mode === 'activity') {
      await click('Susun');
      assert.equal(await page.$eval('[data-field-path="activity.category"]', el => (el as HTMLInputElement).value), 'Wisata astronomi');
      await page.$eval('[data-field-path="activity.category"]', el => el.scrollIntoView({ block: 'center' }));
      await page.screenshot({ path: 'output/stable-inputs/category-390.png' });
      await page.setViewport({ width: 1280, height: 900 });
      await page.screenshot({ path: 'output/stable-inputs/category-1280.png' });
      await click('Detail & tampilan');
      await page.$eval('[data-option-list="included"]', (root) => [...root.querySelectorAll('button')].find((button) => button.textContent?.startsWith('Tambah '))?.click());
      const includedInputs = '[data-option-list="included"] textarea[data-field-path="included[]"]';
      await page.waitForFunction((selector: string) => document.querySelectorAll(selector).length >= 2, {}, includedInputs);
      const customInputs = await page.$$(includedInputs); await customInputs[1].type('Custom urutan kedua');
      await page.$eval('[data-option-list="included"]', (root) => [...root.querySelectorAll('button')].find((button) => button.getAttribute('aria-label') === 'Turunkan Termasuk 1')?.click());
      await new Promise(r => setTimeout(r, 1700));
      const finalRecord = (await app.inject({ url: `/api/v1/itineraries/${created.id}` })).json();
      const ordered = finalRecord.draftContent.included as string[];
      assert.deepEqual(ordered.filter((value) => value !== 'Pemandu wisata lokal'), ['Custom urutan kedua', 'Air mineral tambahan'], 'moving custom rows preserves their intended order after autosave');
      assert.ok(ordered.includes('Pemandu wisata lokal'), 'selected preset remains saved while custom rows move');
    }
    await page.setViewport({ width: 1280, height: 900 });
    console.log(`PASS ${mode}: six lists, focus, autosave, reload`);
  }
} finally { await browser.close(); await app.close(); await rm(dataDir, { recursive: true, force: true }); }
