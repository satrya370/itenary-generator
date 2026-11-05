import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const input = path.join(root, 'src/render/styles.css');
const output = path.join(root, '.runtime/web-render/brochure.css');
const cli = path.join(root, 'node_modules/@tailwindcss/cli/dist/index.mjs');
await fs.mkdir(path.dirname(output), { recursive: true });
const result = spawnSync(process.execPath, [cli, '-i', input, '-o', output, '--minify'], { cwd: root, encoding: 'utf8', timeout: 60000 });
if (result.status !== 0) {
  console.error('Tailwind CSS build failed.');
  if (result.stderr) console.error(result.stderr.slice(0, 2000));
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({ output: path.relative(root, output), bytes: (await fs.stat(output)).size }));
}
