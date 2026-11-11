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
