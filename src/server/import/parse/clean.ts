import { fold } from './text.js';
import { toTime24 } from './time.js';

/** Removes formatting a person adds when copying text (markdown, emoji edges, chat prefixes). Never reads meaning. */
export function cleanLine(raw: string): string {
  return raw
    .normalize('NFC')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^\s*#{1,6}\s+/, '')
    .replace(/^\s*>\s+/, '')
    .replace(/^(?:[\p{Extended_Pictographic}️‍]+\s*)+/u, '')
    .replace(/\s+(?:[\p{Extended_Pictographic}️‍]+\s*)+$/u, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Export prefix of a WhatsApp chat (iOS or Android). Returns the text after "Nama:" and whether a prefix was removed. */
const CHAT_PREFIX = /^\[?\d{1,2}\/\d{1,2}\/\d{2,4},?\s+\d{1,2}[.:]\d{2}(?:[.:]\d{2})?\]?\s*(?:-\s*)?[^:]{1,40}:\s*/;
export function stripChatPrefix(text: string): { text: string; chat: boolean } {
  const match = CHAT_PREFIX.exec(text);
  return match ? { text: text.slice(match[0].length).trim(), chat: true } : { text, chat: false };
}

/** Text that tries to give the assistant or the parser new instructions. Such lines never become values. */
const INSTRUCTION = /\b(abaikan|lupakan|ignore|disregard|forget)\b.{0,40}\b(instruksi|instructions?|perintah|prompt|aturan|rules?)\b|\b(set|ubah|change|tambahkan|add|isi|fill)\b.{0,30}\b(title|judul|harga|price|deskripsi|description)\b|\bset\s+title\b/i;
export function isInstruction(text: string): boolean { return INSTRUCTION.test(text); }

/** Lines that are chat or planning noise: they are kept in the report with a reason, never read as data. */
const GREETING = /^(halo|hai|hi|hello|selamat (pagi|siang|sore|malam)|terima ?kasih|makasih|thank you|thanks|untuk info lebih lanjut|silakan hubungi|silahkan hubungi|mohon ditunggu)\b/i;
export function noiseReason(raw: string, cleaned: string): string | null {
  if (/^\s*~~[\s\S]+~~/.test(raw)) return 'dicoret';
  if (/^(note|catatan internal|tba|tbd)\b/i.test(cleaned)) return 'catatan internal';
  if (isInstruction(cleaned)) return 'berisi instruksi';
  if (GREETING.test(cleaned)) return 'sapaan atau obrolan';
  return null;
}

/** Bagian waktu tanpa jam pasti: "PAGI", "SIANG", "SORE - MALAM", "Morning", … Returns null when the line is anything else. */
const PERIOD_PART = new Set(['pagi', 'siang', 'sore', 'malam', 'morning', 'afternoon', 'evening', 'night', 'hari', 'dan', 'and']);
const PERIOD_WORDS = new Set(['pagi', 'siang', 'sore', 'malam', 'morning', 'afternoon', 'evening', 'night']);
export function timePartOf(text: string): string | null {
  if (text.length > 30 || /\d/.test(text)) return null;
  const words = fold(text).split(/[\s\-/&,]+/).filter(Boolean);
  if (!words.length || !words.some((word) => PERIOD_WORDS.has(word))) return null;
  return words.every((word) => PERIOD_PART.has(word)) ? words.join(' ') : null;
}

/** Inline list values "a, b; c" are split only when no negation or open bracket could change their meaning. */
const NEGATION = /\b(kecuali|tanpa|hanya|tidak|bukan|except|but|only|not|without)\b/i;
export function splitInlineList(value: string): string[] {
  if (NEGATION.test(value) || /[(\[]/.test(value) && !/[)\]]/.test(value)) return [value];
  const parts = value.split(/\s*[,;]\s*/).map((part) => part.trim()).filter(Boolean);
  return parts.length ? parts : [value];
}

/** Phone numbers written as an Indonesian mobile or landline, optionally with a country code. Digit count is checked here. */
const PHONE = /(?:\+\d{1,3}[\s-]?)?\b0\d{2,4}(?:[\s.-]?\d{2,6}){2,3}\b/g;
export function phonesIn(text: string): string[] {
  return [...text.matchAll(PHONE)].map((match) => match[0].trim()).filter((phone) => phone.replace(/\D/g, '').length >= 9 && phone.replace(/\D/g, '').length <= 15);
}

/** A clock phrase inside a clause: "jam 1 siang", "pukul 9.30", "13.00". Returns null when it is unclear ("jam 5" alone). */
const CLAUSE_TIME = /\b(?:jam|pukul)\s*(\d{1,2})(?:[.:](\d{2}))?\s*(am|pm|pagi|siang|sore|malam)?\b|\b(\d{1,2})[.:](\d{2})\b/i;
export function clauseTime(clause: string): { time: string; rest: string } | null {
  const match = CLAUSE_TIME.exec(clause);
  if (!match) return null;
  const isClock = match[1] !== undefined;
  const hour = Number(isClock ? match[1] : match[4]);
  const minute = Number(isClock ? match[2] ?? 0 : match[5]);
  const word = (match[3] ?? '').toLowerCase();
  if (isClock && !word && match[2] === undefined) return null;
  const period = word === 'pagi' ? 'am' : word === 'siang' ? 'day' : word === 'sore' || word === 'malam' ? 'pm' : word === 'am' || word === 'pm' ? word : null;
  const time = toTime24(hour, minute, period);
  if (!time) return null;
  const rest = `${clause.slice(0, match.index)} ${clause.slice(match.index + match[0].length)}`.replace(/\b(sekitar|kurang lebih)\b/gi, ' ').replace(/^[\s,:-]+|[\s,:-]+$/g, '').replace(/\s+/g, ' ').trim();
  return { time, rest };
}

/** A long run-on paragraph split at commas, full stops and "lalu / trus / kemudian". Each clause is read on its own. */
export function paragraphClauses(text: string): Array<{ clause: string; reading: { time: string; rest: string } | null }> {
  return text.split(/[.;,]\s+|\s+(?=\b(?:lalu|trus|terus|kemudian|habis itu|setelah itu)\b)/i).map((part) => part.trim()).filter(Boolean)
    .map((clause) => ({ clause, reading: clauseTime(clause) }));
}
