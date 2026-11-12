import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import test from 'node:test';
import sharp from 'sharp';
import { createApp } from '../../src/server/app.js';
import { createContentV2 } from './fixtures-v2.js';
import { stubRenderPreview } from './test-renderer.js';

const headers = { origin: 'http://127.0.0.1:3000', 'x-engine-request': '1', 'content-type': 'application/json' };

async function setup(t: any, afterPublicArtifactRead?: () => Promise<void>, realRenderer = false) {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'itinerary-cp025-'));
  const stylesheetPath = path.join(dataDir, 'brochure.css');
  await writeFile(stylesheetPath, 'body{font-family:sans-serif}.brochure{max-width:900px}');
  let app = await createApp({ ...(realRenderer ? {} : { renderPreview: stubRenderPreview as any }), dataDir, renderStylesheetPath: stylesheetPath, shareOrigin: 'https://share.example.test', afterPublicArtifactRead }); let open = true;
  const close = async () => { if (open) { await app.close(); open = false; } };
  t.after(async () => { await close(); await rm(dataDir, { recursive: true, force: true }); });
  const created = await app.inject({ method: 'POST', url: '/api/v1/itineraries', headers, payload: { mode: 'full_day' } });
  const blank = created.json();
  const content = createContentV2('full_day', 'en');
  const record = await app.inject({ method: 'PATCH', url: `/api/v1/itineraries/${blank.id}`, headers, payload: { expectedRevision: blank.revision, draftContent: content, languageContext: { requestedLanguage: 'en', outputLanguage: 'en', source: 'explicit' }, writingContext: { brief: 'INTERNAL BRIEF MUST NOT PUBLISH', notes: [{ targetId: 'itinerary', text: 'Private source note.' }] } } });
  assert.equal(record.statusCode, 200, record.body);
  return { get app() { return app; }, close, async restart() { await close(); app = await createApp({ ...(realRenderer ? {} : { renderPreview: stubRenderPreview as any }), dataDir, renderStylesheetPath: stylesheetPath, shareOrigin: 'https://share.example.test', afterPublicArtifactRead }); open = true; }, id: blank.id, revision: record.json().revision, content, dataDir, stylesheetPath };
}

async function publish(app: any, id: string, expectedRevision: number, operationId = randomUUID()) {
  return app.inject({ method: 'POST', url: `/api/v1/itineraries/${id}/publish`, headers, payload: { operationId, expectedRevision } });
}

test('publish creates immutable HTML plus crawler-readable OG image, then republish keeps active URL', async (t) => {
  const f = await setup(t);
  const first = await publish(f.app, f.id, f.revision);
  assert.equal(first.statusCode, 200, first.body);
  const result = first.json();
  assert.match(result.shareUrl, /^https:\/\/share\.example\.test\/i\/[A-Za-z0-9_-]+$/);
  const token = result.shareUrl.split('/').at(-1);
  await f.restart();
  const historical = new Date(); historical.setFullYear(historical.getFullYear() - 2);
  (f.app as any).store.db.prepare('UPDATE share_tokens SET created_at=? WHERE token_value=?').run(historical.toISOString(), token);
  const page = await f.app.inject({ url: `/i/${token}` });
  assert.equal(page.statusCode, 200);
  assert.equal(page.headers['content-type'], 'text/html; charset=utf-8');
  assert.equal(page.headers['cache-control'], 'no-store');
  assert.match(page.body, /property="og:title" content="Ubud in a day"/);
  assert.match(page.body, /property="og:url" content="https:\/\/share\.example\.test\/i\//);
  assert.match(page.body, /property="og:image" content="https:\/\/share\.example\.test\/i\/.+\/og-image"/);
  assert.doesNotMatch(page.body, /INTERNAL BRIEF MUST NOT PUBLISH|Private source note/);
  const image = await f.app.inject({ url: `/i/${token}/og-image` });
  assert.equal(image.statusCode, 200);
  assert.equal(image.headers['content-type'], 'image/jpeg');
  assert.deepEqual(await sharp(image.rawPayload).metadata().then(({ width, height }) => [width, height]), [1200, 630]);
  assert.deepEqual((await f.app.inject({ url: `/api/v1/itineraries/${f.id}/publication` })).json().shareUrl, result.shareUrl);
  const sameRevision = await publish(f.app, f.id, f.revision);
  assert.equal(sameRevision.statusCode, 200);
  assert.equal(sameRevision.json().versionId, result.versionId);
  assert.equal(sameRevision.json().shareUrl, result.shareUrl);
  const duplicate = await publish(f.app, f.id, f.revision, result.operationId);
  assert.equal(duplicate.statusCode, 200);
  assert.equal(duplicate.json().shareUrl, result.shareUrl);
  const versions = await f.app.inject({ url: `/api/v1/itineraries/${f.id}/versions` });
  assert.equal(versions.json().items.length, 1);
});

test('republish updates current snapshot on same link; revoke permanently retires token and next publish rotates it', async (t) => {
  const f = await setup(t);
  const first = await publish(f.app, f.id, f.revision);
  const oldUrl = first.json().shareUrl as string; const oldToken = oldUrl.split('/').at(-1)!;
  const oldHtml = (await f.app.inject({ url: `/i/${oldToken}` })).body;
  const noOpOperationId = randomUUID();
  const noOp = await publish(f.app, f.id, f.revision, noOpOperationId);
  assert.equal(noOp.statusCode, 200, noOp.body); assert.equal(noOp.json().versionId, first.json().versionId); assert.equal(noOp.json().shareUrl, oldUrl);
  const revoked = await f.app.inject({ method: 'POST', url: `/api/v1/itineraries/${f.id}/unpublish`, headers, payload: { expectedPublicationEpoch: 0 } });
  assert.deepEqual(revoked.json(), { itineraryId: f.id, active: false, epoch: 1 });
  assert.equal((await f.app.inject({ url: `/i/${oldToken}` })).statusCode, 404);
  assert.equal((await f.app.inject({ url: `/i/${oldToken}/og-image` })).statusCode, 404);
  const replay = await publish(f.app, f.id, f.revision, first.json().operationId);
  assert.equal(replay.statusCode, 409);
  const noOpReplay = await publish(f.app, f.id, f.revision, noOpOperationId);
  assert.equal(noOpReplay.statusCode, 409);
  assert.equal((await f.app.inject({ url: `/api/v1/itineraries/${f.id}/publication` })).json().active, false);
  const second = await publish(f.app, f.id, f.revision);
  assert.equal(second.statusCode, 200, second.body);
  assert.notEqual(second.json().shareUrl, oldUrl);
  assert.equal((await f.app.inject({ url: `/i/${oldToken}` })).statusCode, 404);
  assert.equal((await f.app.inject({ url: `/i/${second.json().shareUrl.split('/').at(-1)}` })).statusCode, 200);
  const changed = structuredClone(f.content); changed.trip.title = 'New Ubud Journey';
  const save = await f.app.inject({ method: 'PATCH', url: `/api/v1/itineraries/${f.id}`, headers, payload: { expectedRevision: f.revision, draftContent: changed, languageContext: { requestedLanguage: 'en', outputLanguage: 'en', source: 'explicit' }, writingContext: { brief: '', notes: [] } } });
  assert.equal(save.statusCode, 200);
  const third = await publish(f.app, f.id, save.json().revision);
  assert.equal(third.statusCode, 200, third.body); assert.equal(third.json().shareUrl, second.json().shareUrl);
  assert.notEqual((await f.app.inject({ url: `/i/${second.json().shareUrl.split('/').at(-1)}` })).body, oldHtml);
  assert.equal((await f.app.inject({ url: `/i/${oldToken}` })).statusCode, 404);
  assert.equal((await f.app.inject({ url: `/api/v1/itineraries/${f.id}/versions` })).json().items.length, 3);
});

test('failed publish leaves the prior page/link intact; public lookup rejects unknown tokens', async (t) => {
  const f = await setup(t);
  const first = await publish(f.app, f.id, f.revision);
  const url = first.json().shareUrl as string; const token = url.split('/').at(-1)!;
  const invalid = structuredClone(f.content); invalid.trip.title = '';
  const saved = await f.app.inject({ method: 'PATCH', url: `/api/v1/itineraries/${f.id}`, headers, payload: { expectedRevision: f.revision, draftContent: invalid, languageContext: { requestedLanguage: 'en', outputLanguage: 'en', source: 'explicit' }, writingContext: { brief: '', notes: [] } } });
  const response = await publish(f.app, f.id, saved.json().revision);
  assert.equal(response.statusCode, 422);
  assert.equal((await f.app.inject({ url: `/i/${token}` })).statusCode, 200);
  assert.equal((await f.app.inject({ url: '/i/unknown-token' })).statusCode, 404);

  const recoverable = structuredClone(f.content); recoverable.trip.title = 'Storage failure recovery';
  const restoredDraft = await f.app.inject({ method: 'PATCH', url: `/api/v1/itineraries/${f.id}`, headers, payload: { expectedRevision: saved.json().revision, draftContent: recoverable, languageContext: { requestedLanguage: 'en', outputLanguage: 'en', source: 'explicit' }, writingContext: { brief: '', notes: [] } } });
  const db = (f.app as any).store.db;
  db.exec("CREATE TRIGGER injected_publish_failure BEFORE INSERT ON published_versions BEGIN SELECT RAISE(ABORT,'injected publish failure'); END");
  const failed = await publish(f.app, f.id, restoredDraft.json().revision);
  assert.equal(failed.statusCode, 503);
  assert.equal((await f.app.inject({ url: `/i/${token}` })).body.includes('Ubud in a day'), true);
  assert.equal((await readdir(path.join(f.dataDir, 'published'))).length, 2);
  db.exec('DROP TRIGGER injected_publish_failure');
  const retried = await publish(f.app, f.id, restoredDraft.json().revision);
  assert.equal(retried.statusCode, 200, retried.body);
  assert.equal(retried.json().shareUrl, url);
});

test('duplicate in-flight publish reuses the same operation and commits one version', async (t) => {
  const f = await setup(t);
  const operationId = randomUUID();
  const responses = await Promise.all([publish(f.app, f.id, f.revision, operationId), publish(f.app, f.id, f.revision, operationId)]);
  assert.deepEqual(responses.map(response => response.statusCode).sort(), [200, 202]);
  const replay = await publish(f.app, f.id, f.revision, operationId);
  assert.equal(replay.statusCode, 200, replay.body);
  assert.equal(replay.json().operationId, operationId);
  assert.equal((await f.app.inject({ url: `/api/v1/itineraries/${f.id}/versions` })).json().items.length, 1);
});

test('stopped full-root backup restores active HTML/image links', async (t) => {
  const f = await setup(t);
  const first = await publish(f.app, f.id, f.revision);
  const retiredUrl = first.json().shareUrl as string; const retiredToken = retiredUrl.split('/').at(-1)!;
  assert.equal((await f.app.inject({ method: 'POST', url: `/api/v1/itineraries/${f.id}/unpublish`, headers, payload: { expectedPublicationEpoch: 0 } })).statusCode, 200);
  const current = await publish(f.app, f.id, f.revision);
  const url = current.json().shareUrl as string; const token = url.split('/').at(-1)!;
  await f.close();
  const backupDir = await mkdtemp(path.join(os.tmpdir(), 'itinerary-cp025-backup-'));
  await rm(backupDir, { recursive: true, force: true }); await cp(f.dataDir, backupDir, { recursive: true });
  const restored = await createApp({ renderPreview: stubRenderPreview as any, dataDir: backupDir, shareOrigin: 'https://share.example.test', renderStylesheetPath: path.join(backupDir, 'brochure.css') });
  t.after(async () => { await restored.close(); await rm(backupDir, { recursive: true, force: true }); });
  assert.equal((await restored.inject({ url: `/i/${retiredToken}` })).statusCode, 404);
  assert.equal((await restored.inject({ url: `/i/${retiredToken}/og-image` })).statusCode, 404);
  assert.match((await restored.inject({ url: `/i/${token}` })).body, /Ubud in a day/);
  const image = await restored.inject({ url: `/i/${token}/og-image` });
  assert.equal(image.statusCode, 200); assert.equal(image.headers['content-type'], 'image/jpeg');
  const currentState = await restored.inject({ url: `/api/v1/itineraries/${f.id}/publication` });
  assert.equal(currentState.json().shareUrl, url); assert.equal(currentState.json().currentVersion.id, current.json().versionId);
  const restoredDb = (restored as any).store.db;
  const oldTokenRow = restoredDb.prepare('SELECT revoked_at FROM share_tokens WHERE token_value=?').get(retiredToken) as { revoked_at: string | null };
  assert.ok(oldTokenRow.revoked_at);
  assert.equal((restoredDb.prepare('SELECT status FROM publish_operations WHERE id=?').get(first.json().operationId) as { status: string }).status, 'completed');
  assert.equal((restoredDb.prepare('SELECT status FROM publish_operations WHERE id=?').get(current.json().operationId) as { status: string }).status, 'completed');
});

test('startup recovery preserves committed artifacts and terminalizes pending operations across workspaces', async (t) => {
  const f = await setup(t); const store = (f.app as any).store; const foreignWorkspace = randomUUID(); const itineraryId = randomUUID(); const versionId = randomUUID(); const operationId = randomUUID(); const tokenId = randomUUID();
  const createdAt = new Date().toISOString(); const token = `foreign-${randomUUID()}`; const htmlKey = `${versionId}.html`; const imageKey = `${versionId}.jpg`;
  const html = Buffer.from('<!doctype html><html><head><title>Foreign committed guide</title></head><body>Other workspace</body></html>');
  const image = await sharp({ create: { width: 16, height: 12, channels: 3, background: '#227c9d' } }).jpeg().toBuffer();
  const publishedDir = path.join(f.dataDir, 'published'); await mkdir(publishedDir, { recursive: true });
  await writeFile(path.join(publishedDir, htmlKey), html); await writeFile(path.join(publishedDir, imageKey), image);
  const content = createContentV2('full_day', 'en');
  store.db.prepare('INSERT INTO workspaces(id,profile_json,revision,created_at,updated_at) VALUES(?,?,1,?,?)').run(foreignWorkspace, JSON.stringify({ agencyName: 'Other workspace' }), createdAt, createdAt);
  store.db.prepare('INSERT INTO itineraries(id,workspace_id,schema_version,revision,draft_json,language_json,writing_json,created_at,updated_at) VALUES(?,?,?,1,?,?,?,?,?)').run(itineraryId, foreignWorkspace, 'web-2.1.0', JSON.stringify(content), JSON.stringify({ requestedLanguage: 'en', outputLanguage: 'en', source: 'explicit' }), JSON.stringify({ brief: '', notes: [] }), createdAt, createdAt);
  store.db.prepare('INSERT INTO published_versions(id,workspace_id,itinerary_id,source_revision,snapshot_json,schema_version,html_key,html_sha256,og_image_key,og_image_sha256,created_at) VALUES(?,?,?,1,?,?,?,?,?,?,?)').run(versionId, foreignWorkspace, itineraryId, JSON.stringify(content), 'web-2.1.0', htmlKey, createHash('sha256').update(html).digest('hex'), imageKey, createHash('sha256').update(image).digest('hex'), createdAt);
  store.db.prepare('INSERT INTO share_tokens(id,workspace_id,itinerary_id,token_value,token_sha256,created_at,revoked_at) VALUES(?,?,?,?,?,?,NULL)').run(tokenId, foreignWorkspace, itineraryId, token, createHash('sha256').update(token).digest('hex'), createdAt);
  store.db.prepare('INSERT INTO publication_state(workspace_id,itinerary_id,current_version_id,active_token_id,epoch,updated_at) VALUES(?,?,?,?,0,?)').run(foreignWorkspace, itineraryId, versionId, tokenId, createdAt);
  store.db.prepare("INSERT INTO publish_operations(id,workspace_id,itinerary_id,fingerprint,status,created_at,updated_at) VALUES(?,?,?,'foreign-pending','pending',?,?)").run(operationId, foreignWorkspace, itineraryId, createdAt, createdAt);

  await f.restart();
  const restartedStore = (f.app as any).store;
  const foreignPage = await f.app.inject({ url: `/i/${token}` }); assert.equal(foreignPage.statusCode, 200, foreignPage.body); assert.deepEqual(foreignPage.rawPayload, html);
  const foreignImage = await f.app.inject({ url: `/i/${token}/og-image` }); assert.equal(foreignImage.statusCode, 200, foreignImage.body); assert.deepEqual(foreignImage.rawPayload, image);
  const recovered = restartedStore.db.prepare('SELECT status,error_code FROM publish_operations WHERE id=?').get(operationId) as { status: string; error_code: string };
  assert.equal(recovered.status, 'failed'); assert.equal(recovered.error_code, 'SERVER_RESTARTED');
  const state = restartedStore.db.prepare('SELECT current_version_id,active_token_id,epoch FROM publication_state WHERE workspace_id=? AND itinerary_id=?').get(foreignWorkspace, itineraryId) as { current_version_id: string; active_token_id: string; epoch: number };
  assert.equal(state.current_version_id, versionId); assert.equal(state.active_token_id, tokenId); assert.equal(state.epoch, 0);
});

test('HTML and OG reads recheck active token/version after asynchronous file read', async (t) => {
  let armed = false; let enterRead = () => {}; let releaseRead = () => {};
  let entered = new Promise<void>(() => {}); let released = new Promise<void>(() => {});
  const afterPublicArtifactRead = async () => {
    if (!armed) return;
    armed = false; enterRead(); await released;
  };
  const pauseNextRead = () => {
    armed = true;
    entered = new Promise<void>(resolve => { enterRead = resolve; });
    released = new Promise<void>(resolve => { releaseRead = resolve; });
    return { entered, release: () => releaseRead() };
  };
  const f = await setup(t, afterPublicArtifactRead);
  const first = await publish(f.app, f.id, f.revision);
  const firstToken = first.json().shareUrl.split('/').at(-1)!;
  const htmlGate = pauseNextRead();
  const pendingHtml = f.app.inject({ url: `/i/${firstToken}` });
  await htmlGate.entered;
  const revoke = await f.app.inject({ method: 'POST', url: `/api/v1/itineraries/${f.id}/unpublish`, headers, payload: { expectedPublicationEpoch: 0 } });
  assert.equal(revoke.statusCode, 200);
  htmlGate.release();
  assert.equal((await pendingHtml).statusCode, 404);

  const second = await publish(f.app, f.id, f.revision);
  const secondToken = second.json().shareUrl.split('/').at(-1)!;
  const imageGate = pauseNextRead();
  const pendingImage = f.app.inject({ url: `/i/${secondToken}/og-image` });
  await imageGate.entered;
  const secondRevoke = await f.app.inject({ method: 'POST', url: `/api/v1/itineraries/${f.id}/unpublish`, headers, payload: { expectedPublicationEpoch: 1 } });
  assert.equal(secondRevoke.statusCode, 200);
  imageGate.release();
  assert.equal((await pendingImage).statusCode, 404);
  assert.equal((await f.app.inject({ url: `/i/${firstToken}` })).statusCode, 404);
  assert.equal((await f.app.inject({ url: `/i/${secondToken}/og-image` })).statusCode, 404);

  const third = await publish(f.app, f.id, f.revision);
  const thirdToken = third.json().shareUrl.split('/').at(-1)!;
  const changed = structuredClone(f.content); changed.trip.title = 'New version during read';
  const saved = await f.app.inject({
    method: 'PATCH', url: `/api/v1/itineraries/${f.id}`, headers,
    payload: { expectedRevision: f.revision, draftContent: changed, languageContext: { requestedLanguage: 'en', outputLanguage: 'en', source: 'explicit' }, writingContext: { brief: '', notes: [] } }
  });
  const versionGate = pauseNextRead();
  const pendingOldVersion = f.app.inject({ url: `/i/${thirdToken}` });
  await versionGate.entered;
  const republished = await publish(f.app, f.id, saved.json().revision);
  assert.equal(republished.statusCode, 200);
  assert.equal(republished.json().shareUrl, third.json().shareUrl);
  versionGate.release();
  assert.equal((await pendingOldVersion).statusCode, 404);
  assert.match((await f.app.inject({ url: `/i/${thirdToken}` })).body, /New version during read/);
});

test('a storage directory failure terminalizes the operation as failed instead of leaving it pending', async (t) => {
  const f = await setup(t);
  const publishedDir = path.join(f.dataDir, 'published');
  await rm(publishedDir, { recursive: true, force: true });
  await writeFile(publishedDir, 'not a directory');
  const operationId = randomUUID();
  const failed = await publish(f.app, f.id, f.revision, operationId);
  assert.equal(failed.statusCode, 503, failed.body);
  assert.equal(failed.json().error.code, 'PUBLISH_STORAGE_FAILED');
  const row = (f.app as any).store.db.prepare('SELECT status,error_code FROM publish_operations WHERE id=?').get(operationId);
  assert.deepEqual({ ...row }, { status: 'failed', error_code: 'PUBLISH_STORAGE_FAILED' });
  await rm(publishedDir, { force: true });
  await mkdir(publishedDir);
  const retried = await publish(f.app, f.id, f.revision);
  assert.equal(retried.statusCode, 200, retried.body);
});

test('an operation ID already held by another workspace is a conflict, not a server error', async (t) => {
  const f = await setup(t);
  const db = (f.app as any).store.db;
  const foreignWorkspace = randomUUID(); const foreignItinerary = randomUUID(); const operationId = randomUUID(); const createdAt = new Date().toISOString();
  db.prepare('INSERT INTO workspaces(id,profile_json,revision,created_at,updated_at) VALUES(?,?,1,?,?)').run(foreignWorkspace, '{}', createdAt, createdAt);
  db.prepare('INSERT INTO itineraries(id,workspace_id,schema_version,revision,draft_json,language_json,writing_json,created_at,updated_at) VALUES(?,?,?,1,?,?,?,?,?)').run(foreignItinerary, foreignWorkspace, 'web-2.1.0', JSON.stringify(f.content), '{}', '{}', createdAt, createdAt);
  db.prepare("INSERT INTO publish_operations(id,workspace_id,itinerary_id,fingerprint,status,created_at,updated_at) VALUES(?,?,?,'foreign','completed',?,?)").run(operationId, foreignWorkspace, foreignItinerary, createdAt, createdAt);
  const response = await publish(f.app, f.id, f.revision, operationId);
  assert.equal(response.statusCode, 409, response.body);
  assert.equal(response.json().error.code, 'PUBLISH_OPERATION_CONFLICT');
  assert.equal(Number(db.prepare('SELECT count(*) AS count FROM publish_operations WHERE workspace_id=?').get((f.app as any).store.workspaceId).count), 0);
  assert.equal((await publish(f.app, f.id, f.revision)).statusCode, 200);
});

test('a database failure that is not a key conflict is not reported as 409 and leaves no pending row', async (t) => {
  const f = await setup(t);
  const db = (f.app as any).store.db;
  db.exec("CREATE TRIGGER block_publish BEFORE INSERT ON publish_operations BEGIN SELECT RAISE(ABORT, 'blocked'); END");
  const response = await publish(f.app, f.id, f.revision);
  assert.notEqual(response.statusCode, 409, response.body);
  assert.equal(response.statusCode, 500, response.body);
  assert.equal(Number(db.prepare("SELECT count(*) AS count FROM publish_operations WHERE status='pending'").get().count), 0);
  db.exec('DROP TRIGGER block_publish');
  assert.equal((await publish(f.app, f.id, f.revision)).statusCode, 200);
});

test('Open Graph tags and the stored snapshot come from the v2 trip title, summary and schema version', async (t) => {
  const f = await setup(t);
  const response = await publish(f.app, f.id, f.revision);
  assert.equal(response.statusCode, 200, response.body);
  const page = await f.app.inject({ url: `/i/${response.json().shareUrl.split('/').at(-1)}` });
  assert.match(page.body, /property="og:title" content="Ubud in a day"/);
  assert.match(page.body, /property="og:description" content="Explore the landscape and culture at an unhurried pace\."/);
  const version = (f.app as any).store.db.prepare('SELECT schema_version,snapshot_json FROM published_versions').get();
  assert.equal(version.schema_version, 'web-2.2.0');
  assert.equal(JSON.parse(version.snapshot_json).schemaVersion, 'web-2.2.0');
});

test('publishing through the real renderer uses the workspace profile and never leaks the private writing brief', async (t) => {
  const f = await setup(t, undefined, true);
  const profile = (await f.app.inject({ url: '/api/v1/itinerary-engine/profile' })).json();
  const patched = await f.app.inject({ method: 'PATCH', url: '/api/v1/itinerary-engine/profile', headers, payload: { expectedRevision: profile.revision, profile: { agencyName: 'Sample Travel Studio', agencyContact: 'guide@example.test', agencyLogoAssetId: null } } });
  assert.equal(patched.statusCode, 200, patched.body);
  const published = await publish(f.app, f.id, f.revision);
  assert.equal(published.statusCode, 200, published.body);
  const token = published.json().shareUrl.split('/').at(-1);
  const page = await f.app.inject({ url: `/i/${token}` });
  assert.equal(page.statusCode, 200);
  assert.match(page.body, /<title>Ubud in a day<\/title>/);
  assert.match(page.body, /Sample Travel Studio/);
  assert.match(page.body, /guide@example\.test/);
  assert.match(page.body, /property="og:title" content="Ubud in a day"/);
  assert.match(page.body, /property="og:image" content="https:\/\/share\.example\.test\/i\/.+\/og-image"/);
  assert.doesNotMatch(page.body, /INTERNAL BRIEF MUST NOT PUBLISH|Private source note/);
});
