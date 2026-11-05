import type { ItineraryMode } from '../../src/contracts/types.js';

const ids = {
  block1: '10000000-0000-5000-8000-000000000001',
  block2: '10000000-0000-5000-8000-000000000002',
  activity1: '20000000-0000-5000-8000-000000000001',
  activity2: '20000000-0000-5000-8000-000000000002',
  spot1: '30000000-0000-5000-8000-000000000001'
};

function block(id: string, dayStart: number, dayEnd = dayStart) {
  return {
    id,
    dayStart,
    dayEnd,
    date: null,
    title: `Day ${dayStart}`,
    location: 'Ubud',
    isCondensed: dayEnd > dayStart,
    assetId: null,
    photoAttribution: null,
    activities: [{
      id: dayStart === 1 ? ids.activity1 : ids.activity2,
      timeLabel: '08:00',
      type: 'sightseeing',
      title: 'Rice terraces',
      description: 'Walk through cultivated terraces and learn how local irrigation traditions shape the landscape.',
      durationLabel: '90 minutes',
      area: 'Ubud',
      category: 'Nature',
      tip: null
    }],
    accommodation: dayEnd >= 1 ? { name: null, area: 'Ubud', note: 'Stay near the town center.' } : null,
    mealsIncluded: [],
    transportNote: null,
    blockTip: null
  };
}

export function createContent(mode: ItineraryMode = 'full_day', locale = 'en') {
  const content: any = {
    schemaVersion: 'web-1.0.0',
    brochure: {
      agencyName: 'Sample Travel Studio',
      agencyContact: 'guide@example.test',
      agencyLogoAssetId: null,
      tripTitle: 'Ubud in a day',
      destination: 'Ubud',
      region: 'Bali',
      country: 'Indonesia',
      itineraryMode: mode,
      durationDays: mode === 'multi_day' ? 2 : null,
      scopeLabel: mode === 'multi_day' ? '2 days' : mode === 'half_day' ? 'Half day' : mode === 'destination_guide' ? 'Destination guide' : 'Full day',
      startDate: null,
      endDate: null,
      travelerCount: 2,
      travelerType: 'couple',
      paceLevel: 'Balanced',
      themes: ['culture'],
      destinationType: 'cultural',
      generatedDate: null,
      outputLanguage: locale
    },
    hero: { assetId: null, photoAttribution: null, gradientOnly: true },
    overview: {
      summary: 'Explore the landscape and culture at an unhurried pace.',
      quickFacts: { scope: 'Full day', bestSeason: 'Dry season', pace: 'Balanced', themes: ['culture'] },
      routeSummary: ['Ubud center', 'Tegallalang'],
      highlights: [{ icon: 'sightseeing', title: 'Rice terraces', note: 'A landscape shaped by local farming.' }]
    },
    schedule: [],
    spots: [],
    practical: {
      included: [], notIncluded: [], whatToBring: [], localTips: [], healthSafety: [], emergencyContacts: []
    },
    closing: { closingNote: 'Enjoy your journey.', agencyContact: 'guide@example.test', disclaimer: 'Visit times are suggestions.', photoCredits: [] }
  };

  if (mode === 'destination_guide') {
    content.schedule = [];
    content.spots = [{
      id: ids.spot1,
      groupLabel: 'Central Ubud',
      name: 'Tegallalang Rice Terraces',
      area: 'North of Ubud',
      category: 'Landscape',
      description: 'Follow the contours of the terraces and notice how water moves through the shared irrigation channels. The walk offers views across cultivated slopes and a chance to understand how farming remains part of daily life. Paths can be uneven after rain, so take time on the steeper sections and leave room to pause at viewpoints.',
      suggestedDuration: 'About 90 minutes',
      bestTimeToVisit: 'Early morning for cooler air',
      gettingThere: 'Arrange a driver from central Ubud and agree on a return meeting point.',
      tips: ['Wear shoes with grip and carry drinking water.'],
      nearbyPairing: 'Pair with a relaxed lunch in Ubud.',
      assetId: null,
      photoAttribution: null
    }];
  } else if (mode === 'multi_day') {
    content.schedule = [block(ids.block1, 1), block(ids.block2, 2)];
  } else {
    content.schedule = [block(ids.block1, 1)];
    content.schedule[0].accommodation = null;
  }
  return content;
}

export { ids };
