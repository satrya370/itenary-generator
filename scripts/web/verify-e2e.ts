import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import puppeteer from 'puppeteer';
import sharp from 'sharp';
import { createContentV2 } from '../../tests/web/fixtures-v2.js';
import fixtureManifest from '../../tests/web/cp027-fixtures.json' with { type: 'json' };
import type { ItineraryMode } from '../../src/contracts/types.js';

async function availablePort() {
  const server = net.createServer();
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen({ port: 0, host: '127.0.0.1' }, resolve); });
  const port = (server.address() as net.AddressInfo).port;
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  return port;
}

async function startServer(port: number, dataDir: string, crashAfterPromote = false): Promise<ChildProcess> {
  const child = spawn(process.execPath, ['--import', 'tsx', 'scripts/web/e2e-server.ts'], {
    cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, CP027_E2E: '1', CP027_CRASH_AFTER_PROMOTE: crashAfterPromote ? '1' : '0', HOST: '127.0.0.1', PORT: String(port), PUBLIC_ORIGIN: `http://127.0.0.1:${port}`, SHARE_ORIGIN: `http://127.0.0.1:${port}`, ENGINE_DATA_DIR: dataDir, ENGINE_RENDER_CSS: path.resolve('.runtime/web-render/brochure.css') }
  });
  let logs = '';
  child.stdout?.on('data', chunk => { logs += String(chunk).slice(0, 2000); });
  child.stderr?.on('data', chunk => { logs += String(chunk).slice(0, 2000); });
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`CP027 server child exited before ready (${child.exitCode}). ${logs.slice(-1500)}`);
    try { const response = await fetch(`http://127.0.0.1:${port}/api/health`); if (response.ok) return child; } catch { /* startup pending */ }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  child.kill(); throw new Error(`CP027 server child readiness timed out. ${logs.slice(-1500)}`);
}

async function stopServer(child: ChildProcess) {
  if (child.exitCode !== null) return;
  const exited = new Promise<void>(resolve => child.once('exit', () => resolve()));
  child.kill('SIGTERM');
  await Promise.race([exited, new Promise<void>(resolve => setTimeout(resolve, 5000))]);
  if (child.exitCode === null) { child.kill('SIGKILL'); await exited; }
}

async function main() {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'itinerary-cp027-e2e-'));
  const port = await availablePort(); const origin = `http://127.0.0.1:${port}`;
  const browser = await puppeteer.launch({ headless: 'shell', args: ['--disable-background-networking', '--no-first-run'] });
  const outputDir = path.resolve('output/web-e2e'); await mkdir(outputDir, { recursive: true });
  const page = await browser.newPage(); const publicPage = await browser.newPage();
  const consoleErrors: string[] = []; const external: string[] = [];
  const progress = { serverReady: false, fullDayDraftCreated: false, aiApplyAndSave: false, previewPassed: false, fullDayPublished: false, interruptedPublishStatus: -1, recoveredOperationStatus: '', recoveredOperationError: '', crashRecovery: false, restartPersistence: false, republishedAfterEdit: false, revokeAndRotation: false, publishedModes: [] as string[], renderedLocales: [] as string[], longCopyPublished: false, ownedAssetPublished: false, stressCases: [] as string[] };
  let stage = 'server-start';
  for (const target of [page, publicPage]) {
    target.on('console', message => { if (message.type() === 'error' && !message.text().includes('Failed to load resource')) consoleErrors.push(message.text()); });
    target.on('request', request => { const url = new URL(request.url()); if (['http:', 'https:'].includes(url.protocol) && url.origin !== origin) external.push(url.href); });
    target.on('dialog', dialog => dialog.accept());
  }
  let child: ChildProcess | null = null;
  try {
    child = await startServer(port, dataDir);
    progress.serverReady = true;
    await page.setViewport({ width: 1440, height: 1000 });
    await page.goto(origin); await page.waitForFunction(() => document.querySelector('[role="status"]')?.textContent?.includes('Engine tersambung'));
    await page.evaluate(async () => {
      const current = await (await fetch('/api/v1/itinerary-engine/profile')).json();
      const response = await fetch('/api/v1/itinerary-engine/profile', { method: 'PATCH', headers: { 'content-type': 'application/json', 'x-engine-request': '1' }, body: JSON.stringify({ expectedRevision: current.revision, profile: { agencyName: 'Verification Guide', agencyContact: 'guide@example.test', agencyLogoAssetId: null, defaultCountry: '', defaultLanguage: null, guides: [], setupCompleted: true } }) });
      if (response.status !== 200) throw new Error(`setup not completed: ${response.status}`);
    });
    const seedContent = createContentV2('full_day', 'fr');
    seedContent.trip.title = 'CP027 end-to-end'; seedContent.trip.destination = 'Kyoto'; seedContent.trip.country = 'Japan'; seedContent.trip.region = null;
    seedContent.summary = ''; seedContent.included = ['Local guide']; seedContent.closingNote = 'Enjoy the visit.'; seedContent.disclaimer = 'Visit times are suggestions.';
    seedContent.days[0].title = 'Garden day'; seedContent.days[0].location = 'Kyoto';
    seedContent.days[0].activities = [{ id: crypto.randomUUID(), time: '09:00', durationMinutes: 90, kind: 'sightseeing', title: 'Garden visit', place: 'Kyoto', description: '', tip: null }];
    const seeded = await page.evaluate(async content => {
      const response = await fetch('/api/v1/itineraries', { method: 'POST', headers: { 'content-type': 'application/json', 'x-engine-request': '1' }, body: JSON.stringify({ mode: 'full_day', draftContent: content, languageContext: { requestedLanguage: 'fr', outputLanguage: 'fr', source: 'explicit' }, writingContext: { brief: 'Une promenade tranquille dans les jardins de Kyoto avec un guide local qui explique les traditions.', notes: [{ targetId: 'itinerary', text: 'The guide confirmed a relaxed morning pace.' }] } }) });
      return { status: response.status, record: await response.json() };
    }, seedContent);
    assert.equal(seeded.status, 201, JSON.stringify(seeded.record.error || {}));
    progress.fullDayDraftCreated = true;
    const recordId = seeded.record.id as string;
    await page.reload(); await page.waitForFunction(() => document.querySelector('[role="status"]')?.textContent?.includes('Engine tersambung'));
    await page.evaluate(title => { const button = [...document.querySelectorAll('aside button')].find(item => item.textContent?.includes(title)); if (!button) throw new Error('synthetic E2E draft was not listed'); (button as HTMLButtonElement).click(); }, 'CP027 end-to-end');
    await page.waitForFunction(() => document.querySelector('[role="status"]')?.textContent?.includes('Draft dibuka'));

    const beforeAi = await page.evaluate(async id => (await (await fetch(`/api/v1/itineraries/${id}`)).json()).draftContent, recordId);
    await clickButton(page, 'Buat dengan AI', 'summary');
    await page.waitForFunction(() => document.querySelector('[role="status"]')?.textContent?.includes('Usulan AI siap ditinjau'));
    const afterGenerate = await page.evaluate(async id => (await (await fetch(`/api/v1/itineraries/${id}`)).json()).draftContent, recordId);
    assert.deepEqual(afterGenerate, beforeAi, 'Generate must not mutate the server draft');
    await clickButton(page, 'Terapkan ke field ini');
    await page.waitForFunction(() => document.body.innerText.includes('Saran diterapkan ke field lokal'));
    const afterOverviewApply = await page.evaluate(async id => (await (await fetch(`/api/v1/itineraries/${id}`)).json()).draftContent, recordId);
    assert.deepEqual(afterOverviewApply, beforeAi, 'Apply stays local until manual Save');
    const overviewLocal = await page.$eval('[data-field-path="summary"]', element => (element as HTMLTextAreaElement).value);
    assert.ok(overviewLocal.trim(), 'AI Apply populated the local overview');
    await clickButton(page, 'Simpan draft');
    await page.waitForFunction(() => document.querySelector('[role="status"]')?.textContent?.includes('Tersimpan · revisi'));
    const savedAfterAi = await page.evaluate(async id => (await (await fetch(`/api/v1/itineraries/${id}`)).json()).draftContent, recordId);
    const expectedAfterOverviewSave = structuredClone(beforeAi); expectedAfterOverviewSave.summary = overviewLocal;
    assert.deepEqual(savedAfterAi, expectedAfterOverviewSave, 'manual Save changes only the requested overview field');

    const beforeDescription = structuredClone(savedAfterAi);
    await clickButton(page, 'Buat dengan AI', 'schedule');
    await page.waitForFunction(() => document.querySelector('[role="status"]')?.textContent?.includes('Usulan AI siap ditinjau'));
    await clickButton(page, 'Terapkan ke field ini');
    await page.waitForFunction(() => document.body.innerText.includes('Saran diterapkan ke field lokal'));
    const descriptionLocal = await page.$eval('[data-field-path="days[].activities[].description"]', element => (element as HTMLTextAreaElement).value);
    await clickButton(page, 'Simpan draft');
    await page.waitForFunction(() => document.querySelector('[role="status"]')?.textContent?.includes('Tersimpan · revisi'));
    const savedRecord = await page.evaluate(async id => await (await fetch(`/api/v1/itineraries/${id}`)).json(), recordId);
    const expectedAfterDescriptionSave = structuredClone(savedAfterAi); expectedAfterDescriptionSave.days[0].activities[0].description = descriptionLocal;
    assert.deepEqual(savedRecord.draftContent, expectedAfterDescriptionSave, 'manual Save changes only the requested description field');
    progress.aiApplyAndSave = true;
    assert.equal(savedRecord.writingContext.brief, 'Une promenade tranquille dans les jardins de Kyoto avec un guide local qui explique les traditions.');
    await clickButton(page, 'Preview'); await page.waitForFunction(() => document.body.innerText.includes('Preview draft tersimpan'));
    assert.ok((await page.$eval('[aria-label="Publish diagnostics"]', element => element.textContent || '')).includes('Tidak ada error publish'));
    await page.screenshot({ path: path.join(outputDir, 'cp027-integrated-editor-preview.png'), fullPage: true });
    await clickButton(page, 'Publish itinerary'); await page.waitForFunction(() => document.querySelector('[role="status"]')?.textContent?.includes('Itinerary berhasil dipublish'));
    const publication = await page.evaluate(async id => await (await fetch(`/api/v1/itineraries/${id}/publication`)).json(), recordId);
    assert.equal(publication.active, true);
    const shareUrl = publication.shareUrl as string; const token = shareUrl.split('/').at(-1)!;
    const anonymousHtml = await fetch(shareUrl); assert.equal(anonymousHtml.status, 200);
    const anonymousMarkup = await anonymousHtml.text(); assert.match(anonymousMarkup, /property="og:title"/); assert.doesNotMatch(anonymousMarkup, /<script\b/i);
    const anonymousOg = await fetch(`${shareUrl}/og-image`); assert.equal(anonymousOg.status, 200); assert.match(anonymousOg.headers.get('content-type') || '', /image\/jpeg/);
    assert.deepEqual(await sharp(Buffer.from(await anonymousOg.arrayBuffer())).metadata().then(({ width, height }) => [width, height]), [1200, 630]);
    await publicPage.goto(shareUrl); assert.equal(await publicPage.title(), 'CP027 end-to-end');
    const meta = await publicPage.evaluate(() => ({ title: document.querySelector('meta[property="og:title"]')?.getAttribute('content'), url: document.querySelector('meta[property="og:url"]')?.getAttribute('content'), image: document.querySelector('meta[property="og:image"]')?.getAttribute('content') }));
    assert.deepEqual(meta, { title: 'CP027 end-to-end', url: shareUrl, image: `${shareUrl}/og-image` });
    assert.doesNotMatch(await publicPage.content(), /The guide confirmed a relaxed morning pace\./);
    progress.previewPassed = true;
    progress.fullDayPublished = true;
    assert.doesNotMatch(await publicPage.content(), /Une promenade tranquille dans les jardins de Kyoto avec un guide local qui explique les traditions\./);
    await publicPage.setViewport({ width: 1440, height: 1000 });
    const fullDayDimensions = await publicPage.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth }));
    assert.ok(fullDayDimensions.document <= fullDayDimensions.viewport);
    await publicPage.screenshot({ path: path.join(outputDir, 'cp027-mode-full_day-desktop.png'), fullPage: true });
    await publicPage.setViewport({ width: 390, height: 844 });
    const fullDayMobileDimensions = await publicPage.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth }));
    assert.ok(fullDayMobileDimensions.document <= fullDayMobileDimensions.viewport);
    await publicPage.screenshot({ path: path.join(outputDir, 'cp027-integrated-public-mobile.png'), fullPage: true });

    stage = 'crash-prepare-new-revision';
    const crashRevision = await page.evaluate(async id => {
      const current = await (await fetch(`/api/v1/itineraries/${id}`)).json();
      const draftContent = structuredClone(current.draftContent); draftContent.closingNote = 'Crash-boundary candidate must remain a draft.';
      const response = await fetch(`/api/v1/itineraries/${id}`, { method: 'PATCH', headers: { 'content-type': 'application/json', 'x-engine-request': '1' }, body: JSON.stringify({ expectedRevision: current.revision, draftContent, languageContext: current.languageContext, writingContext: current.writingContext }) });
      return { status: response.status, body: await response.json() };
    }, recordId);
    assert.equal(crashRevision.status, 200);
    const crashOperationId = 'a0270000-0000-4000-8000-000000000001';
    await stopServer(child); child = await startServer(port, dataDir, true);
    stage = 'crash-after-artifact-promote';
    const interruptedPublish = await page.evaluate(async ({ id, revision, operationId }) => {
      try {
        const response = await fetch(`/api/v1/itineraries/${id}/publish`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-engine-request': '1' }, body: JSON.stringify({ expectedRevision: revision, operationId }) });
        return response.status;
      } catch { return 0; }
    }, { id: recordId, revision: crashRevision.body.revision, operationId: crashOperationId });
    progress.interruptedPublishStatus = interruptedPublish;
    stage = 'crash-response-interrupted';
    assert.equal(interruptedPublish, 0, 'child termination interrupts the publish response after artifact promotion');
    const crashedChild = child;
    stage = 'crash-child-exit';
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('CP027 crash seam did not terminate the child')), 10_000);
      crashedChild.once('exit', () => { clearTimeout(timer); resolve(); });
    });
    child = await startServer(port, dataDir);
    stage = 'crash-recovery-publication-state';
    const crashRestoredStatus = await page.evaluate(async id => await (await fetch(`/api/v1/itineraries/${id}/publication`)).json(), recordId);
    assert.equal(crashRestoredStatus.shareUrl, shareUrl);
    assert.equal(crashRestoredStatus.currentVersion.id, publication.currentVersion.id);
    assert.equal(crashRestoredStatus.draftDiffers, true);
    const db = new DatabaseSync(path.join(dataDir, 'engine.sqlite'));
    stage = 'crash-recovery-operation-record';
    const failedOperation = db.prepare('SELECT status,error_code FROM publish_operations WHERE workspace_id=(SELECT workspace_id FROM itineraries WHERE id=?) AND id=?').get(recordId, crashOperationId) as { status: string; error_code: string };
    db.close();
    progress.recoveredOperationStatus = failedOperation?.status || 'missing';
    progress.recoveredOperationError = failedOperation?.error_code || 'missing';
    assert.equal(failedOperation.status, 'failed'); assert.equal(failedOperation.error_code, 'SERVER_RESTARTED');
    stage = 'crash-recovery-orphan-cleanup';
    assert.equal((await readdir(path.join(dataDir, 'published'))).length, 2, 'only committed published HTML/image remain after recovery');
    assert.equal((await readdir(path.join(dataDir, 'tmp'))).some(name => name.endsWith('.stage')), false);
    const replayAfterCrash = await page.evaluate(async ({ id, revision, operationId }) => {
      const response = await fetch(`/api/v1/itineraries/${id}/publish`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-engine-request': '1' }, body: JSON.stringify({ expectedRevision: revision, operationId }) });
      return { status: response.status, body: await response.json() };
    }, { id: recordId, revision: crashRevision.body.revision, operationId: crashOperationId });
    stage = 'crash-replay-result';
    assert.equal(replayAfterCrash.status, 503); assert.equal(replayAfterCrash.body.error.code, 'SERVER_RESTARTED');
    progress.crashRecovery = true;
    stage = 'crash-old-link';
    await publicPage.goto(shareUrl);
    assert.match(await publicPage.content(), /Enjoy the visit\./);
    assert.doesNotMatch(await publicPage.content(), /Crash-boundary candidate must remain a draft\./);

    stage = 'graceful-restart';
    await stopServer(child); child = await startServer(port, dataDir);
    const restoredPublic = await publicPage.goto(shareUrl); assert.equal(restoredPublic?.status(), 200); assert.equal(await publicPage.title(), 'CP027 end-to-end');
    await page.reload(); await page.waitForFunction(() => document.querySelector('[role="status"]')?.textContent?.includes('Engine tersambung'));
    await page.evaluate(title => { const button = [...document.querySelectorAll('aside button')].find(item => item.textContent?.includes(title)); if (!button) throw new Error('persisted draft is missing after child restart'); (button as HTMLButtonElement).click(); }, 'CP027 end-to-end');
    await page.waitForFunction(() => document.querySelector('[role="status"]')?.textContent?.includes('Draft dibuka'));
    const restoredDraft = await page.evaluate(async id => await (await fetch(`/api/v1/itineraries/${id}`)).json(), recordId);
    assert.equal(restoredDraft.draftContent.summary, overviewLocal);
    assert.equal((await page.evaluate(async id => await (await fetch(`/api/v1/itineraries/${id}/publication`)).json(), recordId)).shareUrl, shareUrl);
    progress.restartPersistence = true;
    stage = 'edit-after-publish';
    await page.evaluate(() => [...document.querySelectorAll('button')].find(button => button.textContent?.includes('Ketentuan & penutup'))?.click());
    await page.locator('[data-field-path="closingNote"]').fill('A revised local closing note after the original publication.');
    stage = 'save-republished-draft';
    await clickButton(page, 'Simpan draft'); await page.waitForFunction(() => document.querySelector('[role="status"]')?.textContent?.includes('Tersimpan · revisi'));
    stage = 'preview-republished-draft';
    const previewDisabled = await page.$$eval('button', buttons => buttons.find(button => button.textContent?.trim() === 'Preview')?.disabled ?? true);
    assert.equal(previewDisabled, false);
    await page.waitForFunction(() => [...document.querySelectorAll('button')].some(button => button.textContent?.trim() === 'Preview' && !(button as HTMLButtonElement).disabled));
    await clickButton(page, 'Preview');
    await page.waitForFunction(() => { const status = document.querySelector('[role="status"]')?.textContent || ''; return status.includes('Membuat preview') || status.startsWith('Preview siap') || status.startsWith('Preview belum tersedia:'); });
    await page.waitForFunction(() => document.body.innerText.includes('Preview draft tersimpan'));
    stage = 'publish-edited-version';
    await clickButton(page, 'Publish ulang'); await page.waitForFunction(() => { const status = document.querySelector('[role="status"]')?.textContent || ''; return status.includes('Itinerary berhasil dipublish') || status.includes('Versi published sudah tersedia.'); });
    stage = 'assert-republished-version';
    const republished = await page.evaluate(async id => await (await fetch(`/api/v1/itineraries/${id}/publication`)).json(), recordId);
    assert.equal(republished.shareUrl, shareUrl, 'republish keeps the active public link stable');
    await publicPage.goto(shareUrl); assert.match(await publicPage.content(), /A revised local closing note after the original publication\./);
    progress.republishedAfterEdit = true;
    stage = 'revoke-and-rotate';
    await clickButton(page, 'Cabut link'); await page.waitForFunction(() => document.querySelector('[role="status"]')?.textContent?.includes('Link dicabut'));
    assert.equal((await publicPage.goto(shareUrl))?.status(), 404);
    assert.equal((await publicPage.goto(`${shareUrl}/og-image`))?.status(), 404);
    await clickButton(page, 'Publish itinerary'); await page.waitForFunction(() => document.querySelector('[role="status"]')?.textContent?.includes('Itinerary berhasil dipublish'));
    const rotated = await page.evaluate(async id => await (await fetch(`/api/v1/itineraries/${id}/publication`)).json(), recordId);
    assert.notEqual(rotated.shareUrl, shareUrl);
    progress.revokeAndRotation = true;
    const reopened = await publicPage.goto(rotated.shareUrl); assert.equal(reopened?.status(), 200); assert.equal(await publicPage.title(), 'CP027 end-to-end');
    assert.equal((await publicPage.goto(shareUrl))?.status(), 404);
    const additionalPublishedModes: string[] = [];
    for (const fixture of fixtureManifest.modeExpectations.filter(item => item.mode !== 'full_day')) {
      const mode = fixture.mode as ItineraryMode;
      stage = `mode-${mode}-create`;
      const modeContent = createContentV2(mode, 'fr'); modeContent.trip.title = `CP027 ${mode}`;
      const expectedIds = fixture as { dayIds?: string[]; itemIds: string[] };
      assert.deepEqual(modeContent.days.map(day => day.id), expectedIds.dayIds || []);
      assert.deepEqual(mode === 'destination_guide' ? modeContent.places.map(place => place.id) : modeContent.days.flatMap(day => day.activities.map(activity => activity.id)), expectedIds.itemIds);
      const createdMode = await page.evaluate(async ({ mode, content }) => {
        const response = await fetch('/api/v1/itineraries', { method: 'POST', headers: { 'content-type': 'application/json', 'x-engine-request': '1' }, body: JSON.stringify({ mode, draftContent: content, languageContext: { requestedLanguage: 'fr', outputLanguage: 'fr', source: 'explicit' }, writingContext: { brief: 'Synthetic local guide fixture.', notes: [] } }) });
        return { status: response.status, body: await response.json() };
      }, { mode, content: modeContent });
      assert.equal(createdMode.status, 201, `${mode}: ${JSON.stringify(createdMode.body.error || {})}`);
      await page.reload(); await page.waitForFunction(() => document.querySelector('[role="status"]')?.textContent?.includes('Engine tersambung'));
      await page.evaluate(title => { const button = [...document.querySelectorAll('aside button')].find(item => item.textContent?.includes(title)); if (!button) throw new Error(`draft not listed: ${title}`); (button as HTMLButtonElement).click(); }, modeContent.trip.title);
      await page.waitForFunction(() => document.querySelector('[role="status"]')?.textContent?.includes('Draft dibuka'));
      await clickButton(page, 'Preview'); await page.waitForFunction(() => document.querySelector('[aria-label="Publish diagnostics"]')?.textContent?.includes('Tidak ada error publish'));
      await clickButton(page, 'Publish itinerary'); await page.waitForFunction(() => document.querySelector('[role="status"]')?.textContent?.includes('Itinerary berhasil dipublish'));
      const modePublication = await page.evaluate(async id => await (await fetch(`/api/v1/itineraries/${id}/publication`)).json(), createdMode.body.id);
      stage = `mode-${mode}-public-content`;
      assert.equal(modePublication.active, true, mode);
      await publicPage.goto(modePublication.shareUrl);
      stage = `mode-${mode}-title`;
      assert.equal(await publicPage.title(), modeContent.trip.title, mode);
      stage = `mode-${mode}-og-title`;
      assert.equal(await publicPage.$eval('meta[property="og:title"]', element => element.getAttribute('content')), modeContent.trip.title);
      const modePublicText = await publicPage.evaluate(() => document.body.innerText);
      stage = `mode-${mode}-scope`;
      assert.ok((await publicPage.content()).includes(fixture.scopeLabel), `${mode}: scope label (exact case, from the page source; innerText is upper-cased by CSS)`);
      stage = `mode-${mode}-item`;
      assert.ok(modePublicText.includes(fixture.mode === 'destination_guide' ? fixture.firstPlace! : fixture.firstActivity!), `${mode}: first canonical item`);
      const anonymousModeHtml = await fetch(modePublication.shareUrl); assert.equal(anonymousModeHtml.status, 200);
      assert.doesNotMatch(await anonymousModeHtml.text(), /<script\b/i);
      for (const [size, width, height] of [['desktop', 1440, 1000], ['mobile', 390, 844]] as const) {
        await publicPage.setViewport({ width, height });
        const dimensions = await publicPage.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth }));
        assert.ok(dimensions.document <= dimensions.viewport, `${mode} ${size}: ${JSON.stringify(dimensions)}`);
        await publicPage.screenshot({ path: path.join(outputDir, `cp027-mode-${mode}-${size}.png`), fullPage: true });
      }
      additionalPublishedModes.push(mode);
      progress.publishedModes.push(mode);
    }
    const renderedLocales: string[] = [];
    for (const fixture of fixtureManifest.baselineLocales) {
      stage = `locale-${fixture.locale}-create`;
      const localeContent = createContentV2('full_day', fixture.locale);
      localeContent.trip.title = fixture.tripTitle;
      localeContent.days[0].activities[0].title = fixture.activityTitle;
      const createdLocale = await page.evaluate(async ({ locale, content }) => {
        const response = await fetch('/api/v1/itineraries', { method: 'POST', headers: { 'content-type': 'application/json', 'x-engine-request': '1' }, body: JSON.stringify({ mode: 'full_day', draftContent: content, languageContext: { requestedLanguage: locale, outputLanguage: locale, source: 'explicit' }, writingContext: { brief: 'Synthetic locale rendering fixture.', notes: [] } }) });
        return { status: response.status, body: await response.json() };
      }, { locale: fixture.locale, content: localeContent });
      assert.equal(createdLocale.status, 201, `${fixture.locale}: ${JSON.stringify(createdLocale.body.error || {})}`);
      await page.reload(); await page.waitForFunction(() => document.querySelector('[role="status"]')?.textContent?.includes('Engine tersambung'));
      await page.evaluate(title => { const button = [...document.querySelectorAll('aside button')].find(item => item.textContent?.includes(title)); if (!button) throw new Error(`locale draft not listed: ${title}`); (button as HTMLButtonElement).click(); }, fixture.tripTitle);
      await page.waitForFunction(() => document.querySelector('[role="status"]')?.textContent?.includes('Draft dibuka'));
      stage = `locale-${fixture.locale}-preview`;
      await clickButton(page, 'Preview'); await page.waitForFunction(() => document.querySelector('[aria-label="Publish diagnostics"]')?.textContent?.includes('Tidak ada error publish'));
      await page.waitForSelector('iframe[title="Preview itinerary tersimpan"]');
      stage = `locale-${fixture.locale}-preview-frame`;
      const previewHtml = await page.$eval('iframe[title="Preview itinerary tersimpan"]', element => (element as HTMLIFrameElement).srcdoc);
      stage = `locale-${fixture.locale}-preview-language`;
      assert.match(previewHtml, new RegExp(`<html lang="${fixture.locale}">`));
      stage = `locale-${fixture.locale}-preview-copy`;
      assert.ok(previewHtml.includes(fixture.tripTitle) && previewHtml.includes(fixture.activityTitle), fixture.locale);
      await clickButton(page, 'Publish itinerary'); await page.waitForFunction(() => document.querySelector('[role="status"]')?.textContent?.includes('Itinerary berhasil dipublish'));
      stage = `locale-${fixture.locale}-public-render`;
      const localePublication = await page.evaluate(async id => await (await fetch(`/api/v1/itineraries/${id}/publication`)).json(), createdLocale.body.id);
      stage = `locale-${fixture.locale}-public-render`;
      await publicPage.setViewport({ width: 1440, height: 1000 });
      await publicPage.goto(localePublication.shareUrl); await publicPage.evaluate(async () => await document.fonts.ready);
      const localePublic = await publicPage.evaluate(() => ({ title: document.title, html: document.documentElement.outerHTML, htmlLang: document.documentElement.lang, body: document.body.innerText, fontCss: [...document.styleSheets].map(sheet => { try { return [...sheet.cssRules].map(rule => rule.cssText).join(''); } catch { return ''; } }).join('') }));
      assert.equal(localePublic.title, fixture.tripTitle); assert.equal(localePublic.htmlLang, fixture.locale);
      stage = `locale-${fixture.locale}-public-copy`;
      assert.ok(localePublic.html.includes(fixture.scopeLabel) && localePublic.body.includes(fixture.activityTitle), fixture.locale);
      stage = `locale-${fixture.locale}-font`;
      if (fixture.locale === 'ja') assert.match(localePublic.fontCss, /Noto Sans JP Variable/);
      if (fixture.locale === 'zh-Hans') assert.match(localePublic.fontCss, /Noto Sans SC Variable/);
      for (const [size, width, height] of [['desktop', 1440, 1000], ['mobile', 390, 844]] as const) {
        await publicPage.setViewport({ width, height });
        const dimensions = await publicPage.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth }));
        assert.ok(dimensions.document <= dimensions.viewport, `${fixture.locale} ${size}: ${JSON.stringify(dimensions)}`);
        await publicPage.screenshot({ path: path.join(outputDir, `cp027-locale-${fixture.locale}-${size}.png`), fullPage: true });
      }
      renderedLocales.push(fixture.locale);
      progress.renderedLocales.push(fixture.locale);
    }
    stage = 'long-copy-create';
    const longCopyContent = createContentV2('full_day', 'en');
    longCopyContent.trip.title = fixtureManifest.longCopy.tripTitle;
    const longCopy = fixtureManifest.longCopy.phrase.repeat(fixtureManifest.longCopy.repeatCount);
    longCopyContent.days[0].activities[0].description = longCopy;
    assert.ok(Array.from(longCopy).length >= fixtureManifest.longCopy.minimumCodePoints);
    const longCreated = await page.evaluate(async content => {
      const response = await fetch('/api/v1/itineraries', { method: 'POST', headers: { 'content-type': 'application/json', 'x-engine-request': '1' }, body: JSON.stringify({ mode: 'full_day', draftContent: content, languageContext: { requestedLanguage: 'en', outputLanguage: 'en', source: 'explicit' }, writingContext: { brief: '', notes: [] } }) });
      return { status: response.status, body: await response.json() };
    }, longCopyContent);
    assert.equal(longCreated.status, 201);
    await page.reload(); await page.waitForFunction(() => document.querySelector('[role="status"]')?.textContent?.includes('Engine tersambung'));
    await page.evaluate(title => { const button = [...document.querySelectorAll('aside button')].find(item => item.textContent?.includes(title)); if (!button) throw new Error('long-copy draft not listed'); (button as HTMLButtonElement).click(); }, fixtureManifest.longCopy.tripTitle);
    await page.waitForFunction(() => document.querySelector('[role="status"]')?.textContent?.includes('Draft dibuka'));
    await clickButton(page, 'Preview'); await page.waitForFunction(() => document.querySelector('[aria-label="Publish diagnostics"]')?.textContent?.includes('Tidak ada error publish'));
    const longPreview = await page.$eval('iframe[title="Preview itinerary tersimpan"]', element => (element as HTMLIFrameElement).srcdoc);
    assert.ok(longPreview.includes(longCopy));
    await clickButton(page, 'Publish itinerary'); await page.waitForFunction(() => document.querySelector('[role="status"]')?.textContent?.includes('Itinerary berhasil dipublish'));
    const longPublication = await page.evaluate(async id => await (await fetch(`/api/v1/itineraries/${id}/publication`)).json(), longCreated.body.id);
    await publicPage.goto(longPublication.shareUrl);
    assert.ok((await publicPage.content()).includes(longCopy));
    for (const [size, width, height] of [['desktop', 1440, 1000], ['mobile', 390, 844]] as const) {
      await publicPage.setViewport({ width, height });
      const dimensions = await publicPage.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth }));
      assert.ok(dimensions.document <= dimensions.viewport, `long-copy ${size}: ${JSON.stringify(dimensions)}`);
      await publicPage.screenshot({ path: path.join(outputDir, `cp027-long-copy-${size}.png`), fullPage: true });
    }
    progress.longCopyPublished = true;

    stage = 'owned-asset-upload';
    const png = await sharp({ create: { width: 32, height: 24, channels: 4, background: '#267c8a' } }).png().toBuffer();
    const uploaded = await page.evaluate(async base64 => {
      const binary = atob(base64); const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
      const form = new FormData(); form.append('image', new File([bytes], 'cp027-owned.png', { type: 'image/png' }));
      const response = await fetch('/api/v1/assets', { method: 'POST', headers: { 'x-engine-request': '1' }, body: form });
      return { status: response.status, body: await response.json() };
    }, png.toString('base64'));
    assert.equal(uploaded.status, 201);
    const assetFixture = fixtureManifest.assetFixture;
    const profileSaved = await page.evaluate(async assetId => {
      const current = await (await fetch('/api/v1/itinerary-engine/profile')).json();
      const response = await fetch('/api/v1/itinerary-engine/profile', { method: 'PATCH', headers: { 'content-type': 'application/json', 'x-engine-request': '1' }, body: JSON.stringify({ expectedRevision: current.revision, profile: { ...current.profile, agencyName: current.profile.agencyName || 'Synthetic CP027 Guide', agencyContact: current.profile.agencyContact || 'guide@example.test', agencyLogoAssetId: assetId } }) });
      return { status: response.status, body: await response.json() };
    }, uploaded.body.id);
    assert.equal(profileSaved.status, 200, JSON.stringify(profileSaved.body));
    const assetContent = createContentV2('full_day', 'fr'); assetContent.trip.title = assetFixture.tripTitle;
    const ownedCredit = { photographer: assetFixture.credit, url: assetFixture.creditUrl, source: 'Guide-owned' };
    assetContent.cover = { assetId: uploaded.body.id, credit: { ...ownedCredit } };
    assetContent.days[0].photo = { assetId: uploaded.body.id, credit: { ...ownedCredit } };
    const assetCreated = await page.evaluate(async content => {
      const response = await fetch('/api/v1/itineraries', { method: 'POST', headers: { 'content-type': 'application/json', 'x-engine-request': '1' }, body: JSON.stringify({ mode: 'full_day', draftContent: content, languageContext: { requestedLanguage: 'fr', outputLanguage: 'fr', source: 'explicit' }, writingContext: { brief: '', notes: [] } }) });
      return { status: response.status, body: await response.json() };
    }, assetContent);
    assert.equal(assetCreated.status, 201);
    await page.reload(); await page.waitForFunction(() => document.querySelector('[role="status"]')?.textContent?.includes('Engine tersambung'));
    await page.evaluate(title => { const button = [...document.querySelectorAll('aside button')].find(item => item.textContent?.includes(title)); if (!button) throw new Error('asset draft not listed'); (button as HTMLButtonElement).click(); }, assetFixture.tripTitle);
    await page.waitForFunction(() => document.querySelector('[role="status"]')?.textContent?.includes('Draft dibuka'));
    await clickButton(page, 'Preview'); await page.waitForFunction(() => document.querySelector('[aria-label="Publish diagnostics"]')?.textContent?.includes('Tidak ada error publish'));
    const assetPreview = await page.$eval('iframe[title="Preview itinerary tersimpan"]', element => (element as HTMLIFrameElement).srcdoc);
    assert.ok((assetPreview.match(/data:image\/png;base64,/g) || []).length >= assetFixture.minimumEmbeddedCopies);
    await clickButton(page, 'Publish itinerary'); await page.waitForFunction(() => document.querySelector('[role="status"]')?.textContent?.includes('Itinerary berhasil dipublish'));
    const assetPublication = await page.evaluate(async id => await (await fetch(`/api/v1/itineraries/${id}/publication`)).json(), assetCreated.body.id);
    await publicPage.setViewport({ width: 1440, height: 1000 }); await publicPage.goto(assetPublication.shareUrl);
    const assetPublicHtml = await publicPage.content();
    assert.ok((assetPublicHtml.match(/data:image\/png;base64,/g) || []).length >= assetFixture.minimumEmbeddedCopies);
    assert.ok(assetPublicHtml.includes(assetFixture.credit)); assert.ok(assetPublicHtml.includes(assetFixture.creditUrl));
    const publicToken = String(assetPublication.shareUrl).split('/').at(-1);
    const ogResponse = await publicPage.goto(`${origin}/i/${publicToken}/og-image`);
    assert.equal(ogResponse?.status(), 200); assert.match(ogResponse?.headers()['content-type'] || '', /image\/jpeg/);
    const ogMetadata = await sharp(await ogResponse!.buffer()).metadata(); assert.deepEqual([ogMetadata.width, ogMetadata.height], [1200, 630]);
    await publicPage.screenshot({ path: path.join(outputDir, 'cp027-owned-asset-og.png') });
    progress.ownedAssetPublished = true;

    stage = 'stress-14-day-create';
    const multiDayContent = createContentV2('multi_day', 'en'); multiDayContent.trip.title = 'CP027 14-day stress';
    while (multiDayContent.days.length < fixtureManifest.stress.multiDayDays) {
      const dayNumber = multiDayContent.days.length + 1;
      const day = structuredClone(multiDayContent.days[0]); day.id = crypto.randomUUID(); day.dayNumber = dayNumber; day.title = `Day ${dayNumber}`;
      day.activities = day.activities.map(activity => ({ ...activity, id: crypto.randomUUID(), title: `Visit ${dayNumber}` }));
      multiDayContent.days.push(day);
    }
    const stressMultiCreated = await page.evaluate(async content => {
      const response = await fetch('/api/v1/itineraries', { method: 'POST', headers: { 'content-type': 'application/json', 'x-engine-request': '1' }, body: JSON.stringify({ mode: 'multi_day', draftContent: content, languageContext: { requestedLanguage: 'en', outputLanguage: 'en', source: 'explicit' }, writingContext: { brief: '', notes: [] } }) });
      return { status: response.status, body: await response.json() };
    }, multiDayContent);
    assert.equal(stressMultiCreated.status, 201);
    await page.reload(); await page.waitForFunction(() => document.querySelector('[role="status"]')?.textContent?.includes('Engine tersambung'));
    await page.evaluate(title => { const button = [...document.querySelectorAll('aside button')].find(item => item.textContent?.includes(title)); if (!button) throw new Error('14-day stress draft not listed'); (button as HTMLButtonElement).click(); }, multiDayContent.trip.title);
    await page.waitForFunction(() => document.querySelector('[role="status"]')?.textContent?.includes('Draft dibuka'));
    await clickButton(page, 'Preview'); await page.waitForFunction(() => document.querySelector('[aria-label="Publish diagnostics"]')?.textContent?.includes('Tidak ada error publish'));
    await clickButton(page, 'Publish itinerary'); await page.waitForFunction(() => document.querySelector('[role="status"]')?.textContent?.includes('Itinerary berhasil dipublish'));
    const stressMultiPublication = await page.evaluate(async id => await (await fetch(`/api/v1/itineraries/${id}/publication`)).json(), stressMultiCreated.body.id);
    await publicPage.goto(stressMultiPublication.shareUrl);
    const stressMultiText = await publicPage.evaluate(() => document.body.innerText);
    assert.ok(stressMultiText.includes('Day 14'));
    for (const [size, width, height] of [['desktop', 1440, 1000], ['mobile', 390, 844]] as const) {
      await publicPage.setViewport({ width, height });
      const dimensions = await publicPage.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth }));
      assert.ok(dimensions.document <= dimensions.viewport, `14-day ${size}: ${JSON.stringify(dimensions)}`);
      await publicPage.screenshot({ path: path.join(outputDir, `cp027-stress-14-day-${size}.png`), fullPage: true });
    }
    progress.stressCases.push('multi_day_14');

    stage = 'stress-60-guide-places-create';
    const guideContent = createContentV2('destination_guide', 'en'); guideContent.trip.title = 'CP027 60-place stress';
    const firstPlace = guideContent.places[0];
    guideContent.places = Array.from({ length: fixtureManifest.stress.guidePlaces }, (_, index) => ({ ...structuredClone(firstPlace), id: index === 0 ? firstPlace.id : crypto.randomUUID(), name: index === 0 ? firstPlace.name : `Guide place ${String(index + 1).padStart(2, '0')}`, group: `Area ${index % 6 + 1}` }));
    const stressGuideCreated = await page.evaluate(async content => {
      const response = await fetch('/api/v1/itineraries', { method: 'POST', headers: { 'content-type': 'application/json', 'x-engine-request': '1' }, body: JSON.stringify({ mode: 'destination_guide', draftContent: content, languageContext: { requestedLanguage: 'en', outputLanguage: 'en', source: 'explicit' }, writingContext: { brief: '', notes: [] } }) });
      return { status: response.status, body: await response.json() };
    }, guideContent);
    assert.equal(stressGuideCreated.status, 201);
    await page.reload(); await page.waitForFunction(() => document.querySelector('[role="status"]')?.textContent?.includes('Engine tersambung'));
    await page.evaluate(title => { const button = [...document.querySelectorAll('aside button')].find(item => item.textContent?.includes(title)); if (!button) throw new Error('60-place stress draft not listed'); (button as HTMLButtonElement).click(); }, guideContent.trip.title);
    await page.waitForFunction(() => document.querySelector('[role="status"]')?.textContent?.includes('Draft dibuka'));
    await clickButton(page, 'Preview'); await page.waitForFunction(() => document.querySelector('[aria-label="Publish diagnostics"]')?.textContent?.includes('Tidak ada error publish'));
    await clickButton(page, 'Publish itinerary'); await page.waitForFunction(() => document.querySelector('[role="status"]')?.textContent?.includes('Itinerary berhasil dipublish'));
    const stressGuidePublication = await page.evaluate(async id => await (await fetch(`/api/v1/itineraries/${id}/publication`)).json(), stressGuideCreated.body.id);
    await publicPage.goto(stressGuidePublication.shareUrl);
    const guideCount = await publicPage.$$eval('.spot-card', elements => elements.length);
    assert.equal(guideCount, fixtureManifest.stress.guidePlaces);
    for (const [size, width, height] of [['desktop', 1440, 1000], ['mobile', 390, 844]] as const) {
      await publicPage.setViewport({ width, height });
      const dimensions = await publicPage.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth }));
      assert.ok(dimensions.document <= dimensions.viewport, `60-place ${size}: ${JSON.stringify(dimensions)}`);
      await publicPage.screenshot({ path: path.join(outputDir, `cp027-stress-60-places-${size}.png`), fullPage: true });
    }
    progress.stressCases.push('destination_guide_60');
    assert.deepEqual(external, []); assert.deepEqual(consoleErrors, []);
    const summary = { status: 'passed', gracefulRestarts: 1, crashInjectedAfterArtifactPromote: true, crashRecoveryFailedOperationReplayRejected: true, deterministicProvider: true, generatedWithoutMutation: true, applyRequiredSave: true, fullCanonicalTargetPreserved: true, previewAndPublishReady: true, publishedOg: true, privateWritingContextAbsent: true, restartPreservedDraftAndShare: true, republishAfterDraftEditKeptLink: true, revokeAndRotation: true, fourModesPublished: ['full_day', ...additionalPublishedModes], baselineLocalesRendered: renderedLocales, longCopyPublished: progress.longCopyPublished, longCopyCodePoints: Array.from(longCopy).length, ownedAssetAndOgPublished: progress.ownedAssetPublished, stressCases: progress.stressCases, manualFourModeFormFlow: 'verify:web-editor', externalRequests: external.length, consoleErrors: consoleErrors.length };
    await writeFile(path.join(outputDir, 'cp027-integrated-summary.json'), JSON.stringify(summary, null, 2)); console.log(JSON.stringify(summary));
  } catch (error) {
    const errorType = error instanceof Error ? error.name : 'Error';
    const editorSignal = await page.evaluate(() => {
      const status = document.querySelector('[role="status"]')?.textContent || '';
      if (status.startsWith('Preview belum tersedia:')) return 'preview-error';
      if (status.startsWith('Preview siap')) return 'preview-ready';
      if (status.startsWith('Membuat preview')) return 'preview-pending';
      if (status.startsWith('Tersimpan')) return 'draft-saved';
      return 'other';
    }).catch(() => 'unavailable');
    await writeFile(path.join(outputDir, 'cp027-integrated-summary.json'), JSON.stringify({ status: 'failed', stage, editorSignal, progress, errorType, externalRequests: external.length, consoleErrors: consoleErrors.length }, null, 2));
    throw new Error(`CP027 E2E failed (${errorType}); see output/web-e2e/cp027-integrated-summary.json for safe progress.`);
  } finally {
    if (child) await stopServer(child);
    await browser.close(); await rm(dataDir, { recursive: true, force: true });
  }
}

async function clickButton(page: import('puppeteer').Page, text: string, scope?: string) {
  const clicked = await page.evaluate(({ text, scope }) => { const root = scope ? document.querySelector(`[data-editor-section="${scope}"]`) : document; const button = [...(root?.querySelectorAll('button') ?? [])].find(item => item.textContent?.trim() === text); if (!button) return false; (button as HTMLButtonElement).click(); return true; }, { text, scope });
  assert.ok(clicked, `button not found: ${text}${scope ? ` in ${scope}` : ''}`);
}

await main();
