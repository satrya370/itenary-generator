import schema from '../../config/web/itinerary.schema.json' with { type: 'json' };
import registry from '../../config/web/field-registry.json' with { type: 'json' };

type JsonSchema = Record<string, any>;
type FieldRegistryEntry = (typeof registry.fields)[number];

function dereference(node: JsonSchema, root: JsonSchema): JsonSchema {
  if (Array.isArray(node.anyOf)) {
    const branch = node.anyOf.find((candidate: JsonSchema) => candidate.type !== 'null');
    if (branch) return dereference(branch, root);
  }
  if (typeof node.$ref !== 'string' || !node.$ref.startsWith('#/$defs/')) return node;
  return root.$defs[node.$ref.slice('#/$defs/'.length)];
}

export function collectSchemaLeafPaths(rootSchema: JsonSchema = schema): string[] {
  const paths: string[] = [];
  const visit = (input: JsonSchema, path: string) => {
    const node = dereference(input, rootSchema);
    if (node.properties) {
      for (const [name, child] of Object.entries(node.properties)) visit(child as JsonSchema, path ? `${path}.${name}` : name);
      return;
    }
    if (node.items) {
      visit(node.items, `${path}[]`);
      return;
    }
    paths.push(path);
  };
  visit(rootSchema, '');
  return paths.sort();
}

export function getFieldRegistryCoverage(
  schemaPaths = collectSchemaLeafPaths(),
  fields: readonly FieldRegistryEntry[] = registry.fields
) {
  const registryPaths = fields.map((field) => field.path).sort();
  return {
    missing: schemaPaths.filter((path) => !registryPaths.includes(path)),
    extra: registryPaths.filter((path) => !schemaPaths.includes(path)),
    duplicates: registryPaths.filter((path, index) => index > 0 && path === registryPaths[index - 1])
  };
}

export function assertFieldRegistryCoverage() {
  const coverage = getFieldRegistryCoverage();
  if (coverage.missing.length || coverage.extra.length || coverage.duplicates.length) {
    throw new Error(`Field registry drift: ${JSON.stringify(coverage)}`);
  }
  return coverage;
}

export function getFieldRegistry() {
  return registry.fields;
}
