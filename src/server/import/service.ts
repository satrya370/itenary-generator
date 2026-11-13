import type { openStore } from '../store.js';
import type { ImportExtractor } from '../ai/provider.js';
import { validateDraft } from '../../contracts/validator.js';
import type { ItineraryMode, WebItineraryContent } from '../../contracts/types.js';
import { SOURCE_TEXT_REMOVED_CODE, SOURCE_TEXT_REMOVED_MESSAGE, readSourceTextOrNull, readSourceLayoutOrNull, layoutExcludedLines } from './intake.js';
import { parseDocument } from './parse/extract.js';
import { batchesOf, filterCompletion, MAX_AI_WALL_CLOCK_MS, requestCompletion, segmentsOf, targetsForBatch, type AcceptedEvidence, type Completion, type Dropped, type SourceUnit } from './complete.js';
import { fitToLimits, missingAfterImport, mergeContent, newDraftBase } from './merge.js';

/** Import service (CP031): deterministic parse, optional AI completion, merge into a new or the open draft, ledger, undo. */

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

    const replay = store.db.prepare('SELECT * FROM import_operations WHERE operation_id=? AND workspace_id=?').get(input.operationId, store.workspaceId) as Record<string, unknown> | undefined;
    if (replay) {
      if (replay.status === 'completed') return { status: 200, body: { itinerary: store.getItinerary(String(replay.itinerary_id)), report: JSON.parse(String(replay.report_json)), usage: usageOf(replay), operationId: input.operationId, sourceId: String(replay.source_id), replayed: true } };
      if (replay.status === 'running') return error(409, 'IMPORT_BUSY', 'Import ini masih berjalan.');
      return error(409, 'IMPORT_NOT_REPEATABLE', 'Import dengan operationId ini sudah gagal; mulai dengan operationId baru.');
    }

    const source = store.db.prepare('SELECT * FROM import_sources WHERE id=? AND workspace_id=?').get(sourceId, store.workspaceId) as { language_json: string } | undefined;
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
      store.db.prepare("INSERT INTO import_operations(operation_id,workspace_id,source_id,itinerary_id,target,mode,status,previous_revision,ai_used,created_at,updated_at) VALUES(?,?,?,?,?,?,'running',?,0,?,?)")
        .run(input.operationId, store.workspaceId, sourceId, saved?.id ?? null, target, mode, saved?.revision ?? null, now, now);
    } catch (cause) {
      this.busy = false;
      if (cause instanceof Error && /UNIQUE/i.test(cause.message)) return error(409, 'IMPORT_NOT_REPEATABLE', 'operationId ini sudah dipakai; mulai dengan operationId baru.');
      throw cause;
    }
    try {
      return await this.run({ input, target, mode, saved, outputLanguage, sourceLanguageJson: source.language_json, operationId: input.operationId, sourceId });
    } catch (cause) {
      store.db.prepare("UPDATE import_operations SET status='failed', error_code='IMPORT_INTERNAL', updated_at=? WHERE operation_id=?").run(new Date().toISOString(), input.operationId);
      throw cause;
    } finally {
      this.busy = false;
    }
  }

  private async run(args: { input: Record<string, unknown>; target: 'new' | 'overwrite'; mode: ItineraryMode; saved: ReturnType<Store['getItinerary']>; outputLanguage: string | null; sourceLanguageJson: string; operationId: string; sourceId: string }): Promise<ServiceResult> {
    const { store, dataDir, extractor } = this.deps;
    const { target, mode, saved, outputLanguage, operationId, sourceId } = args;
    const text = await readSourceTextOrNull(dataDir, sourceId);
    if (text === null) {
      // The run was already recorded as "running"; close it so the operationId is not stuck and a new one can be used.
      store.db.prepare("UPDATE import_operations SET status='failed', error_code=?, updated_at=? WHERE operation_id=?").run(SOURCE_TEXT_REMOVED_CODE, new Date().toISOString(), operationId);
      return error(404, SOURCE_TEXT_REMOVED_CODE, SOURCE_TEXT_REMOVED_MESSAGE);
    }
    const layout = await readSourceLayoutOrNull(dataDir, sourceId);
    const parse = parseDocument(text, mode, layoutExcludedLines(layout, text));
    const { units } = segmentsOf(parse);
    const batchPlan = batchesOf(parse, units);
    const notes = [...parse.notes, ...(layout?.diagnostics.map((item) => item.message) ?? [])];
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
    const batchResults: Array<{ lineIndexes: number[]; attempts: number; status: 'completed' | 'incomplete'; note: string | null }> = [];
    let usage: { promptTokens: number | null; completionTokens: number | null; actualUsd: number | null } = { promptTokens: 0, completionTokens: 0, actualUsd: null };
    let aiUsed = 0;
    let aiBatches = 0;
    let aiAttempts = 0;
    const omittedUnits: SourceUnit[] = [...batchPlan.omitted, ...parse.unconsumed.filter((line) => line.section === 'layout-ambiguous').map((line) => ({ lineIndex: line.index, text: line.text, section: line.section }))];
    if (omittedUnits.length) notes.push(`${omittedUnits.length} baris berlayout ambigu, terlalu panjang atau melewati batas 8 batch; tidak dikirim ke AI dan perlu diperiksa manual.`);
    if (batchPlan.batches.length) {
      if (extractor && extractor.credentialState === 'configured') {
        const deadlineAt = Date.now() + MAX_AI_WALL_CLOCK_MS;
        for (let batchIndex = 0; batchIndex < batchPlan.batches.length; batchIndex += 1) {
          const batch = batchPlan.batches[batchIndex];
          if (Date.now() >= deadlineAt) { omittedUnits.push(...batchPlan.batches.slice(batchIndex).flat()); break; }
          const segments = batch.map((unit) => unit.section ? `[${unit.section}] ${unit.text}` : unit.text);
          const outcome = await requestCompletion(extractor, { mode, locale: language.locale, segments, targets: targetsForBatch(parse, batch), deadlineAt });
          batchResults.push({ lineIndexes: batch.map((unit) => unit.lineIndex), attempts: outcome.attempts, status: outcome.completion ? 'completed' : 'incomplete', note: outcome.note });
          usage.promptTokens = outcome.usage.promptTokens === null || usage.promptTokens === null ? null : usage.promptTokens + outcome.usage.promptTokens;
          usage.completionTokens = outcome.usage.completionTokens === null || usage.completionTokens === null ? null : usage.completionTokens + outcome.usage.completionTokens;
          usage.actualUsd = outcome.usage.actualUsd === null || usage.actualUsd === null ? null : usage.actualUsd + outcome.usage.actualUsd;
          if (aiUsed === 0 && outcome.attempts > 0) usage.actualUsd = outcome.usage.actualUsd;
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
    const hasUnresolvedDayText = parse.fields.days.some((day, index) => {
      const nextLine = parse.fields.days[index + 1]?.line ?? Number.POSITIVE_INFINITY;
      return parse.unconsumed.some((line) => line.index > day.line && line.index < nextLine);
    }) || omittedUnits.some((unit) => parse.fields.days.some((day, index) => unit.lineIndex > day.line && unit.lineIndex < (parse.fields.days[index + 1]?.line ?? Number.POSITIVE_INFINITY)));
    if (structuralDayIssue || hasUnresolvedDayText || omittedUnits.length) unsafeCollections.add('days');
    for (const list of ['included', 'notIncluded', 'whatToBring', 'notSuitableFor', 'notAllowed', 'localTips']) {
      if (parse.unconsumed.some((line) => line.section === list) || omittedUnits.some((unit) => unit.section === list)) unsafeCollections.add(list);
    }
    if (omittedUnits.some((unit) => unit.section === 'layout-ambiguous')) {
      for (const collection of ['days', 'places', 'included', 'notIncluded', 'whatToBring', 'notSuitableFor', 'notAllowed', 'localTips', 'emergencyContacts', 'activity.highlights', 'activity.steps']) unsafeCollections.add(collection);
    }
    if (parse.notes.some((note) => /Highlight dibatasi/.test(note))) unsafeCollections.add('activity.highlights');
    if (parse.notes.some((note) => /Jalannya kegiatan dibatasi/.test(note))) unsafeCollections.add('activity.steps');
    const coveredPlaceLines = new Set(acceptedEvidence.filter((item) => item.path.startsWith('places[')).flatMap((item) => item.lineIndexes));
    if (omittedUnits.length || dropped.some((item) => item.path.startsWith('places')) || units.some((unit) => !coveredPlaceLines.has(unit.lineIndex))) unsafeCollections.add('places');
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
    const languageContext = language.source === 'unresolved' && target === 'overwrite'
      ? saved!.languageContext
      : language.locale
        ? { requestedLanguage: language.source === 'detected' ? 'auto' : language.locale, outputLanguage: language.locale, source: language.source }
        : { requestedLanguage: 'auto', outputLanguage: null, source: 'unresolved' };
    const writing = target === 'overwrite' ? saved!.writingContext : { brief: '', notes: [] };

    const record = target === 'new'
      ? store.createItinerary(checked.value, languageContext, writing)
      : store.updateItinerary(saved!.id, Number(args.input.expectedRevision), checked.value, languageContext, writing);
    if (!record) {
      store.db.prepare("UPDATE import_operations SET status='failed', error_code='REVISION_CONFLICT', updated_at=? WHERE operation_id=?").run(new Date().toISOString(), operationId);
      return error(409, 'REVISION_CONFLICT', 'Draf sudah berubah sejak dibuka. Muat ulang sebelum import.');
    }
    const report = {
      evidenceVersion: 1,
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
      evidence: { accepted: acceptedEvidence, rejected: dropped.map((item) => ({ path: item.path, reasonCode: item.code })), omittedLineIndexes: [...new Set(unsent.map((unit) => unit.lineIndex))] }
    };
    const actualUsd = usage.actualUsd;
    store.db.prepare("UPDATE import_operations SET status='completed', itinerary_id=?, result_revision=?, previous_draft_json=?, previous_language_json=?, previous_writing_json=?, ai_used=?, prompt_tokens=?, completion_tokens=?, actual_usd=?, report_json=?, updated_at=? WHERE operation_id=?")
      .run(record.id, record.revision, target === 'overwrite' ? JSON.stringify(saved!.draftContent) : null, target === 'overwrite' ? JSON.stringify(saved!.languageContext) : null, target === 'overwrite' ? JSON.stringify(saved!.writingContext) : null,
        aiUsed, usage.promptTokens, usage.completionTokens, actualUsd, JSON.stringify(report), new Date().toISOString(), operationId);
    return { status: target === 'new' ? 201 : 200, body: { itinerary: record, report, usage: { aiUsed, promptTokens: usage.promptTokens, completionTokens: usage.completionTokens, actualUsd }, operationId, sourceId } };
  }

  undo(operationId: string, expectedRevision: unknown): ServiceResult {
    const { store } = this.deps;
    const row = store.db.prepare('SELECT * FROM import_operations WHERE operation_id=? AND workspace_id=?').get(operationId, store.workspaceId) as Record<string, unknown> | undefined;
    if (!row) return error(404, 'NOT_FOUND', 'Operasi import tidak ditemukan.');
    const unavailable = () => error(409, 'IMPORT_UNDO_UNAVAILABLE', 'Draf sudah diubah setelah import; batalkan secara manual.');
    if (row.target !== 'overwrite' || row.status !== 'completed' || row.undone_at) return unavailable();
    const current = store.getItinerary(String(row.itinerary_id));
    if (!current || current.revision !== row.result_revision || expectedRevision !== row.result_revision) return unavailable();
    const restored = store.updateItinerary(current.id, current.revision, JSON.parse(String(row.previous_draft_json)), JSON.parse(String(row.previous_language_json)), JSON.parse(String(row.previous_writing_json)));
    if (!restored) return unavailable();
    store.db.prepare('UPDATE import_operations SET undone_at=?, updated_at=? WHERE operation_id=?').run(new Date().toISOString(), new Date().toISOString(), operationId);
    return { status: 200, body: { itinerary: restored, undone: true } };
  }

  latest(itineraryId: string): ServiceResult {
    const { store } = this.deps;
    const row = store.db.prepare('SELECT * FROM import_operations WHERE workspace_id=? AND itinerary_id=? ORDER BY created_at DESC LIMIT 1').get(store.workspaceId, itineraryId) as Record<string, unknown> | undefined;
    if (!row) return { status: 200, body: { operation: null } };
    const current = store.getItinerary(itineraryId);
    const undoAvailable = row.target === 'overwrite' && row.status === 'completed' && !row.undone_at && current?.revision === row.result_revision;
    return { status: 200, body: { operation: { operationId: row.operation_id, sourceId: row.source_id, status: row.status, target: row.target, report: row.report_json ? JSON.parse(String(row.report_json)) : null, usage: usageOf(row), undoAvailable } } };
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

