import Ajv2020 from 'ajv/dist/2020.js';
import completionSchema from '../../../config/web/import-completion.schema.json' with { type: 'json' };
import type { ItineraryMode } from '../../contracts/types.js';
import type { ImportExtractor, ImportSourceUnit, ProviderUsage } from '../ai/provider.js';
import { ProviderFailure } from '../ai/provider.js';
import { fold } from './parse/text.js';
import { MAX_HIGHLIGHTS, MAX_STEPS, type ParseResult } from './parse/extract.js';

/** AI completion (CP031): only what the parser left, quote-checked on the server before it can reach a draft. */

export interface TextValue { value: string; quote: string; sourceUnitIds?: string[] }
export interface CompletionPlace { name: TextValue; area?: TextValue | null; description?: TextValue | null }
export interface CompletionActivity { targetId: string; title: string; place?: TextValue | null; description?: TextValue | null; tip?: TextValue | null }
export interface Completion {
  summary?: TextValue | null; closingNote?: TextValue | null; policies?: TextValue | null;
  places?: CompletionPlace[]; activityDetails?: CompletionActivity[];
  /** Activity mode only (web-2.2.0). Whole-sentence quotes; ignored when the code already read the list. */
  highlights?: TextValue[]; steps?: Array<{ title: TextValue }>;
}
export interface Dropped { path: string; code: 'IMPORT_QUOTE_NOT_FOUND' | 'IMPORT_NOT_APPLICABLE' | 'IMPORT_ACTIVITY_NOT_FOUND' | 'IMPORT_ACTIVITY_AMBIGUOUS' | 'IMPORT_ALREADY_FILLED' | 'IMPORT_TARGET_MISMATCH' | 'IMPORT_COLLECTION_INCOMPLETE' | 'IMPORT_SOURCE_UNIT_INCOMPLETE' | 'IMPORT_ENTITY_CONTEXT_MISMATCH'; proposal?: { value: string; quote: string; lineIndexes: number[]; sourceUnitIds: string[]; targetId?: string } }
export interface SourceUnit { id: string; lineIndex: number; text: string; section: string | null; ownerTargetId?: string; dayNumber?: number; allowedPaths: string[]; structuralEnd: boolean }
export interface AcceptedEvidence { path: string; targetId?: string; lineIndexes: number[]; sourceUnitIds: string[]; quote: string }

const Ajv = Ajv2020 as unknown as new (options: Record<string, unknown>) => { compile(schema: unknown): ((value: unknown) => boolean) & { errors?: unknown[] | null } };
const validateCompletion = new Ajv({ allErrors: true, strict: false }).compile(completionSchema);

export const MAX_SEGMENT_CHARS = 20_000;
export const MAX_AI_ATTEMPTS = 2;
export const MAX_AI_BATCHES = 8;
export const MAX_AI_WALL_CLOCK_MS = 180_000;

export function isDayMode(mode: ItineraryMode): boolean { return mode === 'half_day' || mode === 'full_day' || mode === 'multi_day'; }

/** Builds prompt text and source-only units. Section hints are prompt metadata; guards only inspect `units`. */
export function segmentsOf(parse: ParseResult): { sent: string[]; plain: string[]; units: SourceUnit[] } {
  const sent: string[] = [];
  const plain: string[] = [];
  const units: SourceUnit[] = [];
  const perLine = new Map<number, number>();
  const activities = parse.fields.days.flatMap((day, dayIndex) => day.activities.map((activity, activityIndex) => {
    const nextActivity = day.activities[activityIndex + 1]?.line ?? parse.fields.days[dayIndex + 1]?.line;
    return { dayNumber: day.dayNumber, activity, nextActivity };
  }));
  for (const line of parse.unconsumed) {
    if (line.section === 'layout-ambiguous') continue;
    const ordinal = perLine.get(line.index) ?? 0;
    perLine.set(line.index, ordinal + 1);
    const unit: SourceUnit = {
      id: `source-${line.index}-${ordinal}`,
      lineIndex: line.index,
      text: line.text,
      section: line.section,
      allowedPaths: [],
      structuralEnd: false
    };
    if (line.section === 'summary' || line.section === 'closingNote' || line.section === 'policies') unit.allowedPaths.push(line.section);
    if (line.section === 'places' && parse.mode === 'destination_guide') unit.allowedPaths.push('places');
    if (line.section === 'highlights' && parse.mode === 'activity') unit.allowedPaths.push('highlights');
    if (line.section === 'steps' && parse.mode === 'activity') unit.allowedPaths.push('steps');
    if (line.section === null && parse.mode === 'activity') unit.allowedPaths.push('highlights', 'steps');
    if (line.section === null && isDayMode(parse.mode)) {
      const day = [...parse.fields.days].reverse().find((candidate) => candidate.line < line.index);
      if (day) unit.dayNumber = day.dayNumber;
      const sameLine = activities.filter(({ activity }) => activity.line === line.index && !fold(line.text).includes(fold(activity.title)));
      const betweenEvents = activities.filter(({ dayNumber, activity, nextActivity }) => {
        if (nextActivity === undefined || line.index <= activity.line || line.index >= nextActivity) return false;
        const targetId = `activity-${dayNumber}-${activity.line + 1}`;
        const previous = units.at(-1);
        return line.index === activity.line + 1 || (previous?.ownerTargetId === targetId && previous.lineIndex + 1 === line.index);
      });
      const owners = sameLine.length ? sameLine : betweenEvents;
      if (owners.length === 1) {
        const owner = owners[0];
        unit.ownerTargetId = `activity-${owner.dayNumber}-${owner.activity.line + 1}`;
        unit.dayNumber = owner.dayNumber;
        unit.allowedPaths.push('activityDetails');
        unit.structuralEnd = sameLine.length > 0;
      }
    }
    units.push(unit);
    sent.push(line.section ? `[${line.section}] ${line.text}` : line.text);
    plain.push(line.text);
  }
  for (const unit of units) {
    if (!unit.ownerTargetId || unit.structuralEnd) continue;
    const hasLaterOwnerUnit = units.some((candidate) => candidate.ownerTargetId === unit.ownerTargetId && candidate.lineIndex > unit.lineIndex);
    const owner = activities.find(({ dayNumber, activity }) => `activity-${dayNumber}-${activity.line + 1}` === unit.ownerTargetId);
    unit.structuralEnd = Boolean(owner?.nextActivity !== undefined && !hasLaterOwnerUnit && unit.lineIndex < owner.nextActivity);
  }
  return { sent, plain, units };
}

export function batchesOf(parse: ParseResult, units: SourceUnit[]): { batches: SourceUnit[][]; omitted: SourceUnit[] } {
  const batches: SourceUnit[][] = [];
  const omitted: SourceUnit[] = [];
  let batch: SourceUnit[] = [];
  const requestSize = (candidate: SourceUnit[]) => JSON.stringify({
    segments: candidate.map((unit) => unit.section ? `[${unit.section}] ${unit.text}` : unit.text),
    targets: targetsForBatch(parse, candidate),
    sourceUnits: candidate
  }).length + 128;
  for (let index = 0; index < units.length; index += 1) {
    const unit = units[index];
    let candidate = [...batch, unit];
    if (requestSize(candidate) > MAX_SEGMENT_CHARS && batch.length) {
      batches.push(batch); batch = [];
      if (batches.length >= MAX_AI_BATCHES) { omitted.push(...units.slice(index)); break; }
      candidate = [unit];
    }
    if (requestSize(candidate) > MAX_SEGMENT_CHARS) { omitted.push(unit); continue; }
    batch = candidate;
  }
  if (batch.length && batches.length < MAX_AI_BATCHES) batches.push(batch);
  return { batches, omitted };
}

export function targetsForBatch(parse: ParseResult, units: SourceUnit[]): Array<{ targetId: string; title: string; dayNumber: number; line: number }> {
  const targets: Array<{ targetId: string; title: string; dayNumber: number; line: number }> = [];
  const owners = new Set(units.flatMap((unit) => unit.ownerTargetId ? [unit.ownerTargetId] : []));
  for (const [dayIndex, day] of parse.fields.days.entries()) {
    for (let activityIndex = 0; activityIndex < day.activities.length; activityIndex += 1) {
      const activity = day.activities[activityIndex];
      const targetId = `activity-${day.dayNumber}-${activity.line + 1}`;
      if (!owners.has(targetId)) continue;
      targets.push({ targetId, title: activity.title, dayNumber: day.dayNumber, line: activity.line + 1 });
    }
  }
  return targets;
}

/** Keeps only values that pass the guards and apply to the mode and the path. Everything else is reported as dropped. */
export function filterCompletion(completion: Completion, parse: ParseResult, mode: ItineraryMode, units: SourceUnit[]): { accepted: Completion; dropped: Dropped[]; evidence: AcceptedEvidence[] } {
  const dropped: Dropped[] = [];
  const evidence: AcceptedEvidence[] = [];
  const accepted: Completion = { places: [], activityDetails: [], highlights: [], steps: [] };
  const allSourceUnits = segmentsOf(parse).units;
  const bullet = /^\s*(?:[-*\u2022\u00b7]|\d{1,2}[.)]|[a-z][.)])\s+/i;
  const quoteLine = (unit: SourceUnit) => unit.text.replace(bullet, '');
  const terminal = (text: string) => /[.!?。！？][\s"'”’)]*$/.test(text.trim());
  const qualifier = (text: string) => /^(?:kecuali|except|unless|namun|tetapi|but|hanya|only|berlaku|valid|tidak berlaku|not valid|untuk (?:usia|anak)|for (?:ages|children)|dengan syarat|provided|subject to)\b/i.test(text.trim());
  const wholeUnit = (matched: SourceUnit[], path: string, targetId?: string): boolean => {
    const first = matched[0];
    const last = matched.at(-1)!;
    const before = allSourceUnits.find((unit) => unit.lineIndex === first.lineIndex - 1 && unit.section === first.section);
    const after = allSourceUnits.find((unit) => unit.lineIndex === last.lineIndex + 1 && unit.section === last.section);
    // A visual newline cannot terminate a wrapped sentence or sever an exception.
    if (before && !bullet.test(first.text) && (qualifier(first.text) || (!terminal(before.text) && !bullet.test(before.text)))) return false;
    if (after && !bullet.test(after.text) && (qualifier(after.text) || !terminal(last.text))) return false;
    const structurallyBoundActivityDetail = Boolean(targetId && matched.every((unit) => unit.ownerTargetId === targetId) && last.structuralEnd);
    const explicitSectionUnit = matched.every((unit) => unit.allowedPaths.includes(path)) && !after;
    return terminal(last.text) || (['highlights', 'steps'].includes(path) && bullet.test(first.text)) || structurallyBoundActivityDetail || explicitSectionUnit;
  };
  const locate = (quote: string, kind: 'part' | 'whole' = 'whole', candidates = units, sourceUnitIds?: string[]): SourceUnit[] | null => {
    const wanted = quote.normalize('NFC').trim();
    if (!wanted) return null;
    const matches: SourceUnit[][] = [];
    const restricted = sourceUnitIds ? candidates.filter((unit) => sourceUnitIds.includes(unit.id)) : candidates;
    for (let start = 0; start < restricted.length; start += 1) {
      let joined = '';
      const matched: SourceUnit[] = [];
      for (let end = start; end < restricted.length; end += 1) {
        if (matched.length && restricted[end].lineIndex !== matched.at(-1)!.lineIndex + 1) break;
        joined = joined ? `${joined}\n${quoteLine(restricted[end])}` : quoteLine(restricted[end]);
        matched.push(restricted[end]);
        if (joined.normalize('NFC').trim() === wanted) { matches.push([...matched]); break; }
        if (joined.length >= wanted.length) break;
      }
    }
    const unique = matches.length === 1 ? matches[0] : null;
    if (unique && sourceUnitIds && (unique.length !== sourceUnitIds.length || unique.some((unit, index) => unit.id !== sourceUnitIds[index]))) return null;
    return unique;
  };
  const assignedPathByUnit = new Map<string, string>();
  const allowedForPath = (unit: SourceUnit, path: string, targetId?: string) => {
    if (path.startsWith('activities[')) return Boolean(targetId && unit.ownerTargetId === targetId && unit.allowedPaths.includes('activityDetails'));
    if (path.startsWith('places[')) return unit.allowedPaths.includes('places');
    return unit.allowedPaths.includes(path);
  };
  const textEvidence = (path: string, item: TextValue | null | undefined, kind: 'part' | 'whole' = 'whole', candidates = units, targetId?: string) => {
    if (!item) return false;
    const allowed = candidates.filter((unit) => allowedForPath(unit, path, targetId));
    const sourceUnits = locate(item.quote, kind, allowed, item.sourceUnitIds);
    const quote = item.quote.normalize('NFC').trim();
    const value = item.value.normalize('NFC').trim();
    const anywhere = sourceUnits ?? locate(item.quote, kind, candidates, item.sourceUnitIds);
    const sourceUnitIds = anywhere?.map((unit) => unit.id) ?? [];
    const proposal = { value: value.slice(0, 2000), quote: quote.slice(0, 2000), lineIndexes: anywhere?.map((unit) => unit.lineIndex) ?? [], sourceUnitIds, ...(targetId ? { targetId } : {}) };
    if (!sourceUnits) {
      const code = anywhere ? 'IMPORT_ENTITY_CONTEXT_MISMATCH' : 'IMPORT_QUOTE_NOT_FOUND';
      dropped.push({ path, code, proposal }); return false;
    }
    const conflictsWithPriorAssignment = sourceUnits.some((unit) => {
      const previous = assignedPathByUnit.get(unit.id);
      return previous !== undefined && !(previous.startsWith('places[') && path.startsWith('places[') && previous !== path);
    });
    if (conflictsWithPriorAssignment) { dropped.push({ path, code: 'IMPORT_SOURCE_UNIT_INCOMPLETE', proposal }); return false; }
    if ((kind === 'whole' && value !== quote) || (kind === 'part' && !quote.includes(value))) { dropped.push({ path, code: 'IMPORT_QUOTE_NOT_FOUND', proposal }); return false; }
    if (kind === 'whole' && !wholeUnit(sourceUnits, path, targetId)) { dropped.push({ path, code: 'IMPORT_SOURCE_UNIT_INCOMPLETE', proposal }); return false; }
    for (const unit of sourceUnits) assignedPathByUnit.set(unit.id, path);
    evidence.push({ path, ...(targetId ? { targetId } : {}), lineIndexes: sourceUnits.map((unit) => unit.lineIndex), sourceUnitIds: sourceUnits.map((unit) => unit.id), quote: item.quote });
    return true;
  };
  const textPath = (name: 'summary' | 'closingNote' | 'policies', item: TextValue | null | undefined) => {
    if (!item) return;
    if (textEvidence(name, item)) accepted[name] = item;
  };
  textPath('summary', completion.summary);
  textPath('closingNote', completion.closingNote);
  textPath('policies', completion.policies);

  for (const place of completion.places ?? []) {
    if (mode !== 'destination_guide') { dropped.push({ path: 'places', code: 'IMPORT_NOT_APPLICABLE' }); break; }
    const placeUnits = units.filter((unit) => allowedForPath(unit, 'places[].name'));
    if (placeUnits.filter((unit) => quoteLine(unit).normalize('NFC').trim() === place.name.quote.normalize('NFC').trim()).length > 1) {
      dropped.push({ path: 'places[].name', code: 'IMPORT_ENTITY_CONTEXT_MISMATCH' }); continue;
    }
    if (!textEvidence('places[].name', place.name, 'part', placeUnits)) continue;
    const nameUnits = locate(place.name.quote, 'part', placeUnits, place.name.sourceUnitIds)!;
    const nameLine = nameUnits[0];
    const context = [...nameUnits];
    // Only a complete explicit bullet entity can own immediately following prose.
    // Another entity/list item, section, consumed line or gap closes the context.
    if (nameUnits.length === 1 && bullet.test(nameLine.text)) {
      let nextLine = nameLine.lineIndex + 1;
      for (const unit of units) {
        if (unit.lineIndex < nextLine) continue;
        if (unit.lineIndex !== nextLine || unit.section !== nameLine.section || bullet.test(unit.text)) break;
        context.push(unit); nextLine += 1;
      }
    }
    const keepPlace = (field: 'area' | 'description', item: TextValue | null | undefined) => {
      if (!item) return null;
      if (!locate(item.quote, field === 'area' ? 'part' : 'whole', context)) { dropped.push({ path: `places[].${field}`, code: 'IMPORT_ENTITY_CONTEXT_MISMATCH' }); return null; }
      return textEvidence(`places[].${field}`, item, field === 'area' ? 'part' : 'whole', context) ? item : null;
    };
    const area = keepPlace('area', place.area);
    const description = keepPlace('description', place.description);
    accepted.places!.push({ name: place.name, area, description });
  }

  if (completion.highlights?.length || completion.steps?.length) {
    if (mode !== 'activity') dropped.push({ path: completion.highlights?.length ? 'highlights' : 'steps', code: 'IMPORT_NOT_APPLICABLE' });
    else {
      const taken = new Set<string>();
      const wholeLines = (items: TextValue[], limit: number, path: string) => {
        const out: TextValue[] = [];
        for (const item of items) {
          if (!textEvidence(path, item)) continue;
          const key = fold(item.value);
          if (taken.has(key)) continue;
          taken.add(key);
          if (out.length < limit) out.push(item);
        }
        return out;
      };
      if (completion.highlights?.length) {
        if (parse.fields.activity.highlights.length) dropped.push({ path: 'highlights', code: 'IMPORT_ALREADY_FILLED' });
        else accepted.highlights = wholeLines(completion.highlights, MAX_HIGHLIGHTS, 'highlights');
      }
      if (completion.steps?.length) {
        if (parse.fields.activity.steps.length) dropped.push({ path: 'steps', code: 'IMPORT_ALREADY_FILLED' });
        else accepted.steps = wholeLines(completion.steps.map((step) => step.title), MAX_STEPS, 'steps').map((title) => ({ title }));
      }
    }
  }

  const activities = parse.fields.days.flatMap((day) => day.activities.map((activity) => ({ ...activity, dayNumber: day.dayNumber })));
  for (const detail of completion.activityDetails ?? []) {
    if (!isDayMode(mode)) { dropped.push({ path: 'activityDetails', code: 'IMPORT_NOT_APPLICABLE' }); break; }
    const matches = activities.filter((activity) => `activity-${activity.dayNumber}-${activity.line + 1}` === detail.targetId && fold(activity.title) === fold(detail.title));
    if (!matches.length) { dropped.push({ path: `activityDetails[${detail.title}]`, code: 'IMPORT_TARGET_MISMATCH' }); continue; }
    // The same title on two days cannot be told apart by the model; dropping is safer than guessing the day.
    if (matches.length > 1) { dropped.push({ path: `activityDetails[${detail.title}]`, code: 'IMPORT_ACTIVITY_AMBIGUOUS' }); continue; }
    const target = matches[0];
    const context = units.filter((unit) => unit.ownerTargetId === detail.targetId);
    const keep = (field: 'place' | 'description' | 'tip', item: TextValue | null | undefined) => {
      if (!item) return null;
      if (!textEvidence(`activities[${detail.title}].${field}`, item, field === 'place' ? 'part' : 'whole', context, detail.targetId)) return null;
      return item;
    };
    accepted.activityDetails!.push({ targetId: detail.targetId, title: target.title, place: keep('place', detail.place), description: keep('description', detail.description), tip: keep('tip', detail.tip) });
  }
  return { accepted, dropped, evidence };
}

/** Parses the model text. Accepts a bare JSON object or one inside a markdown fence. */
export function parseCompletionText(text: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  return JSON.parse((fenced ? fenced[1] : text).trim());
}

export interface CompletionOutcome { completion: Completion | null; usage: { promptTokens: number | null; completionTokens: number | null; actualUsd: number | null }; attempts: number; responses: Array<{ modelId: string | null; generationId: string | null }>; note: string | null }

/** Calls the model at most MAX_AI_ATTEMPTS times; one retry on a retryable provider failure or on invalid output. */
export async function requestCompletion(extractor: ImportExtractor, args: { mode: ItineraryMode; locale: string | null; segments: string[]; sourceUnits?: ImportSourceUnit[]; targets?: Array<{ targetId: string; title: string; dayNumber: number; line: number }>; deadlineAt?: number; onDispatch?: () => void; onAttemptUsage?: (usage: ProviderUsage | null) => void }, sleep: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms))): Promise<CompletionOutcome> {
  const usage: CompletionOutcome['usage'] = { promptTokens: 0, completionTokens: 0, actualUsd: 0 };
  const responses: CompletionOutcome['responses'] = [];
  let attempts = 0;
  let lastNote: string | null = null;
  const addUsage = (part: ProviderUsage) => {
    usage.promptTokens = part.promptTokens === null || usage.promptTokens === null ? null : usage.promptTokens + part.promptTokens;
    usage.completionTokens = part.completionTokens === null || usage.completionTokens === null ? null : usage.completionTokens + part.completionTokens;
    usage.actualUsd = part.costUsd === null || usage.actualUsd === null ? null : usage.actualUsd + part.costUsd;
  };
  while (attempts < MAX_AI_ATTEMPTS) {
    const remaining = args.deadlineAt === undefined ? 120_000 : args.deadlineAt - Date.now();
    if (remaining <= 0) return { completion: null, usage, attempts, responses, note: 'Batas waktu AI tercapai; sisa bagian dibiarkan untuk diperiksa manual.' };
    attempts += 1;
    // Reserve an uncertain in-flight attempt durably before crossing the provider boundary.
    args.onDispatch?.();
    let result: Awaited<ReturnType<ImportExtractor['extract']>>;
    try {
      result = await extractor.extract({ mode: args.mode, locale: args.locale, segments: args.segments, sourceUnits: args.sourceUnits, targets: args.targets, maxTokens: 3000 }, Math.min(120_000, remaining));
    } catch (cause) {
      // The provider may have processed/billed a request before failing without usage data.
      usage.promptTokens = null;
      usage.completionTokens = null;
      usage.actualUsd = null;
      args.onAttemptUsage?.(null);
      if (cause instanceof ProviderFailure && cause.kind === 'retryable' && attempts < MAX_AI_ATTEMPTS) {
        const wait = Math.min(cause.retryAfterMs || 1000, 5000, args.deadlineAt === undefined ? 5000 : Math.max(0, args.deadlineAt - Date.now()));
        if (wait <= 0) return { completion: null, usage, attempts, responses, note: 'Batas waktu AI tercapai; sisa bagian dibiarkan untuk diperiksa manual.' };
        await sleep(wait);
        continue;
      }
      return { completion: null, usage, attempts, responses, note: 'AI tidak bisa menyelesaikan bagian yang tidak terbaca; bagian itu dibiarkan kosong.' };
    }
    responses.push({ modelId: result.modelId ?? null, generationId: result.generationId ?? null });
    addUsage(result.usage);
    args.onAttemptUsage?.(result.usage);
    try {
      const json = parseCompletionText(result.text);
      if (validateCompletion(json)) return { completion: json as Completion, usage, attempts, responses, note: null };
      lastNote = 'Jawaban AI tidak sesuai bentuk yang diminta.';
    } catch {
      lastNote = 'Jawaban AI tidak bisa dibaca sebagai JSON.';
    }
  }
  return { completion: null, usage, attempts, responses, note: `${lastNote ?? 'Jawaban AI tidak valid.'} Bagian itu dibiarkan kosong.` };
}
