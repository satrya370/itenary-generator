import { randomUUID } from 'node:crypto';
import type { Activity, Day, ItineraryMode, WebItineraryContent } from '../contracts/types.js';

function blankActivity(): Activity {
  return { id: randomUUID(), time: null, durationMinutes: null, kind: 'sightseeing', title: '', place: null, description: '', tip: null };
}

function blankDay(mode: ItineraryMode, dayNumber: number): Day {
  return {
    id: randomUUID(), dayNumber, title: '', location: null, photo: null, activities: [blankActivity()], hotel: null,
    meals: mode === 'half_day' ? null : { breakfast: false, lunch: false, dinner: false }, transferNote: null
  };
}

export function createBlankDraft(mode: ItineraryMode, profile: { defaultCountry?: string; defaultLanguage?: string | null } = {}): WebItineraryContent {
  const days = mode === 'half_day' || mode === 'full_day' ? [blankDay(mode, 1)] : mode === 'multi_day' ? [blankDay(mode, 1), blankDay(mode, 2)] : [];
  return {
    schemaVersion: 'web-2.0.0',
    trip: { mode, title: '', destination: '', country: profile.defaultCountry ?? '', region: null, language: profile.defaultLanguage ?? null, colorTheme: 'mixed', startDate: null, startTime: null, endTime: null },
    guide: { name: null, phone: null },
    meeting: { place: null, mapsUrl: null, time: null, note: null },
    pickup: { offered: false, area: null, time: null, dropoffNote: null },
    cover: null,
    summary: '',
    days,
    places: [],
    included: [], notIncluded: [], whatToBring: [], localTips: [], healthSafety: [], emergencyContacts: [],
    policies: null, closingNote: null, disclaimer: null
  };
}
