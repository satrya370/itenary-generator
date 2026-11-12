import React, { useState } from 'react';
import { api, type ImportOperationDto } from '../../api/client.js';
import { buttonClass } from '../fields.js';
import { importCopy } from './copy.js';

/** Panel shown at the top of an imported draft: what was filled, what is still missing, source text, undo. */
export function ImportReport({ operation, labelFor, onJump, onUndo, onClose, busy }: {
  operation: ImportOperationDto; labelFor: (path: string) => string; onJump: (path: string) => void; onUndo: () => void; onClose: () => void; busy: boolean;
}) {
  const [source, setSource] = useState<string | null>(null);
  const [sourceError, setSourceError] = useState<string | null>(null);
  const report = operation.report;
  if (!report) return null;

  async function toggleSource() {
    if (source !== null) { setSource(null); return; }
    setSourceError(null);
    try { setSource((await api.getImportSource(operation.sourceId)).text); }
    catch (caught) { setSourceError((caught as Error).message); }
  }

  const usage = operation.usage;
  return (
    <section aria-label={importCopy.reportTitle} className="mb-6 space-y-3 rounded-lg border border-teal-300 bg-teal-50 p-4 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="font-semibold text-teal-950">{importCopy.reportTitle}</h3>
        <button type="button" className={buttonClass} onClick={onClose}>{importCopy.dismiss}</button>
      </div>
      <p className="text-teal-950">{importCopy.reportFilled(report.filled.length)}</p>
      <p className="text-slate-700">{usage.aiUsed ? importCopy.reportUsageAi(Number(usage.promptTokens ?? 0) + Number(usage.completionTokens ?? 0), usage.actualUsd) : importCopy.reportUsageNone}</p>

      <div>
        <h4 className="font-medium">{importCopy.reportMissing}</h4>
        {report.missingRequired.length === 0 ? <p className="text-slate-700">{importCopy.reportNone}</p> : (
          <ul className="mt-1 list-disc pl-5">
            {report.missingRequired.map((path) => <li key={path}><button type="button" className="text-left underline underline-offset-2" onClick={() => onJump(path)}>{labelFor(path)}</button></li>)}
          </ul>
        )}
      </div>

      {report.skipped.length > 0 && (
        <div>
          <h4 className="font-medium">{importCopy.reportSkipped}</h4>
          <ul className="mt-1 list-disc pl-5 text-slate-700">{report.skipped.map((item, index) => <li key={`${item.path}-${index}`}>{item.label ?? item.path}: {item.message}</li>)}</ul>
        </div>
      )}
      {report.notes.length > 0 && (
        <div>
          <h4 className="font-medium">{importCopy.reportNotes}</h4>
          <ul className="mt-1 list-disc pl-5 text-slate-700">{report.notes.map((note, index) => <li key={index}>{note}</li>)}</ul>
        </div>
      )}

      {sourceError && <p role="alert" className="text-red-800">{sourceError}</p>}
      {source !== null && <pre aria-label="Teks sumber" className="max-h-96 overflow-auto whitespace-pre-wrap rounded-md border border-slate-300 bg-white p-3 text-xs">{source}</pre>}

      <div className="flex flex-wrap gap-2">
        <button type="button" className={buttonClass} onClick={toggleSource}>{source !== null ? importCopy.hideSource : importCopy.viewSource}</button>
        {operation.target === 'overwrite' && (
          operation.undoAvailable
            ? <button type="button" className={buttonClass} onClick={onUndo} disabled={busy}>{importCopy.undo}</button>
            : <span className="self-center text-slate-600">{importCopy.undoUnavailable}</span>
        )}
      </div>
    </section>
  );
}
