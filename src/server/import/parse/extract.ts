import type { ItineraryMode } from '../../../contracts/types.js';
import { kindFromText, dateFromText, type ActivityKind } from '../normalize.js';
import { classifyLines, keyFor, type HeadingTarget, type SourceLine } from './lines.js';
import { dayMarkerFor } from './days.js';
import { timePartOf } from './clean.js';
import { durationIn, readTimeLine } from './time.js';
import { paragraphClauses, phonesIn, splitInlineList } from './clean.js';
import { fold } from './text.js';
import { ageRangeFrom, categoryFrom, difficultyFrom, durationFrom, languagesFrom, sessionsFrom, stepFrom, wholeNumberFrom, type ActivityCategory, type ActivityDifficulty } from './activity.js';
import { dict } from './text.js';

export const LIST_SECTIONS = ['included', 'notIncluded', 'whatToBring', 'notSuitableFor', 'notAllowed', 'localTips'] as const;
export type ListSection = (typeof LIST_SECTIONS)[number];
export const MAX_DAYS = 14;
export const MAX_HIGHLIGHTS = 5;
export const MAX_STEPS = 12;
const URL_IN_TEXT = /(https?:\/\/\S+|maps\.app\.goo\.gl\/\S+|goo\.gl\/maps\/\S+|google\.[a-z.]+\/maps\S*)/i;

export interface ParsedActivity { time: string | null; durationMinutes: number | null; title: string; kind: ActivityKind; ambiguousTime: boolean; line: number; tip?: string }
/** Column roles recognised in a copied table header (Jam | Kegiatan | Durasi | Keterangan). */
type TableRole = 'time' | 'title' | 'duration' | 'tip' | 'place';
const TABLE_ROLES: Record<string, TableRole> = { jam: 'time', waktu: 'time', time: 'time', kegiatan: 'title', aktivitas: 'title', activity: 'title', durasi: 'duration', duration: 'duration', lama: 'duration', keterangan: 'tip', catatan: 'tip', note: 'tip', notes: 'tip', tempat: 'place', lokasi: 'place', location: 'place' };
/** Labels that name the trip explicitly. A value after one of them is the title whatever its position. */
const TITLE_LABELS = new Set(['judul', 'nama tur', 'nama trip', 'nama paket', 'title', 'trip', 'paket']);
const ANNOTATION = /\s*\((?:revisi?|revision|draft|final)\b[^)]*\)|\s+v\d+\b/gi;
const COMMON_ABBREVIATIONS = new Set(['dr', 'prof', 'st', 'jl', 'jln', 'no', 'etc', 'dst', 'dkk', 'pt', 'cv', 'tbk', 'mr', 'mrs', 'ms', 'vs', 'vol']);
export interface ParsedDay { dayNumber: number; title: string | null; activities: ParsedActivity[]; line: number }
export interface UnconsumedLine { index: number; text: string; section: string | null }
export interface ParseDiagnostic { code: 'PARSER_NOTE' | 'UNCONSUMED_TEXT'; line?: number; message: string }
/** A "Label: value" line whose label the dictionary does not know. Kept for the AI step; the guide chooses its field in review. */
export type UnknownValueType = 'phone' | 'email' | 'url' | 'date' | 'time' | 'text';
export interface UnknownLabel { label: string; value: string; line: number; valueType: UnknownValueType }
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
    /** Destination guide only: place names read from bullets or short lines. */
    places: string[];
    /** Policy lines ("Refund: …", "DP 50%…") in document order. */
    policies: string[];
  };
  unconsumed: UnconsumedLine[];
  totalLines: number;
  consumedLines: number;
  notes: string[];
  diagnostics: ParseDiagnostic[];
  conflicts: ParseConflict[];
  unknownLabels: UnknownLabel[];
  coverage: { totalLines: number; consumedLines: number; unconsumedLines: number; ratio: number };
}

/** The kind of value, read from its shape only. It decides which fields a guide may send an unknown label to. */
function valueTypeOf(value: string): UnknownValueType {
  if (phonesIn(value).length) return 'phone';
  if (/@/.test(value) && /\.[a-z]{2,}/i.test(value)) return 'email';
  if (URL_IN_TEXT.test(value)) return 'url';
  if (dateFromText(value).date || /\b\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}\b/.test(value)) return 'date';
  if (readTimeLine(value)?.time) return 'time';
  return 'text';
}

/** Deterministic parse of the document. Copies text that exists; never invents values. Unknown text stays in `unconsumed`. */
export function parseDocument(text: string, mode: ItineraryMode, excludedLines: ReadonlySet<number> = new Set()): ParseResult {
  const normalized = text.normalize('NFC').replace(/\r\n?/g, '\n').replace(/[\u200B-\u200D\uFEFF]/g, '').trim();
  const lines = classifyLines(normalized, mode).filter((line) => line.kind !== 'blank');
  const result: ParseResult = {
    mode,
    fields: { trip: { mode }, guide: {}, meeting: {}, lists: {}, emergencyContacts: [], days: [], activity: { sessionTimes: [], guideLanguages: [], highlights: [], steps: [] }, places: [], policies: [] },
    unconsumed: [], totalLines: lines.length, consumedLines: 0, notes: [], diagnostics: [], conflicts: [], unknownLabels: [],
    coverage: { totalLines: lines.length, consumedLines: 0, unconsumedLines: 0, ratio: 0 }
  };
  const dayMode = mode === 'half_day' || mode === 'full_day' || mode === 'multi_day';
  const singleDay = mode === 'half_day' || mode === 'full_day';
  let section: HeadingTarget | null = null;
  let tableHeader: TableRole[] | null = null;
  let timePartNoted = false;
  let lastDay = 0;
  let ignoreDays = false;
  let capNoted = false;
  let multiDayNoted = false;
  let dayIndex: number | null = null;
  const scalarConflicts = new Set<string>();
  const scalarOccurrences = new Map<string, Array<{ value: string; line: number }>>();

  const keep = (line: SourceLine) => {
    result.unconsumed.push({ index: line.index, text: line.text, section });
    // Any "Label: value" line the parser did not use is reported, including a known label that does not apply to this mode.
    if (line.kind === 'key-value' && line.label && line.value && /\p{L}/u.test(line.label) && line.label.length <= 40) {
      result.unknownLabels.push({ label: line.label, value: line.value, line: line.index, valueType: valueTypeOf(line.value) });
    }
    // Prices are never written to the engine (SPEC: no price fields); the line is named in the report.
    if (/\b(rp|idr|usd)\.?\s*\d|\$\s*\d|\d+\s*(rb|ribu|jt|juta)\b/i.test(line.text)) result.notes.push(`Baris ${line.index + 1}: harga tidak didukung engine; tidak diisi.`);
  };
  const consume = () => { result.consumedLines += 1; };
  let highlightsCapped = false;
  let stepsCapped = false;

  for (let at = 0; at < lines.length; at += 1) {
    const line = lines[at];
    if (excludedLines.has(line.index)) {
      result.unconsumed.push({ index: line.index, text: line.text, section: 'layout-ambiguous' });
      section = null; dayIndex = null;
      continue;
    }
    if (line.kind === 'noise') {
      consume();
      result.notes.push(`Baris ${line.index + 1}: diabaikan (${line.reason}); tidak dibaca sebagai data.`);
      continue;
    }
    if (line.kind === 'heading') {
      section = line.heading ?? null;
      tableHeader = null;
      if (line.inlineValue && section && (LIST_SECTIONS as readonly string[]).includes(section)) {
        const list = section as ListSection;
        (result.fields.lists[list] ??= []).push(...splitInlineList(line.inlineValue));
      } else if (line.inlineValue) {
        keep({ ...line, text: line.inlineValue, kind: 'text' });
      }
      consume(); continue;
    }

    if (line.cells && dayMode && (!ignoreDays || tableHeader)) {
      const roles = line.cells.map((cell) => TABLE_ROLES[fold(cell)]);
      const recognised = roles.filter(Boolean);
      if (recognised.length >= 2 && (roles.includes('time') || roles.includes('title'))) {
        tableHeader = roles.map((role) => role ?? null) as TableRole[];
        consume(); continue;
      }
      const roleList: Array<TableRole | null> = tableHeader ?? (readTimeLine(line.cells[0]) ? ['time', 'title', 'duration', 'tip'] : []);
      if (roleList.length && roleList.includes('time') && roleList.includes('title') && line.cells.length >= 2) {
        if (singleDay && result.fields.days.length === 0) {
          result.fields.days.push({ dayNumber: 1, title: null, activities: [], line: line.index });
          dayIndex = 0; lastDay = Math.max(lastDay, 1);
        }
        if (dayIndex !== null) {
          const cell = (role: TableRole) => { const position = roleList.indexOf(role); return position >= 0 ? line.cells![position] : undefined; };
          const timeCell = cell('time') ?? '';
          const reading = readTimeLine(timeCell);
          const titleText = cell('title') ?? '';
          const durationText = cell('duration');
          const duration = durationText ? durationIn(durationText) : null;
          // Text left in the duration cell after the duration itself is a remark, not lost.
          const durationRemark = duration && !duration.unclear && durationText ? durationText.replace(duration.span, ' ').replace(/\s+/g, ' ').trim() : '';
          if (!reading?.time) result.notes.push(`Baris ${line.index + 1}: jam tabel tidak jelas; jam dikosongkan.`);
          result.fields.days[dayIndex].activities.push({
            time: reading?.time ?? null, durationMinutes: duration && !duration.unclear ? duration.minutes : null,
            title: titleText, kind: kindFromText(titleText), ambiguousTime: !reading?.time, line: line.index, tip: cell('tip') || durationRemark || undefined
          });
          consume(); continue;
        }
      }
    }

    if (section === 'timePart' && dayMode && !ignoreDays && (line.kind === 'bullet' || line.kind === 'text') && !dayMarkerFor(line.text)) {
      const text = line.kind === 'bullet' ? line.bullet ?? line.text : line.text;
      if (singleDay && result.fields.days.length === 0) {
        result.fields.days.push({ dayNumber: 1, title: null, activities: [], line: line.index });
        dayIndex = 0; lastDay = Math.max(lastDay, 1);
      }
      if (dayIndex !== null) {
        const reading = readTimeLine(text);
        const title = reading ? reading.rest || text : text;
        if (!reading && !timePartNoted) { timePartNoted = true; result.notes.push(`Baris ${line.index + 1}: aktivitas di bagian waktu tanpa jam pasti; jam dikosongkan.`); }
        result.fields.days[dayIndex].activities.push({ time: reading?.time ?? null, durationMinutes: reading?.durationMinutes ?? null, title, kind: kindFromText(title), ambiguousTime: false, line: line.index });
        consume(); continue;
      }
    }

    if (dayMode && line.kind !== 'url') {
      const marker = dayMarkerFor(line.text);
      if (marker) {
        section = null;
        tableHeader = null;
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

    if (!result.fields.trip.title && section === null && line.kind === 'text' && !line.chat && result.fields.days.length === 0 && at < 3 && isTitleCandidate(lines, at)) {
      setTitle(result, line.text, line.index);
      consume(); continue;
    }

    if (line.kind === 'key-value' && line.label && line.value && TITLE_LABELS.has(fold(line.label)) && !result.fields.trip.title) {
      setTitle(result, line.value, line.index);
      consume(); continue;
    }

    if (line.kind === 'key-value' && line.label && line.value) {
      const key = keyFor(line.label);
      if (key && handleKeyValue(result, key, line.value, line.index, scalarConflicts, scalarOccurrences, line.label)) { consume(); continue; }
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
      // A numbered or bulleted line ("1. 08.30 Kebun raya", "- 08:00 – Jemput") is read from its content, not its marker.
      const reading = readTimeLine(line.kind === 'bullet' ? line.bullet ?? line.text : line.text);
      if (reading) {
        if (dayIndex === null && singleDay) {
          result.fields.days.push({ dayNumber: 1, title: null, activities: [], line: line.index });
          dayIndex = 0; lastDay = Math.max(lastDay, 1);
        }
        if (dayIndex !== null) {
          const remainder = reading.rest || line.text;
          const split = splitActivitySentence(remainder);
          const title = split?.title || remainder;
          if (reading.ambiguous) result.notes.push(`Baris ${line.index + 1}: jam tidak jelas; judul diisi, jam dikosongkan.`);
          if (reading.durationUnclear) result.notes.push(`Baris ${line.index + 1}: durasi tidak dibaca utuh; dikosongkan.`);
          result.fields.days[dayIndex].activities.push({ time: reading.time, durationMinutes: reading.durationMinutes, title, kind: kindFromText(title), ambiguousTime: reading.ambiguous, line: line.index });
          const unresolvedDetail = split?.detail ?? (possibleInlineProse(remainder) ? remainder : null);
          if (unresolvedDetail) {
            // Keep the exact detail sentence as unresolved evidence. CP031 owns target binding/AI assignment;
            // a parser-only pass must not silently add it to the activity or a global field.
            result.unconsumed.push({ index: line.index, text: unresolvedDetail, section });
            result.notes.push(split
              ? `Baris ${line.index + 1}: detail setelah judul aktivitas dipisahkan untuk pemeriksaan lanjutan.`
              : `Baris ${line.index + 1}: kemungkinan detail aktivitas tidak memiliki batas yang jelas; teks disimpan untuk pemeriksaan lanjutan.`);
          } else consume();
          section = null; continue;
        }
      }
    }
    // A bullet or a short line without a full stop is a place name; a sentence ("A quiet gallery ….") is left for the description step.
    if (mode === 'destination_guide' && (line.kind === 'bullet' || (line.kind === 'text' && line.text.length <= 60 && !/[.!?]$/.test(line.text)))) {
      const raw = line.kind === 'bullet' ? line.bullet ?? line.text : line.text;
      const reading = readTimeLine(raw);
      const name = (reading ? reading.rest : raw).trim();
      if (reading?.time) result.notes.push(`Baris ${line.index + 1}: jam pada daftar tempat dibuang; destinasi tidak memakai jadwal.`);
      // The line stays unconsumed: the AI step needs it as quote context for area and description. The AI's places win when present.
      if (name) { result.fields.places.push(name); consume(); }
    }

    if (dayMode && line.kind === 'text' && line.text.length > 160) {
      const clauses = paragraphClauses(line.text);
      const readable = clauses.filter((item) => item.reading).length;
      if (readable > 0) {
        if (singleDay && result.fields.days.length === 0) {
          result.fields.days.push({ dayNumber: 1, title: null, activities: [], line: line.index });
          dayIndex = 0; lastDay = Math.max(lastDay, 1);
        }
        const guideName = /guide\s*:\s*([^\d(+]+?)\s*\(?\s*\+?\d/i.exec(line.text)?.[1]?.trim();
        if (guideName && !result.fields.guide.name) result.fields.guide.name = guideName;
        if (dayIndex !== null) {
          for (const item of clauses) {
            if (item.reading) {
              result.fields.days[dayIndex].activities.push({ time: item.reading.time, durationMinutes: null, title: item.reading.rest || item.clause, kind: kindFromText(item.reading.rest || item.clause), ambiguousTime: false, line: line.index });
            } else {
              result.unconsumed.push({ index: line.index, text: item.clause, section });
            }
          }
          result.notes.push(`Baris ${line.index + 1}: paragraf dipecah per klausa; klausa tanpa jam pasti tetap dicek manual.`);
          consume(); continue;
        }
      }
    }

    keep(line);
  }
  // A phone number in free text is used only when it is the single one in the document (never guessed among several).
  if (!result.fields.guide.phone) {
    const found = new Map<string, string>();
    for (const item of result.unconsumed) for (const phone of phonesIn(item.text)) found.set(phone.replace(/\D/g, ''), phone);
    if (found.size === 1) {
      result.fields.guide.phone = [...found.values()][0];
      result.notes.push('Nomor HP diambil dari teks bebas karena hanya ada satu; periksa.');
    }
  }
  if (!result.fields.trip.title && lines.length) result.notes.push('Judul tidak terbaca dengan pasti; isi manual.');
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

/** Split only at an explicit sentence boundary; uncertain punctuation remains part of the source title. */
function splitActivitySentence(value: string): { title: string; detail: string } | null {
  const boundary = /[.!?。！？][”’"')\]]*\s+(?=\p{Lu})/gu;
  let match: RegExpExecArray | null;
  while ((match = boundary.exec(value)) !== null) {
    const punctuationEnd = match.index + match[0].trimEnd().length;
    const prefix = value.slice(0, punctuationEnd).trim();
    const detail = value.slice(boundary.lastIndex).trim();
    const lastWord = /([\p{L}]+)\.$/u.exec(prefix)?.[1]?.toLocaleLowerCase();
    const initial = /(?:^|\s)\p{Lu}\.$/u.test(prefix);
    if (initial || (lastWord && COMMON_ABBREVIATIONS.has(lastWord)) || prefix.length < 4 || detail.length < 4) continue;
    return { title: prefix, detail };
  }
  return null;
}

/** A lowercase sentence boundary or a long prose-like tail is retained for review, never split by a guess. */
function possibleInlineProse(value: string): boolean {
  return /[.!?。！？][”’"')\]]*\s+\p{Ll}/u.test(value) || (value.length >= 100 && value.trim().split(/\s+/).length >= 12);
}

/**
 * A plain first line becomes the title only when it is short, text-like and followed by real structure (a label, a day
 * marker, a timed line or a heading) within five lines. Greetings, URLs, sentences and chat lines never qualify.
 */
function isTitleCandidate(lines: SourceLine[], at: number): boolean {
  const text = lines[at].text;
  if (text.length < 3 || text.length > 80 || !/\p{L}.*\p{L}/u.test(text) || /[!?]$/.test(text)) return false;
  if (/^\d/.test(text) || readTimeLine(text) || URL_IN_TEXT.test(text) || dayMarkerFor(text) || timePartOf(text)) return false;
  return lines.slice(at + 1, at + 6).some((line) => line.kind === 'heading' || line.kind === 'key-value' || line.kind === 'text' && Boolean(dayMarkerFor(line.text)) || Boolean(readTimeLine(line.bullet ?? line.text)));
}

function setTitle(result: ParseResult, raw: string, index: number): void {
  const cleaned = raw.replace(ANNOTATION, '').replace(/\s+/g, ' ').trim();
  if (!cleaned) return;
  if (cleaned !== raw.trim()) result.notes.push(`Baris ${index + 1}: anotasi revisi atau draft dibuang dari judul.`);
  result.fields.trip.title = cleaned;
}

function handleKeyValue(result: ParseResult, key: keyof typeof dict.keyValue, value: string, index: number, conflicts: Set<string>, occurrences: Map<string, Array<{ value: string; line: number }>>, label: string): boolean {
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
    case 'guide': {
      // "mas Dimas (wa 0857 1234 5678)": the number is the phone, the rest is the name.
      const phone = phonesIn(value)[0];
      const name = phone ? value.replace(phone, '').replace(/\(\s*(wa)?\s*\)|\bwa\b\s*:?/gi, ' ').replace(/[()]/g, ' ').replace(/\s+/g, ' ').trim() : value;
      if (phone && !result.fields.guide.phone) result.fields.guide.phone = phone;
      if (name) setScalar('guide', result.fields.guide.name, name, () => { result.fields.guide.name = name; }, () => { delete result.fields.guide.name; }, 'Guide');
      return true;
    }
    case 'emergency': {
      for (const part of value.split(/\s*[/|;]\s*/).map((item) => item.trim()).filter(Boolean)) result.fields.emergencyContacts.push({ label, value: part });
      return true;
    }
    case 'policy': result.fields.policies.push(`${label}: ${value}`); return true;
    case 'phone': setScalar('phone', result.fields.guide.phone, value, () => { result.fields.guide.phone = value; }, () => { delete result.fields.guide.phone; }, 'Nomor guide'); return true;
    case 'meetingPlace': {
      const url = URL_IN_TEXT.exec(value)?.[0];
      // "stasiun bgr pintu utara jm 8": a clock phrase glued to the place is not a place; its time is unclear.
      const clock = /\s+(?:jam|jm|pukul)\s*\d{1,2}(?:[.:]\d{2})?(?:\s*(?:am|pm|pagi|siang|sore|malam|wib|wita))?\s*$/i.exec(value);
      const withoutClock = clock ? value.slice(0, clock.index).trim() : value;
      if (clock) result.notes.push(`Baris ${index + 1}: jam di titik kumpul tidak jelas; isi jam kumpul manual.`);
      const place = url ? withoutClock.replace(url, '').trim().replace(/[|,;\-–—]+$/, '').trim() : withoutClock;
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
