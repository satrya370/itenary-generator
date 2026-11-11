/** Import source storage (CP030). Source text lives in <dataDir>/imports/<id>.txt, never in this table. */
export const IMPORT_SCHEMA_DDL = `
CREATE TABLE IF NOT EXISTS import_sources (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('text','pdf')),
  sha256 TEXT NOT NULL,
  byte_size INTEGER NOT NULL,
  page_count INTEGER NOT NULL,
  char_count INTEGER NOT NULL,
  language_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
`;

/** Import operations ledger (CP031). Separate from the writing-AI ledger; no cost ceiling (D30-3). */
export const IMPORT_OPERATIONS_DDL = `
CREATE TABLE IF NOT EXISTS import_operations (
  operation_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  itinerary_id TEXT,
  target TEXT NOT NULL CHECK (target IN ('new','overwrite')),
  mode TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('running','completed','failed','uncertain')),
  previous_revision INTEGER,
  result_revision INTEGER,
  previous_draft_json TEXT,
  previous_language_json TEXT,
  previous_writing_json TEXT,
  ai_used INTEGER NOT NULL DEFAULT 0,
  prompt_tokens INTEGER,
  completion_tokens INTEGER,
  actual_usd REAL,
  report_json TEXT,
  error_code TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  undone_at TEXT
);
CREATE INDEX IF NOT EXISTS import_operations_itinerary ON import_operations(workspace_id, itinerary_id, created_at);
`;
