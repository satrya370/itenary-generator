import type { ItineraryMode } from '../../../contracts/types.js';
import { kindFromText, dateFromText, type ActivityKind } from '../normalize.js';
import { classifyLines, keyFor, type HeadingTarget, type SourceLine } from './lines.js';
import { dayMarkerFor } from './days.js';
import { readTimeLine } from './time.js';
import { dict } from './text.js';

export const LIST_SECTIONS = ['included', 'notIncluded', 'whatToBring', 'notSuitableFor', 'notAllowed', 'localTips'] as const;
export type ListSection = (typeof LIST_SECTIONS)[number];
export const MAX_DAYS = 14;
const URL_IN_TEXT = /(https?:\/\/\S+|maps\.app\.goo\.gl\/\S+|goo\.gl\/maps\/\S+|google\.[a-z.]+\/maps\S*)/i;

export interface ParsedActivity { time: string | null; durationMinutes: number | null; title: string; kind: ActivityKind; ambiguousTime: boolean; line: number }
export interface ParsedDay { dayNumber: number; title: string | null; activities: ParsedActivity[]; line: number }
export interface UnconsumedLine { index: number; text: string; section: string | null }

export interface ParseResult {
  mode: ItineraryMode;
  fields: {
    trip: { title?: string; destination?: string; country?: string; startDate?: string; mode: ItineraryMode };
    guide: { name?: string; phone?: string };
    meeting: { place?: string; mapsUrl?: string; time?: string };
    lists: Partial<Record<ListSection, string[]>>;
    emergencyContacts: Array<{ label: string; value: string }>;
    days: ParsedDay[];
  };
  unconsumed: UnconsumedLine[];
  totalLines: number;
  consumedLines: number;
  notes: string[];
}

/** Deterministic parse of the document. Copies text that exists; never invents values. Unknown text stays in `unconsumed`. */
export function parseDocument(text: string, mode: ItineraryMode): ParseResult {
  const lines = classifyLines(text).filter((line) => line.kind !== 'blank');
  const result: ParseResult = {
    mode,
    fields: { trip: { mode }, guide: {}, meeting: {}, lists: {}, emergencyContacts: [], days: [] },
    unconsumed: [], totalLines: lines.length, consumedLines: 0, notes: []
  };
  const dayMode = mode !== 'destination_guide';
  const singleDay = mode === 'half_day' || mode === 'full_day';
  let section: HeadingTarget | null = null;
  let titleDone = false;
  let lastDay = 0;
  let ignoreDays = false;
  let capNoted = false;
  let multiDayNoted = false;
  let dayIndex: number | null = null;

  const keep = (line: SourceLine) => result.unconsumed.push({ index: line.index, text: line.text, section });
  const consume = () => { result.consumedLines += 1; };

  for (const line of lines) {
    if (line.kind === 'heading') { section = line.heading ?? null; consume(); continue; }

    if (dayMode && line.kind !== 'url') {
      const marker = dayMarkerFor(line.text);
      if (marker && marker.number === lastDay + 1) {
        lastDay = marker.number;
        consume();
        section = null;
        if (singleDay && result.fields.days.length >= 1) {
          ignoreDays = true; dayIndex = null;
          if (!multiDayNoted) { multiDayNoted = true; result.notes.push('Dokumen berisi lebih dari satu hari; untuk semuanya pilih mode Beberapa hari. Mode ini hanya memakai hari 1.'); }
          continue;
        }
        if (result.fields.days.length >= MAX_DAYS) {
          ignoreDays = true; dayIndex = null;
          if (!capNoted) { capNoted = true; result.notes.push(`Dokumen berisi lebih dari ${MAX_DAYS} hari; hanya ${MAX_DAYS} hari pertama yang dibaca.`); }
          continue;
        }
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
      if (key && handleKeyValue(result, key, line.value, line.index)) { consume(); continue; }
    }

    if (section === 'emergencyContacts' && line.kind === 'key-value' && line.label && line.value) {
      result.fields.emergencyContacts.push({ label: line.label, value: line.value }); consume(); continue;
    }

    if (section === 'meeting' && line.kind === 'url') {
      const url = URL_IN_TEXT.exec(line.text)?.[0];
      if (url && !result.fields.meeting.mapsUrl) { result.fields.meeting.mapsUrl = url.startsWith('http') ? url : `https://${url}`; consume(); continue; }
    }

    if (section && (LIST_SECTIONS as readonly string[]).includes(section) && line.kind === 'bullet' && line.bullet) {
      const list = section as ListSection;
      (result.fields.lists[list] ??= []).push(line.bullet); consume(); continue;
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
  return result;
}

function handleKeyValue(result: ParseResult, key: keyof typeof dict.keyValue, value: string, index: number): boolean {
  switch (key) {
    case 'destination': result.fields.trip.destination = value; return true;
    case 'country': result.fields.trip.country = value; return true;
    case 'date': {
      const { date, note } = dateFromText(value);
      if (date) result.fields.trip.startDate = date; else if (note) result.notes.push(note);
      return true;
    }
    case 'guide': result.fields.guide.name = value; return true;
    case 'phone': result.fields.guide.phone = value; return true;
    case 'meetingPlace': {
      const url = URL_IN_TEXT.exec(value)?.[0];
      if (url) result.fields.meeting.mapsUrl = url.startsWith('http') ? url : `https://${url}`;
      else result.fields.meeting.place = value;
      return true;
    }
    case 'meetingTime': {
      const reading = readTimeLine(value);
      if (reading?.time) result.fields.meeting.time = reading.time;
      else result.notes.push(`Baris ${index + 1}: jam kumpul tidak jelas; isi manual.`);
      return true;
    }
    default: return false;
  }
}
