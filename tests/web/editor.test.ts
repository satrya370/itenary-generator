import assert from 'node:assert/strict';
import { test } from 'node:test';
import registry from '../../config/web/field-registry.json' with { type: 'json' };
import { editorCoveredPaths } from '../../src/editor/coverage.js';
import { changeMode, hasModeLoss, makeScheduleBlock, makeSpot, moveById, moveIndex, resizeScheduleRange } from '../../src/editor/model.js';
import { createBlankDraft } from '../../src/server/draft.js';
import type { ItineraryMode } from '../../src/contracts/types.js';

test('editor coverage accounts for every registry path', () => {
  const paths = registry.fields.map((field) => field.path);
  assert.equal(editorCoveredPaths.size, paths.length);
  assert.deepEqual(paths.filter((path) => !editorCoveredPaths.has(path)), []);
});

test('reordering repeaters preserves stable IDs and source objects', () => {
  const rows = [makeSpot(), makeSpot(), makeSpot()];
  const ids = rows.map((row) => row.id);
  const moved = moveById(rows, ids[1], -1);
  assert.deepEqual(moved.map((row) => row.id), [ids[1], ids[0], ids[2]]);
  assert.deepEqual(rows.map((row) => row.id), ids);
  assert.deepEqual(moveById(rows, 'missing', 1), rows);
});

test('string/object repeater order changes preserve every value', () => {
  const rows = [{ name: 'included' }, { name: 'not included' }, { name: 'bring' }];
  assert.deepEqual(moveIndex(rows, 2, -1).map(row => row.name), ['included', 'bring', 'not included']);
  assert.deepEqual(rows.map(row => row.name), ['included', 'not included', 'bring']);
  assert.deepEqual(moveIndex(rows, 0, -1), rows);
});

test('block day-range changes are confirmed by caller, preserve blocks and avoid overlap', () => {
  const rows = [makeScheduleBlock(1), makeScheduleBlock(2), makeScheduleBlock(3)];
  const ids = rows.map((row) => row.id);
  const widened = resizeScheduleRange(rows, ids[0], 2);
  assert.deepEqual(widened.map(({ dayStart, dayEnd }: any) => [dayStart, dayEnd]), [[1, 2], [3, 3], [4, 4]]);
  assert.deepEqual(widened.map((row) => row.id), ids);
  assert.equal(widened[0].isCondensed, true);
  assert.deepEqual(resizeScheduleRange(widened, ids[0], 15), widened);
});

test('mode transitions report discarded groups and preserve shared manual copy', () => {
  const source: any = createBlankDraft('destination_guide', {});
  source.brochure.tripTitle = 'Kyoto guide';
  source.spots.push(makeSpot());
  assert.deepEqual(hasModeLoss(source, 'full_day'), ['1 tempat guide']);
  const next = changeMode(source, 'full_day');
  assert.equal(next.brochure.tripTitle, 'Kyoto guide');
  assert.equal(next.spots.length, 0);
  assert.equal(next.schedule.length, 1);
  assert.notEqual(next.schedule[0].activities[0].id, '');
  assert.equal(source.spots.length, 1);
});

test('switching scheduled mode keeps first block and explicit content', () => {
  const source: any = createBlankDraft('multi_day', {});
  source.schedule.push(makeScheduleBlock(1), makeScheduleBlock(2));
  source.schedule[0].activities[0].title = 'Garden visit';
  assert.deepEqual(hasModeLoss(source, 'full_day'), ['1 blok hari selain blok pertama']);
  const next = changeMode(source, 'full_day');
  assert.equal(next.schedule.length, 1);
  assert.equal(next.schedule[0].activities[0].title, 'Garden visit');
  assert.equal(next.schedule[0].accommodation, null);
});

test('mode-change confirmation includes first-block accommodation and day-range losses', () => {
  const source: any = createBlankDraft('multi_day', {});
  const block: any = makeScheduleBlock(1);
  block.dayEnd = 2; block.isCondensed = true; block.accommodation = { name: 'Ryokan', area: 'Kyoto', note: 'Near route' };
  source.schedule.push(block);
  assert.deepEqual(hasModeLoss(source, 'full_day'), ['rentang hari blok pertama', 'informasi akomodasi malam']);
});

test('all four new-editor modes retain canonical draft shape', () => {
  for (const mode of ['half_day', 'full_day', 'multi_day', 'destination_guide'] as ItineraryMode[]) {
    const draft = createBlankDraft(mode, {});
    assert.equal(draft.brochure.itineraryMode, mode);
    assert.ok(Array.isArray(draft.schedule) && Array.isArray(draft.spots));
  }
});
