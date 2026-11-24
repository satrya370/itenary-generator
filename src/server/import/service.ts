import type { openStore } from '../store.js';
import { createHash } from 'node:crypto';
import type { ImportExtractor, ImportSourceUnit } from '../ai/provider.js';
import { validateDraft } from '../../contracts/validator.js';
import type { ItineraryMode, WebItineraryContent } from '../../contracts/types.js';
import { SOURCE_LAYOUT_UNAVAILABLE_CODE, SOURCE_LAYOUT_UNAVAILABLE_MESSAGE, SOURCE_TEXT_REMOVED_CODE, SOURCE_TEXT_REMOVED_MESSAGE, readSourceTextOrNull, readSourceLayoutOrNull, layoutExcludedLines } from './intake.js';
import { parseDocument, type UnknownValueType } from './parse/extract.js';
import { phonesIn } from './parse/clean.js';
import { readTimeLine } from './parse/time.js';
import { dateFromText } from './normalize.js';
import { batchesOf, filterCompletion, MAX_AI_WALL_CLOCK_MS, requestCompletion, segmentsOf, targetsForBatch, type AcceptedEvidence, type Completion, type Dropped, type SourceUnit } from './complete.js';
import { fitToLimits, missingAfterImport, mergeContent, newDraftBase } from './merge.js';

/** Import service (CP031): deterministic parse, optional AI completion, merge into a new or the open draft, ledger, undo. */

/** Fields a guide may send an unknown label to, by the kind of value. An email has no field and can only be ignored. */
const LABEL_TARGETS: Record<UnknownValueType, string[]> = {
  phone: ['guide.phone'], email: [], url: ['meeting.mapsUrl'], date: ['trip.startDate'], time: ['meeting.time'],
  text: ['guide.name', 'meeting.place', 'trip.destination', 'trip.country', 'policies']
};
const TARGET_PATHS: Record<string, string[]> = {
  'guide.phone': ['guide', 'phone'], 'guide.name': ['guide', 'name'], 'meeting.place': ['meeting', 'place'], 'meeting.mapsUrl': ['meeting', 'mapsUrl'],
  'meeting.time': ['meeting', 'time'], 'trip.destination': ['trip', 'destination'], 'trip.country': ['trip', 'country'], 'trip.startDate': ['trip', 'startDate'], policies: ['policies']
};

/** Targets offered for one unknown label. Destination guides have no schedule, meeting point or start date. */
function labelTargets(valueType: UnknownValueType, mode: ItineraryMode): string[] {
  return LABEL_TARGETS[valueType].filter((target) => mode !== 'destination_guide' || !['meeting.place', 'meeting.mapsUrl', 'meeting.time', 'trip.startDate'].includes(target));
}

/** Reads the value into the shape of its target field, or returns null when it does not fit. Nothing is invented. */
function valueForTarget(target: string, value: string): string | null {
  if (target === 'guide.phone') return phonesIn(value)[0] ?? null;
  if (target === 'trip.startDate') return dateFromText(value).date;
  if (target === 'meeting.time') return readTimeLine(value)?.time ?? null;
  if (target === 'meeting.mapsUrl') { const url = /(https?:\/\/\S+|maps\.app\.goo\.gl\/\S+|goo\.gl\/maps\/\S+)/i.exec(value)?.[0]; return url ? (url.startsWith('http') ? url : `https://${url}`) : null; }
  return value.trim() || null;
}

function writeTarget(draft: WebItineraryContent, target: string, value: string): void {
  const path = TARGET_PATHS[target];
  if (!path) return;
  if (path.length === 1) { (draft as unknown as Record<string, unknown>)[path[0]] = value; return; }
  (draft[path[0] as 'guide' | 'meeting' | 'trip'] as unknown as Record<string, unknown>)[path[1]] = value;
}

type Store = ReturnType<typeof openStore>;
export interface ServiceResult { status: number; body: Record<string, unknown> }
const MODES = new Set<ItineraryMode>(['half_day', 'full_day', 'multi_day', 'destination_guide', 'activity']);
const LOCALES = new Set(['id', 'en', 'fr', 'ja', 'zh-Hans', 'la']);
const UUID4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DROP_MESSAGES: Record<Dropped['code'], string> = {
  IMPORT_QUOTE_NOT_FOUND: 'tidak ada kutipan yang cocok di dokumen; dibiarkan kosong',
  IMPORT_NOT_APPLICABLE: 'tidak berlaku untuk mode ini',
  IMPORT_ACTIVITY_NOT_FOUND: 'aktivitas tidak ditemukan di hasil baca',
  IMPORT_ACTIVITY_AMBIGUOUS: 'judul aktivitas sama di lebih dari satu hari; diisi manual',
  IMPORT_ALREADY_FILLED: 'sudah terisi',
  IMPORT_TARGET_MISMATCH: 'target aktivitas tidak cocok dengan target sumber yang diizinkan',
  IMPORT_COLLECTION_INCOMPLETE: 'koleksi tidak lengkap; kandidat tidak diterapkan ke draf lama',
  IMPORT_SOURCE_UNIT_INCOMPLETE: 'batas kalimat/syarat sumber belum lengkap; perlu review',
  IMPORT_ENTITY_CONTEXT_MISMATCH: 'kutipan tidak berada dalam konteks tempat yang sama'
};
function error(status: number, code: string, message: string): ServiceResult { return { status, body: { error: { code, message } } }; }
function requestFingerprint(sourceId: string, sourceHash: string, input: Record<string, unknown>): string {
  return createHash('sha256').update(JSON.stringify(['import-replay-v1', 'parser-v1', 'extractor-v1', sourceId, sourceHash, input.target, input.mode ?? null, input.itineraryId ?? null, input.expectedRevision ?? null, input.outputLanguage ?? null])).digest('hex');
}

export class ImportService {
  private busy = false;
  constructor(private readonly deps: { store: Store; dataDir: string; extractor: ImportExtractor | null }) {
    // A process that stopped mid-run must not leave "running" rows that block replays forever.
    deps.store.db.prepare("UPDATE import_operations SET status='uncertain', updated_at=? WHERE status='running'").run(new Date().toISOString());
  }

  private languageFor(outputLanguage: string | null, proposal: { status: string; locale: string | null }, defaultLanguage: string | null): { locale: string | null; source: 'explicit' | 'detected' | 'unresolved' } {
    if (outputLanguage) return { locale: outputLanguage, source: 'explicit' };
    if (proposal.status === 'resolved' && proposal.locale) return { locale: proposal.locale, source: 'detected' };
    if (defaultLanguage && LOCALES.has(defaultLanguage)) return { locale: defaultLanguage, source: 'explicit' };
    return { locale: null, source: 'unresolved' };
  }

  async apply(body: unknown, sourceId: string): Promise<ServiceResult> {
    const { store } = this.deps;
    if (!body || typeof body !== 'object' || Array.isArray(body)) return error(400, 'INVALID_REQUEST', 'Kirim operationId dan target import.');
    const input = body as Record<string, unknown>;
    const allowed = ['operationId', 'target', 'mode', 'itineraryId', 'expectedRevision', 'outputLanguage'];
    if (Object.keys(input).some((key) => !allowed.includes(key))) return error(400, 'INVALID_REQUEST', 'Kolom permintaan tidak dikenal.');
    if (typeof input.operationId !== 'string' || !UUID4.test(input.operationId)) return error(400, 'INVALID_REQUEST', 'operationId harus UUID v4.');
    const target = input.target;
    if (target !== 'new' && target !== 'overwrite') return error(400, 'INVALID_REQUEST', 'Pilih draf baru atau timpa draf.');
    const outputLanguage = input.outputLanguage === undefined || input.outputLanguage === null ? null : String(input.outputLanguage);
    if (outputLanguage && !LOCALES.has(outputLanguage)) return error(422, 'INVALID_LANGUAGE', 'Bahasa tidak didukung.');

    const source = store.db.prepare('SELECT language_json, sha256, kind FROM import_sources WHERE id=? AND workspace_id=?').get(sourceId, store.workspaceId) as { language_json: string; sha256: string; kind: string } | undefined;
    const replay = store.db.prepare('SELECT * FROM import_operations WHERE operation_id=? AND workspace_id=?').get(input.operationId, store.workspaceId) as Record<string, unknown> | undefined;
    if (replay) {
      const savedReport = replay.report_json ? JSON.parse(String(replay.report_json)) : null;
      if (!source || !savedReport?._replay || savedReport._replay.fingerprint !== requestFingerprint(sourceId, source.sha256, input)) return error(409, 'IMPORT_NOT_REPEATABLE', 'Permintaan tidak cocok dengan operasi sebelumnya; gunakan operationId baru.');
      if (replay.status === 'completed') {
        if (!savedReport._replay.itinerary) return error(409, 'IMPORT_NOT_REPEATABLE', 'Hasil asli tidak tersedia; mulai import baru.');
        const { _replay } = savedReport;
        return { status: 200, body: { itinerary: _replay.itinerary, report: _replay.report, usage: usageOf(replay), operationId: input.operationId, sourceId: String(replay.source_id), replayed: true } };
      }
      if (replay.status === 'running') return error(409, 'IMPORT_BUSY', 'Import ini masih berjalan.');
      return error(409, 'IMPORT_NOT_REPEATABLE', 'Import dengan operationId ini sudah gagal; mulai dengan operationId baru.');
    }

    if (!source) return error(404, 'NOT_FOUND', 'Sumber import tidak ditemukan.');

    let saved: ReturnType<Store['getItinerary']> = null;
    let mode: ItineraryMode;
    if (target === 'overwrite') {
      if (typeof input.itineraryId !== 'string' || !Number.isInteger(input.expectedRevision)) return error(400, 'INVALID_REQUEST', 'Timpa draf membutuhkan itineraryId dan expectedRevision.');
      saved = store.getItinerary(input.itineraryId);
      if (!saved) return error(404, 'NOT_FOUND', 'Draf tidak ditemukan.');
      if (saved.revision !== input.expectedRevision) return error(409, 'REVISION_CONFLICT', 'Draf sudah berubah sejak dibuka. Muat ulang sebelum import.');
      mode = (saved.draftContent as WebItineraryContent).trip.mode;
    } else {
      if (!MODES.has(input.mode as ItineraryMode)) return error(422, 'INVALID_MODE', 'Pilih mode itinerary terlebih dahulu.');
      mode = input.mode as ItineraryMode;
    }
    if (this.busy) return error(409, 'IMPORT_BUSY', 'Import lain sedang berjalan. Tunggu sebentar.');
    this.busy = true;
    const now = new Date().toISOString();
    try {
      store.db.prepare("INSERT INTO import_operations(operation_id,workspace_id,source_id,itinerary_id,target,mode,status,previous_revision,ai_used,report_json,created_at,updated_at) VALUES(?,?,?,?,?,?,'running',?,0,?,?,?)")
        .run(input.operationId, store.workspaceId, sourceId, saved?.id ?? null, target, mode, saved?.revision ?? null, JSON.stringify({ _replay: { fingerprint: requestFingerprint(sourceId, source.sha256, input) } }), now, now);
    } catch (cause) {
      this.busy = false;
      if (cause instanceof Error && /UNIQUE/i.test(cause.message)) return error(409, 'IMPORT_NOT_REPEATABLE', 'operationId ini sudah dipakai; mulai dengan operationId baru.');
      throw cause;
    }
    try {
      return await this.run({ input, target, mode, saved, outputLanguage, sourceLanguageJson: source.language_json, sourceHash: source.sha256, sourceKind: source.kind, operationId: input.operationId, sourceId });
    } catch (cause) {
      store.db.prepare("UPDATE import_operations SET status='failed', error_code='IMPORT_INTERNAL', updated_at=? WHERE operation_id=? AND workspace_id=? AND status='running'").run(new Date().toISOString(), input.operationId, store.workspaceId);
      throw cause;
    } finally {
      this.busy = false;
    }
  }

  private async run(args: { input: Record<string, unknown>; target: 'new' | 'overwrite'; mode: ItineraryMode; saved: ReturnType<Store['getItinerary']>; outputLanguage: string | null; sourceLanguageJson: string; sourceHash: string; sourceKind: string; operationId: string; sourceId: string }): Promise<ServiceResult> {
    const { store, dataDir, extractor } = this.deps;
    const { target, mode, saved, outputLanguage, operationId, sourceId } = args;
    const text = await readSourceTextOrNull(dataDir, sourceId);
    if (text === null) {
      // The run was already recorded as "running"; close it so the operationId is not stuck and a new one can be used.
      store.db.prepare("UPDATE import_operations SET status='failed', error_code=?, updated_at=? WHERE operation_id=?").run(SOURCE_TEXT_REMOVED_CODE, new Date().toISOString(), operationId);
      return error(404, SOURCE_TEXT_REMOVED_CODE, SOURCE_TEXT_REMOVED_MESSAGE);
    }
    if (args.sourceKind === 'text' && createHash('sha256').update(text, 'utf8').digest('hex') !== args.sourceHash) {
      store.db.prepare("UPDATE import_operations SET status='failed', error_code='IMPORT_SOURCE_CHANGED', updated_at=? WHERE operation_id=?").run(new Date().toISOString(), operationId);
      return error(409, 'IMPORT_SOURCE_CHANGED', 'Teks sumber berubah setelah dibaca; buat intake baru sebelum import.');
    }
    const layout = await readSourceLayoutOrNull(dataDir, sourceId);
    if (args.sourceKind === 'pdf' && !layout) {
      store.db.prepare("UPDATE import_operations SET status='failed', error_code=?, updated_at=? WHERE operation_id=? AND workspace_id=?")
        .run(SOURCE_LAYOUT_UNAVAILABLE_CODE, new Date().toISOString(), operationId, store.workspaceId);
      return error(409, SOURCE_LAYOUT_UNAVAILABLE_CODE, SOURCE_LAYOUT_UNAVAILABLE_MESSAGE);
    }
    const parse = parseDocument(text, mode, layoutExcludedLines(layout, text));
    const { units } = segmentsOf(parse);
    const batchPlan = batchesOf(parse, units);
    const notes = [...parse.notes, ...(layout?.diagnostics.map((item) => item.message) ?? [])];
    if (mode === 'destination_guide') for (const [field, value] of Object.entries(parse.fields.meeting)) if (value) notes.push(`Titik kumpul (${field}) tidak berlaku untuk mode panduan destinasi; fakta sumber tidak diterapkan, periksa teks sumber.`);
    if (mode === 'destination_guide' && parse.fields.trip.startDate) notes.push('Tanggal mulai tidak berlaku untuk mode panduan destinasi; fakta sumber tidak diterapkan, periksa teks sumber.');
    const proposal = JSON.parse(args.sourceLanguageJson) as { status: string; locale: string | null };
    const profile = store.workspace().profile as { defaultCountry?: string; defaultLanguage?: string | null; guides?: Array<{ id: string; name: string; phone: string }> };
    const guides = profile.guides ?? [];
    // Overwrite keeps the language the draft already has, unless the guide chose one in this import.
    const keepsLanguage = target === 'overwrite' && Boolean((saved!.draftContent as WebItineraryContent).trip.language) && !outputLanguage;
    const language: { locale: string | null; source: 'explicit' | 'detected' | 'unresolved' } = keepsLanguage
      ? { locale: null, source: 'unresolved' }
      : this.languageFor(outputLanguage, proposal, profile.defaultLanguage ?? null);

    let completion: Completion = {};
    let dropped: Dropped[] = [];
    let acceptedEvidence: AcceptedEvidence[] = [];
    const batchResults: Array<{ lineIndexes: number[]; sourceUnitIds: string[]; attempts: number; status: 'completed' | 'incomplete'; mappingStatus: 'pending' | 'complete' | 'partial' | 'unmapped'; note: string | null }> = [];
    const modelResponses: Array<{ batchIndex: number; attempt: number; modelId: string | null; generationId: string | null }> = [];
    let usage: { promptTokens: number | null; completionTokens: number | null; actualUsd: number | null } = { promptTokens: 0, completionTokens: 0, actualUsd: null };
    let aiUsed = 0;
    let aiBatches = 0;
    let aiAttempts = 0;
    let checkpointPrompt = 0, checkpointCompletion = 0, checkpointCost = 0, checkpointPending = 0;
    let promptUnknown = false, completionUnknown = false, costUnknown = false;
    const writeUsageCheckpoint = (uncertainOnWriteFailure: boolean) => {
      try {
        const result = store.db.prepare("UPDATE import_operations SET ai_used=1, prompt_tokens=?, completion_tokens=?, actual_usd=?, updated_at=? WHERE operation_id=? AND workspace_id=? AND status='running'")
          .run(checkpointPending || promptUnknown ? null : checkpointPrompt, checkpointPending || completionUnknown ? null : checkpointCompletion, checkpointPending || costUnknown ? null : checkpointCost, new Date().toISOString(), operationId, store.workspaceId);
        if (Number(result.changes) !== 1) throw new Error('Import usage checkpoint did not update the running operation.');
      } catch (cause) {
        if (uncertainOnWriteFailure) {
          // The provider may already have billed; persist a terminal no-replay marker
          // even when the exact token/cost checkpoint failed.
          store.db.prepare("UPDATE import_operations SET status='uncertain', ai_used=1, error_code='IMPORT_USAGE_UNCERTAIN', updated_at=? WHERE operation_id=? AND workspace_id=? AND status='running'")
            .run(new Date().toISOString(), operationId, store.workspaceId);
        }
        throw cause;
      }
    };
    const reserveUsageAttempt = () => { aiUsed = 1; checkpointPending += 1; writeUsageCheckpoint(false); };
    const recordAttemptUsage = (part: { promptTokens: number | null; completionTokens: number | null; costUsd: number | null } | null) => {
      checkpointPending = Math.max(0, checkpointPending - 1);
      if (!part) { promptUnknown = true; completionUnknown = true; costUnknown = true; }
      else {
        if (part.promptTokens === null) promptUnknown = true; else checkpointPrompt += part.promptTokens;
        if (part.completionTokens === null) completionUnknown = true; else checkpointCompletion += part.completionTokens;
        if (part.costUsd === null) costUnknown = true; else checkpointCost += part.costUsd;
      }
      writeUsageCheckpoint(true);
    };
    const omittedUnits: SourceUnit[] = [...batchPlan.omitted, ...parse.unconsumed.filter((line) => line.section === 'layout-ambiguous').map((line) => ({ id: `layout-${line.index}`, lineIndex: line.index, text: line.text, section: line.section, allowedPaths: [], structuralEnd: false }))];
    if (omittedUnits.length) notes.push(`${omittedUnits.length} baris berlayout ambigu, terlalu panjang atau melewati batas 8 batch; tidak dikirim ke AI dan perlu diperiksa manual.`);
    if (batchPlan.batches.length) {
      if (extractor && extractor.credentialState === 'configured') {
        const deadlineAt = Date.now() + MAX_AI_WALL_CLOCK_MS;
        for (let batchIndex = 0; batchIndex < batchPlan.batches.length; batchIndex += 1) {
          const batch = batchPlan.batches[batchIndex];
          if (Date.now() >= deadlineAt) { omittedUnits.push(...batchPlan.batches.slice(batchIndex).flat()); break; }
          const segments = batch.map((unit) => unit.text);
          const sourceUnits: ImportSourceUnit[] = batch.map((unit) => ({ unitId: unit.id, lineIndex: unit.lineIndex, text: unit.text, section: unit.section, ownerTargetId: unit.ownerTargetId ?? null, dayNumber: unit.dayNumber ?? null, allowedPaths: unit.allowedPaths, structuralEnd: unit.structuralEnd }));
          const outcome = await requestCompletion(extractor, { mode, locale: language.locale, segments, sourceUnits, targets: targetsForBatch(parse, batch), deadlineAt, onDispatch: reserveUsageAttempt, onAttemptUsage: recordAttemptUsage });
          batchResults.push({ lineIndexes: batch.map((unit) => unit.lineIndex), sourceUnitIds: batch.map((unit) => unit.id), attempts: outcome.attempts, status: outcome.completion ? 'completed' : 'incomplete', mappingStatus: 'pending', note: outcome.note });
          modelResponses.push(...outcome.responses.map((response, index) => ({ batchIndex, attempt: index + 1, ...response })));
          usage.promptTokens = outcome.usage.promptTokens === null || usage.promptTokens === null ? null : usage.promptTokens + outcome.usage.promptTokens;
          usage.completionTokens = outcome.usage.completionTokens === null || usage.completionTokens === null ? null : usage.completionTokens + outcome.usage.completionTokens;
          usage.actualUsd = outcome.usage.actualUsd === null || usage.actualUsd === null ? null : usage.actualUsd + outcome.usage.actualUsd;
          if (aiBatches === 0 && outcome.attempts > 0) usage.actualUsd = outcome.usage.actualUsd;
          if (outcome.attempts > 0) { aiUsed = 1; aiBatches += 1; aiAttempts += outcome.attempts; }
          if (outcome.completion) {
            const filtered = filterCompletion(outcome.completion, parse, mode, batch);
            completion = combineCompletion(completion, filtered.accepted);
            dropped.push(...filtered.dropped);
            acceptedEvidence.push(...filtered.evidence);
          }
          if (outcome.note) notes.push(outcome.note);
        }
      } else {
        notes.push('AI tidak aktif; bagian yang tidak terbaca kode dibiarkan kosong.');
      }
    }
    const unsent = extractor?.credentialState === 'configured' ? omittedUnits : units;
    if (unsent.length && !notes.some((note) => note.includes('baris terlalu panjang'))) notes.push(`${unsent.length} baris belum dikirim ke AI; periksa bagian itu secara manual.`);

    const unsafeCollections = new Set<string>();
    const structuralDayIssue = parse.notes.some((note) => /hari melompat|penanda hari berulang|urutan nomor hari mundur|nomor hari melebihi|hari pertama|lebih dari \d+ hari|dibatasi/i.test(note));
    const acceptedUnitIds = new Set(acceptedEvidence.flatMap((item) => item.sourceUnitIds));
    const omittedUnitIds = new Set(omittedUnits.map((unit) => unit.id));
    const hasUnresolvedDayText = units.some((unit) => unit.dayNumber !== undefined && !acceptedUnitIds.has(unit.id)) || omittedUnits.some((unit) => unit.dayNumber !== undefined || parse.fields.days.some((day) => day.line < unit.lineIndex));
    if (structuralDayIssue || hasUnresolvedDayText || omittedUnits.some((unit) => unit.dayNumber !== undefined || unit.section === 'layout-ambiguous')) unsafeCollections.add('days');
    for (const list of ['included', 'notIncluded', 'whatToBring', 'notSuitableFor', 'notAllowed', 'localTips']) {
      if (parse.unconsumed.some((line) => line.section === list) || omittedUnits.some((unit) => unit.section === list)) unsafeCollections.add(list);
    }
    if (omittedUnits.some((unit) => unit.section === 'layout-ambiguous')) {
      for (const collection of ['days', 'places', 'included', 'notIncluded', 'whatToBring', 'notSuitableFor', 'notAllowed', 'localTips', 'emergencyContacts', 'activity.highlights', 'activity.steps']) unsafeCollections.add(collection);
    }
    if (parse.notes.some((note) => /Highlight dibatasi/.test(note))) unsafeCollections.add('activity.highlights');
    if (parse.notes.some((note) => /Jalannya kegiatan dibatasi/.test(note))) unsafeCollections.add('activity.steps');
    const coveredPlaceIds = new Set(acceptedEvidence.filter((item) => item.path.startsWith('places[')).flatMap((item) => item.sourceUnitIds));
    if (omittedUnits.some((unit) => unit.allowedPaths.includes('places') || unit.section === 'layout-ambiguous') || dropped.some((item) => item.path.startsWith('places')) || units.some((unit) => unit.allowedPaths.includes('places') && !coveredPlaceIds.has(unit.id))) unsafeCollections.add('places');
    const base = target === 'overwrite' ? (saved!.draftContent as WebItineraryContent) : newDraftBase(mode, profile);
    if (target === 'overwrite' && unsafeCollections.has('days') && completion.activityDetails?.length) {
      dropped.push(...completion.activityDetails.map((detail) => ({ path: `activities[${detail.targetId}]`, code: 'IMPORT_COLLECTION_INCOMPLETE' as const })));
      completion = { ...completion, activityDetails: [] };
    }
    const merged = mergeContent(base, { mode, parse, completion, guides, locale: language.locale, target, unsafeCollections });
    if (merged.retainedCollections.length) notes.push(`Koleksi ${merged.retainedCollections.join(', ')} pada draf lama dipertahankan karena cakupan sumber belum lengkap; tidak digabung otomatis.`);
    notes.push(...fitToLimits(merged.content));
    const checked = validateDraft(merged.content);
    if (!checked.ok) {
      store.db.prepare("UPDATE import_operations SET status='failed', error_code='IMPORT_DRAFT_INVALID', updated_at=? WHERE operation_id=?").run(new Date().toISOString(), operationId);
      const first = checked.errors[0];
      return error(422, 'IMPORT_DRAFT_INVALID', `Hasil import tidak sesuai bentuk draf${first?.path ? ` (bagian: ${first.path})` : ''}; tidak ada yang disimpan.`);
    }
    const persisted = checked.value as WebItineraryContent;
    const appliedEvidence = acceptedEvidence.filter((item) => evidenceWasApplied(item, completion, parse, persisted, merged.filled, merged.retainedCollections));
    const appliedUnitIds = new Set(appliedEvidence.flatMap((item) => item.sourceUnitIds));
    const rejectedUnitIds = new Set(dropped.flatMap((item) => item.proposal?.sourceUnitIds ?? []));
    const mappedBatch = (ids: string[]) => {
      const mapped = ids.filter((id) => appliedUnitIds.has(id)).length;
      return mapped === ids.length ? 'complete' as const : mapped > 0 ? 'partial' as const : 'unmapped' as const;
    };
    for (const batch of batchResults) batch.mappingStatus = mappedBatch(batch.sourceUnitIds);
    const allUnits = [...units, ...omittedUnits.filter((unit) => unit.section === 'layout-ambiguous')];
    const pendingUnits = allUnits.flatMap((unit) => {
      if (appliedUnitIds.has(unit.id)) return [];
      const status = omittedUnitIds.has(unit.id) ? 'omitted' : rejectedUnitIds.has(unit.id) ? 'rejected' : 'pending';
      const reasonCode = status === 'omitted' ? 'IMPORT_SOURCE_OMITTED' : status === 'rejected' ? 'IMPORT_PROPOSAL_REJECTED' : acceptedEvidence.some((item) => item.sourceUnitIds.includes(unit.id)) ? 'IMPORT_MERGE_NOT_PERSISTED' : extractor?.credentialState !== 'configured' ? 'IMPORT_AI_NOT_CONFIGURED' : 'IMPORT_SOURCE_UNMAPPED';
      return [{ unitId: unit.id, lineIndex: unit.lineIndex, section: unit.section, status, reasonCode }];
    });
    if (pendingUnits.length) notes.push(`${pendingUnits.length} unit sumber belum terpetakan ke draf dan perlu diperiksa.`);
    const languageContext = language.source === 'unresolved' && target === 'overwrite'
      ? saved!.languageContext
      : language.locale
        ? { requestedLanguage: language.source === 'detected' ? 'auto' : language.locale, outputLanguage: language.locale, source: language.source }
        : { requestedLanguage: 'auto', outputLanguage: null, source: 'unresolved' };
    const writing = target === 'overwrite' ? saved!.writingContext : { brief: '', notes: [] };

    store.db.exec('BEGIN IMMEDIATE');
    try {
    const record = target === 'new'
      ? store.createItinerary(checked.value, languageContext, writing)
      : store.updateItinerary(saved!.id, Number(args.input.expectedRevision), checked.value, languageContext, writing);
    if (!record) {
      store.db.exec('ROLLBACK');
      store.db.prepare("UPDATE import_operations SET status='failed', error_code='REVISION_CONFLICT', updated_at=? WHERE operation_id=?").run(new Date().toISOString(), operationId);
      return error(409, 'REVISION_CONFLICT', 'Draf sudah berubah sejak dibuka. Muat ulang sebelum import.');
    }
    const report = {
      evidenceVersion: 1,
      review: { version: 1, unknownLabels: parse.unknownLabels.map((item, index) => ({ id: `label-${index + 1}`, label: item.label, value: item.value, line: item.line, valueType: item.valueType, targets: labelTargets(item.valueType, mode), status: 'pending' })), sourceTextHash: createHash('sha256').update(text).digest('hex'), candidates: parse.conflicts.map((conflict, index) => ({ id: `conflict-${index + 1}`, path: conflict.path, lines: conflict.occurrences.map((item) => item.line), status: 'pending' })).filter((item) => mode !== 'destination_guide' || !['date', 'meeting.place', 'meeting.mapsUrl'].includes(item.path)), pendingUnits, unsupported: pendingUnits.length + dropped.filter((item) => !item.proposal).length + (mode === 'destination_guide' ? parse.conflicts.filter((item) => ['date', 'meeting.place', 'meeting.mapsUrl'].includes(item.path)).length : 0), rejectedProposals: dropped.filter((item) => item.proposal).slice(0, 100).map((item, index) => ({ id: `rejected-${index + 1}`, path: item.path, reasonCode: item.code, ...item.proposal })) },
      model: { requested: extractor?.modelId ?? null, responses: modelResponses },
      aiBatches,
      aiAttempts,
      batches: batchResults,
      retainedCollections: merged.retainedCollections,
      retainedReasons: merged.retainedReasons,
      filled: [...new Set(merged.filled)],
      missingRequired: missingAfterImport(checked.value as WebItineraryContent),
      skipped: dropped.map((item) => ({ path: item.path, label: skippedLabel(item.path), message: DROP_MESSAGES[item.code] })),
      notes,
      sourceCount: { days: parse.fields.days.length, activities: parse.fields.days.reduce((n, d) => n + d.activities.length, 0), unconsumed: parse.unconsumed.length },
      coverage: { sourceUnits: allUnits.length, applied: appliedUnitIds.size, pending: pendingUnits.filter((item) => item.status === 'pending').length, rejected: pendingUnits.filter((item) => item.status === 'rejected').length, omitted: pendingUnits.filter((item) => item.status === 'omitted').length },
      evidence: { accepted: appliedEvidence.map(({ quote: _quote, ...reference }) => reference), rejected: dropped.map((item) => ({ path: item.path, reasonCode: item.code, lineIndexes: item.proposal?.lineIndexes ?? [], sourceUnitIds: item.proposal?.sourceUnitIds ?? [] })), omittedLineIndexes: [...new Set(omittedUnits.map((unit) => unit.lineIndex))] }
    };
    const actualUsd = usage.actualUsd;
    store.db.prepare("UPDATE import_operations SET status='completed', itinerary_id=?, result_revision=?, previous_draft_json=?, previous_language_json=?, previous_writing_json=?, ai_used=?, prompt_tokens=?, completion_tokens=?, actual_usd=?, report_json=?, updated_at=? WHERE operation_id=?")
      .run(record.id, record.revision, target === 'overwrite' ? JSON.stringify(saved!.draftContent) : null, target === 'overwrite' ? JSON.stringify(saved!.languageContext) : null, target === 'overwrite' ? JSON.stringify(saved!.writingContext) : null,
        aiUsed, usage.promptTokens, usage.completionTokens, actualUsd, JSON.stringify({ ...report, _replay: { fingerprint: requestFingerprint(sourceId, args.sourceHash, args.input), itinerary: record, report } }), new Date().toISOString(), operationId);
    store.db.exec('COMMIT');
    return { status: target === 'new' ? 201 : 200, body: { itinerary: record, report, usage: { aiUsed, promptTokens: usage.promptTokens, completionTokens: usage.completionTokens, actualUsd }, operationId, sourceId } };
    } catch (cause) { store.db.exec('ROLLBACK'); throw cause; }
  }

  async resolve(operationId: string, body: unknown): Promise<ServiceResult> {
    const { store, dataDir } = this.deps;
    if (!body || typeof body !== 'object' || Array.isArray(body)) return error(400, 'INVALID_REQUEST', 'Kirim keputusan review.');
    const input = body as Record<string, unknown>;
    if (Object.keys(input).some((key) => !['expectedRevision', 'candidateId', 'action', 'line', 'value', 'target'].includes(key)) || !Number.isInteger(input.expectedRevision) || typeof input.candidateId !== 'string' || !['select', 'edit', 'ignore'].includes(String(input.action))) return error(400, 'INVALID_REQUEST', 'Keputusan review tidak valid.');
    const row = store.db.prepare('SELECT * FROM import_operations WHERE operation_id=? AND workspace_id=?').get(operationId, store.workspaceId) as Record<string, unknown> | undefined;
    if (!row || row.status !== 'completed' || row.undone_at) return error(404, 'NOT_FOUND', 'Operasi import tidak ditemukan.');
    const report = JSON.parse(String(row.report_json));
    const candidate = report.review?.version === 1 ? [...report.review.candidates, ...(report.review.unknownLabels ?? [])].find((item: { id: string }) => item.id === input.candidateId) : null;
    if (!candidate || candidate.status !== 'pending') return error(409, 'IMPORT_REVIEW_UNAVAILABLE', 'Kandidat tidak tersedia atau sudah diselesaikan.');
    const text = await readSourceTextOrNull(dataDir, String(row.source_id));
    if (text === null) return error(404, SOURCE_TEXT_REMOVED_CODE, SOURCE_TEXT_REMOVED_MESSAGE);
    if (createHash('sha256').update(text).digest('hex') !== report.review.sourceTextHash) return error(409, 'IMPORT_SOURCE_CHANGED', 'Sumber berubah; mulai import ulang.');
    const source = store.db.prepare('SELECT kind FROM import_sources WHERE id=? AND workspace_id=?').get(String(row.source_id), store.workspaceId) as { kind: string } | undefined;
    if (!source) return error(404, 'NOT_FOUND', 'Sumber import tidak ditemukan.');
    const layout = await readSourceLayoutOrNull(dataDir, String(row.source_id));
    if (source.kind === 'pdf' && !layout) return error(409, SOURCE_LAYOUT_UNAVAILABLE_CODE, SOURCE_LAYOUT_UNAVAILABLE_MESSAGE);
    const parsed = parseDocument(text, row.mode as ItineraryMode, layoutExcludedLines(layout, text));
    if (String(candidate.id).startsWith('label-')) return this.resolveUnknownLabel({ operationId, row, report, candidate, parsed, input, current: store.getItinerary(String(row.itinerary_id)) });
    const index = Number(String(candidate.id).replace(/^conflict-/, '')) - 1;
    const conflict = parsed.conflicts[index];
    if (!conflict || conflict.path !== candidate.path || JSON.stringify(conflict.occurrences.map((item) => item.line)) !== JSON.stringify(candidate.lines)) return error(409, 'IMPORT_REVIEW_UNAVAILABLE', 'Kandidat tidak lagi cocok dengan sumber.');
    const current = store.getItinerary(String(row.itinerary_id));
    if (!current || current.revision !== input.expectedRevision) return error(409, 'REVISION_CONFLICT', 'Draf sudah berubah sejak dibuka.');
    const paths: Record<string, ['trip' | 'guide' | 'meeting', string]> = { destination: ['trip', 'destination'], country: ['trip', 'country'], date: ['trip', 'startDate'], guide: ['guide', 'name'], phone: ['guide', 'phone'], 'meeting.place': ['meeting', 'place'], 'meeting.mapsUrl': ['meeting', 'mapsUrl'] };
    const target = paths[conflict.path];
    if (!target) return error(422, 'IMPORT_REVIEW_UNSUPPORTED', 'Kandidat ini belum dapat diterapkan otomatis.');
    let value: string | undefined;
    if (input.action === 'select') {
      if (!Number.isInteger(input.line)) return error(400, 'INVALID_REQUEST', 'Pilih baris sumber.');
      value = conflict.occurrences.find((item) => item.line === input.line)?.value;
      if (value === undefined) return error(422, 'IMPORT_REVIEW_UNSUPPORTED', 'Baris sumber bukan kandidat.');
    } else if (input.action === 'edit') {
      if (typeof input.value !== 'string' || !input.value.trim()) return error(400, 'INVALID_REQUEST', 'Isi nilai manual.');
      value = input.value.trim();
    }
    const draft = structuredClone(current.draftContent as WebItineraryContent);
    if (value !== undefined) (draft[target[0]] as unknown as Record<string, unknown>)[target[1]] = value;
    return this.commitReview({ operationId, row, report, candidate, current, draft, decision: { action: input.action, provenance: input.action === 'select' ? 'source' : input.action === 'edit' ? 'manual' : null, ...(input.action === 'select' ? { line: input.line } : {}) } });
  }

  /** A guide sends an unknown "Label: value" line to one field, or ignores it. The value is always copied from the source. */
  private resolveUnknownLabel(args: { operationId: string; row: Record<string, any>; report: Record<string, any>; candidate: Record<string, any>; parsed: ReturnType<typeof parseDocument>; input: Record<string, unknown>; current: ReturnType<Store['getItinerary']> }): ServiceResult {
    const { operationId, row, report, candidate, parsed, input, current } = args;
    const item = parsed.unknownLabels.find((entry) => entry.line === candidate.line && entry.label === candidate.label);
    if (!item) return error(409, 'IMPORT_REVIEW_UNAVAILABLE', 'Kandidat tidak lagi cocok dengan sumber.');
    if (!current || current.revision !== input.expectedRevision) return error(409, 'REVISION_CONFLICT', 'Draf sudah berubah sejak dibuka.');
    if (input.action === 'edit') return error(400, 'INVALID_REQUEST', 'Label ini hanya bisa dipetakan ke field atau diabaikan.');
    const draft = structuredClone(current.draftContent as WebItineraryContent);
    const decision: Record<string, unknown> = { action: input.action, provenance: input.action === 'select' ? 'source' : null, target: null, line: candidate.line };
    if (input.action === 'select') {
      const target = typeof input.target === 'string' ? input.target : '';
      if (!candidate.targets.includes(target)) return error(422, 'IMPORT_REVIEW_UNSUPPORTED', 'Field tujuan tidak tersedia untuk label ini.');
      const value = valueForTarget(target, item.value);
      if (value === null) return error(422, 'IMPORT_REVIEW_UNSUPPORTED', 'Nilai dari sumber tidak dapat dibaca sebagai tipe field itu.');
      writeTarget(draft, target, value);
      decision.target = target;
    }
    return this.commitReview({ operationId, row, report, candidate, current, draft, decision, expectedRevision: Number(input.expectedRevision) });
  }

  /** Validates the whole draft, checks that the operation has not changed, writes the draft and records the decision. */
  private commitReview(args: { operationId: string; row: Record<string, any>; report: Record<string, any>; candidate: Record<string, any>; current: NonNullable<ReturnType<Store['getItinerary']>>; draft: WebItineraryContent; decision: Record<string, unknown>; expectedRevision?: number }): ServiceResult {
    const { store } = this.deps;
    const { operationId, row, report, candidate, current, draft, decision } = args;
    const checked = validateDraft(draft);
    if (!checked.ok) return error(422, 'IMPORT_DRAFT_INVALID', 'Nilai tidak sesuai aturan draf.');
    store.db.exec('BEGIN IMMEDIATE');
    try {
      const fresh = store.db.prepare('SELECT status, undone_at, report_json FROM import_operations WHERE operation_id=? AND workspace_id=?').get(operationId, store.workspaceId) as { status: string; undone_at: string | null; report_json: string } | undefined;
      if (!fresh || fresh.status !== 'completed' || fresh.undone_at || fresh.report_json !== row.report_json) {
        store.db.exec('ROLLBACK');
        return error(409, 'IMPORT_REVIEW_UNAVAILABLE', 'Operasi review sudah berubah; muat ulang.');
      }
      const updated = store.updateItinerary(current.id, args.expectedRevision ?? current.revision, checked.value, current.languageContext, current.writingContext);
      if (!updated) { store.db.exec('ROLLBACK'); return error(409, 'REVISION_CONFLICT', 'Draf sudah berubah sejak dibuka.'); }
      candidate.status = decision.action === 'ignore' ? 'ignored' : 'resolved';
      candidate.decision = decision;
      report.missingRequired = missingAfterImport(checked.value as WebItineraryContent);
      store.db.prepare('UPDATE import_operations SET report_json=?, updated_at=? WHERE operation_id=? AND workspace_id=?').run(JSON.stringify(report), new Date().toISOString(), operationId, store.workspaceId);
      store.db.exec('COMMIT');
      const { _replay, ...visibleReport } = report;
      return { status: 200, body: { itinerary: updated, report: visibleReport } };
    } catch (cause) { store.db.exec('ROLLBACK'); throw cause; }
  }

  undo(operationId: string, expectedRevision: unknown): ServiceResult {
    const { store } = this.deps;
    const row = store.db.prepare('SELECT * FROM import_operations WHERE operation_id=? AND workspace_id=?').get(operationId, store.workspaceId) as Record<string, unknown> | undefined;
    if (!row) return error(404, 'NOT_FOUND', 'Operasi import tidak ditemukan.');
    const unavailable = () => error(409, 'IMPORT_UNDO_UNAVAILABLE', 'Draf sudah diubah setelah import; batalkan secara manual.');
    if (row.target !== 'overwrite' || row.status !== 'completed' || row.undone_at) return unavailable();
    const current = store.getItinerary(String(row.itinerary_id));
    if (!current || current.revision !== row.result_revision || expectedRevision !== row.result_revision) return unavailable();
    store.db.exec('BEGIN IMMEDIATE');
    try {
      const restored = store.updateItinerary(current.id, current.revision, JSON.parse(String(row.previous_draft_json)), JSON.parse(String(row.previous_language_json)), JSON.parse(String(row.previous_writing_json)));
      if (!restored) { store.db.exec('ROLLBACK'); return unavailable(); }
      store.db.prepare('UPDATE import_operations SET undone_at=?, updated_at=? WHERE operation_id=? AND workspace_id=?').run(new Date().toISOString(), new Date().toISOString(), operationId, store.workspaceId);
      store.db.exec('COMMIT');
      return { status: 200, body: { itinerary: restored, undone: true } };
    } catch (cause) { store.db.exec('ROLLBACK'); throw cause; }
  }

  latest(itineraryId: string): ServiceResult {
    const { store } = this.deps;
    const latestRow = store.db.prepare('SELECT * FROM import_operations WHERE workspace_id=? AND itinerary_id=? ORDER BY created_at DESC, operation_id DESC LIMIT 1').get(store.workspaceId, itineraryId) as Record<string, unknown> | undefined;
    const successRow = store.db.prepare("SELECT * FROM import_operations WHERE workspace_id=? AND itinerary_id=? AND status='completed' AND undone_at IS NULL ORDER BY created_at DESC, operation_id DESC LIMIT 1").get(store.workspaceId, itineraryId) as Record<string, unknown> | undefined;
    const toDto = (row: Record<string, unknown> | undefined) => {
      if (!row) return null;
      const current = store.getItinerary(itineraryId);
      const undoAvailable = row.target === 'overwrite' && row.status === 'completed' && !row.undone_at && current?.revision === row.result_revision;
      const storedReport = row.undone_at ? null : row.report_json ? JSON.parse(String(row.report_json)) : null;
      if (storedReport) delete storedReport._replay;
      const visibleReport = storedReport && Object.keys(storedReport).length ? storedReport : null;
      return { operationId: row.operation_id, sourceId: row.source_id, status: row.status, errorCode: row.error_code ?? null, target: row.target, report: visibleReport, usage: usageOf(row), undoAvailable, undone: Boolean(row.undone_at) };
    };
    return { status: 200, body: { operation: toDto(latestRow), lastSuccessfulOperation: toDto(successRow) } };
  }
}

const SKIPPED_LABELS: Record<string, string> = { summary: 'Ringkasan', closingNote: 'Catatan penutup', policies: 'Kebijakan', places: 'Tempat', highlights: 'Highlight', steps: 'Langkah kegiatan', 'places[].name': 'Nama tempat', 'places[].area': 'Area tempat', 'places[].description': 'Deskripsi tempat', activityDetails: 'Detail aktivitas' };
const ACTIVITY_FIELDS: Record<string, string> = { place: 'tempat', description: 'deskripsi', tip: 'tips' };
function skippedLabel(path: string): string {
  if (SKIPPED_LABELS[path]) return SKIPPED_LABELS[path];
  const named = /^(?:activityDetails|activities)\[(.*?)\](?:\.(\w+))?$/.exec(path);
  if (named) return `Aktivitas "${named[1]}"${named[2] ? `: ${ACTIVITY_FIELDS[named[2]] ?? named[2]}` : ''}`;
  return path;
}

function usageOf(row: Record<string, unknown>) {
  return { aiUsed: Number(row.ai_used ?? 0), promptTokens: row.prompt_tokens ?? null, completionTokens: row.completion_tokens ?? null, actualUsd: row.actual_usd ?? null };
}

function evidenceWasApplied(evidence: AcceptedEvidence, completion: Completion, parse: ReturnType<typeof parseDocument>, content: WebItineraryContent, filled: string[], retainedCollections: string[]): boolean {
  const path = evidence.path;
  if (path === 'summary') return Boolean(completion.summary && filled.includes('summary') && content.summary === completion.summary.value);
  if (path === 'closingNote') return Boolean(completion.closingNote && filled.includes('closingNote') && content.closingNote === completion.closingNote.value);
  if (path === 'policies') return Boolean(completion.policies && filled.includes('policies') && content.policies === completion.policies.value);
  if (path.startsWith('activities[')) {
    const field = /\.(place|description|tip)$/.exec(path)?.[1] as 'place' | 'description' | 'tip' | undefined;
    const target = /^activity-(\d+)-(\d+)$/.exec(evidence.targetId ?? '');
    const detail = completion.activityDetails?.find((item) => item.targetId === evidence.targetId);
    if (!field || !target || !detail?.[field]) return false;
    const dayNumber = Number(target[1]);
    const line = Number(target[2]) - 1;
    const parsedDay = parse.fields.days.find((day) => day.dayNumber === dayNumber);
    const activityIndex = parsedDay?.activities.findIndex((activity) => activity.line === line) ?? -1;
    const contentDay = content.days.find((day) => day.dayNumber === dayNumber);
    const persistedActivity = activityIndex >= 0 ? contentDay?.activities[activityIndex] : undefined;
    return Boolean(filled.includes(`days[].activities[].${field}`) && persistedActivity?.[field] === detail[field]!.value);
  }
  if (path.startsWith('places[')) {
    if (!completion.places?.length || retainedCollections.includes('places') || !filled.includes('places')) return false;
    const field = /\.(name|area|description)$/.exec(path)?.[1] as 'name' | 'area' | 'description' | undefined;
    if (!field) return false;
    const candidate = completion.places.find((place) => place[field]?.quote === evidence.quote);
    const value = candidate?.[field]?.value;
    return Boolean(value && content.places.some((place) => place[field] === value));
  }
  if (path === 'highlights') {
    const value = completion.highlights?.find((item) => item.quote === evidence.quote)?.value;
    return Boolean(value && filled.includes('activity.highlights[]') && content.activity?.highlights.includes(value));
  }
  if (path === 'steps') {
    const value = completion.steps?.find((item) => item.title.quote === evidence.quote)?.title.value;
    return Boolean(value && filled.includes('activity.steps[].title') && content.activity?.steps.some((step) => step.title === value));
  }
  return false;
}

function combineCompletion(current: Completion, next: Completion): Completion {
  return {
    summary: current.summary ?? next.summary,
    closingNote: current.closingNote ?? next.closingNote,
    policies: current.policies ?? next.policies,
    places: [...(current.places ?? []), ...(next.places ?? [])],
    activityDetails: [...(current.activityDetails ?? []), ...(next.activityDetails ?? [])],
    highlights: [...(current.highlights ?? []), ...(next.highlights ?? [])],
    steps: [...(current.steps ?? []), ...(next.steps ?? [])]
  };
}

