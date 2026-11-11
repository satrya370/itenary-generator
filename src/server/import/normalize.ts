import { dict, fold } from './parse/text.js';

export type ActivityKind = 'sightseeing' | 'food' | 'activity' | 'transport' | 'free';

/** Activity kind from keywords in the title; sightseeing when nothing matches. Keyword table is config/web/import-headings.json. */
export function kindFromText(text: string): ActivityKind {
  const folded = fold(text);
  const hasWord = (word: string) => new RegExp(`(^|[^a-z])${fold(word).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z]|$)`).test(folded);
  for (const kind of ['free', 'transport', 'food', 'activity'] as const) {
    if ((dict.kinds[kind] as string[]).some(hasWord)) return kind;
  }
  return 'sightseeing';
}

/** Matches a guide from the Setup list. Phone digits win; the name is compared case- and space-insensitively. */
export function matchGuide(name: string | null, phone: string | null, guides: Array<{ id: string; name: string; phone: string }>): { id: string; name: string; phone: string } | null {
  const digits = (value: string | null) => (value ?? '').replace(/\D/g, '').replace(/^(62|0)/, '');
  const phoneKey = digits(phone);
  if (phoneKey.length >= 6) {
    const byPhone = guides.find((guide) => digits(guide.phone) === phoneKey);
    if (byPhone) return byPhone;
  }
  const nameKey = fold(name ?? '').replace(/\s/g, '');
  if (nameKey) return guides.find((guide) => fold(guide.name).replace(/\s/g, '') === nameKey) ?? null;
  return null;
}

/** Practical item equal to a built-in OTA option (same text after folding). Unmatched items are returned unchanged. */
export function matchOption(item: string, options: string[]): string {
  const key = fold(item).replace(/[.;]$/, '');
  return options.find((option) => fold(option) === key) ?? item.trim();
}

/** Date with an explicit year only. Day-first for id/en-GB; month-first only when the day cannot be a month. */
export function dateFromText(text: string): { date: string | null; note: string | null } {
  const months: Record<string, number> = { januari: 1, jan: 1, january: 1, februari: 2, feb: 2, february: 2, maret: 3, mar: 3, march: 3, april: 4, apr: 4, mei: 5, may: 5, juni: 6, jun: 6, june: 6, juli: 7, jul: 7, july: 7, agustus: 8, agu: 8, aug: 8, august: 8, september: 9, sep: 9, sept: 9, oktober: 10, okt: 10, oct: 10, october: 10, november: 11, nov: 11, desember: 12, des: 12, dec: 12, december: 12 };
  const value = fold(text);
  const named = /\b(\d{1,2})\s+([a-z]+)\.?\s+(\d{4})\b/.exec(value) ?? /\b([a-z]+)\.?\s+(\d{1,2}),?\s+(\d{4})\b/.exec(value);
  if (named) {
    const [dayText, monthText, yearText] = named[0].includes(named[2] ?? '') && /^[a-z]/.test(named[1]) ? [named[2], named[1], named[3]] : [named[1], named[2], named[3]];
    const month = months[monthText];
    if (month) return { date: iso(Number(yearText), month, Number(dayText)), note: null };
  }
  const numeric = /\b(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})\b/.exec(value);
  if (numeric) {
    const a = Number(numeric[1]); const b = Number(numeric[2]); const year = Number(numeric[3]);
    if (a > 12 && b <= 12) return { date: iso(year, b, a), note: null };
    if (b > 12 && a <= 12) return { date: iso(year, a, b), note: null };
    return { date: iso(year, b, a), note: a !== b ? 'Tanggal dibaca sebagai tanggal/bulan/tahun; periksa jika salah.' : null };
  }
  return { date: null, note: /\b\d{1,2}\s+[a-z]+\b/.test(value) ? 'Tanggal tanpa tahun tidak diisi; isi tanggal mulai secara manual.' : null };
}

function iso(year: number, month: number, day: number): string | null {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}
