import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { compileFromFile } from 'json-schema-to-typescript';
import ts from 'typescript';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const schemaPath = path.join(root, 'config/web/itinerary.schema.json');
const declarationPath = path.join(root, 'src/contracts/itinerary.generated.d.ts');
const generated = await compileFromFile(schemaPath, {
  bannerComment: '/* Generated from config/web/itinerary.schema.json. Do not edit by hand. */',
  maxItems: -1
});

function canonicalTypeScript(source) {
  const file = ts.createSourceFile('contract.d.ts', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  return ts.createPrinter({ removeComments: true, newLine: ts.NewLineKind.LineFeed }).printFile(file);
}

if (process.argv.includes('--print')) {
  process.stdout.write(generated);
} else if (process.argv.includes('--check')) {
  let existing = '';
  try { existing = await fs.readFile(declarationPath, 'utf8'); } catch {}
  if (canonicalTypeScript(existing) !== canonicalTypeScript(generated)) {
    console.error('Generated TypeScript declaration is stale. Review schema and regenerate via the approved file-edit workflow.');
    process.exitCode = 1;
  } else {
    console.log('Generated TypeScript declaration matches the canonical JSON Schema.');
  }
} else {
  console.log('Usage: node scripts/web/generate-types.mjs --print|--check');
}
