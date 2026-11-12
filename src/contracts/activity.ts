import type { WebItineraryContent } from './types.js';

/** Activity mode (web-2.2.0): one activity of a few hours, no day schedule. Shared by server drafts and the editor. */
export type ActivityMode = NonNullable<WebItineraryContent['activity']>;

export function blankActivityMode(): ActivityMode {
  return { category: null, durationMinutes: null, sessionTimes: [], difficulty: null, highlights: [], steps: [], ageMin: null, ageMax: null, weightMaxKg: null, guideLanguages: [], operator: null, bestTime: null };
}

/** True when the editor or the import has filled anything in the activity block. */
export function hasActivityContent(activity: ActivityMode | null | undefined): boolean {
  if (!activity) return false;
  return Boolean(activity.category || activity.durationMinutes !== null || activity.sessionTimes.length || activity.difficulty || activity.highlights.length || activity.steps.length || activity.ageMin !== null || activity.ageMax !== null || activity.weightMaxKg !== null || activity.guideLanguages.length || (activity.operator ?? '').trim() || (activity.bestTime ?? '').trim());
}
