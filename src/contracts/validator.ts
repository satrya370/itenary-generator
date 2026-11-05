import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import schema from '../../config/web/itinerary.schema.json' with { type: 'json' };
import registry from '../../config/web/field-registry.json' with { type: 'json' };
import type { ContractDiagnostic, ContractResult, Mode, WebItineraryContent } from './types.js';
import { assertFieldRegistryCoverage } from './field-coverage.js';
import { getLocaleCatalog } from './locale-catalogs.js';

type SchemaValidator = ((value: unknown) => boolean) & { errors?: Array<{ instancePath: string; keyword: string; message?: string }> | null };
const Ajv2020Constructor = Ajv2020 as unknown as new (options: Record<string, unknown>) => { compile(value: unknown): SchemaValidator };
const addFormatsPlugin = addFormats as unknown as (instance: unknown) => void;
const ajv = new Ajv2020Constructor({ allErrors: true, strict: false });
addFormatsPlugin(ajv);
const validateSchema = ajv.compile(schema);

type Rec = Record<string, any>;
type RegistryField = (typeof registry.fields)[number];

export const SPAN_CAP_MINUTES: Record<Mode, number | null> = { half_day: 360, full_day: 720, multi_day: 960, destination_guide: null };

function clone<T>(value: T): T {
  return structuredClone(value);
}

function isRecord(value: unknown): value is Rec {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isLocaleTag(value: unknown): value is string {
  if (typeof value !== 'string' || !value.trim()) return false;
  try {
    return Intl.getCanonicalLocales(value).length === 1;
  } catch {
    return false;
  }
}

function isBlank(value: unknown): boolean {
  return value === null || value === undefined || (typeof value === 'string' && !value.trim());
}

function isFilled(value: unknown): boolean {
  if (value === true) return true;
  if (typeof value === 'number') return true;
  if (typeof value === 'string') return value.trim().length > 0;
  return false;
}

function minutes(time: string): number {
  const [hours, mins] = time.split(':').map(Number);
  return hours * 60 + mins;
}

function modeApplies(field: RegistryField, mode: Mode): boolean {
  if (field.modes === 'all') return true;
  if (field.modes === 'scheduled') return mode !== 'destination_guide';
  return Array.isArray(field.modes) && (field.modes as string[]).includes(mode);
}

interface Located { path: string; value: unknown }

function collectValues(root: unknown, registryPath: string): Located[] {
  const segments = registryPath.split('.');
  const out: Located[] = [];
  const visit = (value: any, index: number, trail: string) => {
    if (index === segments.length) { out.push({ path: trail, value }); return; }
    const segment = segments[index];
    const join = (name: string) => (trail ? `${trail}.${name}` : name);
    if (segment.endsWith('[]')) {
      const name = segment.slice(0, -2);
      const collection = value?.[name];
      if (!Array.isArray(collection)) return;
      collection.forEach((entry, i) => visit(entry, index + 1, `${join(name)}[${i}]`));
      return;
    }
    visit(value?.[segment], index + 1, join(segment));
  };
  visit(root, 0, '');
  return out;
}

export function normalizeCanonicalContent(input: unknown): ContractResult<unknown> {
  const value = clone(input);
  const errors: ContractDiagnostic[] = [];
  const warnings: ContractDiagnostic[] = [];
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    errors.push({ code: 'INVALID_DOCUMENT', path: '', message: 'Itinerary content must be a JSON object.' });
    return { ok: false, value, errors, warnings };
  }

  const document = value as Rec;
  const trip = isRecord(document.trip) ? document.trip : null;
  if (trip && trip.language !== null && trip.language !== undefined) {
    if (isLocaleTag(trip.language)) {
      trip.language = Intl.getCanonicalLocales(trip.language)[0];
      if (!getLocaleCatalog(trip.language)) {
        warnings.push({ code: 'LOCALE_CATALOG_UNAVAILABLE', path: 'trip.language', message: 'No matching label catalog is installed. Keep the locale extensible and resolve render capability before publish.' });
      }
    } else {
      errors.push({ code: 'INVALID_LOCALE_TAG', path: 'trip.language', message: 'Use a valid BCP 47 locale tag or leave the language unresolved.' });
    }
  }

  if (Array.isArray(document.days)) {
    document.days.forEach((day: unknown, index: number) => {
      if (!isRecord(day)) return;
      if (Number.isInteger(day.dayNumber) && day.dayNumber !== index + 1) {
        warnings.push({ code: 'DERIVED_FIELD_UPDATED', path: `days[${index}].dayNumber`, message: 'dayNumber is derived from the day order and was updated.' });
      }
      day.dayNumber = index + 1;
    });
  }

  const seen = new Set<string>();
  for (const { path, id } of collectStableIds(document)) {
    if (seen.has(id)) errors.push({ code: 'DUPLICATE_STABLE_ID', path, message: 'Stable IDs must be unique within the itinerary.' });
    seen.add(id);
  }

  return { ok: errors.length === 0, value, errors, warnings };
}

function collectStableIds(content: Rec) {
  const entries: Array<{ path: string; id: string }> = [];
  const days = Array.isArray(content.days) ? content.days : [];
  days.forEach((day: unknown, di: number) => {
    if (!isRecord(day)) return;
    if (typeof day.id === 'string') entries.push({ path: `days[${di}].id`, id: day.id });
    const activities = Array.isArray(day.activities) ? day.activities : [];
    activities.forEach((activity: unknown, ai: number) => {
      if (isRecord(activity) && typeof activity.id === 'string') entries.push({ path: `days[${di}].activities[${ai}].id`, id: activity.id });
    });
  });
  const places = Array.isArray(content.places) ? content.places : [];
  places.forEach((place: unknown, index: number) => {
    if (isRecord(place) && typeof place.id === 'string') entries.push({ path: `places[${index}].id`, id: place.id });
  });
  return entries;
}

function schemaErrors(value: unknown): ContractDiagnostic[] {
  if (validateSchema(value)) return [];
  return (validateSchema.errors || []).map((error) => ({
    code: 'SCHEMA_VALIDATION_FAILED',
    path: error.instancePath.replace(/^\//, '').replaceAll('/', '.'),
    message: `${error.keyword}: ${error.message || 'invalid value'}`
  }));
}

function applicabilityErrors(content: Rec): ContractDiagnostic[] {
  const errors: ContractDiagnostic[] = [];
  const mode = content.trip.mode as Mode;
  const notApplicable = (path: string) => errors.push({ code: 'FIELD_NOT_APPLICABLE', path, message: `${path} does not apply to ${mode} itineraries and must stay empty.` });

  if (mode === 'destination_guide' && content.days.length) notApplicable('days');
  if (mode !== 'destination_guide' && content.places.length) notApplicable('places');

  for (const field of registry.fields) {
    if (modeApplies(field, mode)) continue;
    if (field.path.startsWith('days[]') && mode === 'destination_guide') continue;
    if (field.path.startsWith('places[]') && mode !== 'destination_guide') continue;
    for (const located of collectValues(content, field.path)) {
      if (isFilled(located.value)) notApplicable(located.path);
    }
  }

  content.days.forEach((day: Rec, index: number) => {
    if (mode !== 'multi_day' && day.hotel !== null) notApplicable(`days[${index}].hotel`);
    if (mode === 'half_day' && day.meals !== null) notApplicable(`days[${index}].meals`);
  });

  if (!content.pickup.offered) {
    for (const key of ['area', 'time', 'dropoffNote']) {
      if (isFilled(content.pickup[key])) errors.push({ code: 'FIELD_NOT_APPLICABLE', path: `pickup.${key}`, message: `pickup.${key} must stay empty when no pickup is offered.` });
    }
  }
  return errors;
}

export function validateDraft(input: unknown): ContractResult<WebItineraryContent> {
  const normalized = normalizeCanonicalContent(input);
  const errors = [...normalized.errors, ...schemaErrors(normalized.value)];
  if (errors.length === 0) errors.push(...applicabilityErrors(normalized.value as Rec));
  return { ...normalized, value: normalized.value as WebItineraryContent, ok: errors.length === 0, errors };
}

function requiredFieldErrors(content: Rec): ContractDiagnostic[] {
  const errors: ContractDiagnostic[] = [];
  const mode = content.trip.mode as Mode;
  for (const field of registry.fields) {
    if (!field.requiredOnPublish || !modeApplies(field, mode)) continue;
    const requiredModes = (field as { requiredModes?: string[] }).requiredModes;
    if (requiredModes && !requiredModes.includes(mode)) continue;
    for (const located of collectValues(content, field.path)) {
      if (isBlank(located.value)) errors.push({ code: 'PUBLISH_FIELD_REQUIRED', path: located.path, message: `${field.labelKey} is required before publishing.` });
    }
  }
  return errors;
}

function daySpanErrors(day: Rec, index: number, cap: number): ContractDiagnostic[] {
  const errors: ContractDiagnostic[] = [];
  const activities: Rec[] = day.activities;
  const knownDuration = activities.reduce((sum, activity) => sum + (activity.durationMinutes ?? 0), 0);
  if (knownDuration > cap) {
    errors.push({ code: 'DURATION_CAP_EXCEEDED', path: `days[${index}]`, message: `Known activity durations add up to ${knownDuration} minutes, above the ${cap}-minute limit for this itinerary type.` });
    return errors;
  }
  const timed = activities.filter((activity) => activity.time);
  if (timed.length) {
    const start = Math.min(...timed.map((activity) => minutes(activity.time)));
    const end = Math.max(...timed.map((activity) => minutes(activity.time) + (activity.durationMinutes ?? 0)));
    if (end - start > cap) errors.push({ code: 'DURATION_CAP_EXCEEDED', path: `days[${index}]`, message: `Timed activities span ${end - start} minutes, above the ${cap}-minute limit for this itinerary type.` });
  }
  return errors;
}

function structureDiagnostics(content: Rec): { errors: ContractDiagnostic[]; warnings: ContractDiagnostic[] } {
  const errors: ContractDiagnostic[] = [];
  const warnings: ContractDiagnostic[] = [];
  const mode = content.trip.mode as Mode;
  const days: Rec[] = content.days;
  const places: Rec[] = content.places;
  const cap = SPAN_CAP_MINUTES[mode];

  if ((mode === 'half_day' || mode === 'full_day') && days.length !== 1) {
    errors.push({ code: 'SINGLE_DAY_REQUIRED', path: 'days', message: `${mode} requires exactly one day.` });
  }
  if (mode === 'multi_day' && (days.length < 2 || days.length > 14)) {
    errors.push({ code: 'MULTI_DAY_COUNT_INVALID', path: 'days', message: 'A multi-day itinerary needs between 2 and 14 days.' });
  }
  if (mode === 'destination_guide' && places.length === 0) {
    errors.push({ code: 'PLACES_REQUIRED', path: 'places', message: 'A destination guide needs at least one place.' });
  }

  days.forEach((day, index) => {
    if (!day.activities.length) errors.push({ code: 'EMPTY_DAY', path: `days[${index}].activities`, message: 'Every day needs at least one activity.' });
    let previous: number | null = null;
    day.activities.forEach((activity: Rec, activityIndex: number) => {
      if (!activity.time) return;
      const current = minutes(activity.time);
      if (previous !== null && current < previous) {
        errors.push({ code: 'ACTIVITY_ORDER', path: `days[${index}].activities[${activityIndex}].time`, message: 'Activity times must not go backwards within a day.' });
      }
      previous = current;
    });
    if (cap !== null) errors.push(...daySpanErrors(day, index, cap));
    if (day.activities.some((activity: Rec) => !activity.time)) {
      warnings.push({ code: 'SCHEDULE_TIME_UNKNOWN', path: `days[${index}]`, message: 'Some activity times are missing, so this schedule is not fully verified.' });
    }
  });

  const { startTime, endTime } = content.trip;
  if (startTime && endTime) {
    if (minutes(endTime) <= minutes(startTime)) {
      errors.push({ code: 'TIME_RANGE_INVALID', path: 'trip.endTime', message: 'The end time must be after the start time.' });
    } else if (cap !== null && minutes(endTime) - minutes(startTime) > cap) {
      errors.push({ code: 'DURATION_CAP_EXCEEDED', path: 'trip.endTime', message: `The tour spans ${minutes(endTime) - minutes(startTime)} minutes, above the ${cap}-minute limit for this itinerary type.` });
    }
  }

  const photoRows: Array<[string, Rec | null]> = [
    ['cover', content.cover],
    ...days.map((day, index): [string, Rec | null] => [`days[${index}].photo`, day.photo]),
    ...places.map((place, index): [string, Rec | null] => [`places[${index}].photo`, place.photo])
  ];
  for (const [path, photo] of photoRows) {
    if (photo && (!photo.credit || isBlank(photo.credit.photographer))) {
      errors.push({ code: 'PHOTO_ATTRIBUTION_REQUIRED', path: `${path}.credit`, message: 'A used photo needs attribution.' });
    }
  }

  if (mode !== 'destination_guide' && isBlank(content.meeting.place) && !content.pickup.offered) {
    warnings.push({ code: 'MEETING_POINT_MISSING', path: 'meeting.place', message: 'No meeting point or pickup is set; travellers will not know where to start.' });
  }
  return { errors, warnings };
}

export function validateForPublish(input: unknown): ContractResult<WebItineraryContent> {
  const draft = validateDraft(input);
  const content = draft.value as WebItineraryContent;
  const errors = [...draft.errors];
  const warnings = [...draft.warnings];
  if (draft.errors.length === 0) {
    errors.push(...requiredFieldErrors(content as Rec));
    const structure = structureDiagnostics(content as Rec);
    errors.push(...structure.errors);
    warnings.push(...structure.warnings);
  }
  return { ok: errors.length === 0, value: content, errors, warnings };
}

assertFieldRegistryCoverage();
