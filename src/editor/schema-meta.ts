import registry from '../../config/web/field-registry.json' with { type: 'json' };
import schema from '../../config/web/itinerary.schema.json' with { type: 'json' };
import { fieldLabels, pathLabels } from './labels.js';
import type { ItineraryMode } from '../contracts/types.js';

type Rec = Record<string, unknown>;

export interface FieldMeta {
  path: string;
  labelKey: string;
  label: string;
  control: string;
  required: boolean;
  applies: boolean;
  maxLength?: number;
  maxItems?: number;
}

export function appliesTo(field: (typeof registry.fields)[number], mode: ItineraryMode): boolean {
  const modes = field.modes;
  if (typeof modes === 'string') {
    if (modes === 'all') return true;
    if (modes === 'scheduled') return mode !== 'destination_guide';
    return false;
  }
  return (modes as string[]).includes(mode);
}

export function templatePath(path: string): string {
  return path.replace(/\[\d+\]/g, '[]');
}

function deref(node: unknown): unknown {
  let current = node;
  let guard = 0;
  while (current && typeof current === 'object' && guard++ < 8) {
    const record = current as Rec;
    if (typeof record.$ref === 'string') {
      const name = record.$ref.split('/').pop();
      const defs = (schema as unknown as { $defs: Record<string, unknown> }).$defs;
      current = defs[name as string];
      continue;
    }
    if (Array.isArray(record.anyOf)) {
      const nonNull = (record.anyOf as Rec[]).find((entry) => !(entry.type === 'null' || entry.const === null));
      if (nonNull) {
        current = nonNull;
        continue;
      }
    }
    break;
  }
  return current;
}

// maxItems is the limit of the nearest enclosing array (e.g. activities for days[].activities[].title).
function extractLimits(template: string): { maxLength?: number; maxItems?: number } {
  const result: { maxLength?: number; maxItems?: number } = {};
  let node: unknown = schema;
  node = deref(node);
  for (const segment of template.split('.')) {
    const isArraySegment = segment.endsWith('[]');
    const name = segment.replace(/\[\]$/, '');
    if (!node || typeof node !== 'object') return result;
    const record = node as Rec;
    const props = record.properties as Rec | undefined;
    if (props && props[name] !== undefined) {
      node = props[name];
    } else if (record.items && typeof record.items === 'object') {
      node = record.items;
    } else {
      return result;
    }
    const resolved = deref(node) as Rec | undefined;
    if (resolved) {
      if (typeof resolved.maxLength === 'number') result.maxLength = resolved.maxLength;
      if (typeof resolved.maxItems === 'number') result.maxItems = resolved.maxItems;
    }
    if (resolved && resolved.items && typeof resolved.items === 'object') {
      const items = deref(resolved.items) as Rec | undefined;
      if (items && typeof items.maxLength === 'number') result.maxLength = items.maxLength;
    }
    node = resolved ?? node;
    if (isArraySegment && resolved && resolved.items) {
      node = deref(resolved.items) ?? node;
    }
  }
  return result;
}

export function fieldMeta(path: string, mode: ItineraryMode): FieldMeta {
  const template = templatePath(path);
  const field = registry.fields.find((entry) => entry.path === template);
  if (!field) throw new Error(`Path not found in registry: ${template}`);
  if (!appliesTo(field, mode as ItineraryMode)) throw new Error(`Path ${template} does not apply to ${mode}`);

  const labelKey = field.labelKey;
  const pathLabel = pathLabels[template];
  const label = pathLabel ?? fieldLabels[labelKey] ?? labelKey;
  const requiredModes = (field as { requiredModes?: string[] }).requiredModes;
  const required = Boolean(field.requiredOnPublish) && (!requiredModes || requiredModes.includes(mode));
  const limits = extractLimits(template);

  return {
    path: template,
    labelKey,
    label,
    control: field.control,
    required,
    applies: true,
    ...limits
  };
}

export const MAX_PLACES = 60;
