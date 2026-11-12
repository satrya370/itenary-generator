import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(process.argv[2] || 'output/releases/standalone');
const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const lock = JSON.parse(await readFile(path.join(root, 'package-lock.json'), 'utf8'));
const manifest = JSON.parse(await readFile(path.join(root, 'release-manifest.json'), 'utf8'));
const forbidden = /(?:puppeteer|playwright|chromium|vite|tailwind|typescript|\btsx\b|render-pdf|pdf-worker|tests?\/|\.runtime)/i;
assert.equal(pkg.private, true); assert.equal(pkg.type, 'module'); assert.equal(pkg.scripts?.start, 'node server/server/main.js');
assert.ok(!pkg.devDependencies, 'runtime manifest has no devDependencies');
assert.deepEqual(lock.packages[''].dependencies, pkg.dependencies, 'runtime lock root dependencies match manifest');
assert.ok(manifest.fileCount > 0 && manifest.totalBytes > 0);
assert.ok(await stat(path.join(root, 'server/server/main.js')));
assert.ok(await stat(path.join(root, 'dist/index.html')));
assert.ok(await stat(path.join(root, 'runtime/brochure.css')));
for (const locale of ['la', 'fr', 'en', 'id', 'ja', 'zh-Hans']) assert.ok(await stat(path.join(root, `config/web/locales/${locale}.json`)));
for (const name of Object.keys(pkg.dependencies)) assert.ok(!forbidden.test(name), `forbidden runtime dependency ${name}`);
for (const name of Object.keys(lock.packages)) assert.ok(!forbidden.test(name), `forbidden package in runtime lock ${name}`);


// Every bare package the shipped server code imports (static, dynamic, or resolved by name) must be a runtime dependency.
async function serverSources(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await serverSources(full));
    else if (entry.isFile() && entry.name.endsWith('.js')) result.push(full);
  }
  return result;
}
const builtins = new Set((await import('node:module')).builtinModules);
const specifier = /(?:from\s*|import\s*\(\s*|import\.meta\.resolve\(\s*)['"]([^'".\/][^'"]*)['"]/g;
for (const file of await serverSources(path.join(root, 'server'))) {
  const text = await readFile(file, 'utf8');
  for (const match of text.matchAll(specifier)) {
    const spec = match[1];
    if (spec.startsWith('node:') || builtins.has(spec.split('/')[0])) continue;
    const name = spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0];
    assert.ok(pkg.dependencies[name], `server imports ${name} (${path.relative(root, file)}) but the release does not ship it`);
  }
}

async function files(directory, prefix = '') {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name === 'node_modules') continue;
    const relative = path.posix.join(prefix, entry.name);
    if (entry.isDirectory()) result.push(...await files(path.join(directory, entry.name), relative));
    else if (entry.isFile() && relative !== 'release-manifest.json') result.push(relative);
  }
  return result;
}
const actual = [];
for (const relative of (await files(root)).sort()) {
  const bytes = await readFile(path.join(root, relative));
  actual.push({ path: relative, bytes: (await stat(path.join(root, relative))).size, sha256: createHash('sha256').update(bytes).digest('hex') });
}
assert.deepEqual(actual, manifest.files, 'release files match their SHA-256 manifest');
if (process.argv.includes('--installed')) {
  const installed = await readdir(path.join(root, 'node_modules'));
  assert.ok(installed.length > 0, 'runtime dependencies are installed');
  for (const name of installed) assert.doesNotMatch(name, forbidden, `forbidden installed module ${name}`);
}
console.log(JSON.stringify({ status: 'valid', buildId: manifest.buildId, fileCount: manifest.fileCount, bytes: manifest.totalBytes, dependencyCount: Object.keys(pkg.dependencies).length, installed: process.argv.includes('--installed') }));
