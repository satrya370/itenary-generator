import type { Activity, Day, ItineraryMode, Photo, Place, WebItineraryContent } from '../contracts/types.js';
import { validateDraft } from '../contracts/validator.js';

const newId = () => globalThis.crypto.randomUUID();

export function blankToNull(value: string | null | undefined): string | null {
  return value === null || value === undefined || value.trim() === '' ? null : value;
}

export function makeActivity(): Activity {
  return { id: newId(), time: null, durationMinutes: null, kind: 'sightseeing', title: '', place: null, description: '', tip: null };
}

export function makeDay(mode: ItineraryMode, dayNumber: number): Day {
  return {
    id: newId(),
    dayNumber,
    title: '',
    location: null,
    photo: null,
    activities: [makeActivity()],
    hotel: null,
    meals: mode === 'half_day' ? null : { breakfast: false, lunch: false, dinner: false },
    transferNote: null
  };
}

export function makePlace(): Place {
  return { id: newId(), group: null, name: '', area: '', description: '', tips: [], gettingThere: null, suggestedDuration: null, bestTime: null, nearby: null, photo: null };
}

export function renumberDays(days: Day[]): Day[] {
  return days.map((day, index) => ({ ...day, dayNumber: index + 1 }));
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

export function normalizeDuration(raw: number | null | undefined): number | null {
  if (raw === null || raw === undefined || Number.isNaN(raw)) return null;
  if (!Number.isInteger(raw) || raw < 1 || raw > 1440) return null;
  return raw;
}

export function setPhotoCredit(photo: Photo | null, key: 'photographer' | 'url' | 'source', value: string | null): Photo | null {
  if (photo === null) {
    return { assetId: '', credit: { photographer: '', url: null, source: '' } };
  }
  const credit = photo.credit ?? { photographer: '', url: null, source: '' };
  const nextCredit = { ...credit, [key]: value };
  if (key === 'url') nextCredit.url = blankToNull(typeof value === 'string' ? value : null);
  const allBlank = nextCredit.photographer.trim() === '' && nextCredit.url === null && nextCredit.source.trim() === '';
  return { ...photo, credit: allBlank ? null : nextCredit };
}

export function setPhotoAsset(photo: Photo | null, assetId: string | null): Photo | null {
  return assetId ? { assetId, credit: photo?.credit ?? null } : null;
}

export function normalizeHotel(name: string, area: string | null, note: string | null) {
  if (name.trim() === '' && (area === null || area.trim() === '') && (note === null || note.trim() === '')) return null;
  return { name, area: blankToNull(area), note: blankToNull(note) };
}

export function normalizeMeals(breakfast: boolean, lunch: boolean, dinner: boolean) {
  if (!breakfast && !lunch && !dinner) return null;
  return { breakfast, lunch, dinner };
}

export function pickupOff() {
  return { offered: false as const, area: null, time: null, dropoffNote: null };
}

function hasText(value: unknown): boolean {
  if (typeof value === 'string') return value.trim() !== '';
  if (Array.isArray(value)) return value.length > 0;
  if (value && typeof value === 'object') return Object.values(value).some(hasText);
  return value === true;
}

export function changeMode(content: WebItineraryContent, mode: ItineraryMode): WebItineraryContent {
  const next = structuredClone(content);
  const current = content.trip.mode;
  if (current === mode) return next;
  next.trip.mode = mode;

  if (mode === 'destination_guide') {
    next.days = [];
    next.trip.startDate = null;
    next.trip.startTime = null;
    next.trip.endTime = null;
    next.meeting = { place: null, mapsUrl: null, time: null, note: null };
    next.pickup = pickupOff();
    if (current !== 'destination_guide') next.places = [];
  } else if (mode === 'half_day' || mode === 'full_day') {
    next.places = [];
    const first = next.days[0];
    const day = first ? structuredClone(first) : makeDay(mode, 1);
    day.hotel = null;
    day.transferNote = null;
    if (mode === 'half_day') day.meals = null;
    else if (!day.meals) day.meals = { breakfast: false, lunch: false, dinner: false };
    next.days = [renumberDays([day])[0]];
    next.trip.startDate = next.trip.startDate ?? null;
    next.trip.startTime = next.trip.startTime ?? null;
    next.trip.endTime = next.trip.endTime ?? null;
    next.meeting = current === 'destination_guide' ? { place: null, mapsUrl: null, time: null, note: null } : next.meeting;
    next.pickup = current === 'destination_guide' ? pickupOff() : next.pickup;
  } else {
    next.places = [];
    next.trip.startTime = null;
    next.trip.endTime = null;
    if (current === 'half_day' || current === 'full_day') {
      const first = next.days[0] ? structuredClone(next.days[0]) : makeDay(mode, 1);
      if (!first.meals) first.meals = { breakfast: false, lunch: false, dinner: false };
      next.days = renumberDays([first, makeDay(mode, 2)]);
    } else if (current === 'destination_guide') {
      next.days = renumberDays([makeDay(mode, 1), makeDay(mode, 2)]);
    } else {
      next.days = renumberDays(next.days);
    }
    next.meeting = current === 'destination_guide' ? { place: null, mapsUrl: null, time: null, note: null } : next.meeting;
    next.pickup = current === 'destination_guide' ? pickupOff() : next.pickup;
  }

  const checked = validateDraft(next);
  return checked.value;
}

export function hasModeLoss(content: WebItineraryContent, mode: ItineraryMode): string[] {
  if (content.trip.mode === mode) return [];
  const losses: string[] = [];

  if (mode === 'destination_guide') {
    if (content.days.length) losses.push(`${content.days.length} hari beserta aktivitasnya`);
    if (content.trip.startDate) losses.push('tanggal mulai');
    if (content.trip.startTime || content.trip.endTime) losses.push('jam mulai/selesai');
    if (hasText(content.meeting)) losses.push('titik kumpul');
    if (content.pickup.offered) losses.push('penjemputan');
    return losses;
  }

  if (content.trip.mode === 'destination_guide' && mode !== 'destination_guide') {
    const placesWithText = content.places.filter((place) => hasText(place.name) || hasText(place.area) || hasText(place.description) || hasText(place.group) || place.tips.length);
    if (placesWithText.length) losses.push(`${placesWithText.length} tempat`);
    return losses;
  }

  if (mode === 'half_day' || mode === 'full_day') {
    if (content.days.length > 1) losses.push(`${content.days.length - 1} hari selain hari pertama`);
    const first = content.days[0];
    if (first) {
      if (first.hotel && hasText(first.hotel)) losses.push('info hotel');
      if (first.transferNote && first.transferNote.trim() !== '') losses.push('catatan perpindahan');
      if (mode === 'half_day' && first.meals && (first.meals.breakfast || first.meals.lunch || first.meals.dinner)) losses.push('pilihan makan');
    }
    return losses;
  }

  if (mode === 'multi_day') {
    return losses;
  }

  return losses;
}
