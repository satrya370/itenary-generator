import { randomUUID } from 'node:crypto';
import type { Activity, ContractDiagnostic, Day, ItineraryV2, Mode, Photo, Place } from './types.js';

type Rec = Record<string, any>;

export interface AgencyProfile {
  agencyName?: unknown;
  agencyContact?: unknown;
  agencyLogoAssetId?: unknown;
}

export interface UpgradeResult {
  value: ItineraryV2;
  warnings: ContractDiagnostic[];
}

const MODES: readonly Mode[] = ['half_day', 'full_day', 'multi_day', 'destination_guide'];
const COLOR_THEMES = ['beach', 'mountain', 'city', 'cultural', 'nature', 'desert', 'mixed'] as const;
const KINDS = ['sightseeing', 'food', 'activity', 'transport', 'free'] as const;

function isRecord(value: unknown): value is Rec {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
function rec(value: unknown): Rec { return isRecord(value) ? value : {}; }
function list(value: unknown): unknown[] { return Array.isArray(value) ? value : []; }
function clean(value: unknown): string { return typeof value === 'string' ? value.trim() : ''; }
function orNull(value: unknown): string | null { const text = clean(value); return text ? text : null; }
function strings(value: unknown): string[] { return list(value).map(clean).filter(Boolean); }

function parseTime(label: string): string | null {
  const match = /(?<!\d)([01]?\d|2[0-3])[:.]([0-5]\d)(?!\d)/.exec(label);
  return match ? `${match[1].padStart(2, '0')}:${match[2]}` : null;
}

function parseDuration(label: string): number | null {
  const text = label.toLowerCase();
  let total = 0;
  let found = false;
  const hours = /(\d+(?:[.,]\d+)?)\s*(?:jam|hours?|hrs?|h)\b/.exec(text);
  if (hours) { total += Math.round(parseFloat(hours[1].replace(',', '.')) * 60); found = true; }
  const mins = /(\d+)\s*(?:menit|minutes?|mins?|min|m)\b/.exec(text);
  if (mins) { total += parseInt(mins[1], 10); found = true; }
  return found && total >= 1 && total <= 1440 ? total : null;
}

function addDays(date: string, offset: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + offset * 86_400_000).toISOString().slice(0, 10);
}

export function upgradeV1ToV2(input: unknown, profile: AgencyProfile = {}): UpgradeResult {
  const warnings: ContractDiagnostic[] = [];
  const warn = (code: string, path: string, message: string) => warnings.push({ code, path, message });
  const fit = (text: string | null, max: number, path: string): string | null => {
    if (text === null || text.length <= max) return text;
    warn('VALUE_TRUNCATED', path, `The value was longer than ${max} characters and was shortened.`);
    return text.slice(0, max);
  };

  const v1 = rec(input);
  const brochure = rec(v1.brochure);
  const hero = rec(v1.hero);
  const overview = rec(v1.overview);
  const practical = rec(v1.practical);
  const closing = rec(v1.closing);
  const schedule = list(v1.schedule);
  const spots = list(v1.spots);

  const mode: Mode = MODES.includes(brochure.itineraryMode) ? brochure.itineraryMode : 'half_day';
  const scheduled = mode !== 'destination_guide';

  let startDate = orNull(brochure.startDate);
  if (!scheduled && startDate) { warn('START_DATE_DROPPED', 'brochure.startDate', 'A destination guide has no dates; the start date was removed.'); startDate = null; }
  if (scheduled && !startDate) startDate = orNull(rec(schedule[0]).date);

  const toPhoto = (assetId: unknown, attribution: unknown, path: string): Photo | null => {
    const id = clean(assetId);
    const attr = rec(attribution);
    const photographer = clean(attr.photographer);
    const source = clean(attr.source);
    let url = orNull(attr.photographerUrl);
    if (url && !/^https:\/\//i.test(url)) { warn('PHOTO_URL_DROPPED', `${path}.credit.url`, 'Only https photo credit links are kept.'); url = null; }
    if (!id) {
      if (photographer || source) warn('PHOTO_CREDIT_WITHOUT_PHOTO', path, 'A photo credit existed without a photo and was removed.');
      return null;
    }
    return { assetId: id, credit: photographer || source ? { photographer, url, source } : null };
  };

  const meals = (items: unknown, path: string) => {
    const result = { breakfast: false, lunch: false, dinner: false };
    for (const item of strings(items)) {
      const text = item.toLowerCase();
      if (/(breakfast|sarapan|petit[- ]d|makan pagi|\bpagi\b)/.test(text)) result.breakfast = true;
      else if (/(lunch|makan siang|d[eé]jeuner|midday)/.test(text)) result.lunch = true;
      else if (/(dinner|makan malam|d[iî]ner|supper)/.test(text)) result.dinner = true;
      else warn('MEAL_UNMATCHED', path, 'A meal entry did not match breakfast, lunch or dinner and was dropped.');
    }
    return result;
  };

  const maxDayEnd = Math.max(0, ...schedule.map((block) => Number(rec(block).dayEnd) || 0));
  const days: Day[] = [];
  if (!scheduled && schedule.length) warn('SCHEDULE_DROPPED_FOR_GUIDE', 'schedule', 'A destination guide has no day schedule; the schedule was removed.');
  if (scheduled) {
    schedule.forEach((rawBlock, index) => {
      const block = rec(rawBlock);
      const path = `days[${index}]`;
      const dayStart = Number(block.dayStart) || index + 1;
      const dayEnd = Number(block.dayEnd) || dayStart;
      let title = clean(block.title);
      if (dayEnd > dayStart) {
        title = `Hari ${dayStart}–${dayEnd}: ${title}`.trim();
        warn('DAY_RANGE_COLLAPSED', path, `Days ${dayStart}–${dayEnd} were collapsed into one day; the itinerary now has ${schedule.length} days instead of ${maxDayEnd}.`);
      }
      const date = orNull(block.date);
      if (date && startDate && date !== addDays(startDate, dayStart - 1)) warn('DAY_DATE_DROPPED', `${path}.date`, 'A day date that did not match the start date was removed.');

      const activities: Activity[] = list(block.activities).map((rawActivity, activityIndex) => {
        const activity = rec(rawActivity);
        const activityPath = `${path}.activities[${activityIndex}]`;
        const tipParts: string[] = [];
        if (orNull(activity.tip)) tipParts.push(clean(activity.tip));
        const timeLabel = clean(activity.timeLabel);
        const time = timeLabel ? parseTime(timeLabel) : null;
        if (timeLabel && !time) { warn('TIME_UNPARSED', `${activityPath}.time`, 'The time text could not be read as HH:MM; the original text was added to the tip.'); tipParts.push(`Waktu: ${timeLabel}`); }
        const durationLabel = clean(activity.durationLabel);
        const durationMinutes = durationLabel ? parseDuration(durationLabel) : null;
        if (durationLabel && durationMinutes === null) { warn('DURATION_UNPARSED', `${activityPath}.durationMinutes`, 'The duration text could not be read; the original text was added to the tip.'); tipParts.push(`Durasi: ${durationLabel}`); }
        if (orNull(activity.category)) tipParts.push(`Kategori: ${clean(activity.category)}`);
        const kind = (KINDS as readonly string[]).includes(activity.type) ? activity.type : activity.type === 'rest' || activity.type === 'accommodation' ? 'free' : 'activity';
        return {
          id: clean(activity.id) || randomUUID(), time, durationMinutes, kind, title: clean(activity.title), place: orNull(activity.area),
          description: typeof activity.description === 'string' ? activity.description : '',
          tip: tipParts.length ? tipParts.join('\n') : null
        } as Activity;
      });

      const transport = orNull(block.transportNote);
      const blockTip = orNull(block.blockTip);
      let transferNote: string | null = null;
      if (mode === 'multi_day') {
        transferNote = fit([transport, blockTip].filter(Boolean).join('\n') || null, 2100, `${path}.transferNote`);
      } else if (transport || blockTip) {
        const last = activities[activities.length - 1];
        if (last) last.tip = [last.tip, transport, blockTip].filter(Boolean).join('\n');
        else warn('TRANSPORT_NOTE_DROPPED', path, 'The day had no activity to carry its transport note; the note was removed.');
      }
      for (const [activityIndex, activity] of activities.entries()) activity.tip = fit(activity.tip, 4000, `${path}.activities[${activityIndex}].tip`);

      const accommodation = rec(block.accommodation);
      const hotelName = clean(accommodation.name);
      const hotelArea = orNull(accommodation.area);
      const hotelNote = orNull(accommodation.note);
      let hotel: Day['hotel'] = null;
      if (hotelName || hotelArea || hotelNote) {
        if (mode === 'multi_day') {
          hotel = { name: hotelName, area: hotelArea, note: hotelNote };
          if (!hotelName) warn('HOTEL_NAME_EMPTY', `${path}.hotel.name`, 'Accommodation details were kept but the hotel name is empty.');
        } else {
          warn('ACCOMMODATION_DROPPED', `${path}.hotel`, 'Only multi-day itineraries have a hotel; the accommodation was removed.');
        }
      }

      let dayMeals: Day['meals'] = null;
      if (mode === 'half_day') {
        if (strings(block.mealsIncluded).length) warn('MEALS_DROPPED_HALF_DAY', `${path}.meals`, 'Half-day itineraries have no meals section; the meals were removed.');
      } else {
        dayMeals = meals(block.mealsIncluded, `${path}.meals`);
      }

      days.push({
        id: clean(block.id) || randomUUID(), dayNumber: index + 1, title: fit(title, 200, `${path}.title`) ?? '', location: orNull(block.location),
        photo: toPhoto(block.assetId, block.photoAttribution, `${path}.photo`), activities, hotel, meals: dayMeals, transferNote
      });
    });
  }

  if (scheduled && spots.length) warn('SPOTS_DROPPED_FOR_MODE', 'spots', 'Only destination guides have places; the places were removed.');
  const places: Place[] = scheduled ? [] : spots.map((rawSpot, index) => {
    const spot = rec(rawSpot);
    const path = `places[${index}]`;
    if (orNull(spot.category)) warn('PLACE_CATEGORY_DROPPED', `${path}.category`, 'The place category is no longer a field and was removed.');
    return {
      id: clean(spot.id) || randomUUID(), group: orNull(spot.groupLabel), name: clean(spot.name), area: clean(spot.area),
      description: typeof spot.description === 'string' ? spot.description : '', tips: strings(spot.tips),
      gettingThere: orNull(spot.gettingThere), suggestedDuration: orNull(spot.suggestedDuration), bestTime: orNull(spot.bestTimeToVisit),
      nearby: orNull(spot.nearbyPairing), photo: toPhoto(spot.assetId, spot.photoAttribution, `${path}.photo`)
    } as Place;
  });

  for (const [key, current, stored] of [
    ['agencyName', clean(brochure.agencyName), clean(profile.agencyName)],
    ['agencyContact', clean(brochure.agencyContact), clean(profile.agencyContact)],
    ['agencyLogoAssetId', clean(brochure.agencyLogoAssetId), clean(profile.agencyLogoAssetId)]
  ] as const) {
    if (current && current !== stored) warn('AGENCY_VALUE_DROPPED', `brochure.${key}`, 'The agency value differed from the workspace profile; agency details now come only from the profile.');
  }
  if (brochure.travelerCount !== null && brochure.travelerCount !== undefined) warn('FIELD_DROPPED', 'brochure.travelerCount', 'Traveller count is no longer a field and was removed.');
  if (orNull(brochure.travelerType)) warn('FIELD_DROPPED', 'brochure.travelerType', 'Traveller type is no longer a field and was removed.');
  if (clean(brochure.paceLevel) && brochure.paceLevel !== 'Balanced') warn('FIELD_DROPPED', 'brochure.paceLevel', 'Trip pace is no longer a field and was removed.');
  if (list(brochure.themes).length) warn('FIELD_DROPPED', 'brochure.themes', 'Themes are no longer a field and were removed.');
  if (list(overview.highlights).length) warn('FIELD_DROPPED', 'overview.highlights', 'Highlights are no longer a field and were removed.');
  if (list(overview.routeSummary).length) warn('FIELD_DROPPED', 'overview.routeSummary', 'The route summary is now derived from the schedule and the typed list was removed.');
  if (orNull(rec(overview.quickFacts).bestSeason)) warn('FIELD_DROPPED', 'overview.quickFacts.bestSeason', 'Best season is no longer a field and was removed.');
  if (list(closing.photoCredits).length) warn('CLOSING_CREDITS_DROPPED', 'closing.photoCredits', 'Photo credits are now collected from the photos in use; the typed list was removed.');

  const colorTheme = (COLOR_THEMES as readonly string[]).includes(brochure.destinationType) ? brochure.destinationType : 'mixed';
  const value = {
    schemaVersion: 'web-2.0.0',
    trip: {
      mode, title: clean(brochure.tripTitle), destination: clean(brochure.destination), country: clean(brochure.country), region: orNull(brochure.region),
      language: orNull(brochure.outputLanguage), colorTheme, startDate, startTime: null, endTime: null
    },
    guide: { name: null, phone: null },
    meeting: { place: null, mapsUrl: null, time: null, note: null },
    pickup: { offered: false, area: null, time: null, dropoffNote: null },
    cover: toPhoto(hero.assetId, hero.photoAttribution, 'cover'),
    summary: typeof overview.summary === 'string' ? overview.summary : '',
    days,
    places,
    included: strings(practical.included),
    notIncluded: strings(practical.notIncluded),
    whatToBring: strings(practical.whatToBring),
    localTips: list(practical.localTips).map((tip, index) => {
      const { topic, note } = rec(tip);
      return fit([clean(topic), clean(note)].filter(Boolean).join(': '), 1200, `localTips[${index}]`) ?? '';
    }).filter(Boolean),
    healthSafety: strings(practical.healthSafety),
    emergencyContacts: list(practical.emergencyContacts).map((contact) => ({ label: clean(rec(contact).label), value: clean(rec(contact).value) })),
    policies: null,
    closingNote: orNull(closing.closingNote),
    disclaimer: orNull(closing.disclaimer)
  } as ItineraryV2;

  return { value, warnings };
}
