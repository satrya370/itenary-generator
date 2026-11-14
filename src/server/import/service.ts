import type { openStore } from '../store.js';
import { createHash } from 'node:crypto';
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
      store.db.prepare("UPDATE import_operations SET status='failed', error_code='IMPORT_INTERNAL', updated_at=? WHERE operation_id=?").run(new Date().toISOString(), input.operationId);
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
      review: { version: 1, sourceTextHash: createHash('sha256').update(text).digest('hex'), candidates: parse.conflicts.map((conflict, index) => ({ id: `conflict-${index + 1}`, path: conflict.path, lines: conflict.occurrences.map((item) => item.line), status: 'pending' })).filter((item) => mode !== 'destination_guide' || !['date', 'meeting.place', 'meeting.mapsUrl'].includes(item.path)), unsupported: dropped.length + omittedUnits.length + (mode === 'destination_guide' ? parse.conflicts.filter((item) => ['date', 'meeting.place', 'meeting.mapsUrl'].includes(item.path)).length : 0), rejectedProposals: dropped.filter((item) => item.proposal).slice(0, 100).map((item, index) => ({ id: `rejected-${index + 1}`, path: item.path, reasonCode: item.code, ...item.proposal })) },
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
      evidence: { accepted: acceptedEvidence.map(({ quote: _quote, ...reference }) => reference), rejected: dropped.map((item) => ({ path: item.path, reasonCode: item.code })), omittedLineIndexes: [...new Set(unsent.map((unit) => unit.lineIndex))] }
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
    if (Object.keys(input).some((key) => !['expectedRevision', 'candidateId', 'action', 'line', 'value'].includes(key)) || !Number.isInteger(input.expectedRevision) || typeof input.candidateId !== 'string' || !['select', 'edit', 'ignore'].includes(String(input.action))) return error(400, 'INVALID_REQUEST', 'Keputusan review tidak valid.');
    const row = store.db.prepare('SELECT * FROM import_operations WHERE operation_id=? AND workspace_id=?').get(operationId, store.workspaceId) as Record<string, unknown> | undefined;
    if (!row || row.status !== 'completed' || row.undone_at) return error(404, 'NOT_FOUND', 'Operasi import tidak ditemukan.');
    const report = JSON.parse(String(row.report_json));
    const candidate = report.review?.version === 1 ? report.review.candidates.find((item: { id: string }) => item.id === input.candidateId) : null;
    if (!candidate || candidate.status !== 'pending') return error(409, 'IMPORT_REVIEW_UNAVAILABLE', 'Kandidat tidak tersedia atau sudah diselesaikan.');
    const text = await readSourceTextOrNull(dataDir, String(row.source_id));
    if (text === null) return error(404, SOURCE_TEXT_REMOVED_CODE, SOURCE_TEXT_REMOVED_MESSAGE);
    if (createHash('sha256').update(text).digest('hex') !== report.review.sourceTextHash) return error(409, 'IMPORT_SOURCE_CHANGED', 'Sumber berubah; mulai import ulang.');
    const layout = await readSourceLayoutOrNull(dataDir, String(row.source_id));
    const parsed = parseDocument(text, row.mode as ItineraryMode, layoutExcludedLines(layout, text));
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
    const checked = validateDraft(draft);
    if (!checked.ok) return error(422, 'IMPORT_DRAFT_INVALID', 'Nilai tidak sesuai aturan draf.');
    store.db.exec('BEGIN IMMEDIATE');
    try {
      const fresh = store.db.prepare('SELECT status, undone_at, report_json FROM import_operations WHERE operation_id=? AND workspace_id=?').get(operationId, store.workspaceId) as { status: string; undone_at: string | null; report_json: string } | undefined;
      if (!fresh || fresh.status !== 'completed' || fresh.undone_at || fresh.report_json !== row.report_json) {
        store.db.exec('ROLLBACK');
        return error(409, 'IMPORT_REVIEW_UNAVAILABLE', 'Operasi review sudah berubah; muat ulang.');
      }
      const updated = store.updateItinerary(current.id, Number(input.expectedRevision), checked.value, current.languageContext, current.writingContext);
      if (!updated) { store.db.exec('ROLLBACK'); return error(409, 'REVISION_CONFLICT', 'Draf sudah berubah sejak dibuka.'); }
      candidate.status = input.action === 'ignore' ? 'ignored' : 'resolved';
      candidate.decision = { action: input.action, provenance: input.action === 'select' ? 'source' : input.action === 'edit' ? 'manual' : null, ...(input.action === 'select' ? { line: input.line } : {}) };
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
    const row = store.db.prepare('SELECT * FROM import_operations WHERE workspace_id=? AND itinerary_id=? ORDER BY created_at DESC LIMIT 1').get(store.workspaceId, itineraryId) as Record<string, unknown> | undefined;
    if (!row) return { status: 200, body: { operation: null } };
    const current = store.getItinerary(itineraryId);
    const undoAvailable = row.target === 'overwrite' && row.status === 'completed' && !row.undone_at && current?.revision === row.result_revision;
    const storedReport = row.report_json ? JSON.parse(String(row.report_json)) : null;
    if (storedReport) delete storedReport._replay;
    return { status: 200, body: { operation: { operationId: row.operation_id, sourceId: row.source_id, status: row.status, target: row.target, report: storedReport, usage: usageOf(row), undoAvailable } } };
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

