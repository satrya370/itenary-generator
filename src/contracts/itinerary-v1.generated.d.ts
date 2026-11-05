/* Frozen v1 declaration (web-1.0.0) from config/web/itinerary.schema.v1.json. Do not regenerate or edit. */

export type PhotoAttribution = {
  photographer: string;
  photographerUrl: string | null;
  source: string;
} & PhotoAttribution1;
export type PhotoAttribution1 = {
  photographer: string;
  photographerUrl: string | null;
  source: string;
} | null;
export type Accommodation = {
  name: string | null;
  area: string;
  note: string;
} & Accommodation1;
export type Accommodation1 = {
  name: string | null;
  area: string;
  note: string;
} | null;

/**
 * Canonical nested brochure content. Publish-only requirements are defined by the field registry and validators.
 */
export interface StandaloneItineraryContent {
  schemaVersion: "web-1.0.0";
  brochure: Brochure;
  hero: Hero;
  overview: Overview;
  schedule: ScheduleBlock[];
  spots: Spot[];
  practical: Practical;
  closing: Closing;
}
export interface Brochure {
  agencyName: string;
  agencyContact: string;
  agencyLogoAssetId?: string | null;
  tripTitle: string;
  destination: string;
  region: string | null;
  country: string;
  itineraryMode: "half_day" | "full_day" | "multi_day" | "destination_guide";
  durationDays: number | null;
  scopeLabel: string;
  startDate: string | null;
  endDate: string | null;
  travelerCount: number | null;
  travelerType: string | null;
  paceLevel: "Relaxed" | "Balanced" | "Packed";
  /** @maxItems 30 */
  themes: string[];
  destinationType: "beach" | "mountain" | "city" | "cultural" | "nature" | "desert" | "mixed";
  generatedDate: string | null;
  outputLanguage: string | null;
}
export interface Hero {
  assetId: string | null;
  photoAttribution: PhotoAttribution;
  gradientOnly: boolean;
}
export interface Overview {
  summary: string;
  quickFacts: {
    scope: string;
    bestSeason: string;
    pace: string;
    /** @maxItems 30 */
    themes: string[];
  };
  /** @maxItems 40 */
  routeSummary: string[];
  /** @maxItems 12 */
  highlights: { icon: string; title: string; note: string }[];
}
export interface ScheduleBlock {
  id: string;
  dayStart: number;
  dayEnd: number;
  date: string | null;
  title: string;
  location: string;
  isCondensed: boolean;
  assetId?: string | null;
  photoAttribution?: PhotoAttribution;
  activities: Activity[];
  accommodation: Accommodation;
  /** @maxItems 12 */
  mealsIncluded: string[];
  transportNote: string | null;
  blockTip: string | null;
}
export interface Activity {
  id: string;
  timeLabel: string;
  type: "transport" | "sightseeing" | "food" | "activity" | "rest" | "accommodation" | "free";
  title: string;
  description: string;
  durationLabel: string | null;
  area: string | null;
  category: string | null;
  tip: string | null;
}
export interface Spot {
  id: string;
  groupLabel: string | null;
  name: string;
  area: string;
  category: string;
  description: string;
  suggestedDuration: string;
  bestTimeToVisit: string;
  gettingThere: string;
  /** @maxItems 20 */
  tips: string[];
  nearbyPairing: string | null;
  assetId: string | null;
  photoAttribution: PhotoAttribution;
}
export interface Practical {
  /** @maxItems 50 */
  included: string[];
  /** @maxItems 50 */
  notIncluded: string[];
  /** @maxItems 50 */
  whatToBring: string[];
  /** @maxItems 50 */
  localTips: { topic: string; note: string }[];
  /** @maxItems 50 */
  healthSafety: string[];
  /** @maxItems 30 */
  emergencyContacts: { label: string; value: string }[];
}
export interface Closing {
  closingNote: string;
  agencyContact: string;
  disclaimer: string;
  /** @maxItems 40 */
  photoCredits: PhotoAttribution[];
}
