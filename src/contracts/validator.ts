import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import schema from '../../config/web/itinerary.schema.json' with { type: 'json' };
import registry from '../../config/web/field-registry.json' with { type: 'json' };
import type { ContractDiagnostic, ContractResult, ItineraryMode, WebItineraryContent } from './types.js';
import { assertFieldRegistryCoverage } from './field-coverage.js';
import { getLocaleCatalog } from './locale-catalogs.js';

type SchemaValidator = ((value: unknown) => boolean) & { errors?: Array<{ instancePath: string; keyword: string; message?: string }> | null };
const Ajv2020Constructor = Ajv2020 as unknown as new (options: Record<string, unknown>) => { compile(value: unknown): SchemaValidator };
const addFormatsPlugin = addFormats as unknown as (instance: unknown) => void;
const ajv = new Ajv2020Constructor({ allErrors: true, strict: false });
addFormatsPlugin(ajv);
const validateSchema = ajv.compile(schema);

function clone<T>(value: T): T {
  return structuredClone(value);
}

function isLocaleTag(value: unknown): value is string {
  if (typeof value !== 'string' || !value.trim()) return false;
  try {
    return Intl.getCanonicalLocales(value).length === 1;
  } catch {
    return false;
  }
}

function isRecord(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function sameTextList(left: unknown, right: unknown): boolean {
  return Array.isArray(left) && Array.isArray(right) && left.length === right.length && left.every((entry, index) => entry === right[index]);
}

function warnDerived(warnings: ContractDiagnostic[], path: string) {
  warnings.push({ code: 'DERIVED_FIELD_UPDATED', path, message: `${path} is derived from its authoritative source and was updated.` });
}

export function normalizeCanonicalContent(input: unknown): ContractResult<unknown> {
  const value = clone(input);
  const errors: ContractDiagnostic[] = [];
  const warnings: ContractDiagnostic[] = [];
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    errors.push({ code: 'INVALID_DOCUMENT', path: '', message: 'Itinerary content must be a JSON object.' });
    return { ok: false, value, errors, warnings };
  }

  const document = value as { brochure?: unknown; schedule?: unknown; overview?: { quickFacts?: unknown }; closing?: unknown };
  const brochure = isRecord(document.brochure) ? document.brochure : null;
  if (brochure && brochure.outputLanguage !== null && brochure.outputLanguage !== undefined) {
    if (isLocaleTag(brochure.outputLanguage)) {
      brochure.outputLanguage = Intl.getCanonicalLocales(brochure.outputLanguage)[0];
    } else {
      errors.push({ code: 'INVALID_LOCALE_TAG', path: 'brochure.outputLanguage', message: 'Use a valid BCP 47 locale tag or leave the language unresolved.' });
    }
  }

  const scheduleBlocks = Array.isArray(document.schedule) ? document.schedule : [];
  const quickFacts = isRecord(document.overview) && isRecord(document.overview.quickFacts)
    ? document.overview.quickFacts
    : null;
  const closing = isRecord(document.closing) ? document.closing : null;
  if (brochure) {
    const mode = brochure.itineraryMode;
    if (mode === 'multi_day') {
      const dayEnds = scheduleBlocks.map((block) => (isRecord(block) ? block.dayEnd : undefined)).filter((day) => Number.isInteger(day) && (day as number) >= 1 && (day as number) <= 14) as number[];
      const derivedDays = dayEnds.length ? Math.max(...dayEnds) : null;
      if (brochure.durationDays !== null && brochure.durationDays !== derivedDays) {
        warnings.push({ code: 'DURATION_DERIVED_MISMATCH', path: 'brochure.durationDays', message: 'durationDays was recalculated from numeric schedule day ranges.' });
      }
      brochure.durationDays = derivedDays;
    } else if (mode && brochure.durationDays !== null) {
      warnings.push({ code: 'DURATION_DERIVED_CLEARED', path: 'brochure.durationDays', message: 'durationDays is derived only for multi_day mode and was cleared.' });
      brochure.durationDays = null;
    }

    const catalog = getLocaleCatalog(brochure.outputLanguage);
    const modeLabelKey: Record<string, string> = {
      half_day: 'scopeHalfDay', full_day: 'scopeFullDay', multi_day: 'scopeMultiDay', destination_guide: 'scopeDestinationGuide'
    };
    const labelTemplate = catalog && modeLabelKey[mode] ? catalog.labels[modeLabelKey[mode]] : null;
    const days = brochure.durationDays;
    if (labelTemplate && (mode !== 'multi_day' || days !== null)) {
      const scopeLabel = labelTemplate.replace('{count}', String(days ?? ''));
      brochure.scopeLabel = scopeLabel;
      if (quickFacts) quickFacts.scope = scopeLabel;
    } else if (brochure.outputLanguage && !catalog) {
      warnings.push({ code: 'LOCALE_CATALOG_UNAVAILABLE', path: 'brochure.outputLanguage', message: 'No matching label catalog is installed. Keep the locale extensible and resolve render capability before publish.' });
    }

    if (typeof brochure.agencyContact === 'string' && closing && typeof closing.agencyContact === 'string') {
      if (closing.agencyContact !== brochure.agencyContact) warnDerived(warnings, 'closing.agencyContact');
      closing.agencyContact = brochure.agencyContact;
    }
    if (quickFacts && typeof brochure.paceLevel === 'string' && typeof quickFacts.pace === 'string') {
      if (quickFacts.pace !== brochure.paceLevel) warnDerived(warnings, 'overview.quickFacts.pace');
      quickFacts.pace = brochure.paceLevel;
    }
    if (quickFacts && Array.isArray(brochure.themes) && Array.isArray(quickFacts.themes)) {
      if (!sameTextList(quickFacts.themes, brochure.themes)) warnDerived(warnings, 'overview.quickFacts.themes');
      quickFacts.themes = [...brochure.themes];
    }
  }

  const ids = collectStableIds(value as Record<string, any>);
  const seen = new Set<string>();
  for (const { path, id } of ids) {
    if (seen.has(id)) errors.push({ code: 'DUPLICATE_STABLE_ID', path, message: 'Stable IDs must be unique within the itinerary.' });
    seen.add(id);
  }

  return { ok: errors.length === 0, value, errors, warnings };
}

function collectStableIds(content: Record<string, any>) {
  const entries: Array<{ path: string; id: string }> = [];
  const schedule = Array.isArray(content.schedule) ? content.schedule : [];
  schedule.forEach((block: any, bi: number) => {
    if (!isRecord(block)) return;
    if (typeof block.id === 'string') entries.push({ path: `schedule[${bi}].id`, id: block.id });
    const activities = Array.isArray(block.activities) ? block.activities : [];
    activities.forEach((activity: any, ai: number) => {
      if (isRecord(activity) && typeof activity.id === 'string') entries.push({ path: `schedule[${bi}].activities[${ai}].id`, id: activity.id });
    });
  });
  const spots = Array.isArray(content.spots) ? content.spots : [];
  spots.forEach((spot: any, index: number) => {
    if (isRecord(spot) && typeof spot.id === 'string') entries.push({ path: `spots[${index}].id`, id: spot.id });
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

export function validateDraft(input: unknown): ContractResult<WebItineraryContent> {
  const normalized = normalizeCanonicalContent(input);
  const errors = [...normalized.errors, ...schemaErrors(normalized.value)];
  return { ...normalized, value: normalized.value as WebItineraryContent, ok: errors.length === 0, errors };
}

function valuesAtPath(root: any, path: string): any[] {
  const segments = path.split('.');
  const visit = (value: any, index: number): any[] => {
    if (index === segments.length) return [value];
    const segment = segments[index];
    if (segment.endsWith('[]')) {
      const collection = value?.[segment.slice(0, -2)];
      if (!Array.isArray(collection)) return [];
      return collection.flatMap((entry) => visit(entry, index + 1));
    }
    return visit(value?.[segment], index + 1);
  };
  return visit(root, 0);
}

function requiredFieldErrors(content: Record<string, any>): ContractDiagnostic[] {
  const errors: ContractDiagnostic[] = [];
  const mode = content.brochure.itineraryMode;
  for (const field of registry.fields.filter((entry) => entry.requiredOnPublish)) {
    if (field.modes === 'scheduled' && mode === 'destination_guide') continue;
    if (Array.isArray(field.modes) && !field.modes.includes(mode)) continue;
    const path = field.path;
    if (path.endsWith('[]')) {
      const parentPath = path.slice(0, -2);
      const parentSegments = parentPath.split('.');
      const arrayName = parentSegments.pop()!;
      const owners = parentSegments.length ? valuesAtPath(content, parentSegments.join('.')) : [content];
      owners.forEach((owner, index) => {
        const collection = owner?.[arrayName];
        if (!Array.isArray(collection) || collection.length === 0) {
          errors.push({ code: 'PUBLISH_FIELD_REQUIRED', path: parentPath.replace('[]', `[${index}]`), message: `${field.labelKey} needs at least one entry.` });
        } else {
          collection.forEach((value: unknown, itemIndex: number) => {
            if (value === null || value === undefined || (typeof value === 'string' && !value.trim())) errors.push({ code: 'PUBLISH_FIELD_REQUIRED', path: `${parentPath.replace('[]', `[${index}]`)}[${itemIndex}]`, message: `${field.labelKey} cannot be blank.` });
          });
        }
      });
      continue;
    }
    const values = valuesAtPath(content, path);
    if (!values.length || values.some((value) => value === null || value === undefined || (typeof value === 'string' && !value.trim()))) {
      errors.push({ code: 'PUBLISH_FIELD_REQUIRED', path, message: `${field.labelKey} is required before publishing.` });
    }
  }
  return errors;
}

function structureErrors(content: Record<string, any>): ContractDiagnostic[] {
  const errors: ContractDiagnostic[] = [];
  const mode = content.brochure.itineraryMode as ItineraryMode;
  const schedule = content.schedule;
  const spots = content.spots;
  if (mode === 'destination_guide') {
    if (schedule.length || !spots.length) errors.push({ code: 'MODE_SHAPE_INVALID', path: 'schedule/spots', message: 'A destination guide needs spots and must not contain a schedule.' });
  } else if (spots.length || !schedule.length) {
    errors.push({ code: 'MODE_SHAPE_INVALID', path: 'schedule/spots', message: 'Scheduled modes need schedule blocks and must not contain guide spots.' });
  }

  if ((mode === 'half_day' || mode === 'full_day') && schedule.length !== 1) {
    errors.push({ code: 'SINGLE_BLOCK_REQUIRED', path: 'schedule', message: `${mode} requires exactly one schedule block.` });
  }
  if (mode === 'half_day' || mode === 'full_day') {
    if (schedule.some((block: any) => block.dayStart !== 1 || block.dayEnd !== 1 || block.accommodation !== null)) {
      errors.push({ code: 'SINGLE_DAY_RANGE_INVALID', path: 'schedule', message: 'Half-day and full-day blocks use day 1 only and do not include overnight accommodation.' });
    }
  }
  if (mode === 'multi_day') {
    const expectedDays = content.brochure.durationDays;
    let nextDay = 1;
    for (const [index, block] of schedule.entries()) {
      if (block.dayStart !== nextDay || block.dayEnd < block.dayStart || block.dayEnd > expectedDays) {
        errors.push({ code: 'MULTI_DAY_RANGE_INVALID', path: `schedule[${index}]`, message: 'Numeric day ranges must cover the itinerary once, in order, from day 1.' });
      }
      const spans = block.dayEnd > block.dayStart;
      if (Boolean(block.isCondensed) !== spans) errors.push({ code: 'CONDENSED_RANGE_MISMATCH', path: `schedule[${index}].isCondensed`, message: 'isCondensed must match the numeric day range.' });
      if (!block.accommodation) errors.push({ code: 'ACCOMMODATION_REQUIRED', path: `schedule[${index}].accommodation`, message: 'Each multi-day block needs accommodation guidance.' });
      nextDay = block.dayEnd + 1;
    }
    if (!Number.isInteger(expectedDays) || expectedDays < 2 || expectedDays > 14 || nextDay !== expectedDays + 1) {
      errors.push({ code: 'MULTI_DAY_COVERAGE_MISMATCH', path: 'brochure.durationDays', message: 'Schedule day ranges must cover durationDays from day 1 through the final day.' });
    }
  }

  for (const [index, block] of schedule.entries()) {
    if (!block.activities.length) errors.push({ code: 'EMPTY_ACTIVITY_BLOCK', path: `schedule[${index}].activities`, message: 'Every scheduled block needs at least one activity.' });
  }
  const assetRows = [
    ['hero', content.hero],
    ...schedule.map((item: any, index: number) => [`schedule[${index}]`, item]),
    ...spots.map((item: any, index: number) => [`spots[${index}]`, item])
  ] as Array<[string, any]>;
  for (const [path, asset] of assetRows) {
    if (asset.assetId && !asset.photoAttribution) errors.push({ code: 'PHOTO_ATTRIBUTION_REQUIRED', path: `${path}.photoAttribution`, message: 'A used photo needs attribution.' });
    if (!asset.assetId && path === 'hero' && !asset.gradientOnly) errors.push({ code: 'HERO_FALLBACK_INVALID', path: 'hero.gradientOnly', message: 'A hero without an asset must use the gradient fallback.' });
  }
  return errors;
}

export function validateForPublish(input: unknown): ContractResult<WebItineraryContent> {
  const draft = validateDraft(input);
  const content = draft.value as WebItineraryContent;
  const errors = [...draft.errors];
  if (draft.errors.length === 0) {
    errors.push(...requiredFieldErrors(content as Record<string, any>));
    errors.push(...structureErrors(content as Record<string, any>));
  }
  return { ok: errors.length === 0, value: content, errors, warnings: draft.warnings };
}

assertFieldRegistryCoverage();
