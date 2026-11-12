import type { ActivityMode } from '../../../contracts/activity.js';
import { durationIn, readTimeLine } from './time.js';
import { fold } from './text.js';

/** Deterministic readers for the activity mode (web-2.2.0). Each reader copies or reformats text that exists; it never guesses.
 * A value it cannot read with certainty is returned as null, and the caller reports it in the notes. */

export type ActivityCategory = NonNullable<ActivityMode['category']>;
export type ActivityDifficulty = NonNullable<ActivityMode['difficulty']>;

const CATEGORY_WORDS: Record<string, ActivityCategory> = {
  petualangan: 'adventure', adventure: 'adventure',
  air: 'water', water: 'water',
  budaya: 'culture', culture: 'culture', cultural: 'culture',
  wellness: 'wellness',
  alam: 'nature', nature: 'nature',
  keluarga: 'family', family: 'family'
};

const DIFFICULTY_WORDS: Record<string, ActivityDifficulty> = {
  mudah: 'easy', ringan: 'easy', easy: 'easy',
  sedang: 'moderate', moderate: 'moderate', medium: 'moderate',
  sulit: 'challenging', menantang: 'challenging', challenging: 'challenging', hard: 'challenging', difficult: 'challenging'
};

/** Exact word match only. "Rafting" is not a category; "Air" is. */
export function categoryFrom(value: string): ActivityCategory | null { return CATEGORY_WORDS[fold(value).replace(/[.]$/, '')] ?? null; }
export function difficultyFrom(value: string): ActivityDifficulty | null { return DIFFICULTY_WORDS[fold(value).replace(/[.]$/, '')] ?? null; }

export function durationFrom(value: string): number | null {
  const reading = durationIn(value);
  return reading && reading.minutes >= 15 && reading.minutes <= 720 ? reading.minutes : null;
}

/** "08:00, 13:00" or "8 pagi dan 1 siang". A token that is not a clear clock time is returned in `unclear`. */
export function sessionsFrom(value: string): { times: string[]; unclear: string[] } {
  const times: string[] = []; const unclear: string[] = [];
  for (const token of value.split(/[,;/]|\bdan\b|\band\b/i).map((part) => part.trim()).filter(Boolean)) {
    const reading = readTimeLine(token);
    if (reading?.time && !reading.ambiguous && !reading.rest) { if (!times.includes(reading.time)) times.push(reading.time); }
    else unclear.push(token);
  }
  return { times: times.sort().slice(0, 8), unclear };
}

/** One whole number with an optional unit. "8", "8 tahun", "120 kg". Words and ranges are not accepted here. */
export function wholeNumberFrom(value: string, min: number, max: number): number | null {
  const match = /^\s*(\d{1,3})\s*(?:\+|tahun|thn|th|years?|yrs?|yo|kg|kilo)?\s*\.?\s*$/i.exec(value);
  if (!match) return null;
  const number = Number(match[1]);
  return number >= min && number <= max ? number : null;
}

/** "8-60", "8 – 60 tahun" or "8+". Returns the bounds that are written; the other stays null. */
export function ageRangeFrom(value: string): { min: number | null; max: number | null } | null {
  const range = /^\s*(\d{1,2})\s*(?:-|–|sampai|hingga|to)\s*(\d{1,2})\s*(?:tahun|thn|th|years?|yrs?)?\s*$/i.exec(value);
  if (range) {
    const min = Number(range[1]); const max = Number(range[2]);
    return min <= max ? { min, max } : null;
  }
  const open = /^\s*(\d{1,2})\s*\+\s*(?:tahun|thn|th|years?|yrs?)?\s*$/i.exec(value);
  if (open) return { min: Number(open[1]), max: null };
  const single = wholeNumberFrom(value, 0, 99);
  return single === null ? null : { min: single, max: null };
}

export function languagesFrom(value: string): string[] {
  return value.split(/[,;/&]|\bdan\b|\band\b/i).map((part) => part.trim()).filter((part) => part.length > 0 && part.length <= 40).slice(0, 6);
}

/** "Briefing keselamatan (15 menit)" gives a title and 15 minutes. Without a clear "(N menit)" the whole line is the title. */
export function stepFrom(text: string): { title: string; minutes: number | null } {
  const match = /^(.*?)\s*[(\[]\s*(\d{1,3})\s*(?:menit|min|minutes?|mnt)\s*[)\]]\s*$/i.exec(text.trim());
  if (match && match[1].trim()) return { title: match[1].trim(), minutes: Number(match[2]) };
  return { title: text.trim(), minutes: null };
}
