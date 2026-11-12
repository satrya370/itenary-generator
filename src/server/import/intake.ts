import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Worker } from 'node:worker_threads';
import { detectLanguage } from '../ai/language.js';

export const MAX_PDF_BYTES = 10 * 1024 * 1024;
export const MAX_PDF_PAGES = 60;
export const MAX_TEXT_CHARS = 120_000;
export const PDF_DEADLINE_MS = 20_000;
export const MIN_CHARS_PER_PAGE = 40;

export type ImportErrorCode =
  | 'IMPORT_EMPTY' | 'IMPORT_TEXT_TOO_LONG' | 'IMPORT_UNSUPPORTED_TYPE' | 'IMPORT_FILE_TOO_LARGE' | 'IMPORT_TOO_MANY_PAGES'
  | 'IMPORT_ENCRYPTED' | 'IMPORT_NO_TEXT_LAYER' | 'IMPORT_CORRUPT' | 'IMPORT_TIMEOUT';

export class ImportError extends Error {
  constructor(readonly code: ImportErrorCode, message: string, readonly status = 422) { super(message); this.name = 'ImportError'; }
}

const MESSAGES: Record<ImportErrorCode, string> = {
  IMPORT_EMPTY: 'Teks kosong. Tempel isi itinerary terlebih dahulu.',
  IMPORT_TEXT_TOO_LONG: 'Teks terlalu panjang (maksimal 120.000 karakter). Pecah menjadi beberapa bagian.',
  IMPORT_UNSUPPORTED_TYPE: 'Format file tidak didukung. Gunakan PDF atau tempel teks.',
  IMPORT_FILE_TOO_LARGE: 'PDF terlalu besar (maksimal 10 MB).',
  IMPORT_TOO_MANY_PAGES: 'PDF terlalu banyak halaman (maksimal 60).',
  IMPORT_ENCRYPTED: 'PDF dilindungi kata sandi. Buka kuncinya lalu upload ulang, atau salin teksnya ke tab Tempel teks.',
  IMPORT_NO_TEXT_LAYER: 'PDF ini berupa gambar/scan. Salin teksnya lalu tempel di tab Tempel teks.',
  IMPORT_CORRUPT: 'PDF tidak bisa dibaca. Pastikan file tidak rusak, atau tempel teksnya.',
  IMPORT_TIMEOUT: 'Membaca PDF memakan waktu terlalu lama. Coba file yang lebih kecil atau tempel teksnya.'
};

export function importError(code: ImportErrorCode): ImportError { return new ImportError(code, MESSAGES[code]); }

/** Plain text intake: NFC, newline and invisible-character cleanup. Rejects blank and too long input; never truncates. */
export function normalizeText(raw: string): string {
  if (typeof raw !== 'string') throw importError('IMPORT_EMPTY');
  const cleaned = raw.normalize('NFC').replace(/\r\n?/g, '\n').replace(/[​-‍﻿]/g, '').split('\n').map((line) => line.replace(/[ \t]+$/g, '')).join('\n').trim();
  if (!cleaned) throw importError('IMPORT_EMPTY');
  if ([...cleaned].length > MAX_TEXT_CHARS) throw importError('IMPORT_TEXT_TOO_LONG');
  return cleaned;
}

export interface PdfItem { str: string; x: number; y: number; width: number }
export type PdfPages = PdfItem[][];

/** Runs unpdf in a worker thread with a hard deadline. Eval is disabled inside pdf.js. */
export async function readPdfPages(bytes: Uint8Array, deadlineMs = PDF_DEADLINE_MS): Promise<PdfPages> {
  if (bytes.byteLength > MAX_PDF_BYTES) throw importError('IMPORT_FILE_TOO_LARGE');
  if (Buffer.from(bytes.subarray(0, 5)).toString('latin1') !== '%PDF-') throw importError('IMPORT_UNSUPPORTED_TYPE');
  const moduleUrl = import.meta.resolve('unpdf');
  const source = `
    const { parentPort, workerData } = await import('node:worker_threads');
    try {
      const { getDocumentProxy, extractTextItems } = await import(workerData.moduleUrl);
      const doc = await getDocumentProxy(new Uint8Array(workerData.bytes), { isEvalSupported: false });
      if (doc.numPages > workerData.maxPages) { parentPort.postMessage({ error: 'TOO_MANY_PAGES' }); }
      else {
        const { items } = await extractTextItems(doc);
        parentPort.postMessage({ pages: items.map((page) => page.map((item) => ({ str: item.str, x: item.x, y: item.y, width: item.width }))) });
      }
    } catch (cause) {
      parentPort.postMessage({ error: cause && cause.name === 'PasswordException' ? 'ENCRYPTED' : 'CORRUPT' });
    }
  `;
  const worker = new Worker(source, { eval: true, workerData: { moduleUrl, bytes: Uint8Array.from(bytes), maxPages: MAX_PDF_PAGES } });
  return new Promise<PdfPages>((resolve, reject) => {
    const timer = setTimeout(() => { void worker.terminate(); reject(importError('IMPORT_TIMEOUT')); }, deadlineMs);
    worker.once('message', (message: { pages?: PdfPages; error?: string }) => {
      clearTimeout(timer); void worker.terminate();
      if (message.error === 'ENCRYPTED') reject(importError('IMPORT_ENCRYPTED'));
      else if (message.error === 'TOO_MANY_PAGES') reject(importError('IMPORT_TOO_MANY_PAGES'));
      else if (message.error || !message.pages) reject(importError('IMPORT_CORRUPT'));
      else resolve(message.pages);
    });
    worker.once('error', () => { clearTimeout(timer); reject(importError('IMPORT_CORRUPT')); });
  });
}

/** Rebuilds visual lines from positioned text items so bullets and "08:00 ..." rows stay one line each. */
export function pageToLines(items: PdfItem[]): string[] {
  const rows: Array<{ y: number; items: PdfItem[] }> = [];
  for (const item of items.filter((entry) => entry.str.trim())) {
    const row = rows.find((candidate) => Math.abs(candidate.y - item.y) <= 3);
    if (row) row.items.push(item); else rows.push({ y: item.y, items: [item] });
  }
  return rows.sort((a, b) => b.y - a.y).map((row) => {
    const parts: string[] = [];
    let previousEnd = 0;
    for (const item of row.items.sort((a, b) => a.x - b.x)) {
      if (parts.length && item.x - previousEnd > 2) parts.push(' ');
      parts.push(item.str);
      previousEnd = item.x + item.width;
    }
    return parts.join('').replace(/\s+$/g, '');
  });
}

export function pdfPagesToText(pages: PdfPages): { text: string; nonSpaceChars: number } {
  const pageTexts = pages.map((items) => pageToLines(items).join('\n'));
  const text = pageTexts.join('\n\n');
  return { text, nonSpaceChars: [...text].filter((ch) => !/\s/.test(ch)).length };
}

export function assertTextLayer(pages: PdfPages, nonSpaceChars: number): void {
  if (pages.length === 0 || nonSpaceChars / pages.length < MIN_CHARS_PER_PAGE) throw importError('IMPORT_NO_TEXT_LAYER');
}

export interface IntakeResult {
  kind: 'text' | 'pdf'; text: string; sha256: string; byteSize: number; pageCount: number; charCount: number;
  languageProposal: ReturnType<typeof detectLanguage>;
}

export function intakeText(raw: string): IntakeResult {
  const text = normalizeText(raw);
  return {
    kind: 'text', text, sha256: createHash('sha256').update(text, 'utf8').digest('hex'), byteSize: Buffer.byteLength(text, 'utf8'),
    pageCount: 1, charCount: [...text].length, languageProposal: detectLanguage(text, [])
  };
}

export async function intakePdf(bytes: Uint8Array): Promise<IntakeResult> {
  const pages = await readPdfPages(bytes);
  const { text, nonSpaceChars } = pdfPagesToText(pages);
  assertTextLayer(pages, nonSpaceChars);
  const normalized = normalizeText(text);
  return {
    kind: 'pdf', text: normalized, sha256: createHash('sha256').update(bytes).digest('hex'), byteSize: bytes.byteLength,
    pageCount: pages.length, charCount: [...normalized].length, languageProposal: detectLanguage(normalized, [])
  };
}

/** Stores extracted text privately. The original PDF bytes are never written. */
export async function storeSourceText(dataDir: string, id: string, text: string): Promise<string> {
  const directory = path.join(dataDir, 'imports');
  await mkdir(directory, { recursive: true });
  const file = path.join(directory, `${id}.txt`);
  await writeFile(file, text, 'utf8');
  return file;
}

export async function readSourceText(dataDir: string, id: string): Promise<string> {
  return readFile(path.join(dataDir, 'imports', `${id}.txt`), 'utf8');
}

/** Null only when the stored text is gone (removed by the retention sweep or by hand). Any other read error is still thrown. */
export async function readSourceTextOrNull(dataDir: string, id: string): Promise<string | null> {
  try { return await readSourceText(dataDir, id); }
  catch (cause) { if ((cause as NodeJS.ErrnoException)?.code === 'ENOENT') return null; throw cause; }
}

export const SOURCE_TEXT_REMOVED_MESSAGE = 'Teks sumber sudah dihapus otomatis sesuai batas simpan. Tempel ulang atau upload ulang dokumennya untuk membuat import baru.';
export const SOURCE_TEXT_REMOVED_CODE = 'IMPORT_SOURCE_TEXT_REMOVED';
