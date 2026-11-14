import type { ItineraryMode } from '../../../contracts/types.js';
import { kindFromText, dateFromText, type ActivityKind } from '../normalize.js';
import { classifyLines, keyFor, type HeadingTarget, type SourceLine } from './lines.js';
import { dayMarkerFor } from './days.js';
import { readTimeLine } from './time.js';
import { ageRangeFrom, categoryFrom, difficultyFrom, durationFrom, languagesFrom, sessionsFrom, stepFrom, wholeNumberFrom, type ActivityCategory, type ActivityDifficulty } from './activity.js';
import { dict } from './text.js';

export const LIST_SECTIONS = ['included', 'notIncluded', 'whatToBring', 'notSuitableFor', 'notAllowed', 'localTips'] as const;
export type ListSection = (typeof LIST_SECTIONS)[number];
export const MAX_DAYS = 14;
export const MAX_HIGHLIGHTS = 5;
export const MAX_STEPS = 12;
const URL_IN_TEXT = /(https?:\/\/\S+|maps\.app\.goo\.gl\/\S+|goo\.gl\/maps\/\S+|google\.[a-z.]+\/maps\S*)/i;

export interface ParsedActivity { time: string | null; durationMinutes: number | null; title: string; kind: ActivityKind; ambiguousTime: boolean; line: number }
export interface ParsedDay { dayNumber: number; title: string | null; activities: ParsedActivity[]; line: number }
export interface UnconsumedLine { index: number; text: string; section: string | null }
export interface ParseDiagnostic { code: 'PARSER_NOTE' | 'UNCONSUMED_TEXT'; line?: number; message: string }
export interface ParseConflict { path: string; values: string[]; line: number; message: string; occurrences: Array<{ value: string; line: number }> }
/** What the activity mode reads from the text (web-2.2.0). Empty for every other mode. */
export interface ParsedActivityMode {
  category?: ActivityCategory; durationMinutes?: number; sessionTimes: string[]; difficulty?: ActivityDifficulty;
  ageMin?: number; ageMax?: number; weightMaxKg?: number; guideLanguages: string[]; operator?: string; bestTime?: string;
  highlights: string[]; steps: Array<{ title: string; minutes: number | null }>;
}

export interface ParseResult {
  mode: ItineraryMode;
  fields: {
    trip: { title?: string; destination?: string; country?: string; startDate?: string; mode: ItineraryMode };
    guide: { name?: string; phone?: string };
    meeting: { place?: string; mapsUrl?: string; time?: string };
    lists: Partial<Record<ListSection, string[]>>;
    emergencyContacts: Array<{ label: string; value: string }>;
    days: ParsedDay[];
    activity: ParsedActivityMode;
  };
  unconsumed: UnconsumedLine[];
  totalLines: number;
  consumedLines: number;
  notes: string[];
  diagnostics: ParseDiagnostic[];
  conflicts: ParseConflict[];
  coverage: { totalLines: number; consumedLines: number; unconsumedLines: number; ratio: number };
}

/** Deterministic parse of the document. Copies text that exists; never invents values. Unknown text stays in `unconsumed`. */
export function parseDocument(text: string, mode: ItineraryMode, excludedLines: ReadonlySet<number> = new Set()): ParseResult {
  const normalized = text.normalize('NFC').replace(/\r\n?/g, '\n').replace(/[\u200B-\u200D\uFEFF]/g, '').trim();
  const lines = classifyLines(normalized, mode).filter((line) => line.kind !== 'blank');
  const result: ParseResult = {
    mode,
    fields: { trip: { mode }, guide: {}, meeting: {}, lists: {}, emergencyContacts: [], days: [], activity: { sessionTimes: [], guideLanguages: [], highlights: [], steps: [] } },
    unconsumed: [], totalLines: lines.length, consumedLines: 0, notes: [], diagnostics: [], conflicts: [],
    coverage: { totalLines: lines.length, consumedLines: 0, unconsumedLines: 0, ratio: 0 }
  };
  const dayMode = mode === 'half_day' || mode === 'full_day' || mode === 'multi_day';
  const singleDay = mode === 'half_day' || mode === 'full_day';
  let section: HeadingTarget | null = null;
  let titleDone = false;
  let lastDay = 0;
  let ignoreDays = false;
  let capNoted = false;
  let multiDayNoted = false;
  let dayIndex: number | null = null;
  const scalarConflicts = new Set<string>();
  const scalarOccurrences = new Map<string, Array<{ value: string; line: number }>>();

  const keep = (line: SourceLine) => result.unconsumed.push({ index: line.index, text: line.text, section });
  const consume = () => { result.consumedLines += 1; };
  let highlightsCapped = false;
  let stepsCapped = false;

  for (const line of lines) {
    if (excludedLines.has(line.index)) {
      result.unconsumed.push({ index: line.index, text: line.text, section: 'layout-ambiguous' });
      section = null; dayIndex = null;
      continue;
    }
    if (line.kind === 'heading') {
      section = line.heading ?? null;
      if (line.inlineValue && section && (LIST_SECTIONS as readonly string[]).includes(section)) {
        const list = section as ListSection;
        (result.fields.lists[list] ??= []).push(line.inlineValue);
      } else if (line.inlineValue) {
        keep({ ...line, text: line.inlineValue, kind: 'text' });
      }
      consume(); continue;
    }

    if (dayMode && line.kind !== 'url') {
      const marker = dayMarkerFor(line.text);
      if (marker) {
        section = null;
        if (singleDay && result.fields.days.length >= 1) {
          consume();
          ignoreDays = true; dayIndex = null;
          if (!multiDayNoted) { multiDayNoted = true; result.notes.push('Dokumen berisi lebih dari satu hari; untuk semuanya pilih mode Beberapa hari. Mode ini hanya memakai hari 1.'); }
          continue;
        }
        if (result.fields.days.length >= MAX_DAYS) {
          consume();
          ignoreDays = true; dayIndex = null;
          if (!capNoted) { capNoted = true; result.notes.push(`Dokumen berisi lebih dari ${MAX_DAYS} hari; hanya ${MAX_DAYS} hari pertama yang dibaca.`); }
          continue;
        }
        const duplicate = result.fields.days.some((day) => day.dayNumber === marker.number);
        if (duplicate || marker.number <= lastDay || marker.number > MAX_DAYS) {
          dayIndex = null;
          ignoreDays = true;
          const reason = duplicate ? 'penanda hari berulang' : marker.number > MAX_DAYS ? 'nomor hari melebihi batas' : 'urutan nomor hari mundur';
          result.notes.push(`Baris ${line.index + 1}: ${reason}; aktivitas setelahnya tidak ditempel ke hari lain.`);
          keep(line);
          continue;
        }
        consume();
        if (marker.number !== lastDay + 1) result.notes.push(`Baris ${line.index + 1}: urutan hari melompat dari ${lastDay} ke ${marker.number}; periksa hari yang tidak tercantum.`);
        lastDay = marker.number;
        result.fields.days.push({ dayNumber: marker.number, title: marker.title, activities: [], line: line.index });
        dayIndex = result.fields.days.length - 1;
        ignoreDays = false;
        continue;
      }
    }

    if (!titleDone && section === null && !result.fields.trip.title && line.kind === 'text' && line.text.length <= 120 && result.fields.days.length === 0 && !readTimeLine(line.text)) {
      result.fields.trip.title = line.text; titleDone = true; consume(); continue;
    }

    if (line.kind === 'key-value' && line.label && line.value) {
      const key = keyFor(line.label);
      if (key && handleKeyValue(result, key, line.value, line.index, scalarConflicts, scalarOccurrences)) { consume(); continue; }
    }

    if (section === 'emergencyContacts' && line.kind === 'key-value' && line.label && line.value) {
      result.fields.emergencyContacts.push({ label: line.label, value: line.value }); consume(); continue;
    }

    if (section === 'meeting' && line.kind === 'url') {
      const url = URL_IN_TEXT.exec(line.text)?.[0];
      if (url && !result.fields.meeting.mapsUrl) { result.fields.meeting.mapsUrl = url.startsWith('http') ? url : `https://${url}`; consume(); continue; }
    }

    if (mode === 'activity' && line.kind === 'bullet' && line.bullet && section === 'highlights') {
      if (result.fields.activity.highlights.length < MAX_HIGHLIGHTS) result.fields.activity.highlights.push(line.bullet);
      else if (!highlightsCapped) { highlightsCapped = true; result.notes.push(`Highlight dibatasi ${MAX_HIGHLIGHTS} poin; sisanya tidak dimasukkan.`); }
      consume(); continue;
    }
    if (mode === 'activity' && line.kind === 'bullet' && line.bullet && section === 'steps') {
      if (result.fields.activity.steps.length < MAX_STEPS) result.fields.activity.steps.push(stepFrom(line.bullet));
      else if (!stepsCapped) { stepsCapped = true; result.notes.push(`Jalannya kegiatan dibatasi ${MAX_STEPS} langkah; sisanya tidak dimasukkan.`); }
      consume(); continue;
    }

    if (section && (LIST_SECTIONS as readonly string[]).includes(section) && line.kind === 'bullet' && line.bullet) {
      const list = section as ListSection;
      (result.fields.lists[list] ??= []).push(line.bullet); consume(); continue;
    }

    if (section && (LIST_SECTIONS as readonly string[]).includes(section) && line.kind === 'text' && !readTimeLine(line.text)) {
      const list = section as ListSection;
      (result.fields.lists[list] ??= []).push(line.text); consume(); continue;
    }

    if (dayMode && !ignoreDays) {
      const reading = readTimeLine(line.text);
      if (reading) {
        if (dayIndex === null && singleDay) {
          result.fields.days.push({ dayNumber: 1, title: null, activities: [], line: line.index });
          dayIndex = 0; lastDay = Math.max(lastDay, 1);
        }
        if (dayIndex !== null) {
          const title = reading.rest || line.text;
          if (reading.ambiguous) result.notes.push(`Baris ${line.index + 1}: jam tidak jelas; judul diisi, jam dikosongkan.`);
          result.fields.days[dayIndex].activities.push({ time: reading.time, durationMinutes: reading.durationMinutes, title, kind: kindFromText(title), ambiguousTime: reading.ambiguous, line: line.index });
          consume(); section = null; continue;
        }
      }
    }
    keep(line);
  }
  result.diagnostics = [
    ...result.notes.map((message) => ({ code: 'PARSER_NOTE' as const, message })),
    ...result.unconsumed.map((line) => ({ code: 'UNCONSUMED_TEXT' as const, line: line.index + 1, message: `Baris ${line.index + 1} belum dipetakan ke field.` }))
  ];
  result.coverage = {
    totalLines: result.totalLines,
    consumedLines: result.consumedLines,
    unconsumedLines: result.unconsumed.length,
    ratio: result.totalLines === 0 ? 1 : Math.max(0, Math.min(1, result.consumedLines / result.totalLines))
  };
  return result;
}

function handleKeyValue(result: ParseResult, key: keyof typeof dict.keyValue, value: string, index: number, conflicts: Set<string>, occurrences: Map<string, Array<{ value: string; line: number }>>): boolean {
  const setScalar = (path: string, current: string | undefined, next: string, assign: () => void, clear: () => void, label: string) => {
    const prior = occurrences.get(path) ?? [];
    prior.push({ value: next, line: index + 1 });
    occurrences.set(path, prior);
    if (conflicts.has(path)) {
      const conflict = result.conflicts.find((item) => item.path === path);
      if (conflict) { if (!conflict.values.includes(next)) conflict.values.push(next); conflict.occurrences = [...prior]; }
      return;
    }
    if (!current) assign();
    else if (current !== next) {
      clear();
      conflicts.add(path);
      const message = `Baris ${index + 1}: ${label} memiliki nilai berbeda lebih dari satu kali; pilih nilai yang benar secara manual.`;
      result.notes.push(message);
      result.conflicts.push({ path, values: [current, next], line: index + 1, message, occurrences: [...prior] });
    }
  };
  switch (key) {
    case 'destination': setScalar('destination', result.fields.trip.destination, value, () => { result.fields.trip.destination = value; }, () => { delete result.fields.trip.destination; }, 'Destinasi'); return true;
    case 'country': setScalar('country', result.fields.trip.country, value, () => { result.fields.trip.country = value; }, () => { delete result.fields.trip.country; }, 'Negara'); return true;
    case 'date': {
      const { date, note } = dateFromText(value);
      if (date) setScalar('date', result.fields.trip.startDate, date, () => { result.fields.trip.startDate = date; }, () => { delete result.fields.trip.startDate; }, 'Tanggal');
      if (note) result.notes.push(`Baris ${index + 1}: ${note}`);
      return true;
    }
    case 'guide': setScalar('guide', result.fields.guide.name, value, () => { result.fields.guide.name = value; }, () => { delete result.fields.guide.name; }, 'Guide'); return true;
    case 'phone': setScalar('phone', result.fields.guide.phone, value, () => { result.fields.guide.phone = value; }, () => { delete result.fields.guide.phone; }, 'Nomor guide'); return true;
    case 'meetingPlace': {
      const url = URL_IN_TEXT.exec(value)?.[0];
      const place = url ? value.replace(url, '').trim().replace(/[|,;\-–—]+$/, '').trim() : value;
      if (place) setScalar('meeting.place', result.fields.meeting.place, place, () => { result.fields.meeting.place = place; }, () => { delete result.fields.meeting.place; }, 'Titik kumpul');
      if (url) setScalar('meeting.mapsUrl', result.fields.meeting.mapsUrl, url.startsWith('http') ? url : `https://${url}`, () => { result.fields.meeting.mapsUrl = url.startsWith('http') ? url : `https://${url}`; }, () => { delete result.fields.meeting.mapsUrl; }, 'Link peta');
      return true;
    }
    case 'meetingTime': {
      const reading = readTimeLine(value);
      if (reading?.time) result.fields.meeting.time = reading.time;
      else result.notes.push(`Baris ${index + 1}: jam kumpul tidak jelas; isi manual.`);
      return true;
    }
    default: return handleActivityKey(result, key, value, index);
  }
}

/** Activity facts written as "Label: value". Every case needs mode "activity"; elsewhere the line stays for the AI step. */
function handleActivityKey(result: ParseResult, key: keyof typeof dict.keyValue, value: string, index: number): boolean {
  if (result.mode !== 'activity') return false;
  const line = `Baris ${index + 1}`;
  const activity = result.fields.activity;
  switch (key) {
    case 'category': {
      const category = categoryFrom(value);
      if (category) activity.category = category; else result.notes.push(`${line}: jenis kegiatan "${value}" tidak dikenali; pilih manual.`);
      return true;
    }
    case 'duration': {
      const minutes = durationFrom(value);
      if (minutes !== null) activity.durationMinutes = minutes; else result.notes.push(`${line}: durasi "${value}" tidak jelas (15 menit sampai 12 jam); isi manual.`);
      return true;
    }
    case 'sessions': {
      const { times, unclear } = sessionsFrom(value);
      if (times.length) activity.sessionTimes = times;
      if (unclear.length) result.notes.push(`${line}: jam sesi tidak jelas untuk ${unclear.map((item) => `"${item}"`).join(', ')}; isi manual.`);
      return true;
    }
    case 'difficulty': {
      const level = difficultyFrom(value);
      if (level) activity.difficulty = level; else result.notes.push(`${line}: tingkat kesulitan "${value}" tidak dikenali; pilih manual.`);
      return true;
    }
    case 'age': {
      const range = ageRangeFrom(value);
      if (range) { if (range.min !== null) activity.ageMin = range.min; if (range.max !== null) activity.ageMax = range.max; }
      else result.notes.push(`${line}: usia "${value}" tidak jelas; isi manual.`);
      return true;
    }
    case 'ageMin': case 'ageMax': {
      const age = wholeNumberFrom(value, 0, 99);
      if (age === null) result.notes.push(`${line}: usia "${value}" tidak jelas; isi manual.`);
      else if (key === 'ageMin') activity.ageMin = age; else activity.ageMax = age;
      return true;
    }
    case 'weightMax': {
      const weight = wholeNumberFrom(value, 20, 250);
      if (weight !== null) activity.weightMaxKg = weight; else result.notes.push(`${line}: batas berat "${value}" tidak jelas; isi manual.`);
      return true;
    }
    case 'guideLanguages': { const languages = languagesFrom(value); if (languages.length) activity.guideLanguages = languages; return true; }
    case 'operator': activity.operator = value; return true;
    case 'bestTime': activity.bestTime = value; return true;
    default: return false;
  }
}
