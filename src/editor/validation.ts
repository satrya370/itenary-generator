import type { ItineraryMode, WebItineraryContent } from '../contracts/types.js';
import { validateForPublish } from '../contracts/validator.js';

export type StepId = 'info' | 'plan' | 'details' | 'publish';

export interface PublishIssue { key: string; path: string; step: StepId; message: string }

const messages: Record<string, string> = {
  PUBLISH_FIELD_REQUIRED: 'Wajib diisi sebelum publish.',
  SINGLE_DAY_REQUIRED: 'Itinerary ini harus punya tepat satu hari.',
  MULTI_DAY_COUNT_INVALID: 'Itinerary beberapa hari perlu 2–14 hari.',
  PLACES_REQUIRED: 'Tambahkan minimal satu tempat.',
  EMPTY_DAY: 'Setiap hari perlu minimal satu aktivitas.',
  ACTIVITY_ORDER: 'Urutkan jam aktivitas dari yang paling awal.',
  DURATION_CAP_EXCEEDED: 'Total durasi melebihi batas untuk tipe ini.',
  TIME_RANGE_INVALID: 'Jam selesai harus setelah jam mulai.',
  PHOTO_ATTRIBUTION_REQUIRED: 'Isi nama fotografer untuk foto ini.',
  ACTIVITY_DETAILS_REQUIRED: 'Isi detail aktivitas dulu.'
};

export function stepFor(path: string): StepId {
  if (/^trip\.(title|destination|country|region|language|colorTheme|startDate|mode)/.test(path)) return 'info';
  if (/^(trip\.(startTime|endTime)|meeting|pickup)/.test(path)) return 'info';
  if (/^(summary|days|places|activity)/.test(path)) return 'plan';
  if (/^(guide|cover|included|notIncluded|whatToBring|notSuitableFor|notAllowed|localTips|emergencyContacts|policies|closingNote|disclaimer)/.test(path)) return 'details';
  return 'info';
}

export function stepsFor(_mode: ItineraryMode): StepId[] {
  return ['info', 'plan', 'details', 'publish'];
}

function keyFor(content: WebItineraryContent, path: string): string {
  const day = /^days\[(\d+)\]\.activities\[(\d+)\]/.exec(path);
  if (day) return `${content.days[Number(day[1])]?.activities[Number(day[2])]?.id ?? ''}|${path.replace(/\[\d+\]/g, '[]')}`;
  const dayOnly = /^days\[(\d+)\]/.exec(path);
  if (dayOnly) return `${content.days[Number(dayOnly[1])]?.id ?? ''}|${path.replace(/\[\d+\]/g, '[]')}`;
  const place = /^places\[(\d+)\]/.exec(path);
  if (place) return `${content.places[Number(place[1])]?.id ?? ''}|${path.replace(/\[\d+\]/g, '[]')}`;
  return `|${path.replace(/\[\d+\]/g, '[]')}`;
}

export function publishIssues(content: WebItineraryContent): PublishIssue[] {
  return validateForPublish(content).errors.map((error) => ({
    key: keyFor(content, error.path),
    path: error.path,
    step: stepFor(error.path),
    message: messages[error.code] ?? error.message
  }));
}
