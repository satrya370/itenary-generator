import type { DatabaseSync } from 'node:sqlite';

export function ensureAiSchema(db: DatabaseSync) {
  db.exec(`BEGIN IMMEDIATE;
    CREATE TABLE IF NOT EXISTS ai_operations (
      operation_id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id),
      itinerary_id TEXT NOT NULL REFERENCES itineraries(id) ON DELETE CASCADE,
      operation_kind TEXT NOT NULL CHECK(operation_kind IN ('overview','description')),
      target_kind TEXT, target_id TEXT, expected_revision INTEGER NOT NULL, fingerprint TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('running','completed','failed','stale','uncertain')),
      attempts INTEGER NOT NULL DEFAULT 0, reserved_usd REAL NOT NULL, actual_usd REAL NOT NULL DEFAULT 0,
      prompt_tokens INTEGER NOT NULL DEFAULT 0, completion_tokens INTEGER NOT NULL DEFAULT 0,
      suggestion_text TEXT, error_code TEXT, day_utc TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS ai_operations_workspace_created ON ai_operations(workspace_id,created_at DESC);
    CREATE INDEX IF NOT EXISTS ai_operations_workspace_status ON ai_operations(workspace_id,status);
    CREATE TABLE IF NOT EXISTS ai_daily_usage (
      workspace_id TEXT NOT NULL REFERENCES workspaces(id), day_utc TEXT NOT NULL,
      accepted_operations INTEGER NOT NULL DEFAULT 0, reserved_usd REAL NOT NULL DEFAULT 0,
      actual_usd REAL NOT NULL DEFAULT 0, PRIMARY KEY(workspace_id,day_utc)
    );
    CREATE TABLE IF NOT EXISTS ai_live_budget (
      id INTEGER PRIMARY KEY CHECK(id=1), limit_usd REAL NOT NULL, committed_usd REAL NOT NULL DEFAULT 0
    );
    INSERT OR IGNORE INTO ai_live_budget(id,limit_usd,committed_usd) VALUES(1,2,0);
    CREATE TABLE IF NOT EXISTS ai_live_budget_entries (
      operation_id TEXT PRIMARY KEY REFERENCES ai_operations(operation_id) ON DELETE CASCADE,
      reserved_usd REAL NOT NULL, actual_usd REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL CHECK(status IN ('reserved','settled','released','uncertain')),
      updated_at TEXT NOT NULL
    );
    INSERT OR IGNORE INTO migrations(version) VALUES(2);`);
  const now = new Date().toISOString();
  const interrupted = Number((db.prepare("SELECT count(*) AS count FROM ai_operations WHERE status='running'").get() as { count: number }).count);
  if (interrupted) {
    db.prepare(`UPDATE ai_daily_usage SET
      reserved_usd=max(0,reserved_usd-COALESCE((SELECT sum(reserved_usd) FROM ai_operations o WHERE o.workspace_id=ai_daily_usage.workspace_id AND o.day_utc=ai_daily_usage.day_utc AND o.status='running'),0)),
      actual_usd=actual_usd+COALESCE((SELECT sum(reserved_usd) FROM ai_operations o WHERE o.workspace_id=ai_daily_usage.workspace_id AND o.day_utc=ai_daily_usage.day_utc AND o.status='running'),0)`)
      .run();
    db.prepare("UPDATE ai_operations SET status='uncertain',actual_usd=reserved_usd,error_code='AI_OPERATION_INTERRUPTED',updated_at=? WHERE status='running'").run(now);
    db.prepare("UPDATE ai_live_budget_entries SET status='uncertain',actual_usd=reserved_usd,updated_at=? WHERE status='reserved'").run(now);
  }
  db.exec('COMMIT');
}
