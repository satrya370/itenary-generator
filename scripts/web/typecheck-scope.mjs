// Runs tsc for a tsconfig but fails only on diagnostics inside the given path prefixes.
// Prefixes starting with '!' are excluded. Used by revision stages R2-R5, where files outside the stage still target the previous schema.
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const [tsconfig, ...patterns] = process.argv.slice(2);
const prefixes = patterns.filter((pattern) => !pattern.startsWith('!'));
const excluded = patterns.filter((pattern) => pattern.startsWith('!')).map((pattern) => pattern.slice(1));
if (!tsconfig || !prefixes.length) {
  console.error('Usage: node scripts/web/typecheck-scope.mjs <tsconfig> <path-prefix|!excluded-prefix>...');
  process.exit(2);
}
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const tsc = path.join(root, 'node_modules/typescript/bin/tsc');
const run = spawnSync(process.execPath, [tsc, '--noEmit', '-p', tsconfig, '--pretty', 'false'], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const lines = `${run.stdout || ''}${run.stderr || ''}`.split(/\r?\n/).filter((line) => /\(\d+,\d+\): error TS\d+/.test(line));
const normalize = (line) => line.replaceAll('\\', '/');
const inScope = lines.filter((line) => prefixes.some((prefix) => normalize(line).startsWith(prefix)) && !excluded.some((prefix) => normalize(line).startsWith(prefix)));
const outside = lines.length - inScope.length;
for (const line of inScope) console.error(line);
console.log(`typecheck-scope ${tsconfig}: ${inScope.length} error(s) in [${patterns.join(', ')}]; ${outside} outside the scope ignored.`);
process.exit(inScope.length ? 1 : 0);
