import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';

const fixtures = JSON.parse(await readFile('/tmp/cp028-readiness-fixtures.json', 'utf8'));
const origin = 'http://127.0.0.1:3000';
const headers = { origin, 'x-engine-request': '1', 'content-type': 'application/json' };
async function request(url, init = {}) {
  const response = await fetch(`${origin}${url}`, { ...init, headers: { ...headers, ...(init.headers || {}) } });
  let body; try { body = await response.json(); } catch { body = null; }
  return { status: response.status, body };
}

if (fixtures.action === 'create') {
  const context = await request('/api/v1/itinerary-engine/context');
  if (context.status !== 200) throw new Error('runtime context unavailable');
  const uploadForm = new FormData();
  uploadForm.append('image', new Blob([Buffer.from(fixtures.pngBase64, 'base64')], { type: 'image/png' }), 'readiness.png');
  const uploadResponse = await fetch(`${origin}/api/v1/assets`, { method: 'POST', headers: { origin, 'x-engine-request': '1' }, body: uploadForm });
  const uploaded = await uploadResponse.json();
  if (!uploadResponse.ok) throw new Error('runtime raster upload failed');
  const profile = await request('/api/v1/itinerary-engine/profile');
  const profileSave = await request('/api/v1/itinerary-engine/profile', { method: 'PATCH', body: JSON.stringify({ expectedRevision: profile.body.revision, profile: { agencyName: 'CP028 Linux Guide', agencyContact: 'guide@example.test', agencyLogoAssetId: uploaded.id } }) });
  if (profileSave.status !== 200) throw new Error('runtime profile save failed');

  const rows = [];
  const allFixtures = [...fixtures.modes, ...(fixtures.stressFixtures || [])];
  for (const fixture of allFixtures) {
    const content = structuredClone(fixture.content);
    if (fixture.mode === 'full_day') {
      content.brochure.agencyName = 'CP028 Linux Guide'; content.brochure.agencyContact = 'guide@example.test';
      content.brochure.agencyLogoAssetId = uploaded.id; content.hero.assetId = uploaded.id; content.hero.gradientOnly = false;
      content.hero.photoAttribution = { photographer: 'Owned test asset', photographerUrl: 'https://credits.example.test/linux', source: 'Guide-owned' };
    }
    const created = await request('/api/v1/itineraries', { method: 'POST', body: JSON.stringify({ mode: fixture.mode }) });
    if (created.status !== 201) throw new Error(`runtime create failed for ${fixture.mode}`);
    const saved = await request(`/api/v1/itineraries/${created.body.id}`, { method: 'PATCH', body: JSON.stringify({ expectedRevision: created.body.revision, draftContent: content, languageContext: { requestedLanguage: fixture.locale, outputLanguage: fixture.locale, source: 'explicit' }, writingContext: { brief: '', notes: [] } }) });
    if (saved.status !== 200) throw new Error(`runtime save failed for ${fixture.mode}`);
    const previewStarted = performance.now();
    const preview = await request(`/api/v1/itineraries/${created.body.id}/preview`, { method: 'POST', body: JSON.stringify({ expectedRevision: saved.body.revision }) });
    const previewMs = Math.round(performance.now() - previewStarted);
    if (preview.status !== 200 || !preview.body.publishReady) throw new Error(`runtime preview failed for ${fixture.mode}`);
    const operationId = randomUUID();
    const publishStarted = performance.now();
    const published = await request(`/api/v1/itineraries/${created.body.id}/publish`, { method: 'POST', body: JSON.stringify({ expectedRevision: saved.body.revision, operationId }) });
    const publishMs = Math.round(performance.now() - publishStarted);
    if (published.status !== 200) throw new Error(`runtime publish failed for ${fixture.mode}`);
    rows.push({ id: created.body.id, mode: fixture.mode, locale: fixture.locale, revision: saved.body.revision, versionId: published.body.versionId, shareUrl: published.body.shareUrl, operationId, previewMs, publishMs });
  }
  const fullDay = rows.find(row => row.mode === 'full_day');
  const oldToken = fullDay.shareUrl.split('/').at(-1);
  const revoked = await request(`/api/v1/itineraries/${fullDay.id}/unpublish`, { method: 'POST', body: JSON.stringify({ expectedPublicationEpoch: 0 }) });
  if (revoked.status !== 200) throw new Error('runtime revoke failed');
  const rotated = await request(`/api/v1/itineraries/${fullDay.id}/publish`, { method: 'POST', body: JSON.stringify({ expectedRevision: fullDay.revision, operationId: randomUUID() }) });
  if (rotated.status !== 200 || rotated.body.shareUrl === fullDay.shareUrl) throw new Error('runtime token rotation failed');
  fullDay.revokedUrl = fullDay.shareUrl; fullDay.shareUrl = rotated.body.shareUrl; fullDay.versionId = rotated.body.versionId;
  const afterRotation = await request(`/api/v1/itineraries/${fullDay.id}/publication`);
  const finalProfile = await request('/api/v1/itinerary-engine/profile');
  const finalContext = await request('/api/v1/itinerary-engine/context');
  console.log(JSON.stringify({ status: 'passed', credentialState: finalContext.body.capabilities.ai.credentialState, workspaceId: finalProfile.body.id, agencyName: finalProfile.body.profile.agencyName, assetId: uploaded.id, oldFullDayToken: oldToken, rotatedPublicationActive: afterRotation.body.active, rows }));
} else if (fixtures.action === 'inspect') {
  const profile = await request('/api/v1/itinerary-engine/profile');
  const context = await request('/api/v1/itinerary-engine/context');
  const assets = await request('/api/v1/assets');
  const records = [];
  for (const fixture of fixtures.rows) {
    const record = await request(`/api/v1/itineraries/${fixture.id}`);
    const publication = await request(`/api/v1/itineraries/${fixture.id}/publication`);
    const versions = await request(`/api/v1/itineraries/${fixture.id}/versions`);
    records.push({ id: record.body.id, revision: record.body.revision, mode: record.body.draftContent.brochure.itineraryMode, active: publication.body.active, currentVersionId: publication.body.currentVersion?.id, shareUrl: publication.body.shareUrl, versionCount: versions.body.items.length });
  }
  console.log(JSON.stringify({ status: 'passed', workspaceId: profile.body.id, agencyName: profile.body.profile.agencyName, credentialState: context.body.capabilities.ai.credentialState, assetPresent: assets.body.items.some(item => item.id === fixtures.assetId), records }));
} else throw new Error('Unknown readiness probe action');
