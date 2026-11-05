import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { AI_SCHEMA_DDL, recoverInterruptedAiOperations } from './ai/schema.js';
import { LEGACY_SCHEMA_VERSION, SCHEMA_VERSION } from '../contracts/types.js';
import { upgradeV1ToV2 } from '../contracts/upgrade-v1.js';
import { validateDraft } from '../contracts/validator.js';

export interface StoreOptions { dataDir: string; }
export interface ItineraryRecord {
  id: string; revision: number; schemaVersion: string; draftContent: unknown;
  languageContext: unknown; writingContext: unknown; createdAt: string; updatedAt: string;
}
export interface AssetRecord { id: string; mime: string; bytes: number; width: number; height: number; filename: string; createdAt: string; }
export interface ItineraryListItem { id: string; revision: number; mode: string; title: string; updatedAt: string; }

const CORE_SCHEMA_DDL = `
  CREATE TABLE IF NOT EXISTS app_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS workspaces (
    id TEXT PRIMARY KEY, profile_json TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS itineraries (
    id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id),
    schema_version TEXT NOT NULL, revision INTEGER NOT NULL, draft_json TEXT NOT NULL,
    language_json TEXT NOT NULL, writing_json TEXT NOT NULL,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS itineraries_workspace_updated ON itineraries(workspace_id, updated_at DESC, id);
  CREATE TABLE IF NOT EXISTS assets (
    id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id),
    storage_key TEXT NOT NULL UNIQUE, mime TEXT NOT NULL, bytes INTEGER NOT NULL,
    width INTEGER NOT NULL, height INTEGER NOT NULL, filename TEXT NOT NULL, created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS published_versions (
    id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id), itinerary_id TEXT NOT NULL REFERENCES itineraries(id),
    source_revision INTEGER NOT NULL, snapshot_json TEXT NOT NULL, schema_version TEXT NOT NULL,
    html_key TEXT NOT NULL UNIQUE, html_sha256 TEXT NOT NULL, og_image_key TEXT NOT NULL UNIQUE, og_image_sha256 TEXT NOT NULL, created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS published_versions_itinerary ON published_versions(workspace_id,itinerary_id,created_at DESC,id);
  CREATE TABLE IF NOT EXISTS share_tokens (
    id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id), itinerary_id TEXT NOT NULL REFERENCES itineraries(id),
    token_value TEXT NOT NULL UNIQUE, token_sha256 TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL, revoked_at TEXT
  );
  CREATE TABLE IF NOT EXISTS publication_state (
    workspace_id TEXT NOT NULL REFERENCES workspaces(id), itinerary_id TEXT NOT NULL REFERENCES itineraries(id),
    current_version_id TEXT, active_token_id TEXT, epoch INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL,
    PRIMARY KEY(workspace_id,itinerary_id)
  );
  CREATE TABLE IF NOT EXISTS publish_operations (
    id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id), itinerary_id TEXT NOT NULL REFERENCES itineraries(id),
    fingerprint TEXT NOT NULL, status TEXT NOT NULL, version_id TEXT, token_id TEXT, error_code TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  );
`;

export interface MigrationContext { dataDir: string; }
export interface Migration {
  version: number;
  name: string;
  /** Runs outside the migration transaction, e.g. to take a backup. */
  before?(db: DatabaseSync, context: MigrationContext): void;
  up(db: DatabaseSync, context: MigrationContext): void;
}

function backupBeforeV2Upgrade(db: DatabaseSync, { dataDir }: MigrationContext) {
  const pending = Number((db.prepare('SELECT count(*) AS count FROM itineraries WHERE schema_version=?').get(LEGACY_SCHEMA_VERSION) as { count: number }).count);
  if (!pending) return;
  const directory = path.join(dataDir, 'backups');
  mkdirSync(directory, { recursive: true });
  const target = path.join(directory, 'pre-migration-3.sqlite');
  if (existsSync(target)) return;
  db.exec(`VACUUM INTO '${target.replaceAll("'", "''")}'`);
}

function upgradeDraftsToV2(db: DatabaseSync) {
  const rows = db.prepare('SELECT id,workspace_id,draft_json,writing_json FROM itineraries WHERE schema_version=?').all(LEGACY_SCHEMA_VERSION) as Array<{ id: string; workspace_id: string; draft_json: string; writing_json: string }>;
  if (!rows.length) return;
  const profiles = new Map<string, unknown>();
  const warningCodes: Record<string, string[]> = {};
  const updateDraft = db.prepare('UPDATE itineraries SET draft_json=?,writing_json=?,schema_version=? WHERE id=?');
  for (const row of rows) {
    let draft: unknown;
    try { draft = JSON.parse(String(row.draft_json)); } catch { throw new Error(`itinerary ${row.id} holds unreadable draft JSON`); }
    if (!profiles.has(row.workspace_id)) {
      const profileRow = db.prepare('SELECT profile_json FROM workspaces WHERE id=?').get(row.workspace_id) as { profile_json: string } | undefined;
      profiles.set(row.workspace_id, profileRow ? JSON.parse(profileRow.profile_json) : {});
    }
    const upgraded = upgradeV1ToV2(draft, profiles.get(row.workspace_id) as Record<string, unknown>);
    const checked = validateDraft(upgraded.value);
    if (!checked.ok) {
      const reasons = [...new Set(checked.errors.map((error) => `${error.code}@${error.path}`))].slice(0, 5).join(', ');
      throw new Error(`itinerary ${row.id} cannot be upgraded to ${SCHEMA_VERSION}: ${reasons}`);
    }
    let existingWriting: any;
    try { existingWriting = JSON.parse(row.writing_json); } catch { existingWriting = { brief: '', notes: [] }; }
    const mergedNotes = [...(existingWriting.notes || []), ...upgraded.notes];
    let finalNotes = mergedNotes.slice(0, 100);
    if (mergedNotes.length > 100) {
      const collapsed = mergedNotes.map((n: any) => `[${n.targetId}] ${n.text}`).join('\n').slice(0, 4000);
      finalNotes = [{ targetId: 'itinerary', text: collapsed }];
      db.prepare('INSERT OR REPLACE INTO app_meta(key,value) VALUES(?,?)').run(`migration3_notes_collapsed_${row.id}`, 'NOTES_TRUNCATED');
    }
    const updatedWriting = { brief: existingWriting.brief || '', notes: finalNotes };
    updateDraft.run(JSON.stringify(checked.value), JSON.stringify(updatedWriting), SCHEMA_VERSION, row.id);
    warningCodes[row.id] = [...new Set(upgraded.warnings.map((warning) => warning.code))].sort();
  }
  db.prepare('INSERT OR REPLACE INTO app_meta(key,value) VALUES(?,?)').run('migration3_warnings', JSON.stringify(warningCodes));
}

export const MIGRATIONS: Migration[] = [
  { version: 1, name: 'core-schema', up: (db) => db.exec(CORE_SCHEMA_DDL) },
  { version: 2, name: 'ai-schema', up: (db) => db.exec(AI_SCHEMA_DDL) },
  { version: 3, name: 'guide-centric-schema-web-2.0.0', before: backupBeforeV2Upgrade, up: (db) => upgradeDraftsToV2(db) }
];

export function runMigrations(db: DatabaseSync, context: MigrationContext, migrations: Migration[] = MIGRATIONS) {
  db.exec('CREATE TABLE IF NOT EXISTS migrations (version INTEGER PRIMARY KEY)');
  const applied = new Set((db.prepare('SELECT version FROM migrations').all() as Array<{ version: number }>).map((row) => Number(row.version)));
  for (const migration of [...migrations].sort((left, right) => left.version - right.version)) {
    if (applied.has(migration.version)) continue;
    try {
      migration.before?.(db, context);
      db.exec('BEGIN IMMEDIATE');
      try {
        migration.up(db, context);
        db.prepare('INSERT INTO migrations(version) VALUES(?)').run(migration.version);
        db.exec('COMMIT');
      } catch (cause) {
        try { db.exec('ROLLBACK'); } catch { /* The transaction may already be closed. */ }
        throw cause;
      }
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : String(cause);
      throw new Error(`Database migration ${migration.version} (${migration.name}) failed and was rolled back: ${detail}. A pre-migration copy, when one was needed, is in ${path.join(context.dataDir, 'backups')}.`, { cause });
    }
  }
}

function encodeCursor(updatedAt: string, id: string) { return Buffer.from(`${updatedAt}|${id}`, 'utf8').toString('base64url'); }
function decodeCursor(cursor: string): { updatedAt: string; id: string } | null {
  const text = Buffer.from(cursor, 'base64url').toString('utf8');
  const split = text.indexOf('|');
  if (split <= 0 || split === text.length - 1 || encodeCursor(text.slice(0, split), text.slice(split + 1)) !== cursor) return null;
  return { updatedAt: text.slice(0, split), id: text.slice(split + 1) };
}

export function openStore({ dataDir }: StoreOptions) {
  mkdirSync(dataDir, { recursive: true });
  const db = new DatabaseSync(path.join(dataDir, 'engine.sqlite'));
  db.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=3000;');
  try {
    runMigrations(db, { dataDir });
    db.exec(AI_SCHEMA_DDL);
    recoverInterruptedAiOperations(db);
  } catch (cause) { db.close(); throw cause; }
  const now = new Date().toISOString();
  const savedWorkspaceId = db.prepare('SELECT value FROM app_meta WHERE key=?').get('workspace_id')?.value;
  const existingWorkspace = db.prepare('SELECT id FROM workspaces ORDER BY created_at LIMIT 1').get()?.id;
  const workspaceId = String(savedWorkspaceId || existingWorkspace || randomUUID());
  db.prepare('INSERT OR IGNORE INTO app_meta(key,value) VALUES(?,?)').run('workspace_id', workspaceId);
  db.prepare(`INSERT OR IGNORE INTO workspaces(id,profile_json,revision,created_at,updated_at)
    VALUES(?,?,1,?,?)`).run(workspaceId, JSON.stringify({ agencyName: '', agencyContact: '', agencyLogoAssetId: null }), now, now);

  function parse<T>(value: unknown): T { return JSON.parse(String(value)) as T; }
  function workspace() {
    const row = db.prepare('SELECT profile_json,revision,updated_at FROM workspaces WHERE id=?').get(workspaceId) as { profile_json: string; revision: number; updated_at: string };
    return { id: workspaceId, profile: parse(row.profile_json), revision: row.revision, updatedAt: row.updated_at };
  }
  function updateProfile(profile: unknown, expectedRevision: number) {
    const now = new Date().toISOString();
    const result = db.prepare('UPDATE workspaces SET profile_json=?,revision=revision+1,updated_at=? WHERE id=? AND revision=?')
      .run(JSON.stringify(profile), now, workspaceId, expectedRevision);
    return Number(result.changes) === 1;
  }
  function mapItinerary(row: Record<string, unknown>): ItineraryRecord {
    return { id: String(row.id), revision: Number(row.revision), schemaVersion: String(row.schema_version), draftContent: parse(row.draft_json), languageContext: parse(row.language_json), writingContext: parse(row.writing_json), createdAt: String(row.created_at), updatedAt: String(row.updated_at) };
  }
  function getItinerary(id: string) {
    const row = db.prepare('SELECT * FROM itineraries WHERE workspace_id=? AND id=?').get(workspaceId, id) as Record<string, unknown> | undefined;
    return row ? mapItinerary(row) : null;
  }
  function schemaVersionOf(content: unknown) {
    const declared = (content as { schemaVersion?: unknown } | null)?.schemaVersion;
    return typeof declared === 'string' ? declared : SCHEMA_VERSION;
  }
  function createItinerary(content: unknown, language: unknown, writing: unknown) {
    const id = randomUUID(); const now = new Date().toISOString();
    db.prepare('INSERT INTO itineraries VALUES(?,?,?,1,?,?,?,?,?)').run(id, workspaceId, schemaVersionOf(content), JSON.stringify(content), JSON.stringify(language), JSON.stringify(writing), now, now);
    return getItinerary(id)!;
  }
  function updateItinerary(id: string, expectedRevision: number, content: unknown, language: unknown, writing: unknown) {
    const now = new Date().toISOString();
    const result = db.prepare('UPDATE itineraries SET revision=revision+1,schema_version=?,draft_json=?,language_json=?,writing_json=?,updated_at=? WHERE workspace_id=? AND id=? AND revision=?')
      .run(schemaVersionOf(content), JSON.stringify(content), JSON.stringify(language), JSON.stringify(writing), now, workspaceId, id, expectedRevision);
    return Number(result.changes) === 1 ? getItinerary(id) : null;
  }
  /** Newest-updated first. Returns null when the supplied cursor is not one this store issued. */
  function listItineraries(cursor: string | null, limit: number): { items: ItineraryListItem[]; nextCursor: string | null } | null {
    const position = cursor ? decodeCursor(cursor) : null;
    if (cursor && !position) return null;
    const rows = (position
      ? db.prepare('SELECT id,revision,draft_json,updated_at FROM itineraries WHERE workspace_id=? AND (updated_at<? OR (updated_at=? AND id<?)) ORDER BY updated_at DESC, id DESC LIMIT ?').all(workspaceId, position.updatedAt, position.updatedAt, position.id, limit + 1)
      : db.prepare('SELECT id,revision,draft_json,updated_at FROM itineraries WHERE workspace_id=? ORDER BY updated_at DESC, id DESC LIMIT ?').all(workspaceId, limit + 1)) as Array<Record<string, unknown>>;
    const page = rows.slice(0, limit);
    const items = page.map((row) => {
      const draft = parse<{ trip?: { mode?: string; title?: string } }>(row.draft_json);
      return { id: String(row.id), revision: Number(row.revision), mode: String(draft.trip?.mode ?? ''), title: String(draft.trip?.title ?? ''), updatedAt: String(row.updated_at) };
    });
    const last = page.at(-1);
    return { items, nextCursor: rows.length > limit && last ? encodeCursor(String(last.updated_at), String(last.id)) : null };
  }
  function createAsset(asset: Omit<AssetRecord, 'id' | 'createdAt'>, storageKey: string) {
    const id = randomUUID(); const createdAt = new Date().toISOString();
    db.prepare('INSERT INTO assets VALUES(?,?,?,?,?,?,?,?,?)').run(id, workspaceId, storageKey, asset.mime, asset.bytes, asset.width, asset.height, asset.filename, createdAt);
    return { id, ...asset, createdAt };
  }
  function listAssets(cursor: string | null, limit: number) {
    const rows = cursor
      ? db.prepare('SELECT id,mime,bytes,width,height,filename,created_at FROM assets WHERE workspace_id=? AND id<? ORDER BY id DESC LIMIT ?').all(workspaceId, cursor, limit)
      : db.prepare('SELECT id,mime,bytes,width,height,filename,created_at FROM assets WHERE workspace_id=? ORDER BY id DESC LIMIT ?').all(workspaceId, limit);
    return (rows as Array<Record<string, unknown>>).map((row) => ({ id: String(row.id), mime: String(row.mime), bytes: Number(row.bytes), width: Number(row.width), height: Number(row.height), filename: String(row.filename), createdAt: String(row.created_at) }));
  }
  function getAsset(id: string) {
    return db.prepare('SELECT id,storage_key,mime,bytes,width,height,filename,created_at FROM assets WHERE workspace_id=? AND id=?').get(workspaceId, id) as (Record<string, unknown> & { storage_key: string }) | undefined;
  }
  function storageKeys() { return (db.prepare('SELECT storage_key FROM assets').all() as Array<{ storage_key: string }>).map((row) => row.storage_key); }
  return { db, dataDir, workspaceId, workspace, updateProfile, getItinerary, createItinerary, updateItinerary, listItineraries, createAsset, listAssets, getAsset, storageKeys, close: () => db.close() };
}
