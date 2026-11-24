import { dict, fold } from './text.js';
import { cleanLine, noiseReason, stripChatPrefix, timePartOf } from './clean.js';
import { matchLabel } from './labels.js';

/** Shared headings plus the activity-only ones, and the time-of-day section ("PAGI", "SIANG") that carries no clock time. */
export type HeadingTarget = keyof typeof dict.headings | 'highlights' | 'steps' | 'timePart';
export type LineKind = 'blank' | 'heading' | 'bullet' | 'key-value' | 'url' | 'text' | 'noise';

export interface SourceLine {
  index: number; raw: string; text: string; kind: LineKind;
  heading?: HeadingTarget; label?: string; value?: string; bullet?: string; inlineValue?: string;
  /** Set when a chat export prefix ("[12/11/26 08.15] Nama:") was removed. Such lines never become a title. */
  chat?: boolean;
  /** Reason for kind "noise": the line is kept in the report and never read as data. */
  reason?: string;
  /** Set for a table row: the cells in order. */
  cells?: string[];
  /** Original time-of-day section name, when kind is heading with heading "timePart". */
  part?: string;
}

const headingEntries = Object.entries(dict.headings) as Array<[HeadingTarget, string[]]>;
const activityEntries = Object.entries(dict.activityHeadings).filter((entry): entry is [string, string[]] => Array.isArray(entry[1])) as Array<[HeadingTarget, string[]]>;
const headingIndex = new Map<string, HeadingTarget>();
for (const [target, names] of headingEntries) for (const name of names) headingIndex.set(fold(name).replace(/[:.]$/, ''), target);
const activityHeadingIndex = new Map<string, HeadingTarget>();
for (const [target, names] of activityEntries) for (const name of names) activityHeadingIndex.set(fold(name).replace(/[:.]$/, ''), target);

/** `mode` only matters for "activity", where its own headings are checked first. Fuzzy matching only applies to short lines. */
export function headingFor(value: string, mode?: string): HeadingTarget | undefined {
  const key = fold(value).replace(/:$/, '').trim();
  if (key.length > 60) return undefined;
  if (mode === 'activity') { const own = activityHeadingIndex.get(key); if (own) return own; }
  const exact = headingIndex.get(key);
  if (exact) return exact;
  if (/\d/.test(key)) return undefined;
  if (mode === 'activity') { const own = matchLabel(activityEntries, key); if (own) return own; }
  return matchLabel(headingEntries, key) ?? undefined;
}

const BULLET = /^\s*(?:[-*+•·▪➤➢◦→✓✔☐]|\d{1,2}[.)]|[a-z][.)])\s+(.+)$/i;
const URL_LINE = /(https?:\/\/\S+|maps\.app\.goo\.gl\/\S+|goo\.gl\/maps\/\S+|google\.[a-z.]+\/maps\S*)/i;
const KEY_VALUE = /^([^:]{1,40}):\s*(.*)$/;
const INLINE_LIST_SECTIONS = ['included', 'notIncluded', 'whatToBring', 'notSuitableFor', 'notAllowed', 'localTips'];

/** Splits text into classified lines. Classification is structural only; no meaning is assigned here. */
export function classifyLines(text: string, mode?: string): SourceLine[] {
  return text.split('\n').map((raw, index) => {
    const trimmed = raw.trim();
    if (!trimmed) return { index, raw, text: '', kind: 'blank' as const };
    const chatStripped = stripChatPrefix(cleanLine(raw));
    const cleaned = chatStripped.text;
    const body = cleaned || trimmed;
    const chat = chatStripped.chat;
    if (!cleaned || /^[-=_*~\s]+$/.test(cleaned)) return { index, raw, text: body, kind: 'noise' as const, reason: 'hanya emoji atau pemisah' };
    const reason = noiseReason(raw.trim(), body);
    if (reason) return { index, raw, text: body, kind: 'noise' as const, reason };

    const heading = headingFor(body, mode);
    if (heading) return { index, raw, text: body, kind: 'heading' as const, heading, chat };
    const part = timePartOf(body);
    if (part) return { index, raw, text: body, kind: 'heading' as const, heading: 'timePart' as const, part, chat };

    const inlineHeading = /^([^:]{1,60}):\s*(.+)$/.exec(body);
    const inlineTarget = inlineHeading ? headingFor(inlineHeading[1], mode) : undefined;
    if (inlineTarget && inlineHeading && INLINE_LIST_SECTIONS.includes(inlineTarget)) return { index, raw, text: body, kind: 'heading' as const, heading: inlineTarget, inlineValue: inlineHeading[2].trim(), chat };

    // Tab-separated rows are tables first ("08:00<tab>Jemput" must not read as a "08:00" label).
    // Space-separated cells come after "Label: value", so "Guide:  Made" keeps its label.
    const tabCells = raw.includes('\t') ? splitCells(raw) : undefined;
    if (tabCells) return { index, raw, text: body, kind: 'text' as const, cells: tabCells, chat };

    const bullet = BULLET.exec(body);
    if (bullet) return { index, raw, text: body, kind: 'bullet' as const, bullet: bullet[1].trim(), chat };
    const kv = KEY_VALUE.exec(body);
    // "https://…" is a link, not a "https" label.
    // A label needs a letter: "08:00 Pulau Padar" is a timed line, not a label "08".
    if (kv && kv[2].trim() && !/^https?$/i.test(kv[1].trim()) && /\p{L}/u.test(kv[1])) return { index, raw, text: body, kind: 'key-value' as const, label: kv[1].trim(), value: kv[2].trim(), chat };
    const spacedCells = splitCells(raw);
    if (spacedCells) return { index, raw, text: body, kind: 'text' as const, cells: spacedCells, chat };
    if (URL_LINE.test(body)) return { index, raw, text: body, kind: 'url' as const, chat };
    return { index, raw, text: body, kind: 'text' as const, chat };
  });
}

/** A copied table row: cells separated by tabs or by two or more spaces. Only rows with at least two cells qualify. */
function splitCells(raw: string): string[] | undefined {
  if (!/\t|\S {2,}\S/.test(raw)) return undefined;
  const cells = raw.split(/\t|\s{2,}/).map((cell) => cleanLine(cell)).filter(Boolean);
  return cells.length >= 2 ? cells : undefined;
}

export function keyFor(label: string): keyof typeof dict.keyValue | undefined {
  const key = fold(label);
  for (const [name, aliases] of Object.entries(dict.keyValue) as Array<[keyof typeof dict.keyValue, string[]]>) {
    if (aliases.some((alias) => fold(alias) === key)) return name;
  }
  return matchLabel(Object.entries(dict.keyValue) as Array<[keyof typeof dict.keyValue, string[]]>, label) ?? undefined;
}
