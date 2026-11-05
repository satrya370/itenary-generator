import { randomUUID } from 'node:crypto';
import type { ItineraryMode, WebItineraryContent } from '../contracts/types.js';

export function createBlankDraft(mode: ItineraryMode, profile: Record<string, unknown>, today = new Date().toISOString().slice(0, 10)): WebItineraryContent {
  const activity = { id: randomUUID(), timeLabel: '', type: 'sightseeing' as const, title: '', description: '', durationLabel: null, area: null, category: null, tip: null };
  const brochure = {
    agencyName: typeof profile.agencyName === 'string' ? profile.agencyName : '',
    agencyContact: typeof profile.agencyContact === 'string' ? profile.agencyContact : '',
    agencyLogoAssetId: typeof profile.agencyLogoAssetId === 'string' ? profile.agencyLogoAssetId : null,
    tripTitle: '', destination: '', region: null, country: '', itineraryMode: mode,
    durationDays: null, scopeLabel: '', startDate: null, endDate: null, travelerCount: null,
    travelerType: null, paceLevel: 'Balanced' as const, themes: [], destinationType: 'mixed' as const,
    generatedDate: today, outputLanguage: null
  };
  return {
    schemaVersion: 'web-1.0.0', brochure,
    hero: { assetId: null, photoAttribution: null, gradientOnly: true },
    overview: { summary: '', quickFacts: { scope: '', bestSeason: '', pace: 'Balanced', themes: [] }, routeSummary: [], highlights: [] },
    schedule: mode === 'half_day' || mode === 'full_day' ? [{ id: randomUUID(), dayStart: 1, dayEnd: 1, date: null, title: '', location: '', isCondensed: false, assetId: null, photoAttribution: null, activities: [activity], accommodation: null, mealsIncluded: [], transportNote: null, blockTip: null }] : [],
    spots: [],
    practical: { included: [], notIncluded: [], whatToBring: [], localTips: [], healthSafety: [], emergencyContacts: [] },
    closing: { closingNote: '', agencyContact: brochure.agencyContact, disclaimer: '', photoCredits: [] }
  } as unknown as WebItineraryContent;
}
