import { dict, fold } from './text.js';

export interface DayMarker { number: number; title: string | null }

/** "Hari 1: Ubud", "Hari ke-2", "Hari pertama", "Day 3 - Kintamani", "D1", "H1". Only the number and the optional title are read. */
export function dayMarkerFor(input: string): DayMarker | null {
  const line = input.trim();
  const folded = fold(line);
  for (const pattern of dict.dayMarkers.patterns) {
    const match = new RegExp(pattern).exec(folded);
    if (!match) continue;
    const number = Number(match[1]);
    if (!Number.isInteger(number) || number < 1 || number > 30) return null;
    const rest = line.slice(match[0].length).replace(/^\s*[:\-–—]\s*/, '').trim();
    return { number, title: rest || null };
  }
  const word = new RegExp(`^(?:hari|day)\\s+(${Object.keys(dict.dayMarkers.words).join('|')})\\b`).exec(folded);
  if (word) {
    const number = dict.dayMarkers.words[word[1] as keyof typeof dict.dayMarkers.words];
    const rest = line.slice(word[0].length).replace(/^\s*[:\-–—]\s*/, '').trim();
    return { number, title: rest || null };
  }
  return null;
}
