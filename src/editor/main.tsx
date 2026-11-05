import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { api, type AiGenerationResponseDto, type AiPendingDto, type AiPreflightDto, type AiSuggestionDto, type AssetDto, type LanguageResolutionDto, type PreviewDto, type PublicationDto, type PublishedVersionDto, type RecordDto } from '../api/client.js';
import type { ItineraryMode, LanguageContext, WebItineraryContent } from '../contracts/types.js';
import { fieldLabels } from './labels.js';
import { changeMode, hasModeLoss, makeActivity, makeScheduleBlock, makeSpot, moveById, moveIndex, resizeScheduleRange } from './model.js';
import './style.css';

const inputClass = 'mt-1 block w-full rounded-md border border-slate-300 bg-white p-2 text-sm focus-visible:outline-2 focus-visible:outline-teal-700 disabled:bg-slate-100';
const buttonClass = 'rounded-md border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 disabled:cursor-not-allowed disabled:opacity-50';
const primaryClass = 'rounded-md bg-teal-800 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-800 disabled:cursor-not-allowed disabled:opacity-50';
const modes: Array<{ value: ItineraryMode; label: string }> = [
  { value: 'half_day', label: 'Half day' }, { value: 'full_day', label: 'Full day' },
  { value: 'multi_day', label: 'Multi day' }, { value: 'destination_guide', label: 'Destination guide' }
];
const options: Record<string, Array<[string, string]>> = {
  paceLevel: [['Relaxed', 'Santai'], ['Balanced', 'Seimbang'], ['Packed', 'Padat']],
  destinationType: [['beach', 'Pantai'], ['mountain', 'Pegunungan'], ['city', 'Kota'], ['cultural', 'Budaya'], ['nature', 'Alam'], ['desert', 'Gurun'], ['mixed', 'Campuran']],
  activityType: [['transport', 'Transportasi'], ['sightseeing', 'Wisata'], ['food', 'Makanan'], ['activity', 'Aktivitas'], ['rest', 'Istirahat'], ['accommodation', 'Akomodasi'], ['free', 'Waktu bebas']]
};
const localeOptions = ['auto', 'la', 'fr', 'en', 'id', 'ja', 'zh-Hans'];
type FieldType = 'text' | 'url' | 'date' | 'number' | 'textarea' | 'select';
function isPendingAiResponse(result: AiGenerationResponseDto): result is AiPendingDto { return 'status' in result && result.status === 'running'; }

function Field({ id, label, value, onChange, type = 'text', maxLength, required = false, disabled = false, choices, rows = 3, error }: {
  id: string; label: string; value: string | number | null | undefined; onChange: (value: string | number | null) => void;
  type?: FieldType; maxLength?: number; required?: boolean; disabled?: boolean; choices?: Array<[string, string]>; rows?: number; error?: string;
}) {
  const common = { id, className: `${inputClass} ${error ? 'border-red-600' : ''}`, required, disabled, 'aria-invalid': Boolean(error), 'aria-describedby': error ? `${id}-error` : undefined };
  const control = type === 'textarea'
    ? <textarea {...common} value={value ?? ''} maxLength={maxLength} rows={rows} onChange={(event) => onChange(event.target.value)} />
    : type === 'select'
      ? <select {...common} value={value ?? ''} onChange={(event) => onChange(event.target.value || null)}><option value="">— Pilih —</option>{(choices || []).map(([key, name]) => <option key={key} value={key}>{name}</option>)}</select>
      : <input {...common} type={type} value={value ?? ''} maxLength={maxLength} onChange={(event) => onChange(type === 'number' ? (event.target.value === '' ? null : Number(event.target.value)) : event.target.value)} />;
  return <div className="min-w-0"><label htmlFor={id} className="block text-sm font-medium text-slate-800">{label}{required && <span aria-hidden="true" className="ml-1 text-red-700">*</span>}</label>{control}{error && <p id={`${id}-error`} className="mt-1 text-xs text-red-700">{error}</p>}</div>;
}

function TextList({ id, title, values, maxItems, itemMaxLength = 4000, onChange }: { id: string; title: string; values: string[]; maxItems?: number; itemMaxLength?: number; onChange: (values: string[]) => void }) {
  const root = useRef<HTMLFieldSetElement>(null);
  const focusIndex = useRef<number | null>(null);
  useEffect(() => {
    if (focusIndex.current !== null) (root.current?.querySelectorAll('textarea')[focusIndex.current] || root.current?.querySelector('button:last-child'))?.focus();
    focusIndex.current = null;
  }, [values.length]);
  return <fieldset ref={root} className="space-y-2 rounded-lg border border-slate-200 p-3"><legend className="px-1 text-sm font-semibold">{title}</legend>
    {values.map((value, index) => <div className="flex items-start gap-2" key={`${id}-${index}`}><label className="sr-only" htmlFor={`${id}-${index}`}>{title}, baris {index + 1}</label><textarea id={`${id}-${index}`} rows={2} maxLength={itemMaxLength} value={value} onChange={e => onChange(values.map((item, i) => i === index ? e.target.value : item))} className={`${inputClass} mt-0`} /><div className="flex flex-col gap-1"><button type="button" aria-label={`Naikkan ${title} ${index + 1}`} disabled={index === 0} className={buttonClass} onClick={() => onChange(moveIndex(values, index, -1))}>↑</button><button type="button" aria-label={`Turunkan ${title} ${index + 1}`} disabled={index === values.length - 1} className={buttonClass} onClick={() => onChange(moveIndex(values, index, 1))}>↓</button><button type="button" aria-label={`Hapus ${title} ${index + 1}`} className={buttonClass} onClick={() => { if (confirm(`Hapus ${title.toLowerCase()} baris ${index + 1}?`)) { focusIndex.current = Math.max(0, index - 1); onChange(values.filter((_, i) => i !== index)); } }}>Hapus</button></div></div>)}
    <button type="button" disabled={maxItems !== undefined && values.length >= maxItems} onClick={() => { focusIndex.current = values.length; onChange([...values, '']); }} className={buttonClass}>Tambah {title.toLowerCase()}</button>
  </fieldset>;
}

interface ObjectField { key: string; label: string; type?: FieldType; maxLength?: number; choices?: Array<[string, string]>; }
function ObjectList({ id, title, rows, fields, makeRow, maxItems, onChange }: { id: string; title: string; rows: Array<Record<string, any>>; fields: ObjectField[]; makeRow: () => Record<string, any>; maxItems?: number; onChange: (rows: Array<Record<string, any>>) => void }) {
  const root = useRef<HTMLFieldSetElement>(null);
  const focusIndex = useRef<number | null>(null);
  useEffect(() => {
    if (focusIndex.current !== null) {
      const target = root.current?.querySelectorAll('input,textarea,select')[focusIndex.current * fields.length] || root.current?.querySelector('button:last-child');
      (target as HTMLElement | null | undefined)?.focus();
    }
    focusIndex.current = null;
  }, [rows.length]);
  return <fieldset ref={root} className="space-y-3 rounded-lg border border-slate-200 p-3"><legend className="px-1 text-sm font-semibold">{title}</legend>
    {rows.map((row, index) => <div className="rounded-md bg-slate-50 p-3" key={row.id || `${id}-${index}`}><div className="grid gap-3 sm:grid-cols-2">{fields.map(field => <Field key={field.key} id={`${id}-${index}-${field.key}`} label={`${field.label} ${index + 1}`} value={row[field.key]} type={field.type} maxLength={field.maxLength} choices={field.choices} onChange={value => onChange(rows.map((item, i) => i === index ? { ...item, [field.key]: value } : item))} />)}</div><div className="mt-2 flex gap-2"><button type="button" className={buttonClass} aria-label={`Naikkan ${title} ${index + 1}`} disabled={index === 0} onClick={() => onChange(moveIndex(rows, index, -1))}>Naikkan</button><button type="button" className={buttonClass} aria-label={`Turunkan ${title} ${index + 1}`} disabled={index === rows.length - 1} onClick={() => onChange(moveIndex(rows, index, 1))}>Turunkan</button><button type="button" className={buttonClass} onClick={() => { if (confirm(`Hapus ${title.toLowerCase()} ${index + 1}?`)) { focusIndex.current = Math.max(0, index - 1); onChange(rows.filter((_, i) => i !== index)); } }}>Hapus {title.toLowerCase()} {index + 1}</button></div></div>)}
    <button type="button" disabled={maxItems !== undefined && rows.length >= maxItems} className={buttonClass} onClick={() => { focusIndex.current = rows.length; onChange([...rows, makeRow()]); }}>Tambah {title.toLowerCase()}</button>
  </fieldset>;
}

function AssetSelect({ id, label, value, assets, onChange }: { id: string; label: string; value: string | null | undefined; assets: AssetDto[]; onChange: (value: string | null) => void }) {
  return <div><label htmlFor={id} className="block text-sm font-medium text-slate-800">{label}</label><select id={id} value={value || ''} onChange={e => onChange(e.target.value || null)} className={inputClass}><option value="">Tanpa aset</option>{assets.map(asset => <option key={asset.id} value={asset.id}>{asset.filename} · {asset.width}×{asset.height}</option>)}</select></div>;
}
function withAttribution(current: any, key: 'photographer' | 'photographerUrl' | 'source', value: unknown) {
  const next: Record<string, unknown> = { photographer: '', photographerUrl: null, source: '', ...(current || {}) };
  next[key] = value;
  return next;
}
function withAccommodation(current: any, key: 'name' | 'area' | 'note', value: unknown) {
  const next: Record<string, unknown> = { name: null, area: '', note: '', ...(current || {}) };
  next[key] = value;
  return next;
}

interface PendingSuggestion extends AiSuggestionDto { editGeneration: number; key: string; }
function SuggestionPanel({ proposal, canApply, onText, onApply, onDiscard }: { proposal: PendingSuggestion; canApply: boolean; onText: (text: string) => void; onApply: () => void; onDiscard: () => void }) {
  return <section className="mt-3 rounded-lg border border-indigo-200 bg-indigo-50 p-3" aria-label="Usulan AI">
    <label className="block text-sm font-semibold" htmlFor={`suggestion-${proposal.key}`}>Usulan AI · {proposal.locale} (dapat diedit)</label>
    <textarea id={`suggestion-${proposal.key}`} value={proposal.text} onChange={event => onText(event.target.value)} rows={4} className={inputClass} />
    {!canApply && <p className="mt-1 text-xs text-amber-800">Target atau draft berubah; generate ulang sebelum menerapkan.</p>}
    <div className="mt-2 flex gap-2"><button type="button" disabled={!canApply} className={primaryClass} onClick={onApply}>Terapkan ke field ini</button><button type="button" className={buttonClass} onClick={onDiscard}>Buang saran</button></div>
  </section>;
}

function App() {
  const [profile, setProfile] = useState<any>(null);
  const [records, setRecords] = useState<Array<{ id: string; revision: number; mode: string; title: string; updatedAt: string }>>([]);
  const [assets, setAssets] = useState<AssetDto[]>([]);
  const [record, setRecord] = useState<RecordDto | null>(null);
  const [content, setContent] = useState<WebItineraryContent | null>(null);
  const [language, setLanguage] = useState<LanguageContext>({ requestedLanguage: 'auto', outputLanguage: null, source: 'unresolved' });
  const [localeInput, setLocaleInput] = useState('auto');
  const [localeError, setLocaleError] = useState('');
  const [writing, setWriting] = useState<RecordDto['writingContext']>({ brief: '', notes: [] });
  const [dirty, setDirty] = useState(false);
  const [profileDirty, setProfileDirty] = useState(false);
  const [status, setStatus] = useState('Memuat engine…');
  const [capabilities, setCapabilities] = useState<any>({ ai: { credentialState: 'missing' } });
  const [aiPreflight, setAiPreflight] = useState<AiPreflightDto | null>(null);
  const [busy, setBusy] = useState(false);
  const [aiBusy, setAiBusy] = useState<string | null>(null);
  const [proposals, setProposals] = useState<Record<string, PendingSuggestion>>({});
  const [languageProposal, setLanguageProposal] = useState<LanguageResolutionDto | null>(null);
  const [pendingMode, setPendingMode] = useState<ItineraryMode | null>(null);
  const [pendingRange, setPendingRange] = useState<{ id: string; end: number } | null>(null);
  const [conflict, setConflict] = useState<{ latest: RecordDto; local: WebItineraryContent; language: LanguageContext; writing: RecordDto['writingContext'] } | null>(null);
  const [sectionErrors, setSectionErrors] = useState<Array<{ code: string; path: string; message: string }>>([]);
  const [preview, setPreview] = useState<PreviewDto | null>(null);
  const [previewDiagnostics, setPreviewDiagnostics] = useState<{ errors: PreviewDto['errors']; warnings: PreviewDto['warnings'] } | null>(null);
  const [previewViewport, setPreviewViewport] = useState<'phone' | 'desktop'>('phone');
  const [publication, setPublication] = useState<PublicationDto | null>(null);
  const [versions, setVersions] = useState<PublishedVersionDto[]>([]);
  const draftRef = useRef<WebItineraryContent | null>(null);
  const editGeneration = useRef(0);
  const languageProposalGeneration = useRef<number | null>(null);
  const profileGeneration = useRef(0);
  const profileSavedGeneration = useRef(0);
  const pendingPublishIntent = useRef<{ itineraryId: string; expectedRevision: number; operationId: string } | null>(null);
  const hasUnsaved = dirty || profileDirty;

  async function refresh() {
    const [context, nextProfile, rows, nextAssets] = await Promise.all([api.context(), api.profile(), api.list(), api.assets()]);
    setCapabilities(context.capabilities);
    if (profileGeneration.current === profileSavedGeneration.current) setProfile(nextProfile);
    setRecords(rows.items); setAssets(nextAssets.items);
  }
  useEffect(() => { refresh().then(() => setStatus('Engine tersambung')).catch(() => setStatus('Engine belum tersambung. Jalankan server lokal lalu muat ulang.')); }, []);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (hasUnsaved) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn);
  }, [hasUnsaved]);
  useEffect(() => {
    if (!pendingMode && !pendingRange) return;
    const dialog = document.querySelector<HTMLElement>('[aria-modal="true"]');
    dialog?.querySelector<HTMLElement>('button')?.focus();
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { setPendingMode(null); setPendingRange(null); } };
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, [pendingMode, pendingRange]);

  function markDirty() { editGeneration.current++; languageProposalGeneration.current = null; setLanguageProposal(null); setDirty(true); setSectionErrors([]); setPreview(null); setPreviewDiagnostics(null); }
  function edit(mutator: (next: any) => void) {
    const current = draftRef.current;
    if (!current) return;
    markDirty();
    const next = structuredClone(current);
    mutator(next);
    draftRef.current = next;
    setContent(next);
  }
  function setPath(path: string, value: unknown) {
    edit(next => { const keys = path.split('.'); let node = next; for (const key of keys.slice(0, -1)) node = node[key]; node[keys.at(-1)!] = value; });
  }
  function setIndexed(path: string, index: number, key: string, value: unknown) {
    edit(next => { const rows = path.split('.').reduce((node: any, part) => node[part], next); rows[index][key] = value; });
  }
  function setList(path: string, values: unknown[]) { setPath(path, values); }
  function updateBlock(id: string, update: (block: any) => void) { edit(next => { const block = next.schedule.find((item: any) => item.id === id); if (block) update(block); }); }
  function updateActivity(blockId: string, activityId: string, update: (activity: any) => void) { updateBlock(blockId, block => { const activity = block.activities.find((item: any) => item.id === activityId); if (activity) update(activity); }); }
  function updateSpot(id: string, update: (spot: any) => void) { edit(next => { const spot = next.spots.find((item: any) => item.id === id); if (spot) update(spot); }); }

  function installRecord(loaded: RecordDto) {
    editGeneration.current++;
    languageProposalGeneration.current = null;
    draftRef.current = loaded.draftContent;
    setRecord(loaded); setContent(loaded.draftContent); setLanguage(loaded.languageContext); setLocaleInput(loaded.languageContext.outputLanguage || 'auto');
    setLocaleError(''); setWriting(loaded.writingContext); setDirty(false); setSectionErrors([]); setConflict(null); setProposals({}); setLanguageProposal(null); setPreview(null); setPreviewDiagnostics(null);
  }
  function canDiscard() { return !dirty || confirm(`Draft memiliki perubahan belum disimpan. Buang draft lokal dan lanjutkan?${profileDirty ? ' Perubahan profil akan tetap tersimpan di formulir.' : ''}`); }
  async function open(id: string) {
    if (!canDiscard()) return;
    setBusy(true); try { const loaded = await api.get(id); installRecord(loaded); const [published, history] = await Promise.all([api.publication(id), api.versions(id)]); setPublication(published); setVersions(history.items); setStatus(`Draft dibuka · revisi ${loaded.revision}`); } catch (e) { setStatus((e as Error).message); } finally { setBusy(false); }
  }
  async function create(mode: ItineraryMode) {
    if (!canDiscard()) return;
    if (profileDirty && !confirm('Profil operator belum disimpan. Draft baru akan menyalin profil terakhir yang tersimpan. Lanjutkan?')) return;
    setBusy(true); try { const created = await api.create(mode); installRecord(created); setPublication(null); setVersions([]); await refresh().catch(() => {}); setStatus('Draft baru tersimpan'); } catch (e) { setStatus((e as Error).message); } finally { setBusy(false); }
  }
  function changeLocale(raw: string) {
    setLocaleInput(raw); setLocaleError('');
    setLanguageProposal(null);
    if (!raw || raw.toLowerCase() === 'auto') {
      setLanguage({ requestedLanguage: 'auto', outputLanguage: null, source: 'unresolved' });
      setPath('brochure.outputLanguage', null); return;
    }
    try {
      const locale = Intl.getCanonicalLocales(raw)[0];
      if (!locale) throw new Error('invalid');
      setLanguage({ requestedLanguage: locale, outputLanguage: locale, source: 'explicit' });
      setPath('brochure.outputLanguage', locale);
    } catch { markDirty(); setLocaleError('Masukkan tag bahasa BCP 47 yang valid, misalnya fr-CA atau zh-Hans.'); }
  }
  function localeSupported(locale: string | null) {
    if (!locale) return false;
    try {
      const parsed = new Intl.Locale(locale);
      return parsed.language === 'la' ? parsed.baseName === 'la' : ['fr', 'en', 'id', 'ja'].includes(parsed.language) || (parsed.language === 'zh' && parsed.script === 'Hans');
    } catch { return false; }
  }
  function proposalValid(proposal: PendingSuggestion) {
    if (!record || !draftRef.current || record.id !== proposal.itineraryId || record.revision !== proposal.revision || editGeneration.current !== proposal.editGeneration) return false;
    if (proposal.target.kind === 'overview') return true;
    return Boolean(findTarget(draftRef.current, proposal.target));
  }
  function findTarget(draft: WebItineraryContent, target: AiSuggestionDto['target']) {
    if (target.kind === 'overview') return true;
    if (target.kind === 'spot') return draft.spots.some(spot => spot.id === target.id);
    return draft.schedule.some(block => block.activities.some(activity => activity.id === target.id));
  }
  async function resolveLanguage() {
    if (!record || dirty) { setStatus('Simpan draft dan brief sebelum deteksi bahasa.'); return; }
    const itineraryId = record.id; const revision = record.revision; const generation = editGeneration.current;
    languageProposalGeneration.current = null; setLanguageProposal(null);
    setBusy(true);
    try {
      const result = await api.resolveLanguage(itineraryId, revision);
      if (generation !== editGeneration.current || record?.id !== itineraryId || record.revision !== revision) { languageProposalGeneration.current = null; setLanguageProposal(null); setStatus('Hasil deteksi bahasa usang karena draft atau brief berubah. Deteksi ulang.'); return; }
      if (result.status === 'resolved') { languageProposalGeneration.current = generation; setLanguageProposal(result); setStatus(`Bahasa terdeteksi: ${result.locale}. Konfirmasi sebelum menyimpan.`); }
      else setStatus(result.reason);
    } catch (error: any) { setStatus(error.body?.message || error.message); }
    finally { setBusy(false); }
  }
  async function checkProvider() {
    setBusy(true);
    try {
      const result = await api.aiPreflight(); setAiPreflight(result);
      setStatus(`Provider terautentikasi · ${result.modelId} · input $${(result.pricing!.prompt * 1_000_000).toFixed(2)}/1M token`);
    } catch (error: any) {
      setAiPreflight(null); setStatus(error.body?.message || 'Preflight provider gagal; key tidak ditampilkan.');
    } finally { setBusy(false); }
  }
  function acceptLanguage() {
    if (!languageProposal?.locale || !record || languageProposal.itineraryId !== record.id || languageProposal.revision !== record.revision || languageProposalGeneration.current !== editGeneration.current) { languageProposalGeneration.current = null; setLanguageProposal(null); setStatus('Hasil deteksi sudah usang; deteksi ulang.'); return; }
    languageProposalGeneration.current = null;
    setLanguage({ requestedLanguage: 'auto', outputLanguage: languageProposal.locale, source: 'detected' });
    setLocaleInput(languageProposal.locale); setPath('brochure.outputLanguage', languageProposal.locale); setLanguageProposal(null);
  }
  async function generate(task: 'overview' | 'description', target?: { kind: 'activity' | 'spot'; id: string }) {
    if (!record || !content) return;
    if (dirty || localeError) { setStatus('Simpan semua perubahan itinerary dan bahasa sebelum Generate.'); return; }
    if (!language.outputLanguage || language.source === 'unresolved') { setStatus('Pilih atau deteksi bahasa konten sebelum Generate.'); return; }
    if (capabilities.ai?.credentialState !== 'configured') { setStatus('OpenRouter belum terkonfigurasi pada server; Anda tetap dapat menulis manual.'); return; }
    const key = task === 'overview' ? 'overview.summary' : `${target!.kind}:${target!.id}`;
    const generation = editGeneration.current; const revision = record.revision; const operationId = crypto.randomUUID();
    setAiBusy(key); setStatus('Meminta usulan AI…');
    try {
      const requestSuggestion = () => task === 'overview' ? api.generateOverview(record.id, operationId, revision) : api.generateDescription(record.id, operationId, revision, target!);
      const deadline = Date.now() + 45_000;
      let result: AiGenerationResponseDto = await requestSuggestion();
      while (isPendingAiResponse(result)) {
        if (result.operationId !== operationId || !Number.isFinite(result.retryAfterMs) || result.retryAfterMs < 0 || Date.now() >= deadline) throw new Error('AI operation is still pending; retry the same operation later.');
        const retryAfterMs = result.retryAfterMs;
        await new Promise(resolve => setTimeout(resolve, Math.max(100, Math.min(retryAfterMs, 2000))));
        result = await requestSuggestion();
      }
      if ('status' in result) throw new Error('AI returned an invalid pending response.');
      if (result.operationId !== operationId) throw new Error('AI returned a mismatched operation ID.');
      if (generation !== editGeneration.current || !findTarget(draftRef.current!, result.target)) { setStatus('Hasil AI usang karena draft/target berubah; tidak ada perubahan yang diterapkan.'); return; }
      setProposals(old => ({ ...old, [key]: { ...result, key, editGeneration: generation } }));
      setStatus('Usulan AI siap ditinjau; draft belum berubah.');
    } catch (error: any) {
      const code = error.body?.code;
      setStatus(code === 'AI_DAILY_LIMIT' || code === 'AI_RATE_LIMIT' ? error.body.message : code === 'AI_RESULT_STALE' ? 'Target atau revisi berubah; usulan tidak diterapkan.' : `AI tidak tersedia: ${error.body?.message || error.message}`);
    } finally { setAiBusy(null); }
  }
  function proposalPanel(key: string, setter: (text: string) => void, apply: (text: string) => void) {
    const proposal = proposals[key];
    if (!proposal) return null;
    return <SuggestionPanel proposal={proposal} canApply={proposalValid(proposal)} onText={setter} onDiscard={() => setProposals(old => { const next = { ...old }; delete next[key]; return next; })} onApply={() => { const text = proposal.text; if (proposalValid(proposal)) { apply(text); setProposals(old => { const next = { ...old }; delete next[key]; return next; }); setStatus('Saran diterapkan ke field lokal; tekan Simpan draft untuk menyimpannya.'); } }} />;
  }
  function aiAction(key: string, labelText: string, task: 'overview' | 'description', target?: { kind: 'activity' | 'spot'; id: string }, apply?: (text: string) => void) {
    const proposal = proposals[key];
    const ready = capabilities.ai?.credentialState === 'configured' && Boolean(language.outputLanguage) && language.source !== 'unresolved' && !dirty && !localeError;
    return <div className="sm:col-span-2"><button type="button" disabled={!ready || busy || aiBusy !== null} className={buttonClass} title={!ready ? 'Simpan draft, pilih bahasa, dan konfigurasikan key pada server sebelum Generate.' : undefined} onClick={() => generate(task, target)}>{aiBusy === key ? 'Menunggu usulan…' : labelText}</button>{!ready && <span className="ml-2 text-xs text-slate-500">Manual edit tetap tersedia; simpan draft dan pilih bahasa sebelum AI.</span>}{proposal && proposalPanel(key, text => setProposals(old => ({ ...old, [key]: { ...old[key], text } })), text => { if (apply) apply(text); })}</div>;
  }
  function requestMode(mode: ItineraryMode) {
    if (!content || mode === content.brochure.itineraryMode) return;
    if (hasModeLoss(content, mode).length) setPendingMode(mode);
    else applyMode(mode);
  }
  function applyMode(mode: ItineraryMode) {
    edit(next => Object.assign(next, changeMode(next, mode))); setPendingMode(null);
  }
  function requestRange(id: string, end: number) {
    if (!content) return;
    const block = content.schedule.find(item => item.id === id);
    if (!block || end === block.dayEnd) return;
    setPendingRange({ id, end });
  }
  function applyRange() {
    if (!pendingRange || !content) return;
    edit(next => { next.schedule = resizeScheduleRange(next.schedule, pendingRange.id, pendingRange.end); });
    setPendingRange(null);
  }
  function reorderBlocks(id: string, delta: number) {
    if (!content) return;
    if (content.schedule.some(block => block.date) && !confirm('Urutan hari berubah; tanggal kalender manual tidak diubah. Lanjutkan?')) return;
    edit(next => {
      const widths = new Map<string, number>(next.schedule.map((block: any) => [block.id, block.dayEnd - block.dayStart]));
      const reordered = moveById(next.schedule, id, delta);
      let day = 1;
      next.schedule = reordered.map((block: any) => { const width = widths.get(block.id) || 0; const updated = { ...block, dayStart: day, dayEnd: day + width }; day += width + 1; return updated; });
    });
  }
  function removeBlock(id: string) {
    if (!content || !confirm('Hapus blok hari ini beserta aktivitas dan catatannya? Hari berikutnya akan diurutkan ulang; tanggal kalender manual tidak diubah. Lanjutkan?')) return;
    edit(next => {
      const widths = new Map<string, number>(next.schedule.map((block: any) => [block.id, block.dayEnd - block.dayStart]));
      const remaining = next.schedule.filter((block: any) => block.id !== id);
      let day = 1;
      next.schedule = remaining.map((block: any) => { const width = widths.get(block.id) || 0; const updated = { ...block, dayStart: day, dayEnd: day + width }; day += width + 1; return updated; });
    });
  }
  async function save() {
    if (!record || !content || localeError) return;
    const generation = editGeneration.current;
    const submitted = structuredClone(draftRef.current || content);
    setBusy(true); setStatus('Menyimpan…');
    try {
      const saved = await api.save(record, submitted, language, writing); setRecord(saved); setConflict(null); setPublication(current => current ? { ...current, draftRevision: saved.revision, draftDiffers: Boolean(current.currentVersion && current.currentVersion.sourceRevision !== saved.revision) } : current);
      if (editGeneration.current === generation) { draftRef.current = saved.draftContent; setContent(saved.draftContent); setLanguage(saved.languageContext); setWriting(saved.writingContext); setDirty(false); setProposals({}); setStatus(`Tersimpan · revisi ${saved.revision}`); }
      else setStatus(`Revisi ${saved.revision} tersimpan; edit terbaru masih belum disimpan.`);
      await refresh().catch(() => {});
    } catch (e: any) {
      if (e.status === 409) {
        try { const latest = await api.get(record.id); setConflict({ latest, local: structuredClone(draftRef.current || content), language: structuredClone(language), writing: structuredClone(writing) }); setStatus(`Konflik: versi tersimpan sudah di revisi ${latest.revision}; perubahan lokal tetap aman.`); }
        catch { setStatus('Konflik revisi; perubahan lokal tetap aman, tetapi versi terbaru belum dapat dimuat.'); }
      } else if (e.status === 422) { setSectionErrors(e.body?.fields || []); setStatus('Draft memiliki data yang perlu diperbaiki sebelum dapat disimpan.'); }
      else setStatus(`Gagal menyimpan: ${e.message}`);
    } finally { setBusy(false); }
  }
  async function previewSaved() {
    if (!record || dirty) { setStatus('Simpan draft terlebih dahulu sebelum preview.'); return; }
    const generation = editGeneration.current;
    setBusy(true); setStatus('Membuat preview dari draft tersimpan…'); setPreview(null); setPreviewDiagnostics(null);
    try {
      const result = await api.preview(record.id, record.revision);
      if (generation !== editGeneration.current || result.itineraryId !== record.id || result.revision !== record.revision) { setStatus('Preview usang karena draft berubah; simpan dan coba lagi.'); return; }
      setPreview(result); setPreviewDiagnostics({ errors: result.errors, warnings: result.warnings });
      setStatus(result.publishReady ? 'Preview siap · draft memenuhi pemeriksaan publish.' : 'Preview siap · perbaiki diagnostics publish sebelum publish.');
    } catch (e: any) {
      const diagnostics = e.body?.fields;
      setPreviewDiagnostics({ errors: diagnostics?.errors || [{ code: e.body?.code || 'PREVIEW_FAILED', path: '', message: e.body?.message || e.message }], warnings: diagnostics?.warnings || [] });
      setStatus(e.status === 409 ? 'Draft berubah; simpan lalu buat preview baru.' : `Preview belum tersedia: ${e.body?.message || e.message}`);
    } finally { setBusy(false); }
  }
  async function publishSaved() {
    if (!record || dirty) { setStatus('Simpan draft sebelum publish.'); return; }
    const intent = pendingPublishIntent.current?.itineraryId === record.id && pendingPublishIntent.current.expectedRevision === record.revision
      ? pendingPublishIntent.current
      : { itineraryId: record.id, expectedRevision: record.revision, operationId: crypto.randomUUID() };
    pendingPublishIntent.current = intent;
    setBusy(true); setStatus('Memeriksa kesiapan dan menerbitkan snapshot…');
    try {
      const result = await api.publish(intent.itineraryId, intent.operationId, intent.expectedRevision);
      if (result.status === 'pending') { setStatus('Publish masih berjalan; ulangi pemeriksaan status sebentar lagi.'); return; }
      if (pendingPublishIntent.current?.operationId === intent.operationId) pendingPublishIntent.current = null;
      const [published, history] = await Promise.all([api.publication(record.id), api.versions(record.id)]); setPublication(published); setVersions(history.items);
      setStatus(result.replayed ? 'Versi published sudah tersedia.' : 'Itinerary berhasil dipublish.');
    } catch (e: any) {
      if (typeof e.status === 'number' && pendingPublishIntent.current?.operationId === intent.operationId) pendingPublishIntent.current = null;
      const diagnostics = e.body?.fields;
      if (diagnostics?.errors) setPreviewDiagnostics({ errors: diagnostics.errors, warnings: diagnostics.warnings || [] });
      setStatus(`Publish gagal: ${e.body?.message || e.message}`);
    } finally { setBusy(false); }
  }
  async function unpublish() {
    if (!record || !publication?.active || !confirm('Cabut link publik? Link lama tidak akan aktif lagi.')) return;
    setBusy(true);
    try { const result = await api.unpublish(record.id, publication.epoch); setPublication(await api.publication(record.id)); setStatus(`Link dicabut · epoch ${result.epoch}`); }
    catch (e: any) { setStatus(`Gagal mencabut link: ${e.body?.message || e.message}`); }
    finally { setBusy(false); }
  }
  async function copyShareLink() {
    if (!publication?.shareUrl) return;
    try { await navigator.clipboard.writeText(publication.shareUrl); setStatus('Link publik disalin.'); }
    catch { setStatus('Clipboard tidak tersedia; gunakan link publik yang terlihat.'); }
  }
  function focusDiagnostic(diagnostic: PreviewDto['errors'][number]) {
    const path = diagnostic.path;
    const direct: Record<string, string> = { 'brochure.tripTitle': 'tripTitle', 'brochure.destination': 'destination', 'overview.summary': 'overview', 'overview.quickFacts.bestSeason': 'bestSeason' };
    let targetId = direct[path] ? id(direct[path]) : '';
    const activity = /^schedule\[(\d+)\]\.activities\[(\d+)\]\.(\w+)$/.exec(path);
    const activityFields: Record<string, string> = { timeLabel: 'activity-time', type: 'activity-type', title: 'activity-title', durationLabel: 'activity-duration', area: 'activity-area', category: 'activity-category', description: 'activity-description', tip: 'activity-tip' };
    if (!targetId && activity && content) {
      const item = diagnostic.targetId
        ? content.schedule.flatMap(block => block.activities).find(candidate => candidate.id === diagnostic.targetId)
        : content.schedule[Number(activity[1])]?.activities[Number(activity[2])];
      const field = activityFields[activity[3]];
      if (item && field) targetId = `${id(field)}-${item.id}`;
    }
    const block = /^schedule\[(\d+)\]\.(title|location|transportNote|blockTip)$/.exec(path);
    const blockFields: Record<string, string> = { title: 'title', location: 'location', transportNote: 'transport', blockTip: 'block-tip' };
    if (!targetId && block && content) {
      const item = diagnostic.targetId ? content.schedule.find(candidate => candidate.id === diagnostic.targetId) : content.schedule[Number(block[1])];
      const field = blockFields[block[2]];
      if (item && field) targetId = `${id('block')}-${item.id}-${field}`;
    }
    const spot = /^spots\[(\d+)\]\.(\w+)$/.exec(path);
    const spotFields: Record<string, string> = { name: 'spot-name', groupLabel: 'spot-group', area: 'spot-area', category: 'spot-category', description: 'spot-description', suggestedDuration: 'spot-duration', bestTimeToVisit: 'spot-best-time', gettingThere: 'spot-getting-there', nearbyPairing: 'spot-pairing' };
    if (!targetId && spot && content) {
      const item = diagnostic.targetId ? content.spots.find(candidate => candidate.id === diagnostic.targetId) : content.spots[Number(spot[1])];
      const field = spotFields[spot[2]];
      if (item && field) targetId = `${id(field)}-${item.id}`;
    }
    if (!targetId) return;
    const field = document.getElementById(targetId);
    field?.focus(); field?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  async function reloadLatest() {
    if (!conflict || !confirm('Ganti buffer lokal dengan versi server terbaru? Perubahan lokal akan dibuang.')) return;
    installRecord(conflict.latest); setStatus(`Versi terbaru dimuat · revisi ${conflict.latest.revision}`);
  }
  async function copyLocal() {
    if (!conflict) return;
    try { await navigator.clipboard.writeText(JSON.stringify({ draftContent: conflict.local, languageContext: conflict.language, writingContext: conflict.writing }, null, 2)); setStatus('Salinan perubahan lokal disalin; tidak ada overwrite ke server.'); }
    catch { setStatus('Clipboard tidak tersedia; perubahan lokal tetap ada di formulir.'); }
  }
  async function saveProfile() {
    if (!profile) return;
    const generation = profileGeneration.current;
    setBusy(true);
    try {
      const saved = await api.saveProfile(profile.revision, profile.profile);
      if (profileGeneration.current === generation) { profileSavedGeneration.current = generation; setProfile(saved); setProfileDirty(false); }
      else setProfile((current: any) => ({ ...current, revision: saved.revision }));
      setStatus(profileGeneration.current === generation ? 'Profil tersimpan' : 'Profil tersimpan; perubahan profil terbaru belum disimpan.');
    } catch (e: any) { setStatus(e.status === 409 ? 'Konflik profil; muat ulang sebelum menyimpan.' : e.message); }
    finally { setBusy(false); }
  }
  async function upload(file?: File) {
    if (!file) return;
    setBusy(true);
    try { const uploaded = await api.upload(file); setAssets(old => [uploaded, ...old]); setStatus(`Aset tersimpan · ${uploaded.width}×${uploaded.height}`); }
    catch (e) { setStatus((e as Error).message); }
    finally { setBusy(false); }
  }
  function changeProfile(key: string, value: string) {
    profileGeneration.current++; setProfileDirty(true);
    setProfile((old: any) => ({ ...old, profile: { ...old.profile, [key]: value } }));
  }

  const id = (part: string) => `${record?.id || 'draft'}-${part}`;
  const label = (key: string) => fieldLabels[key] || key;
  const activeMode = content?.brochure.itineraryMode;
  const isScheduled = activeMode !== 'destination_guide';
  const localeNeedsSupport = language.outputLanguage !== null && !localeSupported(language.outputLanguage);

  return <main className="mx-auto min-h-screen max-w-7xl px-4 py-8 text-slate-900 sm:px-6 lg:px-8">
    <header className="mb-8 flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 pb-5">
      <div><p className="text-sm font-semibold uppercase tracking-widest text-teal-700">Itinerary Engine · lokal</p><h1 className="mt-2 text-3xl font-bold tracking-tight">Ruang kerja perjalanan</h1></div>
      <p role="status" aria-live="polite" className="text-sm text-slate-600">{status}</p>
    </header>
    <div className="grid gap-6 lg:grid-cols-[18rem_1fr]">
      <aside className="space-y-5">
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="font-semibold">Draft itinerary</h2><label className="mt-3 block text-sm font-medium" htmlFor="new-mode">Buat draft</label>
          <div className="mt-1 flex gap-2"><select id="new-mode" className={inputClass}>{modes.map(mode => <option key={mode.value} value={mode.value}>{mode.label}</option>)}</select><button type="button" disabled={busy} onClick={() => create((document.getElementById('new-mode') as HTMLSelectElement).value as ItineraryMode)} className={primaryClass}>Buat</button></div>
          <ul className="mt-4 space-y-2">{records.map(item => <li key={item.id}><button type="button" disabled={busy} onClick={() => open(item.id)} className="w-full rounded-md border border-slate-200 p-3 text-left hover:border-teal-600 focus-visible:outline-2 focus-visible:outline-teal-700 disabled:opacity-50"><span className="block font-medium">{item.title || 'Draft tanpa judul'}</span><span className="text-xs text-slate-500">{item.mode.replaceAll('_', ' ')} · revisi {item.revision}</span></button></li>)}</ul>
        </section>
        {profile && <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><h2 className="font-semibold">Profil operator</h2>
          <Field id="agency" label={label('agencyName')} value={profile.profile.agencyName} maxLength={160} onChange={value => changeProfile('agencyName', String(value ?? ''))} />
          <Field id="contact" label={label('agencyContact')} value={profile.profile.agencyContact} maxLength={320} onChange={value => changeProfile('agencyContact', String(value ?? ''))} />
          <AssetSelect id="agency-logo" label={label('agencyLogo')} value={profile.profile.agencyLogoAssetId} assets={assets} onChange={value => { profileGeneration.current++; setProfileDirty(true); setProfile((old: any) => ({ ...old, profile: { ...old.profile, agencyLogoAssetId: value } })); }} />
          <button type="button" disabled={busy || !profileDirty} onClick={saveProfile} className={buttonClass}>Simpan profil</button>
        </section>}
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><h2 className="font-semibold">Pustaka aset</h2><label htmlFor="asset-upload" className="mt-2 block text-sm text-slate-600">JPEG, PNG, WebP · maks. 5 MiB, 16 MP</label><input id="asset-upload" type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={e => upload(e.target.files?.[0])} className="mt-2 block w-full text-sm file:mr-2 file:rounded-md file:border-0 file:bg-teal-50 file:px-3 file:py-2 file:font-semibold file:text-teal-900"/><p className="mt-2 text-xs text-slate-500">{assets.length} aset tersedia; asset ID disimpan di draft.</p></section>
        <section className="space-y-2 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><h2 className="font-semibold">Penulisan AI</h2><p className="text-xs text-slate-600">Status kredensial server: {capabilities.ai?.credentialState || 'missing'} · {aiPreflight ? `${aiPreflight.daily.usedToday}/${aiPreflight.daily.dailyLimit} operasi hari ini` : 'Usage diperiksa saat preflight'}.</p><button type="button" disabled={busy} className={buttonClass} onClick={checkProvider}>Periksa model dan koneksi</button><p className="text-xs text-slate-500">Model target: {aiPreflight?.modelId || 'openai/gpt-6-luna'}. Key tidak dikirim ke browser.</p></section>
      </aside>
      <section className="min-w-0 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-7">
        {!content ? <div className="grid min-h-80 place-items-center text-center text-slate-500">Pilih atau buat draft untuk mulai.</div> : <>
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4"><div><h2 className="text-xl font-semibold">{content.brochure.tripTitle || `Draft ${(activeMode || 'half_day').replaceAll('_', ' ')}`}</h2><p className="mt-1 text-sm text-slate-600">{dirty ? 'Belum disimpan' : `Tersimpan · revisi ${record?.revision}`}{profileDirty ? ' · profil belum disimpan' : ''}</p></div><div className="flex gap-2"><button type="button" disabled={busy || dirty || !record} onClick={previewSaved} className={buttonClass}>Preview</button><button type="button" disabled={busy || !dirty || Boolean(localeError)} onClick={save} className={primaryClass}>Simpan draft</button></div></div>
          {conflict && <section aria-label="Konflik revisi" className="mb-5 rounded-lg border border-amber-400 bg-amber-50 p-4"><h3 className="font-semibold text-amber-950">Draft berubah di server</h3><p className="mt-1 text-sm text-amber-900">Server berada di revisi {conflict.latest.revision}; input lokal tetap dipertahankan. Tidak ada overwrite otomatis.</p><div className="mt-3 flex flex-wrap gap-2"><button type="button" className={buttonClass} onClick={copyLocal}>Salin salinan lokal</button><button type="button" className={buttonClass} onClick={reloadLatest}>Muat revisi terbaru</button></div></section>}
          <div className="space-y-7">
            <section className="space-y-4"><h3 className="section-title">Informasi perjalanan</h3>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <Field id={id('tripTitle')} label={label('tripTitle')} value={content.brochure.tripTitle} required maxLength={200} onChange={value => setPath('brochure.tripTitle', value)} />
                <Field id={id('destination')} label={label('destination')} value={content.brochure.destination} required maxLength={200} onChange={value => setPath('brochure.destination', value)} />
                <Field id={id('region')} label={label('region')} value={content.brochure.region} maxLength={200} onChange={value => setPath('brochure.region', value || null)} />
                <Field id={id('country')} label={label('country')} value={content.brochure.country} required maxLength={120} onChange={value => setPath('brochure.country', value)} />
                <div><label htmlFor={id('mode')} className="block text-sm font-medium">{label('itineraryMode')}</label><select id={id('mode')} value={activeMode} onChange={e => requestMode(e.target.value as ItineraryMode)} className={inputClass}>{modes.map(mode => <option key={mode.value} value={mode.value}>{mode.label}</option>)}</select></div>
                <Field id={id('startDate')} label={label('startDate')} type="date" value={content.brochure.startDate} onChange={value => setPath('brochure.startDate', value || null)} />
                {activeMode === 'multi_day' && <Field id={id('endDate')} label={label('endDate')} type="date" value={content.brochure.endDate} onChange={value => setPath('brochure.endDate', value || null)} />}
                <Field id={id('travelerCount')} label={label('travelerCount')} type="number" value={content.brochure.travelerCount} onChange={value => setPath('brochure.travelerCount', value)} />
                <Field id={id('travelerType')} label={label('travelerType')} value={content.brochure.travelerType} maxLength={40} onChange={value => setPath('brochure.travelerType', value || null)} />
                <Field id={id('pace')} label={label('paceLevel')} type="select" value={content.brochure.paceLevel} choices={options.paceLevel} required onChange={value => setPath('brochure.paceLevel', value)} />
                <Field id={id('destinationType')} label={label('destinationType')} type="select" value={content.brochure.destinationType} choices={options.destinationType} required onChange={value => setPath('brochure.destinationType', value)} />
                <Field id={id('agencyName')} label={label('agencyName')} value={content.brochure.agencyName} required maxLength={160} onChange={value => setPath('brochure.agencyName', value)} />
                <Field id={id('agencyContact')} label={label('agencyContact')} value={content.brochure.agencyContact} required maxLength={320} onChange={value => setPath('brochure.agencyContact', value)} />
                <AssetSelect id={id('logo')} label={label('agencyLogo')} value={content.brochure.agencyLogoAssetId} assets={assets} onChange={value => setPath('brochure.agencyLogoAssetId', value)} />
                {activeMode === 'multi_day' && <Field id={id('duration')} label={label('durationDays')} value={content.schedule.at(-1)?.dayEnd || null} disabled onChange={() => {}} />}
                <Field id={id('scope')} label={label('scopeLabel')} value={content.brochure.scopeLabel} disabled onChange={() => {}} />
                <Field id={id('generatedDate')} label={label('generatedDate')} type="date" value={content.brochure.generatedDate} disabled onChange={() => {}} />
                <div><label htmlFor={id('locale')} className="block text-sm font-medium">{label('outputLanguage')} *</label><input id={id('locale')} list={id('locale-options')} value={localeInput} onChange={e => changeLocale(e.target.value)} className={`${inputClass} ${localeError ? 'border-red-600' : ''}`} aria-invalid={Boolean(localeError)} aria-describedby={localeError ? id('locale-error') : id('locale-help')} /><datalist id={id('locale-options')}>{localeOptions.map(option => <option key={option} value={option} />)}</datalist><p id={id('locale-help')} className="mt-1 text-xs text-slate-500">Bahasa {language.source}; pilihan auto belum di-resolve. Manual copy tidak diterjemahkan.</p>{localeError && <p id={id('locale-error')} className="mt-1 text-xs text-red-700">{localeError}</p>}{localeNeedsSupport && <p className="mt-1 text-xs text-amber-800">Katalog/font render untuk {language.outputLanguage} belum tersedia; tidak akan fallback diam-diam.</p>}{language.source === 'unresolved' && <button type="button" disabled={busy || dirty} className={`${buttonClass} mt-2`} onClick={resolveLanguage}>Deteksi bahasa dari brief dan catatan</button>}{languageProposal?.status === 'resolved' && <div className="mt-2 rounded-md bg-teal-50 p-2 text-sm">Proposal bahasa: {languageProposal.locale}. <button type="button" className="font-semibold text-teal-900 underline" onClick={acceptLanguage}>Konfirmasi bahasa</button></div>}</div>
                <TextList id={id('themes')} title={label('themes')} values={content.brochure.themes} maxItems={30} itemMaxLength={120} onChange={values => setPath('brochure.themes', values)} />
              </div>
            </section>

            <section className="space-y-4"><h3 className="section-title">Foto hero dan atribusi</h3><div className="grid gap-4 sm:grid-cols-2">
              <AssetSelect id={id('hero-asset')} label={label('heroPhoto')} value={content.hero.assetId} assets={assets} onChange={value => { edit(next => { next.hero.assetId = value; next.hero.gradientOnly = !value; }); }} />
              <p className="self-end text-sm text-slate-600">{content.hero.gradientOnly || !content.hero.assetId ? 'Hero memakai gradien; foto tidak akan ditampilkan.' : 'Foto dipakai dan memerlukan atribusi sebelum publish.'}</p>
              <Field id={id('hero-photographer')} label={label('photographer')} value={content.hero.photoAttribution?.photographer} maxLength={240} onChange={value => edit(next => { next.hero.photoAttribution = withAttribution(next.hero.photoAttribution, 'photographer', String(value ?? '')); })} />
              <Field id={id('hero-credit-link')} label={label('photographerLink')} type="url" value={content.hero.photoAttribution?.photographerUrl} maxLength={2048} onChange={value => edit(next => { next.hero.photoAttribution = withAttribution(next.hero.photoAttribution, 'photographerUrl', value || null); })} />
              <Field id={id('hero-photo-source')} label={label('photoSource')} value={content.hero.photoAttribution?.source} maxLength={120} onChange={value => edit(next => { next.hero.photoAttribution = withAttribution(next.hero.photoAttribution, 'source', String(value ?? '')); })} />
            </div></section>

            <section className="space-y-4"><h3 className="section-title">Overview</h3><Field id={id('overview')} label={label('overviewSummary')} type="textarea" value={content.overview.summary} required maxLength={4000} rows={5} onChange={value => setPath('overview.summary', value)} />{aiAction('overview.summary', 'Generate overview', 'overview', undefined, text => setPath('overview.summary', text))}
                <div className="grid gap-4 sm:grid-cols-2"><Field id={id('bestSeason')} label={label('bestSeason')} type="textarea" value={content.overview.quickFacts.bestSeason} maxLength={240} onChange={value => setPath('overview.quickFacts.bestSeason', value)} /><Field id={id('derived-facts-scope')} label="Cakupan (turunan)" value={content.overview.quickFacts.scope} disabled onChange={() => {}}/><Field id={id('derived-facts-pace')} label="Tempo (turunan)" value={content.brochure.paceLevel} disabled onChange={() => {}} /><div><span className="block text-sm font-medium">Tema (turunan)</span><div className="mt-2 flex flex-wrap gap-2">{content.brochure.themes.length ? content.brochure.themes.map((theme, index) => <span className="rounded-full bg-teal-50 px-2 py-1 text-xs text-teal-900" key={`${theme}-${index}`}>{theme}</span>) : <span className="text-sm text-slate-500">Belum ada tema.</span>}</div></div></div>
              {activeMode !== 'half_day' && <TextList id={id('route')} title={label('routeSummary')} values={content.overview.routeSummary} maxItems={40} itemMaxLength={300} onChange={values => setPath('overview.routeSummary', values)} />}
              <ObjectList id={id('highlights')} title="Sorotan" rows={content.overview.highlights as any} maxItems={12} fields={[{ key: 'icon', label: label('icon'), maxLength: 40 }, { key: 'title', label: label('highlightTitle'), maxLength: 120 }, { key: 'note', label: label('highlightNote'), type: 'textarea', maxLength: 500 }]} makeRow={() => ({ icon: 'star', title: '', note: '' })} onChange={rows => setPath('overview.highlights', rows)} />
            </section>

            {isScheduled && <section className="space-y-4"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="section-title">Jadwal dan aktivitas</h3>{activeMode === 'multi_day' && <button type="button" disabled={busy || (content.schedule.at(-1)?.dayEnd || 0) >= 14} className={buttonClass} onClick={() => edit(next => next.schedule.push(makeScheduleBlock((next.schedule.at(-1)?.dayEnd || 0) + 1)))}>Tambah hari</button>}</div>
              {!content.schedule.length && activeMode === 'multi_day' && <p className="text-sm text-slate-600">Tambahkan hari satu per satu; rentang maksimal 14 hari.</p>}
              {content.schedule.map((block, blockIndex) => <fieldset key={block.id} className="space-y-4 rounded-xl border border-slate-300 p-4"><legend className="px-2 font-semibold">Hari {block.dayStart}{block.dayEnd > block.dayStart ? `–${block.dayEnd}` : ''} · ID stabil</legend>
                <div className="flex flex-wrap gap-2">{activeMode === 'multi_day' && <><button type="button" className={buttonClass} disabled={blockIndex === 0} onClick={() => reorderBlocks(block.id, -1)}>Naikkan hari</button><button type="button" className={buttonClass} disabled={blockIndex === content.schedule.length - 1} onClick={() => reorderBlocks(block.id, 1)}>Turunkan hari</button><button type="button" className={buttonClass} onClick={() => removeBlock(block.id)}>Hapus hari</button></>}</div>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <Field id={`${id('block')}-${block.id}-title`} label={label('blockTitle')} value={block.title} maxLength={200} onChange={value => updateBlock(block.id, item => { item.title = value; })} />
                  <Field id={`${id('block')}-${block.id}-location`} label={label('location')} value={block.location} maxLength={200} onChange={value => updateBlock(block.id, item => { item.location = value; })} />
                  <Field id={`${id('block')}-${block.id}-date`} label={label('date')} type="date" value={block.date} onChange={value => updateBlock(block.id, item => { item.date = value; })} />
                  {activeMode === 'multi_day' && <div><label className="block text-sm font-medium" htmlFor={`${id('range')}-${block.id}`}>{label('dayEnd')} (rentang)</label><select id={`${id('range')}-${block.id}`} value={block.dayEnd} onChange={e => requestRange(block.id, Number(e.target.value))} className={inputClass}>{Array.from({ length: Math.max(0, 15 - block.dayStart - (content.schedule.at(-1)!.dayEnd - block.dayEnd)) }, (_, index) => block.dayStart + index).map(day => <option key={day} value={day}>{day}</option>)}</select><p className="mt-1 text-xs text-slate-500">Memperpanjang rentang akan menggeser nomor hari berikutnya; tanggal kalender tidak diubah.</p></div>}
                  <AssetSelect id={`${id('block-asset')}-${block.id}`} label={label('regionPhoto')} value={block.assetId} assets={assets} onChange={value => updateBlock(block.id, item => { item.assetId = value; })} />
                  <Field id={`${id('block-credit')}-${block.id}`} label={label('photographer')} value={block.photoAttribution?.photographer} maxLength={240} onChange={value => updateBlock(block.id, item => { item.photoAttribution = withAttribution(item.photoAttribution, 'photographer', String(value ?? '')); })} />
                  <Field id={`${id('block-credit-url')}-${block.id}`} label={label('photographerLink')} type="url" value={block.photoAttribution?.photographerUrl} maxLength={2048} onChange={value => updateBlock(block.id, item => { item.photoAttribution = withAttribution(item.photoAttribution, 'photographerUrl', value || null); })} />
                  <Field id={`${id('block-credit-source')}-${block.id}`} label={label('photoSource')} value={block.photoAttribution?.source} maxLength={120} onChange={value => updateBlock(block.id, item => { item.photoAttribution = withAttribution(item.photoAttribution, 'source', String(value ?? '')); })} />
                  {activeMode === 'multi_day' && <><Field id={`${id('accommodation-name')}-${block.id}`} label={label('accommodationName')} value={block.accommodation?.name} maxLength={160} onChange={value => updateBlock(block.id, item => { item.accommodation = withAccommodation(item.accommodation, 'name', value); })} /><Field id={`${id('accommodation-area')}-${block.id}`} label={label('area')} value={block.accommodation?.area} maxLength={160} onChange={value => updateBlock(block.id, item => { item.accommodation = withAccommodation(item.accommodation, 'area', String(value ?? '')); })} /><Field id={`${id('accommodation-note')}-${block.id}`} label={label('accommodationNote')} type="textarea" value={block.accommodation?.note} maxLength={1000} onChange={value => updateBlock(block.id, item => { item.accommodation = withAccommodation(item.accommodation, 'note', String(value ?? '')); })} /></>}
                  <Field id={`${id('transport')}-${block.id}`} label={label('transport')} type="textarea" value={block.transportNote} maxLength={1000} onChange={value => updateBlock(block.id, item => { item.transportNote = value; })} />
                  <Field id={`${id('block-tip')}-${block.id}`} label={label('localTip')} type="textarea" value={block.blockTip} maxLength={1000} onChange={value => updateBlock(block.id, item => { item.blockTip = value; })} />
                </div>
                <TextList id={`${id('meals')}-${block.id}`} title={label('mealsIncluded')} values={block.mealsIncluded} maxItems={12} itemMaxLength={120} onChange={values => updateBlock(block.id, item => { item.mealsIncluded = values; })} />
                <div className="space-y-3 border-t border-slate-200 pt-4"><div className="flex flex-wrap items-center justify-between gap-2"><h4 className="font-semibold">Aktivitas ({block.activities.length})</h4><button type="button" className={buttonClass} onClick={() => updateBlock(block.id, item => { item.activities.push(makeActivity()); })}>Tambah aktivitas</button></div>
                  {block.activities.map((activity, activityIndex) => <fieldset key={activity.id} className="space-y-3 rounded-lg bg-slate-50 p-3"><legend className="px-1 text-sm font-medium">Aktivitas {activityIndex + 1} · ID tetap saat urut ulang</legend><div className="flex gap-2"><button type="button" className={buttonClass} disabled={activityIndex === 0} onClick={() => updateBlock(block.id, item => { item.activities = moveById(item.activities, activity.id, -1); })}>Naikkan</button><button type="button" className={buttonClass} disabled={activityIndex === block.activities.length - 1} onClick={() => updateBlock(block.id, item => { item.activities = moveById(item.activities, activity.id, 1); })}>Turunkan</button><button type="button" className={buttonClass} onClick={() => { if (block.activities.length > 1 && confirm('Hapus aktivitas ini?')) updateBlock(block.id, item => { item.activities = item.activities.filter((entry: any) => entry.id !== activity.id); }); else if (block.activities.length === 1) setStatus('Blok jadwal harus memiliki minimal satu aktivitas.'); }}>Hapus</button></div>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"><Field id={`${id('activity-time')}-${activity.id}`} label={label('time')} value={activity.timeLabel} required maxLength={80} onChange={value => updateActivity(block.id, activity.id, item => { item.timeLabel = value; })} /><Field id={`${id('activity-type')}-${activity.id}`} label={label('activityType')} type="select" value={activity.type} required choices={options.activityType} onChange={value => updateActivity(block.id, activity.id, item => { item.type = value; })} /><Field id={`${id('activity-title')}-${activity.id}`} label={label('activityTitle')} value={activity.title} required maxLength={200} onChange={value => updateActivity(block.id, activity.id, item => { item.title = value; })} /><Field id={`${id('activity-duration')}-${activity.id}`} label={label('duration')} value={activity.durationLabel} maxLength={80} onChange={value => updateActivity(block.id, activity.id, item => { item.durationLabel = value; })} /><Field id={`${id('activity-area')}-${activity.id}`} label={label('area')} value={activity.area} maxLength={160} onChange={value => updateActivity(block.id, activity.id, item => { item.area = value; })} /><Field id={`${id('activity-category')}-${activity.id}`} label={label('category')} value={activity.category} maxLength={120} onChange={value => updateActivity(block.id, activity.id, item => { item.category = value; })} /><Field id={`${id('activity-description')}-${activity.id}`} label={label('description')} type="textarea" value={activity.description} required maxLength={4000} rows={4} onChange={value => updateActivity(block.id, activity.id, item => { item.description = value; })} /><Field id={`${id('activity-tip')}-${activity.id}`} label={label('localTip')} type="textarea" value={activity.tip} maxLength={1000} onChange={value => updateActivity(block.id, activity.id, item => { item.tip = value; })} />{aiAction(`activity:${activity.id}`, 'Generate deskripsi', 'description', { kind: 'activity', id: activity.id }, text => updateActivity(block.id, activity.id, item => { item.description = text; }))}</div>
                  </fieldset>)}
                </div>
              </fieldset>)}
              {activeMode === 'half_day' && <p className="text-xs text-slate-500">Half day tetap memakai satu blok hari dan tidak menyediakan akomodasi malam.</p>}
            </section>}

            {activeMode === 'destination_guide' && <section className="space-y-4"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="section-title">Tempat tujuan</h3><button type="button" className={buttonClass} onClick={() => edit(next => next.spots.push(makeSpot()))}>Tambah tempat</button></div>
              {!content.spots.length && <p className="text-sm text-slate-600">Tambahkan tempat dan kelompok area. Editor tidak memakai jam timeline.</p>}
              {content.spots.map((spot, spotIndex) => <fieldset key={spot.id} className="space-y-4 rounded-xl border border-slate-300 p-4"><legend className="px-2 font-semibold">Tempat {spotIndex + 1} · ID tetap</legend><div className="flex gap-2"><button type="button" className={buttonClass} disabled={spotIndex === 0} onClick={() => edit(next => { next.spots = moveById(next.spots, spot.id, -1); })}>Naikkan</button><button type="button" className={buttonClass} disabled={spotIndex === content.spots.length - 1} onClick={() => edit(next => { next.spots = moveById(next.spots, spot.id, 1); })}>Turunkan</button><button type="button" className={buttonClass} onClick={() => { if (confirm('Hapus tempat ini dan seluruh kontennya?')) edit(next => { next.spots = next.spots.filter((item: any) => item.id !== spot.id); }); }}>Hapus tempat</button></div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"><Field id={`${id('spot-name')}-${spot.id}`} label={label('placeName')} value={spot.name} required maxLength={200} onChange={value => updateSpot(spot.id, item => { item.name = value; })} /><Field id={`${id('spot-group')}-${spot.id}`} label={label('group')} value={spot.groupLabel} maxLength={160} onChange={value => updateSpot(spot.id, item => { item.groupLabel = value; })} /><Field id={`${id('spot-area')}-${spot.id}`} label={label('area')} value={spot.area} required maxLength={160} onChange={value => updateSpot(spot.id, item => { item.area = value; })} /><Field id={`${id('spot-category')}-${spot.id}`} label={label('category')} value={spot.category} maxLength={120} onChange={value => updateSpot(spot.id, item => { item.category = value; })} /><Field id={`${id('spot-description')}-${spot.id}`} label={label('description')} type="textarea" value={spot.description} required maxLength={6000} rows={5} onChange={value => updateSpot(spot.id, item => { item.description = value; })} /><Field id={`${id('spot-duration')}-${spot.id}`} label={label('suggestedDuration')} value={spot.suggestedDuration} required maxLength={120} onChange={value => updateSpot(spot.id, item => { item.suggestedDuration = value; })} /><Field id={`${id('spot-best-time')}-${spot.id}`} label={label('bestTimeToVisit')} value={spot.bestTimeToVisit} required maxLength={240} onChange={value => updateSpot(spot.id, item => { item.bestTimeToVisit = value; })} /><Field id={`${id('spot-getting-there')}-${spot.id}`} label={label('gettingThere')} type="textarea" value={spot.gettingThere} required maxLength={1000} onChange={value => updateSpot(spot.id, item => { item.gettingThere = value; })} /><Field id={`${id('spot-pairing')}-${spot.id}`} label={label('nearbyPairing')} value={spot.nearbyPairing} maxLength={500} onChange={value => updateSpot(spot.id, item => { item.nearbyPairing = value; })} />{aiAction(`spot:${spot.id}`, 'Generate deskripsi', 'description', { kind: 'spot', id: spot.id }, text => updateSpot(spot.id, item => { item.description = text; }))}</div>
                <TextList id={`${id('spot-tips')}-${spot.id}`} title={`${label('localTip')} *`} values={spot.tips} maxItems={20} itemMaxLength={1000} onChange={values => updateSpot(spot.id, item => { item.tips = values; })} />
                <AssetSelect id={`${id('spot-asset')}-${spot.id}`} label={label('regionPhoto')} value={spot.assetId} assets={assets} onChange={value => updateSpot(spot.id, item => { item.assetId = value; })} />
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"><Field id={`${id('spot-credit')}-${spot.id}`} label={label('photographer')} value={spot.photoAttribution?.photographer} maxLength={240} onChange={value => updateSpot(spot.id, item => { item.photoAttribution = withAttribution(item.photoAttribution, 'photographer', String(value ?? '')); })} /><Field id={`${id('spot-credit-url')}-${spot.id}`} label={label('photographerLink')} type="url" value={spot.photoAttribution?.photographerUrl} maxLength={2048} onChange={value => updateSpot(spot.id, item => { item.photoAttribution = withAttribution(item.photoAttribution, 'photographerUrl', value || null); })} /><Field id={`${id('spot-credit-source')}-${spot.id}`} label={label('photoSource')} value={spot.photoAttribution?.source} maxLength={120} onChange={value => updateSpot(spot.id, item => { item.photoAttribution = withAttribution(item.photoAttribution, 'source', String(value ?? '')); })} /></div>
              </fieldset>)}
            </section>}

            <section className="space-y-4"><h3 className="section-title">Brief dan konteks fakta untuk AI</h3><Field id={id('brief')} label="Brief perjalanan" type="textarea" value={writing.brief} maxLength={20000} rows={4} onChange={value => { markDirty(); setWriting(old => ({ ...old, brief: String(value ?? '') })); }} /><TextList id={id('fact-notes')} title="Catatan fakta itinerary" values={writing.notes.filter(note => note.targetId === 'itinerary').map(note => note.text)} maxItems={100} itemMaxLength={4000} onChange={values => { markDirty(); setWriting(old => ({ ...old, notes: [...old.notes.filter(note => note.targetId !== 'itinerary'), ...values.map(text => ({ targetId: 'itinerary', text }))] })); }} /><p className="text-xs text-slate-500">Catatan adalah data sumber, bukan instruksi kepada AI; tidak mengubah teks brochure.</p></section>

            <section className="space-y-4"><h3 className="section-title">Informasi praktis</h3><div className="grid gap-4 sm:grid-cols-2"><TextList id={id('included')} title={label('included')} values={content.practical.included} maxItems={50} itemMaxLength={500} onChange={values => setPath('practical.included', values)} /><TextList id={id('not-included')} title={label('notIncluded')} values={content.practical.notIncluded} maxItems={50} itemMaxLength={500} onChange={values => setPath('practical.notIncluded', values)} /><TextList id={id('bring')} title={label('whatToBring')} values={content.practical.whatToBring} maxItems={50} itemMaxLength={500} onChange={values => setPath('practical.whatToBring', values)} /><TextList id={id('safety')} title={label('healthSafety')} values={content.practical.healthSafety} maxItems={50} itemMaxLength={500} onChange={values => setPath('practical.healthSafety', values)} /></div>
              <ObjectList id={id('local-tips')} title="Tips lokal" rows={content.practical.localTips as any} maxItems={50} fields={[{ key: 'topic', label: label('topic'), maxLength: 120 }, { key: 'note', label: label('localTip'), type: 'textarea', maxLength: 1000 }]} makeRow={() => ({ topic: '', note: '' })} onChange={rows => setPath('practical.localTips', rows)} />
              <ObjectList id={id('emergency')} title="Kontak darurat" rows={content.practical.emergencyContacts as any} maxItems={30} fields={[{ key: 'label', label: label('emergencyContact'), maxLength: 120 }, { key: 'value', label: label('contactValue'), maxLength: 320 }]} makeRow={() => ({ label: '', value: '' })} onChange={rows => setPath('practical.emergencyContacts', rows)} />
            </section>

            <section className="space-y-4"><h3 className="section-title">Penutup dan kredit</h3><Field id={id('closing-note')} label={label('closingNote')} type="textarea" value={content.closing.closingNote} maxLength={2000} onChange={value => setPath('closing.closingNote', value)} /><Field id={id('closing-contact')} label={`${label('agencyContact')} (turunan)`} value={content.brochure.agencyContact} disabled onChange={() => {}} /><Field id={id('disclaimer')} label={label('disclaimer')} type="textarea" value={content.closing.disclaimer} maxLength={1000} onChange={value => setPath('closing.disclaimer', value)} /><ObjectList id={id('photo-credits')} title={label('photoCredits')} rows={content.closing.photoCredits as any} maxItems={40} fields={[{ key: 'photographer', label: label('photographer'), maxLength: 240 }, { key: 'photographerUrl', label: label('photographerLink'), type: 'url', maxLength: 2048 }, { key: 'source', label: label('photoSource'), maxLength: 120 }]} makeRow={() => ({ photographer: '', photographerUrl: null, source: '' })} onChange={rows => setPath('closing.photoCredits', rows)} /></section>
          </div>
          {sectionErrors.length > 0 && <section aria-label="Kesalahan draft" className="mt-6 rounded-lg border border-red-300 bg-red-50 p-4"><h3 className="font-semibold text-red-900">Periksa field berikut</h3><ul className="mt-2 list-disc pl-5 text-sm text-red-800">{sectionErrors.map((item, index) => <li key={`${item.path}-${index}`}>{item.path}: {item.message}</li>)}</ul></section>}
          {previewDiagnostics && <section aria-label="Publish diagnostics" className="mt-6 rounded-xl border border-slate-300 bg-slate-50 p-4"><h3 className="font-semibold">Pemeriksaan publish</h3>{previewDiagnostics.errors.length === 0 && <p className="mt-2 text-sm text-emerald-800">Tidak ada error publish.</p>}{previewDiagnostics.errors.length > 0 && <ul className="mt-2 space-y-2 text-sm text-red-800">{previewDiagnostics.errors.map((item, index) => <li key={`${item.code}-${item.path}-${index}`}><button type="button" className="text-left underline underline-offset-2" onClick={() => focusDiagnostic(item)}>{item.path ? `${item.path}: ` : ''}{item.message}</button></li>)}</ul>}{previewDiagnostics.warnings.length > 0 && <><h4 className="mt-4 text-sm font-semibold text-amber-900">Peringatan</h4><ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-amber-900">{previewDiagnostics.warnings.map((item, index) => <li key={`${item.code}-${item.path}-${index}`}>{item.path ? `${item.path}: ` : ''}{item.message}</li>)}</ul></>}</section>}
          <section aria-label="Publikasi" className="mt-6 rounded-xl border border-slate-300 p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-semibold">Halaman publik</h3>{publication?.currentVersion && <p className="mt-1 text-sm text-slate-600">Versi {publication.currentVersion.id.slice(0, 8)} · revisi sumber {publication.currentVersion.sourceRevision}{(publication.draftDiffers || dirty) && <span className="text-amber-800"> · draft berbeda dari versi published</span>}</p>}{publication && !publication.active && publication.currentVersion && <p className="mt-1 text-sm text-red-800">Link dicabut; publish ulang akan membuat link baru.</p>}</div><div className="flex flex-wrap gap-2">{publication?.active ? <><button type="button" disabled={busy || dirty} className={buttonClass} onClick={publishSaved}>Publish ulang</button><button type="button" disabled={busy} className={buttonClass} onClick={unpublish}>Cabut link</button></> : <button type="button" disabled={busy || dirty || !record || Boolean(localeError)} className={primaryClass} onClick={publishSaved}>Publish itinerary</button>}</div></div>{publication?.active && publication.shareUrl && <div className="mt-3 flex flex-wrap items-center gap-2"><a className="break-all text-sm text-teal-800 underline" href={publication.shareUrl} target="_blank" rel="noreferrer">{publication.shareUrl}</a><button type="button" className={buttonClass} onClick={copyShareLink}>Salin link</button></div>}{versions.length > 0 && <details className="mt-3"><summary className="cursor-pointer text-sm font-medium">Riwayat published ({versions.length})</summary><ol className="mt-2 list-inside list-decimal space-y-1 text-xs text-slate-600">{versions.map(version => <li key={version.id}>{version.id.slice(0, 8)} · revisi {version.sourceRevision} · {new Date(version.createdAt).toLocaleString()}</li>)}</ol></details>}</section>
          {preview && <section aria-label="Preview itinerary" className="mt-6 rounded-xl border border-slate-300 p-4"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">Preview draft tersimpan · revisi {preview.revision}</h3><div className="flex gap-2"><button type="button" aria-pressed={previewViewport === 'phone'} className={buttonClass} onClick={() => setPreviewViewport('phone')}>Phone</button><button type="button" aria-pressed={previewViewport === 'desktop'} className={buttonClass} onClick={() => setPreviewViewport('desktop')}>Desktop</button></div></div><div className="mt-4 overflow-auto rounded-lg bg-slate-100 p-2"><iframe title="Preview itinerary tersimpan" sandbox="" srcDoc={preview.html} className="mx-auto block h-[720px] border-0 bg-white shadow-sm" style={{ width: previewViewport === 'phone' ? '390px' : '100%', maxWidth: '100%' }} /></div></section>}
        </>}
      </section>
    </div>
    {pendingMode && <div role="presentation" className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4"><section role="dialog" aria-modal="true" aria-labelledby="mode-dialog-title" className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl"><h2 id="mode-dialog-title" className="text-lg font-semibold">Konfirmasi perubahan mode</h2><p className="mt-2 text-sm text-slate-700">Data yang tidak berlaku pada mode baru akan dihapus hanya setelah dikonfirmasi: {hasModeLoss(content!, pendingMode).join(', ')}. Konten umum seperti judul, overview dan informasi praktis dipertahankan.</p><div className="mt-5 flex justify-end gap-2"><button type="button" className={buttonClass} onClick={() => setPendingMode(null)}>Batal</button><button type="button" className={primaryClass} onClick={() => applyMode(pendingMode)}>Konfirmasi dan ubah mode</button></div></section></div>}
    {pendingRange && content && <div role="presentation" className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4"><section role="dialog" aria-modal="true" aria-labelledby="range-dialog-title" className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl"><h2 id="range-dialog-title" className="text-lg font-semibold">Ubah rentang hari</h2><p className="mt-2 text-sm text-slate-700">Rentang diperbarui tanpa menghapus blok atau aktivitas; nomor hari berikutnya bergeser. Tanggal kalender manual tidak diubah dan perlu diperiksa.</p><div className="mt-5 flex justify-end gap-2"><button type="button" className={buttonClass} onClick={() => setPendingRange(null)}>Batal</button><button type="button" className={primaryClass} onClick={applyRange}>Konfirmasi rentang</button></div></section></div>}
  </main>;
}

const runtime = globalThis as typeof globalThis & { itineraryRoot?: ReturnType<typeof createRoot> };
runtime.itineraryRoot ??= createRoot(document.getElementById('root')!);
runtime.itineraryRoot.render(<React.StrictMode><App/></React.StrictMode>);
