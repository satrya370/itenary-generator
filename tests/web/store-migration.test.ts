import assert from 'node:assert/strict';
import { existsSync, mkdirSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { validateDraft } from '../../src/contracts/validator.js';
import { createApp } from '../../src/server/app.js';
import { upgradeV1ToV2 } from '../../src/contracts/upgrade-v1.js';
import { MIGRATIONS, openStore, runMigrations, type Migration } from '../../src/server/store.js';
import { createContent as createContentV1, ids as idsV1 } from './fixtures.js';
import { createContentV2 } from './fixtures-v2.js';

const PROFILE = { agencyName: 'Sample Travel Studio', agencyContact: 'guide@example.test', agencyLogoAssetId: null };
const LANGUAGE = { requestedLanguage: 'en', outputLanguage: 'en', source: 'explicit' };
const WRITING = { brief: 'Private brief', notes: [{ targetId: idsV1.activity1, text: 'Kept as is.' }] };

async function tempDir(t: any) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'itinerary-r2-'));
  t.after(async () => { await rm(dir, { recursive: true, force: true }); });
  return dir;
}

function openLegacy(dataDir: string) {
  mkdirSync(dataDir, { recursive: true });
  const db = new DatabaseSync(path.join(dataDir, 'engine.sqlite'));
  db.exec('PRAGMA foreign_keys=ON');
  runMigrations(db, { dataDir }, MIGRATIONS.slice(0, 2));
  const stamp = '2026-10-07T00:00:00.000Z';
  db.prepare('INSERT INTO app_meta(key,value) VALUES(?,?)').run('workspace_id', 'ws-1');
  db.prepare('INSERT INTO workspaces(id,profile_json,revision,created_at,updated_at) VALUES(?,?,1,?,?)').run('ws-1', JSON.stringify(PROFILE), stamp, stamp);
  return db;
}

function insertV1(db: DatabaseSync, id: string, content: unknown, updatedAt = '2026-10-07T01:00:00.000Z') {
  db.prepare("INSERT INTO itineraries(id,workspace_id,schema_version,revision,draft_json,language_json,writing_json,created_at,updated_at) VALUES(?,?,'web-1.0.0',5,?,?,?,?,?)")
    .run(id, 'ws-1', typeof content === 'string' ? content : JSON.stringify(content), JSON.stringify(LANGUAGE), JSON.stringify(WRITING), '2026-10-07T00:30:00.000Z', updatedAt);
}

function versionsOf(db: DatabaseSync) {
  return (db.prepare('SELECT version FROM migrations ORDER BY version').all() as Array<{ version: number }>).map((row) => Number(row.version));
}

test('a fresh data root applies every migration once, creates no backup, and reopening is a no-op', async (t) => {
  const dataDir = await tempDir(t);
  const first = openStore({ dataDir });
  assert.deepEqual(versionsOf(first.db), [1, 2, 3, 4, 5, 6, 7]);
  first.close();
  const second = openStore({ dataDir });
  assert.deepEqual(versionsOf(second.db), [1, 2, 3, 4, 5, 6, 7]);
  second.close();
  assert.equal(existsSync(path.join(dataDir, 'backups')), false);
});

test('the runner rolls back a failing migration, keeps earlier ones, and resumes once the cause is fixed', async (t) => {
  const dataDir = await tempDir(t);
  const db = new DatabaseSync(path.join(dataDir, 'engine.sqlite'));
  let broken = true;
  const migrations: Migration[] = [
    { version: 1, name: 'first', up: (database) => database.exec('CREATE TABLE first_table (id INTEGER)') },
    { version: 2, name: 'second', up: (database) => { database.exec('CREATE TABLE second_table (id INTEGER)'); if (broken) throw new Error('boom'); } }
  ];
  assert.throws(() => runMigrations(db, { dataDir }, migrations), /Database migration 2 \(second\) failed and was rolled back: boom/);
  assert.deepEqual(versionsOf(db), [1]);
  const tables = () => (db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '%_table'").all() as Array<{ name: string }>).map((row) => row.name);
  assert.deepEqual(tables(), ['first_table']);
  broken = false;
  runMigrations(db, { dataDir }, migrations);
  assert.deepEqual(versionsOf(db), [1, 2]);
  assert.deepEqual(tables().sort(), ['first_table', 'second_table']);
  db.close();
});

test('migration 3 upgrades v1 drafts in place, keeps revisions/timestamps/IDs, snapshots and the AI ledger, and backs up first', async (t) => {
  const dataDir = await tempDir(t);
  const db = openLegacy(dataDir);
  const second = '2f000000-0000-4000-8000-000000000002';
  insertV1(db, 'it-full', createContentV1('full_day', 'en'));
  insertV1(db, 'it-multi', createContentV1('multi_day', 'en'), '2026-10-08T01:00:00.000Z');
  insertV1(db, second, createContentV1('destination_guide', 'en'), '2026-10-09T01:00:00.000Z');
  const snapshot = JSON.stringify(createContentV1('full_day', 'en'));
  db.prepare("INSERT INTO published_versions(id,workspace_id,itinerary_id,source_revision,snapshot_json,schema_version,html_key,html_sha256,og_image_key,og_image_sha256,created_at) VALUES('pv1','ws-1','it-full',5,?,'web-1.0.0','pv1.html','h','pv1.jpg','i','2026-10-07T02:00:00.000Z')").run(snapshot);
  db.prepare("INSERT INTO ai_operations(operation_id,workspace_id,itinerary_id,operation_kind,target_kind,target_id,expected_revision,fingerprint,status,attempts,reserved_usd,actual_usd,prompt_tokens,completion_tokens,suggestion_text,error_code,day_utc,created_at,updated_at) VALUES('op1','ws-1','it-full','description','spot','legacy-target',5,'fp','completed',1,0.001,0.000521,900,80,'Old text',NULL,'2026-10-07','2026-10-07T03:00:00.000Z','2026-10-07T03:00:01.000Z')").run();
  db.prepare('UPDATE ai_live_budget SET committed_usd=0.001361 WHERE id=1').run();
  const ledgerBefore = JSON.stringify({
    ops: (db.prepare('SELECT * FROM ai_operations ORDER BY operation_id').all() as unknown[]).map((row) => ({ ...(row as object) })),
    budget: { ...(db.prepare('SELECT * FROM ai_live_budget').get() as object) }
  });
  const beforeRows = (db.prepare('SELECT id,revision,created_at,updated_at,language_json,writing_json FROM itineraries ORDER BY id').all() as unknown[]).map((row) => ({ ...(row as object) })) as Array<{ id: string; revision: number; created_at: string; updated_at: string; language_json: string; writing_json: string }>;
  db.close();

  const store = openStore({ dataDir });
  assert.deepEqual(versionsOf(store.db), [1, 2, 3, 4, 5, 6, 7]);
  const upgraded = store.db.prepare('SELECT * FROM itineraries ORDER BY id').all() as any[];
  assert.equal(upgraded.length, 3);
  for (const row of upgraded) {
    assert.equal(row.schema_version, 'web-2.1.0');
    const draft = JSON.parse(row.draft_json);
    assert.equal(draft.schemaVersion, 'web-2.1.0');
    assert.equal(validateDraft(draft).ok, true, `${row.id}: ${JSON.stringify(validateDraft(draft).errors)}`);
  }
  for (const [idx, row] of upgraded.entries()) {
    const before = beforeRows[idx];
    assert.equal(row.id, before.id);
    assert.equal(row.revision, before.revision);
    assert.equal(row.created_at, before.created_at);
    assert.equal(row.updated_at, before.updated_at);
    assert.equal(row.language_json, before.language_json);
    const writing = JSON.parse(row.writing_json);
    const beforeWriting = JSON.parse(before.writing_json);
    assert.equal(writing.brief, beforeWriting.brief, `${row.id}: brief mismatch`);
    assert.ok(Array.isArray(writing.notes), `${row.id}: notes must be array`);
    assert.deepEqual(writing.notes.slice(0, beforeWriting.notes.length), beforeWriting.notes, `${row.id}: existing notes keep their order and content`);
    for (const note of writing.notes.slice(beforeWriting.notes.length)) assert.match(note.text, /^(timeLabel|durationLabel|mealsIncluded|category): /m, `${row.id}: migration notes carry the v1 field name`);
  }
  const byId = Object.fromEntries(upgraded.map((row) => [row.id, JSON.parse(row.draft_json)]));
  assert.equal(byId['it-full'].trip.title, 'Ubud in a day');
  assert.equal(byId['it-full'].days[0].id, idsV1.block1);
  assert.equal(byId['it-full'].days[0].activities[0].id, idsV1.activity1);
  assert.deepEqual(byId['it-multi'].days.map((day: any) => day.id), [idsV1.block1, idsV1.block2]);
  assert.equal(byId[second].places[0].id, idsV1.spot1);
  assert.equal((store.listItineraries(null, 10))!.items.find((item) => item.id === 'it-multi')!.mode, 'multi_day');

  const warnings = JSON.parse(String((store.db.prepare("SELECT value FROM app_meta WHERE key='migration3_warnings'").get() as { value: string }).value));
  assert.deepEqual(Object.keys(warnings).sort(), ['it-full', 'it-multi', second].sort());
  assert.ok(warnings['it-full'].includes('FIELD_DROPPED'));
  assert.ok(warnings['it-multi'].includes('HOTEL_NAME_EMPTY'));
  assert.equal(JSON.stringify(warnings).includes('Ubud'), false, 'warnings carry codes only, never content');

  const published = store.db.prepare('SELECT snapshot_json,schema_version FROM published_versions').get() as any;
  assert.equal(published.snapshot_json, snapshot);
  assert.equal(published.schema_version, 'web-1.0.0');
  const ledgerAfter = JSON.stringify({
    ops: (store.db.prepare('SELECT * FROM ai_operations ORDER BY operation_id').all() as unknown[]).map((row) => ({ ...(row as object) })),
    budget: { ...(store.db.prepare('SELECT * FROM ai_live_budget').get() as object) }
  });
  assert.equal(ledgerAfter, ledgerBefore);
  store.close();

  const backupPath = path.join(dataDir, 'backups', 'pre-migration-3.sqlite');
  assert.equal(existsSync(backupPath), true);
  const backup = new DatabaseSync(backupPath, { readOnly: true });
  assert.deepEqual((backup.prepare('SELECT DISTINCT schema_version AS v FROM itineraries').all() as Array<{ v: string }>).map((row) => row.v), ['web-1.0.0']);
  assert.deepEqual(versionsOf(backup), [1, 2]);
  backup.close();
});

test('a draft that cannot be upgraded rolls migration 3 back, refuses to start, and keeps the original backup', async (t) => {
  const dataDir = await tempDir(t);
  const db = openLegacy(dataDir);
  const good = createContentV1('full_day', 'en');
  insertV1(db, 'it-good', good);
  insertV1(db, 'it-corrupt', 'this is not json');
  db.close();

  assert.throws(() => openStore({ dataDir }), /Database migration 3 \(guide-centric-schema-web-2\.0\.0\) failed and was rolled back: itinerary it-corrupt holds unreadable draft JSON/);
  const after = new DatabaseSync(path.join(dataDir, 'engine.sqlite'));
  assert.deepEqual(versionsOf(after), [1, 2]);
  const rows = after.prepare('SELECT id,schema_version,draft_json FROM itineraries ORDER BY id').all() as any[];
  assert.deepEqual(rows.map((row) => [row.id, row.schema_version]), [['it-corrupt', 'web-1.0.0'], ['it-good', 'web-1.0.0']]);
  assert.equal(rows[1].draft_json, JSON.stringify(good));
  assert.equal(after.prepare("SELECT count(*) AS count FROM app_meta WHERE key='migration3_warnings'").get()!.count, 0);

  after.prepare("DELETE FROM itineraries WHERE id='it-corrupt'").run();
  after.close();
  const backupPath = path.join(dataDir, 'backups', 'pre-migration-3.sqlite');
  assert.equal(existsSync(backupPath), true);
  const store = openStore({ dataDir });
  assert.deepEqual(versionsOf(store.db), [1, 2, 3, 4, 5, 6, 7]);
  assert.equal((store.db.prepare('SELECT schema_version FROM itineraries').get() as any).schema_version, 'web-2.1.0');
  store.close();
  const backup = new DatabaseSync(backupPath, { readOnly: true });
  assert.equal(Number((backup.prepare("SELECT count(*) AS count FROM itineraries WHERE id='it-corrupt'").get() as any).count), 1, 'the first backup is not overwritten');
  backup.close();
});

test('an upgraded draft that fails v2 validation is reported by itinerary and error code, not written', async (t) => {
  const dataDir = await tempDir(t);
  const db = openLegacy(dataDir);
  const oversized = createContentV1('full_day', 'en');
  oversized.schedule = Array.from({ length: 15 }, (_, index) => ({ ...structuredClone(createContentV1('full_day').schedule[0]), id: `10000000-0000-5000-8000-${String(index + 1).padStart(12, '0')}`, dayStart: 1, dayEnd: 1, activities: [] }));
  insertV1(db, 'it-too-many-days', oversized);
  db.close();
  assert.throws(() => openStore({ dataDir }), /itinerary it-too-many-days cannot be upgraded to web-2\.1\.0: SCHEMA_VALIDATION_FAILED@days/);
  const after = new DatabaseSync(path.join(dataDir, 'engine.sqlite'));
  assert.equal((after.prepare('SELECT schema_version FROM itineraries').get() as any).schema_version, 'web-1.0.0');
  after.close();
});

test('saving writes the schema version carried by the content', async (t) => {
  const dataDir = await tempDir(t);
  const store = openStore({ dataDir });
  const created = store.createItinerary({ schemaVersion: 'web-2.1.0', marker: 'created' }, LANGUAGE, WRITING);
  assert.equal(created.schemaVersion, 'web-2.1.0');
  store.db.prepare("UPDATE itineraries SET schema_version='web-1.0.0' WHERE id=?").run(created.id);
  const updated = store.updateItinerary(created.id, 1, { schemaVersion: 'web-2.1.0', marker: 'updated' }, LANGUAGE, WRITING);
  assert.equal(updated!.schemaVersion, 'web-2.1.0');
  assert.equal(updated!.revision, 2);
  store.close();
});

const validWritingShape = (writing: any) => Object.keys(writing).every((key) => ['brief', 'notes'].includes(key)) && typeof writing.brief === 'string' && writing.brief.length <= 20000 && Array.isArray(writing.notes) && writing.notes.length <= 100 && writing.notes.every((note: any) => typeof note.targetId === 'string' && typeof note.text === 'string' && note.text.length <= 4000);

test('writing_json is untouched when the upgrade produces no notes', async (t) => {
  const dataDir = await tempDir(t);
  const db = openLegacy(dataDir);
  const clean: any = createContentV1('full_day', 'en');
  clean.schedule[0].activities[0].category = null;
  clean.schedule = [clean.schedule[0]];
  assert.equal(upgradeV1ToV2(clean, PROFILE).notes.length, 0);
  insertV1(db, 'it-clean', clean);
  db.close();
  const store = openStore({ dataDir });
  const row = store.db.prepare('SELECT writing_json FROM itineraries').get() as any;
  assert.equal(row.writing_json, JSON.stringify(WRITING));
  store.close();
});

test('migration notes are appended after existing notes and the result still satisfies the writing contract', async (t) => {
  const dataDir = await tempDir(t);
  const db = openLegacy(dataDir);
  insertV1(db, 'it-notes', createContentV1('full_day', 'en'));
  db.close();
  const store = openStore({ dataDir });
  const writing = JSON.parse((store.db.prepare('SELECT writing_json FROM itineraries').get() as any).writing_json);
  assert.equal(validWritingShape(writing), true);
  assert.deepEqual(writing.notes[0], WRITING.notes[0]);
  assert.deepEqual(writing.notes.slice(1), [{ targetId: idsV1.activity1, text: 'category: Nature' }]);
  store.close();
});

test('too many notes collapse into one itinerary note while existing notes stay untouched', async (t) => {
  const dataDir = await tempDir(t);
  const db = openLegacy(dataDir);
  const v1: any = createContentV1('multi_day', 'en');
  const template = v1.schedule[0].activities[0];
  v1.schedule.forEach((block: any, day: number) => {
    block.activities = Array.from({ length: 25 }, (_, index) => ({ ...structuredClone(template), id: `20000000-0000-5000-8000-${String(day * 100 + index + 1).padStart(12, '0')}`, category: `Category ${day}-${index}` }));
  });
  insertV1(db, 'it-many', v1);
  const existing = { brief: 'Private brief', notes: Array.from({ length: 60 }, (_, index) => ({ targetId: 'itinerary', text: `existing ${index}` })) };
  db.prepare('UPDATE itineraries SET writing_json=? WHERE id=?').run(JSON.stringify(existing), 'it-many');
  db.close();
  const store = openStore({ dataDir });
  const writing = JSON.parse((store.db.prepare('SELECT writing_json FROM itineraries').get() as any).writing_json);
  assert.equal(validWritingShape(writing), true);
  assert.deepEqual(writing.notes.slice(0, 60), existing.notes, 'existing notes are kept untouched and in order');
  assert.equal(writing.notes.length, 61);
  assert.equal(writing.notes[60].targetId, 'itinerary');
  assert.ok(writing.notes[60].text.includes('category: Category 0-0') && writing.notes[60].text.includes('category: Category 1-24'));
  store.close();
});

test('a root recorded at migration 2 without AI tables starts and recovers the AI schema and ledger', async (t) => {
  const dataDir = await tempDir(t);
  mkdirSync(dataDir, { recursive: true });
  const db = new DatabaseSync(path.join(dataDir, 'engine.sqlite'));
  runMigrations(db, { dataDir }, [MIGRATIONS[0], { version: 2, name: 'ai-schema-missing', up: () => undefined }]);
  db.close();
  const app = await createApp({ dataDir, aiProvider: {} as any });
  const check = (app as any).store.db;
  assert.equal(Number(check.prepare("SELECT count(*) AS count FROM sqlite_master WHERE name='ai_operations'").get().count), 1);
  assert.deepEqual({ ...check.prepare('SELECT id,limit_usd,committed_usd FROM ai_live_budget').get() }, { id: 1, limit_usd: 2, committed_usd: 0 });
  await app.close();
});

test('a failing startup closes the store so the data root can be deleted', async (t) => {
  const dataDir = await tempDir(t);
  const options: any = { dataDir };
  Object.defineProperty(options, 'aiProvider', { get() { throw new Error('provider boom'); } });
  await assert.rejects(createApp(options), /provider boom/);
  await rm(path.join(dataDir, 'engine.sqlite'));
  assert.equal(existsSync(path.join(dataDir, 'engine.sqlite')), false);
});

test('migration 4 upgrades stored web-2.0.0 drafts once: healthSafety becomes localTips, revision unchanged, backup written', async (t) => {
  const dataDir = await tempDir(t);
  const db = openLegacy(dataDir);
  runMigrations(db, { dataDir }, MIGRATIONS.slice(0, 3));
  const draft = { ...createContentV2('full_day', 'en'), schemaVersion: 'web-2.0.0' } as any;
  delete draft.notSuitableFor; delete draft.notAllowed;
  draft.healthSafety = ['Carry water'];
  db.prepare("INSERT INTO itineraries(id,workspace_id,schema_version,revision,draft_json,language_json,writing_json,created_at,updated_at) VALUES(?,?,'web-2.0.0',7,?,?,?,?,?)")
    .run('itin-20', 'ws-1', JSON.stringify(draft), JSON.stringify(LANGUAGE), JSON.stringify(WRITING), '2026-10-07T00:30:00.000Z', '2026-10-07T01:00:00.000Z');
  runMigrations(db, { dataDir }, MIGRATIONS);
  const row = db.prepare('SELECT schema_version, revision, draft_json FROM itineraries WHERE id=?').get('itin-20') as { schema_version: string; revision: number; draft_json: string };
  assert.equal(row.schema_version, 'web-2.1.0');
  assert.equal(row.revision, 7, 'revision is not bumped by a migration');
  const upgraded = JSON.parse(row.draft_json);
  assert.equal(upgraded.schemaVersion, 'web-2.1.0');
  assert.equal('healthSafety' in upgraded, false);
  assert.ok(upgraded.localTips.includes('Carry water'));
  assert.ok(existsSync(path.join(dataDir, 'backups', 'pre-migration-4.sqlite')), 'backup written before the change');
  db.close();
});
