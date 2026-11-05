import type { ItineraryMode, WebItineraryContent } from '../contracts/types.js';

const newId = () => globalThis.crypto.randomUUID();

export function makeActivity() {
  return { id: newId(), timeLabel: '', type: 'sightseeing' as const, title: '', description: '', durationLabel: null, area: null, category: null, tip: null };
}

export function makeScheduleBlock(day: number) {
  return { id: newId(), dayStart: day, dayEnd: day, date: null, title: '', location: '', isCondensed: false, assetId: null, photoAttribution: null, activities: [makeActivity()], accommodation: { name: null, area: '', note: '' }, mealsIncluded: [], transportNote: null, blockTip: null };
}

export function makeSpot() {
  return { id: newId(), groupLabel: null, name: '', area: '', category: '', description: '', suggestedDuration: '', bestTimeToVisit: '', gettingThere: '', tips: [''], nearbyPairing: null, assetId: null, photoAttribution: null };
}

export function moveById<T extends { id: string }>(rows: T[], id: string, delta: number): T[] {
  const from = rows.findIndex((row) => row.id === id);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= rows.length) return rows;
  const next = [...rows];
  [next[from], next[to]] = [next[to], next[from]];
  return next;
}

export function moveIndex<T>(rows: T[], index: number, delta: number): T[] {
  const to = index + delta;
  if (index < 0 || to < 0 || to >= rows.length) return rows;
  const next = [...rows];
  [next[index], next[to]] = [next[to], next[index]];
  return next;
}

export function resizeScheduleRange(rows: any[], blockId: string, newEnd: number): any[] {
  const index = rows.findIndex((block) => block.id === blockId);
  if (index < 0) return rows;
  const current = rows[index];
  const delta = newEnd - current.dayEnd;
  if (newEnd < current.dayStart || newEnd > 14 || rows.at(-1)!.dayEnd + delta > 14) return rows;
  return rows.map((block, i) => i === index
    ? { ...block, dayEnd: newEnd, isCondensed: newEnd > block.dayStart }
    : i > index ? { ...block, dayStart: block.dayStart + delta, dayEnd: block.dayEnd + delta } : block);
}

export function changeMode(content: WebItineraryContent, mode: ItineraryMode): WebItineraryContent {
  if (content.brochure.itineraryMode === mode) return content;
  const next = structuredClone(content) as any;
  next.brochure.itineraryMode = mode;
  if (mode === 'destination_guide') {
    next.schedule = [];
  } else {
    next.spots = [];
    if (mode === 'multi_day') {
      next.schedule = next.schedule.map((block: any, index: number) => ({ ...block, dayStart: index + 1, dayEnd: index + 1, isCondensed: false, accommodation: block.accommodation || { name: null, area: '', note: '' } }));
    } else {
      const first = next.schedule[0];
      next.schedule = [first ? { ...first, dayStart: 1, dayEnd: 1, isCondensed: false, accommodation: null } : makeScheduleBlock(1)];
    }
  }
  next.hero.gradientOnly = !next.hero.assetId;
  return next as WebItineraryContent;
}

export function hasModeLoss(content: WebItineraryContent, mode: ItineraryMode): string[] {
  const current = content.brochure.itineraryMode;
  if (current === mode) return [];
  if (mode === 'destination_guide' && content.schedule.length) return [`${content.schedule.length} blok jadwal dan aktivitasnya`];
  if (mode !== 'destination_guide' && content.spots.length) return [`${content.spots.length} tempat guide`];
  if (mode !== 'half_day' && mode !== 'full_day') return [];
  const losses: string[] = [];
  if (content.schedule.length > 1) losses.push(`${content.schedule.length - 1} blok hari selain blok pertama`);
  if ((content.schedule[0]?.dayEnd || 1) > 1) losses.push('rentang hari blok pertama');
  const accommodation = content.schedule[0]?.accommodation;
  if (accommodation && (accommodation.name || accommodation.area || accommodation.note)) losses.push('informasi akomodasi malam');
  return losses;
}
