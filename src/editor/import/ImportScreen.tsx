import React, { useEffect, useRef, useState } from 'react';
import { api, type ImportApplyDto, type ImportParseDto, type ImportSourceDto } from '../../api/client.js';
import type { ItineraryMode } from '../../contracts/types.js';
import { buttonClass, contentLanguages, inputClass, primaryClass } from '../fields.js';
import { modeCopy } from '../labels.js';
import { importCopy } from './copy.js';
import { DEFAULT_IMPORT_LIMITS, type ImportLimits, type ImportStage } from './limits.js';

const MODES: ItineraryMode[] = ['half_day', 'full_day', 'multi_day', 'destination_guide', 'activity'];
const MB = 1024 * 1024;

function failureMessage(caught: unknown): string {
  const body = (caught as { body?: { message?: string } }).body;
  return body?.message || (caught as Error).message || 'Import gagal.';
}

export interface ImportScreenProps {
  target: 'new' | 'overwrite'; draftMode: ItineraryMode | null; draftId: string | null; draftRevision: number | null; aiActive: boolean;
  onCancel: () => void; onDone: (result: ImportApplyDto & { target: 'new' | 'overwrite' }) => void;
  /** Create flow (CP037): the flow draws the header, the method choice and the footer; this screen only reads and previews. */
  embedded?: boolean; presetTab?: 'paste' | 'pdf'; presetMode?: ItineraryMode;
  limits?: ImportLimits;
  onDirty?: (dirty: boolean) => void;
  onBusy?: (busy: boolean) => void;
  onStage?: (stage: ImportStage) => void;
}

/** The import screen. Reads text or a text-layer PDF, shows what code found, then creates a draft or overwrites the open one.
 * In the create flow it stays mounted while the user moves between steps and methods, so typed text and reading results survive. */
export function ImportScreen({ target, draftMode, draftId, draftRevision, aiActive, onCancel, onDone, embedded = false, presetTab = 'paste', presetMode, limits = DEFAULT_IMPORT_LIMITS, onDirty, onBusy, onStage }: ImportScreenProps) {
  const [tab, setTab] = useState<'paste' | 'pdf'>(presetTab);
  const [text, setText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [intake, setIntake] = useState<ImportSourceDto | null>(null);
  const [mode, setMode] = useState<ItineraryMode>(presetMode ?? draftMode ?? 'half_day');
  const [preview, setPreview] = useState<ImportParseDto | null>(null);
  const [outputLanguage, setOutputLanguage] = useState<string>('auto');
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState<null | 'intake' | 'preview' | 'apply'>(null);
  const [error, setError] = useState<string | null>(null);
  const areaRef = useRef<HTMLTextAreaElement | null>(null);
  /** A response that arrives after this screen was left must not change anything. */
  const alive = useRef(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; onBusy?.(false); }; }, []);
  useEffect(() => { onDirty?.(text.trim().length > 0 || file !== null); }, [text, file]);
  useEffect(() => { onBusy?.(busy !== null); }, [busy]);
  useEffect(() => { const el = areaRef.current; if (el) { el.style.height = 'auto'; el.style.height = `${el.scrollHeight}px`; } }, [text]);

  const newMode = presetMode ?? mode;
  const effectiveMode = target === 'overwrite' ? (draftMode ?? 'half_day') : newMode;
  useEffect(() => { setPreview(null); }, [newMode]);
  const detected = intake?.languageProposal.status === 'resolved' ? intake.languageProposal.locale : null;
  const chosenLanguage = outputLanguage === 'auto' ? detected : outputLanguage;
  const textChars = [...text].length;
  const textTooLong = textChars > limits.maxTextChars;
  const maxPdfMb = Math.round(limits.maxPdfBytes / MB);

  async function readSource() {
    setError(null); setPreview(null); setConfirming(false);
    setBusy('intake');
    try {
      const source = tab === 'paste' ? await api.createImportSource(text) : await api.createImportSource(file!);
      if (!alive.current) return;
      setIntake(source);
      setOutputLanguage('auto');
    } catch (caught) { if (alive.current) { setIntake(null); setError(failureMessage(caught)); } }
    finally { if (alive.current) setBusy(null); }
  }

  async function readPreview() {
    if (!intake) return;
    setError(null); setBusy('preview');
    try { const result = await api.parseImport(intake.sourceId, effectiveMode); if (alive.current) setPreview(result); }
    catch (caught) { if (alive.current) setError(failureMessage(caught)); }
    finally { if (alive.current) setBusy(null); }
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
    if (!intake || !preview) return;
    if (target === 'overwrite' && !confirming) { setConfirming(true); return; }
    setError(null); setBusy('apply');
    try {
      const body: Record<string, unknown> = {
        operationId: crypto.randomUUID(), target,
        ...(target === 'new' ? { mode: newMode } : { itineraryId: draftId, expectedRevision: draftRevision }),
        ...(chosenLanguage ? { outputLanguage: chosenLanguage } : {})
      };
      const result = await api.applyImport(intake.sourceId, body);
      if (alive.current) onDone({ ...result, target });
    } catch (caught) { if (alive.current) { setError(failureMessage(caught)); setConfirming(false); } }
    finally { if (alive.current) setBusy(null); }
  }

  /** The footer action in the create flow follows the reading order: read, then preview, then apply. */
  useEffect(() => {
    if (!embedded || !onStage) return;
    if (busy === 'intake') return onStage({ label: `${tab === 'paste' ? importCopy.readText : importCopy.readPdf}…`, disabled: true, run: () => undefined });
    if (busy === 'preview') return onStage({ label: `${importCopy.previewButton}…`, disabled: true, run: () => undefined });
    if (busy === 'apply') return onStage({ label: importCopy.processing, disabled: true, run: () => undefined });
    if (!intake) {
      const ready = tab === 'paste' ? text.trim().length > 0 && !textTooLong : file !== null;
      return onStage({ label: tab === 'paste' ? importCopy.readText : importCopy.readPdf, disabled: !ready, run: () => { void readSource(); } });
    }
    if (!preview) return onStage({ label: importCopy.previewButton, disabled: false, run: () => { void readPreview(); } });
    onStage({ label: importCopy.process, disabled: false, run: () => { void run(); } });
    // onStage is an inline callback from the parent; it is read from the latest render, not used as a dependency.
  }, [embedded, busy, intake, preview, text, file, tab, mode, presetMode, outputLanguage, confirming]);

  const replaced = confirming ? sectionsToReplace() : [];
  return (
    <div className="space-y-6">
      {!embedded && <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">{importCopy.title}</h2>
          <p className="mt-1 text-sm text-slate-600">{target === 'new' ? 'Hasilnya menjadi draf baru.' : 'Hasilnya menggantikan bagian yang ada di dokumen pada draf ini.'}</p>
        </div>
        <button type="button" className={buttonClass} onClick={onCancel} disabled={busy !== null}>{importCopy.back}</button>
      </div>}

      {!aiActive && <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">{importCopy.aiOff}</p>}

      {!embedded && <div role="tablist" aria-label="Sumber import" className="flex gap-2">
        {(['paste', 'pdf'] as const).map((item) => (
          <button key={item} role="tab" type="button" aria-selected={tab === item} className={`${buttonClass} ${tab === item ? 'border-teal-700 bg-teal-100 font-semibold text-teal-950 ring-2 ring-teal-600' : ''}`} onClick={() => { setTab(item); setIntake(null); setPreview(null); setError(null); }}>
            {item === 'paste' ? importCopy.tabPaste : importCopy.tabPdf}
          </button>
        ))}
      </div>}

      {tab === 'paste' ? (
        <div className="space-y-2">
          <p className="text-sm text-slate-600">{importCopy.pasteHint}</p>
          <label htmlFor="import-text" className="sr-only">Teks itinerary</label>
          <textarea id="import-text" ref={areaRef} rows={6} value={text} placeholder={importCopy.pastePlaceholder} onChange={(event) => { setText(event.target.value); setIntake(null); setPreview(null); }} className={`${inputClass} min-h-[10rem] resize-none text-base`} />
          <p className={`text-right text-xs ${textTooLong ? 'font-semibold text-red-800' : 'text-slate-500'}`}>
            {importCopy.charCount(textChars, limits.maxTextChars)}
          </p>
          {textTooLong && <p role="alert" className="text-sm text-red-800">{importCopy.textTooLong(limits.maxTextChars)}</p>}
          {!embedded && <button type="button" className={primaryClass} disabled={busy !== null || !text.trim() || textTooLong} onClick={readSource}>{busy === 'intake' ? importCopy.readText + '…' : importCopy.readText}</button>}
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-sm text-slate-600">{importCopy.pdfHint}</p>
          <label htmlFor="import-pdf" className="flex min-h-[44px] cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-teal-600 bg-teal-50/50 p-6 text-center hover:bg-teal-50">
            <span className="font-semibold text-teal-900">Klik untuk pilih file PDF</span>
            <span className="text-sm text-slate-600">{file ? `Dipilih: ${file.name}` : `Belum ada file dipilih (PDF berteks, maks. ${maxPdfMb} MB, ${limits.maxPdfPages} halaman)`}</span>
          </label>
          <input id="import-pdf" type="file" accept="application/pdf" className="sr-only" onChange={(event) => {
            const picked = event.target.files?.[0] ?? null;
            const tooBig = picked !== null && picked.size > limits.maxPdfBytes;
            setIntake(null); setPreview(null);
            setError(tooBig ? `PDF terlalu besar (maksimal ${maxPdfMb} MB).` : null);
            setFile(tooBig ? null : picked);
          }} />
          {!embedded && <button type="button" className={primaryClass} disabled={busy !== null || !file} onClick={readSource}>{busy === 'intake' ? importCopy.readPdf + '…' : importCopy.readPdf}</button>}
        </div>
      )}

      {error && <p role="alert" className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-900">{error}</p>}

      {intake && (
        <section aria-label="Hasil baca sumber" className="space-y-4 rounded-lg border border-slate-200 p-4">
          <p className="text-sm font-medium text-slate-800">{importCopy.pagesChars(intake.pageCount, intake.charCount)}</p>
          {target === 'new' && presetMode ? (
            <p className="text-sm text-slate-600">{importCopy.modeLocked} <strong>{modeCopy[newMode]?.title ?? newMode}</strong></p>
          ) : target === 'new' ? (
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
          {!embedded && !preview && <button type="button" className={buttonClass} disabled={busy !== null} onClick={readPreview}>{busy === 'preview' ? importCopy.previewButton + '…' : importCopy.previewButton}</button>}
        </section>
      )}

      {preview && (
        <section aria-label={importCopy.previewTitle} className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm">
          <h3 className="font-semibold">{importCopy.previewTitle}</h3>
          <p>{preview.fields.days.length ? importCopy.previewDays(preview.fields.days.length, preview.fields.days.reduce((n, d) => n + d.activities.length, 0)) : importCopy.previewNone}</p>
          {sectionsToReplace().length > 0 && <p><span className="font-medium">{importCopy.previewSections}:</span> {sectionsToReplace().join('; ')}</p>}
          {preview.notes.map((note, index) => <p key={index} className="text-slate-700">{note}</p>)}
          {preview.diagnostics?.filter((item) => item.code.startsWith('PDF_')).map((item, index) => <p key={`${item.code}-${index}`} className="text-amber-900">{item.message}</p>)}
          {!!preview.conflicts?.length && <p className="text-amber-900">{preview.conflicts.length} konflik perlu dipilih atau diedit setelah import; nilai ambigu tidak dipilih otomatis.</p>}
          {preview.unconsumed.length > 0 && <p className="text-slate-600">{preview.unconsumed.length} baris belum dipetakan; sebagian mungkin dibaca AI, bagian ambigu atau tidak didukung tetap perlu diperiksa manual.</p>}
        </section>
      )}

      {confirming && !embedded && (
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

      {!embedded && intake && preview && !confirming && (
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className={primaryClass} disabled={busy !== null} onClick={run}>{busy === 'apply' ? importCopy.processing : importCopy.process}</button>
          {busy === 'apply' && aiActive && <span role="status" className="text-sm text-slate-600">{importCopy.processingAi}</span>}
        </div>
      )}
    </div>
  );
}
