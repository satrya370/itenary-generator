import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const mutations = [
  { file: 'src/server/import/complete.ts', before: "if (kind === 'whole' && !wholeUnit(sourceUnits, path))", after: "if (false && kind === 'whole' && !wholeUnit(sourceUnits, path))", test: 'tests/web/import-apply.test.ts', pattern: 'wrapped exception cannot be cut' },
  { file: 'src/server/import/complete.ts', before: 'const context: SourceUnit[] = [];', after: 'const context: SourceUnit[] = [...units];', test: 'tests/web/import-apply.test.ts', pattern: 'valid source quote from a different activity' },
  { file: 'src/server/import/parse/extract.ts', before: 'if (marker) {', after: 'if (false && marker) {', test: 'tests/web/import-parser.test.ts', pattern: 'never assigns skipped or repeated day markers' },
  { file: 'src/server/import/service.ts', before: 'if (structuralDayIssue || hasUnresolvedDayText || omittedUnits.length) unsafeCollections.add(\'days\');', after: 'if (false && (structuralDayIssue || hasUnresolvedDayText || omittedUnits.length)) unsafeCollections.add(\'days\');', test: 'tests/web/import-apply.test.ts', pattern: 'partial overwrite schedule is preserved' },
  { file: 'src/server/import/service.ts', before: 'savedReport._replay.fingerprint !== requestFingerprint(sourceId, source.sha256, input)', after: 'false', test: 'tests/web/import-apply.test.ts', pattern: 'same operationId replays the stored result' }
];

for (const mutation of mutations) {
  const filename = path.resolve(mutation.file);
  const original = await readFile(filename, 'utf8');
  assert.ok(original.includes(mutation.before), `mutation anchor missing in ${mutation.file}`);
  try {
    await writeFile(filename, original.replace(mutation.before, mutation.after), 'utf8');
    const run = spawnSync(process.execPath, ['--import', 'tsx', '--test', `--test-name-pattern=${mutation.pattern}`, mutation.test], { encoding: 'utf8', timeout: 120_000 });
    assert.notEqual(run.status, 0, `mutation survived: ${mutation.pattern}\n${run.stdout}\n${run.stderr}`);
    console.log(`KILLED: ${mutation.pattern}`);
  } finally {
    await writeFile(filename, original, 'utf8');
  }
}
console.log(`Mutation checks: ${mutations.length}/${mutations.length} killed`);
