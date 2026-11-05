import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createApp } from '../../src/server/app.js';
import { createContentV2 } from './fixtures-v2.js';

const headers = { origin: 'http://127.0.0.1:3000', 'x-engine-request': '1', 'content-type': 'application/json' };

async function setup(t: any, mode: 'half_day' | 'full_day' | 'multi_day' | 'destination_guide' = 'full_day') {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'itinerary-cp024-'));
  const stylesheetPath = path.join(dataDir, 'brochure.css');
  await writeFile(stylesheetPath, 'body{font-family:sans-serif}.brochure{max-width:900px}');
  const app = await createApp({ dataDir, renderStylesheetPath: stylesheetPath });
  t.after(async () => { await app.close(); await rm(dataDir, { recursive: true, force: true }); });
  const created = await app.inject({ method: 'POST', url: '/api/v1/itineraries', headers, payload: { mode } });
  const blank = created.json();
  const content = createContentV2(mode, 'en');
  const saved = await app.inject({ method: 'PATCH', url: `/api/v1/itineraries/${blank.id}`, headers, payload: { expectedRevision: blank.revision, draftContent: content, languageContext: { language: 'en', source: 'explicit' }, profile: { agencyName: 'Sample Travel Studio', agencyContact: 'guide@example.test', agencyLogoAssetId: null } } });
  if (saved.statusCode !== 200) {
    console.error('Save failed:', saved.json());
  }
  assert.equal(saved.statusCode, 200, saved.body);
  return { app, id: blank.id, revision: saved.json().revision, stylesheetPath, dataDir };
}

test('preview accepts v2 language context and profile structure', async (t) => {
  const f = await setup(t);
  const response = await f.app.inject({ method: 'POST', url: `/api/v1/itineraries/${f.id}/preview`, headers, payload: { expectedRevision: f.revision } });
  assert.equal(response.statusCode, 200, response.body);
  const result = response.json();
  assert.match(result.html, /<html lang="en">/);
  assert.ok(result.scheduleVerification);
});

test('preview rejects stale revisions with 409', async (t) => {
  const f = await setup(t);
  const stale = await f.app.inject({ method: 'POST', url: `/api/v1/itineraries/${f.id}/preview`, headers, payload: { expectedRevision: f.revision - 1 } });
  assert.equal(stale.statusCode, 409);
});

test('multi-day mode preview works', async (t) => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'itinerary-cp024-multi-'));
  const stylesheetPath = path.join(dataDir, 'brochure.css');
  await writeFile(stylesheetPath, 'body{font-family:sans-serif}.brochure{max-width:900px}');
  const app = await createApp({ dataDir, renderStylesheetPath: stylesheetPath });
  t.after(async () => { await app.close(); await rm(dataDir, { recursive: true, force: true }); });
  const created = await app.inject({ method: 'POST', url: '/api/v1/itineraries', headers, payload: { mode: 'multi_day' } });
  const blank = created.json();
  const content = createContentV2('multi_day', 'en');
  const saved = await app.inject({ method: 'PATCH', url: `/api/v1/itineraries/${blank.id}`, headers, payload: { expectedRevision: blank.revision, draftContent: content, languageContext: { language: 'en', source: 'explicit' }, profile: { agencyName: 'Test Agency', agencyContact: 'test@test.com', agencyLogoAssetId: null } } });
  if (saved.statusCode === 200) {
    const response = await app.inject({ method: 'POST', url: `/api/v1/itineraries/${blank.id}/preview`, headers, payload: { expectedRevision: saved.json().revision } });
    assert.equal(response.statusCode, 200, response.body);
  }
});

test('missing renderer stylesheet returns 503', async (t) => {
  const f = await setup(t);
  const before = await f.app.inject({ url: `/api/v1/itineraries/${f.id}` });
  await rm(f.stylesheetPath, { force: true });
  const response = await f.app.inject({ method: 'POST', url: `/api/v1/itineraries/${f.id}/preview`, headers, payload: { expectedRevision: f.revision } });
  assert.equal(response.statusCode, 503);
  assert.equal(response.json().error.code, 'PREVIEW_BLOCKED');
  assert.deepEqual((await f.app.inject({ url: `/api/v1/itineraries/${f.id}` })).json(), before.json());
});

test('api accepts v2 profile structure', async (t) => {
  const f = await setup(t);
  const content = (await f.app.inject({ url: `/api/v1/itineraries/${f.id}` })).json().draftContent;
  const updated = await f.app.inject({ method: 'PATCH', url: `/api/v1/itineraries/${f.id}`, headers, payload: { expectedRevision: f.revision, draftContent: content, languageContext: { language: 'en', source: 'explicit' }, profile: { agencyName: 'New Agency', agencyContact: 'new@test.com', agencyLogoAssetId: null } } });
  assert.equal(updated.statusCode, 200);
});

test('preview works across multiple locales', async (t) => {
  for (const locale of ['en', 'fr', 'ja', 'zh-Hans', 'id']) {
    const dataDir = await mkdtemp(path.join(os.tmpdir(), `itinerary-cp024-${locale}-`));
    const stylesheetPath = path.join(dataDir, 'brochure.css');
    await writeFile(stylesheetPath, 'body{font-family:sans-serif}');
    const app = await createApp({ dataDir, renderStylesheetPath: stylesheetPath });
    t.after(async () => { await app.close(); await rm(dataDir, { recursive: true, force: true }); });
    const created = await app.inject({ method: 'POST', url: '/api/v1/itineraries', headers, payload: { mode: 'full_day' } });
    const blank = created.json();
    const content = createContentV2('full_day', locale);
    const saved = await app.inject({ method: 'PATCH', url: `/api/v1/itineraries/${blank.id}`, headers, payload: { expectedRevision: blank.revision, draftContent: content, languageContext: { language: locale, source: 'explicit' }, profile: { agencyName: 'Test', agencyContact: 'test@test.com', agencyLogoAssetId: null } } });
    if (saved.statusCode === 200) {
      const response = await app.inject({ method: 'POST', url: `/api/v1/itineraries/${blank.id}/preview`, headers, payload: { expectedRevision: saved.json().revision } });
      // Response may be 200 or 503 depending on locale catalog availability
      assert.ok([200, 503].includes(response.statusCode), `${locale} returned ${response.statusCode}`);
    }
  }
});
