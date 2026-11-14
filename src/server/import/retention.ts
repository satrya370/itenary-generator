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
    // Older reports stored accepted source quotes inline. Remove those copies as
    // well as the source sidecars; line references and the draft remain intact.
    const reports = store.db.prepare('SELECT operation_id, report_json FROM import_operations WHERE workspace_id=? AND source_id=? AND report_json IS NOT NULL').all(store.workspaceId, row.id) as Array<{ operation_id: string; report_json: string }>;
    for (const item of reports) {
      let report: any;
      try { report = JSON.parse(item.report_json); } catch { continue; }
      let changed = false;
      for (const part of [report, report?._replay?.report]) {
        if (Array.isArray(part?.review?.rejectedProposals)) {
          for (const candidate of part.review.rejectedProposals) {
            if (candidate && typeof candidate === 'object') {
              if ('value' in candidate) { delete candidate.value; changed = true; }
              if ('quote' in candidate) { delete candidate.quote; changed = true; }
            }
          }
        }
        if (!Array.isArray(part?.evidence?.accepted)) continue;
        for (const reference of part.evidence.accepted) if (reference && typeof reference === 'object' && 'quote' in reference) { delete reference.quote; changed = true; }
      }
      if (changed) store.db.prepare('UPDATE import_operations SET report_json=? WHERE operation_id=? AND workspace_id=?').run(JSON.stringify(report), item.operation_id, store.workspaceId);
    }
    await Promise.all([
      rm(path.join(dataDir, 'imports', `${row.id}.txt`), { force: true }),
      rm(path.join(dataDir, 'imports', `${row.id}.layout.json`), { force: true })
    ]);
  }
  return rows.length;
}

export function importRetentionDays(raw: string | undefined): number {
  const parsed = Number(raw ?? 30);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : 30;
}
