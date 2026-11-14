import Ajv2020 from 'ajv/dist/2020.js';
import completionSchema from '../../../config/web/import-completion.schema.json' with { type: 'json' };
import type { ItineraryMode } from '../../contracts/types.js';
import type { ImportExtractor, ProviderUsage } from '../ai/provider.js';
import { ProviderFailure } from '../ai/provider.js';
import { fold } from './parse/text.js';
import { MAX_HIGHLIGHTS, MAX_STEPS, type ParseResult } from './parse/extract.js';

/** AI completion (CP031): only what the parser left, quote-checked on the server before it can reach a draft. */

export interface TextValue { value: string; quote: string }
export interface CompletionPlace { name: TextValue; area?: TextValue | null; description?: TextValue | null }
export interface CompletionActivity { targetId: string; title: string; place?: TextValue | null; description?: TextValue | null; tip?: TextValue | null }
export interface Completion {
  summary?: TextValue | null; closingNote?: TextValue | null; policies?: TextValue | null;
  places?: CompletionPlace[]; activityDetails?: CompletionActivity[];
  /** Activity mode only (web-2.2.0). Whole-sentence quotes; ignored when the code already read the list. */
  highlights?: TextValue[]; steps?: Array<{ title: TextValue }>;
}
export interface Dropped { path: string; code: 'IMPORT_QUOTE_NOT_FOUND' | 'IMPORT_NOT_APPLICABLE' | 'IMPORT_ACTIVITY_NOT_FOUND' | 'IMPORT_ACTIVITY_AMBIGUOUS' | 'IMPORT_ALREADY_FILLED' | 'IMPORT_TARGET_MISMATCH' | 'IMPORT_COLLECTION_INCOMPLETE' | 'IMPORT_SOURCE_UNIT_INCOMPLETE' | 'IMPORT_ENTITY_CONTEXT_MISMATCH'; proposal?: { value: string; quote: string; lineIndexes: number[]; targetId?: string } }
export interface SourceUnit { lineIndex: number; text: string; section: string | null }
export interface AcceptedEvidence { path: string; targetId?: string; lineIndexes: number[]; quote: string }

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
  for (const line of parse.unconsumed) {
    if (line.section === 'layout-ambiguous') continue;
    units.push({ lineIndex: line.index, text: line.text, section: line.section });
    sent.push(line.section ? `[${line.section}] ${line.text}` : line.text);
    plain.push(line.text);
  }
  return { sent, plain, units };
}

export function batchesOf(parse: ParseResult, units: SourceUnit[]): { batches: SourceUnit[][]; omitted: SourceUnit[] } {
  const batches: SourceUnit[][] = [];
  const omitted: SourceUnit[] = [];
  let batch: SourceUnit[] = [];
  const requestSize = (candidate: SourceUnit[]) => JSON.stringify({
    segments: candidate.map((unit) => unit.section ? `[${unit.section}] ${unit.text}` : unit.text),
    targets: targetsForBatch(parse, candidate)
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
  for (const [dayIndex, day] of parse.fields.days.entries()) {
    for (let activityIndex = 0; activityIndex < day.activities.length; activityIndex += 1) {
      const activity = day.activities[activityIndex];
      const nextActivity = day.activities[activityIndex + 1]?.line ?? parse.fields.days[dayIndex + 1]?.line ?? Number.POSITIVE_INFINITY;
      if (!units.some((unit) => unit.lineIndex > activity.line && unit.lineIndex < nextActivity)) continue;
      targets.push({ targetId: `activity-${day.dayNumber}-${activity.line + 1}`, title: activity.title, dayNumber: day.dayNumber, line: activity.line + 1 });
    }
  }
  return targets;
}

/** Keeps only values that pass the guards and apply to the mode and the path. Everything else is reported as dropped. */
export function filterCompletion(completion: Completion, parse: ParseResult, mode: ItineraryMode, units: SourceUnit[]): { accepted: Completion; dropped: Dropped[]; evidence: AcceptedEvidence[] } {
  const dropped: Dropped[] = [];
  const evidence: AcceptedEvidence[] = [];
  const accepted: Completion = { places: [], activityDetails: [], highlights: [], steps: [] };
  const bullet = /^\s*(?:[-*\u2022\u00b7]|\d{1,2}[.)]|[a-z][.)])\s+/i;
  const quoteLine = (unit: SourceUnit) => unit.text.replace(bullet, '');
  const sourceUnits = parse.unconsumed.map((line) => ({ lineIndex: line.index, text: line.text, section: line.section }));
  const terminal = (text: string) => /[.!?。！？][\s"'”’)]*$/.test(text.trim());
  const qualifier = (text: string) => /^(?:kecuali|except|unless|namun|tetapi|but|hanya|only|berlaku|valid|tidak berlaku|not valid|untuk (?:usia|anak)|for (?:ages|children)|dengan syarat|provided|subject to)\b/i.test(text.trim());
  const wholeUnit = (matched: SourceUnit[], path: string): boolean => {
    const first = matched[0];
    const last = matched.at(-1)!;
    const before = sourceUnits.find((unit) => unit.lineIndex === first.lineIndex - 1 && unit.section === first.section);
    const after = sourceUnits.find((unit) => unit.lineIndex === last.lineIndex + 1 && unit.section === last.section);
    // A visual newline cannot terminate a wrapped sentence or sever an exception.
    if (before && !bullet.test(first.text) && (qualifier(first.text) || (!terminal(before.text) && !bullet.test(before.text)))) return false;
    if (after && !bullet.test(after.text) && (qualifier(after.text) || !terminal(last.text))) return false;
    return terminal(last.text) || (['highlights', 'steps'].includes(path) && bullet.test(first.text));
  };
  const locate = (quote: string, kind: 'part' | 'whole' = 'whole', candidates = units): SourceUnit[] | null => {
    const wanted = quote.normalize('NFC').trim();
    if (!wanted) return null;
    for (let start = 0; start < candidates.length; start += 1) {
      let joined = '';
      const matched: SourceUnit[] = [];
      for (let end = start; end < candidates.length; end += 1) {
        if (matched.length && candidates[end].lineIndex !== matched.at(-1)!.lineIndex + 1) break;
        joined = joined ? `${joined}\n${quoteLine(candidates[end])}` : quoteLine(candidates[end]);
        matched.push(candidates[end]);
        if (joined.normalize('NFC').trim() === wanted) return matched;
        if (joined.length >= wanted.length) break;
      }
    }
    return null;
  };
  const textEvidence = (path: string, item: TextValue | null | undefined, kind: 'part' | 'whole' = 'whole', candidates = units, targetId?: string) => {
    if (!item) return false;
    const sourceUnits = locate(item.quote, kind, candidates);
    const quote = item.quote.normalize('NFC').trim();
    const value = item.value.normalize('NFC').trim();
    const proposal = { value: value.slice(0, 2000), quote: quote.slice(0, 2000), lineIndexes: sourceUnits?.map((unit) => unit.lineIndex) ?? [], ...(targetId ? { targetId } : {}) };
    if (!sourceUnits || (kind === 'whole' && value !== quote) || (kind === 'part' && !quote.includes(value))) { dropped.push({ path, code: 'IMPORT_QUOTE_NOT_FOUND', proposal }); return false; }
    if (kind === 'whole' && !wholeUnit(sourceUnits, path)) { dropped.push({ path, code: 'IMPORT_SOURCE_UNIT_INCOMPLETE', proposal }); return false; }
    evidence.push({ path, ...(targetId ? { targetId } : {}), lineIndexes: sourceUnits.map((unit) => unit.lineIndex), quote: item.quote });
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
    if (sourceUnits.filter((unit) => quoteLine(unit).normalize('NFC').trim() === place.name.quote.normalize('NFC').trim()).length > 1) {
      dropped.push({ path: 'places[].name', code: 'IMPORT_ENTITY_CONTEXT_MISMATCH' }); continue;
    }
    if (!textEvidence('places[].name', place.name, 'part')) continue;
    const nameUnits = locate(place.name.quote, 'part')!;
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
    const sameDay = parse.fields.days.find((day) => day.dayNumber === target.dayNumber)!;
    const nextActivity = sameDay.activities.find((activity) => activity.line > target.line)?.line ?? parse.fields.days.find((day) => day.line > sameDay.line)?.line ?? Number.POSITIVE_INFINITY;
    const context: SourceUnit[] = [];
    let expectedLine = target.line + 1;
    for (const unit of units) {
      if (unit.lineIndex <= target.line || unit.lineIndex >= nextActivity) continue;
      if (unit.lineIndex !== expectedLine || unit.section !== null) break;
      context.push(unit);
      expectedLine += 1;
    }
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

export interface CompletionOutcome { completion: Completion | null; usage: { promptTokens: number | null; completionTokens: number | null; actualUsd: number | null }; attempts: number; note: string | null }

/** Calls the model at most MAX_AI_ATTEMPTS times; one retry on a retryable provider failure or on invalid output. */
export async function requestCompletion(extractor: ImportExtractor, args: { mode: ItineraryMode; locale: string | null; segments: string[]; targets?: Array<{ targetId: string; title: string; dayNumber: number; line: number }>; deadlineAt?: number }, sleep: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms))): Promise<CompletionOutcome> {
  const usage: CompletionOutcome['usage'] = { promptTokens: 0, completionTokens: 0, actualUsd: 0 };
  let attempts = 0;
  let lastNote: string | null = null;
  const addUsage = (part: ProviderUsage) => {
    usage.promptTokens = part.promptTokens === null || usage.promptTokens === null ? null : usage.promptTokens + part.promptTokens;
    usage.completionTokens = part.completionTokens === null || usage.completionTokens === null ? null : usage.completionTokens + part.completionTokens;
    usage.actualUsd = part.costUsd === null || usage.actualUsd === null ? null : usage.actualUsd + part.costUsd;
  };
  while (attempts < MAX_AI_ATTEMPTS) {
    const remaining = args.deadlineAt === undefined ? 120_000 : args.deadlineAt - Date.now();
    if (remaining <= 0) return { completion: null, usage, attempts, note: 'Batas waktu AI tercapai; sisa bagian dibiarkan untuk diperiksa manual.' };
    attempts += 1;
    try {
      const result = await extractor.extract({ mode: args.mode, locale: args.locale, segments: args.segments, targets: args.targets, maxTokens: 3000 }, Math.min(120_000, remaining));
      addUsage(result.usage);
      try {
        const json = parseCompletionText(result.text);
        if (validateCompletion(json)) return { completion: json as Completion, usage, attempts, note: null };
        lastNote = 'Jawaban AI tidak sesuai bentuk yang diminta.';
      } catch {
        lastNote = 'Jawaban AI tidak bisa dibaca sebagai JSON.';
      }
    } catch (cause) {
      // The provider may have processed/billed a request before failing without usage data.
      usage.promptTokens = null;
      usage.completionTokens = null;
      usage.actualUsd = null;
      if (cause instanceof ProviderFailure && cause.kind === 'retryable' && attempts < MAX_AI_ATTEMPTS) {
        const wait = Math.min(cause.retryAfterMs || 1000, 5000, args.deadlineAt === undefined ? 5000 : Math.max(0, args.deadlineAt - Date.now()));
        if (wait <= 0) return { completion: null, usage, attempts, note: 'Batas waktu AI tercapai; sisa bagian dibiarkan untuk diperiksa manual.' };
        await sleep(wait);
        continue;
      }
      return { completion: null, usage, attempts, note: 'AI tidak bisa menyelesaikan bagian yang tidak terbaca; bagian itu dibiarkan kosong.' };
    }
  }
  return { completion: null, usage, attempts, note: `${lastNote ?? 'Jawaban AI tidak valid.'} Bagian itu dibiarkan kosong.` };
}
