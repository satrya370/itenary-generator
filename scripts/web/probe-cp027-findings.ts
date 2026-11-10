import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { createApp } from '../../src/server/app.js';
import { createContentV2 } from '../../tests/web/fixtures-v2.js';

const headers = { origin: 'http://127.0.0.1:3000', 'x-engine-request': '1', 'content-type': 'application/json' };
const results: Array<Record<string, unknown>> = [];
const dataDir = await mkdtemp(path.join(os.tmpdir(), 'itinerary-cp027-probe-'));
const stylesheetPath = path.join(dataDir, 'brochure.css');
await writeFile(stylesheetPath, 'body{font-family:sans-serif}');
const app = await createApp({ dataDir, renderStylesheetPath: stylesheetPath, shareOrigin: 'https://share.example.test' });

async function makeRecord(mode: 'half_day' | 'full_day') {
  const created = await app.inject({ method: 'POST', url: '/api/v1/itineraries', headers, payload: { mode } });
  const blank = created.json();
  const content = createContentV2(mode, 'en');
  const saved = await app.inject({ method: 'PATCH', url: `/api/v1/itineraries/${blank.id}`, headers, payload: { expectedRevision: blank.revision, draftContent: content, languageContext: { requestedLanguage: 'en', outputLanguage: 'en', source: 'explicit' }, writingContext: { brief: '', notes: [] } } });
  return { id: blank.id as string, content, record: saved.json() };
}

try {
  const unquantified = await makeRecord('half_day');
  unquantified.content.days[0].activities[0].time = null;
  unquantified.content.days[0].activities[0].durationMinutes = 420;
  const saved = await app.inject({ method: 'PATCH', url: `/api/v1/itineraries/${unquantified.id}`, headers, payload: { expectedRevision: unquantified.record.revision, draftContent: unquantified.content, languageContext: unquantified.record.languageContext, writingContext: unquantified.record.writingContext } });
  const preview = await app.inject({ method: 'POST', url: `/api/v1/itineraries/${unquantified.id}/preview`, headers, payload: { expectedRevision: saved.json().revision } });
  const publish = await app.inject({ method: 'POST', url: `/api/v1/itineraries/${unquantified.id}/publish`, headers, payload: { operationId: randomUUID(), expectedRevision: saved.json().revision } });
  results.push({ finding: 'V27-01', expected: 'A proven 7h half-day cap violation blocks publish despite an unknown start time.', actual: { previewStatus: preview.statusCode, publishReady: preview.json().publishReady, publishStatus: publish.statusCode, scheduleErrors: preview.json().errors.filter((item: { code: string }) => ['DURATION_CAP_EXCEEDED', 'SCHEDULE_TIME_UNKNOWN'].includes(item.code)).map((item: { code: string }) => item.code) }, reproduced: publish.statusCode === 200 });

  const itinerary = await makeRecord('full_day');
  const firstOperation = randomUUID();
  const first = await app.inject({ method: 'POST', url: `/api/v1/itineraries/${itinerary.id}/publish`, headers, payload: { operationId: firstOperation, expectedRevision: itinerary.record.revision } });
  const secondOperation = randomUUID();
  const reused = await app.inject({ method: 'POST', url: `/api/v1/itineraries/${itinerary.id}/publish`, headers, payload: { operationId: secondOperation, expectedRevision: itinerary.record.revision } });
  const revoke = await app.inject({ method: 'POST', url: `/api/v1/itineraries/${itinerary.id}/unpublish`, headers, payload: { expectedPublicationEpoch: 0 } });
  const replay = await app.inject({ method: 'POST', url: `/api/v1/itineraries/${itinerary.id}/publish`, headers, payload: { operationId: secondOperation, expectedRevision: itinerary.record.revision } });
  const replayStatus = await app.inject({ url: `/api/v1/itineraries/${itinerary.id}/publication` });
  const oldUrl = first.json().shareUrl as string; const newUrl = replay.json().shareUrl as string;
  results.push({ finding: 'V27-05', expected: 'A same-revision reuse records its operation ID; replaying it after revoke cannot reactivate a retired token.', actual: { firstStatus: first.statusCode, sameRevisionReuseStatus: reused.statusCode, revokeStatus: revoke.statusCode, replayStatus: replay.statusCode, oldTokenStillDenied: (await app.inject({ url: `/i/${oldUrl.split('/').at(-1)}` })).statusCode === 404, activeAfterReplay: replayStatus.json().active, replayCreatedDifferentUrl: typeof newUrl === 'string' && oldUrl !== newUrl }, reproduced: replay.statusCode === 200 && replayStatus.json().active === true && oldUrl !== newUrl });

  const race = await makeRecord('full_day');
  const racePublished = await app.inject({ method: 'POST', url: `/api/v1/itineraries/${race.id}/publish`, headers, payload: { operationId: randomUUID(), expectedRevision: race.record.revision } });
  const raceToken = racePublished.json().shareUrl.split('/').at(-1);
  const version = (app as any).store.db.prepare('SELECT id,html_key FROM published_versions WHERE itinerary_id=?').get(race.id);
  const largeHtml = Buffer.concat([Buffer.from('<!doctype html><!--'), Buffer.alloc(32 * 1024 * 1024, 97), Buffer.from('--></body></html>')]);
  await writeFile(path.join(dataDir, 'published', version.html_key), largeHtml);
  (app as any).store.db.prepare('UPDATE published_versions SET html_sha256=? WHERE id=?').run(createHash('sha256').update(largeHtml).digest('hex'), version.id);
  const readInFlight = app.inject({ url: `/i/${raceToken}` });
  await new Promise(resolve => setTimeout(resolve, 1));
  const raceRevoke = await app.inject({ method: 'POST', url: `/api/v1/itineraries/${race.id}/unpublish`, headers, payload: { expectedPublicationEpoch: 0 } });
  const responseAfterRevoke = await readInFlight;
  results.push({ finding: 'V27-04', expected: 'A page read finishing after revocation must not return the retired snapshot.', actual: { revokeStatus: raceRevoke.statusCode, pageStatusAfterRevoke: responseAfterRevoke.statusCode, bytesReturned: responseAfterRevoke.rawPayload.length }, reproduced: raceRevoke.statusCode === 200 && responseAfterRevoke.statusCode === 200 });

  const assetRecord = await makeRecord('full_day');
  const fullPng = await sharp({ create: { width: 8, height: 8, channels: 4, background: '#2a6' } }).png().toBuffer();
  const storageKey = `${randomUUID()}.png`;
  await mkdir(path.join(dataDir, 'assets'), { recursive: true });
  await writeFile(path.join(dataDir, 'assets', storageKey), fullPng);
  const asset = (app as any).store.createAsset({ mime: 'image/png', bytes: fullPng.length, width: 8, height: 8, filename: 'corrupt-fixture.png' }, storageKey);
  assetRecord.content.cover = { assetId: asset.id, credit: { photographer: 'Synthetic', url: null, source: 'Guide' } };
  const assetSave = await app.inject({ method: 'PATCH', url: `/api/v1/itineraries/${assetRecord.id}`, headers, payload: { expectedRevision: assetRecord.record.revision, draftContent: assetRecord.content, languageContext: assetRecord.record.languageContext, writingContext: assetRecord.record.writingContext } });
  const uploadedBytesPath = path.join(dataDir, 'assets', storageKey);
  const corruptBytes = Buffer.from(fullPng);
  let chunkOffset = 8; let idatStart = -1; let idatEnd = -1;
  while (chunkOffset + 8 <= corruptBytes.length) {
    const length = corruptBytes.readUInt32BE(chunkOffset);
    const type = corruptBytes.toString('ascii', chunkOffset + 4, chunkOffset + 8);
    if (type === 'IDAT') { idatStart = chunkOffset + 8; idatEnd = idatStart + length; break; }
    chunkOffset += length + 12;
  }
  if (idatStart >= 0) corruptBytes.fill(0xff, idatStart, idatEnd);
  await writeFile(uploadedBytesPath, corruptBytes);
  const corruptPreview = await app.inject({ method: 'POST', url: `/api/v1/itineraries/${assetRecord.id}/preview`, headers, payload: { expectedRevision: assetSave.json().revision } });
  const corruptBody = corruptPreview.json();
  const imageWasEmbedded = typeof corruptBody.html === 'string' && corruptBody.html.includes('data:image/png;base64,');
  results.push({ finding: 'V27-03', expected: 'A same-size pixel-corrupt stored raster fails closed before unsafe inline preview.', actual: { bytesPreserved: corruptBytes.length === fullPng.length, status: corruptPreview.statusCode, publishReady: corruptBody.publishReady ?? null, embeddedCorruptImage: imageWasEmbedded, errorCodes: (corruptBody.errors || corruptBody.error?.fields?.errors || []).map((item: any) => item.code) }, reproduced: imageWasEmbedded });

  const outDir = path.resolve('output/web-e2e'); await mkdir(outDir, { recursive: true });
  await writeFile(path.join(outDir, 'cp027-probe-summary.json'), JSON.stringify({ purpose: 'diagnostic reproduction; not CP027 acceptance', findings: results }, null, 2));
  console.log(JSON.stringify(results));
} finally {
  await app.close(); await rm(dataDir, { recursive: true, force: true });
}
