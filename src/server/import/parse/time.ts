import { editDistance } from './labels.js';

export interface TimeReading {
  /** "HH:MM" when the text states the time unambiguously; null otherwise. */
  time: string | null;
  durationMinutes: number | null;
  /** Text after the time (and after any duration phrase): the activity title. */
  rest: string;
  /** True when a time-like prefix was found but could not be read safely (for example "jam 8" with no period). */
  ambiguous: boolean;
  /** True when a duration was written but could not be read as a whole; the duration is left empty. */
  durationUnclear?: boolean;
}

const PERIOD_WORDS: Record<string, 'am' | 'pm' | 'day'> = { am: 'am', pagi: 'am', siang: 'day', sore: 'pm', malam: 'pm', pm: 'pm' };

/** Converts a clock reading to 24-hour form. Returns null when the hour or minute is out of range. */
export function toTime24(hour: number, minute: number, period: 'am' | 'pm' | 'day' | null): string | null {
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || minute < 0 || minute > 59) return null;
  let h = hour;
  if (period === 'am') { if (h < 1 || h > 12) return null; h = h === 12 ? 0 : h; }
  else if (period === 'pm') { if (h < 1 || h > 12) return null; h = h === 12 ? 12 : h + 12; }
  else if (period === 'day') { if (h < 1 || h > 12) return null; h = h >= 1 && h <= 11 ? h + 12 : 12; }
  else if (h < 0 || h > 23) return null;
  return `${String(h).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

const UNIT_WORDS = new Set(['jam', 'jm', 'j', 'h', 'hr', 'hrs', 'hour', 'hours', 'menit', 'mnt', 'mn', 'mins', 'min', 'minute', 'minutes', 'm']);
/** A word that is a unit or one typo away from a unit (so "30mtn" is seen as a broken duration, not as nothing). */
function looksLikeUnit(word: string): boolean {
  if (UNIT_WORDS.has(word)) return true;
  return word.length >= 3 && [...UNIT_WORDS].some((unit) => unit.length >= 3 && word[0] === unit[0] && editDistance(word, unit) <= 1);
}

/**
 * "1,5 jam" -> 90, "1jam 30mnt" -> 90, "90'" -> 90, "setengah jam" -> 30, "±10 mnt" -> 10 (approximate).
 * Null when absent or outside 1-1440. When a duration-like token is present but cannot be read as a whole
 * (for example "30mtn"), the result is null with `unclear: true`; a partial sum is never returned.
 */
export function durationIn(text: string): { minutes: number; span: string; approximate: boolean; unclear?: boolean } | null {
  const normalized = text.replace(/setengah\s+jam/gi, '30 menit').replace(/seperempat\s+jam/gi, '15 menit');
  const approximate = /(±|\+-|sekitar|kurang lebih)/i.test(normalized);
  const working = normalized.replace(/±|\+-/g, ' ');
  const pattern = /(\d+(?:[.,]\d+)?)\s*(jam|jm|j|hours?|hrs?|hr|h|menit|mnt|mn|minutes?|mins?|min|m|')(?![a-z])/gi;
  let match: RegExpExecArray | null;
  let minutes = 0;
  let end = 0;
  let count = 0;
  let first = -1;
  while ((match = pattern.exec(working)) !== null) {
    if (count > 0 && working.slice(end, match.index).trim() !== '') break;
    const value = Number(match[1].replace(',', '.'));
    const unit = match[2].toLowerCase();
    minutes += Math.round(unit.startsWith('j') || unit.startsWith('h') ? value * 60 : value);
    if (first < 0) first = match.index;
    end = pattern.lastIndex;
    count += 1;
  }
  const unitTokens = [...working.matchAll(/(\d+(?:[.,]\d+)?)\s*([a-z]+)\b/gi)].filter((token) => looksLikeUnit(token[2].toLowerCase())).length;
  if (count && unitTokens > count) return { minutes: 0, span: '', approximate, unclear: true };
  if (!count || minutes < 1 || minutes > 1440) return null;
  const span = working.slice(first, end);
  return { minutes, span, approximate };
}

/**
 * Reads a time at the start of an activity line. Forms: "08:00", "08.00 WIB", "pukul 08.00", "jam 8" (needs a
 * period or minutes), "8 pagi/siang/sore/malam", "8am", "8 pm", ranges "08:00-10:30", "08.00 – 10.30", "08:00 s/d 10:30".
 * An end time is only used to compute a duration when it is later than the start. Nothing is rounded or invented.
 */
export function readTimeLine(input: string): TimeReading | null {
  const line = input.normalize('NFC').replace(/\s+/g, ' ').trim();
  // With minutes ("09:00") only am/pm/WIB can be a clock marker; "pagi/siang/sore/malam" would be an activity name.
  // Without minutes ("8 pagi") the day-part words are the clock marker.
  const withMinutes = /^(?:(jam|pukul)\s*)?(\d{1,2})[:.](\d{2})\s*(wib|wita|wit|am|pm)?(?![\d])/i.exec(line);
  const withoutMinutes = /^(?:(jam|pukul)\s*)?(\d{1,2})\s*(am|pm|pagi|siang|sore|malam|wib|wita|wit)?(?![\d:.])/i.exec(line);
  const start = withMinutes ?? withoutMinutes;
  if (!start) return null;
  const hasPrefix = Boolean(start[1]);
  const hour = Number(start[2]);
  const hasMinutes = withMinutes !== null;
  const periodWord = ((hasMinutes ? start[4] : start[3]) ?? '').toLowerCase();
  const period = periodWord && !['wib', 'wita', 'wit'].includes(periodWord) ? PERIOD_WORDS[periodWord] ?? null : null;
  if (!hasMinutes && !period) {
    // "jam 8" / "pukul 8" with no minutes and no period is ambiguous: keep the text, leave the time empty.
    // A bare number such as "2 jam" or "12 orang" is not a time at all.
    // The clock words ("jam 8") are dropped from the title; the activity text itself is kept.
    return hasPrefix ? { time: null, durationMinutes: null, rest: line.slice(start[0].length).trim() || line, ambiguous: true } : null;
  }
  const minute = hasMinutes ? Number(start[3]) : 0;
  const time = toTime24(hour, minute, period);
  if (!time) return { time: null, durationMinutes: null, rest: line, ambiguous: true };

  const afterStart = line.slice(start[0].length);
  let endMinutes: number | null = null;
  let consumed = start[0].length;
  const range = /^\s*(?:-|–|—|s\/d|sampai)\s*(\d{1,2})[:.](\d{2})\s*(am|pm)?/i.exec(afterStart);
  if (range) {
    const rangeHasPeriod = Boolean(range[3]);
    const startPeriod = ((start[4] ?? start[3]) ?? '').toLowerCase();
    const endPeriod = range[3]?.toLowerCase() ?? (rangeHasPeriod ? null : startPeriod);
    const normalizedEndPeriod = ['wib', 'wita', 'wit'].includes(endPeriod.toLowerCase()) ? null : PERIOD_WORDS[endPeriod.toLowerCase()] ?? null;
    const endTime = toTime24(Number(range[1]), Number(range[2]), normalizedEndPeriod);
    if (endTime) {
      const [sh, sm] = time.split(':').map(Number);
      const [eh, em] = endTime.split(':').map(Number);
      endMinutes = eh * 60 + em;
      const startMinutes = sh * 60 + sm;
      if (endMinutes <= startMinutes) endMinutes = null;
      else endMinutes -= startMinutes;
    }
    consumed += range[0].length;
  }
  const remaining = line.slice(consumed);
  const duration = durationIn(remaining);
  const durationIndex = duration ? remaining.indexOf(duration.span) : -1;
  const title = (duration && durationIndex >= 0 ? `${remaining.slice(0, durationIndex)} ${remaining.slice(durationIndex + duration.span.length)}` : remaining).replace(/\(\s*[+±\-\s]*\s*\)|\[\s*[+±\-\s]*\s*\]/g, ' ').replace(/^[\s:\-–—]+|[\s:\-–—]+$/g, '').replace(/\s+/g, ' ').trim();
  const durationMinutes = endMinutes ?? (duration && !duration.unclear ? duration.minutes : null);
  return { time, durationMinutes, rest: title, ambiguous: false, ...(duration?.unclear ? { durationUnclear: true } : {}) };
}
