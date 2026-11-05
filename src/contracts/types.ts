import type { StandaloneItineraryContent } from './itinerary.generated.js';
export type { Activity, Accommodation, Brochure, Closing, Hero, Overview, PhotoAttribution, Practical, ScheduleBlock, Spot } from './itinerary.generated.js';

export type WebItineraryContent = StandaloneItineraryContent;
export type ItineraryMode = WebItineraryContent['brochure']['itineraryMode'];
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
