import type { Activity, Day, ItineraryMode, Place, WebItineraryContent } from '../../src/contracts/types.js';

export const idsV2 = {
  day: (n: number) => `10000000-0000-5000-8000-${String(n).padStart(12, '0')}`,
  activity: (n: number) => `20000000-0000-5000-8000-${String(n).padStart(12, '0')}`,
  place: (n: number) => `30000000-0000-5000-8000-${String(n).padStart(12, '0')}`
};

export function activityV2(n: number, overrides: Partial<Activity> = {}): Activity {
  return {
    id: idsV2.activity(n), time: '08:00', durationMinutes: 90, kind: 'sightseeing', title: `Rice terraces ${n}`, place: 'Ubud',
    description: 'Walk through cultivated terraces and learn how local irrigation traditions shape the landscape.', tip: null,
    ...overrides
  };
}

export function placeV2(n: number, overrides: Partial<Place> = {}): Place {
  return {
    id: idsV2.place(n), group: 'Central Ubud', name: `Tegallalang Rice Terraces ${n}`, area: 'North of Ubud',
    description: 'Follow the contours of the terraces and notice how water moves through the shared irrigation channels.',
    tips: [], gettingThere: null, suggestedDuration: null, bestTime: null, nearby: null, photo: null,
    ...overrides
  };
}

function dayV2(mode: ItineraryMode, n: number): Day {
  return {
    id: idsV2.day(n), dayNumber: n, title: mode === 'multi_day' ? `Day ${n}` : '', location: 'Ubud', photo: null,
    activities: [activityV2(n * 10 + 1, { time: '08:00', durationMinutes: 90 }), activityV2(n * 10 + 2, { time: '10:00', durationMinutes: 60, kind: 'food' })],
    hotel: mode === 'multi_day' ? { name: 'Ubud Garden Hotel', area: 'Ubud', note: null } : null,
    meals: mode === 'half_day' ? null : { breakfast: mode === 'multi_day', lunch: true, dinner: false },
    transferNote: mode === 'multi_day' ? 'Private car between towns.' : null
  };
}

export function createContentV2(mode: ItineraryMode = 'full_day', locale = 'en'): WebItineraryContent {
  const scheduled = mode !== 'destination_guide';
  return {
    schemaVersion: 'web-2.0.0',
    trip: {
      mode, title: 'Ubud in a day', destination: 'Ubud', country: 'Indonesia', region: 'Bali', language: locale, colorTheme: 'cultural',
      startDate: scheduled ? '2026-12-01' : null, startTime: mode === 'half_day' || mode === 'full_day' ? '08:00' : null,
      endTime: mode === 'half_day' ? '12:00' : mode === 'full_day' ? '17:00' : null
    },
    guide: { name: 'Made', phone: '+62-000-0000' },
    meeting: scheduled ? { place: 'Ubud Palace', mapsUrl: 'https://maps.example.test/ubud', time: '07:45', note: null } : { place: null, mapsUrl: null, time: null, note: null },
    pickup: { offered: false, area: null, time: null, dropoffNote: null },
    cover: null,
    summary: 'Explore the landscape and culture at an unhurried pace.',
    days: scheduled ? (mode === 'multi_day' ? [dayV2(mode, 1), dayV2(mode, 2)] : [dayV2(mode, 1)]) : [],
    places: scheduled ? [] : [placeV2(1), placeV2(2)],
    included: ['Local guide'], notIncluded: [], whatToBring: ['Water'], localTips: ['Carry small change.'], healthSafety: [],
    emergencyContacts: [{ label: 'Guide', value: '+62-000-0000' }],
    policies: null, closingNote: 'Enjoy your journey.', disclaimer: 'Visit times are suggestions.'
  };
}
