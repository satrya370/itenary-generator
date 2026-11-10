import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { access, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../../src/server/app.js';
import { createContentV2 } from '../../tests/web/fixtures-v2.js';

async function exists(filePath: string) { return access(filePath).then(() => true, () => false); }

async function main() {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'itinerary-cp027-recovery-scope-'));
  const outputDir = path.resolve('output/web-e2e'); await mkdir(outputDir, { recursive: true });
  let app = await createApp({ dataDir });
  try {
    const store = (app as any).store;
    const workspaceId = randomUUID(); const itineraryId = randomUUID(); const versionId = randomUUID(); const operationId = randomUUID(); const timestamp = new Date().toISOString();
    const htmlKey = `${versionId}.html`; const imageKey = `${versionId}.jpg`;
    const html = Buffer.from('<!doctype html><title>foreign committed fixture</title>'); const image = Buffer.from('synthetic committed OG bytes');
    const foreignDir = path.join(dataDir, 'published'); await mkdir(foreignDir, { recursive: true });
    await writeFile(path.join(foreignDir, htmlKey), html); await writeFile(path.join(foreignDir, imageKey), image);
    store.db.prepare('INSERT INTO workspaces(id,profile_json,revision,created_at,updated_at) VALUES(?,?,1,?,?)').run(workspaceId, JSON.stringify({ agencyName: 'Foreign workspace' }), timestamp, timestamp);
    store.db.prepare('INSERT INTO itineraries(id,workspace_id,schema_version,revision,draft_json,language_json,writing_json,created_at,updated_at) VALUES(?,?,?,1,?,?,?,?,?)').run(itineraryId, workspaceId, 'web-2.0.0', JSON.stringify(createContentV2('full_day', 'en')), JSON.stringify({ requestedLanguage: 'en', outputLanguage: 'en', source: 'explicit' }), JSON.stringify({ brief: '', notes: [] }), timestamp, timestamp);
    store.db.prepare('INSERT INTO published_versions(id,workspace_id,itinerary_id,source_revision,snapshot_json,schema_version,html_key,html_sha256,og_image_key,og_image_sha256,created_at) VALUES(?,?,?,1,?,?,?,?,?,?,?)').run(versionId, workspaceId, itineraryId, JSON.stringify(createContentV2('full_day', 'en')), 'web-2.0.0', htmlKey, createHash('sha256').update(html).digest('hex'), imageKey, createHash('sha256').update(image).digest('hex'), timestamp);
    store.db.prepare("INSERT INTO publish_operations(id,workspace_id,itinerary_id,fingerprint,status,created_at,updated_at) VALUES(?,?,?,'foreign-pending','pending',?,?)").run(operationId, workspaceId, itineraryId, timestamp, timestamp);
    await app.close();
    app = await createApp({ dataDir });
    const htmlExists = await exists(path.join(foreignDir, htmlKey)); const imageExists = await exists(path.join(foreignDir, imageKey));
    const recovered = (app as any).store.db.prepare('SELECT status,error_code FROM publish_operations WHERE id=?').get(operationId) as { status: string; error_code: string };
    const pendingOperationTerminalized = recovered.status === 'failed' && recovered.error_code === 'SERVER_RESTARTED';
    const summary = { finding: 'V27-06-recovery-preserves-other-workspace-published-artifacts', reproduced: !(htmlExists && imageExists && pendingOperationTerminalized), foreignCommittedHtmlPreserved: htmlExists, foreignCommittedOgImagePreserved: imageExists, pendingOperationTerminalized };
    await writeFile(path.join(outputDir, 'cp027-recovery-scope-probe.json'), JSON.stringify(summary, null, 2));
    console.log(JSON.stringify(summary));
  } finally { await app.close(); await rm(dataDir, { recursive: true, force: true }); }
}

await main();
