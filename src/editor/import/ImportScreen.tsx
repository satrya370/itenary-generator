import React, { useState } from 'react';
import { api, type ImportApplyDto, type ImportParseDto, type ImportSourceDto } from '../../api/client.js';
import type { ItineraryMode } from '../../contracts/types.js';
import { buttonClass, contentLanguages, inputClass, primaryClass } from '../fields.js';
import { modeCopy } from '../labels.js';
import { importCopy } from './copy.js';

const MODES: ItineraryMode[] = ['half_day', 'full_day', 'multi_day', 'destination_guide'];
const PDF_LIMIT = 10 * 1024 * 1024;

function failureMessage(caught: unknown): string {
  const body = (caught as { body?: { message?: string } }).body;
  return body?.message || (caught as Error).message || 'Import gagal.';
}

/** The import screen. Reads text or a text-layer PDF, shows what code found, then creates a draft or overwrites the open one. */
export function ImportScreen({ target, draftMode, draftId, draftRevision, aiActive, onCancel, onDone }: {
  target: 'new' | 'overwrite'; draftMode: ItineraryMode | null; draftId: string | null; draftRevision: number | null; aiActive: boolean;
  onCancel: () => void; onDone: (result: ImportApplyDto & { target: 'new' | 'overwrite' }) => void;
}) {
  const [tab, setTab] = useState<'paste' | 'pdf'>('paste');
  const [text, setText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [intake, setIntake] = useState<ImportSourceDto | null>(null);
  const [mode, setMode] = useState<ItineraryMode>(draftMode ?? 'half_day');
  const [preview, setPreview] = useState<ImportParseDto | null>(null);
  const [outputLanguage, setOutputLanguage] = useState<string>('auto');
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState<null | 'intake' | 'preview' | 'apply'>(null);
  const [error, setError] = useState<string | null>(null);

  const effectiveMode = target === 'overwrite' ? (draftMode ?? 'half_day') : mode;
  const detected = intake?.languageProposal.status === 'resolved' ? intake.languageProposal.locale : null;
  const chosenLanguage = outputLanguage === 'auto' ? detected : outputLanguage;

  async function readSource() {
    setError(null); setPreview(null); setConfirming(false);
    setBusy('intake');
    try {
      const source = tab === 'paste' ? await api.createImportSource(text) : await api.createImportSource(file!);
      setIntake(source);
      setOutputLanguage(source.languageProposal.status === 'resolved' ? 'auto' : 'auto');
    } catch (caught) { setIntake(null); setError(failureMessage(caught)); }
    finally { setBusy(null); }
  }

  async function readPreview() {
    if (!intake) return;
    setError(null); setBusy('preview');
    try { setPreview(await api.parseImport(intake.sourceId, effectiveMode)); }
    catch (caught) { setError(failureMessage(caught)); }
    finally { setBusy(null); }
  }

  function sectionsToReplace(): string[] {
    if (!preview) return [];
    const lines: string[] = [];
    if (preview.fields.days.length) lines.push(`Jadwal (${preview.fields.days.length} hari, ${preview.fields.days.reduce((n, d) => n + d.activities.length, 0)} aktivitas)`);
    if (preview.fields.trip.title || preview.fields.trip.destination) lines.push('Judul dan tujuan trip');
    if (preview.fields.guide.name || preview.fields.guide.phone) lines.push('Guide');
    for (const [key, items] of Object.entries(preview.fields.lists)) if (items.length) lines.push(`${importCopy.sections[key] ?? key} (${items.length})`);
    if (preview.fields.emergencyContacts.length) lines.push(`${importCopy.sections.emergencyContacts} (${preview.fields.emergencyContacts.length})`);
    return lines;
  }

  async function run() {
    if (!intake) return;
    if (target === 'overwrite' && !confirming) { setConfirming(true); return; }
    setError(null); setBusy('apply');
    try {
      const body: Record<string, unknown> = {
        operationId: crypto.randomUUID(), target,
        ...(target === 'new' ? { mode } : { itineraryId: draftId, expectedRevision: draftRevision }),
        ...(chosenLanguage ? { outputLanguage: chosenLanguage } : {})
      };
      const result = await api.applyImport(intake.sourceId, body);
      onDone({ ...result, target });
    } catch (caught) { setError(failureMessage(caught)); setConfirming(false); }
    finally { setBusy(null); }
  }

  const replaced = confirming ? sectionsToReplace() : [];
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">{importCopy.title}</h2>
          <p className="mt-1 text-sm text-slate-600">{target === 'new' ? 'Hasilnya menjadi draf baru.' : 'Hasilnya menggantikan bagian yang ada di dokumen pada draf ini.'}</p>
        </div>
        <button type="button" className={buttonClass} onClick={onCancel} disabled={busy !== null}>{importCopy.back}</button>
      </div>

      {!aiActive && <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">{importCopy.aiOff}</p>}

      <div role="tablist" aria-label="Sumber import" className="flex gap-2">
        {(['paste', 'pdf'] as const).map((item) => (
          <button key={item} role="tab" type="button" aria-selected={tab === item} className={`${buttonClass} ${tab === item ? 'border-teal-700 bg-teal-50 font-semibold' : ''}`} onClick={() => { setTab(item); setIntake(null); setPreview(null); setError(null); }}>
            {item === 'paste' ? importCopy.tabPaste : importCopy.tabPdf}
          </button>
        ))}
      </div>

      {tab === 'paste' ? (
        <div className="space-y-2">
          <p className="text-sm text-slate-600">{importCopy.pasteHint}</p>
          <label htmlFor="import-text" className="sr-only">Teks itinerary</label>
          <textarea id="import-text" rows={10} maxLength={120000} value={text} onChange={(event) => { setText(event.target.value); setIntake(null); }} className={inputClass} />
          <button type="button" className={primaryClass} disabled={busy !== null || !text.trim()} onClick={readSource}>{busy === 'intake' ? importCopy.readText + '…' : importCopy.readText}</button>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-sm text-slate-600">{importCopy.pdfHint}</p>
          <input id="import-pdf" type="file" accept="application/pdf" className="block w-full text-sm" onChange={(event) => { const picked = event.target.files?.[0] ?? null; setIntake(null); setPreview(null); setError(picked && picked.size > PDF_LIMIT ? 'PDF terlalu besar (maksimal 10 MB).' : null); setFile(picked && picked.size <= PDF_LIMIT ? picked : null); }} />
          <button type="button" className={primaryClass} disabled={busy !== null || !file} onClick={readSource}>{busy === 'intake' ? importCopy.readPdf + '…' : importCopy.readPdf}</button>
        </div>
      )}

      {error && <p role="alert" className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-900">{error}</p>}

      {intake && (
        <section aria-label="Hasil baca sumber" className="space-y-4 rounded-lg border border-slate-200 p-4">
          <p className="text-sm font-medium text-slate-800">{importCopy.pagesChars(intake.pageCount, intake.charCount)}</p>
          {target === 'new' ? (
            <div className="space-y-2">
              <label htmlFor="import-mode" className="block text-sm font-medium">{importCopy.modeLabel}</label>
              <select id="import-mode" className={inputClass} value={mode} onChange={(event) => { setMode(event.target.value as ItineraryMode); setPreview(null); }}>
                {MODES.map((item) => <option key={item} value={item}>{modeCopy[item]?.title ?? item}</option>)}
              </select>
            </div>
          ) : (
            <p className="text-sm text-slate-600">{importCopy.modeLocked} <strong>{modeCopy[effectiveMode]?.title ?? effectiveMode}</strong></p>
          )}
          <div className="space-y-2">
            <label htmlFor="import-language" className="block text-sm font-medium">{importCopy.languageLabel}</label>
            <select id="import-language" className={inputClass} value={outputLanguage} onChange={(event) => setOutputLanguage(event.target.value)}>
              <option value="auto">{detected ? `${importCopy.languageDetected}: ${contentLanguages.find((item) => item.value === detected)?.label ?? detected}` : importCopy.languageDetected}</option>
              {contentLanguages.filter((item) => item.value !== 'auto').map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </div>
          {!preview && <button type="button" className={buttonClass} disabled={busy !== null} onClick={readPreview}>{busy === 'preview' ? importCopy.previewButton + '…' : importCopy.previewButton}</button>}
        </section>
      )}

      {preview && (
        <section aria-label={importCopy.previewTitle} className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm">
          <h3 className="font-semibold">{importCopy.previewTitle}</h3>
          <p>{preview.fields.days.length ? importCopy.previewDays(preview.fields.days.length, preview.fields.days.reduce((n, d) => n + d.activities.length, 0)) : importCopy.previewNone}</p>
          {sectionsToReplace().length > 0 && <p><span className="font-medium">{importCopy.previewSections}:</span> {sectionsToReplace().join('; ')}</p>}
          {preview.notes.map((note, index) => <p key={index} className="text-slate-700">{note}</p>)}
          {preview.unconsumed.length > 0 && <p className="text-slate-600">{preview.unconsumed.length} baris lain akan dibaca otomatis{aiActive ? '' : ' (AI tidak aktif, dibiarkan kosong)'}.</p>}
        </section>
      )}

      {confirming && (
        <section role="alertdialog" aria-modal="false" aria-labelledby="overwrite-title" className="space-y-3 rounded-lg border border-amber-400 bg-amber-50 p-4">
          <h3 id="overwrite-title" className="font-semibold text-amber-950">{importCopy.overwriteConfirmTitle}</h3>
          <p className="text-sm text-amber-950">{importCopy.overwriteConfirmBody}</p>
          <ul className="list-disc pl-5 text-sm text-amber-950">{replaced.length ? replaced.map((item) => <li key={item}>{item}</li>) : <li>Tidak ada bagian yang terbaca; draf tidak berubah.</li>}</ul>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={primaryClass} onClick={run} disabled={busy !== null}>{importCopy.overwriteConfirmYes}</button>
            <button type="button" className={buttonClass} onClick={() => setConfirming(false)} disabled={busy !== null}>{importCopy.cancel}</button>
          </div>
        </section>
      )}

      {intake && !confirming && (
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className={primaryClass} disabled={busy !== null || !intake} onClick={run}>{busy === 'apply' ? importCopy.processing : importCopy.process}</button>
          {busy === 'apply' && aiActive && <span role="status" className="text-sm text-slate-600">{importCopy.processingAi}</span>}
        </div>
      )}
    </div>
  );
}
