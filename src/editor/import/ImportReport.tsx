import React, { useEffect, useState } from 'react';
import { api, type ImportOperationDto, type ImportParseDto, type RecordDto, type ImportReportDto } from '../../api/client.js';
import { buttonClass } from '../fields.js';
import { importCopy } from './copy.js';

/** Panel shown at the top of an imported draft: what was filled, what is still missing, source text, undo. */
export function ImportReport({ operation, record, dirty, labelFor, onJump, onUndo, onClose, onResolved, busy }: {
  operation: ImportOperationDto; record: RecordDto; dirty: boolean; labelFor: (path: string) => string; onJump: (path: string) => void; onUndo: () => void; onClose: () => void; onResolved: (record: RecordDto, report: ImportReportDto) => void; busy: boolean;
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
      <p className="text-slate-700">{usage.aiUsed ? `AI dipakai · ${usage.promptTokens === null || usage.completionTokens === null ? 'jumlah token tidak diketahui' : `${(usage.promptTokens + usage.completionTokens).toLocaleString('id-ID')} token`} · ${usage.actualUsd === null ? 'biaya tidak diketahui' : `US$${usage.actualUsd.toFixed(4)}`}${report.aiBatches === undefined ? '' : ` · ${report.aiBatches} batch, ${report.aiAttempts ?? 0} percobaan`}` : importCopy.reportUsageNone}</p>
      {report.review ? <ReviewConflicts operation={operation} record={record} dirty={dirty} busy={busy} onResolved={onResolved} /> : <p className="text-slate-700">Laporan lama: bukti kandidat tidak tersedia; periksa teks sumber secara manual.</p>}

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

function ReviewConflicts({ operation, record, dirty, busy, onResolved }: { operation: ImportOperationDto; record: RecordDto; dirty: boolean; busy: boolean; onResolved: (record: RecordDto, report: ImportReportDto) => void }) {
  const [preview, setPreview] = useState<ImportParseDto | null>(null);
  const [source, setSource] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [manual, setManual] = useState<Record<string, string>>({});
  const candidates = operation.report?.review?.candidates ?? [];
  useEffect(() => {
    let alive = true;
    if (candidates.some((item) => item.status === 'pending') || (operation.report?.evidence?.omittedLineIndexes?.length ?? 0) > 0) {
      Promise.all([api.getImportSource(operation.sourceId), api.parseImport(operation.sourceId, record.draftContent.trip.mode)])
        .then(([detail, result]) => { if (alive) { setSource(detail.text); setPreview(result); } })
        .catch((caught) => { if (alive) setError((caught as Error).message); });
    }
    return () => { alive = false; };
  }, [operation.sourceId, operation.operationId, record.draftContent.trip.mode]);
  async function resolve(candidateId: string, action: 'select' | 'edit' | 'ignore', line?: number) {
    if (dirty || busy || pending) return;
    setPending(true); setError(null);
    try {
      const result = await api.resolveImport(operation.operationId, { expectedRevision: record.revision, candidateId, action, ...(line === undefined ? {} : { line }), ...(action === 'edit' ? { value: manual[candidateId] ?? '' } : {}) });
      onResolved(result.itinerary, result.report);
    } catch (caught) { setError((caught as Error).message); }
    finally { setPending(false); }
  }
  const fields: Record<string, string> = { destination: record.draftContent.trip.destination, country: record.draftContent.trip.country, date: record.draftContent.trip.startDate ?? '', guide: record.draftContent.guide.name ?? '', phone: record.draftContent.guide.phone ?? '', 'meeting.place': record.draftContent.meeting.place ?? '', 'meeting.mapsUrl': record.draftContent.meeting.mapsUrl ?? '' };
  return <div className="space-y-3 rounded border border-amber-300 bg-amber-50 p-3">
    <h4 className="font-semibold">Perlu review</h4>
    {dirty && <p role="status">Simpan atau batalkan perubahan draf sebelum menyelesaikan review.</p>}
    {error && <p role="alert" className="text-red-800">{error}</p>}
    {operation.report?.review?.unsupported ? <p>{operation.report.review.unsupported} bagian lain belum memiliki kandidat aman; periksa sumber dan edit secara manual.</p> : null}
    {!!operation.report?.review?.rejectedProposals?.length && <details><summary className="cursor-pointer underline">Usulan AI yang ditolak (belum diverifikasi)</summary><ul className="space-y-2">{operation.report.review.rejectedProposals.map((item) => <li key={item.id} className="break-words rounded border border-amber-200 p-2"><p>{item.path} · {item.reasonCode}</p>{item.value ? <p>Usulan, bukan fakta: {item.value}</p> : <p>Isi usulan tidak lagi tersedia.</p>}{item.quote && <p>Kutipan yang diklaim AI, belum tentu cocok: <q>{item.quote}</q></p>}{!!item.lineIndexes.length && <p>Baris yang mungkin terkait: {item.lineIndexes.map((line) => line + 1).join(', ')}</p>}<p>Periksa sumber dan ubah draf secara manual bila sesuai; usulan ini tidak dapat diterapkan otomatis.</p></li>)}</ul></details>}
    {!!operation.report?.evidence?.omittedLineIndexes?.length && <details><summary className="cursor-pointer underline">Baris yang tidak diproses</summary><ul className="list-disc pl-5">{operation.report.evidence.omittedLineIndexes.map((line) => {
      const pageNumber = preview?.unconsumed.find((item) => item.index === line)?.pageNumber;
      return <li key={line}>{pageNumber ? `Halaman ${pageNumber}, ` : ''}baris {line + 1}{source ? `: ${source.split('\n')[line] ?? ''}` : ''}</li>;
    })}</ul></details>}
    {candidates.length === 0 && <p>Tidak ada konflik scalar yang dapat dipilih.</p>}
    {candidates.map((candidate, index) => {
      const sourceIndex = Number(candidate.id.replace(/^conflict-/, '')) - 1;
      const conflict = preview?.conflicts?.[sourceIndex];
      const valid = conflict?.path === candidate.path && JSON.stringify(conflict.occurrences.map((item) => item.line)) === JSON.stringify(candidate.lines);
      return <section key={candidate.id} className="space-y-2 rounded border border-amber-200 bg-white p-3" aria-label={`Konflik ${index + 1}`}>
        <h5 className="font-semibold">{index + 1}. {({ destination: 'Destinasi', country: 'Negara', date: 'Tanggal', guide: 'Nama guide', phone: 'Nomor guide', 'meeting.place': 'Titik kumpul', 'meeting.mapsUrl': 'Link peta' } as Record<string, string>)[candidate.path] ?? candidate.path} — {candidate.status === 'pending' ? 'belum diselesaikan' : candidate.status === 'ignored' ? 'diabaikan' : 'diselesaikan'}</h5>
        <p>Nilai draf saat ini: {fields[candidate.path] || '(kosong)'}</p>
        {candidate.status === 'pending' && valid && conflict && <>
          <p>{conflict.message}</p>
          <ul className="space-y-1">{conflict.occurrences.map((item) => <li key={item.line}>{item.pageNumber ? `Halaman ${item.pageNumber}, ` : ''}baris {item.line}: <q>{source?.split('\n')[item.line - 1] ?? item.value}</q> <button type="button" className={buttonClass} disabled={busy || dirty || pending} onClick={() => void resolve(candidate.id, 'select', item.line)}>Pilih {item.value}</button></li>)}</ul>
          <label className="block">Nilai manual <input className="ml-2 rounded border border-slate-400 p-1" value={manual[candidate.id] ?? ''} onChange={(event) => setManual((prior) => ({ ...prior, [candidate.id]: event.target.value }))} /></label>
          <div className="flex flex-wrap gap-2"><button type="button" className={buttonClass} disabled={busy || dirty || pending || !manual[candidate.id]?.trim()} onClick={() => void resolve(candidate.id, 'edit')}>Simpan nilai manual</button><button type="button" className={buttonClass} disabled={busy || dirty || pending} onClick={() => void resolve(candidate.id, 'ignore')}>Abaikan</button></div>
        </>}
        {candidate.status === 'pending' && !valid && !error && <p>Memuat bukti sumber; jika tidak cocok, kandidat tidak dapat diterapkan.</p>}
      </section>;
    })}
  </div>;
}
