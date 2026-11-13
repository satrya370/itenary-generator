import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
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

/** Item geometry uses raw PDF.js page coordinates (origin bottom-left); the page rotation is stored separately. */
export interface PdfItem { str: string; x: number; y: number; width: number; height?: number; fontSize?: number; hasEOL?: boolean }
export type PdfPages = PdfItem[][];
export interface PdfPage { pageNumber: number; width: number; height: number; rotation: number; items: PdfItem[] }
/** Block bounds use raw PDF.js page coordinates (origin bottom-left), not viewport coordinates. */
export interface PdfBlock { blockId: string; pageNumber: number; readingOrder: number; text: string; startUtf16: number; endUtf16: number; ambiguous?: boolean; bounds: { x: number; y: number; width: number; height: number } | null }
export interface PdfLayout { version: 1; pages: PdfPage[]; blocks: PdfBlock[]; diagnostics: Array<{ code: string; pageNumber?: number; message: string }> }

/** Runs unpdf in a worker thread with a hard deadline. Eval is disabled inside pdf.js. */
export async function readPdfLayout(bytes: Uint8Array, deadlineMs = PDF_DEADLINE_MS): Promise<PdfLayout> {
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
        const pages = [];
        for (let index = 0; index < items.length; index += 1) {
          const page = await doc.getPage(index + 1);
          const view = page.view;
          pages.push({
            pageNumber: index + 1, width: Math.abs(view[2] - view[0]), height: Math.abs(view[3] - view[1]), rotation: page.rotate ?? 0,
            items: items[index].map((item) => ({ str: item.str, x: item.x, y: item.y, width: item.width, height: item.height, fontSize: item.fontSize, hasEOL: item.hasEOL }))
          });
        }
        parentPort.postMessage({ layout: { version: 1, pages, blocks: [], diagnostics: [] } });
      }
    } catch (cause) {
      parentPort.postMessage({ error: cause && cause.name === 'PasswordException' ? 'ENCRYPTED' : 'CORRUPT' });
    }
  `;
  const worker = new Worker(source, { eval: true, workerData: { moduleUrl, bytes: Uint8Array.from(bytes), maxPages: MAX_PDF_PAGES } });
  return new Promise<PdfLayout>((resolve, reject) => {
    const timer = setTimeout(() => { void worker.terminate(); reject(importError('IMPORT_TIMEOUT')); }, deadlineMs);
    worker.once('message', (message: { layout?: PdfLayout; error?: string }) => {
      clearTimeout(timer); void worker.terminate();
      if (message.error === 'ENCRYPTED') reject(importError('IMPORT_ENCRYPTED'));
      else if (message.error === 'TOO_MANY_PAGES') reject(importError('IMPORT_TOO_MANY_PAGES'));
      else if (message.error || !message.layout) reject(importError('IMPORT_CORRUPT'));
      else resolve(message.layout);
    });
    worker.once('error', () => { clearTimeout(timer); reject(importError('IMPORT_CORRUPT')); });
  });
}

/** Rebuilds visual lines from positioned text items so bullets and "08:00 ..." rows stay one line each. */
export function pageToBlocks(items: PdfItem[]): Array<{ text: string; ambiguous?: boolean; bounds: { x: number; y: number; width: number; height: number } }> {
  const rows: Array<{ y: number; items: PdfItem[] }> = [];
  for (const item of items.filter((entry) => entry.str.trim())) {
    const row = rows.find((candidate) => Math.abs(candidate.y - item.y) <= 3);
    if (row) row.items.push(item); else rows.push({ y: item.y, items: [item] });
  }
  const orderedRows = rows.sort((a, b) => b.y - a.y).map((row) => {
    const ordered = row.items.sort((a, b) => a.x - b.x);
    const fragments: PdfItem[][] = [[]];
    let previousEnd = 0;
    for (const item of ordered) {
      if (fragments.at(-1)!.length && item.x - previousEnd > 40) fragments.push([]);
      fragments.at(-1)!.push(item);
      previousEnd = item.x + item.width;
    }
    return fragments.filter((fragment) => fragment.length).map((fragment) => {
      const parts: string[] = [];
      let previousEnd = 0;
      for (const item of fragment) {
        if (parts.length && item.x - previousEnd > 2) parts.push(' ');
        parts.push(item.str);
        previousEnd = item.x + item.width;
      }
      const text = parts.join('').replace(/\s+$/g, '');
      const x = Math.min(...fragment.map((item) => item.x));
      const y = Math.min(...fragment.map((item) => item.y));
      const right = Math.max(...fragment.map((item) => item.x + item.width));
      const top = Math.max(...fragment.map((item) => item.y + (item.height ?? 0)));
      return { text, x, bounds: { x, y, width: right - x, height: Math.max(top - y, ...fragment.map((item) => item.height ?? 0), 0) } };
    });
  });
  const columnStarts: number[] = [];
  for (const row of orderedRows) for (const fragment of row) {
    if (!columnStarts.some((x) => Math.abs(x - fragment.x) <= 40)) columnStarts.push(fragment.x);
  }
  columnStarts.sort((a, b) => a - b);
  const multiColumn = columnStarts.length > 1;
  // A clock alone cannot prove that adjacent prose belongs to that activity.
  const headerIndex = orderedRows.findIndex((row) => row.length === 2 &&
    /^(?:time|waktu|jam)$/i.test(row[0]?.text.trim() ?? '') &&
    /^(?:activity|aktivitas|kegiatan)$/i.test(row[1]?.text.trim() ?? ''));
  const tabular = multiColumn && headerIndex >= 0 &&
    orderedRows.slice(0, headerIndex).every((row) => row.length === 1) &&
    orderedRows.slice(headerIndex + 1).every((row) => row.length === 2 && /^\d{1,2}[:.]\d{2}$/.test(row[0].text.trim()));
  if (multiColumn && !tabular) {
    const output: Array<{ text: string; bounds: { x: number; y: number; width: number; height: number } }> = [];
    for (const start of columnStarts) for (const row of orderedRows) {
      const fragment = row.find((item) => Math.abs(item.x - start) <= 40);
      if (fragment) output.push(fragment);
    }
    return output.map(({ text, bounds }) => ({ text, bounds, ambiguous: true }));
  }
  if (!tabular) return orderedRows.flatMap((row) => row.map(({ text, bounds }) => ({ text, bounds })));
  return orderedRows.map((row) => {
    const x = Math.min(...row.map((fragment) => fragment.bounds.x));
    const y = Math.min(...row.map((fragment) => fragment.bounds.y));
    const right = Math.max(...row.map((fragment) => fragment.bounds.x + fragment.bounds.width));
    const top = Math.max(...row.map((fragment) => fragment.bounds.y + fragment.bounds.height));
    return { text: row.map((fragment) => fragment.text).join(' '), bounds: { x, y, width: right - x, height: top - y } };
  });
}

export function pageToLines(items: PdfItem[]): string[] { return pageToBlocks(items).map((block) => block.text); }

/** Backward-compatible projection for callers/tests that need text items only. */
export async function readPdfPages(bytes: Uint8Array, deadlineMs = PDF_DEADLINE_MS): Promise<PdfPages> {
  return (await readPdfLayout(bytes, deadlineMs)).pages.map((page) => page.items);
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
  layout?: PdfLayout;
}

export function intakeText(raw: string): IntakeResult {
  const text = normalizeText(raw);
  return {
    kind: 'text', text, sha256: createHash('sha256').update(text, 'utf8').digest('hex'), byteSize: Buffer.byteLength(text, 'utf8'),
    pageCount: 1, charCount: [...text].length, languageProposal: detectLanguage(text, [])
  };
}

export async function intakePdf(bytes: Uint8Array): Promise<IntakeResult> {
  const layout = await readPdfLayout(bytes);
  const pages = layout.pages.map((page) => page.items);
  const { text, nonSpaceChars } = pdfPagesToText(pages);
  assertTextLayer(pages, nonSpaceChars);
  layout.diagnostics = pages.flatMap((items, index) => {
    const count = [...pageToLines(items).join(' ')].filter((ch) => !/\s/.test(ch)).length;
    return count > 0 && count < MIN_CHARS_PER_PAGE
      ? [{ code: 'PDF_SPARSE_TEXT_PAGE', pageNumber: index + 1, message: `Halaman ${index + 1} memiliki lapisan teks yang jarang; sebagian isi mungkin tidak terbaca.` }]
      : items.every((item) => !item.str.trim())
        ? [{ code: 'PDF_EMPTY_OR_NON_TEXT_PAGE', pageNumber: index + 1, message: `Halaman ${index + 1} tidak memiliki teks yang dapat diekstrak; halaman kosong dan halaman berbasis gambar tidak dapat dibedakan.` }]
        : [];
  });
  const repeatedMargins = new Map<string, Set<number>>();
  for (const page of layout.pages) {
    for (const block of pageToBlocks(page.items)) {
      const nearMargin = block.bounds.y + block.bounds.height >= page.height * 0.88 || block.bounds.y <= page.height * 0.12;
      if (!nearMargin) continue;
      const key = block.text.normalize('NFC').trim().toLocaleLowerCase();
      if (key.length < 3) continue;
      const pageSet = repeatedMargins.get(key) ?? new Set<number>();
      pageSet.add(page.pageNumber);
      repeatedMargins.set(key, pageSet);
    }
  }
  for (const [text, pageSet] of repeatedMargins) if (pageSet.size > 1) {
    layout.diagnostics.push({ code: 'PDF_REPEATED_MARGIN_TEXT_REVIEW', message: `Teks margin berulang terdeteksi pada halaman ${[...pageSet].sort((a, b) => a - b).join(', ')}; dipertahankan dan perlu dibedakan dari isi itinerary: "${text.slice(0, 80)}".` });
  }
  const normalized = buildPdfSource(layout);
  return {
    kind: 'pdf', text: normalized, sha256: createHash('sha256').update(bytes).digest('hex'), byteSize: bytes.byteLength,
    pageCount: pages.length, charCount: [...normalized].length, languageProposal: detectLanguage(normalized, []), layout
  };
}

/** Source and spans share one normalization pass; empty leading pages create no phantom offsets. */
export function buildPdfSource(layout: PdfLayout): string {
  layout.blocks = [];
  let source = '';
  for (const page of layout.pages) {
    const blocks = pageToBlocks(page.items);
    if (blocks.some((block) => block.ambiguous)) layout.diagnostics.push({ code: 'PDF_LAYOUT_AMBIGUOUS', pageNumber: page.pageNumber, message: `Urutan/relasi kolom halaman ${page.pageNumber} belum terbukti; teks disimpan untuk review, tidak diisi otomatis.` });
    let first = true;
    blocks.forEach(({ text, bounds, ambiguous }, readingOrder) => {
      const cleaned = text.normalize('NFC').replace(/\r\n?/g, '\n').replace(/[\u200b-\u200d\ufeff]/g, '').split('\n').map((line) => line.replace(/[ \t]+$/g, '')).join('\n').trim();
      if (!cleaned) return;
      if (source) source += first ? '\n\n' : '\n';
      const startUtf16 = source.length;
      source += cleaned;
      layout.blocks.push({ blockId: `p${page.pageNumber}-b${readingOrder + 1}`, pageNumber: page.pageNumber, readingOrder, text: cleaned, startUtf16, endUtf16: source.length, bounds, ambiguous });
      first = false;
    });
  }
  return normalizeText(source);
}

export function layoutExcludedLines(layout: PdfLayout | null, text: string): Set<number> {
  const excluded = new Set<number>();
  if (layout?.diagnostics.some((item) => item.code === 'PDF_SOURCE_LAYOUT_STALE')) return new Set(text.split('\n').map((_line, index) => index));
  for (const block of layout?.blocks ?? []) if (block.ambiguous) {
    const first = text.slice(0, block.startUtf16).split('\n').length - 1;
    for (let index = 0; index < block.text.split('\n').length; index += 1) excluded.add(first + index);
  }
  return excluded;
}

export async function storeSourceLayout(dataDir: string, id: string, layout: PdfLayout): Promise<string> {
  const directory = path.join(dataDir, 'imports');
  await mkdir(directory, { recursive: true });
  const file = path.join(directory, `${id}.layout.json`);
  const temporary = `${file}.${randomSuffix()}.tmp`;
  try { await writeFile(temporary, JSON.stringify(layout), { encoding: 'utf8', flag: 'wx' }); await rename(temporary, file); }
  catch (cause) { await rm(temporary, { force: true }); throw cause; }
  return file;
}

export async function readSourceLayoutOrNull(dataDir: string, id: string): Promise<PdfLayout | null> {
  try {
    const parsed: unknown = JSON.parse(await readFile(path.join(dataDir, 'imports', `${id}.layout.json`), 'utf8'));
    if (!parsed || typeof parsed !== 'object' || (parsed as { version?: unknown }).version !== 1 || !Array.isArray((parsed as { pages?: unknown }).pages)) return null;
    const layout = parsed as PdfLayout;
    const source = await readSourceText(dataDir, id);
    // Rebuild in memory so old sidecars cannot keep invalid offsets or the former clock-only table rule.
    if (buildPdfSource(layout) !== source) {
      layout.blocks = [];
      layout.diagnostics.push({ code: 'PDF_SOURCE_LAYOUT_STALE', message: 'Layout lama tidak cocok dengan teks sumber tersimpan; upload ulang PDF. Isi belum diterapkan otomatis.' });
    }
    return layout;
  } catch (cause) { if ((cause as NodeJS.ErrnoException)?.code === 'ENOENT') return null; return null; }
}

function randomSuffix(): string { return `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`; }

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
