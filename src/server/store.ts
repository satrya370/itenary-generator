import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export interface StoreOptions { dataDir: string; }
export interface ItineraryRecord {
  id: string; revision: number; schemaVersion: string; draftContent: unknown;
  languageContext: unknown; writingContext: unknown; createdAt: string; updatedAt: string;
}
export interface AssetRecord { id: string; mime: string; bytes: number; width: number; height: number; filename: string; createdAt: string; }

export function openStore({ dataDir }: StoreOptions) {
  mkdirSync(dataDir, { recursive: true });
  const db = new DatabaseSync(path.join(dataDir, 'engine.sqlite'));
  db.exec(`PRAGMA foreign_keys=ON; PRAGMA busy_timeout=3000;
    CREATE TABLE IF NOT EXISTS migrations (version INTEGER PRIMARY KEY);
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
    INSERT OR IGNORE INTO migrations(version) VALUES (1),(2);`);
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
  function createItinerary(content: unknown, language: unknown, writing: unknown) {
    const id = randomUUID(); const now = new Date().toISOString();
    db.prepare(`INSERT INTO itineraries VALUES(?,?,?,1,?,?,?,?,?)`).run(id, workspaceId, 'web-1.0.0', JSON.stringify(content), JSON.stringify(language), JSON.stringify(writing), now, now);
    return getItinerary(id)!;
  }
  function updateItinerary(id: string, expectedRevision: number, content: unknown, language: unknown, writing: unknown) {
    const now = new Date().toISOString();
    const result = db.prepare(`UPDATE itineraries SET revision=revision+1,draft_json=?,language_json=?,writing_json=?,updated_at=? WHERE workspace_id=? AND id=? AND revision=?`)
      .run(JSON.stringify(content), JSON.stringify(language), JSON.stringify(writing), now, workspaceId, id, expectedRevision);
    return Number(result.changes) === 1 ? getItinerary(id) : null;
  }
  function listItineraries(cursor: string | null, limit: number) {
    const rows = cursor
      ? db.prepare('SELECT id,revision,draft_json,updated_at FROM itineraries WHERE workspace_id=? AND id<? ORDER BY id DESC LIMIT ?').all(workspaceId, cursor, limit)
      : db.prepare('SELECT id,revision,draft_json,updated_at FROM itineraries WHERE workspace_id=? ORDER BY id DESC LIMIT ?').all(workspaceId, limit);
    return (rows as Array<Record<string, unknown>>).map((row) => ({ id: String(row.id), revision: Number(row.revision), mode: (parse<{ brochure: { itineraryMode: string } }>(row.draft_json)).brochure.itineraryMode, title: parse<{ brochure: { tripTitle: string } }>(row.draft_json).brochure.tripTitle, updatedAt: String(row.updated_at) }));
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
