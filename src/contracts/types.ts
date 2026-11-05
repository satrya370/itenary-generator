import type { StandaloneItineraryContent } from './itinerary.generated.js';
import type { StandaloneItineraryContent as StandaloneItineraryContentV1 } from './itinerary-v1.generated.js';
export type { Activity, Day, EmergencyContact, Guide, Hotel, Meals, Meeting, Photo, PhotoCredit, Pickup, Place, Trip } from './itinerary.generated.js';

export const SCHEMA_VERSION = 'web-2.0.0' as const;
export const LEGACY_SCHEMA_VERSION = 'web-1.0.0' as const;

export type ItineraryV2 = StandaloneItineraryContent;
export type ItineraryV1 = StandaloneItineraryContentV1;
export type WebItineraryContent = ItineraryV2;
export type Mode = ItineraryV2['trip']['mode'];
export type ItineraryMode = Mode;
export type LocaleTag = string;

export interface LanguageContext {
  requestedLanguage: 'auto' | LocaleTag;
  outputLanguage: LocaleTag | null;
  source: 'detected' | 'explicit' | 'unresolved';
}

export interface ContractDiagnostic {
  code: string;
  path: string;
  message: string;
}

export interface ContractResult<T> {
  ok: boolean;
  value: T;
  errors: ContractDiagnostic[];
  warnings: ContractDiagnostic[];
}
