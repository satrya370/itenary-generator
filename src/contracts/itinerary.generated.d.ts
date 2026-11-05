/* Generated from config/web/itinerary.schema.json. Do not edit by hand. */

/**
 * Canonical guide-centric itinerary content (web-2.0.0). Publish-only requirements and mode applicability are defined by the field registry and validators.
 */
export interface StandaloneItineraryContent {
  schemaVersion: "web-2.0.0";
  trip: Trip;
  guide: Guide;
  meeting: Meeting;
  pickup: Pickup;
  cover: Photo | null;
  summary: string;
  /**
   * @maxItems 14
   */
  days: Day[];
  places: Place[];
  /**
   * @maxItems 50
   */
  included: string[];
  /**
   * @maxItems 50
   */
  notIncluded: string[];
  /**
   * @maxItems 50
   */
  whatToBring: string[];
  /**
   * @maxItems 50
   */
  localTips: string[];
  /**
   * @maxItems 50
   */
  healthSafety: string[];
  /**
   * @maxItems 30
   */
  emergencyContacts: EmergencyContact[];
  policies: string | null;
  closingNote: string | null;
  disclaimer: string | null;
}
export interface Trip {
  mode: "half_day" | "full_day" | "multi_day" | "destination_guide";
  title: string;
  destination: string;
  country: string;
  region: string | null;
  language: string | null;
  colorTheme: "beach" | "mountain" | "city" | "cultural" | "nature" | "desert" | "mixed";
  startDate: string | null;
  startTime: string | null;
  endTime: string | null;
}
export interface Guide {
  name: string | null;
  phone: string | null;
}
export interface Meeting {
  place: string | null;
  mapsUrl: string | null;
  time: string | null;
  note: string | null;
}
export interface Pickup {
  offered: boolean;
  area: string | null;
  time: string | null;
  dropoffNote: string | null;
}
export interface Photo {
  assetId: string;
  credit: PhotoCredit | null;
}
export interface PhotoCredit {
  photographer: string;
  url: string | null;
  source: string;
}
export interface Day {
  id: string;
  dayNumber: number;
  title: string;
  location: string | null;
  photo: Photo | null;
  /**
   * @maxItems 30
   */
  activities: Activity[];
  hotel: Hotel | null;
  meals: Meals | null;
  transferNote: string | null;
}
export interface Activity {
  id: string;
  time: string | null;
  durationMinutes: number | null;
  kind: "sightseeing" | "food" | "activity" | "transport" | "free";
  title: string;
  place: string | null;
  description: string;
  tip: string | null;
}
export interface Hotel {
  name: string;
  area: string | null;
  note: string | null;
}
export interface Meals {
  breakfast: boolean;
  lunch: boolean;
  dinner: boolean;
}
export interface Place {
  id: string;
  group: string | null;
  name: string;
  area: string;
  description: string;
  /**
   * @maxItems 20
   */
  tips: string[];
  gettingThere: string | null;
  suggestedDuration: string | null;
  bestTime: string | null;
  nearby: string | null;
  photo: Photo | null;
}
export interface EmergencyContact {
  label: string;
  value: string;
}
