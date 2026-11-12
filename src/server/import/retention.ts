import { rm } from 'node:fs/promises';
import path from 'node:path';
import type { openStore } from '../store.js';

/** Source text retention (A10). Removes the stored text of sources older than `days`; the source row and the import ledger stay.
 * `days` of 0 keeps everything. Only files inside <dataDir>/imports are touched. */
export async function sweepImportSources(store: ReturnType<typeof openStore>, dataDir: string, days: number, now = new Date()): Promise<number> {
  if (!Number.isInteger(days) || days <= 0) return 0;
  const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
  const rows = store.db.prepare('SELECT id FROM import_sources WHERE workspace_id=? AND created_at<?').all(store.workspaceId, cutoff) as Array<{ id: string }>;
  for (const row of rows) {
    if (!/^[A-Za-z0-9-]+$/.test(row.id)) continue;
    await rm(path.join(dataDir, 'imports', `${row.id}.txt`), { force: true });
  }
  return rows.length;
}

export function importRetentionDays(raw: string | undefined): number {
  const parsed = Number(raw ?? 30);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : 30;
}
