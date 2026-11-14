import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { openStore } from '../../src/server/store.js';
import { importRetentionDays, sweepImportSources } from '../../src/server/import/retention.js';

test('retention: old source text is removed, recent text and the source row stay, 0 keeps everything', async (t) => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'itinerary-retention-'));
  const store = openStore({ dataDir });
  t.after(async () => { store.close(); await rm(dataDir, { recursive: true, force: true }); });
  const now = new Date('2026-11-12T00:00:00.000Z');
  const old = new Date('2026-09-01T00:00:00.000Z').toISOString();
  const recent = new Date('2026-11-10T00:00:00.000Z').toISOString();
  const insert = store.db.prepare("INSERT INTO import_sources(id,workspace_id,kind,sha256,byte_size,page_count,char_count,language_json,created_at) VALUES(?,?,'text','x',1,1,1,'{}',?)");
  insert.run('11111111-aaaa-4aaa-8aaa-111111111111', store.workspaceId, old);
  insert.run('22222222-bbbb-4bbb-8bbb-222222222222', store.workspaceId, recent);
  const legacyReport = { review: { rejectedProposals: [{ value: 'private legacy quote', quote: 'private legacy quote', lineIndexes: [1] }] }, evidence: { accepted: [{ path: 'summary', quote: 'private legacy quote', lineIndexes: [1] }] }, _replay: { report: { evidence: { accepted: [{ path: 'summary', quote: 'private legacy quote', lineIndexes: [1] }] } } } };
  store.db.prepare("INSERT INTO import_operations(operation_id,workspace_id,source_id,target,mode,status,ai_used,report_json,created_at,updated_at) VALUES(?,?,?,'new','full_day','completed',0,?,?,?)")
    .run('operation-old', store.workspaceId, '11111111-aaaa-4aaa-8aaa-111111111111', JSON.stringify(legacyReport), old, old);
  await mkdir(path.join(dataDir, 'imports'), { recursive: true });
  await writeFile(path.join(dataDir, 'imports', '11111111-aaaa-4aaa-8aaa-111111111111.txt'), 'lama');
  await writeFile(path.join(dataDir, 'imports', '11111111-aaaa-4aaa-8aaa-111111111111.layout.json'), '{"version":1,"pages":[],"blocks":[],"diagnostics":[]}');
  await writeFile(path.join(dataDir, 'imports', '22222222-bbbb-4bbb-8bbb-222222222222.txt'), 'baru');

  assert.equal(await sweepImportSources(store, dataDir, 0, now), 0, 'days 0 keeps everything');
  assert.equal(await sweepImportSources(store, dataDir, 30, now), 1);
  await assert.rejects(stat(path.join(dataDir, 'imports', '11111111-aaaa-4aaa-8aaa-111111111111.txt')));
  await assert.rejects(stat(path.join(dataDir, 'imports', '11111111-aaaa-4aaa-8aaa-111111111111.layout.json')));
  assert.equal(await readFile(path.join(dataDir, 'imports', '22222222-bbbb-4bbb-8bbb-222222222222.txt'), 'utf8'), 'baru');
  const rows = store.db.prepare('SELECT COUNT(*) AS n FROM import_sources').get() as { n: number };
  assert.equal(rows.n, 2, 'source rows stay for the ledger');
  const retained = (store.db.prepare('SELECT report_json FROM import_operations WHERE operation_id=?').get('operation-old') as { report_json: string }).report_json;
  assert.doesNotMatch(retained, /private legacy quote/);
  assert.match(retained, /lineIndexes/);
});

test('retention setting: default 30, invalid values fall back to 30, 0 is allowed', () => {
  assert.equal(importRetentionDays(undefined), 30);
  assert.equal(importRetentionDays('abc'), 30);
  assert.equal(importRetentionDays('-1'), 30);
  assert.equal(importRetentionDays('0'), 0);
  assert.equal(importRetentionDays('14'), 14);
});
