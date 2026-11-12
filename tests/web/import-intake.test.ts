import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test, type TestContext } from 'node:test';
import { createApp } from '../../src/server/app.js';
import { ImportError, MAX_TEXT_CHARS, normalizeText, readPdfPages, pageToLines, pdfPagesToText, assertTextLayer, intakeText } from '../../src/server/import/intake.js';

const FIXTURES = path.resolve('tests/fixtures/web/import');
const origin = 'http://127.0.0.1:3000';
const headers = { origin, 'x-engine-request': '1', 'content-type': 'application/json' };

async function fixture(t: TestContext) {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'itinerary-cp030-'));
  let app = await createApp({ dataDir, publicOrigin: origin, allowedOrigins: [origin] });
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
  assert.deepEqual(files, [`${body.sourceId}.txt`], 'only the extracted text is kept, never the PDF bytes');
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
