import registry from '../../config/web/field-registry.json' with { type: 'json' };
import schema from '../../config/web/itinerary.schema.json' with { type: 'json' };
import { fieldLabels, pathLabels } from './labels';
import type { ItineraryMode } from '../contracts/types';

type Rec = Record<string, unknown>;
type FieldMode = ItineraryMode | 'all' | 'scheduled';

interface FieldMeta {
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
  return modes.includes(mode);
}

export function templatePath(path: string): string {
  return path
    .replace(/\[\d+\]/g, '[]')
    .replace(/\.id$/, '[]');
}

export function fieldMeta(path: string, mode: ItineraryMode): FieldMeta {
  const template = templatePath(path);
  const field = registry.fields.find(f => f.path === template);
  if (!field) throw new Error(`Path not found in registry: ${template}`);
  if (!appliesTo(field, mode)) throw new Error(`Path ${template} does not apply to ${mode}`);

  const labelKey = field.labelKey;
  const pathLabel = pathLabels[template as keyof typeof pathLabels];
  const label = pathLabel || fieldLabels[labelKey as keyof typeof fieldLabels] || labelKey;

  const required = field.requiredOnPublish && (!field.requiredModes || field.requiredModes.includes(mode));
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

function extractLimits(path: string): { maxLength?: number; maxItems?: number } {
  const result: { maxLength?: number; maxItems?: number } = {};

  let schemaNode: unknown = schema;
  const parts = path.split('.').filter(p => p && !p.includes('['));

  for (const part of parts) {
    if (typeof schemaNode !== 'object' || schemaNode === null) break;
    const s = schemaNode as Rec;

    if (s.properties && typeof s.properties === 'object' && s.properties[part]) {
      schemaNode = (s.properties as Rec)[part];
    } else if (s.items) {
      schemaNode = s.items;
      break;
    } else if (s.$ref) {
      const ref = s.$ref as string;
      const defName = ref.split('/').pop();
      schemaNode = (schema.$defs as Rec)?.[defName as string];
    } else if (s.anyOf) {
      const nonNull = (s.anyOf as Rec[]).find(a => a.type !== 'null');
      schemaNode = nonNull;
    } else {
      break;
    }
  }

  if (typeof schemaNode === 'object' && schemaNode !== null) {
    const s = schemaNode as Rec;
    if (typeof s.maxLength === 'number') result.maxLength = s.maxLength;
    if (typeof s.maxItems === 'number') result.maxItems = s.maxItems;
    if (s.items && typeof s.items === 'object') {
      const items = s.items as Rec;
      if (typeof items.maxLength === 'number') result.maxLength = items.maxLength;
    }
  }

  return result;
}
