import { fold } from './text.js';

export interface TimeReading {
  /** "HH:MM" when the text states the time unambiguously; null otherwise. */
  time: string | null;
  durationMinutes: number | null;
  /** Text after the time (and after any duration phrase): the activity title. */
  rest: string;
  /** True when a time-like prefix was found but could not be read safely (for example "jam 8" with no period). */
  ambiguous: boolean;
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

/** "1,5 jam" -> 90, "90 menit" -> 90, "2 hours" -> 120, "45 min" -> 45. Null when absent or outside 1-1440. */
export function durationIn(text: string): { minutes: number; span: string } | null {
  const match = /\(?\s*(\d+(?:[.,]\d+)?)\s*(jam|hours?|hrs?|h|menit|minutes?|mins?|min)\b\s*\)?/i.exec(text);
  if (!match) return null;
  const value = Number(match[1].replace(',', '.'));
  const unit = match[2].toLowerCase();
  const minutes = unit.startsWith('j') || unit.startsWith('h') ? Math.round(value * 60) : Math.round(value);
  if (!Number.isFinite(minutes) || minutes < 1 || minutes > 1440) return null;
  return { minutes, span: match[0] };
}

/**
 * Reads a time at the start of an activity line. Forms: "08:00", "08.00 WIB", "pukul 08.00", "jam 8" (needs a
 * period or minutes), "8 pagi/siang/sore/malam", "8am", "8 pm", ranges "08:00-10:30", "08.00 – 10.30", "08:00 s/d 10:30".
 * An end time is only used to compute a duration when it is later than the start. Nothing is rounded or invented.
 */
export function readTimeLine(input: string): TimeReading | null {
  const line = input.trim();
  const folded = fold(line);
  // With minutes ("09:00") only am/pm/WIB can be a clock marker; "pagi/siang/sore/malam" would be an activity name.
  // Without minutes ("8 pagi") the day-part words are the clock marker.
  const withMinutes = /^(?:(jam|pukul)\s*)?(\d{1,2})[:.](\d{2})\s*(wib|wita|wit|am|pm)?(?![\d])/.exec(folded);
  const withoutMinutes = /^(?:(jam|pukul)\s*)?(\d{1,2})\s*(am|pm|pagi|siang|sore|malam|wib|wita|wit)?(?![\d:.])/.exec(folded);
  const start = withMinutes ?? withoutMinutes;
  if (!start) return null;
  const hasPrefix = Boolean(start[1]);
  const hour = Number(start[2]);
  const hasMinutes = withMinutes !== null;
  const periodWord = (hasMinutes ? start[4] : start[3]) ?? undefined;
  const period = periodWord && !['wib', 'wita', 'wit'].includes(periodWord) ? PERIOD_WORDS[periodWord] ?? null : null;
  if (!hasMinutes && !period) {
    // "jam 8" / "pukul 8" with no minutes and no period is ambiguous: keep the text, leave the time empty.
    // A bare number such as "2 jam" or "12 orang" is not a time at all.
    return hasPrefix ? { time: null, durationMinutes: null, rest: line, ambiguous: true } : null;
  }
  const minute = hasMinutes ? Number(start[3]) : 0;
  const time = toTime24(hour, minute, period);
  if (!time) return { time: null, durationMinutes: null, rest: line, ambiguous: true };

  const afterStart = folded.slice(start[0].length);
  let endMinutes: number | null = null;
  let consumed = start[0].length;
  const range = /^\s*(?:-|–|—|s\/d|sampai)\s*(\d{1,2})[:.](\d{2})/.exec(afterStart);
  if (range) {
    const endTime = toTime24(Number(range[1]), Number(range[2]), null);
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
  const title = (duration ? remaining.replace(duration.span, ' ') : remaining).replace(/^[\s:\-–—]+|[\s:\-–—]+$/g, '').replace(/\s+/g, ' ').trim();
  return { time, durationMinutes: endMinutes ?? duration?.minutes ?? null, rest: title, ambiguous: false };
}
