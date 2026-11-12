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
export interface CompletionActivity { title: string; place?: TextValue | null; description?: TextValue | null; tip?: TextValue | null }
export interface Completion {
  summary?: TextValue | null; closingNote?: TextValue | null; policies?: TextValue | null;
  places?: CompletionPlace[]; activityDetails?: CompletionActivity[];
  /** Activity mode only (web-2.2.0). Whole-sentence quotes; ignored when the code already read the list. */
  highlights?: TextValue[]; steps?: Array<{ title: TextValue }>;
}
export interface Dropped { path: string; code: 'IMPORT_QUOTE_NOT_FOUND' | 'IMPORT_NOT_APPLICABLE' | 'IMPORT_ACTIVITY_NOT_FOUND' | 'IMPORT_ACTIVITY_AMBIGUOUS' | 'IMPORT_ALREADY_FILLED'; }

const Ajv = Ajv2020 as unknown as new (options: Record<string, unknown>) => { compile(schema: unknown): ((value: unknown) => boolean) & { errors?: unknown[] | null } };
const validateCompletion = new Ajv({ allErrors: true, strict: false }).compile(completionSchema);

export const MAX_SEGMENT_CHARS = 20_000;
export const MAX_AI_ATTEMPTS = 2;

const trimEnd = (text: string) => text.replace(/[\s.,;:!]+$/, '');

/** Quote guard: the quote is a substring of the document text (folded). A "part" value (a name or an area) may be a piece of
 * its quote; a "whole" value (a sentence) must be the whole quote, so a cut such as "Tidak termasuk X" -> "termasuk X" cannot flip the meaning. */
export function quoteHolds(item: TextValue, foldedSource: string, kind: 'part' | 'whole' = 'part'): boolean {
  const quote = fold(item.quote);
  const value = fold(item.value);
  if (value.length === 0 || quote.length === 0 || !foldedSource.includes(quote)) return false;
  return kind === 'whole' ? trimEnd(value) === trimEnd(quote) : quote.includes(value);
}

export function isDayMode(mode: ItineraryMode): boolean { return mode === 'half_day' || mode === 'full_day' || mode === 'multi_day'; }

/** Splits the parser's unconsumed lines into the text the model may quote from.
 * `sent` carries the engine's section hint for the model; `plain` is the document text only and is what the quote guard checks,
 * so an echoed engine marker can never pass as a quote. */
export function segmentsOf(parse: ParseResult): { sent: string[]; plain: string[] } {
  const sent: string[] = [];
  const plain: string[] = [];
  let length = 0;
  for (const line of parse.unconsumed) {
    if (length + line.text.length > MAX_SEGMENT_CHARS) break;
    sent.push(line.section ? `[${line.section}] ${line.text}` : line.text);
    plain.push(line.text);
    length += line.text.length + 1;
  }
  return { sent, plain };
}

/** Keeps only values that pass the guards and apply to the mode and the path. Everything else is reported as dropped. */
export function filterCompletion(completion: Completion, segmentsText: string, parse: ParseResult, mode: ItineraryMode): { accepted: Completion; dropped: Dropped[] } {
  const source = fold(segmentsText);
  const dropped: Dropped[] = [];
  const accepted: Completion = { places: [], activityDetails: [], highlights: [], steps: [] };
  const textPath = (name: 'summary' | 'closingNote' | 'policies', item: TextValue | null | undefined) => {
    if (!item) return;
    if (!quoteHolds(item, source, 'whole')) { dropped.push({ path: name, code: 'IMPORT_QUOTE_NOT_FOUND' }); return; }
    accepted[name] = item;
  };
  textPath('summary', completion.summary);
  textPath('closingNote', completion.closingNote);
  textPath('policies', completion.policies);

  for (const place of completion.places ?? []) {
    if (mode !== 'destination_guide') { dropped.push({ path: 'places', code: 'IMPORT_NOT_APPLICABLE' }); break; }
    if (!quoteHolds(place.name, source)) { dropped.push({ path: 'places[].name', code: 'IMPORT_QUOTE_NOT_FOUND' }); continue; }
    const area = place.area && quoteHolds(place.area, source) ? place.area : null;
    const description = place.description && quoteHolds(place.description, source, 'whole') ? place.description : null;
    if (place.area && !area) dropped.push({ path: 'places[].area', code: 'IMPORT_QUOTE_NOT_FOUND' });
    if (place.description && !description) dropped.push({ path: 'places[].description', code: 'IMPORT_QUOTE_NOT_FOUND' });
    accepted.places!.push({ name: place.name, area, description });
  }

  if (completion.highlights?.length || completion.steps?.length) {
    if (mode !== 'activity') dropped.push({ path: completion.highlights?.length ? 'highlights' : 'steps', code: 'IMPORT_NOT_APPLICABLE' });
    else {
      const taken = new Set<string>();
      const wholeLines = (items: TextValue[], limit: number, path: string) => {
        const out: TextValue[] = [];
        for (const item of items) {
          if (!quoteHolds(item, source, 'whole')) { dropped.push({ path, code: 'IMPORT_QUOTE_NOT_FOUND' }); continue; }
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

  const activities = parse.fields.days.flatMap((day) => day.activities);
  for (const detail of completion.activityDetails ?? []) {
    if (!isDayMode(mode)) { dropped.push({ path: 'activityDetails', code: 'IMPORT_NOT_APPLICABLE' }); break; }
    const matches = activities.filter((activity) => fold(activity.title) === fold(detail.title));
    if (matches.length === 0) { dropped.push({ path: `activityDetails[${detail.title}]`, code: 'IMPORT_ACTIVITY_NOT_FOUND' }); continue; }
    // The same title on two days cannot be told apart by the model; dropping is safer than guessing the day.
    if (matches.length > 1) { dropped.push({ path: `activityDetails[${detail.title}]`, code: 'IMPORT_ACTIVITY_AMBIGUOUS' }); continue; }
    const target = matches[0];
    const keep = (field: 'place' | 'description' | 'tip', item: TextValue | null | undefined) => {
      if (!item) return null;
      if (!quoteHolds(item, source, field === 'place' ? 'part' : 'whole')) { dropped.push({ path: `activities[${detail.title}].${field}`, code: 'IMPORT_QUOTE_NOT_FOUND' }); return null; }
      return item;
    };
    accepted.activityDetails!.push({ title: target.title, place: keep('place', detail.place), description: keep('description', detail.description), tip: keep('tip', detail.tip) });
  }
  return { accepted, dropped };
}

/** Parses the model text. Accepts a bare JSON object or one inside a markdown fence. */
export function parseCompletionText(text: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  return JSON.parse((fenced ? fenced[1] : text).trim());
}

export interface CompletionOutcome { completion: Completion | null; usage: { promptTokens: number; completionTokens: number; actualUsd: number | null }; attempts: number; note: string | null }

/** Calls the model at most MAX_AI_ATTEMPTS times; one retry on a retryable provider failure or on invalid output. */
export async function requestCompletion(extractor: ImportExtractor, args: { mode: ItineraryMode; locale: string | null; segments: string[] }, sleep: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms))): Promise<CompletionOutcome> {
  const usage = { promptTokens: 0, completionTokens: 0, actualUsd: 0 as number | null };
  let attempts = 0;
  let lastNote: string | null = null;
  const addUsage = (part: ProviderUsage) => {
    usage.promptTokens += part.promptTokens ?? 0;
    usage.completionTokens += part.completionTokens ?? 0;
    usage.actualUsd = part.costUsd === null || usage.actualUsd === null ? null : usage.actualUsd + part.costUsd;
  };
  while (attempts < MAX_AI_ATTEMPTS) {
    attempts += 1;
    try {
      const result = await extractor.extract({ mode: args.mode, locale: args.locale, segments: args.segments, maxTokens: 3000 }, 120_000);
      addUsage(result.usage);
      try {
        const json = parseCompletionText(result.text);
        if (validateCompletion(json)) return { completion: json as Completion, usage, attempts, note: null };
        lastNote = 'Jawaban AI tidak sesuai bentuk yang diminta.';
      } catch {
        lastNote = 'Jawaban AI tidak bisa dibaca sebagai JSON.';
      }
    } catch (cause) {
      if (cause instanceof ProviderFailure && cause.kind === 'retryable' && attempts < MAX_AI_ATTEMPTS) {
        await sleep(Math.min(cause.retryAfterMs || 1000, 5000));
        continue;
      }
      return { completion: null, usage, attempts, note: 'AI tidak bisa menyelesaikan bagian yang tidak terbaca; bagian itu dibiarkan kosong.' };
    }
  }
  return { completion: null, usage, attempts, note: `${lastNote ?? 'Jawaban AI tidak valid.'} Bagian itu dibiarkan kosong.` };
}
