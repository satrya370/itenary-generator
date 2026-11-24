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
      for (const part of [report, report?._replay?.report]) changed = redactExpiredEvidence(part) || changed;
      if (changed) store.db.prepare('UPDATE import_operations SET report_json=? WHERE operation_id=? AND workspace_id=?').run(JSON.stringify(report), item.operation_id, store.workspaceId);
    }
    await Promise.all([
      rm(path.join(dataDir, 'imports', `${row.id}.txt`), { force: true }),
      rm(path.join(dataDir, 'imports', `${row.id}.layout.json`), { force: true })
    ]);
  }
  return rows.length;
}

/** Strip source-derived text from every persisted report copy while retaining safe paths, IDs, decisions and accounting. */
function redactExpiredEvidence(part: any): boolean {
  if (!part || typeof part !== 'object') return false;
  let changed = false;
  if (part.sourceExpired !== true) { part.sourceExpired = true; changed = true; }
  if (part.review && typeof part.review === 'object') {
    if (part.review.sourceExpired !== true) { part.review.sourceExpired = true; changed = true; }
    if (Array.isArray(part.review.unknownLabels)) for (const label of part.review.unknownLabels) {
      if (!label || typeof label !== 'object') continue;
      if ('label' in label) { delete label.label; changed = true; }
      if ('value' in label) { delete label.value; changed = true; }
    }
    if (Array.isArray(part.review.rejectedProposals)) for (const candidate of part.review.rejectedProposals) {
      if (!candidate || typeof candidate !== 'object') continue;
      if ('value' in candidate) { delete candidate.value; changed = true; }
      if ('quote' in candidate) { delete candidate.quote; changed = true; }
      changed = redactDynamicPath(candidate) || changed;
    }
  }
  for (const reference of part.evidence?.accepted ?? []) {
    if (reference && typeof reference === 'object' && 'quote' in reference) { delete reference.quote; changed = true; }
    changed = redactDynamicPath(reference) || changed;
  }
  for (const reference of part.evidence?.rejected ?? []) changed = redactDynamicPath(reference) || changed;
  for (const skipped of part.skipped ?? []) changed = redactDynamicPath(skipped, true) || changed;
  // Human-readable parser/layout notes can include values both quoted and unquoted.
  // Keep safe structured reason codes above, but drop prose that cannot be reliably scrubbed.
  if (Array.isArray(part.notes) && part.notes.length) { part.notes = []; changed = true; }
  return changed;
}

function redactDynamicPath(entry: any, includeLabel = false): boolean {
  if (!entry || typeof entry !== 'object') return false;
  let changed = false;
  let dynamicTarget = false;
  for (const key of ['path']) {
    const value = entry[key];
    if (typeof value === 'string' && /^(?:activities|activityDetails)\[[^\]]+\]/.test(value)) {
      entry[key] = value.replace(/^(?:activities|activityDetails)\[[^\]]+\]/, 'activities[source-text-removed]');
      changed = true;
      dynamicTarget = true;
    }
  }
  if (includeLabel && typeof entry.label === 'string' && (dynamicTarget || /Aktivitas\s+"[^"\r\n]+"/.test(entry.label))) {
    entry.label = 'Aktivitas dari sumber (teks dihapus sesuai retensi)';
    changed = true;
  }
  return changed;
}

export function importRetentionDays(raw: string | undefined): number {
  const parsed = Number(raw ?? 30);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : 30;
}
