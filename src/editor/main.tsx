import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { api, type AiGenerationResponseDto, type AiPendingDto, type AiPreflightDto, type AiSuggestionDto, type AssetDto, type LanguageResolutionDto, type PreviewDto, type PublicationDto, type PublishedVersionDto, type RecordDto } from '../api/client.js';
import type { ItineraryMode, LanguageContext, WebItineraryContent } from '../contracts/types.js';
import { EditorForm } from './EditorForm.js';
import { buttonClass, inputClass, primaryClass } from './fields.js';
import { modeCopy, statusCopy } from './labels.js';
import { changeMode, hasModeLoss, normalizeBlanks, targetIdFor } from './model.js';
import { fieldMeta, templatePath } from './schema-meta.js';
import { DraftList } from './sections/DraftList.js';
import { CreateFlow } from './create/CreateFlow.js';
import { createCopy } from './create/copy.js';
import { DEFAULT_IMPORT_LIMITS, type ImportLimits } from './import/limits.js';
import { ImportScreen } from './import/ImportScreen.js';
import { ImportReport } from './import/ImportReport.js';
import { importCopy } from './import/copy.js';
import type { ImportApplyDto, ImportOperationDto } from '../api/client.js';
import { ProfileForm, emptyProfile, type AgencyProfile } from './sections/ProfileForm.js';

type ProfileData = { revision: number; profile: AgencyProfile };
import { Stepper, stepTitle } from './wizard/Stepper.js';
import { publishIssues, stepsFor, type PublishIssue, type StepId } from './validation.js';
import { IssuesContext } from './issues.js';
import './style.css';

type Diagnostic = { code: string; path: string; message: string; targetId?: string };
type DiagnosticFields = Diagnostic[] & { errors?: Diagnostic[]; warnings?: Diagnostic[] };
interface ApiFailure extends Error { status?: number; body?: { code?: string; message?: string; fields?: DiagnosticFields } }

function isPendingAiResponse(result: AiGenerationResponseDto): result is AiPendingDto { return 'status' in result && result.status === 'running'; }

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
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [view, setView] = useState<'editor' | 'settings' | 'setup'>('editor');
  const [setupStep, setSetupStep] = useState(0);
  const [records, setRecords] = useState<Array<{ id: string; revision: number; mode: string; title: string; updatedAt: string }>>([]);
  const [visibleRecords, setVisibleRecords] = useState(5);
  const [recordsCursor, setRecordsCursor] = useState<string | null>(null);
  const [recordsLoading, setRecordsLoading] = useState(true);
  const [recordsError, setRecordsError] = useState(false);
  const [recordsRetryMore, setRecordsRetryMore] = useState(false);
  const recordsRequest = useRef(0);
  const recordsLoadingRef = useRef(false);
  const visibleRecordsRef = useRef(5);
  const [assets, setAssets] = useState<AssetDto[]>([]);
  const [record, setRecord] = useState<RecordDto | null>(null);
  const [content, setContent] = useState<WebItineraryContent | null>(null);
  const [language, setLanguage] = useState<LanguageContext>({ requestedLanguage: 'auto', outputLanguage: null, source: 'unresolved' });
  const [localeInput, setLocaleInput] = useState('auto');
  const [localeError, setLocaleError] = useState('');
  const [writing, setWriting] = useState<RecordDto['writingContext']>({ brief: '', notes: [] });
  const [dirty, setDirty] = useState(false);
  const [saveProblem, setSaveProblem] = useState<'failed' | 'invalid' | 'conflict' | null>(null);
  const [pendingSavedAction, setPendingSavedAction] = useState<{ kind: 'preview' | 'publish' | 'import' | 'create' } | { kind: 'open'; id: string } | { kind: 'generate'; task: 'overview' | 'description'; target?: { kind: 'activity' | 'place'; id: string } } | null>(null);
  const [profileDirty, setProfileDirty] = useState(false);
  const [status, setStatus] = useState('Memuat engine…');
  const [capabilities, setCapabilities] = useState<{ ai?: { credentialState?: string }; import?: ImportLimits }>({ ai: { credentialState: 'missing' } });
  const [aiPreflight, setAiPreflight] = useState<AiPreflightDto | null>(null);
  const [busy, setBusy] = useState(false);
  const [aiBusy, setAiBusy] = useState<string | null>(null);
  const [proposals, setProposals] = useState<Record<string, PendingSuggestion>>({});
  const [languageProposal, setLanguageProposal] = useState<LanguageResolutionDto | null>(null);
  const [pendingMode, setPendingMode] = useState<ItineraryMode | null>(null);
  const [conflict, setConflict] = useState<{ latest: RecordDto; local: WebItineraryContent; language: LanguageContext; writing: RecordDto['writingContext'] } | null>(null);
  const [sectionErrors, setSectionErrors] = useState<Diagnostic[]>([]);
  const [preview, setPreview] = useState<PreviewDto | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const previewDialog = useRef<HTMLDivElement>(null);
  const previewTrigger = useRef<HTMLButtonElement>(null);
  const [previewDiagnostics, setPreviewDiagnostics] = useState<{ errors: PreviewDto['errors']; warnings: PreviewDto['warnings'] } | null>(null);
  const [previewViewport, setPreviewViewport] = useState<'phone' | 'desktop'>('phone');
  const [stepIndex, setStepIndex] = useState(0);
  const [attempted, setAttempted] = useState<Partial<Record<StepId, boolean>>>({});
  const [listOpen, setListOpen] = useState(true);
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const [publication, setPublication] = useState<PublicationDto | null>(null);
  const [versions, setVersions] = useState<PublishedVersionDto[]>([]);
  const [importing, setImporting] = useState<null | 'new' | 'overwrite'>(null);
  const [creating, setCreating] = useState(false);
  const [importOperation, setImportOperation] = useState<ImportOperationDto | null>(null);
  const draftRef = useRef<WebItineraryContent | null>(null);
  const saveInFlight = useRef(false);
  const latestLanguage = useRef(language); latestLanguage.current = language;
  const latestWriting = useRef(writing); latestWriting.current = writing;
  const editGeneration = useRef(0);
  const languageProposalGeneration = useRef<number | null>(null);
  const profileGeneration = useRef(0);
  const profileSavedGeneration = useRef(0);
  const pendingPublishIntent = useRef<{ itineraryId: string; expectedRevision: number; operationId: string } | null>(null);
  const hasUnsaved = dirty || profileDirty;

  async function refreshRecords() {
    const request = ++recordsRequest.current;
    setRecordsLoading(true); setRecordsError(false); setRecordsRetryMore(false);
    try {
      let cursor: string | null = null;
      const items: typeof records = [];
      do {
        const page = await api.list(cursor ?? undefined);
        const ids = new Set(items.map(item => item.id));
        items.push(...page.items.filter(item => !ids.has(item.id)));
        cursor = page.nextCursor;
      } while (cursor && items.length < visibleRecordsRef.current);
      if (request === recordsRequest.current) { setRecords(items); setRecordsCursor(cursor); }
    } catch { if (request === recordsRequest.current) setRecordsError(true); }
    finally { if (request === recordsRequest.current) setRecordsLoading(false); }
  }
  async function loadMoreRecords() {
    if (recordsLoadingRef.current) return;
    const nextVisible = visibleRecordsRef.current + 5;
    if (records.length >= nextVisible || !recordsCursor) { visibleRecordsRef.current = nextVisible; setVisibleRecords(nextVisible); return; }
    recordsLoadingRef.current = true;
    const request = ++recordsRequest.current;
    setRecordsLoading(true); setRecordsError(false);
    try {
      let cursor: string | null = recordsCursor;
      const items = [...records];
      while (cursor && items.length < nextVisible) {
        const page = await api.list(cursor);
        const ids = new Set(items.map(item => item.id));
        items.push(...page.items.filter(item => !ids.has(item.id)));
        cursor = page.nextCursor;
      }
      if (request === recordsRequest.current) { setRecords(items); setRecordsCursor(cursor); visibleRecordsRef.current = nextVisible; setVisibleRecords(nextVisible); }
    } catch { if (request === recordsRequest.current) { setRecordsError(true); setRecordsRetryMore(true); } }
    finally { recordsLoadingRef.current = false; if (request === recordsRequest.current) setRecordsLoading(false); }
  }
  async function refresh() {
    const [context, nextProfile, , nextAssets] = await Promise.all([api.context(), api.profile(), refreshRecords(), api.assets()]);
    setCapabilities(context.capabilities);
    if (profileGeneration.current === profileSavedGeneration.current) setProfile(nextProfile);
    if (nextProfile?.profile && nextProfile.profile.setupCompleted !== true) setView('setup');
    setAssets(nextAssets.items);
  }
  useEffect(() => { refresh().then(() => setStatus('Engine tersambung')).catch(() => setStatus('Engine belum tersambung. Jalankan server lokal lalu muat ulang.')); }, []);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (hasUnsaved) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn);
  }, [hasUnsaved]);
  useEffect(() => {
    if (!pendingMode) return;
    const dialog = document.querySelector<HTMLElement>('[aria-modal="true"]');
    dialog?.querySelector<HTMLElement>('button')?.focus();
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { setPendingMode(null); } };
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, [pendingMode]);
  useEffect(() => {
    if (!previewOpen) return;
    const dialog = previewDialog.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog?.querySelector<HTMLButtonElement>('button')?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') { event.preventDefault(); setPreviewOpen(false); return; }
      if (event.key !== 'Tab' || !dialog) return;
      const items = [...dialog.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], iframe, [tabindex]:not([tabindex="-1"])')];
      if (!items.length) return;
      if (event.shiftKey && document.activeElement === items[0]) { event.preventDefault(); items.at(-1)?.focus(); }
      else if (!event.shiftKey && document.activeElement === items.at(-1)) { event.preventDefault(); items[0].focus(); }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => { document.body.style.overflow = previousOverflow; window.removeEventListener('keydown', onKeyDown); requestAnimationFrame(() => previewTrigger.current?.focus()); };
  }, [previewOpen]);

  function markDirty() { editGeneration.current++; languageProposalGeneration.current = null; setLanguageProposal(null); setDirty(true); setSaveProblem(current => current === 'conflict' ? current : null); setSectionErrors([]); setPreview(null); setPreviewDiagnostics(null); }
  function edit(mutator: (next: WebItineraryContent) => void) {
    const current = draftRef.current;
    if (!current) return;
    markDirty();
    const next = structuredClone(current);
    mutator(next);
    draftRef.current = next;
    setContent(next);
  }

  function installRecord(loaded: RecordDto) {
    setImportOperation(null);
    setStepIndex(0); setAttempted({}); setListOpen(false); setTouched(new Set());
    editGeneration.current++;
    languageProposalGeneration.current = null;
    draftRef.current = loaded.draftContent;
    setRecord(loaded); setContent(loaded.draftContent); setLanguage(loaded.languageContext); setLocaleInput(loaded.languageContext.outputLanguage || 'auto');
    setLocaleError(''); setWriting(loaded.writingContext); setDirty(false); setSaveProblem(null); setPendingSavedAction(null); setSectionErrors([]); setConflict(null); setProposals({}); setLanguageProposal(null); setPreview(null); setPreviewOpen(false); setPreviewDiagnostics(null);
  }
  function canDiscard() { return !dirty || confirm(`Draft memiliki perubahan belum disimpan. Buang draft lokal dan lanjutkan?${profileDirty ? ' Perubahan profil akan tetap tersimpan di formulir.' : ''}`); }
  function startCreate() {
    if (dirty && !saveProblem && !localeError) { setPendingSavedAction({ kind: 'create' }); setStatus('Menunggu perubahan tersimpan sebelum membuat itinerary…'); }
    else if (canDiscard()) setCreating(true);
  }
  function startImport() {
    if (dirty && !saveProblem && !localeError) { setPendingSavedAction({ kind: 'import' }); setStatus('Menunggu perubahan tersimpan sebelum membuka import…'); }
    else if (!dirty) setImporting('overwrite');
  }
  async function open(id: string) {
    if (dirty && !saveProblem && !localeError) { setPendingSavedAction({ kind: 'open', id }); setStatus('Menunggu perubahan tersimpan sebelum membuka draft…'); return; }
    if (!canDiscard()) return;
    setBusy(true); try { const loaded = await api.get(id); installRecord(loaded); const [published, history] = await Promise.all([api.publication(id), api.versions(id)]); setPublication(published); setVersions(history.items); setStatus(`Draft dibuka · revisi ${loaded.revision}`); api.latestImport(id).then(({ operation }) => setImportOperation(operation && operation.status === 'completed' && !importReportClosed(operation.operationId) ? operation : null)).catch(() => {}); } catch (e) { setStatus((e as Error).message); } finally { setBusy(false); }
  }
  async function create(mode: ItineraryMode) {
    if (!canDiscard()) return;
    if (profileDirty && !confirm('Profil operator belum disimpan. Draft baru akan menyalin profil terakhir yang tersimpan. Lanjutkan?')) return;
    setBusy(true); try { const created = await api.create(mode); installRecord(created); setPublication(null); setVersions([]); await refresh().catch(() => {}); setStatus('Draft baru tersimpan'); } catch (e) { setStatus((e as Error).message); } finally { setBusy(false); }
  }
  async function finishImport(result: ImportApplyDto & { target: 'new' | 'overwrite' }) {
    installRecord(result.itinerary); setImporting(null); setPublication(null); setVersions([]);
    setImportOperation({ operationId: result.operationId, sourceId: result.sourceId, status: 'completed', target: result.target, report: result.report, usage: result.usage, undoAvailable: result.target === 'overwrite' });
    await refresh().catch(() => {});
    setStatus(result.target === 'new' ? 'Draf baru dari import tersimpan' : 'Draf diganti dari import; batalkan tersedia selama belum diedit.');
    api.publication(result.itinerary.id).then(setPublication).catch(() => {});
  }
  async function undoImport() {
    if (!record || !importOperation) return;
    setBusy(true);
    try {
      const undone = await api.undoImport(importOperation.operationId, record.revision);
      installRecord(undone.itinerary); setImportOperation(null);
      setStatus('Import dibatalkan; draf kembali seperti sebelum import.');
    } catch (caught) { setStatus(importCopy.undoUnavailable + ' ' + ((caught as Error).message || '')); }
    finally { setBusy(false); }
  }
  function changeLocale(raw: string) {
    setLocaleInput(raw); setLocaleError('');
    setLanguageProposal(null);
    if (!raw || raw.toLowerCase() === 'auto') {
      setLanguage({ requestedLanguage: 'auto', outputLanguage: null, source: 'unresolved' });
      edit(next => { next.trip.language = null; }); return;
    }
    try {
      const locale = Intl.getCanonicalLocales(raw)[0];
      if (!locale) throw new Error('invalid');
      setLanguage({ requestedLanguage: locale, outputLanguage: locale, source: 'explicit' });
      edit(next => { next.trip.language = locale; });
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
    if (target.kind === 'place') return draft.places.some(place => place.id === target.id);
    return draft.days.some(day => day.activities.some(activity => activity.id === target.id));
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
    } catch (caught) { const error = caught as ApiFailure; setStatus(error.body?.message || error.message); }
    finally { setBusy(false); }
  }
  async function checkProvider() {
    setBusy(true);
    try {
      const result = await api.aiPreflight(); setAiPreflight(result);
      setStatus(`Provider terautentikasi · ${result.modelId} · input $${(result.pricing!.prompt * 1_000_000).toFixed(2)}/1M token`);
    } catch (caught) { const error = caught as ApiFailure;
      setAiPreflight(null); setStatus(error.body?.message || 'Preflight provider gagal; key tidak ditampilkan.');
    } finally { setBusy(false); }
  }
  function acceptLanguage() {
    if (!languageProposal?.locale || !record || languageProposal.itineraryId !== record.id || languageProposal.revision !== record.revision || languageProposalGeneration.current !== editGeneration.current) { languageProposalGeneration.current = null; setLanguageProposal(null); setStatus('Hasil deteksi sudah usang; deteksi ulang.'); return; }
    languageProposalGeneration.current = null;
    setLanguage({ requestedLanguage: 'auto', outputLanguage: languageProposal.locale, source: 'detected' });
    setLocaleInput(languageProposal.locale); edit(next => { next.trip.language = languageProposal.locale; }); setLanguageProposal(null);
  }
  async function generate(task: 'overview' | 'description', target?: { kind: 'activity' | 'place'; id: string }) {
    if (!record || !content) return;
    if (dirty && !saveProblem && !localeError) { setPendingSavedAction({ kind: 'generate', task, target }); setStatus('Menunggu perubahan tersimpan sebelum meminta AI…'); return; }
    if (dirty || localeError) { setStatus('Simpan semua perubahan itinerary dan bahasa sebelum Generate.'); return; }
    if (target && !findTarget(content, target)) { setStatus('Aktivitas atau tempat sudah berubah; pilih kembali.'); return; }
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
    } catch (caught) { const error = caught as ApiFailure;
      const code = error.body?.code;
      setStatus(code === 'AI_DAILY_LIMIT' || code === 'AI_RATE_LIMIT' ? error.body?.message ?? error.message : code === 'AI_RESULT_STALE' ? 'Target atau revisi berubah; usulan tidak diterapkan.' : `AI tidak tersedia: ${error.body?.message || error.message}`);
    } finally { setAiBusy(null); }
  }
  function proposalPanel(key: string, setter: (text: string) => void, apply: (text: string) => void) {
    const proposal = proposals[key];
    if (!proposal) return null;
    return <SuggestionPanel proposal={proposal} canApply={proposalValid(proposal)} onText={setter} onDiscard={() => setProposals(old => { const next = { ...old }; delete next[key]; return next; })} onApply={() => { const text = proposal.text; if (proposalValid(proposal)) { apply(text); setProposals(old => { const next = { ...old }; delete next[key]; return next; }); setStatus('Saran diterapkan ke field lokal; tekan Simpan draft untuk menyimpannya.'); } }} />;
  }
  function aiAction(key: string, labelText: string, task: 'overview' | 'description', target?: { kind: 'activity' | 'place'; id: string }, apply?: (text: string) => void) {
    const proposal = proposals[key];
    const ready = capabilities.ai?.credentialState === 'configured' && Boolean(language.outputLanguage) && language.source !== 'unresolved' && !saveProblem && !localeError;
    return <div className="sm:col-span-2"><button type="button" disabled={!ready || (busy && !saveInFlight.current) || aiBusy !== null || Boolean(pendingSavedAction)} className={buttonClass} title={!ready ? 'Simpan draft, pilih bahasa, dan konfigurasikan key pada server sebelum Generate.' : undefined} onClick={() => generate(task, target)}>{aiBusy === key ? 'Menunggu usulan…' : labelText}</button>{!ready && <span className="ml-2 text-xs text-slate-500">{statusCopy.saveBeforeAi}</span>}{proposal && proposalPanel(key, text => setProposals(old => ({ ...old, [key]: { ...old[key], text } })), text => { if (apply) apply(text); })}</div>;
  }
  function requestMode(mode: ItineraryMode) {
    if (!content || mode === content.trip.mode) return;
    if (hasModeLoss(content, mode).length) setPendingMode(mode);
    else applyMode(mode);
  }
  function applyMode(mode: ItineraryMode) {
    edit(next => Object.assign(next, changeMode(next, mode))); setPendingMode(null);
  }
  async function save() {
    if (!record || !content || localeError || saveInFlight.current || saveProblem === 'conflict') return;
    saveInFlight.current = true;
    const generation = editGeneration.current;
    const submitted = normalizeBlanks(draftRef.current || content);
    setSaveProblem(null); setBusy(true); setStatus('Menyimpan…');
    try {
      const saved = await api.save(record, submitted, language, writing); setRecord(saved); setConflict(null); setPublication(current => current ? { ...current, draftRevision: saved.revision, draftDiffers: Boolean(current.currentVersion && current.currentVersion.sourceRevision !== saved.revision) } : current);
      if (editGeneration.current === generation) { draftRef.current = saved.draftContent; setContent(saved.draftContent); setLanguage(saved.languageContext); setWriting(saved.writingContext); setDirty(false); setProposals({}); setStatus(`Tersimpan · revisi ${saved.revision}`); }
      else setStatus(`Revisi ${saved.revision} tersimpan; edit terbaru masih belum disimpan.`);
      await refresh().catch(() => {});
    } catch (caught) { const e = caught as ApiFailure;
      if (e.status === 409) {
        setSaveProblem('conflict');
        try { const latest = await api.get(record.id); setConflict({ latest, local: structuredClone(draftRef.current || content), language: structuredClone(latestLanguage.current), writing: structuredClone(latestWriting.current) }); setStatus(`Konflik: versi tersimpan sudah di revisi ${latest.revision}; perubahan lokal tetap aman.`); }
        catch { setStatus('Konflik revisi; perubahan lokal tetap aman, tetapi versi terbaru belum dapat dimuat.'); }
      } else if (e.status === 422) { if (editGeneration.current === generation) { setSaveProblem('invalid'); setSectionErrors((e.body?.fields ?? []).map(item => ({ ...item, targetId: item.targetId ?? targetIdFor(draftRef.current ?? submitted, item.path) }))); setStatus('Draft memiliki data yang perlu diperbaiki sebelum dapat disimpan.'); } }
      else { setSaveProblem('failed'); setStatus(`Gagal menyimpan: ${e.message}`); }
    } finally { saveInFlight.current = false; setBusy(false); }
  }
  useEffect(() => {
    if (!dirty || !record || localeError || busy || aiBusy || importing || creating || saveProblem) return;
    const timer = window.setTimeout(() => { void save(); }, 1000);
    return () => window.clearTimeout(timer);
  }, [dirty, record, content, language, writing, localeError, busy, aiBusy, importing, creating, saveProblem]);
  async function previewSaved() {
    if (!record || dirty) { setStatus('Simpan draft terlebih dahulu sebelum preview.'); return; }
    const generation = editGeneration.current;
    setBusy(true); setStatus('Membuat preview dari draft tersimpan…'); setPreview(null); setPreviewDiagnostics(null);
    try {
      const result = await api.preview(record.id, record.revision);
      if (generation !== editGeneration.current || result.itineraryId !== record.id || result.revision !== record.revision) { setStatus('Preview usang karena draft berubah; simpan dan coba lagi.'); return; }
      setPreview(result); setPreviewDiagnostics({ errors: result.errors, warnings: result.warnings }); setPreviewOpen(true);
      setStatus(result.publishReady ? 'Preview siap · draft memenuhi pemeriksaan publish.' : 'Preview siap · perbaiki diagnostics publish sebelum publish.');
    } catch (caught) { const e = caught as ApiFailure;
      const diagnostics = e.body?.fields;
      setPreviewDiagnostics({ errors: diagnostics?.errors || [{ code: e.body?.code || 'PREVIEW_FAILED', path: '', message: e.body?.message || e.message }], warnings: diagnostics?.warnings || [] });
      const firstError = diagnostics?.errors?.[0]?.message;
      setStatus(e.status === 409 ? 'Draft berubah; simpan lalu buat preview baru.' : `Preview belum tersedia: ${firstError || e.body?.message || e.message}`);
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
    } catch (caught) { const e = caught as ApiFailure;
      if (typeof e.status === 'number' && pendingPublishIntent.current?.operationId === intent.operationId) pendingPublishIntent.current = null;
      const diagnostics = e.body?.fields;
      if (diagnostics?.errors) setPreviewDiagnostics({ errors: diagnostics.errors, warnings: diagnostics.warnings || [] });
      setStatus(`Publish gagal: ${e.body?.message || e.message}`);
    } finally { setBusy(false); }
  }
  useEffect(() => {
    if (!pendingSavedAction) return;
    if ((listOpen && pendingSavedAction.kind !== 'open' && pendingSavedAction.kind !== 'create') || creating || importing) { setPendingSavedAction(null); return; }
    if (busy || aiBusy) return;
    if (saveProblem || localeError) { const action = pendingSavedAction; setPendingSavedAction(null); if (action.kind === 'open') void open(action.id); else if (action.kind === 'create' && canDiscard()) setCreating(true); return; }
    if (dirty) return;
    setPendingSavedAction(null);
    if (pendingSavedAction.kind === 'preview') void previewSaved();
    else if (pendingSavedAction.kind === 'publish') void publishSaved();
    else if (pendingSavedAction.kind === 'open') void open(pendingSavedAction.id);
    else if (pendingSavedAction.kind === 'create') setCreating(true);
    else if (pendingSavedAction.kind === 'import') setImporting('overwrite');
    else if (pendingSavedAction.kind === 'generate') void generate(pendingSavedAction.task, pendingSavedAction.target);
  }, [pendingSavedAction, dirty, busy, aiBusy, saveProblem, localeError, listOpen, creating, importing]);
  async function unpublish() {
    if (!record || !publication?.active || !confirm('Cabut link publik? Link lama tidak akan aktif lagi.')) return;
    setBusy(true);
    try { const result = await api.unpublish(record.id, publication.epoch); setPublication(await api.publication(record.id)); setStatus(`Link dicabut · epoch ${result.epoch}`); }
    catch (caught) { const e = caught as ApiFailure; setStatus(`Gagal mencabut link: ${e.body?.message || e.message}`); }
    finally { setBusy(false); }
  }
  async function copyShareLink() {
    if (!publication?.shareUrl) return;
    try { await navigator.clipboard.writeText(publication.shareUrl); setStatus('Link publik disalin.'); }
    catch { setStatus('Clipboard tidak tersedia; gunakan link publik yang terlihat.'); }
  }
  async function shareLink() {
    if (!publication?.shareUrl) return;
    if (!navigator.share) { await copyShareLink(); return; }
    try { await navigator.share({ title: content?.trip.title || 'Itinerary', url: publication.shareUrl }); }
    catch (error) { if ((error as Error).name !== 'AbortError') await copyShareLink(); }
  }

  function labelFor(path: string, mode: ItineraryMode) {
    try { return fieldMeta(templatePath(path), mode).label; } catch { return path; }
  }
  function importReportClosed(operationId: string) { try { return localStorage.getItem(`import-report-closed:${operationId}`) === '1'; } catch { return false; } }
  function focusDiagnostic(d: { path: string; targetId?: string }) {
    const template = templatePath(d.path);
    const scoped = d.targetId ? document.querySelector<HTMLElement>(`[data-target-id="${CSS.escape(d.targetId)}"]`) : null;
    const root: ParentNode = scoped ?? document;
    const all = [...root.querySelectorAll<HTMLElement>('[data-field-path]')];
    const listIndex = /\[(\d+)\]$/.exec(d.path);
    const rowIndex = /^[A-Za-z]+\[(\d+)\]\.[A-Za-z]+$/.exec(d.path);
    let el = listIndex ? all.filter(e => e.dataset.fieldPath === template)[Number(listIndex[1])]
      : rowIndex && !scoped ? all.filter(e => e.dataset.fieldPath === template)[Number(rowIndex[1])] : undefined;
    el ??= all.find(e => e.dataset.fieldPath === template)
      ?? all.find(e => e.dataset.fieldPath?.startsWith(`${template}.`))
      ?? all.find(e => e.dataset.fieldPath?.startsWith(template))
      ?? scoped ?? undefined;
    if (!el) return;
    for (let p = el.parentElement; p; p = p.parentElement) if (p instanceof HTMLDetailsElement) p.open = true;
    const stepEl = el.closest<HTMLElement>('[data-step]');
    if (stepEl) {
      stepEl.hidden = false;
      const index = steps.indexOf(stepEl.dataset.step as StepId);
      if (index >= 0) goToStep(index);
    }
    el.focus(); el.scrollIntoView({ block: 'center' });
  }

  async function reloadLatest() {
    if (!conflict || !confirm('Ganti buffer lokal dengan versi server terbaru? Perubahan lokal akan dibuang.')) return;
    installRecord(conflict.latest); setStatus(`Versi terbaru dimuat · revisi ${conflict.latest.revision}`);
  }
  async function copyLocal() {
    if (!conflict) return;
    try { await navigator.clipboard.writeText(JSON.stringify({ draftContent: draftRef.current ?? conflict.local, languageContext: latestLanguage.current, writingContext: latestWriting.current }, null, 2)); setStatus('Salinan perubahan lokal disalin; tidak ada overwrite ke server.'); }
    catch { setStatus('Clipboard tidak tersedia; perubahan lokal tetap ada di formulir.'); }
  }
  async function saveProfile() {
    if (!profile) return;
    const generation = profileGeneration.current;
    setBusy(true);
    try {
      const saved = await api.saveProfile(profile.revision, profile.profile);
      if (profileGeneration.current === generation) { profileSavedGeneration.current = generation; setProfile(saved); setProfileDirty(false); }
      else setProfile(current => current && { ...current, revision: saved.revision });
      setStatus(profileGeneration.current === generation ? 'Profil tersimpan' : 'Profil tersimpan; perubahan profil terbaru belum disimpan.');
    } catch (caught) { const e = caught as ApiFailure; setStatus(e.status === 409 ? 'Konflik profil; muat ulang sebelum menyimpan.' : e.message); }
    finally { setBusy(false); }
  }
  async function upload(file?: File) {
    if (!file) return;
    setBusy(true);
    try { const uploaded = await api.upload(file); setAssets(old => [uploaded, ...old]); setStatus(`Aset tersimpan · ${uploaded.width}×${uploaded.height}`); }
    catch (e) { setStatus((e as Error).message); }
    finally { setBusy(false); }
  }
  function agencyProfile(): AgencyProfile {
    return { ...emptyProfile, ...(profile?.profile ?? {}) } as AgencyProfile;
  }
  function setAgencyProfile(next: AgencyProfile) {
    profileGeneration.current++; setProfileDirty(true);
    setProfile(old => old && { ...old, profile: next });
  }
  async function uploadAsset(file: File): Promise<AssetDto | null> {
    setBusy(true);
    try { const uploaded = await api.upload(file); setAssets(old => [uploaded, ...old]); setStatus(`Foto tersimpan · ${uploaded.width}×${uploaded.height}`); return uploaded; }
    catch (caught) { setStatus((caught as Error).message); return null; }
    finally { setBusy(false); }
  }
  async function uploadLogo(file: File) {
    setBusy(true);
    try { const uploaded = await api.upload(file); setAssets(old => [uploaded, ...old]); setAgencyProfile({ ...agencyProfile(), agencyLogoAssetId: uploaded.id }); setStatus(`Logo tersimpan · ${uploaded.width}×${uploaded.height}`); }
    catch (caught) { setStatus((caught as Error).message); }
    finally { setBusy(false); }
  }
  async function finishSetup() {
    if (!profile) return;
    const next = { ...agencyProfile(), setupCompleted: true };
    setAgencyProfile(next);
    setBusy(true);
    try {
      const saved = await api.saveProfile(profile.revision, next);
      setProfile(saved); setProfileDirty(false); profileSavedGeneration.current = profileGeneration.current;
      setView('editor'); setStatus('Setup selesai; profil tersimpan.');
    } catch (caught) { setStatus((caught as Error & { status?: number }).status === 409 ? 'Konflik profil; muat ulang lalu selesaikan Setup.' : (caught as Error).message); }
    finally { setBusy(false); }
  }
  function changeProfile(key: string, value: string) {
    profileGeneration.current++; setProfileDirty(true);
    setProfile(old => old && { ...old, profile: { ...old.profile, [key]: value } });
  }

  const recordId = record?.id || 'draft';
  const activeMode = content?.trip.mode;
  const localeNeedsSupport = language.outputLanguage !== null && !localeSupported(language.outputLanguage);
  const pendingLoss = content && pendingMode ? hasModeLoss(content, pendingMode) : [];
  const steps = content ? stepsFor(content.trip.mode) : [];
  const current: StepId = steps[Math.min(stepIndex, steps.length - 1)] ?? 'info';
  const issues = content ? publishIssues(content) : [];
  const issueCounts = issues.reduce<Partial<Record<StepId, number>>>((counts, issue) => ({ ...counts, [issue.step]: (counts[issue.step] ?? 0) + 1 }), {});
  const stepIssues = issues.filter((issue) => issue.step === current);
  const showStepIssues = attempted[current] === true || current === 'publish';
  const issueByKey = new Map(issues.map((issue) => [issue.key, issue]));
  const issuesApi = {
    issueFor: (key: string) => {
      const issue = issueByKey.get(key);
      if (!issue) return null;
      return touched.has(key) || attempted[issue.step] === true || current === 'publish' ? issue.message : null;
    },
    touch: (key: string) => setTouched((old) => (old.has(key) ? old : new Set(old).add(key)))
  };
  function goToStep(index: number) { setStepIndex(Math.max(0, Math.min(index, steps.length - 1))); }
  function focusIssue(issue: PublishIssue) {
    const index = steps.indexOf(issue.step);
    if (index >= 0) goToStep(index);
    const targetId = issue.key.split('|')[0] || undefined;
    setTimeout(() => focusDiagnostic({ path: issue.path, targetId }), 0);
  }
  const aiConfigured = capabilities.ai?.credentialState === 'configured';
  const importLimits: ImportLimits = { ...DEFAULT_IMPORT_LIMITS, ...(capabilities.import ?? {}) };
  const aiHint = ({ missing: statusCopy.aiMissing, ambiguous: statusCopy.aiAmbiguous, unavailable: statusCopy.aiUnavailable } as Record<string, string>)[capabilities.ai?.credentialState ?? ''];
  const modelText = aiPreflight?.modelId && aiPreflight.modelId !== 'openai/gpt-6-luna' ? `Model: ${aiPreflight.modelId}` : statusCopy.modelLabel;
  const aiExtra = (
    <div className="space-y-2">
      <p className="text-xs text-slate-600">{aiConfigured ? (aiPreflight ? `${aiPreflight.daily.usedToday}/${aiPreflight.daily.dailyLimit} operasi hari ini.` : 'AI aktif di server.') : `${statusCopy.aiNotActive} ${aiHint ?? ''}`}</p>
      <button type="button" disabled={busy} className={buttonClass} onClick={checkProvider}>Periksa model dan koneksi</button>
      <p className="text-xs text-slate-500">{modelText}</p>
      <p className="text-xs text-slate-500">{statusCopy.saveBeforeAi}</p>
    </div>
  );

  if (view === 'setup' || view === 'settings') {
    const isSetup = view === 'setup';
    const steps = ['Agensi', 'Default', 'Guide'];
    const sectionFor = isSetup ? (['agency', 'defaults', 'guides'] as const)[setupStep] : 'all';
    const stepBody = <ProfileForm profile={agencyProfile()} assets={assets} busy={busy} section={sectionFor} onChange={setAgencyProfile} onUpload={uploadLogo} />;
    return <main className="mx-auto min-h-screen max-w-2xl px-4 py-8 text-slate-900">
      <p role="status" aria-live="polite" className="text-sm text-slate-600">{status}</p>
      <h1 className="mt-2 text-2xl font-bold">{isSetup ? 'Setup agensi' : 'Pengaturan'}</h1>
      {isSetup && <p className="mt-1 text-sm text-slate-600">Langkah {setupStep + 1} dari {steps.length} · {steps[setupStep]}</p>}
      <div className="mb-28 mt-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">{stepBody}</div>
      <div className="sticky bottom-0 mt-6 flex justify-between gap-3 border-t border-slate-200 bg-white px-1 py-3 shadow-[0_-4px_12px_rgba(15,23,42,0.06)]">
        {isSetup ? <>
          <button type="button" disabled={setupStep === 0} className={buttonClass} onClick={() => setSetupStep(s => s - 1)}>Kembali</button>
          {setupStep < steps.length - 1
            ? <button type="button" className={primaryClass} onClick={() => setSetupStep(s => s + 1)}>Lanjut</button>
            : <button type="button" disabled={busy} className={primaryClass} onClick={finishSetup}>Selesai</button>}
        </> : <>
          <button type="button" className={buttonClass} onClick={() => setView('editor')}>Kembali ke draf</button>
          <button type="button" disabled={busy || !profileDirty} className={primaryClass} onClick={saveProfile}>Simpan</button>
        </>}
      </div>
    </main>;
  }

  return <><main inert={previewOpen} className="mx-auto min-h-screen max-w-7xl px-4 py-8 text-slate-900 sm:px-6 lg:px-8">
    <header className="mb-8 flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 pb-5">
      <div><p className="text-sm font-semibold uppercase tracking-widest text-teal-700">Itinerary Engine · lokal</p><h1 className="mt-2 text-3xl font-bold tracking-tight">Ruang kerja perjalanan</h1></div>
      <div className="flex flex-wrap items-center gap-3"><p role="status" aria-live="polite" className="text-sm text-slate-600">{status}</p>{content && !listOpen && !creating && !importing && <button type="button" className={buttonClass} onClick={() => setListOpen(true)}>Draf saya</button>}{content && !listOpen && <button type="button" className={buttonClass} disabled={(busy && !saveInFlight.current) || profileDirty || creating || Boolean(saveProblem) || Boolean(localeError) || Boolean(pendingSavedAction)} title={profileDirty ? importCopy.entryOpenDirty : creating ? createCopy.inFlow : undefined} onClick={startImport}>{importCopy.entryOpen}</button>}<button type="button" className={buttonClass} disabled={creating} onClick={() => setView('settings')}>Pengaturan</button></div>
    </header>
    <div className="mx-auto grid max-w-4xl gap-6">
      <aside className={creating || importing || (content && !listOpen) ? 'hidden' : 'space-y-5'}>
        <section className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
          <h2 className="font-semibold">Buat draft baru</h2>
          <button type="button" className={`${primaryClass} mt-3 min-h-[44px] w-full sm:w-auto`} disabled={(busy && !saveInFlight.current) || Boolean(pendingSavedAction)} onClick={startCreate}>{createCopy.start}</button>
          {content && <button type="button" className={`${buttonClass} mt-3 min-h-[44px] w-full sm:ml-3 sm:w-auto`} onClick={() => setListOpen(false)}>Lanjutkan draft</button>}
        </section>
        <section className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
          <h2 className="font-semibold">Draft tersimpan</h2>
          <DraftList records={records.slice(0, visibleRecords)} onOpen={open} busy={(busy && !saveInFlight.current) || Boolean(pendingSavedAction)} />
          {recordsLoading && <p className="mt-3 text-sm text-slate-600">Memuat draft…</p>}
          {recordsError && <div role="alert" className="mt-3 text-sm text-red-800">Daftar draft belum dapat dimuat. <button type="button" className="min-h-[44px] underline focus-visible:outline-2 focus-visible:outline-teal-700" onClick={() => void (recordsRetryMore ? loadMoreRecords() : refreshRecords())}>Coba lagi</button></div>}
          {!recordsLoading && !recordsError && records.length === 0 && <p className="mt-3 text-sm text-slate-600">Belum ada itinerary. Buat itinerary untuk memulai.</p>}
          {!recordsLoading && !recordsError && (records.length > visibleRecords || recordsCursor) && <button type="button" className={`${buttonClass} mt-3 min-h-[44px] w-full`} onClick={() => void loadMoreRecords()}>Muat lebih banyak</button>}
        </section>
      </aside>
      <section className={`min-w-0 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-7 ${!creating && !importing && (!content || listOpen) ? 'hidden' : ''}`}>
        {creating ? <CreateFlow aiActive={importLimits.aiConfigured} limits={importLimits} busy={busy} onCancel={() => setCreating(false)} onManual={(next) => { setCreating(false); void create(next); }} onImported={(result) => { setCreating(false); void finishImport(result); }} /> : importing ? <ImportScreen target={importing} draftMode={activeMode ?? null} draftId={record?.id ?? null} draftRevision={record?.revision ?? null} aiActive={importLimits.aiConfigured} limits={importLimits} onCancel={() => setImporting(null)} onDone={finishImport} /> : !content || !activeMode ? <div className="grid min-h-80 place-items-center gap-4 text-center text-slate-500"><p>Pilih atau buat draft untuk mulai.</p><button type="button" className={primaryClass} disabled={busy} onClick={() => { if (canDiscard()) setCreating(true); }}>{createCopy.start}</button></div> : <>
          {importOperation && <ImportReport operation={importOperation} busy={busy} labelFor={(path) => labelFor(path, activeMode ?? 'half_day')} onJump={(path) => focusDiagnostic({ path, targetId: draftRef.current ? targetIdFor(draftRef.current, path) : undefined })} onUndo={undoImport} onClose={() => { try { localStorage.setItem(`import-report-closed:${importOperation.operationId}`, '1'); } catch { /* storage unavailable: the panel just returns next time */ } setImportOperation(null); }} />}
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4"><div><p className="text-xs font-semibold uppercase tracking-wide text-teal-800">{createCopy.editorStep}</p><div className="flex flex-wrap items-center gap-2"><h2 className="text-xl font-semibold">{content.trip.title || 'Tanpa judul'}</h2><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${modeCopy[activeMode].badge}`}>{modeCopy[activeMode].title}</span></div><p className="mt-1 text-sm text-slate-600">{dirty ? saveInFlight.current ? 'Menyimpan…' : saveProblem ? 'Belum tersimpan · periksa pesan di atas' : 'Perubahan akan disimpan otomatis' : `Tersimpan · revisi ${record?.revision}`}{profileDirty ? ' · profil belum disimpan' : ''}</p></div><div className="flex gap-2"><button ref={previewTrigger} type="button" disabled={(busy && !saveInFlight.current) || !record || Boolean(localeError) || Boolean(saveProblem) || Boolean(pendingSavedAction)} onClick={() => { if (dirty) { setStatus('Menunggu perubahan tersimpan sebelum preview…'); setPendingSavedAction({ kind: 'preview' }); } else void previewSaved(); }} className={buttonClass}>Preview</button><button type="button" disabled={busy || !dirty || Boolean(localeError) || saveProblem === 'conflict'} onClick={save} className={primaryClass}>{saveProblem === 'failed' ? 'Coba lagi' : 'Simpan draft'}</button></div></div>
          <div className="lg:grid lg:grid-cols-[14rem_minmax(0,1fr)] lg:gap-6">
          <div className="sticky top-0 z-10 -mx-1 mb-4 bg-white px-1 py-2 lg:top-4 lg:z-0 lg:mx-0 lg:mb-0 lg:self-start lg:px-0"><Stepper steps={steps} mode={activeMode ?? 'half_day'} current={stepIndex} issueCounts={issueCounts} onSelect={goToStep} /><p className="mt-2 text-xs font-semibold text-slate-700 lg:hidden">Langkah {stepIndex + 1} dari {steps.length} · {stepTitle(current, activeMode ?? 'half_day')}</p></div>
          <div className="min-w-0">
          {showStepIssues && stepIssues.length > 0 && <section aria-label="Isian wajib" className="mb-5 rounded-lg border border-red-300 bg-red-50 p-4"><h3 className="font-semibold text-red-900">Lengkapi isian berikut</h3><ul className="mt-2 space-y-1 text-sm text-red-800">{stepIssues.map((issue) => <li key={`${issue.key}-${issue.path}`}><button type="button" className="text-left underline underline-offset-2" onClick={() => focusIssue(issue)}>{labelFor(issue.path, activeMode)}: {issue.message}</button></li>)}</ul></section>}
          {sectionErrors.length > 0 && <section aria-label="Kesalahan draft" className="mt-6 rounded-lg border border-red-300 bg-red-50 p-4"><h3 className="font-semibold text-red-900">Periksa field berikut</h3><ul className="mt-2 list-disc pl-5 text-sm text-red-800">{sectionErrors.map((item, index) => <li key={`${item.path}-${index}`}><button type="button" data-diagnostic-path={item.path} className="text-left underline underline-offset-2" onClick={() => focusDiagnostic(item)}>{labelFor(item.path, activeMode ?? 'half_day')}: {item.message}</button></li>)}</ul></section>}
          {conflict && <section aria-label="Konflik revisi" className="mb-5 rounded-lg border border-amber-400 bg-amber-50 p-4"><h3 className="font-semibold text-amber-950">Draft berubah di server</h3><p className="mt-1 text-sm text-amber-900">Server berada di revisi {conflict.latest.revision}; input lokal tetap dipertahankan. Tidak ada overwrite otomatis.</p><div className="mt-3 flex flex-wrap gap-2"><button type="button" className={buttonClass} onClick={copyLocal}>Salin salinan lokal</button><button type="button" className={buttonClass} onClick={reloadLatest}>Muat revisi terbaru</button></div></section>}
          <IssuesContext.Provider value={issuesApi}>
          <EditorForm activeStep={current} content={content} mode={activeMode} recordId={recordId} assets={assets} meta={fieldMeta} patch={edit}
            onModeChange={requestMode} agencyName={profile?.profile.agencyName ?? ''} onFocusProfile={() => setView('settings')}
            localeInput={localeInput} localeError={localeError} language={language} localeNeedsSupport={localeNeedsSupport} languageProposal={languageProposal}
            onLocaleChange={changeLocale} onDetectLanguage={resolveLanguage} onAcceptLanguage={acceptLanguage} busy={busy} dirty={dirty}
            localeSupportedCheck={localeSupported(language.outputLanguage)} aiAction={aiAction}
            writing={writing} onWritingChange={next => { markDirty(); setWriting(next); }} aiAssistExtra={aiExtra} guides={agencyProfile().guides} onUploadAsset={uploadAsset} />
          </IssuesContext.Provider>
          <div data-step="publish" hidden={current !== 'publish'}>
          {previewDiagnostics && <section aria-label="Publish diagnostics" className="mt-6 rounded-xl border border-slate-300 bg-slate-50 p-4"><h3 className="font-semibold">Pemeriksaan publish</h3>{previewDiagnostics.errors.length === 0 && <p className="mt-2 text-sm text-emerald-800">Tidak ada error publish.</p>}{previewDiagnostics.errors.length > 0 && <ul className="mt-2 space-y-2 text-sm text-red-800">{previewDiagnostics.errors.map((item, index) => <li key={`${item.code}-${item.path}-${index}`}><button type="button" data-diagnostic-path={item.path} className="text-left underline underline-offset-2" onClick={() => focusDiagnostic(item)}>{item.path ? `${labelFor(item.path, activeMode)}: ` : ''}{item.message}</button></li>)}</ul>}{previewDiagnostics.warnings.length > 0 && <><h4 className="mt-4 text-sm font-semibold text-amber-900">Peringatan</h4><ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-amber-900">{previewDiagnostics.warnings.map((item, index) => <li key={`${item.code}-${item.path}-${index}`}><button type="button" data-diagnostic-path={item.path} className="text-left underline underline-offset-2" onClick={() => focusDiagnostic(item)}>{item.path ? `${labelFor(item.path, activeMode)}: ` : ''}{item.message}</button></li>)}</ul></>}</section>}
          {issues.length > 0 && <p className="mt-6 text-sm font-semibold text-red-800">Lengkapi {issues.length} isian wajib sebelum publish. <button type="button" className="ml-2 underline underline-offset-2" onClick={() => focusIssue(issues[0])}>Tunjukkan</button></p>}
          <section aria-label="Publikasi" className="mt-6 rounded-xl border border-slate-300 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div><h3 className="font-semibold">Halaman publik</h3>{publication?.currentVersion && <p className="mt-1 text-sm text-slate-600">Versi {publication.currentVersion.id.slice(0, 8)} · revisi sumber {publication.currentVersion.sourceRevision}{(publication.draftDiffers || dirty) && <span className="text-amber-800"> · draft berbeda dari versi published</span>}</p>}{publication && !publication.active && publication.currentVersion && <p className="mt-1 text-sm text-red-800">Link dicabut; publish ulang akan membuat link baru.</p>}</div>
              <div className="flex flex-wrap gap-2"><button type="button" disabled={(busy && !saveInFlight.current) || !record || Boolean(localeError) || Boolean(saveProblem) || Boolean(pendingSavedAction) || issues.length > 0} className={publication?.active ? buttonClass : primaryClass} onClick={() => { if (dirty) { setStatus('Menunggu perubahan tersimpan sebelum publish…'); setPendingSavedAction({ kind: 'publish' }); } else void publishSaved(); }}>{publication?.active ? 'Publish ulang' : 'Publish itinerary'}</button>{publication?.active && <button type="button" disabled={busy} className={buttonClass} onClick={unpublish}>Cabut link</button>}</div>
            </div>
            {publication?.active && publication.shareUrl && <div className="mt-3 flex flex-wrap items-center gap-2"><a className="break-all text-sm text-teal-800 underline" href={publication.shareUrl} target="_blank" rel="noreferrer">{publication.shareUrl}</a><button type="button" className={buttonClass} onClick={shareLink}>Bagikan</button><button type="button" className={buttonClass} onClick={copyShareLink}>Salin link</button></div>}
            {versions.length > 0 && <details className="mt-3"><summary className="cursor-pointer text-sm font-medium">Riwayat published ({versions.length})</summary><ol className="mt-2 list-inside list-decimal space-y-1 text-xs text-slate-600">{versions.map(version => <li key={version.id}>{version.id.slice(0, 8)} · revisi {version.sourceRevision} · {new Date(version.createdAt).toLocaleString()}</li>)}</ol></details>}
          </section>
          </div>
          <div className="sticky bottom-0 -mx-1 mt-6 flex justify-between gap-3 border-t border-slate-200 bg-white px-1 py-3">
            <button type="button" disabled={stepIndex === 0} className={buttonClass} onClick={() => goToStep(stepIndex - 1)}>Kembali</button>
            {current !== 'publish' && <button type="button" className={primaryClass} onClick={() => { setAttempted(old => ({ ...old, [current]: true })); if (stepIssues.length === 0) goToStep(stepIndex + 1); }}>Lanjut</button>}
          </div>
          </div>
          </div>
        </>}
      </section>
    </div>
    {pendingMode && <div role="presentation" className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4"><section role="dialog" aria-modal="true" aria-labelledby="mode-dialog-title" className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl"><h2 id="mode-dialog-title" className="text-lg font-semibold">Ganti tipe itinerary?</h2><p className="mt-2 text-sm text-slate-700">Data berikut tidak berlaku pada tipe baru dan akan dihapus setelah Anda konfirmasi:</p><ul className="mt-2 list-disc pl-5 text-sm text-slate-800">{pendingLoss.map(item => <li key={item}>{item}</li>)}</ul><p className="mt-2 text-sm text-slate-700">Judul, ringkasan, info praktis, ketentuan dan penutup tetap dipertahankan.</p><div className="mt-5 flex justify-end gap-2"><button type="button" className={buttonClass} onClick={() => setPendingMode(null)}>Batal</button><button type="button" className={primaryClass} onClick={() => applyMode(pendingMode)}>Ganti tipe</button></div></section></div>}
  </main>{previewOpen && preview && <div ref={previewDialog} role="dialog" aria-modal="true" aria-labelledby="preview-heading" className="fixed inset-0 z-50 overflow-y-auto bg-slate-100 text-slate-900">
    <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3"><button type="button" className={`${buttonClass} min-h-[44px]`} onClick={() => setPreviewOpen(false)}>Kembali mengedit</button><div className="flex gap-2"><button type="button" aria-pressed={previewViewport === 'phone'} className={`${buttonClass} min-h-[44px]`} onClick={() => setPreviewViewport('phone')}>Phone</button><button type="button" aria-pressed={previewViewport === 'desktop'} className={`${buttonClass} min-h-[44px]`} onClick={() => setPreviewViewport('desktop')}>Desktop</button></div></div>
      <h2 id="preview-heading" className="mt-5 text-lg font-semibold">Preview itinerary</h2>
      <p className="mt-1 text-sm text-slate-600">Draft tersimpan · revisi {preview.revision}{preview.publishReady ? ' · siap dipublish' : ' · masih ada isian yang perlu diperiksa'}</p>
      <div className="mt-4 rounded-lg bg-slate-200 p-1 sm:p-3"><iframe title="Preview itinerary tersimpan" sandbox="" srcDoc={preview.html} className={`mx-auto block h-[calc(100dvh-12rem)] min-h-[480px] w-full border-0 bg-white shadow-sm ${previewViewport === 'phone' ? 'sm:max-w-[390px]' : ''}`} /></div>
    </div>
  </div>}</>;
}

const runtime = globalThis as typeof globalThis & { itineraryRoot?: ReturnType<typeof createRoot> };
runtime.itineraryRoot ??= createRoot(document.getElementById('root')!);
runtime.itineraryRoot.render(<React.StrictMode><App/></React.StrictMode>);
