import assert from 'node:assert/strict';
import { access, cp, mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import sharp from 'sharp';
import { createApp } from '../../src/server/app.js';

const headers = { origin: 'http://127.0.0.1:3000', 'x-engine-request': '1', 'content-type': 'application/json' };

async function fixture(t: any) {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'itinerary-cp021-'));
  let app = await createApp({ dataDir });
  t.after(async () => { await app.close(); await rm(dataDir, { recursive: true, force: true }); });
  return { dataDir, get app() { return app; }, async restart() { await app.close(); app = await createApp({ dataDir }); } };
}

test('blank draft/profile persist across server restart and CAS preserves one winner', async (t) => {
  const f = await fixture(t);
  const created = await f.app.inject({ method: 'POST', url: '/api/v1/itineraries', headers, payload: { mode: 'full_day' } });
  assert.equal(created.statusCode, 201);
  const record = created.json();
  assert.equal(record.draftContent.brochure.agencyName, '');
  const patchedContent = structuredClone(record.draftContent);
  patchedContent.brochure.tripTitle = 'Kyoto walk';
  const payload = { expectedRevision: 1, draftContent: patchedContent, languageContext: record.languageContext, writingContext: record.writingContext };
  const results = await Promise.all([
    f.app.inject({ method: 'PATCH', url: `/api/v1/itineraries/${record.id}`, headers, payload }),
    f.app.inject({ method: 'PATCH', url: `/api/v1/itineraries/${record.id}`, headers, payload })
  ]);
  assert.deepEqual(results.map((result) => result.statusCode).sort(), [200, 409]);
  const profile = await f.app.inject({ method: 'PATCH', url: '/api/v1/itinerary-engine/profile', headers, payload: { expectedRevision: 1, profile: { agencyName: 'North Star', agencyContact: 'guide@example.test', agencyLogoAssetId: null } } });
  assert.equal(profile.statusCode, 200);
  await f.restart();
  const reopened = await f.app.inject({ method: 'GET', url: `/api/v1/itineraries/${record.id}` });
  assert.equal(reopened.json().draftContent.brochure.tripTitle, 'Kyoto walk');
  assert.equal(reopened.json().revision, 2);
  assert.equal((await f.app.inject({ url: '/api/v1/itinerary-engine/profile' })).json().profile.agencyName, 'North Star');
});

test('creates structurally valid incomplete drafts for all four modes', async (t) => {
  const f = await fixture(t);
  for (const mode of ['half_day', 'full_day', 'multi_day', 'destination_guide']) {
    const response = await f.app.inject({ method: 'POST', url: '/api/v1/itineraries', headers, payload: { mode } });
    assert.equal(response.statusCode, 201, `${mode}: ${response.body}`);
    assert.equal(response.json().draftContent.brochure.itineraryMode, mode);
  }
  const first = await f.app.inject({ url: '/api/v1/itineraries?limit=2' });
  assert.equal(first.json().items.length, 2);
  assert.ok(first.json().nextCursor);
  const second = await f.app.inject({ url: `/api/v1/itineraries?limit=2&cursor=${first.json().nextCursor}` });
  assert.equal(second.json().items.length, 2);
  assert.equal(new Set([...first.json().items, ...second.json().items].map((item: any) => item.id)).size, 4);
});

test('rejects invalid documents, metadata injection, conflicts and missing write origin', async (t) => {
  const f = await fixture(t);
  const noOrigin = await f.app.inject({ method: 'POST', url: '/api/v1/itineraries', headers: { 'content-type': 'application/json' }, payload: { mode: 'half_day' } });
  assert.equal(noOrigin.statusCode, 403);
  const oversized = await f.app.inject({ method: 'POST', url: '/api/v1/itineraries', headers, payload: { unused: 'x'.repeat(2 * 1024 * 1024) } });
  assert.equal(oversized.statusCode, 413);
  const invalid = await f.app.inject({ method: 'POST', url: '/api/v1/itineraries', headers, payload: { mode: 'half_day', workspaceId: 'attacker' } });
  assert.equal(invalid.statusCode, 422);
  assert.equal(typeof invalid.json().error.requestId, 'string');
  const created = await f.app.inject({ method: 'POST', url: '/api/v1/itineraries', headers, payload: { mode: 'half_day' } });
  const record = created.json();
  const store = (f.app as any).store;
  const foreignWorkspace = randomUUID();
  const timestamp = new Date().toISOString();
  store.db.prepare('INSERT INTO workspaces VALUES(?,?,1,?,?)').run(foreignWorkspace, JSON.stringify({ agencyName: 'Foreign', agencyContact: '', agencyLogoAssetId: null }), timestamp, timestamp);
  store.db.prepare('INSERT INTO itineraries VALUES(?,?,?,1,?,?,?,?,?)').run('foreign-itinerary', foreignWorkspace, 'web-1.0.0', JSON.stringify(record.draftContent), JSON.stringify(record.languageContext), JSON.stringify(record.writingContext), timestamp, timestamp);
  const foreignAsset = randomUUID();
  store.db.prepare('INSERT INTO assets VALUES(?,?,?,?,?,?,?,?,?)').run(foreignAsset, foreignWorkspace, `${foreignAsset}.png`, 'image/png', 1, 1, 1, 'private.png', timestamp);
  assert.equal((await f.app.inject({ url: '/api/v1/itineraries/foreign-itinerary' })).statusCode, 404);
  assert.equal((await f.app.inject({ url: `/api/v1/assets/${foreignAsset}` })).statusCode, 404);
  const invalidAssetDraft = structuredClone(record.draftContent);
  invalidAssetDraft.brochure.agencyLogoAssetId = 'missing-asset';
  const brokenReference = await f.app.inject({ method: 'POST', url: '/api/v1/itineraries', headers, payload: { mode: 'half_day', draftContent: invalidAssetDraft } });
  assert.equal(brokenReference.statusCode, 422);
  const bad = await f.app.inject({ method: 'PATCH', url: `/api/v1/itineraries/${record.id}`, headers, payload: { expectedRevision: 1, draftContent: { ...record.draftContent, unexpected: true }, languageContext: record.languageContext, writingContext: record.writingContext } });
  assert.equal(bad.statusCode, 422);
  const conflict = await f.app.inject({ method: 'PATCH', url: `/api/v1/itineraries/${record.id}`, headers, payload: { expectedRevision: 9, draftContent: record.draftContent, languageContext: record.languageContext, writingContext: record.writingContext } });
  assert.equal(conflict.statusCode, 409);
  assert.equal((await f.app.inject({ url: '/api/v1/itineraries/missing' })).statusCode, 404);
});

test('rejects disguised SVG, forged image MIME and multipart uploads over the byte limit', async (t) => {
  const f = await fixture(t);
  const send = async (filename: string, mime: string, bytes: Buffer) => {
    const boundary = 'cp021-invalid-boundary';
    const payload = Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="${filename}"\r\nContent-Type: ${mime}\r\n\r\n`), bytes, Buffer.from(`\r\n--${boundary}--\r\n`)]);
    return f.app.inject({ method: 'POST', url: '/api/v1/assets', headers: { origin: headers.origin, 'x-engine-request': '1', 'content-type': `multipart/form-data; boundary=${boundary}` }, payload });
  };
  const svg = await send('looks-like.png', 'image/png', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><rect width="1" height="1"/></svg>'));
  assert.equal(svg.statusCode, 422); assert.equal(svg.json().error.code, 'ASSET_INVALID');
  const fake = await send('fake.png', 'image/png', Buffer.from('not an image'));
  assert.equal(fake.statusCode, 422); assert.equal(fake.json().error.code, 'ASSET_INVALID');
  const truncatedPng = await send('truncated.png', 'image/png', Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=', 'base64'));
  assert.equal(truncatedPng.statusCode, 422); assert.equal(truncatedPng.json().error.code, 'ASSET_INVALID');
  const tooLarge = await send('huge.jpg', 'image/jpeg', Buffer.alloc(5 * 1024 * 1024 + 1));
  assert.equal(tooLarge.statusCode, 413); assert.equal(tooLarge.json().error.code, 'PAYLOAD_TOO_LARGE');
  assert.deepEqual((await f.app.inject({ url: '/api/v1/assets' })).json().items, []);
  assert.deepEqual(await readdir(path.join(f.dataDir, 'assets')), []); assert.deepEqual(await readdir(path.join(f.dataDir, 'tmp')), []);
});

test('rejects image dimensions and pixel-count overflow before persisting files', async (t) => {
  const f = await fixture(t);
  const onePixel = await sharp({ create: { width: 1, height: 1, channels: 4, background: '#ffffff' } }).png().toBuffer();
  const send = async (filename: string, bytes: Buffer) => {
    const boundary = `cp021-${filename}-boundary`;
    const payload = Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="${filename}"\r\nContent-Type: image/png\r\n\r\n`), bytes, Buffer.from(`\r\n--${boundary}--\r\n`)]);
    return f.app.inject({ method: 'POST', url: '/api/v1/assets', headers: { origin: headers.origin, 'x-engine-request': '1', 'content-type': `multipart/form-data; boundary=${boundary}` }, payload });
  };
  const tooWide = Buffer.from(onePixel); tooWide.writeUInt32BE(8193, 16);
  const dimensionResponse = await send('too-wide.png', tooWide);
  assert.equal(dimensionResponse.statusCode, 422); assert.equal(dimensionResponse.json().error.code, 'ASSET_INVALID');
  const tooManyPixels = Buffer.from(onePixel); tooManyPixels.writeUInt32BE(4097, 16); tooManyPixels.writeUInt32BE(4097, 20);
  const pixelResponse = await send('too-many-pixels.png', tooManyPixels);
  assert.equal(pixelResponse.statusCode, 422); assert.equal(pixelResponse.json().error.code, 'ASSET_INVALID');
  assert.deepEqual((await f.app.inject({ url: '/api/v1/assets' })).json().items, []);
  assert.deepEqual(await readdir(path.join(f.dataDir, 'assets')), []); assert.deepEqual(await readdir(path.join(f.dataDir, 'tmp')), []);
});

test('cleans a processed image when asset metadata persistence fails, then permits a valid upload', async (t) => {
  const f = await fixture(t);
  const png = await sharp({ create: { width: 16, height: 12, channels: 3, background: '#18a999' } }).png().toBuffer();
  const send = async () => {
    const boundary = 'cp021-store-failure-boundary';
    const payload = Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="valid.png"\r\nContent-Type: image/png\r\n\r\n`), png, Buffer.from(`\r\n--${boundary}--\r\n`)]);
    return f.app.inject({ method: 'POST', url: '/api/v1/assets', headers: { origin: headers.origin, 'x-engine-request': '1', 'content-type': `multipart/form-data; boundary=${boundary}` }, payload });
  };
  const store = (f.app as any).store; const createAsset = store.createAsset;
  store.createAsset = () => { throw new Error('injected persistence failure'); };
  const failed = await send();
  assert.equal(failed.statusCode, 500); assert.equal(failed.json().error.code, 'INTERNAL_ERROR');
  assert.deepEqual((await f.app.inject({ url: '/api/v1/assets' })).json().items, []);
  assert.deepEqual(await readdir(path.join(f.dataDir, 'assets')), []); assert.deepEqual(await readdir(path.join(f.dataDir, 'tmp')), []);
  store.createAsset = createAsset;
  const succeeded = await send();
  assert.equal(succeeded.statusCode, 201, succeeded.body);
  assert.equal((await f.app.inject({ url: '/api/v1/assets' })).json().items.length, 1);
});

test('uploads re-encoded supported image and serves private asset by opaque ID', async (t) => {
  const f = await fixture(t);
  for (const format of ['jpeg', 'png', 'webp'] as const) {
    const bytes = await sharp({ create: { width: 16, height: 12, channels: 3, background: '#18a999' } }).toFormat(format).toBuffer();
    const boundary = `cp021-test-${format}-boundary`;
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="tiny.${format}"\r\nContent-Type: image/${format}\r\n\r\n`), bytes,
      Buffer.from(`\r\n--${boundary}--\r\n`)
    ]);
    const uploaded = await f.app.inject({ method: 'POST', url: '/api/v1/assets', headers: { origin: headers.origin, 'x-engine-request': '1', 'content-type': `multipart/form-data; boundary=${boundary}` }, payload: body });
    assert.equal(uploaded.statusCode, 201, uploaded.body);
    const asset = uploaded.json();
    assert.equal(asset.width, 16); assert.equal(asset.height, 12); assert.equal('storage_key' in asset, false);
    const fetched = await f.app.inject({ url: `/api/v1/assets/${asset.id}` });
    assert.equal(fetched.statusCode, 200); assert.match(fetched.headers['content-type'] || '', new RegExp(`^image/${format}`));
    assert.equal(fetched.rawPayload.length, asset.bytes);
  }
  assert.equal((await f.app.inject({ url: '/api/v1/assets/unknown' })).statusCode, 404);
});

test('a stopped complete data-root copy restores draft, profile and asset references', async (t) => {
  const source = await mkdtemp(path.join(os.tmpdir(), 'itinerary-cp021-source-'));
  const backup = await mkdtemp(path.join(os.tmpdir(), 'itinerary-cp021-backup-'));
  let app = await createApp({ dataDir: source });
  t.after(async () => { await app.close(); await rm(source, { recursive: true, force: true }); await rm(backup, { recursive: true, force: true }); });
  const png = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#227c9d' } }).png().toBuffer();
  const boundary = 'cp021-backup-boundary';
  const multipartBody = Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="logo.png"\r\nContent-Type: image/png\r\n\r\n`), png, Buffer.from(`\r\n--${boundary}--\r\n`)]);
  const upload = await app.inject({ method: 'POST', url: '/api/v1/assets', headers: { origin: headers.origin, 'x-engine-request': '1', 'content-type': `multipart/form-data; boundary=${boundary}` }, payload: multipartBody });
  const assetId = upload.json().id;
  const profile = await app.inject({ method: 'PATCH', url: '/api/v1/itinerary-engine/profile', headers, payload: { expectedRevision: 1, profile: { agencyName: 'Restore Co', agencyContact: 'restore@example.test', agencyLogoAssetId: assetId } } });
  assert.equal(profile.statusCode, 200);
  const created = await app.inject({ method: 'POST', url: '/api/v1/itineraries', headers, payload: { mode: 'destination_guide' } });
  const record = created.json();
  const changed = structuredClone(record.draftContent); changed.brochure.tripTitle = 'Restored guide'; changed.brochure.agencyLogoAssetId = assetId;
  const saved = await app.inject({ method: 'PATCH', url: `/api/v1/itineraries/${record.id}`, headers, payload: { expectedRevision: 1, draftContent: changed, languageContext: record.languageContext, writingContext: record.writingContext } });
  assert.equal(saved.statusCode, 200);
  await app.close();
  await cp(source, backup, { recursive: true });
  app = await createApp({ dataDir: backup });
  const reopened = await app.inject({ url: `/api/v1/itineraries/${record.id}` });
  assert.equal(reopened.json().draftContent.brochure.tripTitle, 'Restored guide');
  assert.equal(reopened.json().draftContent.brochure.agencyLogoAssetId, assetId);
  assert.equal((await app.inject({ url: '/api/v1/assets' })).json().items[0].id, assetId);
  assert.equal((await app.inject({ url: '/api/v1/itinerary-engine/profile' })).json().profile.agencyLogoAssetId, assetId);
  assert.equal((await app.inject({ url: `/api/v1/assets/${assetId}` })).statusCode, 200);
});

test('startup removes only unreferenced engine-owned UUID upload files', async (t) => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'itinerary-cp021-orphan-'));
  const uuid = randomUUID();
  await mkdir(path.join(dataDir, 'assets'), { recursive: true });
  await mkdir(path.join(dataDir, 'tmp'), { recursive: true });
  await writeFile(path.join(dataDir, 'assets', `${uuid}.png`), 'orphan');
  await writeFile(path.join(dataDir, 'tmp', `${uuid}.upload`), 'partial');
  await writeFile(path.join(dataDir, 'assets', 'manual-not-owned.txt'), 'preserve');
  const app = await createApp({ dataDir });
  t.after(async () => { await app.close(); await rm(dataDir, { recursive: true, force: true }); });
  assert.equal(await access(path.join(dataDir, 'assets', `${uuid}.png`)).then(() => true, () => false), false);
  assert.equal(await access(path.join(dataDir, 'tmp', `${uuid}.upload`)).then(() => true, () => false), false);
  assert.equal(await access(path.join(dataDir, 'assets', 'manual-not-owned.txt')).then(() => true, () => false), true);
});
