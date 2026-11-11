import { dict, fold } from './text.js';

export type HeadingTarget = keyof typeof dict.headings;
export type LineKind = 'blank' | 'heading' | 'bullet' | 'key-value' | 'url' | 'text';

export interface SourceLine { index: number; raw: string; text: string; kind: LineKind; heading?: HeadingTarget; label?: string; value?: string; bullet?: string }

const headingIndex = new Map<string, HeadingTarget>();
for (const [target, names] of Object.entries(dict.headings) as Array<[HeadingTarget, string[]]>) {
  for (const name of names) headingIndex.set(fold(name).replace(/[:.]$/, ''), target);
}

export function headingFor(value: string): HeadingTarget | undefined {
  const key = fold(value).replace(/:$/, '').trim();
  return key.length <= 60 ? headingIndex.get(key) : undefined;
}

const BULLET = /^\s*(?:[-*•·]|\d{1,2}[.)]|[a-z][.)])\s+(.+)$/i;
const URL_LINE = /(https?:\/\/\S+|maps\.app\.goo\.gl\/\S+|goo\.gl\/maps\/\S+|google\.[a-z.]+\/maps\S*)/i;
const KEY_VALUE = /^([^:]{1,40}):\s*(.*)$/;

/** Splits text into classified lines. Classification is structural only; no meaning is assigned here. */
export function classifyLines(text: string): SourceLine[] {
  return text.split('\n').map((raw, index) => {
    const trimmed = raw.trim();
    if (!trimmed) return { index, raw, text: '', kind: 'blank' as const };
    const heading = headingFor(trimmed);
    if (heading) return { index, raw, text: trimmed, kind: 'heading' as const, heading };
    const bullet = BULLET.exec(raw);
    if (bullet) return { index, raw, text: trimmed, kind: 'bullet' as const, bullet: bullet[1].trim() };
    const kv = KEY_VALUE.exec(trimmed);
    if (kv && kv[2].trim()) return { index, raw, text: trimmed, kind: 'key-value' as const, label: kv[1].trim(), value: kv[2].trim() };
    if (URL_LINE.test(trimmed)) return { index, raw, text: trimmed, kind: 'url' as const };
    return { index, raw, text: trimmed, kind: 'text' as const };
  });
}

export function keyFor(label: string): keyof typeof dict.keyValue | undefined {
  const key = fold(label);
  for (const [name, aliases] of Object.entries(dict.keyValue) as Array<[keyof typeof dict.keyValue, string[]]>) {
    if (aliases.some((alias) => fold(alias) === key)) return name;
  }
  return undefined;
}
