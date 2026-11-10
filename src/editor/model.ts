import type { Activity, Day, Hotel, ItineraryMode, Photo, Place, WebItineraryContent } from '../contracts/types.js';

const newId = () => globalThis.crypto.randomUUID();
const emptyMeals = () => ({ breakfast: false, lunch: false, dinner: false });
const emptyMeeting = () => ({ place: null, mapsUrl: null, time: null, note: null });

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
    meals: mode === 'half_day' ? null : emptyMeals(),
    transferNote: null
  };
}

export function makePlace(): Place {
  return { id: newId(), group: null, name: '', area: '', description: '', tips: [], gettingThere: null, suggestedDuration: null, bestTime: null, nearby: null, photo: null };
}

export function renumberDays(days: Day[]): Day[] {
  return days.map((day, index) => ({ ...day, dayNumber: index + 1 }));
}

export function ensureMeals(day: Day): Day {
  return day.meals ? day : { ...day, meals: emptyMeals() };
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
  if (photo === null) return null;
  const credit = photo.credit ?? { photographer: '', url: null, source: '' };
  const next = { ...credit };
  if (key === 'url') next.url = blankToNull(value);
  else next[key] = value ?? '';
  const allBlank = next.photographer.trim() === '' && next.url === null && next.source.trim() === '';
  return { ...photo, credit: allBlank ? null : next };
}

export function setPhotoAsset(photo: Photo | null, assetId: string | null): Photo | null {
  return assetId ? { assetId, credit: photo?.credit ?? null } : null;
}

export function normalizeHotel(name: string, area: string | null, note: string | null): Hotel | null {
  if (name.trim() === '' && blankToNull(area) === null && blankToNull(note) === null) return null;
  return { name, area: blankToNull(area), note: blankToNull(note) };
}

export function pickupOff() {
  return { offered: false as const, area: null, time: null, dropoffNote: null };
}

export function normalizeBlanks(content: WebItineraryContent): WebItineraryContent {
  const next = structuredClone(content);
  const photoBlanks = (photo: Photo | null) => {
    if (photo?.credit) photo.credit.url = blankToNull(photo.credit.url);
  };
  next.trip.region = blankToNull(next.trip.region);
  next.trip.startDate = blankToNull(next.trip.startDate);
  next.trip.startTime = blankToNull(next.trip.startTime);
  next.trip.endTime = blankToNull(next.trip.endTime);
  next.guide.name = blankToNull(next.guide.name);
  next.guide.phone = blankToNull(next.guide.phone);
  next.meeting.place = blankToNull(next.meeting.place);
  next.meeting.mapsUrl = blankToNull(next.meeting.mapsUrl);
  next.meeting.time = blankToNull(next.meeting.time);
  next.meeting.note = blankToNull(next.meeting.note);
  next.pickup.area = blankToNull(next.pickup.area);
  next.pickup.time = blankToNull(next.pickup.time);
  next.pickup.dropoffNote = blankToNull(next.pickup.dropoffNote);
  next.policies = blankToNull(next.policies);
  next.closingNote = blankToNull(next.closingNote);
  next.disclaimer = blankToNull(next.disclaimer);
  photoBlanks(next.cover);
  for (const day of next.days) {
    day.location = blankToNull(day.location);
    day.transferNote = blankToNull(day.transferNote);
    if (day.hotel) day.hotel = normalizeHotel(day.hotel.name, day.hotel.area, day.hotel.note);
    photoBlanks(day.photo);
    for (const activity of day.activities) {
      activity.time = blankToNull(activity.time);
      activity.place = blankToNull(activity.place);
      activity.tip = blankToNull(activity.tip);
      activity.durationMinutes = normalizeDuration(activity.durationMinutes);
    }
  }
  const keepFilled = (values: string[]) => values.filter((value) => value.trim() !== '');
  next.included = keepFilled(next.included);
  next.notIncluded = keepFilled(next.notIncluded);
  next.whatToBring = keepFilled(next.whatToBring);
  next.localTips = keepFilled(next.localTips);
  next.healthSafety = keepFilled(next.healthSafety);
  next.emergencyContacts = next.emergencyContacts.filter((contact) => contact.label.trim() !== '' || contact.value.trim() !== '');
  for (const place of next.places) {
    place.group = blankToNull(place.group);
    place.tips = keepFilled(place.tips);
    place.gettingThere = blankToNull(place.gettingThere);
    place.suggestedDuration = blankToNull(place.suggestedDuration);
    place.bestTime = blankToNull(place.bestTime);
    place.nearby = blankToNull(place.nearby);
    photoBlanks(place.photo);
  }
  return next;
}

const IGNORED_KEYS = new Set(['id', 'dayNumber', 'kind']);

function hasContent(value: unknown): boolean {
  if (typeof value === 'string') return value.trim() !== '';
  if (Array.isArray(value)) return value.some(hasContent);
  if (value && typeof value === 'object') {
    return Object.entries(value).some(([key, item]) => !IGNORED_KEYS.has(key) && hasContent(item));
  }
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
    next.meeting = emptyMeeting();
    next.pickup = pickupOff();
  } else if (mode === 'half_day' || mode === 'full_day') {
    next.places = [];
    const day = next.days[0] ? structuredClone(next.days[0]) : makeDay(mode, 1);
    day.hotel = null;
    day.transferNote = null;
    next.days = renumberDays([mode === 'half_day' ? { ...day, meals: null } : ensureMeals(day)]);
  } else {
    next.places = [];
    next.trip.startTime = null;
    next.trip.endTime = null;
    if (current === 'destination_guide') {
      next.days = renumberDays([makeDay(mode, 1), makeDay(mode, 2)]);
    } else {
      next.days = renumberDays([ensureMeals(next.days[0] ?? makeDay(mode, 1)), makeDay(mode, 2)]);
    }
  }
  return next;
}

export function hasModeLoss(content: WebItineraryContent, mode: ItineraryMode): string[] {
  const current = content.trip.mode;
  if (current === mode) return [];
  const losses: string[] = [];

  if (current === 'destination_guide') {
    const places = content.places.filter(hasContent).length;
    if (places) losses.push(`${places} tempat`);
    return losses;
  }

  if (mode === 'destination_guide') {
    const days = content.days.filter(hasContent).length;
    if (days) losses.push(`${days} hari beserta aktivitasnya`);
    if (content.trip.startDate) losses.push('tanggal mulai');
    if (content.trip.startTime || content.trip.endTime) losses.push('jam mulai/selesai');
    if (hasContent(content.meeting)) losses.push('titik kumpul');
    if (content.pickup.offered) losses.push('penjemputan');
    return losses;
  }

  if (mode === 'multi_day') {
    if (content.trip.startTime || content.trip.endTime) losses.push('jam mulai/selesai');
    return losses;
  }

  const extra = content.days.slice(1).filter(hasContent).length;
  if (extra) losses.push(`${extra} hari selain hari pertama`);
  const first = content.days[0];
  if (first) {
    if (first.hotel && hasContent(first.hotel)) losses.push('info hotel');
    if (blankToNull(first.transferNote)) losses.push('catatan perpindahan');
    if (mode === 'half_day' && first.meals && hasContent(first.meals)) losses.push('pilihan makan');
  }
  return losses;
}
