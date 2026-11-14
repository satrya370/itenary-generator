import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test, type TestContext } from 'node:test';
import { createApp } from '../../src/server/app.js';
import { ImportError, MAX_TEXT_CHARS, normalizeText, readPdfPages, pageToLines, pdfPagesToText, assertTextLayer, intakeText, buildPdfSource, layoutExcludedLines, type PdfLayout, intakePdf, readSourceLayoutOrNull } from '../../src/server/import/intake.js';
import { parseDocument } from '../../src/server/import/parse/extract.js';
import { segmentsOf } from '../../src/server/import/complete.js';
import puppeteer from 'puppeteer';
import type { ImportExtractor } from '../../src/server/ai/provider.js';

const FIXTURES = path.resolve('tests/fixtures/web/import');
const origin = 'http://127.0.0.1:3000';
const headers = { origin, 'x-engine-request': '1', 'content-type': 'application/json' };

async function fixture(t: TestContext, importExtractor?: ImportExtractor) {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'itinerary-cp030-'));
  let app = await createApp({ dataDir, publicOrigin: origin, allowedOrigins: [origin], importExtractor });
  t.after(async () => { await app.close(); await rm(dataDir, { recursive: true, force: true }); });
  return { dataDir, get app() { return app; }, async restart() { await app.close(); app = await createApp({ dataDir, publicOrigin: origin, allowedOrigins: [origin] }); } };
}

/** Builds a multipart body by hand so the test controls exact bytes and size. */
const IMPORT_URL = '/api/v1/imports/sources';
function multipart(name: string, filename: string, bytes: Buffer, url = IMPORT_URL) {
  const boundary = 'ImportTestBoundary7MA4YWxk';
  const head = Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"; filename="${filename}"\r\nContent-Type: application/pdf\r\n\r\n`);
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
  return { method: 'POST' as const, url, headers: { origin, 'x-engine-request': '1', 'content-type': `multipart/form-data; boundary=${boundary}` }, payload: Buffer.concat([head, bytes, tail]) };
}

const pdfOf = (name: string) => readFile(path.join(FIXTURES, name));

test('text intake: normalizes, stores the text privately, and answers with the stats and language proposal', async (t) => {
  const f = await fixture(t);
  const text = 'Hari 1: Ubud\r\n09:00 Kunjungan Ubud Palace​   \r\n';
  const created = await f.app.inject({ method: 'POST', url: '/api/v1/imports/sources', headers, payload: { text } });
  assert.equal(created.statusCode, 201, created.body);
  const body = created.json();
  assert.equal(body.kind, 'text');
  assert.equal(body.pageCount, 1);
  assert.equal(body.charCount, [...'Hari 1: Ubud\n09:00 Kunjungan Ubud Palace'].length);
  assert.ok(body.excerpt.startsWith('Hari 1: Ubud'));
  const stored = await readFile(path.join(f.dataDir, 'imports', `${body.sourceId}.txt`), 'utf8');
  assert.equal(stored, 'Hari 1: Ubud\n09:00 Kunjungan Ubud Palace');
  const detail = (await f.app.inject({ method: 'GET', url: `/api/v1/imports/sources/${body.sourceId}` })).json();
  assert.equal(detail.text, stored);
  assert.equal(detail.sha256.length, 64);
});

test('text intake rejects blank and over-long text with stable codes, and never truncates', async (t) => {
  const f = await fixture(t);
  const blank = await f.app.inject({ method: 'POST', url: '/api/v1/imports/sources', headers, payload: { text: '  \n\t ' } });
  assert.equal(blank.statusCode, 422);
  assert.equal(blank.json().error.code, 'IMPORT_EMPTY');
  const long = await f.app.inject({ method: 'POST', url: '/api/v1/imports/sources', headers, payload: { text: 'a'.repeat(MAX_TEXT_CHARS + 1) } });
  assert.equal(long.json().error.code, 'IMPORT_TEXT_TOO_LONG');
  assert.throws(() => normalizeText('a'.repeat(MAX_TEXT_CHARS + 1)), (cause: unknown) => cause instanceof ImportError && cause.code === 'IMPORT_TEXT_TOO_LONG');
  assert.equal(normalizeText('a'.repeat(MAX_TEXT_CHARS)).length, MAX_TEXT_CHARS, 'exactly the limit is accepted');
  const wrongShape = await f.app.inject({ method: 'POST', url: '/api/v1/imports/sources', headers, payload: { text: 'x', extra: true } });
  assert.equal(wrongShape.statusCode, 400);
  assert.equal(wrongShape.json().error.code, 'INVALID_REQUEST');
});

test('a text-layer PDF is read page by page with line rebuilding and its stats are stored', async (t) => {
  const f = await fixture(t);
  const bytes = await pdfOf('id-full-day-tidy.pdf');
  const response = await f.app.inject(multipart('file', 'tur-ubud.pdf', bytes));
  assert.equal(response.statusCode, 201, response.body);
  const body = response.json();
  assert.equal(body.kind, 'pdf');
  assert.equal(body.pageCount, 1);
  const text = await readFile(path.join(f.dataDir, 'imports', `${body.sourceId}.txt`), 'utf8');
  assert.ok(text.includes('07:30 Jemput di hotel - 1 jam'), 'a visual row stays one line');
  assert.ok(text.includes('Termasuk'));
  const files = await readdir(path.join(f.dataDir, 'imports'));
  assert.deepEqual(files.sort(), [`${body.sourceId}.layout.json`, `${body.sourceId}.txt`].sort(), 'private text and layout sidecar are stored, never the PDF bytes');
  const layout = JSON.parse(await readFile(path.join(f.dataDir, 'imports', `${body.sourceId}.layout.json`), 'utf8'));
  assert.equal(layout.version, 1);
  assert.equal(layout.pages[0].pageNumber, 1);
  assert.ok(layout.pages[0].width > 0 && layout.pages[0].height > 0);
  const parsed = await f.app.inject({ method: 'POST', url: `/api/v1/imports/sources/${body.sourceId}/parse`, headers, payload: { mode: 'full_day' } });
  const source = (await f.app.inject({ url: `/api/v1/imports/sources/${body.sourceId}` })).json().text as string;
  assert.ok(parsed.json().sourceBlocks.length > 0);
  for (const block of parsed.json().sourceBlocks as Array<{ text: string; startUtf16: number; endUtf16: number; pageNumber: number; bounds: { x: number; y: number; width: number; height: number } }>) {
    assert.equal(source.slice(block.startUtf16, block.endUtf16), block.text);
    assert.equal(block.pageNumber, 1);
    assert.ok(block.bounds.width > 0);
  }
});

test('PDF rejections: image-only scan, too many pages, and a renamed non-PDF each get their own code and nothing is stored', async (t) => {
  const f = await fixture(t);
  const before = (await f.app.inject({ url: '/api/v1/itineraries' })).json().items.length;
  const scan = await f.app.inject(multipart('file', 'scan.pdf', await pdfOf('image-only-scan.pdf')));
  assert.equal(scan.statusCode, 422);
  assert.equal(scan.json().error.code, 'IMPORT_NO_TEXT_LAYER');
  assert.match(scan.json().error.message, /Salin teksnya lalu tempel/);
  const many = await f.app.inject(multipart('file', 'long.pdf', await pdfOf('too-many-pages-61.pdf')));
  assert.equal(many.json().error.code, 'IMPORT_TOO_MANY_PAGES');
  const renamed = await f.app.inject(multipart('file', 'trick.pdf', await pdfOf('renamed-text-as.pdf')));
  assert.equal(renamed.json().error.code, 'IMPORT_UNSUPPORTED_TYPE', 'magic bytes decide, not the file name');
  const corrupt = await f.app.inject(multipart('file', 'broken.pdf', Buffer.from('%PDF-1.4\nnot really a pdf')));
  assert.equal(corrupt.json().error.code, 'IMPORT_CORRUPT');
  assert.deepEqual(await readdir(path.join(f.dataDir, 'imports')).catch(() => []), [], 'rejected files leave nothing behind');
  assert.equal((await f.app.inject({ url: '/api/v1/itineraries' })).json().items.length, before);
});

test('size limits: the import route accepts 6 MB (the asset upload limit is 5 MB) and refuses above 10 MB', async (t) => {
  const f = await fixture(t);
  const sixMb = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(6 * 1024 * 1024 - 9, 0x20)]);
  const accepted = await f.app.inject(multipart('file', 'six.pdf', sixMb));
  assert.notEqual(accepted.json().error?.code, 'IMPORT_FILE_TOO_LARGE', '6 MB passes the size check and fails later as corrupt');
  assert.equal(accepted.json().error?.code, 'IMPORT_CORRUPT');
  const elevenMb = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(11 * 1024 * 1024, 0x20)]);
  const tooBig = await f.app.inject(multipart('file', 'eleven.pdf', elevenMb));
  assert.equal(tooBig.statusCode, 422);
  assert.equal(tooBig.json().error.code, 'IMPORT_FILE_TOO_LARGE');
  const asset = await f.app.inject(multipart('file', 'six.jpg', sixMb, '/api/v1/assets'));
  assert.notEqual(asset.statusCode, 201, 'the asset upload keeps its 5 MB limit');
});

test('the PDF worker has a hard deadline: a 1 ms deadline ends with IMPORT_TIMEOUT', async () => {
  const bytes = await pdfOf('id-full-day-tidy.pdf');
  await assert.rejects(readPdfPages(new Uint8Array(bytes), 1), (cause: unknown) => cause instanceof ImportError && cause.code === 'IMPORT_TIMEOUT');
});

test('a source whose text file was removed answers 404 with a clear message, not a server error', async (t) => {
  const f = await fixture(t);
  const created = (await f.app.inject({ method: 'POST', url: '/api/v1/imports/sources', headers, payload: { text: 'Tur Bali\n09:00 Ubud Palace' } })).json();
  await rm(path.join(f.dataDir, 'imports', `${created.sourceId}.txt`));
  const response = await f.app.inject({ url: `/api/v1/imports/sources/${created.sourceId}` });
  assert.equal(response.statusCode, 404);
  assert.equal(response.json().error.code, 'IMPORT_SOURCE_TEXT_REMOVED');
});

test('sources survive a server restart and are scoped to the workspace', async (t) => {
  const f = await fixture(t);
  const created = (await f.app.inject({ method: 'POST', url: '/api/v1/imports/sources', headers, payload: { text: 'Tur Bali\n09:00 Ubud Palace' } })).json();
  await f.restart();
  const again = await f.app.inject({ url: `/api/v1/imports/sources/${created.sourceId}` });
  assert.equal(again.statusCode, 200);
  assert.match(again.json().text, /Ubud Palace/);
  assert.equal((await f.app.inject({ url: '/api/v1/imports/sources/00000000-0000-4000-8000-000000000000' })).statusCode, 404);
});

test('the parse endpoint is a dry run: it reads the source and writes no draft', async (t) => {
  const f = await fixture(t);
  const created = (await f.app.inject({ method: 'POST', url: '/api/v1/imports/sources', headers, payload: { text: 'Tur Ubud\nHari 1\n09:00 Ubud Palace (1 jam)' } })).json();
  const itinerariesBefore = (await f.app.inject({ url: '/api/v1/itineraries' })).json().items.length;
  const parsed = await f.app.inject({ method: 'POST', url: `/api/v1/imports/sources/${created.sourceId}/parse`, headers, payload: { mode: 'multi_day' } });
  assert.equal(parsed.statusCode, 200, parsed.body);
  const body = parsed.json();
  assert.equal(body.fields.days[0].activities[0].time, '09:00');
  assert.equal(body.fields.days[0].activities[0].durationMinutes, 60);
  assert.equal(body.kind, 'text');
  assert.equal(body.pageCount, 1);
  assert.deepEqual(body.coverage.pages, [], 'plain text has no PDF page geometry');
  assert.equal(body.coverage.totalLines, body.totalLines);
  assert.ok(body.coverage.ratio >= 0 && body.coverage.ratio <= 1);
  assert.ok(Array.isArray(body.diagnostics));
  assert.equal((await f.app.inject({ url: '/api/v1/itineraries' })).json().items.length, itinerariesBefore, 'no draft was created');
  const badMode = await f.app.inject({ method: 'POST', url: `/api/v1/imports/sources/${created.sourceId}/parse`, headers, payload: { mode: 'auto' } });
  assert.equal(badMode.statusCode, 400);
});

test('pure helpers: line rebuilding joins items on one row and the text-layer check rejects scans', () => {
  const lines = pageToLines([{ str: 'Hari', x: 10, y: 700, width: 20 }, { str: '1', x: 33, y: 700, width: 5 }, { str: 'Termasuk', x: 10, y: 680, width: 40 }]);
  assert.deepEqual(lines, ['Hari 1', 'Termasuk']);
  const pages = [[{ str: 'x', x: 0, y: 1, width: 1 }]];
  assert.equal(pdfPagesToText(pages).nonSpaceChars, 1);
  assert.throws(() => assertTextLayer(pages, 1), (cause: unknown) => cause instanceof ImportError && cause.code === 'IMPORT_NO_TEXT_LAYER');
  assert.equal(intakeText('Tur Bali 09:00').pageCount, 1);
});

test('multi-page layout PDF keeps page geometry, repeated content, and source-page diagnostics', async (t) => {
  const sent: string[] = [];
  const f = await fixture(t, { credentialState: 'configured', async extract(request) {
    sent.push(...request.segments);
    return { text: '{}', usage: { promptTokens: 1, completionTokens: 1, costUsd: 0 } };
  } });
  const response = await f.app.inject(multipart('file', 'layout.pdf', await pdfOf('layout-multipage-columns-table.pdf')));
  assert.equal(response.statusCode, 201, response.body);
  const created = response.json();
  assert.ok(created.pageCount >= 2);
  const sidecar = JSON.parse(await readFile(path.join(f.dataDir, 'imports', `${created.sourceId}.layout.json`), 'utf8'));
  assert.equal(sidecar.pages.length, created.pageCount);
  assert.ok(sidecar.pages.every((page: { width: number; height: number; rotation: number; items: unknown[] }) => page.width > 0 && page.height > 0 && Number.isFinite(page.rotation) && page.items.length > 0));
  assert.ok(sidecar.blocks.every((block: { startUtf16: number; endUtf16: number; bounds: { width: number; height: number } | null }) => block.endUtf16 >= block.startUtf16 && block.bounds?.width > 0 && block.bounds.height >= 0));
  assert.ok(sidecar.diagnostics.some((item: { code: string }) => item.code === 'PDF_REPEATED_MARGIN_TEXT_REVIEW'));
  const source = await readFile(path.join(f.dataDir, 'imports', `${created.sourceId}.txt`), 'utf8');
  assert.match(source, /Day 1/);
  assert.match(source, /Day 2/);
  assert.match(source, /12:00/);
  assert.match(source, /Workshop/);
  assert.ok(sidecar.diagnostics.some((item: { code: string }) => item.code === 'PDF_LAYOUT_AMBIGUOUS'), 'mixed prose/table relationships require review');
  const parsed = await f.app.inject({ method: 'POST', url: `/api/v1/imports/sources/${created.sourceId}/parse`, headers, payload: { mode: 'multi_day' } });
  assert.ok(parsed.json().sourceBlocks.some((block: { pageNumber: number; text: string }) => block.pageNumber === 2 && /Day 2/.test(block.text)));
  assert.equal(parsed.json().coverage.pages[0].status, 'ambiguous');
  assert.ok(parsed.json().unconsumed.some((line: { section: string }) => line.section === 'layout-ambiguous'));
  const applied = await f.app.inject({ method: 'POST', url: `/api/v1/imports/sources/${created.sourceId}/apply`, headers, payload: { operationId: '03333333-3333-4333-8333-333333333333', target: 'new', mode: 'multi_day', outputLanguage: 'en' } });
  assert.equal(applied.statusCode, 201, applied.body);
  assert.ok(!sent.some((line) => /Morning activities|Museum visit|Lunch at the market|Practical notes/.test(line)), 'ambiguous page must not reach AI');
  assert.ok(!applied.json().itinerary.draftContent.days.some((day: { activities: Array<{ title: string }> }) => day.activities.some((activity) => /Museum|Lunch at the market/.test(activity.title))));
  assert.ok(applied.json().report.evidence.omittedLineIndexes.length > 0);
});

test('twelve generated layout PDFs preserve their unique source anchor through intake and dry-run parse', async (t) => {
  const f = await fixture(t);
  const cases = [
    ['layout-case-01-two-columns.pdf', 'North column anchor'], ['layout-case-02-two-cell-table.pdf', 'Table row anchor'],
    ['layout-case-03-three-cell-table.pdf', 'Three cell anchor'], ['layout-case-04-wrapped-cell.pdf', 'Wrapped description continues'],
    ['layout-case-05-repeated-header.pdf', 'Repeated header anchor'], ['layout-case-06-page-continuation.pdf', 'Continuation page two anchor'],
    ['layout-case-07-unequal-columns.pdf', 'Wide column anchor'], ['layout-case-08-independent-time-columns.pdf', 'Independent left anchor'],
    ['layout-case-09-heading-column-order.pdf', 'Heading column anchor'], ['layout-case-10-bordered-schedule.pdf', 'Bordered schedule anchor'],
    ['layout-case-11-three-prose-columns.pdf', 'First prose column anchor'], ['layout-case-12-page-day-boundary.pdf', 'Day two boundary anchor']
  ];
  for (const [filename, anchor] of cases) {
    const intake = await f.app.inject(multipart('file', filename, await pdfOf(filename)));
    assert.equal(intake.statusCode, 201, `${filename}: ${intake.body}`);
    const id = intake.json().sourceId;
    const sourceResult = await f.app.inject({ url: `/api/v1/imports/sources/${id}` });
    assert.equal(sourceResult.statusCode, 200, `${filename} source read`);
    assert.ok(sourceResult.json().text.includes(anchor), `${filename} must retain its unique source anchor`);
    const parse = await f.app.inject({ method: 'POST', url: `/api/v1/imports/sources/${id}/parse`, headers, payload: { mode: 'full_day' } });
    assert.equal(parse.statusCode, 200, `${filename} dry-run parse: ${parse.body}`);
    assert.ok(parse.json().coverage.ratio <= 1, `${filename} coverage bounds`);
  }
});

test('mixed text and sparse/image page is accepted only with a page-specific diagnostic', async (t) => {
  const f = await fixture(t);
  const response = await f.app.inject(multipart('file', 'mixed.pdf', await pdfOf('mixed-sparse-text-layer.pdf')));
  assert.equal(response.statusCode, 201, response.body);
  const created = response.json();
  const layout = JSON.parse(await readFile(path.join(f.dataDir, 'imports', `${created.sourceId}.layout.json`), 'utf8'));
  assert.ok(layout.diagnostics.some((item: { code: string; pageNumber?: number }) => item.code === 'PDF_SPARSE_TEXT_PAGE' && item.pageNumber === 2));
  const parsed = await f.app.inject({ method: 'POST', url: `/api/v1/imports/sources/${created.sourceId}/parse`, headers, payload: { mode: 'full_day' } });
  assert.ok(parsed.json().diagnostics.some((item: { code: string; pageNumber?: number }) => item.code === 'PDF_SPARSE_TEXT_PAGE' && item.pageNumber === 2));
  assert.equal(parsed.json().coverage.pages[1].status, 'sparse');
});

test('PDF reconstruction joins only a bounded explicit two-cell time/activity table', () => {
  const lines = pageToLines([
    { str: 'Time', x: 40, y: 720, width: 30 }, { str: 'Activity', x: 200, y: 720, width: 60 },
    { str: '08:00', x: 40, y: 700, width: 30 }, { str: 'Museum', x: 200, y: 700, width: 45 },
    { str: '09:00', x: 40, y: 680, width: 30 }, { str: 'Garden', x: 200, y: 680, width: 42 }
  ]);
  assert.deepEqual(lines, ['Time Activity', '08:00 Museum', '09:00 Garden']);
});

test('time-led independent PDF columns stay separate and cannot enter parser or AI facts', () => {
  const layout: PdfLayout = { version: 1, blocks: [], diagnostics: [], pages: [{ pageNumber: 1, width: 595, height: 842, rotation: 0, items: [
    { str: '09:00 Museum', x: 40, y: 700, width: 100 }, { str: 'Bring water', x: 340, y: 700, width: 90 },
    { str: '10:00 Garden', x: 40, y: 680, width: 100 }, { str: 'Wear shoes', x: 340, y: 680, width: 90 }
  ] }] };
  const text = buildPdfSource(layout);
  assert.equal(text, '09:00 Museum\n10:00 Garden\nBring water\nWear shoes');
  assert.ok(layout.diagnostics.some((item) => item.code === 'PDF_LAYOUT_AMBIGUOUS'));
  const parsed = parseDocument(text, 'full_day', layoutExcludedLines(layout, text));
  assert.equal(parsed.fields.days.length, 0);
  assert.equal(parsed.unconsumed.length, 4);
  assert.equal(segmentsOf(parsed).units.length, 0);
});

test('PDF normalized spans survive leading/trailing empty pages, Unicode and invisible text', () => {
  const layout: PdfLayout = { version: 1, blocks: [], diagnostics: [], pages: [
    { pageNumber: 1, width: 595, height: 842, rotation: 0, items: [] },
    { pageNumber: 2, width: 595, height: 842, rotation: 0, items: [{ str: '  Cafe\u0301 \u200b🌴  ', x: 40, y: 700, width: 100 }, { str: 'Next line', x: 40, y: 680, width: 100 }] },
    { pageNumber: 3, width: 595, height: 842, rotation: 0, items: [] }
  ] };
  const text = buildPdfSource(layout);
  assert.equal(text, 'Café 🌴\nNext line');
  assert.equal(layout.blocks[0].startUtf16, 0);
  for (const block of layout.blocks) assert.equal(text.slice(block.startUtf16, block.endUtf16), block.text);
});

test('actual PDF worker keeps spans exact after a leading blank page', async () => {
  const browser = await puppeteer.launch({ headless: 'shell', args: ['--disable-background-networking', '--no-first-run'] });
  try {
    const page = await browser.newPage();
    await page.setContent('<html><body><div style="break-after:page;height:100px"></div><p>Day 1 Museum itinerary with enough readable text to pass the text layer check for these two pages. Visit the museum and garden with the local guide.</p></body></html>');
    const result = await intakePdf(await page.pdf({ format: 'A4' }));
    assert.equal(result.pageCount, 2);
    assert.equal(result.layout!.blocks[0].pageNumber, 2);
    assert.equal(result.layout!.blocks[0].startUtf16, 0);
    for (const block of result.layout!.blocks) assert.equal(result.text.slice(block.startUtf16, block.endUtf16), block.text);
  } finally { await browser.close(); }
});

test('legacy PDF sidecars are rebuilt against stored source; incompatible old column joins are review-only', async (t) => {
  const f = await fixture(t);
  const sourceText = 'A valid museum description with enough text.';
  const created = (await f.app.inject({ method: 'POST', url: '/api/v1/imports/sources', headers, payload: { text: sourceText } })).json();
  const layout: PdfLayout = { version: 1, diagnostics: [], blocks: [{ blockId: 'old', pageNumber: 2, readingOrder: 0, text: sourceText, startUtf16: 2, endUtf16: sourceText.length + 2, bounds: null }], pages: [
    { pageNumber: 1, width: 595, height: 842, rotation: 0, items: [] },
    { pageNumber: 2, width: 595, height: 842, rotation: 0, items: [{ str: sourceText, x: 40, y: 700, width: 250 }] }
  ] };
  await writeFile(path.join(f.dataDir, 'imports', `${created.sourceId}.layout.json`), JSON.stringify(layout));
  const rebuilt = await readSourceLayoutOrNull(f.dataDir, created.sourceId);
  assert.equal(rebuilt!.blocks[0].startUtf16, 0);
  assert.equal(sourceText.slice(rebuilt!.blocks[0].startUtf16, rebuilt!.blocks[0].endUtf16), sourceText);
  await writeFile(path.join(f.dataDir, 'imports', `${created.sourceId}.txt`), 'Old joined columns | not the same source');
  const stale = await readSourceLayoutOrNull(f.dataDir, created.sourceId);
  assert.equal(stale!.blocks.length, 0, 'invalid provenance must not be exposed');
  assert.ok(stale!.diagnostics.some((item) => item.code === 'PDF_SOURCE_LAYOUT_STALE'));
  assert.deepEqual([...layoutExcludedLines(stale, 'Old joined columns | not the same source')], [0]);
});

test('PDF reconstruction reads prose columns top-to-bottom before moving to the next column', () => {
  const lines = pageToLines([
    { str: 'About this tour', x: 40, y: 700, width: 90 }, { str: 'What to bring', x: 340, y: 700, width: 85 },
    { str: 'Explore the old town', x: 40, y: 680, width: 110 }, { str: 'Bring comfortable shoes', x: 340, y: 680, width: 130 }
  ]);
  assert.deepEqual(lines, ['About this tour', 'Explore the old town', 'What to bring', 'Bring comfortable shoes']);
});

test('PDF text-layer checks use total density while preserving blank decorative pages', () => {
  const pages = [Array.from({ length: 45 }, (_, index) => ({ str: `Readable${index}`, x: 10, y: 700 - index * 10, width: 40 })), []];
  assert.doesNotThrow(() => assertTextLayer(pages, pdfPagesToText(pages).nonSpaceChars));
});

test('PDF page-level diagnostics expose substantive sparse and empty/non-text pages', async () => {
  const sparse = [{ str: 'Brief text', x: 20, y: 700, width: 55 }];
  const dense = Array.from({ length: 45 }, (_, index) => ({ str: `Readable${index}`, x: 10, y: 700 - index * 10, width: 40 }));
  const pages = [dense, sparse, []];
  assert.doesNotThrow(() => assertTextLayer(pages, pdfPagesToText(pages).nonSpaceChars));
  const diagnostics = pages.flatMap((items, index) => {
    const chars = [...pageToLines(items).join(' ')].filter((character) => !/\s/.test(character)).length;
    return chars > 0 && chars < 40 ? [`sparse:${index + 1}`] : items.length === 0 ? [`empty-or-non-text:${index + 1}`] : [];
  });
  assert.deepEqual(diagnostics, ['sparse:2', 'empty-or-non-text:3']);
});
