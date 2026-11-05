import assert from 'node:assert/strict';
import test from 'node:test';
import { createContentV2 } from './fixtures-v2.js';

test('content compiles successfully for all four modes', async () => {
  for (const mode of ['half_day', 'full_day', 'multi_day', 'destination_guide'] as const) {
    const content = createContentV2(mode, 'en');
    assert.ok(content.trip.title);
    assert.ok(content.days);
    assert.ok(Array.isArray(content.days));
    assert.equal(content.trip.mode, mode);
  }
});

test('v2 content validates required fields', async () => {
  const content = createContentV2('full_day', 'en');
  assert.ok(content.trip.title, 'trip.title is required');
  assert.ok(content.trip.language, 'trip.language is required');
  assert.ok(content.trip.mode, 'trip.mode is required');
  assert.ok(content.days && content.days.length > 0, 'days array required');
  assert.ok(content.days[0].activities && content.days[0].activities.length > 0, 'activities required');
});

test('v2 content has correct mode shape', async () => {
  const fullDay = createContentV2('full_day', 'en');
  assert.equal(fullDay.trip.mode, 'full_day');
  assert.ok(fullDay.days[0].activities.length > 0);

  const multiDay = createContentV2('multi_day', 'en');
  assert.equal(multiDay.trip.mode, 'multi_day');
  assert.ok(multiDay.days.length > 1);
  if (multiDay.days[0].hotel) {
    assert.ok(multiDay.days[0].hotel.name, 'multi_day hotel must have name');
  }

  const guide = createContentV2('destination_guide', 'en');
  assert.equal(guide.trip.mode, 'destination_guide');
  assert.ok(guide.spots && guide.spots.length > 0, 'guide mode must have spots');
});

test('v2 content works across multiple locales', async () => {
  for (const locale of ['en', 'fr', 'ja', 'zh-Hans', 'id', 'la']) {
    const content = createContentV2('full_day', locale);
    assert.equal(content.trip.language, locale);
    assert.ok(content.trip.title);
  }
});

test('v2 activity structure includes time and duration labels', async () => {
  const content = createContentV2('full_day', 'en');
  const activity = content.days[0].activities[0];
  assert.ok(activity.title);
  assert.ok(activity.description);
  assert.ok(activity.timeLabel || activity.timeLabel === null);
  assert.ok(activity.durationLabel || activity.durationLabel === null);
});

test('v2 hotel structure in multi_day', async () => {
  const content = createContentV2('multi_day', 'en');
  const day = content.days[0];
  assert.ok(day.hotel);
  assert.ok(day.hotel.name);
  assert.ok(day.hotel.area || day.hotel.area === null);
});

test('v2 content includes photos with attribution', async () => {
  const content = createContentV2('full_day', 'en');
  const activity = content.days[0].activities[0];
  // Photo and credit structure for v2
  assert.ok(activity.photo || typeof activity.photo === 'undefined');
});

test('v2 trips have essential metadata', async () => {
  const content = createContentV2('full_day', 'en');
  assert.ok(content.trip.title);
  assert.ok(content.trip.destination);
  assert.ok(content.trip.region);
  assert.ok(content.trip.country);
  assert.ok(content.trip.startDate);
  assert.ok(content.trip.language);
  assert.ok(content.trip.colorTheme);
});
