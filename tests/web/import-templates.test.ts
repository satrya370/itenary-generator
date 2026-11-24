import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { createApp } from '../../src/server/app.js';
import type { ImportExtractRequest, ImportExtractor } from '../../src/server/ai/provider.js';
import { parseDocument } from '../../src/server/import/parse/extract.js';
import { fold } from '../../src/server/import/parse/text.js';
import { segmentsOf } from '../../src/server/import/complete.js';
import type { ItineraryMode } from '../../src/contracts/types.js';

/**
 * Template corpus contract: deterministic facts must parse cleanly; the only remaining units must have an explicit
 * destination/owner for the CP031 AI completion path.
 */
type Template = { name: string; lines: string[] };
type Templates = { locales: Record<string, Record<string, Record<string, Template>>> };
const templates = JSON.parse(readFileSync('config/web/import-templates.json', 'utf8')) as Templates;
const TIME_PART_NOTE = /bagian waktu tanpa jam pasti/;
const INLINE_DETAIL_NOTE = /detail setelah judul aktivitas dipisahkan/;
const NO_CLOCK_PROSE_NOTE = /kemungkinan detail aktivitas tidak memiliki batas/;
const modeOrder: ItineraryMode[] = ['half_day', 'full_day', 'multi_day', 'destination_guide', 'activity'];

function unbullet(text: string): string {
  return text.replace(/^\s*(?:[-*+•·▪➤➢◦→✓✔☐]|\d{1,2}[.)]|[a-z][.)])\s+/i, '').trim();
}

function templateCompletion(request: ImportExtractRequest, parsed: ReturnType<typeof parseDocument>) {
  const units = request.sourceUnits ?? [];
  const completion: Record<string, unknown> = {};
  const summaryUnits = units.filter((unit) => unit.allowedPaths.includes('summary'));
  if (summaryUnits.length) {
    const quote = summaryUnits.map((unit) => unit.text).join('\n');
    completion.summary = { sourceUnitIds: summaryUnits.map((unit) => unit.unitId), value: quote, quote };
  }
  const activityDetails = (request.targets ?? []).flatMap((target) => {
    const owned = units.filter((unit) => unit.ownerTargetId === target.targetId && unit.allowedPaths.includes('activityDetails'));
    if (!owned.length) return [];
    const quote = owned.map((unit) => unit.text).join('\n');
    return [{ targetId: target.targetId, title: target.title, description: { sourceUnitIds: owned.map((unit) => unit.unitId), value: quote, quote }, place: null, tip: null }];
  });
  if (activityDetails.length) completion.activityDetails = activityDetails;

  if (request.mode === 'destination_guide') {
    const placeUnits = units.filter((unit) => unit.allowedPaths.includes('places'));
    const places = parsed.fields.places.flatMap((name) => {
      const nameUnit = placeUnits.find((unit) => fold(unbullet(unit.text)) === fold(name));
      if (!nameUnit) return [];
      const descriptionUnit = placeUnits.find((unit) => unit.lineIndex === nameUnit.lineIndex + 1 && unit.section === nameUnit.section && !/^\s*(?:[-*+•·▪➤➢◦→✓✔☐]|\d{1,2}[.)]|[a-z][.)])\s+/i.test(unit.text));
      return [{
        name: { sourceUnitIds: [nameUnit.unitId], value: name, quote: unbullet(nameUnit.text) },
        area: null,
        description: descriptionUnit ? { sourceUnitIds: [descriptionUnit.unitId], value: descriptionUnit.text, quote: descriptionUnit.text } : null
      }];
    });
    if (places.length) completion.places = places;
  }
  return completion;
}

for (const [locale, modes] of Object.entries(templates.locales)) {
  for (const [mode, formats] of Object.entries(modes)) {
    for (const [format, { lines }] of Object.entries(formats)) {
      test(`${locale} ${mode} ${format}: deterministic parse leaves only supported hybrid units`, () => {
        const text = lines.join('\n');
        const r = parseDocument(text, mode as ItineraryMode);
        assert.equal(r.conflicts.length, 0, 'no conflicting values');
        assert.equal(r.unknownLabels.length, 0, 'every label is known');
        const unexpected = r.notes.filter((note) => !TIME_PART_NOTE.test(note) && !INLINE_DETAIL_NOTE.test(note) && !NO_CLOCK_PROSE_NOTE.test(note));
        assert.deepEqual(unexpected, [], 'no unsupported parser notes');
        const units = segmentsOf(r).units;
        assert.ok(units.some((unit) => unit.allowedPaths.includes('summary')), 'the global narrative has an explicit Summary/Overview heading for AI');
        if (format === 'F4' && mode !== 'destination_guide' && mode !== 'activity') assert.ok(r.notes.some((note) => TIME_PART_NOTE.test(note)), 'time-part format explicitly has no clock');
        if (mode === 'destination_guide') {
          assert.ok(r.fields.places.length >= 2, 'destination places are read');
          assert.ok(units.some((unit) => unit.allowedPaths.includes('places')), 'place names/descriptions are eligible for evidence-bounded AI');
        } else {
          assert.ok(units.every((unit) => unit.allowedPaths.length > 0), 'every unresolved line has an allowed source-backed destination');
        }
        assert.ok(r.fields.trip.title, 'a title is read');
        if (mode === 'half_day' || mode === 'full_day') assert.equal(r.fields.days.length, 1);
        if (mode === 'multi_day') assert.ok(r.fields.days.length >= 2 && r.fields.days.length <= 14, 'two to fourteen days');
        if (mode === 'activity') assert.ok(r.fields.activity.durationMinutes !== undefined && r.fields.activity.sessionTimes.length > 0);
      });
    }
  }
}

test('the file has three distinct labeled examples per mode and both locales are complete', () => {
  for (const locale of ['id', 'en']) {
    assert.deepEqual(Object.keys(templates.locales[locale]).sort(), [...modeOrder].sort());
    for (const mode of modeOrder) {
      const formats = templates.locales[locale][mode];
      assert.equal(Object.keys(formats).length, 3, `${locale}/${mode} has three examples`);
      assert.equal(new Set(Object.values(formats).map((template) => template.name)).size, 3, `${locale}/${mode} labels are distinct`);
      for (const template of Object.values(formats)) assert.ok(template.name.trim().length > 3);
    }
    const count = Object.values(templates.locales[locale]).reduce((sum, formats) => sum + Object.keys(formats).length, 0);
    assert.equal(count, 15, `${locale} has 15 examples across five modes`);
  }
});

test('all 30 mode-specific templates complete through deterministic parse + mock AI apply with 100% corpus coverage', async (t) => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'itinerary-mode-template-corpus-'));
  let currentText = '';
  let currentMode: ItineraryMode = 'half_day';
  const extractor: ImportExtractor = {
    credentialState: 'configured', modelId: 'mock-template-extractor',
    async extract(request) {
      const parsed = parseDocument(currentText, currentMode);
      return { text: JSON.stringify(templateCompletion(request, parsed)), usage: { promptTokens: 10, completionTokens: 10, costUsd: 0 } };
    }
  };
  const origin = 'http://127.0.0.1:3018';
  const app = await createApp({ dataDir, publicOrigin: origin, allowedOrigins: [origin], importExtractor: extractor });
  const headers = { origin, 'x-engine-request': '1', 'content-type': 'application/json' };
  try {
    for (const locale of ['id', 'en']) {
      for (const mode of modeOrder) {
        for (const [format, template] of Object.entries(templates.locales[locale][mode])) {
          currentText = template.lines.join('\n');
          currentMode = mode;
          const parse = parseDocument(currentText, mode);
          const intake = await app.inject({ method: 'POST', url: '/api/v1/imports/sources', headers, payload: { text: currentText } });
          assert.equal(intake.statusCode, 201, `${locale}/${mode}/${format}: ${intake.body}`);
          const response = await app.inject({ method: 'POST', url: `/api/v1/imports/sources/${intake.json().sourceId}/apply`, headers, payload: { operationId: randomUUID(), target: 'new', mode, outputLanguage: locale } });
          assert.equal(response.statusCode, 201, `${locale}/${mode}/${format}: ${response.body}`);
          const body = response.json();
          const content = body.itinerary.draftContent;
          const sample = `${locale}/${mode}/${format}`;
          assert.equal(content.trip.mode, mode, `${sample} mode`);
          assert.equal(content.trip.title, parse.fields.trip.title, `${sample} title`);
          assert.equal(content.summary, parse.unconsumed.find((unit) => unit.section === 'summary')?.text, `${sample} heading-bounded summary`);
          assert.equal(body.report.coverage.pending, 0, `${sample} pending coverage: ${JSON.stringify(body.report.review.pendingUnits)}`);
          assert.equal(body.report.coverage.rejected, 0, `${sample} rejected coverage`);
          assert.equal(body.report.coverage.omitted, 0, `${sample} omitted coverage`);
          assert.equal(body.report.coverage.applied, body.report.coverage.sourceUnits, `${sample} all AI units applied`);
          assert.equal(body.report.review.unsupported, 0, `${sample} no unsupported units`);
          if (mode === 'destination_guide') {
            assert.deepEqual(content.places.map((place: { name: string }) => place.name), parse.fields.places, `${sample} places`);
            assert.ok(content.places.every((place: { description: string }) => place.description), `${sample} place descriptions are source-backed`);
          } else if (mode === 'activity') {
            assert.equal(content.activity.category, parse.fields.activity.category, `${sample} category`);
            assert.equal(content.activity.durationMinutes, parse.fields.activity.durationMinutes, `${sample} duration`);
            assert.deepEqual(content.activity.sessionTimes, parse.fields.activity.sessionTimes, `${sample} session times`);
          } else {
            assert.deepEqual(content.days.map((day: { dayNumber: number }) => day.dayNumber), parse.fields.days.map((day) => day.dayNumber), `${sample} day structure`);
            assert.deepEqual(content.days.flatMap((day: { activities: Array<{ title: string }> }) => day.activities.map((activity) => activity.title)), parse.fields.days.flatMap((day) => day.activities.map((activity) => activity.title)), `${sample} deterministic activities`);
            if (segmentsOf(parse).units.some((unit) => unit.allowedPaths.includes('activityDetails'))) {
              assert.ok(content.days.flatMap((day: { activities: Array<{ description: string }> }) => day.activities).some((activity: { description: string }) => activity.description), `${sample} activity prose mapped by AI`);
            }
          }
        }
      }
    }
  } finally {
    await app.close();
    await rm(dataDir, { recursive: true, force: true });
  }
});
