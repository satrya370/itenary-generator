import type { FastifyInstance } from 'fastify';
import { rm } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import type { openStore } from '../store.js';
import type { ItineraryMode } from '../../contracts/types.js';
import { ImportError, MAX_PDF_BYTES, SOURCE_TEXT_REMOVED_CODE, SOURCE_TEXT_REMOVED_MESSAGE, importError, intakePdf, intakeText, layoutExcludedLines, readSourceLayoutOrNull, readSourceTextOrNull, storeSourceLayout, storeSourceText } from './intake.js';
import { parseDocument } from './parse/extract.js';
import type { ImportService } from './service.js';

const MODES = new Set<ItineraryMode>(['half_day', 'full_day', 'multi_day', 'destination_guide', 'activity']);
const excerptOf = (text: string) => [...text].slice(0, 400).join('');

interface SourceRow { id: string; workspace_id: string; kind: string; sha256: string; byte_size: number; page_count: number; char_count: number; language_json: string; created_at: string }

function errorBody(code: string, message: string, requestId: string) { return { error: { code, message, requestId } }; }

/** Registers the CP030 intake and dry-run parse routes. Nothing here writes a draft. */
export function registerImportRoutes(app: FastifyInstance, { store, dataDir, service }: { store: ReturnType<typeof openStore>; dataDir: string; service: ImportService }) {
  const sourceRow = (id: string) => store.db.prepare('SELECT * FROM import_sources WHERE id=? AND workspace_id=?').get(id, store.workspaceId) as SourceRow | undefined;

  app.post<{ Body: unknown }>('/api/v1/imports/sources', async (request, reply) => {
    try {
      let intake;
      if (request.isMultipart()) {
        const file = await request.file({ limits: { fileSize: MAX_PDF_BYTES, files: 1, fields: 0, parts: 1 } });
        if (!file) throw importError('IMPORT_UNSUPPORTED_TYPE');
        const bytes = new Uint8Array(await file.toBuffer());
        if (file.file.truncated) throw importError('IMPORT_FILE_TOO_LARGE');
        intake = await intakePdf(bytes);
      } else {
        const body = request.body && typeof request.body === 'object' ? request.body as Record<string, unknown> : {};
        if (Object.keys(body).some((key) => key !== 'text') || typeof body.text !== 'string') return reply.code(400).send(errorBody('INVALID_REQUEST', 'Kirim { text } atau file PDF.', request.id));
        intake = intakeText(body.text);
      }
      const id = randomUUID();
      const file = await storeSourceText(dataDir, id, intake.text);
      let layoutFile: string | null = null;
      const createdAt = new Date().toISOString();
      try {
        if (intake.layout) layoutFile = await storeSourceLayout(dataDir, id, intake.layout);
        store.db.prepare('INSERT INTO import_sources(id,workspace_id,kind,sha256,byte_size,page_count,char_count,language_json,created_at) VALUES(?,?,?,?,?,?,?,?,?)')
          .run(id, store.workspaceId, intake.kind, intake.sha256, intake.byteSize, intake.pageCount, intake.charCount, JSON.stringify(intake.languageProposal), createdAt);
      } catch (cause) {
        await Promise.all([rm(file, { force: true }), layoutFile ? rm(layoutFile, { force: true }) : Promise.resolve()]); // no orphan source artifacts when the row was not written
        throw cause;
      }
      return reply.code(201).send({ sourceId: id, kind: intake.kind, pageCount: intake.pageCount, charCount: intake.charCount, languageProposal: intake.languageProposal, excerpt: excerptOf(intake.text) });
    } catch (cause) {
      if (cause instanceof ImportError) return reply.code(cause.status).send(errorBody(cause.code, cause.message, request.id));
      const code = (cause as { code?: string }).code;
      if (code === 'FST_REQ_FILE_TOO_LARGE' || code === 'FST_PARTS_LIMIT') return reply.code(422).send(errorBody('IMPORT_FILE_TOO_LARGE', 'PDF terlalu besar (maksimal 10 MB).', request.id));
      throw cause;
    }
  });

  app.get<{ Params: { id: string } }>('/api/v1/imports/sources/:id', async (request, reply) => {
    const row = sourceRow(request.params.id);
    if (!row) return reply.code(404).send(errorBody('NOT_FOUND', 'Sumber import tidak ditemukan.', request.id));
    const text = await readSourceTextOrNull(dataDir, row.id);
    if (text === null) return reply.code(404).send(errorBody(SOURCE_TEXT_REMOVED_CODE, SOURCE_TEXT_REMOVED_MESSAGE, request.id));
    return { sourceId: row.id, kind: row.kind, sha256: row.sha256, byteSize: row.byte_size, pageCount: row.page_count, charCount: row.char_count, languageProposal: JSON.parse(row.language_json), createdAt: row.created_at, text };
  });

  app.post<{ Params: { id: string }; Body: unknown }>('/api/v1/imports/sources/:id/parse', async (request, reply) => {
    const body = request.body && typeof request.body === 'object' ? request.body as Record<string, unknown> : {};
    if (Object.keys(body).some((key) => key !== 'mode') || !MODES.has(body.mode as ItineraryMode)) return reply.code(400).send(errorBody('INVALID_REQUEST', 'Pilih mode itinerary terlebih dahulu.', request.id));
    const row = sourceRow(request.params.id);
    if (!row) return reply.code(404).send(errorBody('NOT_FOUND', 'Sumber import tidak ditemukan.', request.id));
    const text = await readSourceTextOrNull(dataDir, row.id);
    if (text === null) return reply.code(404).send(errorBody(SOURCE_TEXT_REMOVED_CODE, SOURCE_TEXT_REMOVED_MESSAGE, request.id));
    const layout = row.kind === 'pdf' ? await readSourceLayoutOrNull(dataDir, row.id) : null;
    const parsed = parseDocument(text, body.mode as ItineraryMode, layoutExcludedLines(layout, text));
    const pageForTextLine = layout ? buildPageLineMap(layout, text) : [];
    const unconsumed = parsed.unconsumed.map((line) => ({ ...line, pageNumber: pageForTextLine[line.index] ?? null }));
    const diagnostics = parsed.diagnostics.map((diagnostic) => ({ ...diagnostic, pageNumber: diagnostic.line ? pageForTextLine[diagnostic.line - 1] ?? null : undefined }));
    const conflicts = parsed.conflicts.map((conflict) => ({ ...conflict, pageNumber: pageForTextLine[conflict.line - 1] ?? null }));
    const pageDiagnostics = layout?.diagnostics ?? [];
    const pageCoverage = layout?.pages.map((page) => {
      const status = pageDiagnostics.some((item) => item.code === 'PDF_SOURCE_LAYOUT_STALE' || (item.pageNumber === page.pageNumber && item.code === 'PDF_LAYOUT_AMBIGUOUS')) ? 'ambiguous'
        : pageDiagnostics.some((item) => item.pageNumber === page.pageNumber && item.code === 'PDF_SPARSE_TEXT_PAGE') ? 'sparse'
        : pageDiagnostics.some((item) => item.pageNumber === page.pageNumber && item.code === 'PDF_EMPTY_OR_NON_TEXT_PAGE') ? 'empty-or-non-text'
          : 'usable';
      return { pageNumber: page.pageNumber, status, width: page.width, height: page.height, rotation: page.rotation, textItems: page.items.length };
    }) ?? [];
    return { sourceId: row.id, kind: row.kind, pageCount: row.page_count, mode: parsed.mode, fields: parsed.fields, unconsumed, notes: parsed.notes, diagnostics: [...diagnostics, ...pageDiagnostics], conflicts, sourceBlocks: layout?.blocks ?? [], coverage: { ...parsed.coverage, pages: pageCoverage }, totalLines: parsed.totalLines, consumedLines: parsed.consumedLines };
  });

  app.post<{ Params: { id: string }; Body: unknown }>('/api/v1/imports/sources/:id/apply', async (request, reply) => {
    const result = await service.apply(request.body, request.params.id);
    return reply.code(result.status).send(result.body);
  });

  app.post<{ Params: { id: string }; Body: unknown }>('/api/v1/imports/operations/:id/undo', async (request, reply) => {
    const body = request.body && typeof request.body === 'object' ? request.body as Record<string, unknown> : {};
    if (Object.keys(body).some((key) => key !== 'expectedRevision') || !Number.isInteger(body.expectedRevision)) return reply.code(400).send(errorBody('INVALID_REQUEST', 'Kirim expectedRevision.', request.id));
    const result = service.undo(request.params.id, body.expectedRevision);
    return reply.code(result.status).send(result.body);
  });

  app.get<{ Querystring: { itineraryId?: string } }>('/api/v1/imports/operations', async (request, reply) => {
    const itineraryId = request.query.itineraryId;
    if (!itineraryId) return reply.code(400).send(errorBody('INVALID_REQUEST', 'Sertakan itineraryId.', request.id));
    const result = service.latest(itineraryId);
    return reply.code(result.status).send(result.body);
  });
}

function buildPageLineMap(layout: NonNullable<Awaited<ReturnType<typeof readSourceLayoutOrNull>>>, sourceText: string): Array<number | null> {
  const lineMap: Array<number | null> = [];
  for (const block of layout.blocks ?? []) {
    const lineNumber = sourceText.slice(0, block.startUtf16).split('\n').length - 1;
    lineMap[lineNumber] = block.pageNumber;
  }
  return sourceText.split('\n').map((_line, index) => lineMap[index] ?? null);
}
